import type { ToolIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToolsSettingsPanel } from './toolsSettingsPanel.component';

const git: ToolIntegrationSummary = {
    id: 'git',
    displayName: 'Git',
    status: 'available',
    version: 'git version 2.51.0',
    executablePath: '/usr/bin/git',
};

const gitLfs: ToolIntegrationSummary = {
    id: 'git-lfs',
    displayName: 'Git LFS',
    status: 'missing',
    version: null,
    executablePath: null,
};

/** Renders a Tools panel with stable test translations. */
function renderPanel(
    overrides: Partial<React.ComponentProps<typeof ToolsSettingsPanel>> = {},
): string {
    return renderToStaticMarkup(
        <ToolsSettingsPanel
            active
            t={(key, options) =>
                options?.tool ? `${key}: ${String(options.tool)}` : key
            }
            tools={[git]}
            loading={false}
            loadError={false}
            pendingToolId={null}
            actionErrors={{}}
            onEdit={vi.fn()}
            onRescan={vi.fn(async () => true)}
            {...overrides}
        />,
    );
}

describe('ToolsSettingsPanel', () => {
    it('renders a generic tool card with display-safe installation data', () => {
        const html = renderPanel({ tools: [git, gitLfs] });

        expect(html).toContain('tool-integration-git');
        expect(html).toContain('tool-integration-git-lfs');
        expect(html).toContain('Git');
        expect(html).toContain('Git LFS');
        expect(html).toContain('/usr/bin/git');
        expect(html).toContain('git version 2.51.0');
        expect(html).toContain('tools.status.available');
        expect(html).toContain('tools.actions.rescanTool: Git');
        expect(html).toContain('tools.actions.editTool: Git');
    });

    it('renders missing, loading, error, and pending states', () => {
        expect(
            renderPanel({
                tools: [
                    {
                        ...git,
                        status: 'missing',
                        executablePath: null,
                        version: null,
                    },
                ],
            }),
        ).toContain('tools.status.unknownPath');
        expect(renderPanel({ tools: [], loading: true })).toContain(
            'tools.actions.loading',
        );
        expect(renderPanel({ loadError: true })).toContain('tools.errors.load');
        const pending = renderPanel({ pendingToolId: 'git' });
        expect(pending).toContain('role="status"');
        expect(pending.match(/disabled=""/g)?.length).toBe(2);
    });

    it('keeps existing tools visible while refreshing', () => {
        const html = renderPanel({ loading: true });

        expect(html).toContain('tool-integration-git');
        expect(html).not.toContain('tools.actions.loading');
    });

    it('renders an isolated row action error', () => {
        expect(
            renderPanel({ actionErrors: { git: 'Unable to rescan Git.' } }),
        ).toContain('Unable to rescan Git.');
    });
});
