import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
import { Accessibility } from '@dnd-kit/dom';
import {
    DragDropProvider,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import type { ProjectDetails } from '@shared/contracts';
import { GripVertical } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import githubInvertocatBlack from '../../../assets/icons/github-invertocat-black.svg';
import githubInvertocatWhite from '../../../assets/icons/github-invertocat-white.svg';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { useTheme } from '../../../hooks/useTheme';
import type {
    ProjectListItemProps,
    ProjectSectionKey,
    ProjectsListProps,
} from './project-list.types';
import { ProjectListItem } from './project-list-item.component';

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

/**
 * Renders grouped projects and the reorderable pinned section.
 * @param props - Project sections, selected presentation and project actions.
 */
export const ProjectsList: React.FC<ProjectsListProps> = ({
    sections,
    loading,
    highlightedPinnedProjectPath,
    pinnedReorderingDisabled,
    onPinnedHighlightComplete,
    onReorderPinnedProjects,
    ...itemProps
}) => {
    const { theme, systemTheme } = useTheme();
    const effectiveTheme = (theme ?? 'auto') === 'auto' ? systemTheme : theme;
    const githubIconSrc =
        effectiveTheme === 'dark'
            ? githubInvertocatWhite
            : githubInvertocatBlack;
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
                            <ul
                                className={
                                    itemProps.viewMode === 'list'
                                        ? 'flex flex-col'
                                        : 'flex flex-col gap-3'
                                }
                            >
                                {section.projects.map((project, index) => (
                                    <SortablePinnedProjectItem
                                        key={`${section.key}_${project.path}`}
                                        {...itemProps}
                                        githubIconSrc={githubIconSrc}
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
                        <ul
                            className={
                                itemProps.viewMode === 'list'
                                    ? 'flex flex-col'
                                    : 'flex flex-col gap-3'
                            }
                        >
                            {section.projects.map((project) => (
                                <ProjectListItem
                                    key={`${section.key}_${project.path}`}
                                    {...itemProps}
                                    githubIconSrc={githubIconSrc}
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
