import type {
    CreateProjectGitOptions,
    GitIdentityScope,
    ProjectGitIdentityPreset,
} from '@shared/contracts';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGit } from '../../../hooks/git.hook';
import type {
    CreateProjectSubmission,
    GitIdentityDialogPage,
} from './create-project-workflow.types';
import {
    type CreateProjectGitIdentitySaveChoice,
    isGitIdentityComplete,
    resolveCreateProjectGitIdentityDecision,
    resolveCreateProjectGitIdentitySave,
} from './createProject.model';

/**
 * Manages Git identity prompts while the workflow retains the captured submission.
 *
 * @param pendingSubmissionRef - The workflow-owned submission continued by dialog actions.
 * @param createSelectedProject - Continues creation with the chosen identity options.
 * @param gitAvailable - Whether the current tool discovery found Git.
 * @returns Identity state, dialog actions, and a reset for the drawer session.
 */
export function useCreateProjectGitIdentity(
    pendingSubmissionRef: RefObject<CreateProjectSubmission | null>,
    createSelectedProject: (
        submission: CreateProjectSubmission,
        gitOptions?: CreateProjectGitOptions,
    ) => Promise<void>,
    gitAvailable: boolean,
) {
    const { t } = useTranslation('createProject');
    const { getIdentitySettings, saveProjectIdentityPreset } = useGit();
    const [checkingGitIdentity, setCheckingGitIdentity] =
        useState<boolean>(false);
    const [gitIdentityDialogPage, setGitIdentityDialogPage] =
        useState<GitIdentityDialogPage | null>(null);
    const [gitIdentityName, setGitIdentityName] = useState('');
    const [gitIdentityEmail, setGitIdentityEmail] = useState('');
    const [gitIdentityScope, setGitIdentityScope] =
        useState<GitIdentityScope>('repository');
    const [showGitIdentityValidation, setShowGitIdentityValidation] =
        useState(false);
    const [gitIdentitySaveChoice, setGitIdentitySaveChoice] =
        useState<CreateProjectGitIdentitySaveChoice>('ask');
    const [savingGitIdentityPreset, setSavingGitIdentityPreset] =
        useState(false);
    const [gitIdentitySaveError, setGitIdentitySaveError] = useState<
        string | null
    >(null);
    const [suggestedGitIdentityPreset, setSuggestedGitIdentityPreset] =
        useState<ProjectGitIdentityPreset | null>(null);
    const [preflightGlobalIdentity, setPreflightGlobalIdentity] = useState({
        name: '',
        email: '',
    });
    /**
     * Continues the existing Git identity and project creation flow.
     *
     * @param submission - Immutable values captured for this Create submission.
     * @returns A promise that resolves after identity or creation handling.
     */
    const continueCreateProject = async (
        submission: CreateProjectSubmission,
    ) => {
        if (!submission.withGit || !gitAvailable) {
            await createSelectedProject(submission);
            return;
        }

        setCheckingGitIdentity(true);
        let identitySettings = {
            globalIdentity: { name: '', email: '' },
            projectPreset: null as ProjectGitIdentityPreset | null,
        };
        try {
            identitySettings = await getIdentitySettings();
        } catch {
            identitySettings = {
                globalIdentity: { name: '', email: '' },
                projectPreset: null,
            };
        } finally {
            setCheckingGitIdentity(false);
        }

        const decision = resolveCreateProjectGitIdentityDecision(
            identitySettings.globalIdentity,
            identitySettings.projectPreset,
        );
        if (decision.action === 'use-global') {
            await createSelectedProject(submission);
            return;
        }
        if (decision.action === 'apply-preset') {
            await createSelectedProject(submission, {
                initialCommit: 'create',
                identity: {
                    name: decision.preset.name,
                    email: decision.preset.email,
                    scope: 'repository',
                },
            });
            return;
        }
        if (decision.action === 'suggest-preset') {
            setSuggestedGitIdentityPreset(decision.preset);
            setPreflightGlobalIdentity(decision.globalIdentity);
            setGitIdentityName(decision.preset.name);
            setGitIdentityEmail(decision.preset.email);
            setGitIdentityScope('repository');
            setShowGitIdentityValidation(false);
            setGitIdentitySaveError(null);
            setGitIdentityDialogPage('preset');
            return;
        }

        setSuggestedGitIdentityPreset(null);
        setPreflightGlobalIdentity(decision.globalIdentity);
        setGitIdentityName(decision.globalIdentity.name);
        setGitIdentityEmail(decision.globalIdentity.email);
        setGitIdentityScope('repository');
        setGitIdentitySaveChoice('ask');
        setShowGitIdentityValidation(false);
        setGitIdentitySaveError(null);
        setGitIdentityDialogPage('warning');
    };
    /** Initializes the project repository without staging or committing. */
    const handleSkipInitialCommit = () => {
        const submission = pendingSubmissionRef.current;
        if (!submission) return;
        setGitIdentityDialogPage(null);
        void createSelectedProject(submission, { initialCommit: 'skip' });
    };

    /**
     * Validates and submits the entered Git identity and selected default.
     *
     * @returns A promise that resolves after preset and project handling.
     */
    const handleSaveGitIdentity = async () => {
        const identity = {
            name: gitIdentityName.trim(),
            email: gitIdentityEmail.trim(),
        };
        if (!isGitIdentityComplete(identity)) {
            setShowGitIdentityValidation(true);
            return;
        }

        let scope = gitIdentityScope;
        if (!suggestedGitIdentityPreset) {
            const resolution = resolveCreateProjectGitIdentitySave(
                identity,
                gitIdentitySaveChoice,
                suggestedGitIdentityPreset,
            );
            if (!resolution) {
                setGitIdentitySaveError(t('errors.failedGitIdentity'));
                return;
            }
            scope = resolution.scope;

            if (resolution.preset) {
                setSavingGitIdentityPreset(true);
                setGitIdentitySaveError(null);
                try {
                    const result = await saveProjectIdentityPreset(
                        resolution.preset,
                    );
                    if (!result.success) {
                        setGitIdentitySaveError(t('errors.failedGitIdentity'));
                        return;
                    }
                } catch {
                    setGitIdentitySaveError(t('errors.failedGitIdentity'));
                    return;
                } finally {
                    setSavingGitIdentityPreset(false);
                }
            }
        }

        const submission = pendingSubmissionRef.current;
        if (!submission) return;
        setGitIdentityDialogPage(null);
        await createSelectedProject(submission, {
            initialCommit: 'create',
            identity: { ...identity, scope },
        });
    };

    /** Uses the complete global identity without writing repository settings. */
    const handleUseGlobalGitIdentity = () => {
        const submission = pendingSubmissionRef.current;
        if (!submission) return;
        setGitIdentityDialogPage(null);
        void createSelectedProject(submission);
    };

    /** Closes Git identity without retaining a stale Create submission. */
    const handleCloseGitIdentity = () => {
        pendingSubmissionRef.current = null;
        setGitIdentityDialogPage(null);
    };

    /** Opens the existing identity form with the partial global values. */
    const handleUseDifferentGitIdentity = () => {
        setGitIdentityName(preflightGlobalIdentity.name);
        setGitIdentityEmail(preflightGlobalIdentity.email);
        setGitIdentityScope('repository');
        setGitIdentitySaveError(null);
        setShowGitIdentityValidation(false);
        setGitIdentityDialogPage('identity');
    };

    /** Returns to the warning or suggested preset that opened the form. */
    const handleGitIdentityBack = () => {
        setShowGitIdentityValidation(false);
        setGitIdentitySaveError(null);
        if (suggestedGitIdentityPreset) {
            setGitIdentityName(suggestedGitIdentityPreset.name);
            setGitIdentityEmail(suggestedGitIdentityPreset.email);
            setGitIdentityScope('repository');
            setGitIdentityDialogPage('preset');
            return;
        }
        setGitIdentityDialogPage('warning');
    };

    /** Restores identity defaults for a new drawer session. */
    const reset = () => {
        setCheckingGitIdentity(false);
        setGitIdentityDialogPage(null);
        setGitIdentityName('');
        setGitIdentityEmail('');
        setGitIdentityScope('repository');
        setGitIdentitySaveChoice('ask');
        setShowGitIdentityValidation(false);
        setSavingGitIdentityPreset(false);
        setGitIdentitySaveError(null);
        setSuggestedGitIdentityPreset(null);
        setPreflightGlobalIdentity({ name: '', email: '' });
    };

    /**
     * Changes the identity name and clears its previous save error.
     * @param name - Edited identity name.
     */
    const changeName = (name: string) => {
        setGitIdentityName(name);
        setGitIdentitySaveError(null);
    };

    /**
     * Changes the identity email and clears its previous save error.
     * @param email - Edited identity email.
     */
    const changeEmail = (email: string) => {
        setGitIdentityEmail(email);
        setGitIdentitySaveError(null);
    };

    /**
     * Changes the identity scope and clears its previous save error.
     * @param scope - Selected Git identity scope.
     */
    const changeScope = (scope: GitIdentityScope) => {
        setGitIdentityScope(scope);
        setGitIdentitySaveError(null);
    };

    /**
     * Changes the preset choice and clears its previous save error.
     * @param choice - Selected preset behaviour for future repositories.
     */
    const changeSaveChoice = (choice: CreateProjectGitIdentitySaveChoice) => {
        setGitIdentitySaveChoice(choice);
        setGitIdentitySaveError(null);
    };

    /** Opens the identity entry page from the warning. */
    const addIdentity = () => setGitIdentityDialogPage('identity');

    return {
        checkingGitIdentity,
        gitIdentityDialogPage,
        gitIdentityName,
        gitIdentityEmail,
        gitIdentityScope,
        showGitIdentityValidation,
        gitIdentitySaveChoice,
        savingGitIdentityPreset,
        gitIdentitySaveError,
        suggestedGitIdentityPreset,
        globalIdentityComplete: isGitIdentityComplete(preflightGlobalIdentity),
        allowSkip: !pendingSubmissionRef.current?.publication,
        continueCreateProject,
        handleSkipInitialCommit,
        handleSaveGitIdentity,
        handleUseGlobalGitIdentity,
        handleCloseGitIdentity,
        handleUseDifferentGitIdentity,
        handleGitIdentityBack,
        changeName,
        changeEmail,
        changeScope,
        changeSaveChoice,
        addIdentity,
        reset,
    };
}
