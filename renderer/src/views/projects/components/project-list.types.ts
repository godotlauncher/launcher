import type {
    CodeEditorIntegrationSettings,
    ProjectDetails,
    ProjectSectionKey,
    ProjectTagSelection,
    ProjectTagsSnapshot,
    ReleaseSummary,
} from '@shared/contracts';
import type React from 'react';
import type { ProjectViewMode } from '../project-view.types';
import type { ProjectSections } from '../projects-view.model';

export type { ProjectSectionKey } from '@shared/contracts';

export type ProjectsListProps = {
    viewMode?: ProjectViewMode;
    groupOrder?: readonly ProjectSectionKey[];
    tagSnapshot?: ProjectTagsSnapshot | null;
    tagsLoadFailed?: boolean;
    onRetryTags?: () => Promise<void>;
    onSetProjectTags?: (
        path: string,
        selection: ProjectTagSelection[],
    ) => Promise<unknown>;
    sections: ProjectSections;
    projectGitHubUrls: ReadonlyMap<string, string>;
    loading: boolean;
    searchQuery?: string;
    onClearSearch?: () => void;
    clearSearchLabel?: string;
    locale: string;
    busyProjects: string[];
    codeEditorSettings: CodeEditorIntegrationSettings[];
    highlightedPinnedProjectPath: string | null;
    pinnedReorderingDisabled: boolean;
    onPinnedHighlightComplete: () => void;
    onReorderPinnedProjects: (orderedProjectPaths: string[]) => Promise<void>;
    isInstalledRelease: (version: string, mono: boolean) => boolean;
    isProjectEditorDownloading: (project: ProjectDetails) => boolean;
    getDownloadableProjectEditor: (
        project: ProjectDetails,
    ) => ReleaseSummary | undefined;
    onInstallRequiredProjectEditor: (
        project: ProjectDetails,
        release: ReleaseSummary,
    ) => void;
    onLaunchProject: (project: ProjectDetails) => void;
    onOpenCodeEditor: (project: ProjectDetails) => void;
    onOpenTerminal: (project: ProjectDetails) => void;
    onProjectFoldersOptions: (
        event: React.MouseEvent,
        project: ProjectDetails,
    ) => void;
    onTogglePinned: (project: ProjectDetails) => void;
    onProjectSettings: (project: ProjectDetails) => void;
    onProjectMoreOptions: (
        event: React.MouseEvent,
        project: ProjectDetails,
    ) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
};

export type ProjectListItemProps = Omit<
    ProjectsListProps,
    | 'sections'
    | 'groupOrder'
    | 'loading'
    | 'highlightedPinnedProjectPath'
    | 'pinnedReorderingDisabled'
    | 'onPinnedHighlightComplete'
    | 'onReorderPinnedProjects'
> & {
    project: ProjectDetails;
    githubIconSrc: string;
    sectionKey: ProjectSectionKey;
    highlighted: boolean;
    pinnedItemRef?: (element: HTMLLIElement | null) => void;
    reorderHandle?: React.ReactNode;
    reorderStateClassName?: string;
};

export type ProjectPresentationProps = Pick<
    ProjectListItemProps,
    'project' | 'sectionKey' | 'onLaunchProject' | 't'
> & {
    actions: React.ReactNode;
    badges: React.ReactNode;
    tagIndicators: React.ReactNode;
    launchDisabled: boolean;
    lastOpened: string;
};
