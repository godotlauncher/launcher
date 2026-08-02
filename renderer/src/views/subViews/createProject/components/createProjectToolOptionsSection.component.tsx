import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import clsx from 'clsx';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/selectField.component';

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
    loadingTools: boolean;
    loadingCodeEditors: boolean;
    codeEditorLoadFailed: boolean;
    gitAvailable: boolean;
    codeEditorSettings: CodeEditorIntegrationSettings[];
    codeEditorId: CodeEditorId | null;
    withGit: boolean;
    onWithGitChange: (enabled: boolean) => void;
    onCodeEditorIdChange: (codeEditorId: CodeEditorId | null) => void;
};

export const CreateProjectToolOptionsSection: React.FC<
    CreateProjectToolOptionsSectionProps
> = ({
    t,
    loadingTools,
    loadingCodeEditors,
    codeEditorLoadFailed,
    gitAvailable,
    codeEditorSettings,
    codeEditorId,
    withGit,
    onWithGitChange,
    onCodeEditorIdChange,
}) => (
    <div className="flex-1">
        <div className="flex flex-col gap-2">
            <h2 className="text-md flex items-center gap-4">
                {t('otherSettings.title')}{' '}
                {(loadingTools || loadingCodeEditors) && (
                    <span className="loading loading-dots loading-xs"></span>
                )}
            </h2>

            <div
                className={clsx('flex flex-col gap-4 p-4 ', {
                    invisible: loadingTools || loadingCodeEditors,
                })}
            >
                <label className="flex gap-2 items-center">
                    <input
                        type="checkbox"
                        className="checkbox"
                        disabled={!gitAvailable}
                        checked={withGit}
                        onChange={(event) =>
                            onWithGitChange(event.target.checked)
                        }
                    />
                    <span className="">{t('otherSettings.initGit')}</span>
                </label>
                {!gitAvailable && (
                    <span className="text-sm text-warning">
                        {t('otherSettings.gitNotInstalled')}
                    </span>
                )}

                <div className="divider m-0"></div>

                <SelectField
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
                    <p className="text-sm text-error" role="alert">
                        {t('projects:editProject.codeEditor.loadFailed')}
                    </p>
                )}
            </div>
        </div>
    </div>
);
