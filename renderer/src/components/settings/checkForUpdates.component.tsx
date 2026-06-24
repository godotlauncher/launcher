import type { ChangeEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LAUNCHER_GITHUB_RELEASES_URL } from '../../constants';
import { useApp } from '../../hooks/useApp';
import { usePreferences } from '../../hooks/usePreferences';

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
        await window.electron.openExternal(
            updateAvailable?.url ?? LAUNCHER_GITHUB_RELEASES_URL,
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1 data-testid="updatesSettingsHeader" className="font-bold">
                    {t('updates.title')}
                </h1>
                <p data-testid="updateSettingsSubHeader" className="text-sm">
                    {t('updates.description')}
                </p>
            </div>
            <div className=" flex flex-col gap-8">
                <div className="flex flex-row gap-4">
                    <div className="flex flex-row shrink items-center justify-start gap-4 ">
                        <input
                            data-testid="chkAutoCheckUpdatesCheckbox"
                            onChange={setAutoCheckUpdates}
                            type="checkbox"
                            checked={preferences?.auto_check_updates}
                            className="checkbox"
                        />
                        <span className="">{t('updates.autoCheck')}</span>
                    </div>
                </div>
                <div className="flex flex-row gap-4">
                    <div className="flex flex-row shrink items-center justify-start gap-4 ">
                        <input
                            data-testid="chkReceiveBetaUpdates"
                            onChange={toggleBetaUpdates}
                            type="checkbox"
                            checked={preferences?.receive_beta_updates ?? false}
                            className="checkbox"
                        />
                        <div>
                            <span className="">{t('updates.betaChannel')}</span>
                            <p className="text-xs text-muted">
                                {t('updates.betaChannelDescription')}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-4 ">
                    <div>{updateAvailable?.message}</div>

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-row flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => checkForAppUpdates()}
                                className="btn btn-primary"
                            >
                                {t('updates.checkNow')}
                            </button>
                            {updateAvailable?.type === 'available' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => downloadAppUpdate()}
                                        className="btn btn-secondary"
                                    >
                                        {t('updates.downloadNow')}
                                    </button>
                                    {updateAvailable.version && (
                                        <button
                                            type="button"
                                            onClick={handleSkipVersion}
                                            className="btn btn-ghost"
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
                                        className="btn btn-ghost"
                                    >
                                        {t('updates.skipVersion')}
                                    </button>
                                )}
                            {preferences?.skipped_app_update_version && (
                                <button
                                    type="button"
                                    onClick={handleUnskipVersion}
                                    className="btn btn-ghost"
                                >
                                    {t('updates.unskipVersion')}
                                </button>
                            )}
                        </div>

                        {updateAvailable &&
                            updateAvailable?.type === 'ready' && (
                                <div className="gap-2 p-4 m-2 text-sm text-info rounded-xl bg-base-200">
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
                                                        className="underline cursor-pointer hover:no-underline"
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
                                                        className="underline cursor-pointer hover:no-underline"
                                                    />
                                                ),
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                        {updateAvailable &&
                            updateAvailable?.type === 'manual' && (
                                <div className="gap-2 p-4 m-2 text-sm text-info rounded-xl bg-base-200">
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
                                                <button
                                                    type="button"
                                                    onClick={
                                                        openManualUpdateUrl
                                                    }
                                                    className="underline cursor-pointer hover:no-underline"
                                                />
                                            ),
                                        }}
                                    />
                                </div>
                            )}
                    </div>
                </div>
            </div>
        </div>
    );
};
