import type { ToolIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GitToolSettingsDrawer } from './git-tool-settings-drawer.subview';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const git: ToolIntegrationSummary = {
    id: 'git',
    displayName: 'Git',
    status: 'available',
    version: 'git version 2.51.0',
    executablePath: '/usr/bin/git',
};

describe('GitToolSettingsDrawer', () => {
    it('renders focused Git installation state', () => {
        const html = renderToStaticMarkup(
            <GitToolSettingsDrawer
                tool={git}
                open
                onOpenChange={vi.fn()}
                onRescan={vi.fn(async () => true)}
            />,
        );

        expect(html).toContain('tools.git.drawer.title');
        expect(html).toContain('tools.git.installation.title');
        expect(html).toContain('/usr/bin/git');
        expect(html).toContain('git version 2.51.0');
        expect(html).toContain('tools.status.available');
        expect(html).not.toContain('user@example.com');
    });

    it('does not open for a non-Git tool', () => {
        const html = renderToStaticMarkup(
            <GitToolSettingsDrawer
                tool={{ ...git, id: 'other', displayName: 'Other' }}
                open
                onOpenChange={vi.fn()}
                onRescan={vi.fn(async () => true)}
            />,
        );

        expect(html).toBe('');
    });
});
