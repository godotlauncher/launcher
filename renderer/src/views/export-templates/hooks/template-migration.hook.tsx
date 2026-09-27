import type { TemplateMigrationAssessment } from '@shared/contracts';
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { usePreferences } from '../../../hooks/preferences.hook';
import { useProjects } from '../../../hooks/projects.hook';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { TemplateMigrationModal } from '../components/template-migration.modal';
import { useTemplateJobs } from './template-jobs.hook';

type MigrationContext = {
    assessment: TemplateMigrationAssessment | null;
    refresh: () => Promise<void>;
    open: () => void;
};
const context = createContext<MigrationContext | null>(null);

/** Shares the migration entry point across application routes. */
export function useTemplateMigration(): MigrationContext {
    const value = useContext(context);
    if (!value) throw new Error('TemplateMigrationProvider is required');
    return value;
}

/** Keeps the modal and queued progress available while navigating between views.
 * @param props - Application routes shown beneath the modal.
 */
export function TemplateMigrationProvider({ children }: PropsWithChildren) {
    const { preferences, loadPreferences, savePreferences } = usePreferences();
    const { projects } = useProjects();
    const jobs = useTemplateJobs();
    const [assessment, setAssessment] =
        useState<TemplateMigrationAssessment | null>(null);
    const [error, setError] = useState('');
    const [visible, setVisible] = useState(false);
    const [introduction, setIntroduction] = useState(false);
    const offered = useRef(false);
    const request = useRef(0);
    const focusTarget = useRef<HTMLElement | null>(null);
    const fallbackFocusTarget = useRef<HTMLElement | null>(null);
    const lifecycle = jobs.map((job) => `${job.id}:${job.stage}`).join('|');
    const projectLifecycle = projects
        .map(
            (project) =>
                `${project.path}:${project.launch_path}:${project.exportTemplateMode}`,
        )
        .join('|');

    /** Refreshes cheap metadata, leaving detailed hashing to a selected project. */
    const refresh = useCallback(async () => {
        const current = ++request.current;
        try {
            const result = await exportTemplatesBridge.getMigrationAssessment();
            if (current === request.current) {
                setAssessment(result);
                setError('');
            }
        } catch {
            if (current === request.current)
                setError('exportTemplates:errors.read');
        }
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Recheck only when registered project environments change.
    useEffect(() => {
        void exportTemplatesBridge
            .connectEmptyProjects()
            .then(refresh)
            .catch(() => {
                setError('exportTemplates:errors.connection');
            });
    }, [projectLifecycle, refresh]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Project changes are refreshed after empty projects connect.
    useEffect(() => {
        void refresh();
    }, [lifecycle, refresh]);
    useEffect(() => {
        const focused = () => {
            void refresh();
        };
        window.addEventListener('focus', focused);
        return () => {
            window.removeEventListener('focus', focused);
            request.current++;
        };
    }, [refresh]);

    /** Records acknowledgement without treating postponed projects as migrated. */
    const acknowledge = useCallback(async () => {
        const current = await loadPreferences();
        if (current.export_template_migration_offered !== true)
            await savePreferences({
                ...current,
                export_template_migration_offered: true,
            });
    }, [loadPreferences, savePreferences]);

    useEffect(() => {
        if (introduction && assessment?.pendingCount === 0 && !error) {
            setVisible(false);
            setIntroduction(false);
            offered.current = false;
        }
    }, [assessment, introduction, error]);

    useEffect(() => {
        if (
            !assessment ||
            preferences?.export_template_migration_offered === true ||
            offered.current
        )
            return;
        if (!assessment.pendingCount) return;
        // Wait for existing dialogs/drawers; an upgrade offer must not interrupt them.
        const timer = window.setInterval(() => {
            const overlays = document.querySelectorAll(
                'dialog[open], [role="dialog"], :popover-open',
            );
            if ([...overlays].some((element) => element.checkVisibility()))
                return;
            offered.current = true;
            focusTarget.current = document.activeElement as HTMLElement;
            fallbackFocusTarget.current = document.querySelector<HTMLElement>(
                '[data-testid="btnExportTemplates"]',
            );
            setIntroduction(true);
            setVisible(true);
            window.clearInterval(timer);
        }, 500);
        return () => window.clearInterval(timer);
    }, [assessment, preferences?.export_template_migration_offered]);

    /** Opens the existing workflow directly from the templates header. */
    const open = useCallback(() => {
        offered.current = true;
        focusTarget.current = document.activeElement as HTMLElement;
        fallbackFocusTarget.current = document.querySelector<HTMLElement>(
            '[data-testid="btnExportTemplates"]',
        );
        setIntroduction(false);
        setVisible(true);
        void refresh();
    }, [refresh]);

    // Completion can remove the header trigger just after the dialog returns focus.
    // biome-ignore lint/correctness/useExhaustiveDependencies: Assessment changes can remove the saved focus target from the DOM.
    useEffect(() => {
        if (
            !visible &&
            focusTarget.current &&
            !focusTarget.current.isConnected &&
            document.activeElement === document.body
        ) {
            fallbackFocusTarget.current?.focus({ preventScroll: true });
        }
    }, [visible, assessment]);

    /** Leaves queued work running when the modal is dismissed. */
    const close = async () => {
        try {
            await acknowledge();
        } catch {
            setError('exportTemplates:errors.failed');
            return;
        }
        setVisible(false);
    };

    return (
        <context.Provider value={{ assessment, refresh, open }}>
            {children}
            {visible && (
                <TemplateMigrationModal
                    assessment={assessment}
                    jobs={jobs}
                    introduction={introduction}
                    error={error}
                    returnFocusRef={focusTarget}
                    fallbackReturnFocusRef={fallbackFocusTarget}
                    onRefresh={refresh}
                    onClose={() => {
                        void close();
                    }}
                    onStart={async () => {
                        try {
                            await acknowledge();
                            setIntroduction(false);
                        } catch {
                            setError('exportTemplates:errors.failed');
                        }
                    }}
                />
            )}
        </context.Provider>
    );
}
