import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectGitHubPublishingSection } from './create-project-github-publishing-section.component';

const t = (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;

describe('CreateProjectGitHubPublishingSection', () => {
    it('shows private repository fields only after publishing is enabled', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitHubPublishingSection
                t={t}
                enabled
                loading={false}
                targets={[
                    {
                        providerId: 'github',
                        connectionId: 'connection-id',
                        accessTargetId: 'target-id',
                        ownerLogin: 'godotlauncher',
                        ownerType: 'organization',
                        accountLogin: 'octocat',
                    },
                ]}
                targetFailure={null}
                selectedTargetValue='["connection-id","target-id"]'
                repositoryName="my-game"
                disabled={false}
                failure={null}
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onOpenConnections={vi.fn()}
                onRetry={vi.fn()}
                onContinueLocally={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.owner');
        expect(html).toContain('publishToGitHub.repositoryName');
        expect(html).toContain('publishToGitHub.repositoryTitle');
        expect(html).not.toContain('publishToGitHub.privateTitle');
        expect(html).not.toContain('Change connection');
    });

    it('shows safe recovery actions without losing the local project', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitHubPublishingSection
                t={t}
                enabled
                loading={false}
                targets={[]}
                targetFailure={null}
                selectedTargetValue=""
                repositoryName="my-game"
                disabled={false}
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
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onOpenConnections={vi.fn()}
                onRetry={vi.fn()}
                onContinueLocally={vi.fn()}
                onOpenGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.recoveryTitle');
        expect(html).toContain('publishToGitHub.retry');
        expect(html).toContain('publishToGitHub.openGitHub');
        expect(html).toContain('publishToGitHub.continueLocally');
    });
});
