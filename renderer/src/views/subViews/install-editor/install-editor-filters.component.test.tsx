import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallEditorFilters } from './install-editor-filters.component.tsx';

vi.mock('../../../components/ui/tooltip.component.tsx', () => ({
    Tooltip: ({ tip, children }: { tip: string; children: ReactNode }) => (
        <span data-tip={tip}>{children}</span>
    ),
}));

describe('InstallEditorFilters', () => {
    it('keeps Reload as the rightmost control and uses the shared tooltip', () => {
        const html = renderFilters(0, true);

        expect(html).toContain('data-tip="Reload release list"');
        expect(html).not.toContain('title=');
        expect(html.indexOf('role="status"')).toBeLessThan(
            html.indexOf('btnRefreshInstallEditorCatalog'),
        );
    });

    it('disables Reload during its cooldown', () => {
        const html = renderFilters(42, false);

        expect(html).toContain('42s cooldown');
        expect(html).toContain(
            'data-tip="You can refresh once per minute to reduce requests to GitHub."',
        );
        expect(html).toContain('data-testid="btnRefreshInstallEditorCatalog"');
        expect(html).toContain('disabled=""');
    });
});

/**
 * Renders the editor catalog filters for a focused test.
 *
 * @param refreshCooldownSeconds - The cooldown time still visible.
 * @param loading - Whether the catalog is loading.
 * @returns The rendered filter markup.
 */
function renderFilters(
    refreshCooldownSeconds: number,
    loading: boolean,
): string {
    return renderToStaticMarkup(
        <InstallEditorFilters
            show="latest"
            channel="stable"
            loading={loading}
            refreshCooldownSeconds={refreshCooldownSeconds}
            showLabel="Show"
            latestLabel="Latest"
            allLabel="All"
            channelLabel="Channel"
            stableLabel="Stable"
            prereleaseLabel="Prerelease"
            refreshLabel="Reload release list"
            loadingLabel="Loading editor versions"
            cooldownLabel={`${refreshCooldownSeconds}s cooldown`}
            cooldownTooltip="You can refresh once per minute to reduce requests to GitHub."
            onShowChange={vi.fn()}
            onChannelChange={vi.fn()}
            onRefresh={vi.fn()}
        />,
    );
}
