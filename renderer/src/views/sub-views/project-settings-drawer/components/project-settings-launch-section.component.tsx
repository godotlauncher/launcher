import clsx from 'clsx';
import type { TFunction } from 'i18next';
import { PanelTop } from 'lucide-react';

type ProjectSettingsLaunchSectionProps = {
    t: TFunction;
    windowed: boolean;
    disabled: boolean;
    onWindowedChange: (windowed: boolean) => void;
};

/**
 * Renders the staged launch preferences.
 *
 * @param props - The launch value and its update action.
 * @returns The launch settings section.
 */
export function ProjectSettingsLaunchSection({
    t,
    windowed,
    disabled,
    onWindowedChange,
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
            <label
                className={clsx(
                    'flex items-start gap-3 rounded-md bg-base-content/5 p-3',
                    disabled && 'opacity-50',
                )}
            >
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm mt-0.5 shrink-0"
                    checked={windowed}
                    disabled={disabled}
                    onChange={(event) =>
                        onWindowedChange(event.currentTarget.checked)
                    }
                />
                <PanelTop
                    className="mt-0.5 size-5 shrink-0"
                    aria-hidden="true"
                />
                <span className="flex flex-col gap-1">
                    <span>{t('editProject.launch.windowed.label')}</span>
                    <span className="text-base-content/75">
                        {t('editProject.launch.windowed.help')}
                    </span>
                </span>
            </label>
        </section>
    );
}
