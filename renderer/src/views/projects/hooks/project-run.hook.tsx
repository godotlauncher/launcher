import type { ProjectDetails, ProjectRunReadiness } from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../../hooks/alerts.hook';
import { showProjectRunRecovery } from '../../../hooks/project-run-recovery.util';
import { projectsBridge } from '../../../renderer.bridge';

type UseProjectRunOptions = {
    project: ProjectDetails | null;
    onEditProject: (project: ProjectDetails) => void | Promise<void>;
};

/** Checks the open menu's project and presents recovery for runtime failures.
 * @param options - Current menu selection and existing editor action.
 */
export function useProjectRun({
    project,
    onEditProject,
}: UseProjectRunOptions) {
    const { t } = useTranslation('projects');
    const { addCustomConfirm } = useAlerts();
    const [checked, setChecked] = useState<{
        path: string;
        readiness: ProjectRunReadiness;
    } | null>(null);
    const pending = useRef(new Set<string>());
    const [starting, setStarting] = useState<ReadonlySet<string>>(new Set());
    const projectPath = project?.path;

    useEffect(() => {
        setChecked(null);
        if (!projectPath) return;
        let cancelled = false;
        let request = 0;
        /** Refreshes the selected project's current on-disk run configuration. */
        const check = async () => {
            const currentRequest = ++request;
            try {
                const readiness =
                    await projectsBridge.inspectProjectRun(projectPath);
                if (!cancelled && currentRequest === request) {
                    setChecked({ path: projectPath, readiness });
                }
            } catch {
                if (!cancelled && currentRequest === request) {
                    setChecked({
                        path: projectPath,
                        readiness: { status: 'check_failed' },
                    });
                }
            }
        };
        void check();
        window.addEventListener('focus', check);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', check);
        };
    }, [projectPath]);

    /** Runs the registered project and offers its editor when recovery is needed.
     * @param selected - Project captured by the menu action.
     */
    const runProject = async (selected: ProjectDetails): Promise<void> => {
        if (pending.current.has(selected.path)) return;
        pending.current.add(selected.path);
        setStarting(new Set(pending.current));
        try {
            const result = await projectsBridge
                .runProject(selected.path)
                .catch(() => ({
                    launched: false as const,
                    reason: 'launch_failed' as const,
                }));
            if (result.launched) return;
            showProjectRunRecovery({
                project: selected,
                reason: result.reason,
                t,
                addCustomConfirm,
                onEditProject,
            });
        } finally {
            pending.current.delete(selected.path);
            setStarting(new Set(pending.current));
        }
    };

    return {
        readiness:
            checked && checked.path === projectPath ? checked.readiness : null,
        starting,
        runProject,
    };
}
