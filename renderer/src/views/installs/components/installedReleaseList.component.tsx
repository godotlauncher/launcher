import type { InstalledRelease } from '@shared';
import { EllipsisVertical, TriangleAlert } from 'lucide-react';
import type React from 'react';
import type { ReleaseAction } from '../installsView.model';

type Translate = (key: string, options?: { ns?: string }) => string;

type InstalledReleaseListProps = {
    rows: InstalledRelease[];
    t: Translate;
    isReleaseActionBusy: (
        release: InstalledRelease,
        action?: ReleaseAction,
    ) => boolean;
    onRetry: (release: InstalledRelease) => void;
    onReinstall: (release: InstalledRelease) => void;
    onRemove: (release: InstalledRelease) => void;
    onOpenReleaseMoreOptions: (
        event: React.MouseEvent,
        release: InstalledRelease,
    ) => void;
};

export const InstalledReleaseList: React.FC<InstalledReleaseListProps> = ({
    rows,
    t,
    isReleaseActionBusy,
    onRetry,
    onReinstall,
    onRemove,
    onOpenReleaseMoreOptions,
}) => (
    <div className="overflow-auto h-full">
        <table className="table table-md">
            <thead className="sticky top-0 bg-base-200 text-xs">
                <tr>
                    <th>{t('table.name')}</th>
                    <th></th>
                </tr>
            </thead>

            <tbody className="overflow-y-auto">
                {rows.map((row) => (
                    <tr
                        key={`installedReleaseRow_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                        className="even:bg-base-100 hover:bg-base-content/10"
                    >
                        <td>
                            <div className="flex flex-col gap-1">
                                <div className="flex flex-row gap-2 flex-wrap items-center">
                                    {row.valid === false && (
                                        <TriangleAlert className="w-4 h-4 text-warning" />
                                    )}
                                    <span>{row.name ?? row.version}</span>
                                    {row.source === 'custom' && (
                                        <span className="badge badge-info">
                                            {t('badges.custom')}
                                        </span>
                                    )}
                                    {row.mono && (
                                        <span className="badge">
                                            {t('badges.dotNet')}
                                        </span>
                                    )}
                                    {row.prerelease && (
                                        <span className="badge badge-secondary">
                                            {t('badges.prerelease')}
                                        </span>
                                    )}
                                </div>
                                {row.name && (
                                    <div className="text-xs text-base-content/50">
                                        {row.version}
                                    </div>
                                )}
                                <div className="text-xs text-base-content/50 flex flex-col gap-1">
                                    {row.valid === false ? (
                                        <>
                                            <span>
                                                {row.source === 'custom'
                                                    ? t(
                                                          'messages.unavailableCustomEditorHint',
                                                      )
                                                    : t(
                                                          'messages.unavailableHintWithReinstall',
                                                      )}
                                            </span>
                                            <div className="flex flex-row flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className="btn btn-xs flex items-center gap-2"
                                                    onClick={() => onRetry(row)}
                                                    disabled={isReleaseActionBusy(
                                                        row,
                                                    )}
                                                >
                                                    {isReleaseActionBusy(
                                                        row,
                                                        'retry',
                                                    ) && (
                                                        <span className="loading loading-spinner loading-xs"></span>
                                                    )}
                                                    {t('buttons.retry', {
                                                        ns: 'common',
                                                    })}
                                                </button>
                                                {row.source !== 'custom' && (
                                                    <button
                                                        type="button"
                                                        data-testid={`btnReinstallRelease_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                                        className="btn btn-primary btn-xs flex items-center gap-2"
                                                        onClick={() =>
                                                            onReinstall(row)
                                                        }
                                                        disabled={isReleaseActionBusy(
                                                            row,
                                                        )}
                                                        aria-label={t(
                                                            'buttons.reinstall',
                                                            {
                                                                ns: 'common',
                                                            },
                                                        )}
                                                    >
                                                        {isReleaseActionBusy(
                                                            row,
                                                            'reinstall',
                                                        ) && (
                                                            <span className="loading loading-spinner loading-xs"></span>
                                                        )}
                                                        {t(
                                                            'buttons.reinstall',
                                                            {
                                                                ns: 'common',
                                                            },
                                                        )}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    data-testid={`btnRemoveRelease_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                                    className="btn btn-error btn-xs"
                                                    onClick={() =>
                                                        onRemove(row)
                                                    }
                                                    disabled={isReleaseActionBusy(
                                                        row,
                                                    )}
                                                >
                                                    {isReleaseActionBusy(
                                                        row,
                                                        'remove',
                                                    ) && (
                                                        <span className="loading loading-spinner loading-xs"></span>
                                                    )}
                                                    {t('buttons.remove', {
                                                        ns: 'common',
                                                    })}
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        row.install_path || (
                                            <div className="flex flex-row gap-2 items-center">
                                                <div className="loading loading-ring loading-sm"></div>
                                                {t('status.installing')}
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        </td>
                        <td className="flex flex-row justify-end">
                            {row.install_path && row.valid !== false && (
                                <button
                                    type="button"
                                    onClick={(event) =>
                                        onOpenReleaseMoreOptions(event, row)
                                    }
                                    className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"
                                >
                                    <EllipsisVertical />
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
