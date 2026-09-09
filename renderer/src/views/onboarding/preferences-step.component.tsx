import { Info, TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { OverlayTitle } from '../../components/ui/overlay-title.component';

type PostLaunchAction = 'none' | 'minimize' | 'close_to_tray';
type TrayAvailabilityState = 'available' | 'unavailable' | 'unknown';

type PreferencesStepProps = {
    platform: string;
    postLaunchAction: PostLaunchAction;
    autoStart: boolean;
    startInTray: boolean;
    trayAvailability: TrayAvailabilityState;
    pending: boolean;
    onPostLaunchActionChange: (action: PostLaunchAction) => void;
    onAutoStartChange: (enabled: boolean) => void;
    onStartInTrayChange: (enabled: boolean) => void;
};

export const PreferencesStep: React.FC<PreferencesStepProps> = ({
    platform,
    postLaunchAction,
    autoStart,
    startInTray,
    trayAvailability,
    pending,
    onPostLaunchActionChange,
    onAutoStartChange,
    onStartInTrayChange,
}) => {
    const { t } = useTranslation(['welcome', 'settings']);
    const trayConfirmed = trayAvailability === 'available';
    const options: Array<{
        value: PostLaunchAction;
        label: string;
        description: string;
    }> = [
        {
            value: 'none',
            label: t('welcome:onboarding.preferences.keepOpen'),
            description: t('welcome:onboarding.preferences.keepOpenHelp'),
        },
        {
            value: 'minimize',
            label: t('settings:behavior.projectLaunch.minimize'),
            description: t('welcome:onboarding.preferences.minimizeHelp'),
        },
        {
            value: 'close_to_tray',
            label: t('settings:behavior.projectLaunch.closeToTray'),
            description: t('welcome:onboarding.preferences.closeToTrayHelp'),
        },
    ];

    return (
        <div className="flex max-w-3xl flex-col gap-5">
            <div className="flex flex-col gap-2">
                <OverlayTitle
                    as="h1"
                    data-testid="onboarding-step-heading"
                    className="text-[20px] font-semibold"
                >
                    {t('welcome:onboarding.preferences.title')}
                </OverlayTitle>
                <p>{t('welcome:onboarding.preferences.description')}</p>
            </div>

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-base font-semibold">
                    {t('welcome:onboarding.preferences.afterLaunching')}
                </legend>
                {options.map((option) => (
                    <label
                        key={option.value}
                        className="flex min-h-14 items-start gap-3 rounded-md px-3 py-2 hover:bg-base-content/5"
                    >
                        <input
                            type="radio"
                            name="onboarding-post-launch-action"
                            value={option.value}
                            checked={postLaunchAction === option.value}
                            onChange={() =>
                                onPostLaunchActionChange(option.value)
                            }
                            className="radio radio-sm mt-1"
                            disabled={pending}
                        />
                        <span className="flex flex-col gap-0.5">
                            <span>{option.label}</span>
                            <span className="text-base-content/75">
                                {option.description}
                            </span>
                            {option.value === 'close_to_tray' &&
                                !trayConfirmed && (
                                    <span className="text-warning">
                                        {t(
                                            'welcome:onboarding.preferences.closeToTrayFallback',
                                        )}
                                    </span>
                                )}
                        </span>
                    </label>
                ))}
            </fieldset>

            {!trayConfirmed && (
                <div
                    className="alert alert-warning alert-soft text-base text-warning-content dark:text-warning flex flex-row items-start gap-2 py-3"
                    role="status"
                >
                    <TriangleAlert
                        className="mt-0.5 size-5 shrink-0"
                        aria-hidden="true"
                    />
                    <span className="min-w-0">
                        {t('welcome:onboarding.preferences.trayUnavailable')}
                    </span>
                </div>
            )}

            <div className="pt-4">
                <h2 className="text-base font-semibold">
                    {t('welcome:onboarding.preferences.startupTitle')}
                </h2>
                {platform === 'linux' ? (
                    <div className="mt-2 flex items-start gap-2 px-3 py-2">
                        <Info
                            size={17}
                            className="mt-0.5 shrink-0 text-warning"
                            aria-hidden="true"
                        />
                        <span>
                            {t('settings:behavior.autoStart.linuxWarning')}
                        </span>
                    </div>
                ) : (
                    <div className="mt-2 flex flex-col gap-1">
                        <label className="flex min-h-10 items-center gap-3 px-2">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={autoStart}
                                onChange={(event) =>
                                    onAutoStartChange(
                                        event.currentTarget.checked,
                                    )
                                }
                                disabled={pending}
                            />
                            <span>
                                {t(
                                    'welcome:onboarding.preferences.startWithComputer',
                                )}
                            </span>
                        </label>
                        <label className="ml-8 flex min-h-10 items-center gap-3 px-2">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={startInTray}
                                onChange={(event) =>
                                    onStartInTrayChange(
                                        event.currentTarget.checked,
                                    )
                                }
                                disabled={pending || !autoStart}
                            />
                            <span className={!autoStart ? '' : undefined}>
                                {t(
                                    'welcome:onboarding.preferences.startInTray',
                                )}
                            </span>
                            {!trayConfirmed && autoStart && startInTray && (
                                <span className="text-warning">
                                    {t(
                                        'welcome:onboarding.preferences.startInTrayFallback',
                                    )}
                                </span>
                            )}
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
};
