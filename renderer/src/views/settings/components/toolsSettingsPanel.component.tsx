import type { ToolIntegrationSummary } from '@shared/contracts';
import { Pencil, RotateCw, Wrench } from 'lucide-react';
import type React from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ToolsSettingsPanelProps = {
    active: boolean;
    t: Translate;
    tools: ToolIntegrationSummary[];
    loading: boolean;
    loadError: boolean;
    pendingToolId: string | null;
    actionErrors: Record<string, string | undefined>;
    onEdit: (tool: ToolIntegrationSummary) => void;
    onRescan: (tool: ToolIntegrationSummary) => Promise<boolean>;
};

/** Lists registered tools and their focused actions. */
export const ToolsSettingsPanel: React.FC<ToolsSettingsPanelProps> = ({
    active,
    t,
    tools,
    loading,
    loadError,
    pendingToolId,
    actionErrors,
    onEdit,
    onRescan,
}) => (
    <SettingsPanelSection active={active}>
        <p className="text-sm text-base-content/70">{t('tools.overview')}</p>
        {loading && tools.length === 0 && (
            <div className="mt-4 flex items-center gap-2" role="status">
                <span className="loading loading-spinner loading-sm" />
                <span>{t('tools.actions.loading')}</span>
            </div>
        )}
        {!loading && loadError && (
            <p className="mt-4 text-error" role="alert">
                {t('tools.errors.load')}
            </p>
        )}
        {(!loading || tools.length > 0) && !loadError && (
            <div className="mt-4 grid gap-4">
                {tools.map((tool) => {
                    const pending = pendingToolId === tool.id;
                    const available = tool.status === 'available';
                    const statusKey = `tools.status.${
                        tool.status === 'unchecked' ? 'unknown' : tool.status
                    }`;
                    return (
                        <section
                            key={tool.id}
                            className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-200/40 p-4"
                            data-testid={`tool-integration-${tool.id}`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Wrench
                                            className="size-5 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <h2 className="truncate font-semibold">
                                            {tool.displayName}
                                        </h2>
                                        <span
                                            className={`badge badge-sm ${available ? 'badge-success' : 'badge-outline'}`}
                                        >
                                            {t(statusKey)}
                                        </span>
                                    </div>
                                    {tool.executablePath ? (
                                        <CopyBadge
                                            value={tool.executablePath}
                                            label={t('common:buttons.copyPath')}
                                            copiedLabel={t('common:success')}
                                            className="self-start"
                                        />
                                    ) : (
                                        <span className="text-sm text-base-content/60">
                                            {t('tools.status.unknownPath')}
                                        </span>
                                    )}
                                    <span className="text-sm text-base-content/70">
                                        {tool.version ||
                                            t('tools.status.unknownVersion')}
                                    </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {pending && (
                                        <span
                                            className="loading loading-spinner loading-sm"
                                            role="status"
                                            aria-label={t(
                                                'tools.accessibility.scanning',
                                                { tool: tool.displayName },
                                            )}
                                        />
                                    )}
                                    <Tooltip
                                        tip={t('tools.actions.rescanTool', {
                                            tool: tool.displayName,
                                        })}
                                        placement="top"
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-square btn-ghost btn-sm"
                                            aria-label={t(
                                                'tools.actions.rescanTool',
                                                { tool: tool.displayName },
                                            )}
                                            disabled={Boolean(pendingToolId)}
                                            onClick={() => void onRescan(tool)}
                                        >
                                            <RotateCw
                                                size={16}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </Tooltip>
                                    <Tooltip
                                        tip={t('tools.actions.editTool', {
                                            tool: tool.displayName,
                                        })}
                                        placement="top"
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-square btn-ghost btn-sm"
                                            aria-label={t(
                                                'tools.actions.editTool',
                                                { tool: tool.displayName },
                                            )}
                                            disabled={Boolean(pendingToolId)}
                                            onClick={() => onEdit(tool)}
                                        >
                                            <Pencil
                                                size={16}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                            {actionErrors[tool.id] && (
                                <p className="text-sm text-error" role="alert">
                                    {actionErrors[tool.id]}
                                </p>
                            )}
                        </section>
                    );
                })}
            </div>
        )}
    </SettingsPanelSection>
);
