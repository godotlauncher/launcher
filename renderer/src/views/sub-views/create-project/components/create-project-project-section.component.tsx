import type React from 'react';
import { FormField } from '../../../../components/ui/form-field.component';
import { TextField } from '../../../../components/ui/text-field.component';
import { CreateProjectPathField } from './create-project-path-field.component';

type Translate = (
    key: string,
    options?: { ns?: string; position?: number },
) => string;

type CreateProjectProjectSectionProps = {
    t: Translate;
    inputNameRef: React.RefObject<HTMLInputElement | null>;
    editorPicker: React.ReactNode;
    destinationStatus?: React.ReactNode;
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
    destinationStatus,
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
            <div className="flex flex-col gap-2">
                <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2">
                    <div className="min-w-0 flex-1">
                        <TextField
                            inputRef={inputNameRef}
                            id="inputProjectName"
                            testId="inputProjectName"
                            label={t('project.nameplaceholder')}
                            ariaLabel={t('project.title')}
                            placeholder={t('project.nameplaceholder')}
                            value={projectName}
                            onChange={onProjectNameChange}
                            error={projectNameError}
                        />
                    </div>
                    <FormField
                        id="createProjectEditorField"
                        label={t('editorPicker.title')}
                    >
                        {editorPicker}
                    </FormField>
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
                {isOverwritePathEmpty ? (
                    <p
                        data-testid="msgOverwritePathRequired"
                        className="min-h-5 text-sm text-error"
                    >
                        {t('project.overwritePathRequired')}
                    </p>
                ) : (
                    destinationStatus
                )}
            </div>
        </div>
    );
};
