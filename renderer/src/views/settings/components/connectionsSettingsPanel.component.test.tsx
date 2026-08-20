import type { AppIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionsSettingsPanel } from './connectionsSettingsPanel.component';

const github: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'not-connected',
};

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
            t={(key, options) =>
                options?.provider ? `${key}: ${String(options.provider)}` : key
            }
            integrations={[github]}
            loading={false}
            loadError={false}
            onRetry={vi.fn()}
            {...overrides}
        />,
    );
}

describe('ConnectionsSettingsPanel', () => {
    it('presents the disconnected GitHub integration', () => {
        const html = renderPanel({ onConnect: vi.fn() });

        expect(html).toContain('app-integration-github');
        expect(html).toContain('data:image/svg+xml');
        expect(html).toContain('fill=&#x27;black&#x27;');
        expect(html).toContain('GitHub');
        expect(html).toContain('connections.status.notConnected');
        expect(html).toContain('connections.github.description');
        expect(html).toContain('connections.github.accessNote');
        expect(html).toContain('connections.actions.connect: GitHub');
        expect(html).not.toContain('disabled=""');
    });

    it('keeps the connection action disabled until the flow is wired', () => {
        expect(renderPanel()).toContain('disabled=""');
    });

    it('renders loading and retryable load-error states', () => {
        expect(renderPanel({ loading: true })).toContain('role="status"');

        const errorHtml = renderPanel({ loadError: true });
        expect(errorHtml).toContain('role="alert"');
        expect(errorHtml).toContain('connections.loadError');
        expect(errorHtml).toContain('common:buttons.retry');
    });

    it('uses a generic presentation for future registered providers', () => {
        const html = renderPanel({
            integrations: [
                {
                    id: 'example',
                    displayName: 'Example',
                    state: 'not-connected',
                },
            ],
        });

        expect(html).toContain('lucide-plug');
        expect(html).toContain('connections.genericDescription');
        expect(html).not.toContain('connections.github.accessNote');
    });
});
