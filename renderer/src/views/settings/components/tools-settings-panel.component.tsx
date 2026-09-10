import type { ToolIntegrationSummary } from '@shared/contracts';
import {
    Database,
    GitBranch,
    Pencil,
    RotateCw,
    Terminal,
    Wrench,
} from 'lucide-react';
import type React from 'react';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { StatusBadge } from '../../../components/ui/status-badge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { SettingsPanelSection } from './settings-panel-section.component';

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

/**
 * Lists registered tools with their status and focused actions.
 * @param props - Tool summaries, loading state and action callbacks.
 */
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
        <p className="text-base text-base-content/75">{t('tools.overview')}</p>
        {loading && tools.length === 0 && (
            <div className="flex items-center gap-2" role="status">
                <span className="loading loading-spinner loading-sm" />
                <span>{t('tools.actions.loading')}</span>
            </div>
        )}
        {!loading && loadError && (
            <p className="text-error" role="alert">
                {t('tools.errors.load')}
            </p>
        )}
        {(!loading || tools.length > 0) && !loadError && (
            <div className="grid gap-4 text-base">
                {tools.map((tool) => {
                    const ToolIcon =
                        tool.id === 'git'
                            ? GitBranch
                            : tool.id === 'git-lfs'
                              ? Database
                              : tool.id === 'terminal'
                                ? Terminal
                                : Wrench;
                    const pending = pendingToolId === tool.id;
                    const available = tool.status === 'available';
                    const statusKey = `tools.status.${
                        tool.status === 'unchecked' ? 'unknown' : tool.status
                    }`;
                    return (
                        <section
                            key={tool.id}
                            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-3 bg-base-200/40 p-4"
                            data-testid={`tool-integration-${tool.id}`}
                        >
                            <div className="flex min-h-8 items-center">
                                <ToolIcon
                                    className="size-5 shrink-0"
                                    aria-hidden="true"
                                />
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-[4px]">
                                <div className="contents">
                                    <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-2">
                                        <h2 className="truncate font-semibold">
                                            {tool.displayName}
                                        </h2>
                                        <StatusBadge
                                            tone={
                                                available
                                                    ? 'success'
                                                    : 'neutral'
                                            }
                                        >
                                            {t(statusKey)}
                                        </StatusBadge>
                                    </div>
                                    {tool.executablePath ? (
                                        <CopyBadge
                                            value={tool.executablePath}
                                            label={t('common:buttons.copyPath')}
                                            copiedLabel={t('common:success')}
                                            className="col-span-2 row-start-2 -ml-3 justify-self-start"
                                        />
                                    ) : tool.id === 'terminal' &&
                                      tool.status === 'disabled' ? null : (
                                        <span className="col-span-2 row-start-2 text-base-content/75">
                                            {t('tools.status.unknownPath')}
                                        </span>
                                    )}
                                    {tool.id !== 'terminal' && (
                                        <span className="col-span-2 row-start-3 text-sm text-base-content/75">
                                            {tool.version ||
                                                t(
                                                    'tools.status.unknownVersion',
                                                )}
                                        </span>
                                    )}
                                </div>
                                <div className="col-start-2 row-start-1 flex min-h-8 items-center gap-2">
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
                                            className="btn btn-sm btn-square btn-ghost"
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
                                            className="btn btn-sm btn-square btn-ghost"
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
                                <p
                                    className="col-start-2 text-error"
                                    role="alert"
                                >
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
