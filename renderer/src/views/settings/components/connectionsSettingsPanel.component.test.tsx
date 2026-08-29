import type { AppIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    ConnectionsSettingsPanel,
    GitHubConnectionsDrawer,
} from './connectionsSettingsPanel.component';

const github: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'not-connected',
    connectionStage: null,
    connections: [],
    connectionOptions: [],
};

const connectedGithub: AppIntegrationSummary = {
    ...github,
    state: 'connected',
    connectionStage: null,
    connections: [
        {
            id: 'connection-id',
            accountLogin: 'octocat',
            accountDisplayName: 'The Octocat',
            state: 'connected',
            accessTargets: [
                {
                    id: 'target-id',
                    login: 'godotlauncher',
                    type: 'organization',
                    availability: 'available',
                },
            ],
        },
        {
            id: 'second-connection-id',
            accountLogin: 'hubot-user',
            accountDisplayName: null,
            state: 'reauthorisation-required',
            accessTargets: [
                {
                    id: 'second-target-id',
                    login: 'hubot',
                    type: 'user',
                    availability: 'unavailable',
                },
            ],
        },
    ],
};

const translate = (key: string, options?: Record<string, unknown>) =>
    options?.provider ? `${key}: ${String(options.provider)}` : key;

/**
 * Renders a Connections panel with stable test translations.
 *
 * @param overrides - Props to replace for the rendered state.
 * @returns Static panel markup.
 */
function renderPanel(
    overrides: Partial<
        React.ComponentProps<typeof ConnectionsSettingsPanel>
    > = {},
): string {
    return renderToStaticMarkup(
        <ConnectionsSettingsPanel
            active
            t={translate}
            integrations={[github]}
            loading={false}
            loadError={false}
            actionErrors={{}}
            onRetry={vi.fn()}
            onConnect={vi.fn()}
            onFinishConnections={vi.fn(async () => true)}
            onInstallConnection={vi.fn()}
            onCancel={vi.fn()}
            onRefresh={vi.fn()}
            onReconnect={vi.fn()}
            onManageAccess={vi.fn()}
            onDisconnect={vi.fn()}
            {...overrides}
        />,
    );
}

describe('ConnectionsSettingsPanel', () => {
    it('presents the disconnected GitHub integration', () => {
        const html = renderPanel();

        expect(html).toContain('app-integration-github');
        expect(html).toContain('data:image/svg+xml');
        expect(html).toContain('fill=&#x27;black&#x27;');
        expect(html).toContain('GitHub');
        expect(html).toContain('connections.status.notConnected');
        expect(html).toContain('connections.github.description');
        expect(html).toContain('connections.github.accessNote');
        expect(html).toContain('connections.actions.connect: GitHub');
    });

    it('presents aggregate counts and compact connected actions', () => {
        const html = renderPanel({ integrations: [connectedGithub] });

        expect(html).toContain('connections.github.summary');
        expect(html).toContain('connections.actions.addConnection');
        expect(html).toContain('connections.actions.manageConnections');
        expect(html).not.toContain('The Octocat (@octocat)');
    });

    it('presents connecting and secure-storage failures', () => {
        const connecting = renderPanel({
            integrations: [{ ...github, state: 'connecting' }],
        });
        expect(connecting).toContain('connections.status.connecting');
        expect(connecting).toContain('connections.actions.cancel');

        const unavailable = renderPanel({
            integrations: [{ ...github, state: 'secure-storage-unavailable' }],
            actionErrors: { github: 'secure-storage-unavailable' },
        });
        expect(unavailable).toContain(
            'connections.status.secureStorageUnavailable',
        );
        expect(unavailable).toContain(
            'connections.errors.secureStorageUnavailable',
        );
    });

    it('renders loading, retry, and a generic future provider', () => {
        expect(renderPanel({ integrations: [], loading: true })).toContain(
            'role="status"',
        );
        expect(renderPanel({ integrations: [], loadError: true })).toContain(
            'common:buttons.retry',
        );

        const generic = renderPanel({
            integrations: [
                {
                    id: 'example',
                    displayName: 'Example',
                    state: 'not-connected',
                    connectionStage: null,
                    connections: [],
                    connectionOptions: [],
                },
            ],
        });
        expect(generic).toContain('lucide-plug');
        expect(generic).toContain('connections.genericDescription');
        expect(generic).not.toContain('connections.github.accessNote');
    });

    it('keeps existing cards visible during a background refresh', () => {
        const html = renderPanel({
            integrations: [connectedGithub],
            loading: true,
        });

        expect(html).toContain('app-integration-github');
        expect(html).toContain('connections.github.summary');
        expect(html).not.toContain('role="status"');

        const failed = renderPanel({
            integrations: [connectedGithub],
            loadError: true,
        });
        expect(failed).toContain('app-integration-github');
        expect(failed).toContain('common:buttons.retry');
    });

    it('presents each installation as a connection in the management drawer', () => {
        const html = renderToStaticMarkup(
            <GitHubConnectionsDrawer
                open
                integration={connectedGithub}
                t={translate}
                onOpenChange={vi.fn()}
                onConnect={vi.fn()}
                onFinishConnections={vi.fn(async () => true)}
                onInstallConnection={vi.fn()}
                onCancel={vi.fn()}
                onReconnect={vi.fn()}
                onManageAccess={vi.fn()}
                onDisconnect={vi.fn()}
            />,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('github-connection-target-id');
        expect(html).toContain('godotlauncher');
        expect(html).toContain('hubot');
        expect(html).toContain('The Octocat');
        expect(html).toContain('@octocat');
        expect(html).toContain('connections.status.unavailable');
        expect(html).toContain('connections.drawer.organization');
        expect(html).toContain('connections.actions.manageAccess');
        expect(html).toContain('connections.actions.reconnect');
        expect(html).toContain('connections.actions.disconnect');
        expect(html).not.toContain('connections.actions.addInstallation');
    });

    it('offers existing installations and an explicit install action', () => {
        const choosing: AppIntegrationSummary = {
            ...github,
            state: 'selection-required',
            connectionStage: 'choosing',
            connectionOptions: [
                {
                    id: 'option-id',
                    login: 'godotlauncher',
                    type: 'organization',
                },
            ],
        };
        const html = renderToStaticMarkup(
            <GitHubConnectionsDrawer
                open
                integration={choosing}
                t={translate}
                onOpenChange={vi.fn()}
                onConnect={vi.fn()}
                onFinishConnections={vi.fn(async () => true)}
                onInstallConnection={vi.fn()}
                onCancel={vi.fn()}
                onReconnect={vi.fn()}
                onManageAccess={vi.fn()}
                onDisconnect={vi.fn()}
            />,
        );

        expect(html).toContain('connections.drawer.chooseConnection');
        expect(html).toContain('godotlauncher');
        expect(html).toContain('connections.actions.selectAll');
        expect(html).toContain('connections.actions.selectInstallation');
        expect(html).toContain('connections.actions.connectSelected');
        expect(html).toContain('type="checkbox"');
        expect(html).toContain('connections.actions.installAnother');
    });

    it('keeps the drawer open while GitHub installation is pending', () => {
        const installing: AppIntegrationSummary = {
            ...github,
            state: 'connecting',
            connectionStage: 'installing',
        };
        const html = renderToStaticMarkup(
            <GitHubConnectionsDrawer
                open
                integration={installing}
                t={translate}
                onOpenChange={vi.fn()}
                onConnect={vi.fn()}
                onFinishConnections={vi.fn(async () => true)}
                onInstallConnection={vi.fn()}
                onCancel={vi.fn()}
                onReconnect={vi.fn()}
                onManageAccess={vi.fn()}
                onDisconnect={vi.fn()}
            />,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('connections.drawer.finishSetup');
        expect(html).toContain('connections.drawer.finishSetupDescription');
    });
});
