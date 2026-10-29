import type { TFunction } from 'i18next';
import { PanelTop, Terminal } from 'lucide-react';
import { SettingsPanel } from '../../../../components/settings/settings-panel.component';
import { Switch } from '../../../../components/ui/switch.component';
import { PendingChangesIndicator } from './pending-changes-indicator.component';

type ProjectSettingsLaunchSectionProps = {
    t: TFunction;
    windowed: boolean;
    windowedChanged: boolean;
    launchWithConsole: boolean;
    consoleChanged: boolean;
    disabled: boolean;
    onWindowedChange: (windowed: boolean) => void;
    onLaunchWithConsoleChange: (launchWithConsole: boolean) => void;
};

/**
 * Renders the staged launch preferences.
 *
 * @param props - The launch values and their update actions.
 * @returns The launch settings section.
 */
export function ProjectSettingsLaunchSection({
    t,
    windowed,
    windowedChanged,
    launchWithConsole,
    consoleChanged,
    disabled,
    onWindowedChange,
    onLaunchWithConsoleChange,
}: ProjectSettingsLaunchSectionProps) {
    return (
        <section className="flex flex-col gap-[12px]">
            <div className="flex flex-col gap-[4px]">
                <h2 className="text-base font-semibold">
                    {t('editProject.launch.title')}
                </h2>
                <p className="text-base-content/75">
                    {t('editProject.launch.help')}
                </p>
            </div>
            <div className="flex flex-col gap-2">
                <SettingsPanel
                    icon={PanelTop}
                    htmlFor="project-windowed-switch"
                    dimmed={disabled}
                    title={
                        <>
                            {t('editProject.launch.windowed.label')}
                            {windowedChanged && <PendingChangesIndicator />}
                        </>
                    }
                    description={t('editProject.launch.windowed.help')}
                    descriptionId="project-windowed-help"
                    action={
                        <Switch
                            id="project-windowed-switch"
                            aria-describedby="project-windowed-help"
                            checked={windowed}
                            disabled={disabled}
                            onChange={(event) =>
                                onWindowedChange(event.currentTarget.checked)
                            }
                        />
                    }
                />
                <SettingsPanel
                    icon={Terminal}
                    htmlFor="project-console-switch"
                    dimmed={disabled}
                    title={
                        <>
                            {t('editProject.launch.console.label')}
                            {consoleChanged && <PendingChangesIndicator />}
                        </>
                    }
                    description={t('editProject.launch.console.help')}
                    descriptionId="project-console-help"
                    action={
                        <Switch
                            id="project-console-switch"
                            aria-describedby="project-console-help"
                            checked={launchWithConsole}
                            disabled={disabled}
                            onChange={(event) =>
                                onLaunchWithConsoleChange(
                                    event.currentTarget.checked,
                                )
                            }
                        />
                    }
                />
            </div>
        </section>
    );
}
