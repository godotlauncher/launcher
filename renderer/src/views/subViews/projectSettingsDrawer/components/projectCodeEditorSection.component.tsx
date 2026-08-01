import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import { LoaderCircle } from 'lucide-react';
import type React from 'react';

type Translate = (key: string) => string;

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

        <select
            data-testid="selectProjectCodeEditor"
            className="select select-bordered w-full"
            aria-label={t('editProject.codeEditor.title')}
            disabled={disabled || loading || loadFailed}
            value={loading || loadFailed ? '' : (codeEditorId ?? '')}
            onChange={(event) =>
                onChange(
                    event.currentTarget.value === ''
                        ? null
                        : (event.currentTarget.value as CodeEditorId),
                )
            }
        >
            <option value="">{t('editProject.codeEditor.none')}</option>
            {settings.map((integrationSettings) => {
                const unavailableReason = !integrationSettings.enabled
                    ? t('editProject.codeEditor.disabled')
                    : integrationSettings.installation
                      ? null
                      : t('editProject.codeEditor.notFound');

                return (
                    <option
                        key={integrationSettings.integration.id}
                        value={integrationSettings.integration.id}
                        disabled={unavailableReason !== null}
                    >
                        {`${integrationSettings.integration.displayName}${unavailableReason ? ` (${unavailableReason})` : ''}`}
                    </option>
                );
            })}
        </select>

        {loadFailed && (
            <p className="text-sm text-error">
                {t('editProject.codeEditor.loadFailed')}
            </p>
        )}
    </section>
);
