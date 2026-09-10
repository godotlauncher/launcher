import type { ProjectEditorSelection } from '@shared/contracts';
import clsx from 'clsx';
import { Pin } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyBadge } from '../../components/ui/copy-badge.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { useAlerts } from '../../hooks/alerts.hook';
import { useProjects } from '../../hooks/projects.hook';
import { getCreateProjectReleaseKey } from './create-project/create-project.model';
import { ProjectCodeEditorSection } from './project-settings-drawer/components/project-code-editor-section.component';
import { ProjectSettingsLaunchSection } from './project-settings-drawer/components/project-settings-launch-section.component';
import { ProjectSettingsProjectSection } from './project-settings-drawer/components/project-settings-project-section.component';
import { ProjectSettingsSourceControlSection } from './project-settings-drawer/components/project-settings-source-control-section.component';
import { useProjectSettingsForm } from './project-settings-drawer/hooks/project-settings-form.hook';
import { useProjectSettingsSourceControl } from './project-settings-drawer/hooks/project-settings-source-control.hook';
import {
    hasProjectCodeEditorChanges,
    hasProjectRenameChanges,
} from './project-settings-drawer/project-settings.model';
import type {
    ProjectSettingsDrawerProps,
    ProjectSettingsTab,
} from './project-settings-drawer/project-settings.types';

const tabs: ProjectSettingsTab[] = [
    'project',
    'sourceControl',
    'codeEditor',
    'launch',
];

/**
 * Renders the Project Settings drawer and coordinates its ordered save operation.
 *
 * @param props - The active project and its update operations.
 * @returns The drawer element.
 */
export const ProjectSettingsDrawer: React.FC<ProjectSettingsDrawerProps> = (
    props,
) => {
    const {
        project,
        open,
        installedReleases,
        onOpenChange,
        onRenameProject,
        onSetProjectEditor,
        onSetProjectCodeEditor,
        onSetProjectWindowed,
        onInitializeProjectGit,
        getProjectGitIdentity,
        onSetProjectGitIdentity,
        getProjectGodotName,
    } = props;
    const { t } = useTranslation([
        'projects',
        'common',
        'installs',
        'createProject',
    ]);
    const { addAlert, addCustomConfirm } = useAlerts();
    const { settingsSaves, queueProjectEditorRepairs, clearSettingsSave } =
        useProjects();
    const [activeTab, setActiveTab] = useState<ProjectSettingsTab>('project');
    const activeProjectPathRef = useRef<string | null>(null);
    const [savingLocally, setSavingLocally] = useState(false);
    const submitting = useRef(false);
    const save = project ? settingsSaves?.get(project.path) : undefined;
    const savingInBackground = save?.status === 'pending';
    const form = useProjectSettingsForm({
        project,
        open,
        installedReleases,
        getProjectGodotName,
        settingsSave: save,
        clearSettingsSave,
        t,
    });
    const sourceControl = useProjectSettingsSourceControl({
        open,
        project,
        activeTab,
        onFormError: form.setSaveError,
        onInitializeProjectGit,
        getProjectGitIdentity,
        onSetProjectGitIdentity,
    });
    const isSubmitting = savingLocally || savingInBackground;

    useEffect(() => {
        if (!open || !project) {
            activeProjectPathRef.current = null;
            return;
        }
        if (activeProjectPathRef.current !== project.path) {
            activeProjectPathRef.current = project.path;
            setActiveTab('project');
            setSavingLocally(false);
            submitting.current = false;
        }
    }, [open, project]);

    /**
     * Confirms resetting the selected code editor configuration for this project.
     *
     * @returns Nothing when no resettable editor is selected.
     */
    const resetCodeEditorConfig = () => {
        const selected = form.codeEditorId
            ? form.codeEditorSettings.find(
                  (item) => item.integration.id === form.codeEditorId,
              )
            : undefined;
        const editor = selected?.integration.displayName ?? form.codeEditorId;
        if (!project || !editor) return;
        addCustomConfirm(
            t('editProject.codeEditor.resetConfig.confirmTitle', { editor }),
            <div className="flex flex-col gap-4 text-base">
                <p className="text-base-content/75">
                    {t('editProject.codeEditor.resetConfig.confirmMessage')}
                </p>
                <p className="rounded-box bg-base-200/60 p-3 break-words font-semibold">
                    {project.name}
                </p>
            </div>,
            [
                {
                    isCancel: true,
                    typeClass: 'btn-ghost text-base',
                    text: t('common:buttons.cancel'),
                },
                {
                    typeClass: 'btn-warning text-base',
                    text: t('editProject.codeEditor.resetConfig.label'),
                    onClick: async () => {
                        try {
                            await props.onResetProjectCodeEditorConfig(project);
                        } catch (error) {
                            form.setSaveError(
                                error instanceof Error
                                    ? error.message
                                    : t('editProject.updateFailed'),
                            );
                        }
                        return true;
                    },
                },
            ],
            undefined,
            'warning',
        );
    };

    /**
     * Persists staged changes in rename, code-editor, release, then launch order.
     *
     * @param event - The form submit event.
     * @returns A promise that ends after all applicable saves complete.
     */
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting.current || savingInBackground) return;
        if (!project || !form.releaseSelection || !form.validateName()) {
            setActiveTab('project');
            return;
        }
        submitting.current = true;
        const session = form.sessionRef.current;
        setSavingLocally(true);
        form.setSaveError(undefined);
        form.setGodotNameError(undefined);
        try {
            let current = project;
            const rename = hasProjectRenameChanges(
                form.initialName,
                form.godotProjectName,
                form.name,
                form.renameGodotProject,
            );
            const editor = hasProjectCodeEditorChanges(
                form.initialCodeEditorId,
                form.codeEditorId,
                form.codeEditorTouched,
            );
            const key = getCreateProjectReleaseKey({
                version: form.releaseSelection.release.version,
                mono:
                    form.releaseSelection.source === 'installed'
                        ? form.releaseSelection.release.mono
                        : form.releaseSelection.mono,
            });
            const release =
                form.initialReleaseKey !== key ||
                (form.releaseSelection.source === 'catalogue' &&
                    (project.release.valid === false ||
                        !project.release.editor_path));
            const windowed = form.initialWindowed !== form.windowed;
            let selection: ProjectEditorSelection | undefined;
            if (release) {
                if (
                    form.releaseSelection.source === 'installed' &&
                    (form.releaseSelection.release.valid === false ||
                        !form.releaseSelection.release.editor_path)
                ) {
                    form.setSaveError(t('editProject.godotEditor.unavailable'));
                    return;
                }
                selection =
                    form.releaseSelection.source === 'installed'
                        ? form.releaseSelection.release
                        : {
                              release: form.releaseSelection.release,
                              mono: form.releaseSelection.mono,
                          };
            }
            if (rename) {
                const result = await onRenameProject(project, {
                    name: form.name.trim(),
                    renameGodotProject: form.renameGodotProject,
                });
                if (!result.success) {
                    const error = result.error ?? t('editProject.updateFailed');
                    form.setSaveError(error);
                    if (result.errorField === 'name')
                        form.setProjectNameError(error);
                    if (result.errorField === 'godot')
                        form.setGodotNameError(error);
                    setActiveTab('project');
                    return;
                }
                current = result.project ?? {
                    ...current,
                    name: form.name.trim(),
                };
                form.acceptRename(current);
            }
            if (editor) {
                current = await onSetProjectCodeEditor(
                    current,
                    form.codeEditorId,
                );
                form.acceptCodeEditor(current);
            }
            if (release) {
                if (!selection)
                    throw new Error(t('editProject.godotEditor.unavailable'));
                current = await onSetProjectEditor(current, selection);
                form.acceptRelease(key);
            }
            if (windowed) {
                current = await onSetProjectWindowed(current, form.windowed);
                form.acceptWindowed(form.windowed);
            }
            clearSettingsSave(project.path);
            onOpenChange(false);
            if (
                form.releaseSelection.source === 'catalogue' &&
                (current.release.valid === false ||
                    !current.release.editor_path)
            )
                void queueProjectEditorRepairs([
                    {
                        release: form.releaseSelection.release,
                        mono: form.releaseSelection.mono,
                        projects: [current],
                    },
                ]).catch((error: unknown) =>
                    addAlert(
                        t('common:error'),
                        error instanceof Error
                            ? error.message
                            : t('editProject.updateFailed'),
                    ),
                );
        } catch (error) {
            if (session === form.sessionRef.current)
                form.setSaveError(
                    error instanceof Error
                        ? error.message
                        : t('editProject.updateFailed'),
                );
        } finally {
            if (session === form.sessionRef.current) {
                submitting.current = false;
                setSavingLocally(false);
            }
        }
    };
    const changed =
        form.hasRenameChanges ||
        form.hasCodeEditorChanges ||
        form.hasReleaseChanges ||
        form.hasWindowedChanges;
    const title = project
        ? t('editProject.drawerTitle', { project: project.name })
        : t('editProject.title');
    const disabled =
        !project ||
        !changed ||
        !form.name.trim() ||
        isSubmitting ||
        form.loadingGodotName;
    return (
        <Drawer
            open={open && !!project}
            onOpenChange={(next) => {
                if (!next && savingLocally) return;
                onOpenChange(next);
            }}
            side="right"
            ariaLabel={title}
            width={560}
            panelClassName="max-w-[100vw]"
            closeOnBackdrop={!savingLocally}
            closeOnEscape={!savingLocally}
        >
            <Drawer.Header className="items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Drawer.Title className="text-lg font-semibold">
                            {title}
                        </Drawer.Title>
                        {project?.pinned && (
                            <span className="badge badge-sm badge-primary badge-soft gap-1">
                                <Pin size={12} aria-hidden="true" />
                                {t('editProject.pinned.label')}
                            </span>
                        )}
                    </div>
                    {project && (
                        <CopyBadge
                            value={project.path}
                            label={t('common:buttons.copyPath')}
                            copiedLabel={t('common:success')}
                            className="-ml-3 self-start"
                        />
                    )}
                </div>
                <Drawer.CloseButton
                    className="btn-sm"
                    disabled={savingLocally}
                />
            </Drawer.Header>
            <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => void submit(event)}
            >
                <div
                    role="tablist"
                    className="tabs tabs-border grid shrink-0 grid-cols-4 px-5 pt-2"
                >
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            data-testid={`tabProjectSettings_${tab}`}
                            aria-selected={activeTab === tab}
                            className={clsx(
                                'tab px-2 text-base',
                                activeTab === tab && 'tab-active',
                            )}
                            onClick={() => setActiveTab(tab)}
                        >
                            {t(`editProject.tabs.${tab}`)}
                        </button>
                    ))}
                </div>
                <Drawer.Body className="flex flex-col gap-4 text-base">
                    {savingInBackground && (
                        <p className="text-base-content/75" role="status">
                            {t('editProject.actions.installingEditor')}
                        </p>
                    )}
                    <fieldset
                        disabled={isSubmitting}
                        className="flex min-w-0 flex-col gap-4"
                    >
                        {form.formError && (
                            <div
                                className="alert alert-error alert-soft text-error-content dark:text-error"
                                role="alert"
                            >
                                {form.formError}
                            </div>
                        )}
                        {activeTab === 'project' && (
                            <ProjectSettingsProjectSection
                                t={t}
                                open={open}
                                disabled={isSubmitting}
                                name={form.name}
                                nameError={form.nameError}
                                godotProjectName={form.godotProjectName}
                                loadingGodotName={form.loadingGodotName}
                                renameGodotProject={form.renameGodotProject}
                                godotError={form.godotError}
                                selectableReleases={form.selectableReleases}
                                compatibleCatalogueReleases={
                                    form.compatibleCatalogueReleases
                                }
                                compatibleCataloguePrereleases={
                                    form.compatibleCataloguePrereleases
                                }
                                releaseInstallProgress={
                                    form.releaseInstallProgress
                                }
                                releasesLoading={form.releasesLoading}
                                catalogueError={form.catalogueError}
                                releaseSelection={form.releaseSelection}
                                onNameChange={form.changeName}
                                onNameBlur={form.validateName}
                                onRenameGodotProjectChange={
                                    form.changeRenameGodotProject
                                }
                                onReleaseSelectionChange={
                                    form.changeReleaseSelection
                                }
                                onCancelInstall={(job) =>
                                    void form.cancelInstall(job)
                                }
                                onRetryCatalogue={form.refreshAvailableReleases}
                            />
                        )}
                        {activeTab === 'sourceControl' && project && (
                            <ProjectSettingsSourceControlSection
                                t={t}
                                project={project}
                                withGit={sourceControl.withGit}
                                gitAvailable={sourceControl.gitAvailable}
                                loadingGitAvailability={
                                    sourceControl.loadingGitAvailability
                                }
                                isInitializingGit={
                                    sourceControl.isInitializingGit
                                }
                                gitIdentity={sourceControl.gitIdentity}
                                loadingGitIdentity={
                                    sourceControl.loadingGitIdentity
                                }
                                editingGitIdentity={
                                    sourceControl.editingGitIdentity
                                }
                                gitIdentityName={sourceControl.gitIdentityName}
                                gitIdentityEmail={
                                    sourceControl.gitIdentityEmail
                                }
                                savingGitIdentity={
                                    sourceControl.savingGitIdentity
                                }
                                gitIdentityError={
                                    sourceControl.gitIdentityError
                                }
                                gitUnavailable={sourceControl.gitUnavailable}
                                disabled={isSubmitting}
                                onInitializeGit={() =>
                                    void sourceControl.initializeGit()
                                }
                                onEditGitIdentity={
                                    sourceControl.editGitIdentity
                                }
                                onSaveGitIdentity={() =>
                                    void sourceControl.saveGitIdentity()
                                }
                                onCancelGitIdentity={
                                    sourceControl.cancelGitIdentity
                                }
                                onGitIdentityNameChange={
                                    sourceControl.setGitIdentityName
                                }
                                onGitIdentityEmailChange={
                                    sourceControl.setGitIdentityEmail
                                }
                            />
                        )}
                        {activeTab === 'codeEditor' && (
                            <ProjectCodeEditorSection
                                t={t}
                                codeEditorId={form.codeEditorId}
                                settings={form.codeEditorSettings}
                                loading={form.loadingCodeEditors}
                                loadFailed={form.codeEditorLoadFailed}
                                disabled={!project?.valid || isSubmitting}
                                showResetConfig={
                                    form.initialCodeEditorId !== null &&
                                    form.initialCodeEditorId ===
                                        form.codeEditorId
                                }
                                onChange={form.changeCodeEditor}
                                onResetConfig={resetCodeEditorConfig}
                            />
                        )}
                        {activeTab === 'launch' && (
                            <ProjectSettingsLaunchSection
                                t={t}
                                windowed={form.windowed}
                                disabled={isSubmitting}
                                onWindowedChange={form.changeWindowed}
                            />
                        )}
                    </fieldset>
                </Drawer.Body>
                <Drawer.Footer>
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        onClick={() => onOpenChange(false)}
                        disabled={savingLocally}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary text-base"
                        disabled={disabled}
                    >
                        {isSubmitting && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {isSubmitting &&
                        form.releaseSelection?.source === 'catalogue' &&
                        !form.releaseSelection.installedRelease
                            ? t('editProject.actions.installingEditor')
                            : form.hasReleaseChanges &&
                                form.releaseSelection?.source === 'catalogue' &&
                                !form.releaseSelection.installedRelease
                              ? t('editProject.actions.installAndSave')
                              : isSubmitting
                                ? t('editProject.actions.updating')
                                : t('editProject.actions.update')}
                    </button>
                </Drawer.Footer>
            </form>
        </Drawer>
    );
};
