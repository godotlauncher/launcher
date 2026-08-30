import { FlaskConical } from 'lucide-react';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/selectField.component';
import { TextField } from '../../../../components/ui/textField.component';
import { Tooltip } from '../../../../components/ui/tooltip.component';
import {
    type CreateProjectReleaseRow,
    getCreateProjectReleaseKey,
} from '../createProject.model';
import { CreateProjectPathField } from './create-project-path-field.component';

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
    projectNameError?: string;
    derivedProjectPath: string;
    overwriteProjectPath: boolean;
    overwriteBasePath: string;
    overwriteDisplayPath: string;
    overwritePathSuffixDisplay: string;
    showUseDefaultPathAction: boolean;
    showFolderCreateIcon: boolean;
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
    projectNameError,
    derivedProjectPath,
    overwriteProjectPath,
    overwriteBasePath,
    overwriteDisplayPath,
    overwritePathSuffixDisplay,
    showUseDefaultPathAction,
    showFolderCreateIcon,
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
                
                {selectedRelease?.prerelease && (
                    <Tooltip
                        placement="top"
                        tip={t('project.prereleaseBadge')}
                        tone="secondary"
                        role="img"
                        ariaLabel={t('project.prereleaseBadge')}
                    >
                        <span className="inline-flex size-5 shrink-0 items-center justify-center text-secondary">
                            <FlaskConical size={13} aria-hidden="true" />
                        </span>
                    </Tooltip>
                )}

                {selectedRelease?.mono && (
                    <p className="badge badge-outline badge-xs text-base-content/50">
                        {t('project.dotNetBadge')}
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
                    <div className="min-w-0 flex-1">
                        <TextField
                            inputRef={inputNameRef}
                            id="inputProjectName"
                            testId="inputProjectName"
                            ariaLabel={t('project.title')}
                            placeholder={t('project.nameplaceholder')}
                            value={projectName}
                            onChange={onProjectNameChange}
                            error={projectNameError}
                            compact
                            regularText
                        />
                    </div>
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
                            compact
                            regularText
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="z-10 min-w-0 flex-1">
                        <CreateProjectPathField
                            t={t}
                            overwriteProjectPath={overwriteProjectPath}
                            overwriteBasePath={overwriteBasePath}
                            overwriteDisplayPath={overwriteDisplayPath}
                            overwritePathSuffixDisplay={
                                overwritePathSuffixDisplay
                            }
                            derivedProjectPath={derivedProjectPath}
                            showUseDefaultPathAction={showUseDefaultPathAction}
                            showFolderCreateIcon={showFolderCreateIcon}
                            onOverwriteBasePathChange={
                                onOverwriteBasePathChange
                            }
                            onUseDefaultPath={onUseDefaultPath}
                            onSelectProjectFolder={onSelectProjectFolder}
                        />
                    </div>
                    <label className="flex items-center gap-2 sm:min-w-48">
                        <input
                            type="checkbox"
                            data-testid="checkboxOverwriteProjectPath"
                            className="checkbox checkbox-sm rounded-sm"
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
