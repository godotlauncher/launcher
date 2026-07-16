import type {
    ProjectDetails,
    RenameProjectOptions,
    RenameProjectResult,
} from '@shared/contracts';
import clsx from 'clsx';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyBadge } from '../../components/ui/copyBadge.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { TextField } from '../../components/ui/textField.component';
import {
    canRenameGodotProject,
    hasProjectRenameChanges,
    validateProjectRenameName,
} from './projectSettingsDrawer/projectSettings.model';

type ProjectSettingsDrawerProps = {
    project: ProjectDetails | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRenameProject: (
        project: ProjectDetails,
        options: RenameProjectOptions,
    ) => Promise<RenameProjectResult>;
    getProjectGodotName: (project: ProjectDetails) => Promise<string | null>;
};

export const ProjectSettingsDrawer: React.FC<ProjectSettingsDrawerProps> = ({
    project,
    open,
    onOpenChange,
    onRenameProject,
    getProjectGodotName,
}) => {
    const { t } = useTranslation(['projects', 'common']);
    const [name, setName] = useState('');
    const [godotProjectName, setGodotProjectName] = useState<string | null>(
        null,
    );
    const [loadingGodotName, setLoadingGodotName] = useState(false);
    const [renameGodotProject, setRenameGodotProject] = useState(false);
    const [nameError, setNameError] = useState<string>();
    const [godotError, setGodotError] = useState<string>();
    const [formError, setFormError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!open || !project) {
            return;
        }

        let disposed = false;

        setName(project.name);
        setGodotProjectName(null);
        setRenameGodotProject(false);
        setNameError(undefined);
        setGodotError(undefined);
        setFormError(undefined);
        setIsSubmitting(false);
        setLoadingGodotName(true);

        getProjectGodotName(project)
            .then((currentGodotProjectName) => {
                if (disposed) {
                    return;
                }

                setGodotProjectName(currentGodotProjectName);
                setRenameGodotProject(false);
            })
            .catch(() => {
                if (!disposed) {
                    setGodotProjectName(null);
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoadingGodotName(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [getProjectGodotName, open, project]);

    const getValidationMessage = (
        validationError: ReturnType<typeof validateProjectRenameName>,
    ): string | undefined => {
        if (!validationError) {
            return undefined;
        }

        return t(`editProject.validation.${validationError}`);
    };

    const validateNameField = (): boolean => {
        const validationMessage = getValidationMessage(
            validateProjectRenameName(name),
        );
        setNameError(validationMessage);
        return !validationMessage;
    };

    const handleNameChange = (value: string) => {
        setName(value);
        setNameError(undefined);
        setFormError(undefined);
        setGodotError(undefined);

        if (!canRenameGodotProject(value, godotProjectName)) {
            setRenameGodotProject(false);
        }
    };

    const handleRenameGodotProjectChange = (checked: boolean) => {
        setRenameGodotProject(checked);
        setGodotError(undefined);
        setFormError(undefined);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!project || !validateNameField()) {
            return;
        }

        setIsSubmitting(true);
        setFormError(undefined);
        setGodotError(undefined);

        try {
            const result = await onRenameProject(project, {
                name: name.trim(),
                renameGodotProject,
            });

            if (!result.success) {
                const message = result.error ?? t('editProject.updateFailed');
                setFormError(message);

                if (result.errorField === 'name') {
                    setNameError(message);
                } else if (result.errorField === 'godot') {
                    setGodotError(message);
                }

                return;
            }

            onOpenChange(false);
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : t('editProject.updateFailed'),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const trimmedName = name.trim();
    const godotProjectAvailable = godotProjectName !== null;
    const godotRenameEnabled = canRenameGodotProject(name, godotProjectName);
    const hasChanges =
        project &&
        hasProjectRenameChanges(
            project.name,
            godotProjectName,
            name,
            renameGodotProject,
        );
    const saveDisabled =
        !project ||
        trimmedName.length === 0 ||
        !hasChanges ||
        isSubmitting ||
        loadingGodotName;
    const drawerTitle = project
        ? `${project.name} Settings`
        : t('editProject.title');

    return (
        <Drawer
            open={open && Boolean(project)}
            onOpenChange={onOpenChange}
            side="right"
            ariaLabel={drawerTitle}
            width={520}
            panelClassName="max-w-[100vw]"
        >
            <Drawer.Header>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Drawer.Title>{drawerTitle}</Drawer.Title>
                    {project && (
                        <CopyBadge
                            value={project.path}
                            label={t('common:buttons.copyPath')}
                            copiedLabel={t('common:success')}
                            className="w-full rounded-lg bg-base-100/80"
                        />
                    )}
                </div>
                <Drawer.CloseButton />
            </Drawer.Header>
            <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => void handleSubmit(event)}
            >
                <Drawer.Body className="flex flex-col gap-4">
                    {formError && (
                        <div className="alert alert-error alert-soft">
                            {formError}
                        </div>
                    )}

                    <TextField
                        id="projectEditName"
                        label={t('editProject.fields.name.label')}
                        help={t('editProject.fields.name.help')}
                        value={name}
                        onChange={handleNameChange}
                        onBlur={validateNameField}
                        placeholder={t('editProject.fields.name.placeholder')}
                        error={nameError}
                    />

                    <label
                        className={clsx(
                            'flex items-start gap-3 rounded-lg border p-3',
                            godotError
                                ? 'border-error bg-error/5'
                                : 'border-base-300 bg-base-200/40',
                            (!godotProjectAvailable ||
                                loadingGodotName ||
                                !godotRenameEnabled) &&
                                'opacity-70',
                        )}
                    >
                        <input
                            type="checkbox"
                            className={clsx(
                                'checkbox checkbox-primary mt-0.5',
                                godotError && 'checkbox-error',
                            )}
                            checked={renameGodotProject}
                            disabled={
                                !godotProjectAvailable ||
                                loadingGodotName ||
                                !godotRenameEnabled
                            }
                            onChange={(event) =>
                                handleRenameGodotProjectChange(
                                    event.currentTarget.checked,
                                )
                            }
                        />
                        <span className="flex min-w-0 flex-col gap-1">
                            <span className="font-semibold">
                                {t('editProject.godot.renameLabel')}
                            </span>
                            <span className="text-sm text-base-content/70">
                                {loadingGodotName &&
                                    t('editProject.godot.loading')}
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
                                <span className="text-sm text-error">
                                    {godotError}
                                </span>
                            )}
                        </span>
                    </label>
                </Drawer.Body>
                <Drawer.Footer>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={saveDisabled}
                    >
                        {isSubmitting && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {isSubmitting
                            ? t('editProject.actions.updating')
                            : t('editProject.actions.update')}
                    </button>
                </Drawer.Footer>
            </form>
        </Drawer>
    );
};
