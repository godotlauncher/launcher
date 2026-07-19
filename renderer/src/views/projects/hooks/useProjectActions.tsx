import type { ProjectDetails, SetProjectVSCodeResult } from '@shared/contracts';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { appBridge } from '../../../bridge.ts';
import type { ConfirmButton } from '../../../components/confirm.component';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../../../components/ui/actionMenu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectActionMenuState = {
    project: ProjectDetails;
    anchorRect: ActionMenuAnchorRect;
    hasVSCode: boolean;
    hasGit: boolean;
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
    setProjectWindowed: (
        project: ProjectDetails,
        windowed: boolean,
    ) => Promise<unknown>;
    setProjectVSCode: (
        project: ProjectDetails,
        withVSCode: boolean,
    ) => Promise<SetProjectVSCodeResult>;
    initializeProjectGit: (project: ProjectDetails) => Promise<unknown>;
    importProjectEditorSettings: (project: ProjectDetails) => Promise<unknown>;
    removeProject: (project: ProjectDetails) => Promise<unknown>;
};

export function useProjectActions({
    t,
    confirmProjectRemove,
    addAlert,
    addCustomConfirm,
    updatePreferences,
    setProjectWindowed,
    setProjectVSCode,
    initializeProjectGit,
    importProjectEditorSettings,
    removeProject,
}: UseProjectActionsArgs) {
    const skipRemoveProjectConfirmRef = useRef<boolean>(false);
    const [projectActionsMenu, setProjectActionsMenu] =
        useState<ProjectActionMenuState | null>(null);

    const getProjectMenuToolAvailability = async (): Promise<{
        hasVSCode: boolean;
        hasGit: boolean;
    }> => {
        const tools = await appBridge.getCachedTools();
        return {
            hasVSCode: tools.some(
                (tool) => tool.name === 'VSCode' && tool.verified,
            ),
            hasGit: tools.some((tool) => tool.name === 'Git' && tool.verified),
        };
    };

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

    const showRecoveredVSCodeConfigWarning = (
        recoveredFiles?: string[],
    ): void => {
        if (!recoveredFiles || recoveredFiles.length === 0) {
            return;
        }

        addAlert(
            t('common:warning'),
            <div className="space-y-2">
                <p>{t('messages.recoveredVSCodeConfig')}</p>
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

    const onProjectMoreOptions = async (
        e: React.MouseEvent,
        project: ProjectDetails,
    ) => {
        e.stopPropagation();
        const anchorRect = getActionMenuAnchorRect(e.currentTarget);
        let toolAvailability = {
            hasVSCode: false,
            hasGit: false,
        };
        try {
            toolAvailability = await getProjectMenuToolAvailability();
        } catch (error) {
            showProjectActionError(error);
        }
        setProjectActionsMenu({
            project,
            anchorRect,
            ...toolAvailability,
        });
    };

    const handleToggleProjectWindowed = (project: ProjectDetails) => {
        runProjectAction(async () => {
            await setProjectWindowed(project, !project.open_windowed);
        });
    };

    const handleToggleProjectVSCode = (project: ProjectDetails) => {
        runProjectAction(async () => {
            const updatedProject = await setProjectVSCode(
                project,
                !project.withVSCode,
            );
            showRecoveredVSCodeConfigWarning(
                updatedProject.recoveredVSCodeConfigFiles,
            );
        });
    };

    const handleInitializeProjectGit = (project: ProjectDetails) => {
        runProjectAction(async () => {
            await initializeProjectGit(project);
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
                <label className="flex cursor-pointer items-center gap-2">
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
        showRecoveredVSCodeConfigWarning,
        handleToggleProjectWindowed,
        handleToggleProjectVSCode,
        handleInitializeProjectGit,
        handleImportEditorSettings,
        handleRemoveProject,
    };
}
