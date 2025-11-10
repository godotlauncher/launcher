import clsx from 'clsx';
import log from 'electron-log/renderer';
import type React from 'react';
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserPreferences } from '../../types';
import { WindowsSymlinkSetting } from '../components/settings/WindowsSymlinkSetting.component';
import { CustomizeBehaviorStep } from '../components/welcomeSteps/CustomizeBehaviorStep';
import { CurrentSettingsStep } from '../components/welcomeSteps/currentSettingsStep';
import { LinuxStep } from '../components/welcomeSteps/linuxStep';
import { MacOSStep } from '../components/welcomeSteps/macosStep';
import { SetLocationStep } from '../components/welcomeSteps/SetLocationStep';
import { StartStep } from '../components/welcomeSteps/StartStep';
import { WindowsStep } from '../components/welcomeSteps/WindowsStep';
import { WelcomeStep } from '../components/welcomeSteps/welcomeStep';
import { usePreferences } from '../hooks/usePreferences';

interface StepDetails {
    title: string;
    nextButton: string;
    prevButton: string;
    component: JSX.Element;
}

export const WelcomeView: React.FC = () => {
    const { t } = useTranslation('welcome');

    const [stepIndex, setStepIndex] = useState<number | undefined>(() => {
        const storedStepIndex = localStorage?.getItem('stepIndex');
        if (storedStepIndex) {
            return parseInt(storedStepIndex, 10);
        }
        return 0;
    });

    const { updatePreferences, platform } = usePreferences();

    const macSteps: StepDetails[] = useMemo(
        () => [
            {
                title: t('steps.welcome'),
                nextButton: t('navigation.nextMacOS'),
                prevButton: '',
                component: <WelcomeStep />,
            },
            {
                title: t('steps.macos'),
                nextButton: t('navigation.nextCurrentSettings'),
                prevButton: t('navigation.backWelcome'),
                component: <MacOSStep />,
            },
            {
                title: t('steps.currentSettings'),
                nextButton: t('navigation.nextSetLocations'),
                prevButton: t('navigation.backMacOS'),
                component: (
                    <CurrentSettingsStep onSkip={() => setStepIndex(4)} />
                ),
            },
            {
                title: t('steps.setLocations'),
                nextButton: t('navigation.nextCustomizeBehavior'),
                prevButton: t('navigation.backCurrentSettings'),
                component: <SetLocationStep />,
            },
            {
                title: t('steps.customizeBehavior'),
                nextButton: t('navigation.nextReady'),
                prevButton: t('navigation.backSetLocations'),
                component: <CustomizeBehaviorStep />,
            },
            {
                title: t('steps.ready'),
                nextButton: t('navigation.start'),
                prevButton: t('navigation.backCustomizeBehavior'),
                component: <StartStep />,
            },
        ],
        [t],
    );

    const winSteps: StepDetails[] = useMemo(
        () => [
            {
                title: t('steps.welcome'),
                nextButton: t('navigation.nextWindows'),
                prevButton: '',
                component: <WelcomeStep />,
            },
            {
                title: t('steps.windows'),
                nextButton: t('navigation.nextCurrentSettings'),
                prevButton: t('navigation.backWelcome'),
                component: <WindowsStep />,
            },
            {
                title: t('steps.currentSettings'),
                nextButton: t('navigation.nextSetLocations'),
                prevButton: t('navigation.backWindows'),
                component: (
                    <CurrentSettingsStep onSkip={() => setStepIndex(4)} />
                ),
            },
            {
                title: t('steps.setLocations'),
                nextButton: t('navigation.nextCustomizeBehavior'),
                prevButton: t('navigation.backCurrentSettings'),
                component: <SetLocationStep />,
            },
            {
                title: t('steps.customizeBehavior'),
                nextButton: t('navigation.nextReady'),
                prevButton: t('navigation.backSetLocations'),
                component: <CustomizeBehaviorStep />,
            },
            {
                title: t('steps.windowsSymlink'),
                nextButton: t('navigation.nextReady'),
                prevButton: t('navigation.backCustomizeBehavior'),
                component: <WindowsSymlinkSetting />,
            },
            {
                title: t('steps.ready'),
                nextButton: t('navigation.start'),
                prevButton: t('navigation.backCustomizeBehavior'),
                component: <StartStep />,
            },
        ],
        [t],
    );

    const linuxSteps: StepDetails[] = useMemo(
        () => [
            {
                title: t('steps.welcome'),
                nextButton: t('navigation.nextLinux'),
                prevButton: '',
                component: <WelcomeStep />,
            },
            {
                title: t('steps.linux'),
                nextButton: t('navigation.nextCurrentSettings'),
                prevButton: t('navigation.backWelcome'),
                component: <LinuxStep />,
            },
            {
                title: t('steps.currentSettings'),
                nextButton: t('navigation.nextSetLocations'),
                prevButton: t('navigation.backWindows'),
                component: (
                    <CurrentSettingsStep onSkip={() => setStepIndex(4)} />
                ),
            },
            {
                title: t('steps.setLocations'),
                nextButton: t('navigation.nextCustomizeBehavior'),
                prevButton: t('navigation.backCurrentSettings'),
                component: <SetLocationStep />,
            },
            {
                title: t('steps.customizeBehavior'),
                nextButton: t('navigation.nextReady'),
                prevButton: t('navigation.backCustomizeBehavior'),
                component: <CustomizeBehaviorStep />,
            },
            {
                title: t('steps.ready'),
                nextButton: t('navigation.start'),
                prevButton: t('navigation.backCustomizeBehavior'),
                component: <StartStep />,
            },
        ],
        [t],
    );

    const getMaxSteps = useCallback(() => {
        switch (platform) {
            case 'darwin':
                return macSteps.length - 1;
            case 'win32':
                return winSteps.length - 1;
            case 'linux':
                return linuxSteps.length - 1;
            default:
                return winSteps.length - 1;
        }
    }, [platform, macSteps.length, winSteps.length, linuxSteps.length]);

    const getPlatformSteps = useCallback(() => {
        switch (platform) {
            case 'darwin':
                return macSteps;
            case 'win32':
                return winSteps;
            case 'linux':
                return linuxSteps;
            default:
                return winSteps;
        }
    }, [platform, macSteps, winSteps, linuxSteps]);

    // Derive button text from current step instead of storing in state
    const currentStep = useMemo(() => {
        const steps = getPlatformSteps();
        return (
            steps[stepIndex || 0] || {
                nextButton: 'Next',
                prevButton: 'Previous',
            }
        );
    }, [getPlatformSteps, stepIndex]);

    const nextStepText = currentStep.nextButton;
    const previousStepText = currentStep.prevButton;

    useEffect(() => {
        if (stepIndex == null) {
            return;
        }

        const maxSteps = getMaxSteps();

        // if last step is reached, clear localstorage and update preference first_run
        if (stepIndex >= maxSteps + 1) {
            localStorage?.clear();
            const updates: Partial<UserPreferences> = { first_run: false };
            if (platform === 'win32') {
                updates.windows_symlink_win_notify = true;
            }
            updatePreferences(updates);
            // Use setTimeout to avoid synchronous setState in effect
            setTimeout(() => setStepIndex(undefined), 0);
            return;
        }

        localStorage?.setItem('stepIndex', stepIndex.toString());

        // Validate and correct stepIndex bounds
        if (stepIndex < 0) {
            setTimeout(() => setStepIndex(0), 0);
            return;
        }
        if (stepIndex > maxSteps) {
            setTimeout(() => setStepIndex(maxSteps - 1), 0);
            return;
        }
    }, [stepIndex, platform, updatePreferences, getMaxSteps]);

    useEffect(() => {
        log.info('Starting Welcome View');
    }, []);

    const currentComponent = useMemo(() => {
        const steps = getPlatformSteps();
        if (stepIndex != null && stepIndex >= 0 && stepIndex < steps.length) {
            const step = steps[stepIndex || 0];
            return step.component;
        }
        return <div></div>;
    }, [getPlatformSteps, stepIndex]);

    if (stepIndex == null) {
        return <div></div>;
    }

    return (
        <div className="absolute inset-0 z-20 w-full h-full p-0 flex flex-col items-center">
            <div className="flex flex-col w-[900px] h-full p-4 gap-2 overflow-hidden">
                {/* Header */}
                <div className="flex flex-col gap-4">
                    <h1 data-testid="installsTitle" className="text-3xl">
                        {t('title')}
                    </h1>
                    <ul className="steps">
                        {/* Steps */}
                        {getPlatformSteps().map((step, index) => (
                            <button
                                type="button"
                                onClick={() => setStepIndex(index)}
                                key={`welcomeStepButton_${step.title}_${index}`}
                                className={clsx('step cursor-pointer', {
                                    'step-primary': stepIndex >= index,
                                })}
                            >
                                {step.title}
                            </button>
                        ))}
                    </ul>
                </div>

                {/* Content */}
                <div className="flex-1 px-2 pt-8">{currentComponent}</div>

                {/* foot */}
                <div className="flex flex-row justify-between gap-2 flex-0">
                    {stepIndex > 0 ? (
                        <button
                            type="button"
                            disabled={stepIndex === 0}
                            className="btn btn-primary"
                            onClick={() => setStepIndex(stepIndex - 1)}
                        >
                            {previousStepText}
                        </button>
                    ) : (
                        <div></div>
                    )}

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setStepIndex(stepIndex + 1)}
                    >
                        {nextStepText}
                    </button>
                </div>
            </div>
        </div>
    );
};
