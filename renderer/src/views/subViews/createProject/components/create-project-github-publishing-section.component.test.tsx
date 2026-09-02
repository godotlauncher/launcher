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
                availability="available"
                disabled={false}
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onOpenConnections={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.owner');
        expect(html).toContain('publishToGitHub.repositoryName');
        expect(html).toContain('publishToGitHub.repositoryTitle');
        expect(html).not.toContain('publishToGitHub.privateTitle');
        expect(html).not.toContain('Change connection');
    });

    it('shows a confirmed repository-name conflict in the shared field', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitHubPublishingSection
                t={t}
                enabled
                loading={false}
                targets={[]}
                targetFailure={null}
                selectedTargetValue=""
                repositoryName="my-game"
                availability="unavailable"
                disabled={false}
                onTargetChange={vi.fn()}
                onRepositoryNameChange={vi.fn()}
                onOpenConnections={vi.fn()}
            />,
        );

        expect(html).toContain('publishToGitHub.availabilityUnavailable');
    });
});
