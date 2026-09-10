import type { InstalledRelease } from '@shared/contracts';
import clsx from 'clsx';
import type { TFunction } from 'i18next';
import { ContentDivider } from '../../../../components/ui/content-divider.component';
import { TextField } from '../../../../components/ui/text-field.component';
import { CreateProjectEditorPicker } from '../../create-project/components/create-project-editor-picker.component';
import type { CreateProjectEditorSelection } from '../../create-project/create-project.model';
import { canRenameGodotProject } from '../project-settings.model';

type ProjectSettingsProjectSectionProps = {
    t: TFunction;
    open: boolean;
    disabled: boolean;
    name: string;
    nameError?: string;
    godotProjectName: string | null;
    loadingGodotName: boolean;
    renameGodotProject: boolean;
    godotError?: string;
    selectableReleases: InstalledRelease[];
    compatibleCatalogueReleases: Parameters<
        typeof CreateProjectEditorPicker
    >[0]['availableReleases'];
    compatibleCataloguePrereleases: Parameters<
        typeof CreateProjectEditorPicker
    >[0]['availablePrereleases'];
    releaseInstallProgress: Parameters<
        typeof CreateProjectEditorPicker
    >[0]['releaseInstallProgress'];
    releasesLoading: boolean;
    catalogueError: string | undefined;
    releaseSelection: CreateProjectEditorSelection | null;
    onNameChange: (value: string) => void;
    onNameBlur: () => boolean;
    onRenameGodotProjectChange: (value: boolean) => void;
    onReleaseSelectionChange: (
        selection: CreateProjectEditorSelection | null,
    ) => void;
    onCancelInstall: (jobId: string) => void;
    onRetryCatalogue: () => Promise<void>;
};

/**
 * Renders the staged project name, Godot name and editor fields.
 *
 * @param props - The current form values and editor catalogue actions.
 * @returns The project settings fields.
 */
export function ProjectSettingsProjectSection({
    t,
    open,
    disabled,
    name,
    nameError,
    godotProjectName,
    loadingGodotName,
    renameGodotProject,
    godotError,
    selectableReleases,
    compatibleCatalogueReleases,
    compatibleCataloguePrereleases,
    releaseInstallProgress,
    releasesLoading,
    catalogueError,
    releaseSelection,
    onNameChange,
    onNameBlur,
    onRenameGodotProjectChange,
    onReleaseSelectionChange,
    onCancelInstall,
    onRetryCatalogue,
}: ProjectSettingsProjectSectionProps) {
    const godotProjectAvailable = godotProjectName !== null;
    const godotRenameEnabled = canRenameGodotProject(name, godotProjectName);

    return (
        <div className="flex flex-col gap-[12px]">
            <TextField
                id="projectEditName"
                label={t('editProject.fields.name.label')}
                help={t('editProject.fields.name.help')}
                value={name}
                onChange={onNameChange}
                onBlur={onNameBlur}
                placeholder={t('editProject.fields.name.placeholder')}
                error={nameError}
            />
            <label className="flex items-start gap-3 rounded-md bg-base-content/5 p-3">
                <input
                    type="checkbox"
                    className={clsx(
                        'checkbox checkbox-sm mt-0.5 shrink-0',
                        godotError && 'checkbox-error',
                    )}
                    checked={renameGodotProject}
                    disabled={
                        !godotProjectAvailable ||
                        loadingGodotName ||
                        !godotRenameEnabled
                    }
                    onChange={(event) =>
                        onRenameGodotProjectChange(event.currentTarget.checked)
                    }
                />
                <span
                    className={clsx(
                        'flex min-w-0 flex-col gap-1',
                        (disabled ||
                            !godotProjectAvailable ||
                            loadingGodotName ||
                            !godotRenameEnabled) &&
                            'opacity-50',
                    )}
                >
                    <span>{t('editProject.godot.renameLabel')}</span>
                    <span className="text-base-content">
                        {loadingGodotName && t('editProject.godot.loading')}
                        {!loadingGodotName &&
                            godotProjectAvailable &&
                            t('editProject.godot.currentName', {
                                name: godotProjectName,
                            })}
                        {!loadingGodotName &&
                            !godotProjectAvailable &&
                            t('editProject.godot.unavailable')}
                    </span>
                    {godotError && (
                        <span className="text-error">{godotError}</span>
                    )}
                </span>
            </label>
            <ContentDivider />
            <div className="flex flex-col gap-2">
                <div>
                    <h3 className="text-base font-semibold">
                        {t('editProject.godotEditor.title')}
                    </h3>
                    <p className="text-base-content/75">
                        {t('editProject.godotEditor.help')}
                    </p>
                </div>
                <CreateProjectEditorPicker
                    open={open}
                    disabled={disabled}
                    triggerTestId="selectProjectGodotEditor"
                    triggerLabel={t('editProject.godotEditor.title')}
                    installedReleases={selectableReleases}
                    availableReleases={compatibleCatalogueReleases}
                    availablePrereleases={compatibleCataloguePrereleases}
                    releaseInstallProgress={releaseInstallProgress}
                    loading={releasesLoading}
                    catalogueError={catalogueError}
                    selection={releaseSelection}
                    onSelectionChange={onReleaseSelectionChange}
                    onCancelInstall={onCancelInstall}
                    onRetryCatalogue={onRetryCatalogue}
                />
            </div>
        </div>
    );
}
