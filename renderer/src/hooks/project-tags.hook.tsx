import type {
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from '@shared/contracts';
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { projectTagsBridge, subscribeAppEvent } from '../renderer.bridge';

type ProjectTagsContextValue = {
    snapshot: ProjectTagsSnapshot | null;
    loadFailed: boolean;
    deleteTag: (id: string) => Promise<ProjectTagsSnapshot>;
    saveTag: (
        id: string | null,
        name: string,
        colour: number,
    ) => Promise<ProjectTagsSnapshot>;
    reload: () => Promise<void>;
    save: (
        projectPath: string,
        selection: ProjectTagSelection[],
    ) => Promise<ProjectTagsSnapshot>;
};
const ProjectTagsContext = createContext<ProjectTagsContextValue | null>(null);

/** Shares the persisted tag catalogue across application screens.
 * @param props - Application content using tags.
 */
export function ProjectTagsProvider({ children }: PropsWithChildren) {
    const [snapshot, setSnapshot] = useState<ProjectTagsSnapshot | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const revision = useRef(0);
    const mounted = useRef(false);
    const reload = useCallback(async () => {
        const request = ++revision.current;
        setLoadFailed(false);
        try {
            const next = await projectTagsBridge.getSnapshot();
            if (mounted.current && request === revision.current)
                setSnapshot(next);
        } catch {
            if (mounted.current && request === revision.current)
                setLoadFailed(true);
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        const unsubscribe = subscribeAppEvent(
            'project-tags-updated',
            (next) => {
                revision.current += 1;
                setSnapshot(next);
                setLoadFailed(false);
            },
        );
        void reload();
        return () => {
            mounted.current = false;
            revision.current += 1;
            unsubscribe();
        };
    }, [reload]);
    const save = useCallback(
        async (projectPath: string, selection: ProjectTagSelection[]) => {
            const request = ++revision.current;
            const next = await projectTagsBridge.setProjectTags(
                projectPath,
                selection,
            );
            if (mounted.current && request === revision.current)
                setSnapshot(next);
            return next;
        },
        [],
    );
    const saveTag = useCallback(
        async (id: string | null, name: string, colour: number) => {
            const request = ++revision.current;
            const next = await projectTagsBridge.saveTag(id, name, colour);
            if (mounted.current && request === revision.current)
                setSnapshot(next);
            return next;
        },
        [],
    );
    const deleteTag = useCallback(async (id: string) => {
        const request = ++revision.current;
        const next = await projectTagsBridge.deleteTag(id);
        if (mounted.current && request === revision.current) setSnapshot(next);
        return next;
    }, []);
    return (
        <ProjectTagsContext.Provider
            value={{ snapshot, loadFailed, reload, save, saveTag, deleteTag }}
        >
            {children}
        </ProjectTagsContext.Provider>
    );
}

/** Gets shared tags without creating screen-local copies of the catalogue. */
export function useProjectTags() {
    const context = useContext(ProjectTagsContext);
    if (!context)
        throw new Error('useProjectTags requires ProjectTagsProvider');
    return context;
}
