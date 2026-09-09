import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
} from '@shared/contracts';
import { Pencil, RotateCw } from 'lucide-react';
import type React from 'react';
import { CodeEditorIntegrationIcon } from '../../../components/code-editor-integration-icon.component';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { StarButton } from '../../../components/ui/star-button.component';
import { StatusBadge } from '../../../components/ui/status-badge.component';
import { Switch } from '../../../components/ui/switch.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { SettingsPanelSection } from './settings-panel-section.component';

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
        <p className="text-base text-base-content/75">
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
            <div className="grid gap-4 text-base">
                {settings.map((integrationSettings) => (
                    <section
                        key={integrationSettings.integration.id}
                        data-testid={`code-editor-integration-${integrationSettings.integration.id}`}
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-4 bg-base-200/40 p-4"
                    >
                        <div className="flex min-h-8 items-center">
                            <CodeEditorIntegrationIcon
                                integrationId={
                                    integrationSettings.integration.id
                                }
                                className="size-5 shrink-0"
                            />
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-[4px]">
                            <div className="contents">
                                <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-2">
                                    <h2 className="truncate font-semibold">
                                        {
                                            integrationSettings.integration
                                                .displayName
                                        }
                                    </h2>
                                    {integrationSettings.integration
                                        .capabilities.dotnet && (
                                        <span className="badge badge-sm badge-outline shrink-0">
                                            .NET{' '}
                                            {t(
                                                'codeEditors.drawer.dotnet.supported',
                                            )}
                                        </span>
                                    )}
                                    {integrationSettings.installation && (
                                        <StatusBadge tone="success">
                                            {t('codeEditors.status.available')}
                                        </StatusBadge>
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
                                        className="col-span-2 row-start-2 -ml-3 justify-self-start"
                                    />
                                ) : (
                                    <StatusBadge className="col-span-2 row-start-2 justify-self-start">
                                        {t('codeEditors.status.missing')}
                                    </StatusBadge>
                                )}
                                {!integrationSettings.installation &&
                                    (projectUsage[
                                        integrationSettings.integration.id
                                    ]?.count ?? 0) > 0 && (
                                        <p className="col-span-2 text-warning">
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
                            <div className="col-start-2 row-start-1 flex min-h-8 items-center gap-2">
                                {pendingIntegrationId ===
                                    integrationSettings.integration.id && (
                                    <span
                                        className={
                                            rescanningIntegrationId ===
                                            integrationSettings.integration.id
                                                ? 'reveal-after-one-second'
                                                : undefined
                                        }
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
                                    >
                                        <span
                                            className="loading loading-spinner loading-sm"
                                            aria-hidden="true"
                                        />
                                    </span>
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
                                        className="btn btn-sm btn-square btn-ghost"
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
                                        <StarButton
                                            data-testid={`btn-set-default-code-editor-${integrationSettings.integration.id}`}
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
                                            selected={
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
                                        />
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
                                            className="btn btn-sm btn-square btn-ghost"
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
                                <Switch
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
                            <p className="col-start-2 text-error" role="alert">
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
