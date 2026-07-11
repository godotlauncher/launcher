import type { InstalledRelease, ReleaseSummary } from '@shared';
import { TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../hooks/useAlerts';
import { usePreferences } from '../../hooks/usePreferences';
import { useRelease } from '../../hooks/useRelease';
import { InstallEditorHeader } from './installEditor/components/installEditorHeader.component';
import { InstallEditorReleasePanel } from './installEditor/components/installEditorReleasePanel.component';
import { InstallEditorTabs } from './installEditor/components/installEditorTabs.component';
import {
    buildInstallEditorInstalledRows,
    countInstalledReleasesByPrerelease,
    filterAvailableEditorRows,
    filterInstallEditorInstalledRows,
    hasDownloadingReleasesByPrerelease,
    type InstallEditorTab,
} from './installEditor/installEditor.model';

type SubviewProps = {
    onClose: () => void;
};

export const InstallEditorSubView: React.FC<SubviewProps> = ({ onClose }) => {
    const { t } = useTranslation('installEditor');
    const { preferences } = usePreferences();
    const [textSearch, setTextSearch] = useState<string>('');
    const [tab, setTab] = useState<InstallEditorTab>('RELEASE');
    const [filterInstalled, setFilterInstalled] = useState<boolean>(false);
    const {
        installedReleases,
        downloadingReleases,
        installRelease,
        availableReleases,
        availablePrereleases,
        loading,
        hasError,
        refreshAvailableReleases,
        getInstalledRelease,
        removeRelease,
        reinstallRelease,
        checkAllReleasesValid,
    } = useRelease();

    const { addAlert } = useAlerts();
    const lastShownRefreshError = useRef<string | undefined>(undefined);
    const showInstallError = (message: string) => {
        addAlert(
            t('common:error', { ns: 'common' }),
            message,
            <TriangleAlertIcon className="inline text-error" />,
        );
    };

    useEffect(() => {
        if (!hasError) {
            lastShownRefreshError.current = undefined;
            return;
        }

        if (lastShownRefreshError.current === hasError) {
            return;
        }

        lastShownRefreshError.current = hasError;
        addAlert(t('errors.fetchError'), hasError);
    }, [addAlert, hasError, t]);

    const installReleaseRequest = async (
        release: ReleaseSummary,
        mono: boolean,
    ) => {
        const result = await installRelease(release, mono);

        if (result.success) {
            await refreshAvailableReleases();
        } else {
            showInstallError(result.error || t('messages.installError'));
        }
    };

    const reinstallReleaseRequest = async (
        release: ReleaseSummary,
        mono: boolean,
    ) => {
        const installedRelease = getInstalledRelease(release.version, mono);
        if (!installedRelease) {
            return;
        }

        const result = await reinstallRelease(installedRelease);
        if (!result.success) {
            showInstallError(result.error || t('messages.reinstallError'));
        }
    };

    const onRetryValidation = async () => {
        await checkAllReleasesValid();
    };

    const onRemove = async (release: InstalledRelease) => {
        await removeRelease(release);
    };

    const onReinstall = async (release: InstalledRelease) => {
        const result = await reinstallRelease(release);
        if (!result.success) {
            showInstallError(result.error || t('messages.reinstallError'));
        }
    };

    const installedRows = useMemo(
        () =>
            filterInstallEditorInstalledRows(
                buildInstallEditorInstalledRows(
                    installedReleases,
                    downloadingReleases,
                ),
                textSearch,
            ),
        [installedReleases, downloadingReleases, textSearch],
    );

    const availableRows = useMemo(
        () =>
            filterAvailableEditorRows({
                tab,
                availableReleases,
                availablePrereleases,
                filterInstalled,
                textSearch,
                getInstalledRelease,
            }),
        [
            tab,
            availableReleases,
            availablePrereleases,
            filterInstalled,
            textSearch,
            getInstalledRelease,
        ],
    );

    return (
        <>
            <div className="absolute inset-0 w-full h-full p-4 bg-black/80 z-10"></div>
            <div className="absolute inset-0 px-8 pb-8 flex flex-col w-full h-full overflow-hidden items-center z-20">
                <div className="flex flex-col p-4 rounded-b-lg overflow-hidden bg-base-300  min-w-[900px]">
                    <InstallEditorHeader
                        title={t('title')}
                        installLocation={preferences?.install_location}
                        searchPlaceholder={t('search.placeholder')}
                        searchValue={textSearch}
                        onSearchChange={setTextSearch}
                        onClose={onClose}
                    />
                    <InstallEditorTabs
                        tab={tab}
                        releaseInstalledCount={countInstalledReleasesByPrerelease(
                            installedReleases,
                            false,
                        )}
                        prereleaseInstalledCount={countInstalledReleasesByPrerelease(
                            installedReleases,
                            true,
                        )}
                        releaseDownloading={hasDownloadingReleasesByPrerelease(
                            downloadingReleases,
                            false,
                        )}
                        prereleaseDownloading={hasDownloadingReleasesByPrerelease(
                            downloadingReleases,
                            true,
                        )}
                        filterInstalled={filterInstalled}
                        releasedLabel={t('tabs.released')}
                        prereleaseLabel={t('tabs.prerelease')}
                        showInstalledOnlyLabel={t('filters.showInstalledOnly')}
                        reloadLabel={t('buttons.reload')}
                        onTabChange={setTab}
                        onFilterInstalledChange={setFilterInstalled}
                        onRefresh={() => void refreshAvailableReleases()}
                    />
                    <div className="divider my-2"></div>
                    <InstallEditorReleasePanel
                        loading={loading}
                        tab={tab}
                        availableRows={availableRows}
                        installedRows={installedRows}
                        onInstall={installReleaseRequest}
                        onReinstallAvailable={reinstallReleaseRequest}
                        onRetryValidation={onRetryValidation}
                        onReinstallInstalled={onReinstall}
                        onRemove={onRemove}
                    />
                </div>
            </div>
        </>
    );
};
