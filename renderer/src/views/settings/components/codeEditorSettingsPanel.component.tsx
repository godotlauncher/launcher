import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { Pencil } from 'lucide-react';
import type React from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string) => string;

type CodeEditorSettingsPanelProps = {
    active: boolean;
    t: Translate;
    settings: CodeEditorIntegrationSettings[];
    onEdit: (settings: CodeEditorIntegrationSettings) => void;
    onEnabledChange: (
        settings: CodeEditorIntegrationSettings,
        enabled: boolean,
    ) => Promise<void>;
    loading: boolean;
    loadError: boolean;
};

export const CodeEditorSettingsPanel: React.FC<
    CodeEditorSettingsPanelProps
> = ({ active, t, settings, onEdit, onEnabledChange, loading, loadError }) => (
    <SettingsPanelSection active={active}>
        <p className="text-sm text-base-content/70">
            {t('codeEditors.overview')}
        </p>
        {loading && (
            <div className="flex items-center gap-2" role="status">
                <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                ></span>
                <span>{t('codeEditors.actions.scanning')}</span>
            </div>
        )}

        {!loading && loadError && (
            <p className="text-error" role="alert">
                {t('codeEditors.status.unknown')}
            </p>
        )}

        {!loading && !loadError && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {settings.map((integrationSettings) => (
                    <section
                        key={integrationSettings.integration.id}
                        data-testid={`code-editor-integration-${integrationSettings.integration.id}`}
                        className="flex flex-col gap-4 rounded-box border border-base-300 bg-base-200/40 p-4"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-2">
                                <h2 className="truncate font-semibold">
                                    {
                                        integrationSettings.integration
                                            .displayName
                                    }
                                </h2>
                                {integrationSettings.integration.capabilities
                                    .dotnet && (
                                    <span
                                        className="badge badge-outline badge-sm shrink-0"
                                        title={t(
                                            'codeEditors.drawer.dotnet.supported',
                                        )}
                                    >
                                        .NET
                                    </span>
                                )}
                                <span
                                    className={`badge badge-sm shrink-0 ${
                                        integrationSettings.installation
                                            ? 'badge-success'
                                            : 'badge-warning'
                                    }`}
                                    title={
                                        integrationSettings.installation
                                            ? t('codeEditors.status.available')
                                            : t('codeEditors.status.missing')
                                    }
                                >
                                    {integrationSettings.installation
                                        ? t('codeEditors.status.available')
                                        : t('codeEditors.status.missing')}
                                </span>
                            </div>
                            <div className="flex min-h-8 shrink-0 items-center gap-2">
                                {integrationSettings.enabled && (
                                    <button
                                        type="button"
                                        className="btn btn-square btn-ghost btn-sm"
                                        aria-label={t(
                                            'codeEditors.actions.edit',
                                        )}
                                        title={t('codeEditors.actions.edit')}
                                        onClick={() =>
                                            onEdit(integrationSettings)
                                        }
                                    >
                                        <Pencil size={16} aria-hidden="true" />
                                    </button>
                                )}
                                <input
                                    type="checkbox"
                                    className="toggle toggle-primary"
                                    checked={integrationSettings.enabled}
                                    aria-label={
                                        integrationSettings.enabled
                                            ? t('codeEditors.status.enabled')
                                            : t('codeEditors.status.disabled')
                                    }
                                    title={
                                        integrationSettings.enabled
                                            ? t('codeEditors.status.enabled')
                                            : t('codeEditors.status.disabled')
                                    }
                                    onChange={(event) =>
                                        void onEnabledChange(
                                            integrationSettings,
                                            event.currentTarget.checked,
                                        )
                                    }
                                />
                            </div>
                        </div>

                        {integrationSettings.installation && (
                            <CopyBadge
                                value={integrationSettings.installation.path}
                                label={t('common:buttons.copyPath')}
                                copiedLabel={t('common:success')}
                                className="self-start"
                            />
                        )}
                    </section>
                ))}
            </div>
        )}
    </SettingsPanelSection>
);
