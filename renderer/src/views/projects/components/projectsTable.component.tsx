import type { ProjectDetails } from '@shared';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import {
    ChevronDown,
    ChevronsUpDown,
    ChevronUp,
    Copy,
    EllipsisVertical,
    TriangleAlert,
} from 'lucide-react';
import type React from 'react';
import gitIconColor from '../../../assets/icons/git_icon_color.svg';
import vscodeIcon from '../../../assets/icons/vscode.svg';
import { Tooltip } from '../../../components/ui/tooltip.component';
import {
    getInvalidProjectTableKey,
    type ProjectSortData,
} from '../projectsView.model';

TimeAgo.addLocale(en);
const timeAgo = new TimeAgo('en-US');

type ProjectsTableProps = {
    rows: ProjectDetails[];
    loading: boolean;
    busyProjects: string[];
    sortData: ProjectSortData;
    onSortChange: (sortData: ProjectSortData) => void;
    isInstalledRelease: (version: string, mono: boolean) => boolean;
    isProjectEditorDownloading: (project: ProjectDetails) => boolean;
    onLaunchProject: (project: ProjectDetails) => void;
    onChangeEditor: (project: ProjectDetails) => void;
    onProjectMoreOptions: (
        event: React.MouseEvent,
        project: ProjectDetails,
    ) => void;
    t: (key: string) => string;
};

function getProjectVersionLabel(project: ProjectDetails): React.ReactNode {
    return (
        <>
            {project.version} {project.release.mono && '(.NET)'}
        </>
    );
}

export const ProjectsTable: React.FC<ProjectsTableProps> = ({
    rows,
    loading,
    busyProjects,
    sortData,
    onSortChange,
    isInstalledRelease,
    isProjectEditorDownloading,
    onLaunchProject,
    onChangeEditor,
    onProjectMoreOptions,
    t,
}) => {
    const toggleSort = (field: string) => {
        onSortChange({
            field,
            order:
                sortData.field === field && sortData.order === 'asc'
                    ? 'desc'
                    : 'asc',
        });
    };

    const getSortIcon = (field: string) => {
        if (sortData.field !== field) {
            return null;
        }

        return sortData.order === 'asc' ? (
            <ChevronUp className="w-4 h-4 ml-2 cursor-pointer" />
        ) : (
            <ChevronDown className="w-4 h-4 ml-2 cursor-pointer" />
        );
    };

    const renderProjectEditorLabel = (project: ProjectDetails) => {
        if (isProjectEditorDownloading(project)) {
            return (
                <div className="flex flex-row items-center gap-2">
                    <span className="loading loading-spinner loading-xs"></span>
                    <p>{getProjectVersionLabel(project)}</p>
                </div>
            );
        }

        if (
            !isInstalledRelease(project.release.version, project.release.mono)
        ) {
            return (
                <div className="flex flex-row items-center gap-2">
                    <TriangleAlert size={16} className="stroke-warning" />
                    <p className="line-through">
                        {getProjectVersionLabel(project)}
                    </p>
                </div>
            );
        }

        return getProjectVersionLabel(project);
    };

    if (loading) {
        return <div className="loading loading-dots loading-lg"></div>;
    }

    return (
        <div className="overflow-auto h-full">
            <table className="table table-md table-pin-rows">
                <thead className="bg-base-200 text-xs">
                    <tr>
                        <th className="min-w-48 w-full">
                            <button
                                type="button"
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => toggleSort('name')}
                            >
                                {t('table.name')}
                                {getSortIcon('name')}
                            </button>
                        </th>
                        <th className="w-44 min-w-44">
                            <button
                                type="button"
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => toggleSort('modified')}
                            >
                                {t('table.modified')}
                                {getSortIcon('modified')}
                            </button>
                        </th>
                        <th className="w-60 min-w-60">{t('table.editor')}</th>
                        <th className=""></th>
                    </tr>
                </thead>
                <tbody className="overflow-y-auto">
                    {rows.map((row) => {
                        const editorDownloading =
                            isProjectEditorDownloading(row);

                        return (
                            <tr
                                key={`projectRow_${row.path}`}
                                className="relative hover:bg-base-content/5"
                            >
                                <td className="p-2 flex flex-col gap-1">
                                    {busyProjects.includes(row.path) && (
                                        <div className="absolute bg-black/50 inset-0 z-10 flex items-center justify-center rounded-lg ">
                                            <div className="loading loading-bars"></div>
                                        </div>
                                    )}
                                    <div className="font-bold flex text-lg gap-2 items-center justify-start">
                                        {!row.valid && (
                                            <Tooltip
                                                tip={t(
                                                    getInvalidProjectTableKey(
                                                        row,
                                                    ),
                                                )}
                                            >
                                                <TriangleAlert className="stroke-warning" />
                                            </Tooltip>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onLaunchProject(row)}
                                            className="flex items-center hover:underline gap-2"
                                        >
                                            {row.name}
                                        </button>
                                        {row.withVSCode && (
                                            <Tooltip
                                                tip={t('table.vsCodeProject')}
                                                tone="primary"
                                                className="flex items-center"
                                            >
                                                <span className="text-xs text-base-content/50 ">
                                                    <img
                                                        src={vscodeIcon}
                                                        className="w-4 h-4"
                                                        alt="VSCode"
                                                    />
                                                </span>
                                            </Tooltip>
                                        )}
                                        {row.withGit && (
                                            <Tooltip
                                                tip={t('table.gitProject')}
                                                tone="primary"
                                                className="flex items-center"
                                            >
                                                <span className="text-xs text-base-content/50 ">
                                                    <img
                                                        src={gitIconColor}
                                                        className="w-4 h-4 "
                                                        alt="Git"
                                                    />
                                                </span>
                                            </Tooltip>
                                        )}
                                        {row.release.mono && (
                                            <Tooltip
                                                tip={t('table.dotNetProject')}
                                                tone="primary"
                                                className="flex items-center"
                                            >
                                                <span className="badge badge-outline text-xs text-base-content/50 ">
                                                    c#
                                                </span>
                                            </Tooltip>
                                        )}
                                        {row.release.prerelease && (
                                            <Tooltip
                                                tip={t('table.prerelease')}
                                                tone="secondary"
                                                className="right-0 flex items-center"
                                            >
                                                <span className="badge badge-secondary badge-outline text-xs text-base-content/50 ">
                                                    pr
                                                </span>
                                            </Tooltip>
                                        )}
                                        {row.open_windowed && (
                                            <Tooltip
                                                tip={t('table.windowedMode')}
                                                tone="primary"
                                                className="flex items-center"
                                            >
                                                <span className="badge badge-outline text-xs text-base-content/50">
                                                    w
                                                </span>
                                            </Tooltip>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            window.navigator.clipboard.writeText(
                                                row.path,
                                            );
                                        }}
                                        className="py-0 text-xs flex rounded-full bg-base-100 px-2 text-base-content/50 items-center active:text-secondary"
                                    >
                                        <p className="flex-1 w-0 overflow-hidden whitespace-nowrap text-ellipsis text-left">
                                            {row.path}
                                        </p>
                                        <Copy className="stroke-base-content/50 w-4 hover:stroke-info active:stroke-secondary" />
                                    </button>
                                </td>

                                <td className="">
                                    <p>
                                        {row.last_opened
                                            ? timeAgo.format(row.last_opened)
                                            : '-'}
                                    </p>
                                </td>
                                <td className="">
                                    <div>
                                        <button
                                            type="button"
                                            disabled={editorDownloading}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onChangeEditor(row);
                                            }}
                                            className="btn btn-ghost bg-base-content/5 pr-2 w-full justify-between"
                                        >
                                            {renderProjectEditorLabel(row)}
                                            <ChevronsUpDown />
                                        </button>
                                    </div>
                                </td>
                                <td className="p-0 pr-2">
                                    <button
                                        type="button"
                                        onClick={(event) =>
                                            onProjectMoreOptions(event, row)
                                        }
                                        className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"
                                    >
                                        <EllipsisVertical />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
