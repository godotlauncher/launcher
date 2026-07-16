import type { AppUpdateMessage } from '@shared/contracts';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LAUNCHER_DOWNLOAD_URL } from '../constants';

type AppUpdateBannerProps = {
    updateAvailable: AppUpdateMessage | undefined;
    installAndRelaunch: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    skipAppUpdate: (version: string) => Promise<void>;
    openUpdateUrl: (url: string) => Promise<void>;
};

type AppUpdateBannerContentProps = AppUpdateBannerProps & {
    t: (key: string) => string;
};

const bannerLinkClass = 'underline cursor-pointer hover:no-underline';

export function getAppUpdateBannerContent({
    updateAvailable,
    installAndRelaunch,
    downloadAppUpdate,
    skipAppUpdate,
    openUpdateUrl,
    t,
}: AppUpdateBannerContentProps): ReactNode {
    if (!updateAvailable) {
        return null;
    }

    switch (updateAvailable.type) {
        case 'available':
            if (updateAvailable.version) {
                const version = updateAvailable.version;
                return (
                    <Trans
                        ns="common"
                        i18nKey="app.update.availableWithVersion"
                        values={{ version }}
                        components={{
                            DownloadButton: (
                                <button
                                    data-testid="btnAppUpdateDownload"
                                    type="button"
                                    onClick={downloadAppUpdate}
                                    className={bannerLinkClass}
                                />
                            ),
                            SkipButton: (
                                <button
                                    data-testid="btnAppUpdateSkip"
                                    type="button"
                                    onClick={() => skipAppUpdate(version)}
                                    className={bannerLinkClass}
                                />
                            ),
                        }}
                    />
                );
            }

            return (
                <Trans
                    ns="common"
                    i18nKey="app.update.availableNoVersion"
                    components={{
                        DownloadButton: (
                            <button
                                data-testid="btnAppUpdateDownload"
                                type="button"
                                onClick={downloadAppUpdate}
                                className={bannerLinkClass}
                            />
                        ),
                    }}
                />
            );

        case 'downloading':
            return updateAvailable.message ?? null;

        case 'ready':
            if (updateAvailable.version) {
                return (
                    <Trans
                        ns="common"
                        i18nKey="app.update.readyWithVersion"
                        values={{ version: updateAvailable.version }}
                        components={{
                            RestartButton: (
                                <button
                                    data-testid="btnAppUpdateRestart"
                                    type="button"
                                    onClick={installAndRelaunch}
                                    className={bannerLinkClass}
                                />
                            ),
                        }}
                    />
                );
            }

            return (
                <Trans
                    ns="common"
                    i18nKey="app.update.readyNoVersion"
                    components={{
                        RestartButton: (
                            <button
                                data-testid="btnAppUpdateRestart"
                                type="button"
                                onClick={installAndRelaunch}
                                className={bannerLinkClass}
                            />
                        ),
                    }}
                />
            );

        case 'manual': {
            const version = updateAvailable.version;
            const url = updateAvailable.url ?? LAUNCHER_DOWNLOAD_URL;
            return (
                <Trans
                    ns="common"
                    i18nKey={
                        version
                            ? 'app.update.manualWithVersion'
                            : 'app.update.manualNoVersion'
                    }
                    values={{ version }}
                    components={{
                        ReleaseLink: (
                            <button
                                data-testid="btnAppUpdateManual"
                                type="button"
                                onClick={() => openUpdateUrl(url)}
                                className={bannerLinkClass}
                            />
                        ),
                        ...(version
                            ? {
                                  SkipButton: (
                                      <button
                                          data-testid="btnAppUpdateManualSkip"
                                          type="button"
                                          onClick={() => skipAppUpdate(version)}
                                          className={bannerLinkClass}
                                      />
                                  ),
                              }
                            : {}),
                    }}
                />
            );
        }

        case 'error':
            return (
                <>
                    {updateAvailable.message}{' '}
                    <button
                        data-testid="btnAppUpdateRetry"
                        type="button"
                        onClick={downloadAppUpdate}
                        className={bannerLinkClass}
                    >
                        {t('buttons.retry')}
                    </button>
                </>
            );

        case 'checking':
        case 'none':
            return null;
    }
}

export const AppUpdateBanner: React.FC<AppUpdateBannerProps> = (props) => {
    const { t } = useTranslation('common');
    const content = getAppUpdateBannerContent({
        ...props,
        t: (key: string) => t(key),
    });

    if (!content) {
        return null;
    }

    return (
        <div
            data-testid="appUpdateBanner"
            className="gap-2 p-4 m-2 text-sm text-info rounded-xl bg-base-200"
        >
            {content}
        </div>
    );
};
