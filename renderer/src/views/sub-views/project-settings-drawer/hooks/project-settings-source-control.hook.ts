import type {
    GitIdentity,
    InitializeProjectGitResult,
    ProjectDetails,
    ProjectGitIdentityResult,
} from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../../../hooks/alerts.hook';
import { useToolIntegrations } from '../../../../hooks/tool-integrations.hook';
import type { ProjectSettingsTab } from '../project-settings.types';

export type ProjectSettingsSourceControlHookProps = {
    open: boolean;
    project: ProjectDetails | null;
    activeTab: ProjectSettingsTab;
    onFormError: (message: string | undefined) => void;
    onInitializeProjectGit: (
        project: ProjectDetails,
    ) => Promise<InitializeProjectGitResult>;
    getProjectGitIdentity: (
        project: ProjectDetails,
    ) => Promise<ProjectGitIdentityResult>;
    onSetProjectGitIdentity: (
        project: ProjectDetails,
        identity: GitIdentity,
    ) => Promise<ProjectGitIdentityResult>;
};

export type ProjectSettingsSourceControlHook = {
    withGit: boolean;
    gitAvailable: boolean;
    loadingGitAvailability: boolean;
    isInitializingGit: boolean;
    gitIdentity: ProjectGitIdentityResult | null;
    loadingGitIdentity: boolean;
    editingGitIdentity: boolean;
    gitIdentityName: string;
    gitIdentityEmail: string;
    savingGitIdentity: boolean;
    gitIdentityError: string | undefined;
    gitUnavailable: boolean;
    initializeGit: () => Promise<void>;
    editGitIdentity: () => void;
    saveGitIdentity: () => Promise<void>;
    cancelGitIdentity: () => void;
    setGitIdentityName: (value: string) => void;
    setGitIdentityEmail: (value: string) => void;
};

/**
 * Manages the Git state and actions used by the project settings drawer.
 *
 * @param props - Source Control dependencies and drawer lifecycle state.
 * @returns Git availability, identity state, and Source Control actions.
 */
export function useProjectSettingsSourceControl(
    props: ProjectSettingsSourceControlHookProps,
): ProjectSettingsSourceControlHook {
    const {
        open,
        project,
        activeTab,
        onFormError,
        onInitializeProjectGit,
        getProjectGitIdentity,
        onSetProjectGitIdentity,
    } = props;
    const { t } = useTranslation(['projects', 'common', 'createProject']);
    const { addAlert } = useAlerts();
    const { listIntegrations } = useToolIntegrations();
    const [withGit, setWithGit] = useState(false);
    const [gitAvailable, setGitAvailable] = useState(false);
    const [loadingGitAvailability, setLoadingGitAvailability] = useState(false);
    const [isInitializingGit, setIsInitializingGit] = useState(false);
    const [gitIdentity, setGitIdentity] =
        useState<ProjectGitIdentityResult | null>(null);
    const [loadingGitIdentity, setLoadingGitIdentity] = useState(false);
    const [editingGitIdentity, setEditingGitIdentity] = useState(false);
    const [gitIdentityName, setGitIdentityName] = useState('');
    const [gitIdentityEmail, setGitIdentityEmail] = useState('');
    const [savingGitIdentity, setSavingGitIdentity] = useState(false);
    const [gitIdentityError, setGitIdentityError] = useState<string>();
    const projectPathRef = useRef<string | null>(null);
    const sessionRef = useRef(0);

    useEffect(() => {
        return () => {
            sessionRef.current += 1;
        };
    }, []);

    useEffect(() => {
        if (!open || !project) {
            projectPathRef.current = null;
            sessionRef.current += 1;
            setWithGit(false);
            setGitIdentity(null);
            setEditingGitIdentity(false);
            setGitIdentityName('');
            setGitIdentityEmail('');
            setGitIdentityError(undefined);
            setIsInitializingGit(false);
            setSavingGitIdentity(false);
            setLoadingGitIdentity(false);
            return;
        }

        if (projectPathRef.current === project.path) {
            return;
        }

        projectPathRef.current = project.path;
        sessionRef.current += 1;
        setWithGit(project.withGit);
        setGitIdentity(null);
        setEditingGitIdentity(false);
        setGitIdentityName('');
        setGitIdentityEmail('');
        setGitIdentityError(undefined);
        setIsInitializingGit(false);
        setSavingGitIdentity(false);
        setLoadingGitIdentity(false);
    }, [open, project]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let disposed = false;
        setGitAvailable(false);
        setLoadingGitAvailability(true);

        listIntegrations()
            .then((tools) => {
                if (!disposed) {
                    setGitAvailable(
                        tools.some(
                            (tool) =>
                                tool.id === 'git' &&
                                tool.status === 'available',
                        ),
                    );
                }
            })
            .catch(() => {
                if (!disposed) {
                    setGitAvailable(false);
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoadingGitAvailability(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [listIntegrations, open]);

    useEffect(() => {
        if (!open || !project || activeTab !== 'sourceControl' || !withGit) {
            return;
        }

        let disposed = false;
        setLoadingGitIdentity(true);
        setGitIdentityError(undefined);
        getProjectGitIdentity(project)
            .then((identity) => {
                if (!disposed) {
                    setGitIdentity(identity);
                }
            })
            .catch((error) => {
                if (!disposed) {
                    setGitIdentityError(
                        error instanceof Error
                            ? error.message
                            : t('editProject.sourceControl.identityLoadFailed'),
                    );
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoadingGitIdentity(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [activeTab, getProjectGitIdentity, open, project, t, withGit]);

    /**
     * Initialises Git for the current project.
     *
     * @returns A promise that resolves after Git initialisation completes.
     */
    const initializeGit = async (): Promise<void> => {
        if (!project || withGit) {
            return;
        }

        setIsInitializingGit(true);
        onFormError(undefined);
        const session = sessionRef.current;
        try {
            const result = await onInitializeProjectGit(project);
            if (session !== sessionRef.current) {
                return;
            }
            setWithGit(result.project.withGit);
            if (result.gitSetup.status === 'existing-repository') {
                addAlert(
                    t('editProject.sourceControl.existingRepositoryTitle'),
                    result.gitSetup.isProjectRoot
                        ? t('editProject.sourceControl.existingRepositoryRoot')
                        : t(
                              'editProject.sourceControl.existingRepositoryParent',
                              {
                                  root: result.gitSetup.root,
                              },
                          ),
                );
            }
        } catch (error) {
            if (session !== sessionRef.current) {
                return;
            }
            onFormError(
                error instanceof Error
                    ? error.message
                    : t('editProject.sourceControl.initFailed'),
            );
        } finally {
            if (session === sessionRef.current) {
                setIsInitializingGit(false);
            }
        }
    };

    /**
     * Starts editing the available Git identity.
     *
     * @returns Nothing when the identity cannot be edited.
     */
    const editGitIdentity = (): void => {
        if (gitIdentity?.status !== 'available' || !gitIdentity.canUpdate) {
            return;
        }
        setGitIdentityName(gitIdentity.name.value);
        setGitIdentityEmail(gitIdentity.email.value);
        setGitIdentityError(undefined);
        setEditingGitIdentity(true);
    };

    /**
     * Saves the edited Git identity for the current project.
     *
     * @returns A promise that resolves after the identity is saved.
     */
    const saveGitIdentity = async (): Promise<void> => {
        if (!project || !gitIdentityName.trim() || !gitIdentityEmail.trim()) {
            setGitIdentityError(
                t('editProject.sourceControl.identityRequired'),
            );
            return;
        }

        setSavingGitIdentity(true);
        setGitIdentityError(undefined);
        const session = sessionRef.current;
        try {
            const identity = await onSetProjectGitIdentity(project, {
                name: gitIdentityName,
                email: gitIdentityEmail,
            });
            if (session !== sessionRef.current) {
                return;
            }
            setGitIdentity(identity);
            setEditingGitIdentity(false);
        } catch (error) {
            if (session !== sessionRef.current) {
                return;
            }
            setGitIdentityError(
                error instanceof Error
                    ? error.message
                    : t('editProject.sourceControl.updateFailed'),
            );
        } finally {
            if (session === sessionRef.current) {
                setSavingGitIdentity(false);
            }
        }
    };

    /**
     * Cancels Git identity editing and clears its validation error.
     *
     * @returns Nothing.
     */
    const cancelGitIdentity = (): void => {
        setEditingGitIdentity(false);
        setGitIdentityError(undefined);
    };

    return {
        withGit,
        gitAvailable,
        loadingGitAvailability,
        isInitializingGit,
        gitIdentity,
        loadingGitIdentity,
        editingGitIdentity,
        gitIdentityName,
        gitIdentityEmail,
        savingGitIdentity,
        gitIdentityError,
        gitUnavailable: withGit && gitIdentity?.status === 'git-unavailable',
        initializeGit,
        editGitIdentity,
        saveGitIdentity,
        cancelGitIdentity,
        setGitIdentityName,
        setGitIdentityEmail,
    };
}
