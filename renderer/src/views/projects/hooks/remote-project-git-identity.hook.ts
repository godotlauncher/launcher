import type {
    GitIdentity,
    GitIdentityScope,
    ProjectGitIdentityPreset,
} from '@shared/contracts';
import { useCallback, useState } from 'react';
import { projectsBridge } from '../../../bridge';
import {
    type GitIdentitySaveChoice,
    isGitIdentityComplete,
    resolveGitIdentityDecision,
    resolveGitIdentitySave,
} from '../../../git-identity.model';
import type { GitHook } from '../../../hooks/git.hook';
import type { RemoteProjectGitIdentityPage } from '../components/remote-project-git-identity.component';
import type {
    RemoteProjectGitIdentityWarning,
    RemoteProjectImportStep,
    RemoteProjectPostGitIdentityStep,
} from '../remote-project-import.types';

type UseRemoteProjectGitIdentityArgs = Pick<
    GitHook,
    'getIdentitySettings' | 'saveGlobalIdentity' | 'saveProjectIdentityPreset'
> & {
    cloneJobId: string | null;
    onStepChange: (step: RemoteProjectImportStep) => void;
};

/**
 * Owns the post-clone Git identity state and actions for remote import.
 *
 * @param args - Git operations, active clone job, and workflow continuation.
 * @returns Controlled identity state and actions for the modal.
 */
export function useRemoteProjectGitIdentity({
    cloneJobId,
    getIdentitySettings,
    saveGlobalIdentity,
    saveProjectIdentityPreset,
    onStepChange,
}: UseRemoteProjectGitIdentityArgs) {
    const [page, setPage] = useState<RemoteProjectGitIdentityPage>('warning');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [scope, setScope] = useState<GitIdentityScope>('repository');
    const [saveChoice, setSaveChoice] = useState<GitIdentitySaveChoice>('ask');
    const [preset, setPreset] = useState<ProjectGitIdentityPreset | null>(null);
    const [globalIdentity, setGlobalIdentity] = useState<GitIdentity>({
        name: '',
        email: '',
    });
    const [postIdentityStep, setPostIdentityStep] =
        useState<RemoteProjectPostGitIdentityStep>('review');
    const [showValidation, setShowValidation] = useState(false);
    const [saving, setSaving] = useState(false);
    const [warning, setWarning] =
        useState<RemoteProjectGitIdentityWarning | null>(null);

    /** Resets identity state for a newly opened remote import. */
    const reset = useCallback(() => {
        setPage('warning');
        setName('');
        setEmail('');
        setScope('repository');
        setSaveChoice('ask');
        setPreset(null);
        setGlobalIdentity({ name: '', email: '' });
        setPostIdentityStep('review');
        setShowValidation(false);
        setSaving(false);
        setWarning(null);
    }, []);

    /**
     * Writes identity only through the process-owned clone capability.
     *
     * @param jobId - Completed remote import job.
     * @param identity - Complete repository identity.
     * @returns Whether the repository identity was configured.
     */
    const applyRepositoryIdentity = async (
        jobId: string,
        identity: GitIdentity,
    ): Promise<boolean> => {
        try {
            const result = await projectsBridge.setRemoteProjectGitIdentity(
                jobId,
                { name: identity.name, email: identity.email },
            );
            return result.status === 'configured';
        } catch {
            return false;
        }
    };

    /** Continues to the post-clone step selected before identity resolution. */
    const continueAfterIdentity = () => {
        setSaving(false);
        onStepChange(postIdentityStep);
    };

    /**
     * Resolves inherited, preset, and missing identity after a successful clone.
     *
     * @param jobId - Completed remote import job.
     * @param nextStep - Submodule or project review destination.
     */
    const prepare = async (
        jobId: string,
        nextStep: RemoteProjectPostGitIdentityStep,
    ) => {
        setPostIdentityStep(nextStep);
        setWarning(null);
        let settings = {
            globalIdentity: { name: '', email: '' },
            projectPreset: null as ProjectGitIdentityPreset | null,
        };
        try {
            settings = await getIdentitySettings();
        } catch {
            // An unreadable configuration is treated as missing.
        }

        const decision = resolveGitIdentityDecision(
            settings.globalIdentity,
            settings.projectPreset,
        );
        if (decision.action === 'use-global') {
            onStepChange(nextStep);
            return;
        }
        if (decision.action === 'apply-preset') {
            const configured = await applyRepositoryIdentity(
                jobId,
                decision.preset,
            );
            if (!configured) {
                setWarning('identity');
            }
            onStepChange(nextStep);
            return;
        }

        setGlobalIdentity(decision.globalIdentity);
        setScope('repository');
        setSaveChoice('ask');
        setShowValidation(false);
        if (decision.action === 'suggest-preset') {
            setPreset(decision.preset);
            setName(decision.preset.name);
            setEmail(decision.preset.email);
            setPage('preset');
        } else {
            setPreset(null);
            setName(decision.globalIdentity.name);
            setEmail(decision.globalIdentity.email);
            setPage('warning');
        }
        onStepChange('git-identity');
    };

    /** Opens the editable identity form from the missing-identity warning. */
    const addIdentity = () => {
        setName(globalIdentity.name);
        setEmail(globalIdentity.email);
        setScope('repository');
        setShowValidation(false);
        setPage('identity');
    };

    /** Opens the editable form instead of using the suggested preset. */
    const useDifferentIdentity = () => {
        setName(globalIdentity.name);
        setEmail(globalIdentity.email);
        setScope('repository');
        setShowValidation(false);
        setPage('identity');
    };

    /** Applies the suggested preset locally and continues the import. */
    const applyPreset = async () => {
        if (!cloneJobId || !preset) {
            setWarning('identity');
            continueAfterIdentity();
            return;
        }
        setSaving(true);
        const configured = await applyRepositoryIdentity(cloneJobId, preset);
        if (!configured) {
            setWarning('identity');
        }
        continueAfterIdentity();
    };

    /** Validates and saves the entered identity before continuing import. */
    const saveAndContinue = async () => {
        const identity = {
            name: name.trim(),
            email: email.trim(),
        };
        if (!isGitIdentityComplete(identity)) {
            setShowValidation(true);
            return;
        }

        const resolution = preset
            ? { scope, preset: null }
            : resolveGitIdentitySave(identity, saveChoice, preset);
        if (!resolution) {
            setShowValidation(true);
            return;
        }

        setSaving(true);
        let nextWarning: RemoteProjectGitIdentityWarning | null = null;
        if (resolution.scope === 'global') {
            try {
                const result = await saveGlobalIdentity(identity);
                if (!result.success) {
                    nextWarning = 'identity';
                }
            } catch {
                nextWarning = 'identity';
            }
        } else if (
            !cloneJobId ||
            !(await applyRepositoryIdentity(cloneJobId, identity))
        ) {
            nextWarning = 'identity';
        }

        if (resolution.preset) {
            try {
                const result = await saveProjectIdentityPreset(
                    resolution.preset,
                );
                if (!result.success && !nextWarning) {
                    nextWarning = 'preset';
                }
            } catch {
                if (!nextWarning) {
                    nextWarning = 'preset';
                }
            }
        }
        setWarning(nextWarning);
        continueAfterIdentity();
    };

    /** Returns the editable form to its warning or preset choice. */
    const returnFromForm = () => {
        setShowValidation(false);
        setPage(preset ? 'preset' : 'warning');
    };

    return {
        page,
        name,
        email,
        scope,
        saveChoice,
        preset,
        globalIdentity,
        globalIdentityComplete: isGitIdentityComplete(globalIdentity),
        showValidation,
        saving,
        warning,
        setName,
        setEmail,
        setScope,
        setSaveChoice,
        reset,
        prepare,
        continueAfterIdentity,
        addIdentity,
        useDifferentIdentity,
        applyPreset,
        saveAndContinue,
        returnFromForm,
    };
}
