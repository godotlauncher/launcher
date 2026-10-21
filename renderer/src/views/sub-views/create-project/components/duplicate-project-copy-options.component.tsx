import type React from 'react';
import { HelpTooltip } from '../../../../components/ui/help-tooltip.component';

type DuplicateProjectCopyOptionsProps = {
    t: (key: string) => string;
    copyEditorSettings: boolean;
    copySaveData: boolean;
    onCopyEditorSettingsChange: (enabled: boolean) => void;
    onCopySaveDataChange: (enabled: boolean) => void;
};

/**
 * Explains the optional data carried into an independent project copy.
 * @param props - Copy choices, translated labels and change callbacks.
 */
export const DuplicateProjectCopyOptions: React.FC<
    DuplicateProjectCopyOptionsProps
> = ({
    t,
    copyEditorSettings,
    copySaveData,
    onCopyEditorSettingsChange,
    onCopySaveDataChange,
}) => (
    <section
        className="flex flex-col gap-3"
        aria-labelledby="duplicateCopyOptionsTitle"
    >
        <h2
            id="duplicateCopyOptionsTitle"
            className="text-sm text-base-content/65"
        >
            {t('duplicate.include')}
        </h2>
        <div>
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm shrink-0"
                        checked={copyEditorSettings}
                        onChange={(event) =>
                            onCopyEditorSettingsChange(event.target.checked)
                        }
                    />
                    <span>{t('duplicate.copyEditorSettings')}</span>
                </label>
                <HelpTooltip help={t('duplicate.copyEditorSettingsHelp')} />
            </div>
        </div>
        <div>
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm shrink-0"
                        checked={copySaveData}
                        onChange={(event) =>
                            onCopySaveDataChange(event.target.checked)
                        }
                    />
                    <span>{t('duplicate.copySaveData')}</span>
                </label>
                <HelpTooltip help={t('duplicate.copySaveDataHelp')} />
            </div>
        </div>
    </section>
);
