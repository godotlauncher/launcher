import { ExternalLink } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LAUNCHER_DOWNLOAD_URL } from '../../app.constants';
import { useApp } from '../../hooks/app.hook';
import { usePreferences } from '../../hooks/preferences.hook';
import { appBridge } from '../../renderer.bridge.ts';
import { SettingsSection } from './settings-section.component';

/** Renders update preferences and available update actions with shared settings styling. */
export const CheckForUpdates: React.FC = () => {
    const { t } = useTranslation('settings');

    const {
        updateAvailable,
        installAndRelaunch,
        checkForAppUpdates,
        downloadAppUpdate,
        skipAppUpdate,
        unskipAppUpdate,
    } = useApp();
    const {
        preferences,
        setAutoUpdates,
        setReceiveBetaUpdates,
        loadPreferences,
    } = usePreferences();

    const setAutoCheckUpdates = async (e: ChangeEvent<HTMLInputElement>) => {
        await setAutoUpdates(e.currentTarget.checked);
    };

    const toggleBetaUpdates = async (e: ChangeEvent<HTMLInputElement>) => {
        await setReceiveBetaUpdates(e.currentTarget.checked);
    };

    const handleSkipVersion = async () => {
        if (!updateAvailable?.version) {
            return;
        }

        await skipAppUpdate(updateAvailable.version);
        await loadPreferences();
    };

    const handleUnskipVersion = async () => {
        await unskipAppUpdate();
        await loadPreferences();
    };

    const openManualUpdateUrl = async () => {
        await appBridge.openExternal(
            updateAvailable?.url ?? LAUNCHER_DOWNLOAD_URL,
        );
    };

    return (
        <SettingsSection
            title={t('updates.title')}
            description={t('updates.description')}
            titleTestId="updatesSettingsHeader"
            descriptionTestId="updateSettingsSubHeader"
        >
            <div className="flex flex-col gap-[24px]">
                <div className="flex flex-col gap-[8px]">
                    <label className="flex min-h-8 items-center gap-2">
                        <input
                            data-testid="chkAutoCheckUpdatesCheckbox"
                            onChange={setAutoCheckUpdates}
                            type="checkbox"
                            checked={preferences?.auto_check_updates}
                            className="checkbox checkbox-sm"
                        />
                        <span>{t('updates.autoCheck')}</span>
                    </label>
                    <label className="flex items-start gap-2">
                        <input
                            data-testid="chkReceiveBetaUpdates"
                            onChange={toggleBetaUpdates}
                            type="checkbox"
                            checked={preferences?.receive_beta_updates ?? false}
                            className="checkbox checkbox-sm mt-1"
                        />
                        <span className="flex flex-col gap-[4px]">
                            <span className="flex min-h-8 items-center">
                                {t('updates.betaChannel')}
                            </span>
                            <span className="text-base-content/75">
                                {t('updates.betaChannelDescription')}
                            </span>
                        </span>
                    </label>
                </div>
                <div className="flex flex-col gap-4">
                    {updateAvailable?.message && (
                        <div role="status">{updateAvailable.message}</div>
                    )}

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-row flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => checkForAppUpdates()}
                                className={
                                    updateAvailable?.type === 'available'
                                        ? 'btn btn-ghost text-base'
                                        : 'btn btn-primary text-base'
                                }
                            >
                                {t('updates.checkNow')}
                            </button>
                            {updateAvailable?.type === 'available' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => downloadAppUpdate()}
                                        className="btn btn-primary text-base"
                                    >
                                        {t('updates.downloadNow')}
                                    </button>
                                    {updateAvailable.version && (
                                        <button
                                            type="button"
                                            onClick={handleSkipVersion}
                                            className="btn btn-ghost text-base"
                                        >
                                            {t('updates.skipVersion')}
                                        </button>
                                    )}
                                </>
                            )}
                            {updateAvailable?.type === 'manual' &&
                                updateAvailable.version && (
                                    <button
                                        type="button"
                                        onClick={handleSkipVersion}
                                        className="btn btn-ghost text-base"
                                    >
                                        {t('updates.skipVersion')}
                                    </button>
                                )}
                            {preferences?.skipped_app_update_version && (
                                <button
                                    type="button"
                                    onClick={handleUnskipVersion}
                                    className="btn btn-ghost text-base"
                                >
                                    {t('updates.unskipVersion')}
                                </button>
                            )}
                        </div>

                        {updateAvailable &&
                            updateAvailable?.type === 'ready' && (
                                <div className="alert alert-info alert-soft">
                                    {updateAvailable?.version ? (
                                        <Trans
                                            ns="settings"
                                            i18nKey="updates.readyWithVersion"
                                            values={{
                                                version:
                                                    updateAvailable.version,
                                            }}
                                            components={{
                                                Button: (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            installAndRelaunch()
                                                        }
                                                        className="link link-primary"
                                                    />
                                                ),
                                            }}
                                        />
                                    ) : (
                                        <Trans
                                            ns="settings"
                                            i18nKey="updates.readyNoVersion"
                                            components={{
                                                Button: (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            installAndRelaunch()
                                                        }
                                                        className="link link-primary"
                                                    />
                                                ),
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                        {updateAvailable &&
                            updateAvailable?.type === 'manual' && (
                                <div className="alert alert-info alert-soft">
                                    <Trans
                                        ns="settings"
                                        i18nKey={
                                            updateAvailable.version
                                                ? 'updates.manualWithVersion'
                                                : 'updates.manualNoVersion'
                                        }
                                        values={{
                                            version: updateAvailable.version,
                                        }}
                                        components={{
                                            Button: (
                                                <ManualUpdateLink
                                                    onClick={
                                                        openManualUpdateUrl
                                                    }
                                                />
                                            ),
                                        }}
                                    />
                                </div>
                            )}
                    </div>
                </div>
            </div>
        </SettingsSection>
    );
};

/**
 * Keeps the translated manual-download label beside its external-link icon.
 * @param props - Translated link text and external navigation callback.
 * @returns A link-styled button for manual downloads.
 */
function ManualUpdateLink({
    children,
    onClick,
}: React.PropsWithChildren<{ onClick: () => Promise<void> }>) {
    return (
        <button
            type="button"
            data-external-link=""
            onClick={onClick}
            className="link link-primary inline-flex items-center gap-1"
        >
            {children}
            <ExternalLink
                className="size-3.5 shrink-0 opacity-45"
                aria-hidden="true"
            />
        </button>
    );
}
