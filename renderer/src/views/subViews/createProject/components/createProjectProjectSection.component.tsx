import { Folder, FolderPlus } from 'lucide-react';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/selectField.component';
import { Tooltip } from '../../../../components/ui/tooltip.component';
import {
    type CreateProjectReleaseRow,
    getCreateProjectReleaseKey,
} from '../createProject.model';

type Translate = (
    key: string,
    options?: { ns?: string; position?: number },
) => string;

type CreateProjectProjectSectionProps = {
    t: Translate;
    releases: CreateProjectReleaseRow[];
    releaseKey: string;
    inputNameRef: React.RefObject<HTMLInputElement | null>;
    installedReleaseCount: number;
    projectName: string;
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
    onReleaseChange: (releaseKey: string) => void;
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
    releaseKey,
    inputNameRef,
    installedReleaseCount,
    projectName,
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
    const selectedRelease = releases.find(
        (release) => getCreateProjectReleaseKey(release) === releaseKey,
    );

    /**
     * Gets the translated status for one editor install option.
     *
     * @param release - Create Project editor option.
     * @returns The current translated install stage.
     */
    const getInstallStatus = (release: CreateProjectReleaseRow): string => {
        if (
            release.installStage === 'queued' &&
            release.queuePosition !== undefined
        ) {
            return t('progress.queuedPosition', {
                ns: 'installEditor',
                position: release.queuePosition,
            });
        }

        return t(`progress.${release.installStage ?? 'preparing'}`, {
            ns: 'installEditor',
        });
    };

    const releaseOptions: SelectFieldOption[] = releases.map((release) => ({
        value: getCreateProjectReleaseKey(release),
        label:
            release.valid === false
                ? `${release.name ?? release.version} - ${t('table.status.unavailable', { ns: 'installEditor' })}`
                : release.editor_path?.length > 0
                  ? `${release.name ?? release.version}${release.name ? ` (${release.version})` : ''} ${release.mono ? `[${t('project.dotNetBadge')}]` : ''}${release.source === 'custom' ? ' [Custom]' : ''}`
                  : `${release.name ?? release.version} - ${getInstallStatus(release)}`,
        disabled: release.valid === false || release.editor_path?.length === 0,
    }));

    if (!selectedRelease) {
        releaseOptions.unshift({
            value: '',
            label: t('project.noVersionsInstalled'),
            disabled: true,
        });
    }

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
            <div className="flex flex-col gap-3">
                <div className="flex flex-row gap-3">
                    <input
                        ref={inputNameRef}
                        data-testid="inputProjectName"
                        className="input input-bordered w-full"
                        type="text"
                        placeholder={t('project.nameplaceholder')}
                        value={projectName}
                        onChange={(event) =>
                            onProjectNameChange(event.target.value)
                        }
                    />
                    <div className="w-1/3">
                        <SelectField
                            id="selectCreateProjectGodotEditor"
                            testId="selectCreateProjectGodotEditor"
                            ariaLabel={t(
                                'projects:editProject.godotEditor.title',
                            )}
                            value={releaseKey}
                            onChange={onReleaseChange}
                            options={releaseOptions}
                            showSelectedCheck
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="input z-10 min-w-0 flex-1">
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
                    <label className="flex items-center gap-2 sm:min-w-48">
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
                        <span>{t('project.overwritePath')}</span>
                    </label>
                </div>
                {overwriteProjectPath && isOverwritePathEmpty && (
                    <p
                        data-testid="msgOverwritePathRequired"
                        className="text-error text-xs sm:ml-[12.75rem]"
                    >
                        {t('project.overwritePathRequired')}
                    </p>
                )}
            </div>
        </div>
    );
};
