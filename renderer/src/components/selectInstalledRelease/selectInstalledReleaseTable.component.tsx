import type { InstalledRelease } from '@shared';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useRelease } from '../../hooks/useRelease';
import { ReleaseInstallProgressIndicator } from '../releaseInstallProgress.component';
import { getSelectableReleaseKey } from './selectInstalledRelease.model';

type Translate = (
    key: string,
    options?: Record<string, string | number>,
) => string;

type SelectInstalledReleaseTableProps = {
    rows: InstalledRelease[];
    currentRelease: InstalledRelease;
    selectedRelease: InstalledRelease | null;
    t: Translate;
    onSelectedReleaseChange: (release: InstalledRelease) => void;
    onInstallReleasesClick: () => void;
};

export const SelectInstalledReleaseTable: React.FC<
    SelectInstalledReleaseTableProps
> = ({
    rows,
    currentRelease,
    selectedRelease,
    t,
    onSelectedReleaseChange,
    onInstallReleasesClick,
}) => (
    <table className="table table-md">
        <thead className="sticky top-0 bg-base-200 text-xs">
            <tr>
                <th className="w-12"></th>
                <th>{t('selectRelease.tableHeaders.name')}</th>
            </tr>
        </thead>

        <tbody className="overflow-y-auto select-none">
            {rows.length === 0 && (
                <tr>
                    <td colSpan={2} className="">
                        <div className="flex flex-row gap-2 text-warning items-center">
                            <TriangleAlert className="stroke-warning" />
                            {t('selectRelease.noReleases', {
                                version: parseInt(
                                    currentRelease.version_number.toString(),
                                    10,
                                ),
                            })}
                        </div>
                        <div>
                            <button
                                type="button"
                                className="btn btn-link"
                                onClick={onInstallReleasesClick}
                            >
                                {t('selectRelease.installReleases')}
                            </button>
                        </div>
                    </td>
                </tr>
            )}
            {rows.map((row) => (
                <ReleaseRow
                    key={`releaseSelectRow_${getSelectableReleaseKey(row)}`}
                    row={row}
                    selectedRelease={selectedRelease}
                    t={t}
                    onSelectedReleaseChange={onSelectedReleaseChange}
                />
            ))}
        </tbody>
    </table>
);

type ReleaseRowProps = {
    row: InstalledRelease;
    selectedRelease: InstalledRelease | null;
    t: Translate;
    onSelectedReleaseChange: (release: InstalledRelease) => void;
};

const ReleaseRow: React.FC<ReleaseRowProps> = ({
    row,
    selectedRelease,
    t,
    onSelectedReleaseChange,
}) => {
    const { getReleaseInstallProgress } = useRelease();

    if (row.valid === false) {
        return (
            <tr
                key={`releaseSelectInvalid_${getSelectableReleaseKey(row)}}`}
                className="opacity-60 cursor-not-allowed"
            >
                <td>
                    <TriangleAlert className="stroke-warning" />
                </td>
                <td>
                    <div className="flex flex-col gap-1">
                        <div className="flex flex-row gap-2 items-center">
                            {row.name ?? row.version}
                            <span className="badge badge-warning">
                                {t('selectRelease.unavailable')}
                            </span>
                            <ReleaseBadges row={row} t={t} />
                        </div>
                        <p className="text-xs text-warning">
                            {t('selectRelease.unavailableHint')}
                        </p>
                    </div>
                </td>
            </tr>
        );
    }

    if (!row.editor_path) {
        const progress = getReleaseInstallProgress(row.version, row.mono);

        return (
            <tr
                key={`releaseSelectInvalid_${getSelectableReleaseKey(row)}`}
                className="hover:bg-black/10 cursor-not-allowed"
            >
                <td>
                    <span className="loading loading-ring text-info p-0"></span>
                </td>
                <td>
                    <div className="flex flex-col gap-2">
                        <div>
                            {row.name ?? row.version}
                            <ReleaseBadges row={row} t={t} />
                        </div>
                        {progress && (
                            <ReleaseInstallProgressIndicator
                                progress={progress}
                                className="max-w-72"
                            />
                        )}
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr
            data-testid={`rowReleaseSelect_}`}
            onClick={() => onSelectedReleaseChange(row)}
            key={`releaseSelect_${getSelectableReleaseKey(row)}`}
            className="even:bg-base-300 hover:bg-base-content/10 cursor-pointer"
        >
            <td className="flex flex-col items-center justify-center">
                <input
                    data-testid={`radioReleaseSelect_${getSelectableReleaseKey(row)}`}
                    type="radio"
                    name="editor-select"
                    className="radio radio-sm radio-info"
                    checked={
                        row.version === selectedRelease?.version &&
                        row.mono === selectedRelease?.mono
                    }
                    onChange={() => {
                        onSelectedReleaseChange(row);
                    }}
                />
            </td>
            <td>
                <div className="flex flex-col gap-1 justify-start">
                    <div className="flex flex-row gap-2 ">
                        {row.name ?? row.version}
                        <ReleaseBadges row={row} t={t} />
                    </div>
                </div>
            </td>
        </tr>
    );
};

type ReleaseBadgesProps = {
    row: InstalledRelease;
    t: Translate;
};

const ReleaseBadges: React.FC<ReleaseBadgesProps> = ({ row, t }) => (
    <>
        {row.source === 'custom' && (
            <span className="badge badge-info">Custom</span>
        )}
        {row.mono && (
            <span className="badge badge-neutral">
                {t('selectRelease.badges.dotnet')}
            </span>
        )}
        {row.prerelease && (
            <span className="badge badge-secondary">
                {t('selectRelease.badges.prerelease')}
            </span>
        )}
    </>
);
