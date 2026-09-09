import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/select-field.component';

type Translate = (key: string) => string;
const getCodeEditorOptions = (
    t: Translate,
    settings: CodeEditorIntegrationSettings[],
): SelectFieldOption[] => [
    { value: '', label: t('otherSettings.codeEditor.none') },
    ...settings.map((integrationSettings) => {
        const unavailableReason = !integrationSettings.enabled
            ? t('otherSettings.codeEditor.disabled')
            : integrationSettings.installation
              ? null
              : t('otherSettings.codeEditor.notFound');

        return {
            value: integrationSettings.integration.id,
            label: `${integrationSettings.integration.displayName}${unavailableReason ? ` (${unavailableReason})` : ''}`,
            disabled: unavailableReason !== null,
        };
    }),
];

type CreateProjectToolOptionsSectionProps = {
    t: Translate;
    loadingCodeEditors: boolean;
    codeEditorLoadFailed: boolean;
    codeEditorSettings: CodeEditorIntegrationSettings[];
    codeEditorId: CodeEditorId | null;
    onCodeEditorIdChange: (codeEditorId: CodeEditorId | null) => void;
};

/**
 * Renders the compact code editor field with loading and failure feedback.
 * @param props - Available integrations, selection, status and change handler.
 */
export const CreateProjectToolOptionsSection: React.FC<
    CreateProjectToolOptionsSectionProps
> = ({
    t,
    loadingCodeEditors,
    codeEditorLoadFailed,
    codeEditorSettings,
    codeEditorId,
    onCodeEditorIdChange,
}) => (
    <div className="flex min-w-0 flex-col gap-2">
        <SelectField
            size="sm"
            id="selectCreateProjectCodeEditor"
            testId="selectCreateProjectCodeEditor"
            label={t('otherSettings.codeEditor.label')}
            disabled={loadingCodeEditors || codeEditorLoadFailed}
            showSelectedCheck
            value={codeEditorId ?? ''}
            onChange={(value) =>
                onCodeEditorIdChange(
                    value === '' ? null : (value as CodeEditorId),
                )
            }
            options={getCodeEditorOptions(t, codeEditorSettings)}
        />
        {codeEditorLoadFailed && (
            <p
                className="alert alert-error alert-soft text-base text-error-content dark:text-error"
                role="alert"
            >
                {t('projects:editProject.codeEditor.loadFailed')}
            </p>
        )}
        {loadingCodeEditors && (
            <span
                className="loading loading-spinner loading-sm text-base-content/60"
                role="status"
                aria-label={t('common:app.loadingMessage')}
            />
        )}
    </div>
);
