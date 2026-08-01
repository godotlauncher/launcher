import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { Pencil, Star } from 'lucide-react';
import type React from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string) => string;

type CodeEditorSettingsPanelProps = {
    active: boolean;
    t: Translate;
    settings: CodeEditorIntegrationSettings[];
    onEdit: (settings: CodeEditorIntegrationSettings) => void;
    onSetDefault: (settings: CodeEditorIntegrationSettings) => Promise<void>;
    onEnabledChange: (
        settings: CodeEditorIntegrationSettings,
        enabled: boolean,
    ) => Promise<void>;
    loading: boolean;
    loadError: boolean;
};

export const CodeEditorSettingsPanel: React.FC<
    CodeEditorSettingsPanelProps
> = ({
    active,
    t,
    settings,
    onEdit,
    onSetDefault,
    onEnabledChange,
    loading,
    loadError,
}) => (
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
            <div className="mt-4 grid gap-4">
                {settings.map((integrationSettings) => (
                    <section
                        key={integrationSettings.integration.id}
                        data-testid={`code-editor-integration-${integrationSettings.integration.id}`}
                        className="flex flex-col gap-4 rounded-box border border-base-300 bg-base-200/40 p-4"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <h2 className="truncate font-semibold">
                                        {
                                            integrationSettings.integration
                                                .displayName
                                        }
                                    </h2>
                                    {integrationSettings.integration
                                        .capabilities.dotnet && (
                                        <span className="badge badge-outline badge-sm shrink-0">
                                            .NET{' '}
                                            {t(
                                                'codeEditors.drawer.dotnet.supported',
                                            )}
                                        </span>
                                    )}
                                    {integrationSettings.installation && (
                                        <span className="badge badge-success badge-sm shrink-0">
                                            {t('codeEditors.status.available')}
                                        </span>
                                    )}
                                </div>

                                {integrationSettings.installation ? (
                                    <CopyBadge
                                        value={
                                            integrationSettings.installation
                                                .path
                                        }
                                        label={t('common:buttons.copyPath')}
                                        copiedLabel={t('common:success')}
                                        className="self-start"
                                    />
                                ) : (
                                    <span className="badge badge-outline badge-neutral badge-sm h-7 self-start">
                                        {t('codeEditors.status.missing')}
                                    </span>
                                )}
                            </div>
                            <div className="flex min-h-8 shrink-0 items-center gap-2">
                                {integrationSettings.enabled && (
                                    <Tooltip
                                        tip={t(
                                            integrationSettings.isDefault
                                                ? 'codeEditors.status.default'
                                                : integrationSettings.installation
                                                  ? 'codeEditors.actions.setDefault'
                                                  : 'codeEditors.status.missing',
                                        )}
                                        placement="top"
                                    >
                                        <button
                                            type="button"
                                            data-testid={`btn-set-default-code-editor-${integrationSettings.integration.id}`}
                                            className="btn btn-square btn-ghost btn-sm"
                                            aria-label={t(
                                                integrationSettings.isDefault
                                                    ? 'codeEditors.status.default'
                                                    : integrationSettings.installation
                                                      ? 'codeEditors.actions.setDefault'
                                                      : 'codeEditors.status.missing',
                                            )}
                                            aria-pressed={
                                                integrationSettings.isDefault
                                            }
                                            disabled={
                                                integrationSettings.isDefault ||
                                                !integrationSettings.installation
                                            }
                                            onClick={() =>
                                                void onSetDefault(
                                                    integrationSettings,
                                                )
                                            }
                                        >
                                            <Star
                                                size={16}
                                                className={
                                                    integrationSettings.isDefault
                                                        ? 'fill-primary stroke-primary'
                                                        : undefined
                                                }
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </Tooltip>
                                )}
                                {integrationSettings.enabled && (
                                    <Tooltip
                                        tip={t('codeEditors.actions.edit')}
                                        placement="top"
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-square btn-ghost btn-sm"
                                            aria-label={t(
                                                'codeEditors.actions.edit',
                                            )}
                                            onClick={() =>
                                                onEdit(integrationSettings)
                                            }
                                        >
                                            <Pencil
                                                size={16}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </Tooltip>
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
                                    onChange={(event) =>
                                        void onEnabledChange(
                                            integrationSettings,
                                            event.currentTarget.checked,
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </section>
                ))}
            </div>
        )}
    </SettingsPanelSection>
);
