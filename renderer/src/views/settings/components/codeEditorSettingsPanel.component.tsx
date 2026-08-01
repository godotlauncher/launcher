import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import { Pencil, RotateCw, Star } from 'lucide-react';
import type React from 'react';
import { CodeEditorIntegrationIcon } from '../../../components/codeEditorIntegrationIcon.component';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;
const getQualifiedLabel = (
    t: Translate,
    action: string,
    editor: string,
): string =>
    t('codeEditors.accessibility.integrationAction', { action, editor });

type CodeEditorSettingsPanelProps = {
    active: boolean;
    t: Translate;
    settings: CodeEditorIntegrationSettings[];
    onRescan: (settings: CodeEditorIntegrationSettings) => Promise<void>;
    onEdit: (settings: CodeEditorIntegrationSettings) => void;
    onSetDefault: (settings: CodeEditorIntegrationSettings) => Promise<void>;
    onEnabledChange: (
        settings: CodeEditorIntegrationSettings,
        enabled: boolean,
    ) => Promise<void>;
    loading: boolean;
    loadError: boolean;
    pendingIntegrationId: string | null;
    actionErrors: Record<string, string | undefined>;
    rescanningIntegrationId: string | null;
    projectUsage: Partial<
        Record<CodeEditorId, { count: number; dotnetCount: number }>
    >;
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
    onRescan,
    loading,
    loadError,
    pendingIntegrationId,
    rescanningIntegrationId,
    projectUsage,
    actionErrors,
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
                {t('codeEditors.status.loadFailed')}
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
                                    <CodeEditorIntegrationIcon
                                        integrationId={
                                            integrationSettings.integration.id
                                        }
                                        className="size-5 shrink-0"
                                    />
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
                                {!integrationSettings.installation &&
                                    (projectUsage[
                                        integrationSettings.integration.id
                                    ]?.count ?? 0) > 0 && (
                                        <p className="text-sm text-warning">
                                            {t(
                                                'codeEditors.status.projectUsage',
                                                projectUsage[
                                                    integrationSettings
                                                        .integration.id
                                                ],
                                            )}
                                        </p>
                                    )}
                            </div>
                            <div className="flex min-h-8 shrink-0 items-center gap-2">
                                {pendingIntegrationId ===
                                    integrationSettings.integration.id && (
                                    <span
                                        className="loading loading-spinner loading-sm"
                                        role="status"
                                        aria-label={getQualifiedLabel(
                                            t,
                                            t(
                                                rescanningIntegrationId ===
                                                    integrationSettings
                                                        .integration.id
                                                    ? 'codeEditors.actions.scanning'
                                                    : 'codeEditors.actions.saving',
                                            ),
                                            integrationSettings.integration
                                                .displayName,
                                        )}
                                    />
                                )}
                                <Tooltip
                                    tip={getQualifiedLabel(
                                        t,
                                        t('codeEditors.actions.rescan'),
                                        integrationSettings.integration
                                            .displayName,
                                    )}
                                    placement="top"
                                >
                                    <button
                                        type="button"
                                        data-testid={
                                            'btn-rescan-code-editor-' +
                                            integrationSettings.integration.id
                                        }
                                        className="btn btn-square btn-ghost btn-sm"
                                        aria-label={getQualifiedLabel(
                                            t,
                                            t('codeEditors.actions.rescan'),
                                            integrationSettings.integration
                                                .displayName,
                                        )}
                                        disabled={Boolean(pendingIntegrationId)}
                                        onClick={() =>
                                            void onRescan(integrationSettings)
                                        }
                                    >
                                        <RotateCw
                                            size={16}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </Tooltip>
                                {integrationSettings.enabled && (
                                    <Tooltip
                                        tip={getQualifiedLabel(
                                            t,
                                            t(
                                                integrationSettings.isDefault
                                                    ? 'codeEditors.status.default'
                                                    : integrationSettings.installation
                                                      ? 'codeEditors.actions.setDefault'
                                                      : 'codeEditors.status.missing',
                                            ),
                                            integrationSettings.integration
                                                .displayName,
                                        )}
                                        placement="top"
                                    >
                                        <button
                                            type="button"
                                            data-testid={`btn-set-default-code-editor-${integrationSettings.integration.id}`}
                                            className="btn btn-square btn-ghost btn-sm"
                                            aria-label={getQualifiedLabel(
                                                t,
                                                t(
                                                    integrationSettings.isDefault
                                                        ? 'codeEditors.status.default'
                                                        : integrationSettings.installation
                                                          ? 'codeEditors.actions.setDefault'
                                                          : 'codeEditors.status.missing',
                                                ),
                                                integrationSettings.integration
                                                    .displayName,
                                            )}
                                            aria-pressed={
                                                integrationSettings.isDefault
                                            }
                                            disabled={
                                                Boolean(pendingIntegrationId) ||
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
                                        tip={getQualifiedLabel(
                                            t,
                                            t('codeEditors.actions.edit'),
                                            integrationSettings.integration
                                                .displayName,
                                        )}
                                        placement="top"
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-square btn-ghost btn-sm"
                                            aria-label={getQualifiedLabel(
                                                t,
                                                t('codeEditors.actions.edit'),
                                                integrationSettings.integration
                                                    .displayName,
                                            )}
                                            disabled={Boolean(
                                                pendingIntegrationId,
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
                                    aria-label={getQualifiedLabel(
                                        t,
                                        integrationSettings.enabled
                                            ? t('codeEditors.status.enabled')
                                            : t('codeEditors.status.disabled'),
                                        integrationSettings.integration
                                            .displayName,
                                    )}
                                    disabled={Boolean(pendingIntegrationId)}
                                    onChange={(event) =>
                                        void onEnabledChange(
                                            integrationSettings,
                                            event.currentTarget.checked,
                                        )
                                    }
                                />
                            </div>
                        </div>
                        {actionErrors[integrationSettings.integration.id] && (
                            <p className="text-sm text-error" role="alert">
                                {
                                    actionErrors[
                                        integrationSettings.integration.id
                                    ]
                                }
                            </p>
                        )}
                    </section>
                ))}
            </div>
        )}
    </SettingsPanelSection>
);
