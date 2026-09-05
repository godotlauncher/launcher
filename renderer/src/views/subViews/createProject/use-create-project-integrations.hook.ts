import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    GitLfsTrackingPolicyDescriptor,
    ToolIntegrationSummary,
} from '@shared/contracts';
import { useEffect, useState } from 'react';
import { useGitLfs } from '../../../hooks/git-lfs.hook';
import { useCodeEditorIntegrations } from '../../../hooks/useCodeEditorIntegrations';
import { useToolIntegrations } from '../../../hooks/useToolIntegrations';
import {
    isToolIntegrationAvailable,
    resolveCreateProjectCodeEditorId,
} from './createProject.model';

/**
 * Loads the local integrations used by the Create Project form.
 *
 * @param open - Whether the Create Project form is open.
 * @returns Integration state, field setters, and a reset action.
 */
export function useCreateProjectIntegrations(open: boolean) {
    const [tools, setTools] = useState<ToolIntegrationSummary[]>([]);
    const [withGit, setWithGit] = useState(true);
    const [withGitLfs, setWithGitLfs] = useState(false);
    const [gitLfsPolicy, setGitLfsPolicy] =
        useState<GitLfsTrackingPolicyDescriptor | null>(null);
    const [loadingGitLfsPolicy, setLoadingGitLfsPolicy] = useState(true);
    const [codeEditorId, setCodeEditorId] = useState<CodeEditorId | null>(null);
    const [loadingTools, setLoadingTools] = useState(true);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loadingCodeEditors, setLoadingCodeEditors] = useState(true);
    const [codeEditorLoadFailed, setCodeEditorLoadFailed] = useState(false);
    const { getTrackingPolicy } = useGitLfs();
    const { listIntegrationSettings } = useCodeEditorIntegrations();
    const { listIntegrations } = useToolIntegrations();
    const gitAvailable = isToolIntegrationAvailable(tools, 'git');
    const gitLfsAvailable =
        isToolIntegrationAvailable(tools, 'git-lfs') && gitLfsPolicy !== null;

    useEffect(() => {
        if (!open) return;

        let active = true;
        listIntegrations()
            .then((integrations) => {
                if (active) setTools(integrations);
            })
            .catch(() => {
                if (active) setTools([]);
            })
            .finally(() => {
                if (active) setLoadingTools(false);
            });

        return () => {
            active = false;
        };
    }, [listIntegrations, open]);

    useEffect(() => {
        if (!open) return;

        let active = true;
        getTrackingPolicy()
            .then((policy) => {
                if (active) setGitLfsPolicy(policy);
            })
            .catch(() => {
                if (active) setGitLfsPolicy(null);
            })
            .finally(() => {
                if (active) setLoadingGitLfsPolicy(false);
            });

        return () => {
            active = false;
        };
    }, [getTrackingPolicy, open]);

    useEffect(() => {
        if (!open) return;

        let active = true;
        listIntegrationSettings()
            .then((settings) => {
                if (active) setCodeEditorSettings(settings);
            })
            .catch(() => {
                if (active) {
                    setCodeEditorSettings([]);
                    setCodeEditorId(null);
                    setCodeEditorLoadFailed(true);
                }
            })
            .finally(() => {
                if (active) setLoadingCodeEditors(false);
            });

        return () => {
            active = false;
        };
    }, [listIntegrationSettings, open]);

    useEffect(() => {
        if (loadingTools || loadingCodeEditors) return;

        setWithGit(gitAvailable);
        setCodeEditorId(resolveCreateProjectCodeEditorId(codeEditorSettings));
    }, [codeEditorSettings, gitAvailable, loadingCodeEditors, loadingTools]);

    useEffect(() => {
        if (!withGit || !gitLfsAvailable) setWithGitLfs(false);
    }, [gitLfsAvailable, withGit]);

    /** Restores the integration fields to their unopened form defaults. */
    const reset = () => {
        setTools([]);
        setWithGit(true);
        setWithGitLfs(false);
        setGitLfsPolicy(null);
        setLoadingGitLfsPolicy(true);
        setCodeEditorId(null);
        setLoadingTools(true);
        setCodeEditorSettings([]);
        setLoadingCodeEditors(true);
        setCodeEditorLoadFailed(false);
    };

    return {
        withGit,
        setWithGit,
        withGitLfs,
        setWithGitLfs,
        gitLfsPolicy,
        loadingGitLfsPolicy,
        codeEditorId,
        setCodeEditorId,
        loadingTools,
        codeEditorSettings,
        loadingCodeEditors,
        codeEditorLoadFailed,
        gitAvailable,
        gitLfsAvailable,
        reset,
    };
}
