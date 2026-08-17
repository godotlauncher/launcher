import type { ToolIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToolInstallationSettingsDrawer } from './tool-installation-settings-drawer.subview';

vi.mock('electron-log', () => ({
    default: { error: vi.fn() },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) =>
            options?.tool ? `${key}: ${String(options.tool)}` : key,
    }),
}));

const gitLfs: ToolIntegrationSummary = {
    id: 'git-lfs',
    displayName: 'Git LFS',
    status: 'available',
    version: 'git-lfs/3.7.1',
    executablePath: '/usr/bin/git-lfs',
};

describe('ToolInstallationSettingsDrawer', () => {
    it('renders focused installation details for Git LFS', () => {
        const html = renderToStaticMarkup(
            <ToolInstallationSettingsDrawer
                tool={gitLfs}
                open
                onOpenChange={vi.fn()}
                onRescan={vi.fn(async () => true)}
            />,
        );

        expect(html).toContain('tools.installation.drawerTitle: Git LFS');
        expect(html).toContain('tools.installation.description: Git LFS');
        expect(html).toContain('/usr/bin/git-lfs');
        expect(html).toContain('git-lfs/3.7.1');
        expect(html).toContain('tools.status.available');
    });

    it('renders missing installation state without unsafe fallback values', () => {
        const html = renderToStaticMarkup(
            <ToolInstallationSettingsDrawer
                tool={{
                    ...gitLfs,
                    status: 'missing',
                    executablePath: null,
                    version: null,
                }}
                open
                onOpenChange={vi.fn()}
                onRescan={vi.fn(async () => true)}
            />,
        );

        expect(html).toContain('tools.status.missing');
        expect(html).toContain('tools.status.unknownPath');
        expect(html).toContain('tools.status.unknownVersion');
    });

    it('does not replace the specialised Git drawer', () => {
        const html = renderToStaticMarkup(
            <ToolInstallationSettingsDrawer
                tool={{ ...gitLfs, id: 'git', displayName: 'Git' }}
                open
                onOpenChange={vi.fn()}
                onRescan={vi.fn(async () => true)}
            />,
        );

        expect(html).toBe('');
    });
});
