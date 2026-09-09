import type {
    InstalledRelease,
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import type React from 'react';
import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    buildCreateProjectReleaseRows,
    type CreateProjectEditorSelection,
    getCreateProjectCatalogueVariants,
    getCreateProjectReleaseKey,
} from '../create-project.model';
import {
    type CreateProjectEditorPickerChannel,
    CreateProjectEditorPickerPopover,
    type CreateProjectEditorPickerTab,
} from './create-project-editor-picker-popover.component';

type CreateProjectEditorPickerProps = {
    open: boolean;
    id?: string;
    disabled?: boolean;
    triggerTestId?: string;
    triggerLabel?: string;
    installedReleases: InstalledRelease[];
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    releaseInstallProgress: ReleaseInstallProgress[];
    loading: boolean;
    catalogueError: string | undefined;
    selection: CreateProjectEditorSelection | null;
    onSelectionChange: (selection: CreateProjectEditorSelection) => void;
    onCancelInstall: (jobId: string) => void;
    onRetryCatalogue: () => Promise<void>;
};

/**
 * Renders an editor field backed by a rich anchored popover.
 *
 * @param props - Editor data, active install state, and controlled selection.
 * @returns The Create Project editor selector and its popover panel.
 */
export const CreateProjectEditorPicker: React.FC<
    CreateProjectEditorPickerProps
> = ({
    open,
    id,
    disabled = false,
    triggerTestId = 'selectCreateProjectGodotEditor',
    triggerLabel,
    installedReleases,
    availableReleases,
    availablePrereleases,
    releaseInstallProgress,
    loading,
    catalogueError,
    selection,
    onSelectionChange,
    onCancelInstall,
    onRetryCatalogue,
}) => {
    const { t } = useTranslation(['createProject', 'installEditor']);
    const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const triggerId = id ?? `selectCreateProjectGodotEditor-${reactId}`;
    const popoverId = `createProjectEditorPickerPopover-${reactId}`;
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const installedOptionRefs = useRef(new Map<string, HTMLButtonElement>());
    const hasInstalledEditors = installedReleases.some(
        (release) => release.valid !== false && Boolean(release.editor_path),
    );
    const [tab, setTab] = useState<CreateProjectEditorPickerTab>(
        hasInstalledEditors ? 'installed' : 'catalogue',
    );
    const [channel, setChannel] =
        useState<CreateProjectEditorPickerChannel>('stable');
    const [search, setSearch] = useState('');
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isRetryingCatalogue, setIsRetryingCatalogue] = useState(false);
    const [popoverPosition, setPopoverPosition] = useState({
        left: 16,
        top: 16,
    });
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (open && !wasOpenRef.current) {
            setTab(hasInstalledEditors ? 'installed' : 'catalogue');
            setChannel('stable');
            setSearch('');
        }

        if (!open) {
            popoverRef.current?.hidePopover?.();
            setIsPopoverOpen(false);
        }

        wasOpenRef.current = open;
    }, [hasInstalledEditors, open]);

    const catalogueVariants = useMemo(
        () =>
            getCreateProjectCatalogueVariants(
                channel === 'stable' ? availableReleases : availablePrereleases,
                search,
            ),
        [availablePrereleases, availableReleases, channel, search],
    );
    const hasCachedCatalogueReleases =
        (channel === 'stable' ? availableReleases : availablePrereleases)
            .length > 0;
    const installedRows = useMemo(
        () =>
            buildCreateProjectReleaseRows(
                installedReleases.filter(
                    (release) =>
                        release.valid !== false && Boolean(release.editor_path),
                ),
                [],
            ),
        [installedReleases],
    );
    const firstInstalledRelease = installedRows.find(
        (release) => release.valid !== false && Boolean(release.editor_path),
    );
    const firstInstalledOptionKey = firstInstalledRelease
        ? getCreateProjectReleaseKey(firstInstalledRelease)
        : undefined;

    const closePopover = useCallback((restoreFocus: boolean) => {
        popoverRef.current?.hidePopover?.();
        setIsPopoverOpen(false);

        if (restoreFocus) {
            triggerRef.current?.focus({ preventScroll: true });
        }
    }, []);

    /** Measures the open panel and anchors it within the viewport. */
    const positionPopover = useCallback(() => {
        const trigger = triggerRef.current;
        const popover = popoverRef.current;
        if (!trigger || !popover) {
            return;
        }

        const viewportPadding = 16;
        const triggerGap = 4;
        const triggerRect = trigger.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const left = Math.min(
            Math.max(viewportPadding, triggerRect.right - popoverRect.width),
            window.innerWidth - popoverRect.width - viewportPadding,
        );
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const top =
            spaceBelow >= popoverRect.height + triggerGap + viewportPadding
                ? triggerRect.bottom + triggerGap
                : Math.max(
                      viewportPadding,
                      triggerRect.top - popoverRect.height - triggerGap,
                  );

        setPopoverPosition({ left, top });
    }, []);

    /** Opens the panel for positioning before its first visible paint. */
    const openPopover = useCallback(() => {
        if (!hasInstalledEditors) {
            setTab('catalogue');
        }

        popoverRef.current?.showPopover?.();
        setIsPopoverOpen(true);
    }, [hasInstalledEditors]);

    useEffect(() => {
        const popover = popoverRef.current;
        if (!popover) {
            return;
        }

        const handleToggle = (event: Event) => {
            const nextState = (
                event as Event & { newState?: 'open' | 'closed' }
            ).newState;
            setIsPopoverOpen(
                nextState
                    ? nextState === 'open'
                    : popover.matches(':popover-open'),
            );
        };

        popover.addEventListener('toggle', handleToggle);
        return () => popover.removeEventListener('toggle', handleToggle);
    }, []);

    useLayoutEffect(() => {
        if (!isPopoverOpen) {
            return;
        }

        positionPopover();
        const handleViewportChange = () => positionPopover();
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);
        const resizeObserver = new ResizeObserver(positionPopover);
        if (popoverRef.current) {
            resizeObserver.observe(popoverRef.current);
        }

        const animationFrameId = window.requestAnimationFrame(() => {
            if (tab === 'catalogue') {
                popoverRef.current
                    ?.querySelector<HTMLInputElement>(
                        '[data-testid="inputCreateProjectEditorSearch"]',
                    )
                    ?.focus({ preventScroll: true });
                return;
            }

            const selectedKey =
                selection?.source === 'installed' ? selection.key : undefined;
            const selectedOption = selectedKey
                ? installedOptionRefs.current.get(selectedKey)
                : undefined;
            const firstOption = firstInstalledOptionKey
                ? installedOptionRefs.current.get(firstInstalledOptionKey)
                : undefined;
            (selectedOption && !selectedOption.disabled
                ? selectedOption
                : firstOption
            )?.focus({ preventScroll: true });
        });

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [
        firstInstalledOptionKey,
        isPopoverOpen,
        positionPopover,
        selection,
        tab,
    ]);

    const handlePopoverKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (
        event,
    ) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closePopover(true);
            return;
        }

        const target = event.target as HTMLElement;
        const option = target.closest<HTMLElement>('[role="option"]');
        const isSearch = target instanceof HTMLInputElement;
        const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
        const isBoundary = event.key === 'Home' || event.key === 'End';

        // Leave Tab and text editing to the browser. Only navigate editor rows
        // from the search field or an option itself, not its nested actions.
        if (
            (!isArrow && !isBoundary) ||
            (!isSearch && target !== option) ||
            (isSearch && !isArrow) ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.nativeEvent.isComposing
        ) {
            return;
        }

        const options = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="option"]:not(:disabled):not([aria-disabled="true"])',
            ),
        );
        if (options.length === 0) {
            return;
        }

        const currentIndex = option ? options.indexOf(option) : -1;
        const nextIndex =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : currentIndex < 0
                    ? event.key === 'ArrowUp'
                        ? options.length - 1
                        : 0
                    : Math.max(
                          0,
                          Math.min(
                              options.length - 1,
                              currentIndex +
                                  (event.key === 'ArrowDown' ? 1 : -1),
                          ),
                      );

        event.preventDefault();
        event.stopPropagation();
        options[nextIndex].focus({ preventScroll: true });
        options[nextIndex].scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
        });
    };

    const handleSelectionChange = (
        nextSelection: CreateProjectEditorSelection,
    ) => {
        onSelectionChange(nextSelection);
        closePopover(true);
    };

    /** Retries the catalogue request while preserving the current form state. */
    const handleRetryCatalogue = useCallback(async () => {
        setIsRetryingCatalogue(true);
        try {
            await onRetryCatalogue();
        } finally {
            setIsRetryingCatalogue(false);
        }
    }, [onRetryCatalogue]);

    const registerInstalledOption = useCallback(
        (key: string, element: HTMLButtonElement | null) => {
            if (element) {
                installedOptionRefs.current.set(key, element);
            } else {
                installedOptionRefs.current.delete(key);
            }
        },
        [],
    );

    const selectionLabel = selection
        ? getSelectionLabel(
              selection,
              t('editorPicker.standard'),
              t('project.dotNetBadge'),
          )
        : t('editorPicker.noneSelected');
    const selectedLabel =
        selection?.source === 'installed' &&
        (selection.release.valid === false || !selection.release.editor_path)
            ? `${selectionLabel} - ${t('editorPicker.notInstalled')}`
            : selectionLabel;
    const popoverStyle = {
        visibility: isPopoverOpen ? 'visible' : 'hidden',
        left: popoverPosition.left,
        top: popoverPosition.top,
    } as React.CSSProperties;

    return (
        <div className="relative min-w-0">
            <button
                ref={triggerRef}
                id={triggerId}
                type="button"
                data-testid={triggerTestId}
                disabled={!open || disabled}
                aria-label={`${triggerLabel ?? t('editorPicker.title')}: ${selectedLabel}`}
                aria-haspopup="dialog"
                aria-expanded={isPopoverOpen}
                aria-controls={popoverId}
                className="select select-sm flex w-full items-center justify-between gap-2 text-left text-base"
                onClick={() =>
                    isPopoverOpen ? closePopover(true) : openPopover()
                }
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        openPopover();
                    }
                }}
            >
                <span
                    className="min-w-0 flex-1 truncate"
                    data-testid="createProjectEditorSelection"
                >
                    {selectedLabel}
                </span>
            </button>
            <CreateProjectEditorPickerPopover
                id={popoverId}
                labelledBy={triggerId}
                popoverRef={popoverRef}
                style={popoverStyle}
                open={isPopoverOpen}
                tab={tab}
                channel={channel}
                search={search}
                installedRows={installedRows}
                installedReleases={installedReleases}
                catalogueVariants={catalogueVariants}
                releaseInstallProgress={releaseInstallProgress}
                loading={loading}
                catalogueError={catalogueError}
                hasCachedCatalogueReleases={hasCachedCatalogueReleases}
                retryingCatalogue={isRetryingCatalogue}
                selection={selection}
                onTabChange={setTab}
                onChannelChange={setChannel}
                onSearchChange={setSearch}
                onSelectionChange={handleSelectionChange}
                onCancelInstall={onCancelInstall}
                onRetryCatalogue={handleRetryCatalogue}
                onKeyDown={handlePopoverKeyDown}
                registerInstalledOption={registerInstalledOption}
            />
        </div>
    );
};

/**
 * Formats the selected editor independently of the currently visible filters.
 *
 * @param selection - Exact controlled editor selection.
 * @param standardLabel - Localised label for the Standard build.
 * @param dotNetLabel - Localised label for the .NET build.
 * @returns A concise selection summary.
 */
function getSelectionLabel(
    selection: CreateProjectEditorSelection,
    standardLabel: string,
    dotNetLabel: string,
): string {
    const release = selection.release;
    const mono =
        selection.source === 'installed'
            ? selection.release.mono
            : selection.mono;
    const releaseLabel =
        release.name && release.name !== release.version
            ? `${release.name} (${release.version})`
            : release.version;
    return `${releaseLabel} - ${mono ? dotNetLabel : standardLabel}`;
}
