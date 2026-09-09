import type { AppUpdateMessage } from '@shared/contracts';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LAUNCHER_DOWNLOAD_URL } from '../app.constants';

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

const bannerLinkClass = 'link link-primary';

/**
 * Keeps translated external-link text beside its trailing icon.
 * @param props - Translated label and existing link action.
 */
function UpdateExternalLink({
    children,
    onClick,
}: {
    children?: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            data-testid="btnAppUpdateManual"
            data-external-link=""
            onClick={onClick}
            className="link link-primary inline-flex items-center gap-1"
        >
            {children}
            <ExternalLink
                size={16}
                className="shrink-0 opacity-60"
                aria-hidden="true"
            />
        </button>
    );
}

/**
 * Renders the actions and message for the current update state.
 * @param props - Update details, callbacks and translation function.
 */
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
                            <UpdateExternalLink
                                onClick={() => openUpdateUrl(url)}
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

/**
 * Shows a soft update notice when the current state has content.
 * @param props - Update state and existing update actions.
 */
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
            role="status"
            className={`alert alert-soft m-2 gap-2 p-4 text-base ${props.updateAvailable?.type === 'error' ? 'alert-error text-error-content dark:text-error' : 'alert-info text-info-content dark:text-info'}`}
        >
            <div>{content}</div>
        </div>
    );
};
