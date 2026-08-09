import type { ProjectDetails } from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import type { ConfirmButton } from '../../../components/confirm.component';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../../../components/ui/actionMenu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectActionMenuState = {
    project: ProjectDetails;
    anchorRect: ActionMenuAnchorRect;
};

type UseProjectActionsArgs = {
    t: Translate;
    confirmProjectRemove?: boolean;
    addAlert: (
        title: string,
        message: React.ReactNode,
        icon?: React.ReactNode,
    ) => void;
    addCustomConfirm: (
        title: string,
        message: React.ReactNode,
        actions: ConfirmButton[],
        icon?: React.ReactNode,
    ) => void;
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
    const skipRemoveProjectConfirmRef = useRef<boolean>(false);
    const [projectActionsMenu, setProjectActionsMenu] =
        useState<ProjectActionMenuState | null>(null);

    const showProjectActionError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        addAlert(
            t('common:error'),
            message,
            <TriangleAlert className="stroke-error" />,
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
            <div className="space-y-2">
                <p>{t('messages.recoveredCodeEditorConfig')}</p>
                <ul className="list-disc pl-5">
                    {recoveredFiles.map((file) => (
                        <li key={file}>
                            <code>{file}</code>
                        </li>
                    ))}
                </ul>
            </div>,
            <TriangleAlert className="stroke-warning" />,
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
            <div className="flex flex-col gap-2">
                <p>{t('dialogs:importSettings.message')}</p>
                <p>{t('dialogs:importSettings.detail')}</p>
            </div>,
            [
                {
                    typeClass: 'btn-warning',
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
                {
                    isCancel: true,
                    typeClass: 'btn-neutral',
                    text: t('dialogs:importSettings.cancel'),
                    onClick: () => true,
                },
            ],
            <TriangleAlert className="stroke-warning" />,
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

        skipRemoveProjectConfirmRef.current = false;
        addCustomConfirm(
            t('dialogs:removeProject.title'),
            <div className="flex flex-col gap-3">
                <p>
                    {t('dialogs:removeProject.message', {
                        projectName: project.name,
                    })}
                </p>
                <p>{t('dialogs:removeProject.detail')}</p>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        onChange={(event) => {
                            skipRemoveProjectConfirmRef.current =
                                event.currentTarget.checked;
                        }}
                    />
                    <span>{t('dialogs:removeProject.doNotAskAgain')}</span>
                </label>
            </div>,
            [
                {
                    typeClass: 'btn-error',
                    text: t('dialogs:removeProject.ok'),
                    onClick: async () => {
                        if (skipRemoveProjectConfirmRef.current) {
                            updatePreferences({
                                confirm_project_remove: false,
                            });
                        }
                        try {
                            await removeSelectedProject();
                        } catch (error) {
                            showProjectActionError(error);
                        }
                        return true;
                    },
                },
                {
                    isCancel: true,
                    typeClass: 'btn-neutral',
                    text: t('dialogs:removeProject.cancel'),
                    onClick: () => true,
                },
            ],
            <TriangleAlert className="stroke-warning" />,
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
