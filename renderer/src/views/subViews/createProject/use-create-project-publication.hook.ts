import type { CreateProjectPublicationTarget } from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { useProjects } from '../../../hooks/useProjects';
import type { RepositoryNameAvailabilityState } from './components/repository-creation-fields.component';
import type { FailedPublication } from './create-project-workflow.types';
import {
    getPublicationTargetValue,
    getSuggestedGitHubRepositoryName,
    isGitHubRepositoryNameValid,
    REPOSITORY_NAME_CHECK_DEBOUNCE_MS,
    toCreateProjectPublicationOptions,
} from './createProject.model';

type PublicationTargetFailure =
    | 'connection-required'
    | 'permission-update-required'
    | 'secure-storage-unavailable'
    | 'provider-unavailable';

/**
 * Manages optional GitHub publication fields for the Create Project form.
 *
 * @param open - Whether the Create Project form is open.
 * @param projectName - Current project display name.
 * @param withGit - Whether Git creation remains enabled.
 * @param publicationFailure - Failed publication that may lock editable fields.
 * @returns Publication state, field actions, and a reset action.
 */
export function useCreateProjectPublication(
    open: boolean,
    projectName: string,
    withGit: boolean,
    publicationFailure: FailedPublication | null = null,
) {
    const [publishToGitHub, setPublishToGitHub] = useState(false);
    const [publicationTargets, setPublicationTargets] = useState<
        CreateProjectPublicationTarget[]
    >([]);
    const [publicationTargetsLoading, setPublicationTargetsLoading] =
        useState(false);
    const [publicationTargetFailure, setPublicationTargetFailure] =
        useState<PublicationTargetFailure | null>(null);
    const [selectedPublicationTarget, setSelectedPublicationTarget] =
        useState('');
    const [repositoryName, setRepositoryName] = useState('');
    const [repositoryNameEdited, setRepositoryNameEdited] = useState(false);
    const [repositoryNameAvailability, setRepositoryNameAvailability] =
        useState<RepositoryNameAvailabilityState>('idle');
    const repositoryNameCheckRequestRef = useRef(0);
    const {
        listCreateProjectPublicationTargets,
        checkCreateProjectRepositoryNameAvailability,
    } = useProjects();

    useEffect(() => {
        if (!repositoryNameEdited) {
            setRepositoryName(getSuggestedGitHubRepositoryName(projectName));
        }
    }, [projectName, repositoryNameEdited]);

    useEffect(() => {
        repositoryNameCheckRequestRef.current += 1;
        const requestId = repositoryNameCheckRequestRef.current;
        const target = publicationTargets.find(
            (candidate) =>
                getPublicationTargetValue(candidate) ===
                selectedPublicationTarget,
        );
        if (
            !open ||
            !publishToGitHub ||
            !target ||
            !isGitHubRepositoryNameValid(repositoryName) ||
            (publicationFailure !== null && !publicationFailure.canEdit)
        ) {
            setRepositoryNameAvailability('idle');
            return;
        }

        setRepositoryNameAvailability('checking');
        const timeoutId = window.setTimeout(() => {
            checkCreateProjectRepositoryNameAvailability(
                toCreateProjectPublicationOptions(target, repositoryName),
            )
                .then((result) => {
                    if (repositoryNameCheckRequestRef.current === requestId) {
                        setRepositoryNameAvailability(result.status);
                    }
                })
                .catch(() => {
                    if (repositoryNameCheckRequestRef.current === requestId) {
                        setRepositoryNameAvailability('unknown');
                    }
                });
        }, REPOSITORY_NAME_CHECK_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [
        checkCreateProjectRepositoryNameAvailability,
        open,
        publicationFailure,
        publicationTargets,
        publishToGitHub,
        repositoryName,
        selectedPublicationTarget,
    ]);

    /** Loads fresh connected GitHub owners when publishing is enabled. */
    const loadPublicationTargets = async (): Promise<void> => {
        setPublicationTargetsLoading(true);
        setPublicationTargetFailure(null);
        try {
            const result = await listCreateProjectPublicationTargets();
            if (!result.success) {
                setPublicationTargets([]);
                setSelectedPublicationTarget('');
                setPublicationTargetFailure(result.reason);
                return;
            }

            setPublicationTargets(result.targets);
            setSelectedPublicationTarget(
                result.targets.length === 1
                    ? getPublicationTargetValue(result.targets[0])
                    : '',
            );
        } catch {
            setPublicationTargets([]);
            setSelectedPublicationTarget('');
            setPublicationTargetFailure('provider-unavailable');
        } finally {
            setPublicationTargetsLoading(false);
        }
    };

    /**
     * Enables or clears optional GitHub publication fields.
     *
     * @param enabled - Whether publication should be enabled.
     */
    const handlePublishToGitHubChange = (enabled: boolean) => {
        setPublishToGitHub(enabled);
        setRepositoryNameAvailability('idle');
        if (enabled) {
            void loadPublicationTargets();
            return;
        }

        setPublicationTargets([]);
        setPublicationTargetFailure(null);
        setSelectedPublicationTarget('');
    };

    /**
     * Records a manually edited repository name.
     *
     * @param name - Repository name entered by the user.
     */
    const changeRepositoryName = (name: string) => {
        setRepositoryName(name);
        setRepositoryNameEdited(true);
    };

    useEffect(() => {
        if (!withGit) {
            setPublishToGitHub(false);
            setPublicationTargets([]);
            setPublicationTargetFailure(null);
            setSelectedPublicationTarget('');
        }
    }, [withGit]);

    /** Restores publication fields to their unopened form defaults. */
    const reset = () => {
        setPublishToGitHub(false);
        setPublicationTargets([]);
        setPublicationTargetsLoading(false);
        setPublicationTargetFailure(null);
        setSelectedPublicationTarget('');
        setRepositoryName('');
        setRepositoryNameEdited(false);
        setRepositoryNameAvailability('idle');
        repositoryNameCheckRequestRef.current += 1;
    };

    const repositoryNameValid = isGitHubRepositoryNameValid(repositoryName);
    const publicationOptionsValid =
        Boolean(selectedPublicationTarget) &&
        repositoryNameValid &&
        (repositoryNameAvailability === 'available' ||
            repositoryNameAvailability === 'unknown');

    return {
        repositoryNameValid,
        publicationOptionsValid,
        publishToGitHub,
        publicationTargets,
        publicationTargetsLoading,
        publicationTargetFailure,
        selectedPublicationTarget,
        setSelectedPublicationTarget,
        repositoryName,
        repositoryNameAvailability,
        setRepositoryNameAvailability,
        handlePublishToGitHubChange,
        changeRepositoryName,
        reset,
    };
}
