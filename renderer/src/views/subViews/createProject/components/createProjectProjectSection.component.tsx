import type { InstalledRelease } from '@shared';
import { Folder, FolderPlus } from 'lucide-react';
import type React from 'react';
import { Tooltip } from '../../../../components/ui/tooltip.component';

type Translate = (key: string) => string;

type CreateProjectProjectSectionProps = {
    t: Translate;
    releases: InstalledRelease[];
    releaseIndex: number;
    inputNameRef: React.RefObject<HTMLInputElement | null>;
    installedReleaseCount: number;
    derivedProjectPath: string;
    overwriteProjectPath: boolean;
    overwriteBasePath: string;
    overwriteDisplayPath: string;
    overwritePathSuffixDisplay: string;
    showUseDefaultPathAction: boolean;
    showFolderCreateIcon: boolean;
    overwriteBasePathMissing: boolean;
    isOverwritePathEmpty: boolean;
    onProjectNameChange: (value: string) => void;
    onReleaseChange: (index: number) => void;
    onOverwriteBasePathChange: (value: string) => void;
    onUseDefaultPath: () => void;
    onSelectProjectFolder: () => void;
    onOverwriteProjectPathChange: (enabled: boolean) => void;
};

export const CreateProjectProjectSection: React.FC<
    CreateProjectProjectSectionProps
> = ({
    t,
    releases,
    releaseIndex,
    inputNameRef,
    installedReleaseCount,
    derivedProjectPath,
    overwriteProjectPath,
    overwriteBasePath,
    overwriteDisplayPath,
    overwritePathSuffixDisplay,
    showUseDefaultPathAction,
    showFolderCreateIcon,
    overwriteBasePathMissing,
    isOverwritePathEmpty,
    onProjectNameChange,
    onReleaseChange,
    onOverwriteBasePathChange,
    onUseDefaultPath,
    onSelectProjectFolder,
    onOverwriteProjectPathChange,
}) => {
    const selectedRelease = releases[releaseIndex];

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-row gap-2 items-center">
                <h2 className="text-md">{t('project.title')}</h2>
                {selectedRelease?.mono && (
                    <p className="badge badge-outline text-base-content/50">
                        {t('project.dotNetBadge')}
                    </p>
                )}
                {selectedRelease?.prerelease && (
                    <p className="badge badge-outline text-base-content/50">
                        {t('project.prereleaseBadge')}
                    </p>
                )}
            </div>
            {installedReleaseCount < 1 && (
                <p className="text-warning">
                    {t('project.noVersionsInstalled')}
                </p>
            )}
            <div className="flex flex-row gap-2">
                <div className="flex flex-col gap-2 w-full">
                    <input
                        ref={inputNameRef}
                        data-testid="inputProjectName"
                        className="input input-bordered w-full"
                        type="text"
                        placeholder={t('project.nameplaceholder')}
                        onChange={(event) =>
                            onProjectNameChange(
                                event.target.value.replace(/\s/g, '-'),
                            )
                        }
                        onKeyDown={(event) => {
                            if (event.key === ' ') {
                                event.currentTarget.value = `${event.currentTarget.value}-`;
                                event.preventDefault();
                            }
                        }}
                    />
                    <label className="input w-full z-10">
                        <input
                            data-testid="inputProjectPath"
                            className="input input-bordered w-full active:outline-0 outline-0"
                            type="text"
                            value={
                                overwriteProjectPath
                                    ? overwriteBasePath
                                    : derivedProjectPath
                            }
                            title={
                                overwriteProjectPath
                                    ? overwriteDisplayPath
                                    : derivedProjectPath
                            }
                            onChange={(event) =>
                                onOverwriteBasePathChange(event.target.value)
                            }
                            disabled={!overwriteProjectPath}
                        />
                        {overwriteProjectPath && (
                            <span
                                data-testid="overwriteProjectPathSuffix"
                                className="max-w-45 whitespace-nowrap text-base-content/50 select-none "
                            >
                                {overwritePathSuffixDisplay}
                            </span>
                        )}
                        {showUseDefaultPathAction && (
                            <button
                                type="button"
                                data-testid="btnUseDefaultProjectPath"
                                className="btn btn-ghost btn-xs h-6 min-h-6 px-2 text-xs"
                                onClick={onUseDefaultPath}
                            >
                                {t('project.useDefaultPath')}
                            </button>
                        )}
                        {overwriteProjectPath && (
                            <Tooltip
                                tip={t('project.selectFolderTooltip')}
                                placement="top"
                            >
                                <button
                                    type="button"
                                    data-testid="btnSelectProjectFolder"
                                    className="flex items-center"
                                    data-path-missing={overwriteBasePathMissing}
                                    disabled={!overwriteProjectPath}
                                    onClick={onSelectProjectFolder}
                                >
                                    {showFolderCreateIcon ? (
                                        <FolderPlus className="w-5 h-5 stroke-primary" />
                                    ) : (
                                        <Folder className="w-5 h-5 fill-base-content hover:fill-primary hover:stroke-primary" />
                                    )}
                                </button>
                            </Tooltip>
                        )}
                    </label>
                    {overwriteProjectPath && isOverwritePathEmpty && (
                        <p
                            data-testid="msgOverwritePathRequired"
                            className="text-error text-xs"
                        >
                            {t('project.overwritePathRequired')}
                        </p>
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <select
                        className="select select-bordered w-[300px]"
                        onChange={(event) =>
                            onReleaseChange(+event.target.value)
                        }
                    >
                        {releases.map((release, index) => (
                            <option
                                disabled={release.editor_path?.length === 0}
                                key={`createProjectReleaseOption_${release.version}_${release.mono ? 'mono' : 'std'}`}
                                value={index}
                            >
                                {release.editor_path?.length > 0
                                    ? `${release.name ?? release.version}${release.name ? ` (${release.version})` : ''} ${release.mono ? `[${t('project.dotNetBadge')}]` : ''}${release.source === 'custom' ? ' [Custom]' : ''}`
                                    : `${release.name ?? release.version} ${t('project.downloading')}`}
                            </option>
                        ))}
                    </select>
                    <label className="flex h-10 cursor-pointer gap-2 items-center w-[300px]">
                        <input
                            type="checkbox"
                            data-testid="checkboxOverwriteProjectPath"
                            className="checkbox"
                            checked={overwriteProjectPath}
                            onChange={(event) =>
                                onOverwriteProjectPathChange(
                                    event.target.checked,
                                )
                            }
                        />
                        <span className="">{t('project.overwritePath')}</span>
                    </label>
                </div>
            </div>
        </div>
    );
};
