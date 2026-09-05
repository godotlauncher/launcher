import type React from 'react';
import { TextField } from '../../../../components/ui/textField.component';
import { CreateProjectPathField } from './create-project-path-field.component';

type Translate = (
    key: string,
    options?: { ns?: string; position?: number },
) => string;

type CreateProjectProjectSectionProps = {
    t: Translate;
    inputNameRef: React.RefObject<HTMLInputElement | null>;
    editorPicker: React.ReactNode;
    projectName: string;
    projectNameError?: string;
    overwriteBasePath: string;
    overwriteDisplayPath: string;
    overwritePathSuffixDisplay: string;
    showUseDefaultPathAction: boolean;
    showFolderCreateIcon: boolean;
    isOverwritePathEmpty: boolean;
    onProjectNameChange: (value: string) => void;
    onOverwriteBasePathChange: (value: string) => void;
    onUseDefaultPath: () => void;
    onSelectProjectFolder: () => void;
};

/**
 * Renders project identity, editor selection, and destination controls.
 *
 * @param props - Project field values, actions, and the reusable editor picker.
 * @returns The primary Create Project form section.
 */
export const CreateProjectProjectSection: React.FC<
    CreateProjectProjectSectionProps
> = ({
    t,
    inputNameRef,
    editorPicker,
    projectName,
    projectNameError,
    overwriteBasePath,
    overwriteDisplayPath,
    overwritePathSuffixDisplay,
    showUseDefaultPathAction,
    showFolderCreateIcon,
    isOverwritePathEmpty,
    onProjectNameChange,
    onOverwriteBasePathChange,
    onUseDefaultPath,
    onSelectProjectFolder,
}) => {
    return (
        <div className="flex flex-col gap-2">
            <h2 className="text-md">{t('project.title')}</h2>
            <div className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
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
                    <div className="min-w-0 sm:w-1/3 sm:shrink-0">
                        {editorPicker}
                    </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="z-10 min-w-0 flex-1">
                        <CreateProjectPathField
                            t={t}
                            overwriteBasePath={overwriteBasePath}
                            overwriteDisplayPath={overwriteDisplayPath}
                            overwritePathSuffixDisplay={
                                overwritePathSuffixDisplay
                            }
                            showUseDefaultPathAction={showUseDefaultPathAction}
                            showFolderCreateIcon={showFolderCreateIcon}
                            onOverwriteBasePathChange={
                                onOverwriteBasePathChange
                            }
                            onUseDefaultPath={onUseDefaultPath}
                            onSelectProjectFolder={onSelectProjectFolder}
                        />
                    </div>
                </div>
                {isOverwritePathEmpty && (
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
