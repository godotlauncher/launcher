import { Folder } from 'lucide-react';
import type React from 'react';
import { PathField } from '../../../../components/ui/path-field.component';

type Translate = (key: string) => string;

type CreateProjectPathFieldProps = {
    t: Translate;
    separatePreview?: boolean;
    availabilityAdornment?: React.ReactNode;
    overwriteBasePath: string;
    overwriteDisplayPath: string;
    overwritePathSuffixDisplay: string;
    showUseDefaultPathAction: boolean;
    showFolderCreateIcon: boolean;
    onOverwriteBasePathChange: (value: string) => void;
    onUseDefaultPath: () => void;
    onSelectProjectFolder: () => void;
};

/**
 * Renders the Create Project path control and its guarded suffix.
 *
 * @param props - Derived path state and Create Project path actions.
 * @returns The editable directory browser field.
 */
export const CreateProjectPathField: React.FC<CreateProjectPathFieldProps> = ({
    t,
    separatePreview = false,
    availabilityAdornment,
    overwriteBasePath,
    overwriteDisplayPath,
    overwritePathSuffixDisplay,
    showUseDefaultPathAction,
    onOverwriteBasePathChange,
    onUseDefaultPath,
    onSelectProjectFolder,
}) => {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <PathField
                id="inputProjectPath"
                labelAction={availabilityAdornment}
                testId="inputProjectPath"
                label={t(
                    separatePreview
                        ? 'duplicate.parentFolder'
                        : 'project.overwritePath',
                )}
                ariaLabel={t(
                    separatePreview
                        ? 'duplicate.parentFolder'
                        : 'project.overwritePath',
                )}
                value={overwriteBasePath}
                title={overwriteDisplayPath}
                suffix={
                    separatePreview ? undefined : overwritePathSuffixDisplay
                }
                onChange={onOverwriteBasePathChange}
                onSelect={onSelectProjectFolder}
                browseKind="directory"
                browseTestId="btnSelectProjectFolder"
                browseIcon={<Folder size={16} aria-hidden="true" />}
                browseLabel={t('project.selectFolderTooltip')}
                inputAction={
                    showUseDefaultPathAction ? (
                        <button
                            type="button"
                            data-testid="btnUseDefaultProjectPath"
                            className="btn btn-sm btn-ghost shrink-0 text-base"
                            onClick={onUseDefaultPath}
                        >
                            {t('project.useDefaultPath')}
                        </button>
                    ) : undefined
                }
            />
            {separatePreview && (
                <p
                    className="break-all text-sm text-base-content/60"
                    data-testid="duplicateDestinationPreview"
                >
                    <span>{t('duplicate.newProjectFolder')}: </span>
                    {overwriteDisplayPath}
                </p>
            )}
        </div>
    );
};
