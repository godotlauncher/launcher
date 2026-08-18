import { HardDriveDownload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appBridge, editorInstallsBridge } from '../bridge.ts';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/actionMenu.component.tsx';
import { EmptyState } from '../components/ui/empty-state.component.tsx';
import { WaitingForDialogOverlay } from '../components/waitingForDialogOverlay.component';
import { useAlerts } from '../hooks/useAlerts';
import { usePreferences } from '../hooks/usePreferences';
import { useProjects } from '../hooks/useProjects';
import { useRelease } from '../hooks/useRelease';
import { CustomEditorManifestDropOverlay } from './installs/components/customEditorManifestDropOverlay.component';
import { InstalledReleaseList } from './installs/components/installedReleaseList.component';
import { InstallsHeader } from './installs/components/installsHeader.component';
import { ReleaseActionsMenu } from './installs/components/releaseActionsMenu.component';
import { useCustomEditorManifestDrop } from './installs/hooks/useCustomEditorManifestDrop';
import { useCustomEditorManifestWorkflow } from './installs/hooks/useCustomEditorManifestWorkflow';
import {
    createReleaseActions,
    useReleaseActions,
} from './installs/hooks/useReleaseActions';
import {
    getEditorProjectUsageCount,
    getFilteredInstalledReleaseRows,
    getInstallsViewState,
} from './installs/installsView.model';
import { CustomEditorManifestDrawer } from './subViews/customEditorManifestDrawer.subview';
import { InstallEditorDrawer } from './subViews/install-editor-drawer.subview.tsx';

export { createReleaseActions };

type InstallsViewProps = {
    installOpen?: boolean;
    onInstallOpenChange?: (open: boolean) => void;
};

/**
 * Renders installed editors and the editor catalog drawer.
 *
 * @param props - Optional controlled drawer state and its change action.
 * @returns The editor installs view.
 */
export const InstallsView: React.FC<InstallsViewProps> = ({
    installOpen: controlledInstallOpen,
    onInstallOpenChange,
}) => {
    const { t } = useTranslation(['installs', 'common', 'menus', 'dialogs']);
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
    const [customEditorMenuAnchorRect, setCustomEditorMenuAnchorRect] =
        useState<ActionMenuAnchorRect | null>(null);

    const { addAlert, addConfirm } = useAlerts();
    const { preferences } = usePreferences();
    const { projects } = useProjects();
    const {
        installedReleases,
        downloadingReleases,
        checkAllReleasesValid,
        reinstallRelease,
        registerCustomEngine,
        removeRelease,
        loading,
        hasError,
    } = useRelease();
    const {
        releaseActionsMenu,
        setReleaseActionsMenu,
        isReleaseActionBusy,
        onOpenReleaseMoreOptions,
        runReleaseAction,
        handleRemoveReleaseFromMenu,
        handleRetry,
        handleReinstall,
    } = useReleaseActions({
        t,
        addAlert,
        addConfirm,
        checkAllReleasesValid,
        reinstallRelease,
        removeRelease,
        getProjectUsageCount: (release) =>
            getEditorProjectUsageCount(release, projects),
    });
    const { registerManifest, handleAddCustomEngine } =
        useCustomEditorManifestWorkflow({
            t,
            selectingCustomEditorManifest,
            setSelectingCustomEditorManifest,
            addAlert,
            addConfirm,
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
            {selectingCustomEditorManifest && (
                <WaitingForDialogOverlay
                    className="z-20"
                    message={t('customEditor.waitingForDialog')}
                />
            )}
            <section
                className="flex flex-col h-full w-full overflow-auto p-1"
                aria-label={t('title')}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
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
                    selectManifestLabel={t(
                        'buttons.selectCustomEditorManifest',
                    )}
                    createManifestLabel={t(
                        'buttons.createCustomEditorManifest',
                    )}
                    installLabel={t('buttons.install')}
                    copyPathLabel={t('common:buttons.copyPath')}
                    copiedLabel={t('common:success')}
                    showControls={viewState !== 'empty'}
                    onSelectManifest={() => void handleAddCustomEngine()}
                    onCreateManifest={() =>
                        setCustomEditorManifestDrawerOpen(true)
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
                            setCustomEditorMenuAnchorRect(
                                getActionMenuAnchorRect(event.currentTarget),
                            )
                        }
                    />
                ) : (
                    <>
                        <div className="divider m-0"></div>
                        <InstalledReleaseList
                            rows={filteredRows}
                            t={t}
                            isReleaseActionBusy={isReleaseActionBusy}
                            onRetry={(release) => void handleRetry(release)}
                            onReinstall={(release) =>
                                void handleReinstall(release)
                            }
                            onRemove={handleRemoveReleaseFromMenu}
                            onOpenReleaseMoreOptions={onOpenReleaseMoreOptions}
                        />
                    </>
                )}
            </section>
            <ReleaseActionsMenu
                release={releaseActionsMenu?.release ?? null}
                anchorRect={releaseActionsMenu?.anchorRect ?? null}
                t={t}
                onClose={() => setReleaseActionsMenu(null)}
                onOpenInstalledFolder={(release) =>
                    runReleaseAction(() =>
                        appBridge.openShellFolder(release.install_path),
                    )
                }
                onStartProjectManager={(release) =>
                    runReleaseAction(() =>
                        editorInstallsBridge.openProjectManager(release),
                    )
                }
                onRemoveRelease={handleRemoveReleaseFromMenu}
            />
            <ActionMenu
                open={customEditorMenuAnchorRect !== null}
                anchorRect={customEditorMenuAnchorRect}
                ariaLabel={t('buttons.addCustomEditor')}
                items={[
                    {
                        key: 'select-manifest',
                        label: t('buttons.selectCustomEditorManifest'),
                        testId: 'btnEmptyStateSelectCustomEditorManifest',
                        onSelect: handleAddCustomEngine,
                    },
                    {
                        key: 'create-manifest',
                        label: t('buttons.createCustomEditorManifest'),
                        testId: 'btnEmptyStateCreateCustomEditorManifest',
                        onSelect: () => setCustomEditorManifestDrawerOpen(true),
                    },
                ]}
                onClose={() => setCustomEditorMenuAnchorRect(null)}
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
