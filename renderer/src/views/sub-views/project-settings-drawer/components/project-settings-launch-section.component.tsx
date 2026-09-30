import clsx from 'clsx';
import type { TFunction } from 'i18next';
import { PanelTop, Terminal } from 'lucide-react';
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
                <label
                    htmlFor="project-windowed-switch"
                    className={clsx(
                        'flex items-center gap-3 rounded-md bg-base-content/5 p-3',
                        disabled && 'opacity-50',
                    )}
                >
                    <PanelTop className="size-5 shrink-0" aria-hidden="true" />
                    <span className="flex flex-1 flex-col gap-1">
                        <span className="flex items-center gap-2">
                            {t('editProject.launch.windowed.label')}
                            {windowedChanged && <PendingChangesIndicator />}
                        </span>
                        <span className="text-base-content/75">
                            {t('editProject.launch.windowed.help')}
                        </span>
                    </span>
                    <Switch
                        id="project-windowed-switch"
                        checked={windowed}
                        disabled={disabled}
                        onChange={(event) =>
                            onWindowedChange(event.currentTarget.checked)
                        }
                    />
                </label>
                <label
                    htmlFor="project-console-switch"
                    className={clsx(
                        'flex items-center gap-3 rounded-md bg-base-content/5 p-3',
                        disabled && 'opacity-50',
                    )}
                >
                    <Terminal className="size-5 shrink-0" aria-hidden="true" />
                    <span className="flex flex-1 flex-col gap-1">
                        <span className="flex items-center gap-2">
                            {t('editProject.launch.console.label')}
                            {consoleChanged && <PendingChangesIndicator />}
                        </span>
                        <span className="text-base-content/75">
                            {t('editProject.launch.console.help')}
                        </span>
                    </span>
                    <Switch
                        id="project-console-switch"
                        checked={launchWithConsole}
                        disabled={disabled}
                        onChange={(event) =>
                            onLaunchWithConsoleChange(
                                event.currentTarget.checked,
                            )
                        }
                    />
                </label>
            </div>
        </section>
    );
}
