import type { EditorRemovalSelection } from '@shared/contracts';
import {
    CheckSquare,
    EyeOff,
    FileJson,
    FilePlus2,
    HardDriveDownload,
    SquareMinus,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/action-menu.component.tsx';
import { ContentDivider } from '../components/ui/content-divider.component';
import { EmptyState } from '../components/ui/empty-state.component.tsx';
import { WaitingForDialogOverlay } from '../components/waiting-for-dialog-overlay.component';
import { useAlerts } from '../hooks/alerts.hook';
import { usePreferences } from '../hooks/preferences.hook';
import { useProjects } from '../hooks/projects.hook';
import { useRelease } from '../hooks/release.hook';
import { appBridge, editorInstallsBridge } from '../renderer.bridge.ts';
import { CustomEditorManifestDropOverlay } from './installs/components/custom-editor-manifest-drop-overlay.component';
import { EditorSelectionToolbar } from './installs/components/editor-selection-toolbar.component';
import { InstalledReleaseList } from './installs/components/installed-release-list.component';
import { InstallsHeader } from './installs/components/installs-header.component';
import { InstallsSearchEmptyState } from './installs/components/installs-search-empty-state.component';
import { RemoveEditorsConfirm } from './installs/components/remove-editors-confirm.component';
import { useCustomEditorManifestDrop } from './installs/hooks/custom-editor-manifest-drop.hook';
import { useCustomEditorManifestWorkflow } from './installs/hooks/custom-editor-manifest-workflow.hook';
import { useEditorSelection } from './installs/hooks/editor-selection.hook';
import {
    createReleaseActions,
    useReleaseActions,
} from './installs/hooks/release-actions.hook';
import {
    getEditorProjectUsageCount,
    getFilteredInstalledReleaseRows,
    getInstallsViewState,
    getReleaseActionKey,
} from './installs/installs-view.model';
import { CustomEditorManifestDrawer } from './sub-views/custom-editor-manifest-drawer.subview';
import { InstallEditorDrawer } from './sub-views/install-editor-drawer.subview.tsx';

export { createReleaseActions };

type InstallsViewProps = {
    installOpen?: boolean;
    onInstallOpenChange?: (open: boolean) => void;
};

type CustomEditorMenuState = {
    anchorRect: ActionMenuAnchorRect;
    source: 'header' | 'empty';
};

/**
 * Renders installed editors, searchable-list feedback and the catalogue drawer.
 *
 * @param props - Optional controlled drawer state and its change action.
 * @returns The editor installs view.
 */
export const InstallsView: React.FC<InstallsViewProps> = ({
    installOpen: controlledInstallOpen,
    onInstallOpenChange,
}) => {
    const { t } = useTranslation([
        'installs',
        'common',
        'menus',
        'dialogs',
        'installEditor',
    ]);
    const [textSearch, setTextSearch] = useState<string>('');
    const [localInstallOpen, setLocalInstallOpen] = useState<boolean>(false);
    const installOpen = controlledInstallOpen ?? localInstallOpen;

    /**
     * Updates the controlled or local drawer state.
     *
     * @param open - Whether the drawer should be open.
     * @returns Nothing.
     */
    const setInstallOpen = (open: boolean) => {
        if (onInstallOpenChange) {
            onInstallOpenChange(open);
            return;
        }

        setLocalInstallOpen(open);
    };
    const [selectingCustomEditorManifest, setSelectingCustomEditorManifest] =
        useState<boolean>(false);
    const [customEditorManifestDrawerOpen, setCustomEditorManifestDrawerOpen] =
        useState<boolean>(false);
    const [customEditorMenu, setCustomEditorMenu] =
        useState<CustomEditorMenuState | null>(null);
    const [selectionMenu, setSelectionMenu] =
        useState<ActionMenuAnchorRect | null>(null);
    const [removingKeys, setRemovingKeys] = useState(new Set<string>());

    const { addAlert, addCustomConfirm } = useAlerts();
    const { preferences } = usePreferences();
    const { projects } = useProjects();
    const {
        installedReleases,
        downloadingReleases,
        checkAllReleasesValid,
        reinstallRelease,
        registerCustomEngine,
        removeRelease,
        removeReleases,
        loading,
        hasError,
    } = useRelease();
    const {
        isReleaseActionBusy,
        runReleaseAction,
        handleRemoveReleaseFromMenu,
        handleRetry,
        handleReinstall,
    } = useReleaseActions({
        t,
        addAlert,
        addCustomConfirm,
        checkAllReleasesValid,
        reinstallRelease,
        removeRelease,
        getProjectUsageCount: (release) =>
            getEditorProjectUsageCount(release, projects),
    });
    const selection = useEditorSelection({
        installed: installedReleases,
        downloading: downloadingReleases,
        projects,
        isBusy: isReleaseActionBusy,
    });

    /**
     * Runs one batch while keeping its selected rows visibly busy.
     *
     * @param selections - The confirmed editor selection or failed retry subset.
     * @returns Independent removal results from the main process.
     */
    const handleRemoveSelected = async (
        selections: EditorRemovalSelection[],
    ) => {
        setRemovingKeys(
            new Set(
                selections.map(({ release }) => getReleaseActionKey(release)),
            ),
        );
        try {
            return await removeReleases(selections);
        } finally {
            setRemovingKeys(new Set());
        }
    };

    /** Opens one confirmation for the current selected editor snapshot. */
    const confirmRemoveSelected = () => {
        if (selection.selections.length === 0) return;
        const selections = selection.selections;
        addCustomConfirm(
            t('selection.confirm.title'),
            (renderLayout, close) => (
                <RemoveEditorsConfirm
                    selections={selections}
                    projects={projects}
                    t={t}
                    onRemove={handleRemoveSelected}
                    close={close}
                    renderLayout={renderLayout}
                />
            ),
            [],
            undefined,
            'warning',
        );
    };
    const { registerManifest, handleAddCustomEngine } =
        useCustomEditorManifestWorkflow({
            t,
            selectingCustomEditorManifest,
            setSelectingCustomEditorManifest,
            addAlert,
            addCustomConfirm,
            registerCustomEngine,
        });
    const {
        isDraggingManifest,
        isDraggingSupportedManifest,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    } = useCustomEditorManifestDrop({ registerManifest });

    const filteredRows = getFilteredInstalledReleaseRows(
        installedReleases,
        downloadingReleases,
        textSearch,
    );
    const viewState = getInstallsViewState({
        installedReleaseCount: installedReleases.length,
        downloadingReleaseCount: downloadingReleases.length,
        loading,
        hasError: Boolean(hasError),
    });

    return (
        <>
            <section
                className="relative flex flex-col gap-2 h-full w-full overflow-hidden p-1"
                aria-label={t('title')}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {selectingCustomEditorManifest && (
                    <WaitingForDialogOverlay
                        className="z-20"
                        message={t('customEditor.waitingForDialog')}
                    />
                )}
                {isDraggingManifest && (
                    <CustomEditorManifestDropOverlay
                        supported={isDraggingSupportedManifest}
                        t={t}
                    />
                )}
                <InstallsHeader
                    title={t('title')}
                    installLocation={preferences?.install_location}
                    searchPlaceholder={t('search.placeholder')}
                    searchValue={textSearch}
                    onSearchChange={setTextSearch}
                    addCustomEditorLabel={t('buttons.addCustomEditor')}
                    customEditorMenuOpen={customEditorMenu?.source === 'header'}
                    installLabel={t('buttons.install')}
                    copyPathLabel={t('common:buttons.copyPath')}
                    copiedLabel={t('common:success')}
                    showControls={viewState !== 'empty'}
                    selectionControls={
                        <EditorSelectionToolbar
                            enabled={selection.enabled}
                            selectedCount={selection.selections.length}
                            disabled={
                                loading ||
                                installedReleases.length === 0 ||
                                removingKeys.size > 0
                            }
                            actionsOpen={selectionMenu !== null}
                            t={t}
                            onToggle={() => {
                                setSelectionMenu(null);
                                selection.toggleEnabled();
                            }}
                            onOpenActions={(event) =>
                                setSelectionMenu(
                                    getActionMenuAnchorRect(
                                        event.currentTarget,
                                    ),
                                )
                            }
                        />
                    }
                    onOpenCustomEditorMenu={(event) =>
                        setCustomEditorMenu({
                            anchorRect: getActionMenuAnchorRect(
                                event.currentTarget,
                            ),
                            source: 'header',
                        })
                    }
                    onInstall={() => setInstallOpen(true)}
                />
                {viewState === 'empty' ? (
                    <EmptyState
                        icon={HardDriveDownload}
                        heading={t('emptyState.heading')}
                        description={t('emptyState.description')}
                        primaryActionLabel={t('emptyState.chooseEditor')}
                        secondaryActionLabel={t('emptyState.addCustomEditor')}
                        onPrimaryAction={() => setInstallOpen(true)}
                        onSecondaryAction={(event) =>
                            setCustomEditorMenu({
                                anchorRect: getActionMenuAnchorRect(
                                    event.currentTarget,
                                ),
                                source: 'empty',
                            })
                        }
                    />
                ) : (
                    <>
                        <ContentDivider />
                        {hasError && (
                            <div
                                role="alert"
                                className="alert alert-warning alert-soft shrink-0 text-base text-warning-content dark:text-warning"
                            >
                                {t('installEditor:errors.catalogLoadFailed')}
                            </div>
                        )}
                        {filteredRows.length === 0 ? (
                            <div
                                role="status"
                                className="flex min-h-0 flex-1 items-center justify-center gap-2 text-base text-base-content/75"
                            >
                                {loading ? (
                                    <>
                                        <span
                                            className="loading loading-spinner loading-sm"
                                            aria-hidden="true"
                                        />
                                        {t('installEditor:catalog.loading')}
                                    </>
                                ) : !hasError && textSearch.trim() ? (
                                    <InstallsSearchEmptyState
                                        query={textSearch}
                                        onClearSearch={() => setTextSearch('')}
                                    />
                                ) : !hasError ? (
                                    t('installEditor:catalog.empty')
                                ) : null}
                            </div>
                        ) : (
                            <InstalledReleaseList
                                rows={filteredRows}
                                t={t}
                                isReleaseActionBusy={(release, action) =>
                                    removingKeys.has(
                                        getReleaseActionKey(release),
                                    )
                                        ? action === undefined ||
                                          action === 'remove'
                                        : isReleaseActionBusy(release, action)
                                }
                                selectionEnabled={selection.enabled}
                                selectedKeys={selection.selectedKeys}
                                selectableKeys={
                                    removingKeys.size > 0
                                        ? new Set()
                                        : selection.selectableKeys
                                }
                                onToggleEditor={selection.toggleEditor}
                                onRetry={(release) => void handleRetry(release)}
                                onReinstall={(release) =>
                                    void handleReinstall(release)
                                }
                                onRemove={handleRemoveReleaseFromMenu}
                                onOpenInstalledFolder={(release) =>
                                    runReleaseAction(() =>
                                        appBridge.openShellFolder(
                                            release.install_path,
                                        ),
                                    )
                                }
                                onStartProjectManager={(release) =>
                                    runReleaseAction(() =>
                                        editorInstallsBridge.openProjectManager(
                                            release,
                                        ),
                                    )
                                }
                            />
                        )}
                    </>
                )}
            </section>
            <ActionMenu
                open={selectionMenu !== null && selection.enabled}
                anchorRect={selectionMenu}
                ariaLabel={t('selection.actions')}
                align="start"
                items={[
                    {
                        key: 'select-unused',
                        icon: <EyeOff size={16} aria-hidden="true" />,
                        label: t('selection.selectUnused'),
                        disabled: selection.unusedCount === 0,
                        onSelect: selection.selectUnused,
                    },
                    {
                        key: 'select-all',
                        icon: <CheckSquare size={16} aria-hidden="true" />,
                        label: t('selection.selectAll'),
                        disabled: selection.selectableKeys.size === 0,
                        onSelect: selection.selectAll,
                    },
                    {
                        key: 'clear-selection',
                        icon: <SquareMinus size={16} aria-hidden="true" />,
                        label: t('selection.clear'),
                        disabled: selection.selections.length === 0,
                        onSelect: selection.clear,
                    },
                    { type: 'separator', key: 'selection-remove-divider' },
                    {
                        key: 'remove-selected',
                        icon: <Trash2 size={16} aria-hidden="true" />,
                        label: t('selection.remove', {
                            count: selection.selections.length,
                        }),
                        disabled: selection.selections.length === 0,
                        destructive: true,
                        onSelect: confirmRemoveSelected,
                    },
                ]}
                onClose={() => setSelectionMenu(null)}
            />
            <ActionMenu
                open={customEditorMenu !== null}
                anchorRect={customEditorMenu?.anchorRect ?? null}
                ariaLabel={t('buttons.addCustomEditor')}
                items={[
                    {
                        key: 'select-manifest',
                        icon: <FileJson size={16} aria-hidden="true" />,
                        label: t('buttons.selectCustomEditorManifest'),
                        testId:
                            customEditorMenu?.source === 'header'
                                ? 'btnAddCustomEngine'
                                : 'btnEmptyStateSelectCustomEditorManifest',
                        onSelect: handleAddCustomEngine,
                    },
                    {
                        key: 'create-manifest',
                        icon: <FilePlus2 size={16} aria-hidden="true" />,
                        label: t('buttons.createCustomEditorManifest'),
                        testId:
                            customEditorMenu?.source === 'header'
                                ? 'btnCreateCustomEditorManifest'
                                : 'btnEmptyStateCreateCustomEditorManifest',
                        onSelect: () => setCustomEditorManifestDrawerOpen(true),
                    },
                ]}
                onClose={() => setCustomEditorMenu(null)}
            />
            <InstallEditorDrawer
                open={installOpen}
                onOpenChange={setInstallOpen}
            />
            <CustomEditorManifestDrawer
                open={customEditorManifestDrawerOpen}
                onOpenChange={setCustomEditorManifestDrawerOpen}
                onManifestCreated={(manifestPath) =>
                    registerManifest(manifestPath, false, {
                        onSuccess: () =>
                            setCustomEditorManifestDrawerOpen(false),
                    })
                }
            />
        </>
    );
};
