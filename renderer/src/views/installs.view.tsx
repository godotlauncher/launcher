import type {
    EditorRemovalSelection,
    InstalledRelease,
    SelectedAliasChangePreview,
} from '@shared/contracts';
import {
    CheckSquare,
    EyeOff,
    FileJson,
    FilePlus2,
    HardDriveDownload,
    SquareMinus,
    Terminal,
    Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/action-menu.component.tsx';
import { ContentDivider } from '../components/ui/content-divider.component';
import { EmptyState } from '../components/ui/empty-state.component.tsx';
import { SelectionToolbar } from '../components/ui/selection-toolbar.component';
import { WaitingForDialogOverlay } from '../components/waiting-for-dialog-overlay.component';
import { useAlerts } from '../hooks/alerts.hook';
import { useNotifications } from '../hooks/notifications.hook';
import { usePreferences } from '../hooks/preferences.hook';
import { useProjects } from '../hooks/projects.hook';
import { useRelease } from '../hooks/release.hook';
import { appBridge, editorInstallsBridge } from '../renderer.bridge.ts';
import { CustomEditorManifestDropOverlay } from './installs/components/custom-editor-manifest-drop-overlay.component';
import { InstalledReleaseList } from './installs/components/installed-release-list.component';
import { InstallsHeader } from './installs/components/installs-header.component';
import { InstallsSearchEmptyState } from './installs/components/installs-search-empty-state.component';
import { RemoveEditorsConfirm } from './installs/components/remove-editors-confirm.component';
import { SelectedAliasChangeConfirm } from './installs/components/selected-alias-change-confirm.component';
import { useCommandLineAliases } from './installs/hooks/command-line-aliases.hook';
import { useCommandLineGodot } from './installs/hooks/command-line-godot.hook';
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
import { InstallSettingsDrawer } from './sub-views/install-settings-drawer.subview';

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
    const [settingsEditor, setSettingsEditor] =
        useState<InstalledRelease | null>(null);
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
    const [bulkAliasPending, setBulkAliasPending] = useState(false);
    const { showNotification } = useNotifications();
    const [removingKeys, setRemovingKeys] = useState(new Set<string>());

    const { addAlert, addCustomConfirm, hasOpenDialog } = useAlerts();
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
    const commandLine = useCommandLineGodot(installedReleases);
    const aliasState = useCommandLineAliases(installedReleases);
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
        commandLineDefaultKey: commandLine.defaultKey,
        commandLineAliases: aliasState.aliases,
        getProjectUsageCount: (release) =>
            getEditorProjectUsageCount(release, projects),
    });
    const filteredRows = getFilteredInstalledReleaseRows(
        installedReleases,
        downloadingReleases,
        textSearch,
    );
    const selection = useEditorSelection({
        installed: installedReleases,
        shown: filteredRows,
        filterKey: textSearch,
        downloading: downloadingReleases,
        projects,
        isBusy: (release) =>
            commandLine.pendingKey !== null ||
            aliasState.pending ||
            bulkAliasPending ||
            isReleaseActionBusy(release),
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
            t('selection.confirm.countTitle', { count: selections.length }),
            (renderLayout, close) => (
                <RemoveEditorsConfirm
                    selections={selections}
                    commandLineDefaultKey={commandLine.defaultKey}
                    commandLineAliases={aliasState.aliases}
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
    /** Opens a compact review for selected named commands.
     * @param mode - Create missing commands or remove existing commands.
     */
    const confirmSelectedAliases = (mode: 'create-missing' | 'remove') => {
        const editors = selection.selections.map(({ release }) => release);
        if (!editors.length) return;
        addCustomConfirm(
            t(
                `selection.aliases.${mode === 'remove' ? 'removeTitle' : 'createTitle'}`,
            ),
            (renderLayout, close) => (
                <SelectedAliasChangeConfirm
                    editors={editors}
                    mode={mode}
                    renderLayout={renderLayout}
                    close={close}
                    initialPreview={
                        selectionPreview?.key === aliasPreviewKey
                            ? selectionPreview.previews?.find(
                                  (preview) => preview.mode === mode,
                              )
                            : undefined
                    }
                    onRetry={aliasState.refresh}
                    onBusy={setBulkAliasPending}
                    onComplete={async (result) => {
                        await aliasState.refresh();
                        if (result.pathChanged)
                            showNotification({
                                title: t('selection.aliases.createTitle'),
                                description: t('aliases.pathChanged'),
                            });
                    }}
                />
            ),
            [],
            undefined,
            mode === 'remove' ? 'warning' : undefined,
        );
    };
    const selectedEditors = selection.selections.map(({ release }) => release);
    const aliasPreviewKey = JSON.stringify({
        editors: selectedEditors,
        aliases: aliasState.aliases,
    });
    const [selectionPreview, setSelectionPreview] = useState<{
        key: string;
        previews?: SelectedAliasChangePreview[];
        error?: boolean;
    }>();
    const selectionRequest = useRef<
        | { key: string; promise: Promise<SelectedAliasChangePreview[]> }
        | undefined
    >(undefined);
    useEffect(() => {
        if (
            !selectionMenu ||
            selectedEditors.length === 0 ||
            !aliasState.loaded
        )
            return;
        let active = true;
        if (selectionRequest.current?.key !== aliasPreviewKey)
            selectionRequest.current = {
                key: aliasPreviewKey,
                promise: Promise.all(
                    (['create-missing', 'remove'] as const).map((mode) =>
                        editorInstallsBridge.previewSelectedAliasChange({
                            mode,
                            editors: JSON.parse(aliasPreviewKey).editors,
                        }),
                    ),
                ),
            };
        void selectionRequest.current.promise
            .then((previews) => {
                if (active)
                    setSelectionPreview({ key: aliasPreviewKey, previews });
            })
            .catch(() => {
                if (active)
                    setSelectionPreview({ key: aliasPreviewKey, error: true });
            });
        return () => {
            active = false;
        };
    }, [
        selectionMenu,
        aliasPreviewKey,
        aliasState.loaded,
        selectedEditors.length,
    ]);
    const reviewedSelection =
        selectionPreview?.key === aliasPreviewKey
            ? selectionPreview
            : undefined;
    const aliasCountsLoading = selectedEditors.length > 0 && !reviewedSelection;
    const missingAliasCount =
        reviewedSelection?.previews?.[0].items.filter(
            (item) => item.action === 'create',
        ).length ??
        (selectedEditors.length === 0
            ? 0
            : reviewedSelection?.error
              ? '?'
              : '...');
    const removableAliasCount =
        reviewedSelection?.previews?.[1].items.filter(
            (item) => item.action === 'remove',
        ).length ??
        (selectedEditors.length === 0
            ? 0
            : reviewedSelection?.error
              ? '?'
              : '...');
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
                        <SelectionToolbar
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
                                commandLineAliases={
                                    aliasState.loaded ? aliasState.aliases : []
                                }
                                commandLineDefaultKey={commandLine.defaultKey}
                                commandLinePendingKey={
                                    commandLine.pendingKey ??
                                    aliasState.pendingKey
                                }
                                commandLineBusy={
                                    commandLine.busy || aliasState.pending
                                }
                                onCommandLineSelect={commandLine.select}
                                onSettings={setSettingsEditor}
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
                                onToggleGroup={selection.toggleGroup}
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
                    { type: 'separator', key: 'selection-command-divider' },
                    {
                        key: 'create-aliases',
                        icon: <Terminal size={16} aria-hidden="true" />,
                        label: t('selection.aliases.create', {
                            count: missingAliasCount,
                        }),
                        disabled:
                            selectedEditors.length === 0 ||
                            aliasCountsLoading ||
                            missingAliasCount === 0 ||
                            !aliasState.loaded ||
                            bulkAliasPending,
                        onSelect: () =>
                            confirmSelectedAliases('create-missing'),
                    },
                    {
                        key: 'remove-aliases',
                        icon: <Terminal size={16} aria-hidden="true" />,
                        label: t('selection.aliases.remove', {
                            count: removableAliasCount,
                        }),
                        disabled:
                            selectedEditors.length === 0 ||
                            aliasCountsLoading ||
                            removableAliasCount === 0 ||
                            !aliasState.loaded ||
                            bulkAliasPending,
                        onSelect: () => confirmSelectedAliases('remove'),
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
                onClose={() => {
                    setSelectionMenu(null);
                    setSelectionPreview(undefined);
                    selectionRequest.current = undefined;
                }}
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
            <InstallSettingsDrawer
                release={settingsEditor}
                installed={installedReleases}
                commandLine={commandLine}
                aliasState={aliasState}
                covered={hasOpenDialog}
                isBusy={(release) =>
                    removingKeys.has(getReleaseActionKey(release)) ||
                    isReleaseActionBusy(release)
                }
                onOpenChange={(open) => {
                    if (!open) setSettingsEditor(null);
                }}
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
