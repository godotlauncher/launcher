import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectGitHubPublishingRecoveryDialog } from './create-project-github-publishing-recovery-dialog.component';

const t = (key: string) => key;

describe('CreateProjectGitHubPublishingRecoveryDialog', () => {
    it('shows editable repository fields without an unconfirmed GitHub link', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitHubPublishingRecoveryDialog
                t={t}
                failure={{
                    status: 'failed',
                    attemptId: 'attempt-id',
                    stage: 'remote-create',
                    reason: 'repository-name-unavailable-or-policy-rejected',
                    intendedRepository: {
                        owner: 'godotlauncher',
                        name: 'my-game',
                        webUrl: 'https://github.com/godotlauncher/my-game',
                    },
                    canRetry: true,
                    canEdit: true,
                }}
                targets={[]}
                selectedTargetValue=""
                repositoryName="my-game"
                availability="unavailable"
                busy={false}
                retryDisabled
                returnFocusRef={{ current: null }}
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onRetry={vi.fn()}
                onContinueLocally={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.recoveryDialogTitle');
        expect(html).toContain('publishToGitHub.recoverySafe');
        expect(html).toContain('publishToGitHub.retry');
        expect(html).toContain('publishToGitHub.continueLocally');
        expect(html).not.toContain('publishToGitHub.openGitHub');
    });

    it('shows GitHub only after a repository is confirmed', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitHubPublishingRecoveryDialog
                t={t}
                failure={{
                    status: 'failed',
                    attemptId: 'attempt-id',
                    stage: 'push',
                    reason: 'remote-created-push-failed',
                    repository: {
                        owner: 'godotlauncher',
                        name: 'my-game',
                        webUrl: 'https://github.com/godotlauncher/my-game',
                    },
                    canRetry: true,
                    canEdit: false,
                }}
                targets={[]}
                selectedTargetValue=""
                repositoryName="my-game"
                availability="idle"
                busy={false}
                retryDisabled={false}
                returnFocusRef={{ current: null }}
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onRetry={vi.fn()}
                onContinueLocally={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.openGitHub');
    });

    it('shows check and retry for an uncertain creation', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitHubPublishingRecoveryDialog
                t={t}
                failure={{
                    status: 'failed',
                    attemptId: 'attempt-id',
                    stage: 'remote-create',
                    reason: 'remote-creation-uncertain',
                    intendedRepository: {
                        owner: 'godotlauncher',
                        name: 'my-game',
                        webUrl: 'https://github.com/godotlauncher/my-game',
                    },
                    recoveryAction: 'check-and-retry',
                    canRetry: true,
                    canEdit: false,
                }}
                targets={[]}
                selectedTargetValue=""
                repositoryName="my-game"
                availability="unknown"
                busy={false}
                retryDisabled={false}
                returnFocusRef={{ current: null }}
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onRetry={vi.fn()}
                onContinueLocally={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.checkAndRetry');
        expect(html).toContain('publishToGitHub.openGitHub');
        expect(html).not.toContain('publishToGitHub.useRepository');
    });

    it('requires a distinct confirmation for a recovered empty repository', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitHubPublishingRecoveryDialog
                t={t}
                failure={{
                    status: 'failed',
                    attemptId: 'attempt-id',
                    stage: 'remote-create',
                    reason: 'remote-creation-uncertain',
                    repository: {
                        owner: 'godotlauncher',
                        name: 'my-game',
                        webUrl: 'https://github.com/godotlauncher/my-game',
                    },
                    recoveryAction: 'confirm-recovered-repository',
                    canRetry: true,
                    canEdit: false,
                }}
                targets={[]}
                selectedTargetValue=""
                repositoryName="my-game"
                availability="idle"
                busy={false}
                retryDisabled={false}
                returnFocusRef={{ current: null }}
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onRetry={vi.fn()}
                onContinueLocally={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.recoveryRepositoryFound');
        expect(html).toContain('publishToGitHub.useRepository');
        expect(html).not.toContain('publishToGitHub.checkAndRetry');
    });
});
