import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import { LoaderCircle } from 'lucide-react';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/selectField.component';

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
    onChange: (codeEditorId: CodeEditorId | null) => void;
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
    onChange,
}) => (
    <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
                <h2 className="text-lg font-bold">
                    {t('editProject.codeEditor.title')}
                </h2>
                <p className="text-sm text-base-content/70">
                    {t('editProject.codeEditor.help')}
                </p>
            </div>
            {loading && (
                <LoaderCircle
                    className="h-5 w-5 shrink-0 animate-spin"
                    aria-label={t('editProject.codeEditor.loading')}
                />
            )}
        </div>

        <SelectField
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
            <p className="text-sm text-error" role="alert">
                {t('editProject.codeEditor.loadFailed')}
            </p>
        )}
    </section>
);
