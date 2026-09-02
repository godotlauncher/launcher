import { Folder } from 'lucide-react';
import type React from 'react';
import { PathField } from '../../../../components/ui/pathField.component';
import { TextField } from '../../../../components/ui/textField.component';

type Translate = (key: string) => string;

type CreateProjectPathFieldProps = {
    t: Translate;
    overwriteProjectPath: boolean;
    overwriteBasePath: string;
    overwriteDisplayPath: string;
    overwritePathSuffixDisplay: string;
    derivedProjectPath: string;
    showUseDefaultPathAction: boolean;
    showFolderCreateIcon: boolean;
    onOverwriteBasePathChange: (value: string) => void;
    onUseDefaultPath: () => void;
    onSelectProjectFolder: () => void;
};

/**
 * Renders the compact Create Project path control and its guarded suffix.
 *
 * @param props - Derived path state and Create Project path actions.
 * @returns A read-only path or the directory browser field.
 */
export const CreateProjectPathField: React.FC<CreateProjectPathFieldProps> = ({
    t,
    overwriteProjectPath,
    overwriteBasePath,
    overwriteDisplayPath,
    overwritePathSuffixDisplay,
    derivedProjectPath,
    showUseDefaultPathAction,
    showFolderCreateIcon,
    onOverwriteBasePathChange,
    onUseDefaultPath,
    onSelectProjectFolder,
}) => {
    if (!overwriteProjectPath) {
        return (
            <TextField
                id="inputProjectPath"
                testId="inputProjectPath"
                ariaLabel={t('project.overwritePath')}
                value={derivedProjectPath}
                title={derivedProjectPath}
                onChange={onOverwriteBasePathChange}
                disabled
                compact
                regularText
            />
        );
    }

    return (
        <PathField
            id="inputProjectPath"
            testId="inputProjectPath"
            ariaLabel={t('project.overwritePath')}
            value={overwriteBasePath}
            title={overwriteDisplayPath}
            suffix={overwritePathSuffixDisplay}
            onChange={onOverwriteBasePathChange}
            onSelect={onSelectProjectFolder}
            browseKind="directory"
            browseTestId="btnSelectProjectFolder"
            browseIcon={
                <Folder
                    className={
                        showFolderCreateIcon
                            ? 'size-4 stroke-primary'
                            : 'size-4'
                    }
                    aria-hidden="true"
                />
            }
            browseLabel={t('project.selectFolderTooltip')}
            inputAction={
                showUseDefaultPathAction ? (
                    <button
                        type="button"
                        data-testid="btnUseDefaultProjectPath"
                        className="btn btn-ghost btn-xs h-5 min-h-5 shrink-0 px-1.5 text-xs"
                        onClick={onUseDefaultPath}
                    >
                        {t('project.useDefaultPath')}
                    </button>
                ) : undefined
            }
            compact
            regularText
        />
    );
};
