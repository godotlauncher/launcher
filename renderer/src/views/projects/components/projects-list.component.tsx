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
import { GripVertical, SearchX } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import githubInvertocatBlack from '../../../assets/icons/github-invertocat-black.svg';
import githubInvertocatWhite from '../../../assets/icons/github-invertocat-white.svg';
import { ListGroupHeading } from '../../../components/ui/list-group-heading.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { useTheme } from '../../../hooks/theme.hook';
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
            reorderStateClassName={`${isDragging ? 'z-[1] opacity-70' : ''} ${isDropTarget ? 'outline outline-primary' : ''}`}
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
                        className="btn btn-sm btn-ghost btn-square"
                        aria-label={t('pinning.reorder.label', {
                            project: project.name,
                        })}
                    >
                        <GripVertical size={16} aria-hidden="true" />
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
    searchQuery,
    onClearSearch,
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
        return (
            <div
                className="flex min-h-0 flex-1 items-center justify-center gap-2 text-base text-base-content/75"
                role="status"
            >
                <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                />
                {itemProps.t('common:app.loadingMessage')}
            </div>
        );
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
            <div
                className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto pr-3"
                role="status"
            >
                <div className="flex w-full max-w-sm flex-col items-center gap-[12px] px-4 py-6 text-center text-base">
                    <SearchX
                        className="size-10 text-primary"
                        aria-hidden="true"
                    />
                    <h2 className="text-lg font-semibold">
                        {itemProps.t('sections.empty')}
                    </h2>
                    {searchQuery && (
                        <p className="max-w-full break-words text-base-content/75">
                            {itemProps.t('search.placeholder')}: {searchQuery}
                        </p>
                    )}
                    {onClearSearch && (
                        <button
                            type="button"
                            className="btn btn-ghost text-base"
                            onClick={onClearSearch}
                        >
                            {itemProps.t('installs:search.clear')}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto pb-4 pr-3">
            {visibleSections.map((section) => (
                <section
                    key={section.key}
                    aria-labelledby={`${section.key}-projects-heading`}
                    className="flex flex-col gap-1 pb-3"
                >
                    <ListGroupHeading
                        id={`${section.key}-projects-heading`}
                        title={section.label}
                        count={section.projects.length}
                        headingLevel="h2"
                    />
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
                            <ul className="flex flex-col gap-2">
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
                        <ul className="flex flex-col gap-2">
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
