import type { ProjectEditorSelection } from '@shared/contracts';
import clsx from 'clsx';
import {
    Code,
    FileOutput,
    GitBranch,
    Pin,
    Settings,
    Terminal,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectTagPopover } from '../../components/project-tags/project-tag-popover.component';
import { CopyBadge } from '../../components/ui/copy-badge.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { VerticalTabMenu } from '../../components/ui/vertical-tab-menu.component';
import { useAlerts } from '../../hooks/alerts.hook';
import { useProjects } from '../../hooks/projects.hook';
import { useTemplateJobs } from '../export-templates/hooks/template-jobs.hook';
import { getCreateProjectReleaseKey } from './create-project/create-project.model';
import { PendingChangesIndicator } from './project-settings-drawer/components/pending-changes-indicator.component';
import { ProjectCodeEditorSection } from './project-settings-drawer/components/project-code-editor-section.component';
import { ProjectExportTemplatesSection } from './project-settings-drawer/components/project-export-templates-section.component';
import { ProjectSettingsLaunchSection } from './project-settings-drawer/components/project-settings-launch-section.component';
import { ProjectSettingsProjectSection } from './project-settings-drawer/components/project-settings-project-section.component';
import { ProjectSettingsSourceControlSection } from './project-settings-drawer/components/project-settings-source-control-section.component';
import type { ProjectTemplateFilesHandle } from './project-settings-drawer/components/project-template-files.component';
import { useProjectSettingsForm } from './project-settings-drawer/hooks/project-settings-form.hook';
import { useProjectSettingsSourceControl } from './project-settings-drawer/hooks/project-settings-source-control.hook';
import { useProjectSettingsTags } from './project-settings-drawer/hooks/project-settings-tags.hook';
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
    'exportTemplates',
];

const tabIcons = {
    project: Settings,
    sourceControl: GitBranch,
    codeEditor: Code,
    launch: Terminal,
    exportTemplates: FileOutput,
};

/**
 * Renders the Project Settings drawer and coordinates its ordered save operation.
 * Bounds template content to the available drawer body height.
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
        'exportTemplates',
    ]);
    const { addAlert, addCustomConfirm } = useAlerts();
    const { settingsSaves, queueProjectEditorRepairs, clearSettingsSave } =
        useProjects();
    const [activeTab, setActiveTab] = useState<ProjectSettingsTab>('project');
    const activeProjectPathRef = useRef<string | null>(null);
    const [savingLocally, setSavingLocally] = useState(false);
    const [templatesVisited, setTemplatesVisited] = useState(false);
    const [templatesDirty, setTemplatesDirty] = useState(false);
    const [confirmingTemplateDelete, setConfirmingTemplateDelete] =
        useState(false);
    const [confirmingTemplateClose, setConfirmingTemplateClose] =
        useState(false);
    const submitting = useRef(false);
    const templateFiles = useRef<ProjectTemplateFilesHandle>(null);
    const jobs = useTemplateJobs();
    const templateBusy = jobs.some(
        (job) =>
            job.projectPath === project?.path &&
            !['complete', 'cancelled', 'error'].includes(job.stage),
    );
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
    const tags = useProjectSettingsTags(project?.path, open);
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
    const gitDirty = sourceControl.nameChanged || sourceControl.emailChanged;

    useEffect(() => {
        if (!open || !project) {
            activeProjectPathRef.current = null;
            setTemplatesVisited(false);
            setTemplatesDirty(false);
            return;
        }
        if (activeProjectPathRef.current !== project.path) {
            activeProjectPathRef.current = project.path;
            setActiveTab('project');
            setTemplatesVisited(false);
            setTemplatesDirty(false);
            setSavingLocally(false);
            submitting.current = false;
        }
    }, [open, project]);

    /** Confirms discarding unsaved settings before closing.
     * @param afterClose - Optional navigation after the drawer has closed.
     */
    const requestClose = (afterClose?: () => void) => {
        if (
            savingLocally ||
            confirmingTemplateClose ||
            confirmingTemplateDelete
        )
            return;
        if (!changed && !gitDirty) {
            onOpenChange(false);
            afterClose?.();
            return;
        }
        setConfirmingTemplateClose(true);
        addCustomConfirm(
            t('exportTemplates:project.drawerUnsavedTitle'),
            t('exportTemplates:project.drawerUnsavedMessage'),
            [
                {
                    text: t('exportTemplates:project.drawerDiscard'),
                    typeClass: 'btn-error btn-soft',
                    onClick: () => {
                        setConfirmingTemplateClose(false);
                        setTemplatesDirty(false);
                        onOpenChange(false);
                        afterClose?.();
                        return true;
                    },
                },
                {
                    text: t('exportTemplates:project.drawerBack'),
                    typeClass: 'btn-primary',
                    isCancel: true,
                    onClick: () => {
                        setConfirmingTemplateClose(false);
                        return true;
                    },
                },
            ],
            undefined,
            'warning',
        );
    };

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
            if (templatesDirty) {
                setActiveTab('exportTemplates');
                if (
                    !templateFiles.current ||
                    !(await templateFiles.current.submit())
                )
                    return;
                setTemplatesDirty(false);
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
            if (tags.changed) await tags.submit();
            clearSettingsSave(project.path);
            if (gitDirty) setActiveTab('sourceControl');
            else onOpenChange(false);
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
        form.hasWindowedChanges ||
        templatesDirty ||
        tags.changed;
    const pendingTabs: Record<ProjectSettingsTab, boolean> = {
        project:
            form.hasRenameChanges || form.hasReleaseChanges || tags.changed,
        sourceControl: gitDirty,
        codeEditor: form.hasCodeEditorChanges,
        launch: form.hasWindowedChanges,
        exportTemplates: templatesDirty,
    };
    const title = project
        ? t('editProject.drawerTitle', { project: project.name })
        : t('editProject.title');
    const disabled =
        !project ||
        !changed ||
        !form.name.trim() ||
        isSubmitting ||
        templateBusy ||
        form.loadingGodotName;
    return (
        <Drawer
            open={open && !!project}
            onOpenChange={(next) => {
                if (!next) requestClose();
                else onOpenChange(next);
            }}
            side="right"
            ariaLabel={title}
            width={860}
            panelClassName="max-w-[100vw]"
            closeOnBackdrop={!savingLocally}
            closeOnEscape={
                !savingLocally &&
                !confirmingTemplateClose &&
                !confirmingTemplateDelete
            }
            trapFocus={!confirmingTemplateClose && !confirmingTemplateDelete}
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
                <div className="flex min-h-0 flex-1">
                    <VerticalTabMenu
                        ariaLabel={t('editProject.title')}
                        activeTab={activeTab}
                        onActiveTabChange={(tab) => {
                            setActiveTab(tab);
                            if (tab === 'exportTemplates')
                                setTemplatesVisited(true);
                        }}
                        items={tabs.map((tab) => ({
                            value: tab,
                            label:
                                tab === 'exportTemplates'
                                    ? t('common:app.navigation.exportTemplates')
                                    : t(`editProject.tabs.${tab}`),
                            icon: tabIcons[tab],
                            testId: `tabProjectSettings_${tab}`,
                            trailing: pendingTabs[tab] ? (
                                <PendingChangesIndicator />
                            ) : undefined,
                        }))}
                    />
                    <Drawer.Body className="flex min-w-0 flex-1 flex-col gap-4 text-base">
                        {savingInBackground && (
                            <p className="text-base-content/75" role="status">
                                {t('editProject.actions.installingEditor')}
                            </p>
                        )}
                        <fieldset
                            className={clsx('flex min-w-0 flex-col gap-4', {
                                'min-h-0 flex-1':
                                    activeTab === 'exportTemplates',
                            })}
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
                                    nameChanged={
                                        form.name.trim() !== form.initialName
                                    }
                                    tagsField={
                                        <ProjectTagPopover
                                            variant="field"
                                            tags={tags.tags}
                                            selection={tags.selection}
                                            changed={tags.changed}
                                            disabled={isSubmitting}
                                            loading={!tags.ready}
                                            loadFailed={tags.loadFailed}
                                            onRetry={tags.reload}
                                            onChange={tags.change}
                                        />
                                    }
                                    editorChanged={form.hasReleaseChanges}
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
                                    onRetryCatalogue={
                                        form.refreshAvailableReleases
                                    }
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
                                    nameChanged={sourceControl.nameChanged}
                                    emailChanged={sourceControl.emailChanged}
                                    gitIdentityName={
                                        sourceControl.gitIdentityName
                                    }
                                    gitIdentityEmail={
                                        sourceControl.gitIdentityEmail
                                    }
                                    savingGitIdentity={
                                        sourceControl.savingGitIdentity
                                    }
                                    gitIdentityError={
                                        sourceControl.gitIdentityError
                                    }
                                    gitUnavailable={
                                        sourceControl.gitUnavailable
                                    }
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
                                    changed={form.hasCodeEditorChanges}
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
                            {open && templatesVisited && project && (
                                <div
                                    hidden={activeTab !== 'exportTemplates'}
                                    className={
                                        activeTab === 'exportTemplates'
                                            ? 'flex min-h-0 flex-1 flex-col'
                                            : undefined
                                    }
                                >
                                    <ProjectExportTemplatesSection
                                        key={project.path}
                                        ref={templateFiles}
                                        onConfirmationChange={
                                            setConfirmingTemplateDelete
                                        }
                                        project={project}
                                        active={activeTab === 'exportTemplates'}
                                        selectedSetId={
                                            form.releaseSelection?.source ===
                                                'installed' &&
                                            form.releaseSelection.release
                                                .source === 'custom'
                                                ? ''
                                                : `${(form.releaseSelection?.release.version ?? project.release.version).replace('-', '.')}${(form.releaseSelection?.source === 'installed' ? form.releaseSelection.release.mono : form.releaseSelection?.mono) ? '.mono' : ''}`
                                        }
                                        disabled={isSubmitting}
                                        editorChanged={form.hasReleaseChanges}
                                        onNavigate={requestClose}
                                        onDirtyChange={setTemplatesDirty}
                                    />
                                </div>
                            )}
                            {activeTab === 'launch' && (
                                <ProjectSettingsLaunchSection
                                    t={t}
                                    windowed={form.windowed}
                                    changed={form.hasWindowedChanges}
                                    disabled={isSubmitting}
                                    onWindowedChange={form.changeWindowed}
                                />
                            )}
                        </fieldset>
                    </Drawer.Body>
                </div>
                <Drawer.Footer>
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        onClick={() => requestClose()}
                        disabled={savingLocally}
                    >
                        {t('exportTemplates:migration.close')}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary text-base"
                        disabled={disabled}
                    >
                        {(isSubmitting || templateBusy) && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {t('editProject.actions.update')}
                    </button>
                </Drawer.Footer>
            </form>
        </Drawer>
    );
};
