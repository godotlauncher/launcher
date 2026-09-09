import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import { RotateCcw } from 'lucide-react';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/select-field.component';
import { Tooltip } from '../../../../components/ui/tooltip.component';

type Translate = (key: string) => string;
const getCodeEditorOptions = (
    t: Translate,
    settings: CodeEditorIntegrationSettings[],
    selectedCodeEditorId: CodeEditorId | null,
): SelectFieldOption[] => {
    const options: SelectFieldOption[] = [
        { value: '', label: t('editProject.codeEditor.none') },
        ...settings.map((integrationSettings) => {
            const unavailableReason = !integrationSettings.enabled
                ? t('editProject.codeEditor.disabled')
                : integrationSettings.installation
                  ? null
                  : t('editProject.codeEditor.notFound');

            return {
                value: integrationSettings.integration.id,
                label: `${integrationSettings.integration.displayName}${unavailableReason ? ` (${unavailableReason})` : ''}`,
                disabled: unavailableReason !== null,
            };
        }),
    ];

    if (
        selectedCodeEditorId &&
        !settings.some((item) => item.integration.id === selectedCodeEditorId)
    ) {
        options.push({
            value: selectedCodeEditorId,
            label: selectedCodeEditorId,
            disabled: true,
        });
    }

    return options;
};

type ProjectCodeEditorSectionProps = {
    t: Translate;
    codeEditorId: CodeEditorId | null;
    settings: CodeEditorIntegrationSettings[];
    loading: boolean;
    loadFailed: boolean;
    disabled: boolean;
    showResetConfig?: boolean;
    onChange: (codeEditorId: CodeEditorId | null) => void;
    onResetConfig?: () => void;
};

export const ProjectCodeEditorSection: React.FC<
    ProjectCodeEditorSectionProps
> = ({
    t,
    codeEditorId,
    settings,
    loading,
    loadFailed,
    disabled,
    showResetConfig = false,
    onChange,
    onResetConfig,
}) => (
    <section className="flex flex-col gap-[12px] text-base">
        <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">
                        {t('editProject.codeEditor.title')}
                    </h2>
                </div>
                <p className="text-base-content/75">
                    {t('editProject.codeEditor.help')}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {showResetConfig && (
                    <Tooltip
                        placement="top"
                        tip={t('editProject.codeEditor.resetConfig.label')}
                    >
                        <button
                            type="button"
                            className="btn btn-sm btn-square btn-ghost"
                            aria-label={t(
                                'editProject.codeEditor.resetConfig.label',
                            )}
                            disabled={disabled || loading}
                            onClick={onResetConfig}
                        >
                            <RotateCcw size={16} aria-hidden="true" />
                        </button>
                    </Tooltip>
                )}
                {loading && (
                    <span
                        role="status"
                        aria-label={t('editProject.codeEditor.loading')}
                    >
                        <span
                            className="loading loading-spinner loading-sm"
                            aria-hidden="true"
                        />
                    </span>
                )}
            </div>
        </div>

        <SelectField
            size="sm"
            id="selectProjectCodeEditor"
            testId="selectProjectCodeEditor"
            ariaLabel={t('editProject.codeEditor.title')}
            disabled={disabled || loading}
            showSelectedCheck
            value={codeEditorId ?? ''}
            onChange={(value) =>
                onChange(value === '' ? null : (value as CodeEditorId))
            }
            options={getCodeEditorOptions(t, settings, codeEditorId)}
        />

        {loadFailed && (
            <p className="break-words text-error" role="alert">
                {t('editProject.codeEditor.loadFailed')}
            </p>
        )}
    </section>
);
