import type {
    AppIntegrationActionResult,
    AppIntegrationSummary,
} from '@shared/contracts';

export type GitHubConnectionFlowState =
    | 'intro'
    | 'authorising'
    | 'saving'
    | 'choosing'
    | 'installing'
    | 'error';

/**
 * Keeps asynchronous connection responses scoped to the active flow session.
 */
export class GitHubConnectionFlowSessionGuard {
    private version = 0;

    /**
     * Starts a new request and invalidates older responses.
     *
     * @returns The new request version.
     */
    begin(): number {
        this.version += 1;
        return this.version;
    }

    /**
     * Invalidates every outstanding response.
     */
    invalidate(): void {
        this.version += 1;
    }

    /**
     * Checks whether a request still belongs to this flow.
     *
     * @param version - Version returned by {@link begin}.
     * @returns Whether the response is still current.
     */
    isCurrent(version: number): boolean {
        return version === this.version;
    }
}

/**
 * Checks that a completed connection includes an account with accessible use.
 *
 * @param integration - Renderer-safe GitHub integration result.
 * @returns Whether the result is ready for a caller to use.
 */
export function hasUsableGitHubConnection(
    integration: AppIntegrationSummary,
): boolean {
    return (
        integration.state === 'connected' &&
        integration.connections.some(
            (connection) =>
                connection.state === 'connected' &&
                connection.accessTargets.some(
                    (target) => target.availability === 'available',
                ),
        )
    );
}

/**
 * Selects the next visible flow state from one bridge action result.
 *
 * @param result - Renderer-safe result returned by the app integrations bridge.
 * @returns The next visible state, or `completed` for a usable final connection.
 */
export function getGitHubConnectionFlowState(
    result: AppIntegrationActionResult,
): GitHubConnectionFlowState | 'completed' {
    if (!result.ok) {
        if (result.reason === 'already-connecting') return 'error';
        if (
            result.integration.state === 'selection-required' ||
            result.integration.connectionStage === 'choosing'
        ) {
            return 'choosing';
        }
        return 'error';
    }
    if (
        result.integration.state === 'selection-required' ||
        result.integration.connectionStage === 'choosing'
    ) {
        return 'choosing';
    }
    if (result.integration.connectionStage === 'installing')
        return 'installing';
    if (hasUsableGitHubConnection(result.integration)) return 'completed';
    return 'error';
}
