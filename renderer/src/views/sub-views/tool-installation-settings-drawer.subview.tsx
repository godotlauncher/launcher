import type { ToolIntegrationSummary } from '@shared/contracts';
import logger from 'electron-log';
import { RotateCw } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyBadge } from '../../components/ui/copy-badge.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { StatusBadge } from '../../components/ui/status-badge.component';

type ToolInstallationSettingsDrawerProps = {
    tool: ToolIntegrationSummary | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRescan: (toolId: string) => Promise<boolean>;
};

/**
 * Displays installation details for tools without specialised settings.
 *
 * @param props - Selected tool, drawer state, and rescan callbacks.
 * @returns The installation-only tool settings drawer.
 */
export const ToolInstallationSettingsDrawer: React.FC<
    ToolInstallationSettingsDrawerProps
> = ({ tool, open, onOpenChange, onRescan }) => {
    const { t } = useTranslation(['settings', 'common']);
    const [rescanning, setRescanning] = useState(false);
    const [rescanError, setRescanError] = useState(false);

    /**
     * Rescans the selected tool and records any visible failure state.
     *
     * @returns A promise that resolves after the rescan finishes.
     */
    const handleRescan = async () => {
        if (!tool || rescanning) {
            return;
        }
        setRescanning(true);
        setRescanError(false);
        try {
            setRescanError(!(await onRescan(tool.id)));
        } catch {
            logger.error('Failed to rescan tool integration');
            setRescanError(true);
        } finally {
            setRescanning(false);
        }
    };

    const available = tool?.status === 'available';
    const statusKey = tool
        ? `tools.status.${tool.status === 'unchecked' ? 'unknown' : tool.status}`
        : 'tools.status.unknown';
    const toolName = tool?.displayName ?? '';

    return (
        <Drawer
            open={open && Boolean(tool) && tool?.id !== 'git'}
            onOpenChange={onOpenChange}
            side="right"
            ariaLabel={t('tools.installation.drawerTitle', {
                tool: toolName,
            })}
            width={560}
            panelClassName="max-w-[100vw]"
        >
            <Drawer.Header className="items-center">
                <Drawer.Title className="text-lg font-semibold">
                    {t('tools.installation.drawerTitle', { tool: toolName })}
                </Drawer.Title>
                <Drawer.CloseButton className="btn-sm" />
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-[8px] text-base">
                <section className="flex flex-col gap-[12px]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-[4px]">
                            <h3 className="font-semibold">
                                {t('tools.installation.title')}
                            </h3>
                            <p className="text-base-content/75">
                                {t('tools.installation.description', {
                                    tool: toolName,
                                })}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost shrink-0 text-base"
                            onClick={() => void handleRescan()}
                            disabled={rescanning}
                        >
                            {rescanning ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <RotateCw size={15} aria-hidden="true" />
                            )}
                            {rescanning
                                ? t('tools.actions.scanning')
                                : t('tools.actions.rescan')}
                        </button>
                    </div>
                    <div className="flex flex-col gap-[4px] bg-base-200/60 p-4">
                        {rescanError && (
                            <p className="text-error" role="alert">
                                {t('tools.errors.rescan')}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-base text-base-content/75">
                                {tool?.version ||
                                    t('tools.status.unknownVersion')}
                            </span>
                            <StatusBadge
                                tone={available ? 'success' : 'neutral'}
                            >
                                {t(statusKey)}
                            </StatusBadge>
                        </div>
                        {tool?.executablePath ? (
                            <CopyBadge
                                value={tool.executablePath}
                                label={t('common:buttons.copyPath')}
                                copiedLabel={t('common:success')}
                                className="-ml-3 self-start"
                            />
                        ) : (
                            <span className="text-base-content/75">
                                {t('tools.status.unknownPath')}
                            </span>
                        )}
                    </div>
                </section>
            </Drawer.Body>
        </Drawer>
    );
};
