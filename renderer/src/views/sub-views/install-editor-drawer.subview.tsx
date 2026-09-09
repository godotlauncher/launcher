import type { ReleaseSummary } from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentDivider } from '../../components/ui/content-divider.component';
import { CopyBadge } from '../../components/ui/copy-badge.component.tsx';
import { Drawer } from '../../components/ui/drawer/drawer.component.tsx';
import { useAlerts } from '../../hooks/alerts.hook.tsx';
import { usePreferences } from '../../hooks/preferences.hook.tsx';
import { useRelease } from '../../hooks/release.hook.tsx';
import {
    getInstallEditorRefreshCooldownSeconds,
    getInstallEditorRows,
    type InstallEditorChannel,
    type InstallEditorShow,
} from './install-editor/install-editor.model.ts';
import { InstallEditorAll } from './install-editor/install-editor-all.component.tsx';
import { InstallEditorFilters } from './install-editor/install-editor-filters.component.tsx';
import { InstallEditorLatest } from './install-editor/install-editor-latest.component.tsx';

type InstallEditorDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const catalogRefreshCooldownMs = 60_000;

/**
 * Renders the editor catalogue with shared drawer typography and compact controls.
 *
 * @param props - The controlled drawer state and its change action.
 * @returns The editor catalog drawer.
 */
export const InstallEditorDrawer: React.FC<InstallEditorDrawerProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation(['installEditor', 'common', 'menus']);
    const { preferences } = usePreferences();
    const { addAlert } = useAlerts();
    const [show, setShow] = useState<InstallEditorShow>('latest');
    const [channel, setChannel] = useState<InstallEditorChannel>('stable');
    const [search, setSearch] = useState('');
    const [refreshAvailableAt, setRefreshAvailableAt] = useState<number | null>(
        null,
    );
    const [refreshCooldownSeconds, setRefreshCooldownSeconds] = useState(0);
    const shownCatalogErrorRef = useRef<string | undefined>(undefined);
    const {
        availableReleases,
        availablePrereleases,
        loading,
        hasError,
        refreshAvailableReleases,
        installRelease,
        reinstallRelease,
        getInstalledRelease,
    } = useRelease();

    useEffect(() => {
        if (!open) {
            return;
        }

        setShow('latest');
        setChannel('stable');
        setSearch('');
    }, [open]);

    useEffect(() => {
        if (refreshAvailableAt === null) {
            return;
        }

        /**
         * Updates the visible cooldown from the current time.
         *
         * @returns Nothing.
         */
        const updateCooldown = (): void => {
            const seconds = getInstallEditorRefreshCooldownSeconds(
                refreshAvailableAt,
                Date.now(),
            );
            setRefreshCooldownSeconds(seconds);

            if (seconds === 0) {
                setRefreshAvailableAt(null);
            }
        };

        updateCooldown();
        const intervalId = window.setInterval(updateCooldown, 1000);

        return () => window.clearInterval(intervalId);
    }, [refreshAvailableAt]);

    const rows = useMemo(
        () =>
            getInstallEditorRows({
                show,
                channel,
                availableReleases,
                availablePrereleases,
                search,
            }),
        [show, channel, availableReleases, availablePrereleases, search],
    );
    const hasCatalogData =
        availableReleases.length > 0 || availablePrereleases.length > 0;

    useEffect(() => {
        if (!hasError) {
            shownCatalogErrorRef.current = undefined;
            return;
        }

        if (!open || shownCatalogErrorRef.current === hasError) {
            return;
        }

        shownCatalogErrorRef.current = hasError;
        addAlert(
            t('errors.catalogUpdateTitle'),
            hasCatalogData
                ? t('errors.catalogUpdateCached')
                : t('errors.catalogLoadFailed'),
            <TriangleAlert className="inline text-warning" />,
        );
    }, [addAlert, hasCatalogData, hasError, open, t]);

    /**
     * Refreshes the catalog and starts the reload button cooldown.
     *
     * @returns Nothing.
     */
    const handleCatalogRefresh = (): void => {
        setRefreshCooldownSeconds(catalogRefreshCooldownMs / 1000);
        setRefreshAvailableAt(Date.now() + catalogRefreshCooldownMs);
        void refreshAvailableReleases();
    };

    /**
     * Shows an install error in the existing global alert area.
     *
     * @param message - The error message to show.
     * @returns Nothing.
     */
    const showInstallError = (message: string): void => {
        addAlert(
            t('common:error'),
            message,
            <TriangleAlert className="inline text-error" />,
        );
    };

    /**
     * Installs one release variant through the existing release provider.
     *
     * @param release - The release to install.
     * @param mono - Whether to install the .NET variant.
     * @returns A promise that ends when the install request finishes.
     */
    const handleInstall = async (
        release: ReleaseSummary,
        mono: boolean,
    ): Promise<void> => {
        const result = await installRelease(release, mono, 'installs');
        if (!result.success && !result.cancelled) {
            showInstallError(result.error || t('messages.installError'));
        }
    };

    /**
     * Reinstalls one unavailable installed editor.
     *
     * @param release - The catalog release to reinstall.
     * @param mono - Whether to reinstall the .NET variant.
     * @returns A promise that ends when the reinstall request finishes.
     */
    const handleReinstall = async (
        release: ReleaseSummary,
        mono: boolean,
    ): Promise<void> => {
        const installedRelease = getInstalledRelease(release.version, mono);
        if (!installedRelease) {
            return;
        }

        const result = await reinstallRelease(installedRelease);
        if (!result.success && !result.cancelled) {
            showInstallError(result.error || t('messages.reinstallError'));
        }
    };

    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            side="right"
            width={700}
            testId="installEditorDrawer"
            ariaLabel={t('title')}
        >
            <Drawer.Header className="items-start">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <Drawer.Title className="text-lg font-semibold">
                        {t('title')}
                    </Drawer.Title>
                    {preferences?.install_location && (
                        <CopyBadge
                            value={preferences.install_location}
                            label={t('common:buttons.copyPath')}
                            copiedLabel={t('common:success')}
                            className="-ml-3 max-w-full"
                        />
                    )}
                </div>
                <Drawer.CloseButton
                    className="btn-sm"
                    data-testid="btnCloseInstallEditor"
                    aria-label={t('menus:app.close')}
                />
            </Drawer.Header>

            <Drawer.Body
                scrollable={false}
                className="flex min-h-0 flex-col gap-2 text-base"
            >
                <InstallEditorFilters
                    show={show}
                    channel={channel}
                    loading={loading}
                    refreshCooldownSeconds={refreshCooldownSeconds}
                    showLabel={t('filters.show')}
                    latestLabel={t('filters.latest')}
                    allLabel={t('filters.all')}
                    channelLabel={t('filters.channel')}
                    stableLabel={t('filters.stable')}
                    prereleaseLabel={t('tabs.prerelease')}
                    refreshLabel={t('buttons.reload')}
                    loadingLabel={t('catalog.loading')}
                    cooldownLabel={t('catalog.cooldown', {
                        seconds: refreshCooldownSeconds,
                    })}
                    cooldownTooltip={t('catalog.cooldownTooltip')}
                    onShowChange={setShow}
                    onChannelChange={setChannel}
                    onRefresh={handleCatalogRefresh}
                />

                <ContentDivider />

                <div className="min-h-0 flex-1">
                    {loading && !hasCatalogData ? (
                        <div
                            className="flex h-full items-center justify-center gap-2 text-base-content/75"
                            role="status"
                        >
                            <span
                                className="loading loading-spinner loading-sm"
                                aria-hidden="true"
                            />
                            {t('catalog.loading')}
                        </div>
                    ) : show === 'latest' ? (
                        rows.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-base-content/75">
                                {t('catalog.empty')}
                            </div>
                        ) : (
                            <InstallEditorLatest
                                channel={channel}
                                releases={rows}
                                onInstall={handleInstall}
                                onReinstall={handleReinstall}
                            />
                        )
                    ) : (
                        <InstallEditorAll
                            channel={channel}
                            releases={rows}
                            search={search}
                            searchPlaceholder={t('search.placeholder')}
                            emptyLabel={t('catalog.empty')}
                            onSearchChange={setSearch}
                            onInstall={handleInstall}
                            onReinstall={handleReinstall}
                        />
                    )}
                </div>
            </Drawer.Body>
        </Drawer>
    );
};
