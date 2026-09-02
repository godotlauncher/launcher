import type {
    RemoteProjectImportProgress,
    RemoteProjectSubmoduleActivity,
} from '@shared/contracts';
import type {
    RemoteProjectPublicSourceFailure,
    RemoteProjectRepositoryFailure,
} from './remote-project-import.types';

/**
 * Maps public-source inspection failures to their translation key suffix.
 *
 * @param reason - Typed public source failure.
 * @returns Translation key suffix for the failure.
 */
export function getRemoteProjectPublicSourceFailureKey(
    reason: RemoteProjectPublicSourceFailure,
): string {
    return reason === 'dns-unavailable' ? 'dnsUnavailable' : 'invalid';
}

/**
 * Maps repository-list failures to their translation key suffix.
 *
 * @param reason - Typed repository list failure.
 * @returns Translation key suffix for the failure.
 */
export function getRemoteProjectRepositoryFailureKey(
    reason: RemoteProjectRepositoryFailure,
): string {
    if (
        reason === 'no-usable-connection' ||
        reason === 'secure-storage-unavailable' ||
        reason === 'reauthorisation-required'
    ) {
        return 'connectionRequired';
    }
    return reason === 'session-expired' || reason === 'invalid-request'
        ? 'sessionExpired'
        : 'temporarilyUnavailable';
}

/**
 * Maps import progress to the message shown for its current stage.
 *
 * @param progress - Latest remote import progress.
 * @returns Translation key suffix for the progress stage.
 */
export function getRemoteProjectProgressKey(
    progress: RemoteProjectImportProgress | null,
): string {
    if (progress?.stage === 'cloning') return 'cloning';
    if (progress?.stage === 'cancelling') return 'cancelling';
    if (progress?.stage === 'discovering-projects') return 'discovering';
    return 'preparing';
}

/**
 * Returns one translated activity message for a safe submodule event.
 *
 * @param activity - Typed renderer-safe submodule activity.
 * @param translate - Translation function for the active locale.
 * @returns Translated activity message.
 */
export function getRemoteProjectSubmoduleActivityMessage(
    activity: RemoteProjectSubmoduleActivity,
    translate: (key: string, values?: Record<string, unknown>) => string,
): string {
    const key = `addProject.remote.submodules.activity.${activity.type}`;
    if (activity.type === 'found') {
        return translate(key, { count: activity.count });
    }
    if (
        activity.type === 'validating' ||
        activity.type === 'initialising' ||
        activity.type === 'initialised'
    ) {
        return translate(key, { path: activity.path });
    }
    if (activity.type === 'complete') {
        return translate(key, { count: activity.projectCount });
    }
    if (activity.type === 'stopped') {
        return translate(key, { path: activity.path ?? '' });
    }
    return translate(key);
}
