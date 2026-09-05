import { Folder } from 'lucide-react';
import type React from 'react';
import { PathField } from '../../../../components/ui/pathField.component';

type Translate = (key: string) => string;

type CreateProjectPathFieldProps = {
    t: Translate;
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
 * Renders the compact Create Project path control and its guarded suffix.
 *
 * @param props - Derived path state and Create Project path actions.
 * @returns The editable directory browser field.
 */
export const CreateProjectPathField: React.FC<CreateProjectPathFieldProps> = ({
    t,
    overwriteBasePath,
    overwriteDisplayPath,
    overwritePathSuffixDisplay,
    showUseDefaultPathAction,
    onOverwriteBasePathChange,
    onUseDefaultPath,
    onSelectProjectFolder,
}) => {
    return (
        <PathField
            id="inputProjectPath"
            testId="inputProjectPath"
            label={t('project.overwritePath')}
            ariaLabel={t('project.overwritePath')}
            value={overwriteBasePath}
            title={overwriteDisplayPath}
            suffix={overwritePathSuffixDisplay}
            onChange={onOverwriteBasePathChange}
            onSelect={onSelectProjectFolder}
            browseKind="directory"
            browseTestId="btnSelectProjectFolder"
            browseIcon={<Folder className="size-4" aria-hidden="true" />}
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
