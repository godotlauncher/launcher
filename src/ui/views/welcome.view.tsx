import log from 'electron-log/renderer';

import React, { useEffect, useState } from 'react';
import { WelcomeStep } from '../components/welcomeSteps/welcomeStep';
import clsx from 'clsx';
import { CurrentSettingsStep } from '../components/welcomeSteps/currentSettingsStep';
import { SetLocationStep } from '../components/welcomeSteps/SetLocationStep';
import { CustomizeBehaviorStep, } from '../components/welcomeSteps/CustomizeBehaviorStep';
import { StartStep } from '../components/welcomeSteps/StartStep';
import { usePreferences } from '../hooks/usePreferences';
import { MacOSStep } from '../components/welcomeSteps/macosStep';
import { WindowsStep } from '../components/welcomeSteps/WindowsStep';
import { LinuxStep } from '../components/welcomeSteps/linuxStep';
import { WindowsSymlinkSetting } from '../components/settings/WindowsSymlinkSetting.component';

interface StepDetails {
    title: string;
    nextButton: string;
    prevButton: string;
    component: JSX.Element;
}

export const WelcomeView: React.FC = () => {

    const [stepIndex, setStepIndex] = useState<number | undefined>();
    const [nextStepText, setNextStepText] = useState<string>('Next');
    const [previousStepText, setPreviousStepText] = useState<string>('Previous');

    const { updatePreferences, platform } = usePreferences();

    const macSteps: StepDetails[] = [
        { title: 'Welcome', nextButton: 'Next: MacOS', prevButton: '', component: <WelcomeStep /> },
        { title: 'MacOS', nextButton: 'Next: Current Settings', prevButton: 'Back: Welcomes', component: <MacOSStep /> },
        { title: 'Current Settings', nextButton: 'Next: Set Locations', prevButton: 'Back: MacOS', component: <CurrentSettingsStep onSkip={() => setStepIndex(4)} /> },
        { title: 'Set Locations', nextButton: 'Next: Customize Behavior', prevButton: 'Back: Current Settings', component: <SetLocationStep /> },
        { title: 'Customize Behavior', nextButton: 'Next: Ready', prevButton: 'Back: Set Locations', component: <CustomizeBehaviorStep /> },
        { title: 'Ready', nextButton: 'Start', prevButton: 'Back: Customize Behavior', component: <StartStep /> },
    ];

    const winSteps: StepDetails[] = [
        { title: 'Welcome', nextButton: 'Next: Windows', prevButton: '', component: <WelcomeStep /> },
        { title: 'Windows', nextButton: 'Next: Current Settings', prevButton: 'Back: Welcome', component: <WindowsStep /> },
        { title: 'Current Settings', nextButton: 'Next: Set Locations', prevButton: 'Back: Windows', component: <CurrentSettingsStep onSkip={() => setStepIndex(4)} /> },
        { title: 'Set Locations', nextButton: 'Next: Customize Behavior', prevButton: 'Back: Current Settings', component: <SetLocationStep /> },
        { title: 'Customize Behavior', nextButton: 'Next: Ready', prevButton: 'Back: Set Locations', component: <CustomizeBehaviorStep /> },
        { title: 'Windows Symlink', nextButton: 'Next: Ready', prevButton: 'Back: Customize Behavior', component: <WindowsSymlinkSetting /> },
        { title: 'Ready', nextButton: 'Start', prevButton: 'Back: Customize Behavior', component: <StartStep /> },
    ];

    const linuxSteps: StepDetails[] = [
        { title: 'Welcome', nextButton: 'Next: Linux', prevButton: '', component: <WelcomeStep /> },
        { title: 'Linux', nextButton: 'Next: Current Settings', prevButton: 'Back: Welcome', component: <LinuxStep /> },
        { title: 'Current Settings', nextButton: 'Next: Set Locations', prevButton: 'Back: Windows', component: <CurrentSettingsStep onSkip={() => setStepIndex(4)} /> },
        { title: 'Set Locations', nextButton: 'Next: Customize Behavior', prevButton: 'Back: Current Settings', component: <SetLocationStep /> },
        { title: 'Customize Behavior', nextButton: 'Next: Ready', prevButton: 'Back: Customize Behavior', component: <CustomizeBehaviorStep /> },
        { title: 'Ready', nextButton: 'Start', prevButton: 'Back: Customize Behavior', component: <StartStep /> },
    ];

    const getMaxSteps = () => {
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
    };
    const getPlatformSteps = () => {
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
    };
    useEffect(() => {

        if (stepIndex == null) {
            return;
        }

        const maxSteps = getMaxSteps();

        // if last step is reached, clear localstorage and update preference first_run
        if (stepIndex >= maxSteps + 1) {
            setStepIndex(undefined);
            localStorage?.clear();
            const updates: Partial<UserPreferences> = { first_run: false };
            if (platform === 'win32') {
                updates.windows_symlink_win_notify = true;
            }
            updatePreferences(updates);

            return;
        }

        localStorage?.setItem('stepIndex', stepIndex.toString());
        if (stepIndex < 0) {
            setStepIndex(0);
        }
        if (stepIndex > maxSteps) {
            setStepIndex(maxSteps - 1);
        }
        nextStep();
    }, [stepIndex]);


    useEffect(() => {
        log.info('Starting Welcome View');
        const storedStepIndex = localStorage?.getItem('stepIndex');
        if (storedStepIndex) {
            setStepIndex(parseInt(storedStepIndex));
        }
        else {
            setStepIndex(0);
        }
    }, []);

    const nextStep = () => {
        const steps = getPlatformSteps();
        const step = steps[stepIndex || 0];
        setNextStepText(step.nextButton);
        setPreviousStepText(step.prevButton);
    };



    const showStep = () => {

        const steps = getPlatformSteps();
        if (stepIndex != null && stepIndex >= 0 && stepIndex < steps.length) {

            const step = steps[stepIndex || 0];
            return step.component;
        }
        else {
            return <div></div>;
        }
    };

    if (stepIndex == null) {
        return <div></div>;
    }

    return (

        <div className="absolute inset-0 z-20 w-full h-full p-0 flex flex-col items-center">
            <div className="flex flex-col w-[900px] h-full p-4 gap-2 overflow-hidden">
                {/* Header */}
                <div className="flex flex-col gap-4">
                    <h1 data-testid="installsTitle" className="text-3xl">Godot Launcher</h1>
                    <ul className="steps">
                        {/* Steps */}
                        {getPlatformSteps().map((step, index) => (
                            <li onClick={() => setStepIndex(index)} key={index} className={clsx('step cursor-pointer', { 'step-primary': stepIndex >= index })}>{step.title}</li>
                        ))}
                    </ul>
                </div>

                {/* Content */}
                <div className="flex-1 px-2 pt-8">
                    {showStep()}
                </div>

                {/* foot */}
                <div className="flex flex-row justify-between gap-2 flex-0">
                    {stepIndex > 0 ? <button disabled={stepIndex === 0}
                        className="btn btn-primary"
                        onClick={() => setStepIndex(stepIndex - 1)}
                    >{previousStepText}</button>
                        : <div></div>
                    }

                    <button className="btn btn-primary"
                        onClick={() => setStepIndex(stepIndex + 1)}
                    >{nextStepText}</button>
                </div>
            </div>
        </div>
    );
};
