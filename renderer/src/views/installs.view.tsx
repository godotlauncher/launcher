import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { appBridge } from '../bridge.ts';
import { WaitingForDialogOverlay } from '../components/waitingForDialogOverlay.component';
import { useAlerts } from '../hooks/useAlerts';
import { usePreferences } from '../hooks/usePreferences';
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
import { getFilteredInstalledReleaseRows } from './installs/installsView.model';
import { CustomEditorManifestDrawer } from './subViews/customEditorManifestDrawer.subview';
import { InstallEditorSubView } from './subViews/installEditor.subview';

export { createReleaseActions };

type InstallsViewProps = {
    installOpen?: boolean;
    onInstallOpenChange?: (open: boolean) => void;
};

export const InstallsView: React.FC<InstallsViewProps> = ({
    installOpen: controlledInstallOpen,
    onInstallOpenChange,
}) => {
    const { t } = useTranslation(['installs', 'common', 'menus', 'dialogs']);
    const [textSearch, setTextSearch] = useState<string>('');
    const [localInstallOpen, setLocalInstallOpen] = useState<boolean>(false);
    const installOpen = controlledInstallOpen ?? localInstallOpen;
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

    const { addAlert, addConfirm } = useAlerts();
    const { preferences } = usePreferences();
    const {
        installedReleases,
        downloadingReleases,
        checkAllReleasesValid,
        reinstallRelease,
        registerCustomEngine,
        removeRelease,
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
        handleRemove,
    } = useReleaseActions({
        t,
        addAlert,
        addConfirm,
        checkAllReleasesValid,
        reinstallRelease,
        removeRelease,
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
                    onSelectManifest={() => void handleAddCustomEngine()}
                    onCreateManifest={() =>
                        setCustomEditorManifestDrawerOpen(true)
                    }
                    onInstall={() => setInstallOpen(true)}
                />
                <div className="divider m-0"></div>

                {installedReleases.length < 1 &&
                downloadingReleases.length < 1 ? (
                    <div className="text-warning flex gap-2">
                        <TriangleAlert className="stroke-warning" />
                        <Trans
                            ns="installs"
                            i18nKey="messages.noReleasesCta"
                            components={{
                                Link: (
                                    <button
                                        type="button"
                                        onClick={() => setInstallOpen(true)}
                                        className="underline cursor-pointer"
                                    />
                                ),
                            }}
                        />
                    </div>
                ) : (
                    <InstalledReleaseList
                        rows={filteredRows}
                        t={t}
                        isReleaseActionBusy={isReleaseActionBusy}
                        onRetry={(release) => void handleRetry(release)}
                        onReinstall={(release) => void handleReinstall(release)}
                        onRemove={(release) => void handleRemove(release)}
                        onOpenReleaseMoreOptions={onOpenReleaseMoreOptions}
                    />
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
                        appBridge.openEditorProjectManager(release),
                    )
                }
                onRemoveRelease={handleRemoveReleaseFromMenu}
            />
            {installOpen && (
                <InstallEditorSubView onClose={() => setInstallOpen(false)} />
            )}
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
