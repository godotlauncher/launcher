import type { ToolIntegrationSummary } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GitToolSettings } from './gitToolSettings.component.js';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const availableGit: ToolIntegrationSummary = {
    id: 'git',
    displayName: 'Git',
    status: 'available',
    version: 'git version 2.51.0',
};

describe('GitToolSettings', () => {
    it('renders an available integration summary', () => {
        const html = renderToStaticMarkup(
            <GitToolSettings tool={availableGit} />,
        );

        expect(html).toContain('tools.status.available');
        expect(html).toContain('badge-success');
        expect(html).toContain('git version 2.51.0');
        expect(html).toContain(
            'class="flex w-full flex-row items-center rounded-lg bg-base-200 p-4"',
        );
        expect(html).toContain('<table class="w-full">');
        expect(html).not.toContain('max-w-xl');
    });

    it('renders invalid validation state', () => {
        const html = renderToStaticMarkup(
            <GitToolSettings
                tool={{ ...availableGit, status: 'invalid', version: null }}
            />,
        );

        expect(html).toContain('tools.status.invalid');
        expect(html).toContain('badge-warning');
        expect(html).toContain('tools.status.unknown');
    });

    it.each(['missing', 'unchecked', 'disabled'] as const)(
        'renders %s as unavailable',
        (status) => {
            const html = renderToStaticMarkup(
                <GitToolSettings
                    tool={{ ...availableGit, status, version: null }}
                />,
            );

            expect(html).toContain('tools.status.missing');
            expect(html).toContain('badge-error');
        },
    );
});
