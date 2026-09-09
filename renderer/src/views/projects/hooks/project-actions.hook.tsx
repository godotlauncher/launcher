import type { ProjectDetails } from '@shared/contracts';
import type React from 'react';
import { useState } from 'react';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../../../components/ui/action-menu.component';
import type { useAlerts } from '../../../hooks/alerts.hook';
import { RemoveProjectConfirm } from '../components/remove-project-confirm.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectActionMenuState = {
    project: ProjectDetails;
    anchorRect: ActionMenuAnchorRect;
};

type UseProjectActionsArgs = {
    t: Translate;
    confirmProjectRemove?: boolean;
    addAlert: ReturnType<typeof useAlerts>['addAlert'];
    addCustomConfirm: ReturnType<typeof useAlerts>['addCustomConfirm'];
    updatePreferences: (preferences: {
        confirm_project_remove: boolean;
    }) => void;
    setProjectPinned: (
        project: ProjectDetails,
        pinned: boolean,
    ) => Promise<ProjectDetails[]>;
    onProjectPinned: (projectPath: string) => void;
    importProjectEditorSettings: (project: ProjectDetails) => Promise<unknown>;
    removeProject: (project: ProjectDetails) => Promise<unknown>;
};

export function useProjectActions({
    t,
    confirmProjectRemove,
    addAlert,
    addCustomConfirm,
    updatePreferences,
    setProjectPinned,
    onProjectPinned,
    importProjectEditorSettings,
    removeProject,
}: UseProjectActionsArgs) {
    const [projectActionsMenu, setProjectActionsMenu] =
        useState<ProjectActionMenuState | null>(null);

    const showProjectActionError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        addAlert(
            t('common:error'),
            <p className="break-words text-base text-base-content/75">
                {message}
            </p>,
            undefined,
            'error',
        );
    };

    const runProjectAction = (action: () => Promise<void>) => {
        void action().catch(showProjectActionError);
    };

    const showRecoveredCodeEditorConfigWarning = (
        recoveredFiles?: string[],
    ): void => {
        if (!recoveredFiles || recoveredFiles.length === 0) {
            return;
        }

        addAlert(
            t('common:warning'),
            <div className="flex flex-col gap-4 text-base">
                <p className="text-base-content/75">
                    {t('messages.recoveredCodeEditorConfig')}
                </p>
                <ul className="flex flex-col gap-2 rounded-box bg-base-200/60 p-3">
                    {recoveredFiles.map((file) => (
                        <li key={file}>
                            <code className="break-all font-mono text-sm text-base-content/75">
                                {file}
                            </code>
                        </li>
                    ))}
                </ul>
            </div>,
            undefined,
            'warning',
        );
    };

    const onProjectMoreOptions = (
        e: React.MouseEvent,
        project: ProjectDetails,
    ) => {
        e.stopPropagation();
        const anchorRect = getActionMenuAnchorRect(e.currentTarget);
        setProjectActionsMenu({
            project,
            anchorRect,
        });
    };

    const handleToggleProjectPinned = (project: ProjectDetails) => {
        setProjectActionsMenu(null);
        runProjectAction(async () => {
            const pinned = !project.pinned;
            await setProjectPinned(project, pinned);
            if (pinned) {
                onProjectPinned(project.path);
            }
        });
    };

    const handleImportEditorSettings = (project: ProjectDetails) => {
        addCustomConfirm(
            t('dialogs:importSettings.title'),
            <div className="flex flex-col gap-4 text-base">
                <p className="font-semibold">
                    {t('dialogs:importSettings.message')}
                </p>
                <div className="rounded-box bg-base-200/60 p-3">
                    <p className="break-words font-semibold">{project.name}</p>
                </div>
                <p className="text-base-content/75">
                    {t('dialogs:importSettings.detail')}
                </p>
            </div>,
            [
                {
                    isCancel: true,
                    typeClass: 'btn-ghost text-base',
                    text: t('dialogs:importSettings.cancel'),
                    onClick: () => true,
                },
                {
                    typeClass: 'btn-warning text-base',
                    text: t('dialogs:importSettings.continue'),
                    onClick: async () => {
                        try {
                            await importProjectEditorSettings(project);
                        } catch (error) {
                            showProjectActionError(error);
                        }
                        return true;
                    },
                },
            ],
            undefined,
            'warning',
        );
    };

    const handleRemoveProject = (project: ProjectDetails) => {
        const removeSelectedProject = async () => {
            await removeProject(project);
        };

        if (!confirmProjectRemove) {
            runProjectAction(removeSelectedProject);
            return;
        }

        addCustomConfirm(
            t('dialogs:removeProject.title'),
            (renderLayout, close) => (
                <RemoveProjectConfirm
                    projectName={project.name}
                    onRemove={removeSelectedProject}
                    onSkipConfirmation={() =>
                        updatePreferences({ confirm_project_remove: false })
                    }
                    close={close}
                    renderLayout={renderLayout}
                />
            ),
            [],
            undefined,
            'warning',
        );
    };

    return {
        projectActionsMenu,
        setProjectActionsMenu,
        onProjectMoreOptions,
        runProjectAction,
        showProjectActionError,
        showRecoveredCodeEditorConfigWarning,
        handleToggleProjectPinned,
        handleImportEditorSettings,
        handleRemoveProject,
    };
}
