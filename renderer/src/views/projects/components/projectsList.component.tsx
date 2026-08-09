import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
import { Accessibility } from '@dnd-kit/dom';
import {
    DragDropProvider,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import type {
    CodeEditorIntegrationSettings,
    ProjectDetails,
} from '@shared/contracts';
import {
    EllipsisVertical,
    FlaskConical,
    FolderOpen,
    GripVertical,
    ImageOff,
    PanelTop,
    Pin,
    Play,
    Settings,
    Tag,
    TriangleAlert,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import gitIconColor from '../../../assets/icons/git_icon_color.svg';
import { CodeEditorIntegrationIcon } from '../../../components/codeEditorIntegrationIcon.component';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { formatRelativeTime } from '../../../i18n/relativeTime';
import {
    getInvalidProjectTableKey,
    type ProjectSections,
} from '../projectsView.model';

type ProjectSectionKey = 'new' | 'pinned' | 'recents';

type ProjectsListProps = {
    sections: ProjectSections;
    loading: boolean;
    locale: string;
    busyProjects: string[];
    codeEditorSettings: CodeEditorIntegrationSettings[];
    highlightedPinnedProjectPath: string | null;
    pinnedReorderingDisabled: boolean;
    onPinnedHighlightComplete: () => void;
    onReorderPinnedProjects: (orderedProjectPaths: string[]) => Promise<void>;
    isInstalledRelease: (version: string, mono: boolean) => boolean;
    isProjectEditorDownloading: (project: ProjectDetails) => boolean;
    onLaunchProject: (project: ProjectDetails) => void;
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

type ProjectListItemProps = Omit<
    ProjectsListProps,
    | 'sections'
    | 'loading'
    | 'highlightedPinnedProjectPath'
    | 'pinnedReorderingDisabled'
    | 'onPinnedHighlightComplete'
    | 'onReorderPinnedProjects'
> & {
    project: ProjectDetails;
    sectionKey: ProjectSectionKey;
    highlighted: boolean;
    pinnedItemRef?: (element: HTMLLIElement | null) => void;
    reorderHandle?: React.ReactNode;
    reorderStateClassName?: string;
};

const ProjectListItem: React.FC<ProjectListItemProps> = ({
    project,
    sectionKey,
    highlighted,
    pinnedItemRef,
    reorderHandle,
    reorderStateClassName = '',
    locale,
    busyProjects,
    codeEditorSettings,
    isInstalledRelease,
    isProjectEditorDownloading,
    onLaunchProject,
    onProjectFoldersOptions,
    onTogglePinned,
    onProjectSettings,
    onProjectMoreOptions,
    t,
}) => {
    const editorDownloading = isProjectEditorDownloading(project);
    const releaseInstalled = isInstalledRelease(
        project.release.version,
        project.release.mono,
    );
    const selectedCodeEditor = project.codeEditorId
        ? codeEditorSettings.find(
              (settings) => settings.integration.id === project.codeEditorId,
          )
        : undefined;
    const codeEditorUnavailable = Boolean(
        selectedCodeEditor && !selectedCodeEditor.installation,
    );
    const codeEditorName =
        selectedCodeEditor?.integration.displayName ?? project.codeEditorId;
    const codeEditorTooltip = project.codeEditorId
        ? t(
              codeEditorUnavailable
                  ? 'table.codeEditorUnavailable'
                  : 'table.codeEditorProject',
              { editor: codeEditorName },
          )
        : '';
    const hasWarning =
        !project.valid || !releaseInstalled || codeEditorUnavailable;
    const launchDisabled =
        !project.valid || !releaseInstalled || editorDownloading;
    const versionLabel = `${project.version}${project.release.mono ? ' (.NET)' : ''}`;

    return (
        <li
            ref={pinnedItemRef}
            tabIndex={sectionKey === 'pinned' ? -1 : undefined}
            className={`relative overflow-hidden rounded-xl border border-base-300 bg-base-200/35 p-4 pl-5 shadow-sm transition-colors motion-reduce:transition-none hover:border-base-content/20 hover:bg-base-200/55 focus-visible:outline-2 focus-visible:outline-primary ${highlighted ? 'project-pin-highlight' : ''} ${reorderStateClassName}`}
            data-project-path={project.path}
            data-project-section={sectionKey}
        >
            <div
                className={`absolute inset-y-3 left-3 w-1 rounded-full ${hasWarning ? 'bg-warning' : 'bg-base-content/15'}`}
                aria-hidden="true"
            />
            {busyProjects.includes(project.path) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/55">
                    <div className="loading loading-bars" />
                </div>
            )}

            <div className="flex min-w-0 flex-col gap-4 pl-2">
                <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-base-content/8">
                        {project.icon_path ? (
                            <img
                                src={project.icon_path}
                                className="h-full w-full object-contain"
                                alt=""
                            />
                        ) : (
                            <ImageOff className="h-6 w-6 stroke-base-content/30" />
                        )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                            {!project.valid && (
                                <Tooltip
                                    placement="top"
                                    tip={t(getInvalidProjectTableKey(project))}
                                    tone="warning"
                                >
                                    <TriangleAlert className="size-5 shrink-0 stroke-warning" />
                                </Tooltip>
                            )}
                            <h3 className="truncate text-xl font-semibold leading-tight text-base-content">
                                {project.name}
                            </h3>
                        </div>
                        <CopyBadge
                            value={project.path}
                            label={t('common:buttons.copyPath')}
                            copiedLabel={t('common:success')}
                            className="max-w-full self-start rounded-md bg-transparent px-0 text-base-content/55"
                            data-testid={`btnCopyProjectPath_${sectionKey}_${project.path}`}
                        />
                    </div>

                    <div className="flex shrink-0 items-center gap-2 self-start">
                        {reorderHandle}
                        <Tooltip
                            placement="top"
                            tip={t(
                                project.pinned
                                    ? 'project.unpinProject'
                                    : 'project.pinProject',
                                { ns: 'menus' },
                            )}
                        >
                            <button
                                type="button"
                                data-testid="btnToggleProjectPinned"
                                className={`btn btn-ghost btn-square h-7 min-h-7 w-7 border bg-base-100/20 ${project.pinned ? 'border-primary/50 text-primary' : 'border-base-300'}`}
                                aria-label={t(
                                    project.pinned
                                        ? 'project.unpinProject'
                                        : 'project.pinProject',
                                    { ns: 'menus' },
                                )}
                                onClick={() => onTogglePinned(project)}
                            >
                                <Pin size={16} />
                            </button>
                        </Tooltip>
                        <Tooltip placement="top" tip={t('card.openFolders')}>
                            <button
                                type="button"
                                data-testid="btnProjectFolders"
                                className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                                aria-label={t('card.openFolders')}
                                onClick={(event) =>
                                    onProjectFoldersOptions(event, project)
                                }
                            >
                                <FolderOpen size={16} />
                            </button>
                        </Tooltip>
                        <Tooltip
                            placement="top"
                            tip={t('card.projectSettings')}
                        >
                            <button
                                type="button"
                                data-testid="btnProjectSettings"
                                className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                                aria-label={t('card.projectSettings')}
                                onClick={() => onProjectSettings(project)}
                            >
                                <Settings size={16} />
                            </button>
                        </Tooltip>
                        <button
                            type="button"
                            data-testid="btnProjectMoreOptions"
                            onClick={(event) =>
                                onProjectMoreOptions(event, project)
                            }
                            className="btn btn-ghost btn-square h-7 min-h-7 w-7 border border-base-300 bg-base-100/20"
                            aria-label={t('table.moreOptions', {
                                project: project.name,
                            })}
                        >
                            <EllipsisVertical size={17} />
                        </button>
                    </div>
                </div>

                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-6">
                    <div
                        data-testid="projectBadges"
                        className="flex min-w-0 flex-wrap content-start items-start gap-1.5"
                    >
                        <Tooltip
                            placement="top"
                            tip={
                                releaseInstalled
                                    ? t('card.godotVersion', {
                                          version: versionLabel,
                                      })
                                    : t('table.invalidReasons.missingEditor')
                            }
                            tone={releaseInstalled ? 'primary' : 'warning'}
                        >
                            <span
                                className={`badge badge-outline h-7 gap-1.5 px-2 text-xs ${releaseInstalled ? 'border-base-content/25' : 'border-warning/60 text-warning'}`}
                            >
                                {editorDownloading ? (
                                    <span className="loading loading-spinner loading-xs" />
                                ) : releaseInstalled ? (
                                    <Tag size={13} />
                                ) : (
                                    <TriangleAlert size={13} />
                                )}
                                {versionLabel}
                                {project.release.prerelease && (
                                    <FlaskConical
                                        size={12}
                                        className="text-secondary"
                                    />
                                )}
                            </span>
                        </Tooltip>

                        {project.codeEditorId && (
                            <Tooltip
                                placement="top"
                                tip={codeEditorTooltip}
                                tone={
                                    codeEditorUnavailable
                                        ? 'warning'
                                        : 'primary'
                                }
                            >
                                <span
                                    className={`badge badge-outline h-7 gap-1.5 px-2 text-xs ${codeEditorUnavailable ? 'border-warning/60 text-warning' : 'border-base-content/25'}`}
                                >
                                    {codeEditorUnavailable ? (
                                        <TriangleAlert
                                            size={13}
                                            className="stroke-warning"
                                        />
                                    ) : (
                                        <CodeEditorIntegrationIcon
                                            integrationId={project.codeEditorId}
                                            className="size-3.5"
                                        />
                                    )}
                                    <span className="max-w-48 truncate">
                                        {codeEditorName}
                                    </span>
                                </span>
                            </Tooltip>
                        )}

                        {project.withGit && (
                            <Tooltip
                                placement="top"
                                tip={t('table.gitProject')}
                                tone="primary"
                            >
                                <span className="badge badge-outline h-7 gap-1.5 border-base-content/25 px-2 text-xs">
                                    <img
                                        src={gitIconColor}
                                        className="h-3.5 w-3.5"
                                        alt=""
                                    />
                                    Git
                                </span>
                            </Tooltip>
                        )}

                        {project.open_windowed && (
                            <Tooltip
                                placement="top"
                                tip={t('table.windowedMode')}
                                tone="primary"
                            >
                                <span className="badge badge-outline h-7 gap-1.5 border-base-content/25 px-2 text-xs">
                                    <PanelTop size={13} />
                                    {t('card.windowed')}
                                </span>
                            </Tooltip>
                        )}
                    </div>

                    <div
                        data-testid="projectLaunchActions"
                        className="flex min-w-36 shrink-0 flex-col items-end gap-2"
                    >
                        <button
                            type="button"
                            data-testid="btnEditProjectInGodot"
                            disabled={launchDisabled}
                            onClick={() => onLaunchProject(project)}
                            className="btn btn-primary btn-sm min-w-32 gap-2"
                        >
                            <Play size={16} />
                            {t('card.editInGodot')}
                        </button>

                        <p className="whitespace-nowrap text-sm text-base-content/55">
                            {project.last_opened
                                ? t('card.opened', {
                                      age: formatRelativeTime(
                                          project.last_opened,
                                          locale,
                                      ),
                                  })
                                : t('card.notOpened')}
                        </p>
                    </div>
                </div>
            </div>
        </li>
    );
};

type SortablePinnedProjectItemProps = Omit<
    ProjectListItemProps,
    'sectionKey' | 'pinnedItemRef' | 'reorderHandle' | 'reorderStateClassName'
> & {
    index: number;
    reorderingDisabled: boolean;
    pinnedItemRef: (element: HTMLLIElement | null) => void;
};

const SortablePinnedProjectItem: React.FC<SortablePinnedProjectItemProps> = ({
    project,
    index,
    reorderingDisabled,
    pinnedItemRef,
    t,
    ...itemProps
}) => {
    const { ref, handleRef, isDragging, isDropTarget } = useSortable({
        id: project.path,
        index,
        group: 'pinned-projects',
        disabled: reorderingDisabled,
        data: { projectName: project.name },
    });
    const setItemRef = (element: HTMLLIElement | null) => {
        ref(element);
        pinnedItemRef(element);
    };

    return (
        <ProjectListItem
            {...itemProps}
            t={t}
            project={project}
            sectionKey="pinned"
            pinnedItemRef={setItemRef}
            reorderStateClassName={`${isDragging ? 'z-[1] opacity-70' : ''} ${isDropTarget ? 'border-primary/60' : ''}`}
            reorderHandle={
                <Tooltip
                    placement="top"
                    tip={t(
                        reorderingDisabled
                            ? 'pinning.reorder.disabledSearch'
                            : 'pinning.reorder.label',
                        { project: project.name },
                    )}
                >
                    <button
                        ref={handleRef}
                        type="button"
                        data-testid="btnReorderPinnedProject"
                        disabled={reorderingDisabled}
                        className="btn btn-ghost btn-square h-7 min-h-7 w-7 cursor-grab border border-base-300 bg-base-100/20 active:cursor-grabbing"
                        aria-label={t('pinning.reorder.label', {
                            project: project.name,
                        })}
                    >
                        <GripVertical size={16} />
                    </button>
                </Tooltip>
            }
        />
    );
};

export const ProjectsList: React.FC<ProjectsListProps> = ({
    sections,
    loading,
    highlightedPinnedProjectPath,
    pinnedReorderingDisabled,
    onPinnedHighlightComplete,
    onReorderPinnedProjects,
    ...itemProps
}) => {
    const pinnedItemRefs = useRef(new Map<string, HTMLLIElement>());
    const [isPersistingPinnedOrder, setIsPersistingPinnedOrder] =
        useState(false);
    const pinnedProjectsByPath = useMemo(
        () =>
            new Map(
                sections.pinnedProjects.map((project) => [
                    project.path,
                    project,
                ]),
            ),
        [sections.pinnedProjects],
    );
    const accessibilityPlugin = useMemo(
        () =>
            Accessibility.configure({
                screenReaderInstructions: {
                    draggable: itemProps.t('pinning.reorder.instructions'),
                },
                announcements: {
                    dragstart: ({ operation }: DragStartEvent) => {
                        const source = operation.source;
                        if (!isSortable(source)) return;
                        const project = pinnedProjectsByPath.get(
                            String(source.id),
                        );
                        return itemProps.t(
                            'pinning.reorder.announcements.pickedUp',
                            {
                                project: project?.name ?? String(source.id),
                                position: source.index + 1,
                                count: sections.pinnedProjects.length,
                            },
                        );
                    },
                    dragover: ({ operation }: DragOverEvent) => {
                        const source = operation.source;
                        if (!isSortable(source)) return;
                        const project = pinnedProjectsByPath.get(
                            String(source.id),
                        );
                        return itemProps.t(
                            'pinning.reorder.announcements.moved',
                            {
                                project: project?.name ?? String(source.id),
                                position: source.index + 1,
                                count: sections.pinnedProjects.length,
                            },
                        );
                    },
                    dragend: ({ operation, canceled }: DragEndEvent) => {
                        const source = operation.source;
                        if (!isSortable(source)) return;
                        const project = pinnedProjectsByPath.get(
                            String(source.id),
                        );
                        return itemProps.t(
                            canceled
                                ? 'pinning.reorder.announcements.cancelled'
                                : 'pinning.reorder.announcements.dropped',
                            {
                                project: project?.name ?? String(source.id),
                                position: source.index + 1,
                                count: sections.pinnedProjects.length,
                            },
                        );
                    },
                },
            }),
        [itemProps.t, pinnedProjectsByPath, sections.pinnedProjects.length],
    );

    const handlePinnedDragEnd = ({ canceled, operation }: DragEndEvent) => {
        const source = operation.source;
        if (
            canceled ||
            !isSortable(source) ||
            source.initialIndex === source.index ||
            source.initialIndex < 0 ||
            source.index < 0
        ) {
            return;
        }

        const orderedProjectPaths = sections.pinnedProjects.map(
            (project) => project.path,
        );
        const [movedProjectPath] = orderedProjectPaths.splice(
            source.initialIndex,
            1,
        );
        if (!movedProjectPath) return;
        orderedProjectPaths.splice(source.index, 0, movedProjectPath);

        setIsPersistingPinnedOrder(true);
        void onReorderPinnedProjects(orderedProjectPaths).finally(() =>
            setIsPersistingPinnedOrder(false),
        );
    };

    useEffect(() => {
        if (!highlightedPinnedProjectPath) {
            return;
        }

        const item = pinnedItemRefs.current.get(highlightedPinnedProjectPath);
        item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        item?.focus({ preventScroll: true });

        const timeout = window.setTimeout(onPinnedHighlightComplete, 1600);
        return () => window.clearTimeout(timeout);
    }, [highlightedPinnedProjectPath, onPinnedHighlightComplete]);

    if (loading) {
        return <div className="loading loading-dots loading-lg" />;
    }

    const sectionData: Array<{
        key: ProjectSectionKey;
        label: string;
        projects: ProjectDetails[];
    }> = [
        {
            key: 'new',
            label: itemProps.t('sections.new'),
            projects: sections.newProjects,
        },
        {
            key: 'pinned',
            label: itemProps.t('sections.pinned'),
            projects: sections.pinnedProjects,
        },
        {
            key: 'recents',
            label: itemProps.t('sections.recents'),
            projects: sections.recentProjects,
        },
    ];
    const visibleSections = sectionData.filter(
        (section) => section.projects.length > 0,
    );

    if (visibleSections.length === 0) {
        return (
            <div className="flex min-h-40 flex-1 items-center justify-center text-base-content/60">
                {itemProps.t('sections.empty')}
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-auto pb-4">
            {visibleSections.map((section) => (
                <section
                    key={section.key}
                    aria-labelledby={`${section.key}-projects-heading`}
                    className="flex flex-col gap-3"
                >
                    <div className="sticky top-0 z-[2] flex items-center gap-3 bg-base-100/95 px-1 py-2 backdrop-blur-sm">
                        <h2
                            id={`${section.key}-projects-heading`}
                            className="text-sm font-semibold tracking-wide text-base-content/80"
                        >
                            {section.label}
                        </h2>
                        <span className="text-xs tabular-nums text-base-content/45">
                            {section.projects.length}
                        </span>
                        <div
                            className="h-px flex-1 bg-base-300/80"
                            aria-hidden="true"
                        />
                    </div>
                    {section.key === 'pinned' ? (
                        <DragDropProvider
                            modifiers={[RestrictToVerticalAxis]}
                            plugins={(defaults) =>
                                defaults.map((plugin) =>
                                    plugin === Accessibility
                                        ? accessibilityPlugin
                                        : plugin,
                                )
                            }
                            onDragEnd={handlePinnedDragEnd}
                        >
                            <ul className="flex flex-col gap-3">
                                {section.projects.map((project, index) => (
                                    <SortablePinnedProjectItem
                                        key={`${section.key}_${project.path}`}
                                        {...itemProps}
                                        project={project}
                                        index={index}
                                        reorderingDisabled={
                                            pinnedReorderingDisabled ||
                                            isPersistingPinnedOrder
                                        }
                                        highlighted={
                                            highlightedPinnedProjectPath ===
                                            project.path
                                        }
                                        pinnedItemRef={(element) => {
                                            if (element) {
                                                pinnedItemRefs.current.set(
                                                    project.path,
                                                    element,
                                                );
                                            } else {
                                                pinnedItemRefs.current.delete(
                                                    project.path,
                                                );
                                            }
                                        }}
                                    />
                                ))}
                            </ul>
                        </DragDropProvider>
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {section.projects.map((project) => (
                                <ProjectListItem
                                    key={`${section.key}_${project.path}`}
                                    {...itemProps}
                                    project={project}
                                    sectionKey={section.key}
                                    highlighted={
                                        section.key === 'pinned' &&
                                        highlightedPinnedProjectPath ===
                                            project.path
                                    }
                                />
                            ))}
                        </ul>
                    )}
                </section>
            ))}
        </div>
    );
};
