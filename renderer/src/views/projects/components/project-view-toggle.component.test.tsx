import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectViewToggle } from './project-view-toggle.component';

describe('ProjectViewToggle', () => {
    it.each([
        ['dense', 'List view'],
        ['list', 'Compact view'],
        ['cards', 'Cards view'],
    ] as const)('names and selects the %s tab', (mode, selectedLabel) => {
        const html = renderToStaticMarkup(
            <ProjectViewToggle
                mode={mode}
                onChange={vi.fn()}
                listLabel="List view"
                compactLabel="Compact view"
                cardsLabel="Cards view"
            />,
        );

        expect(html).toMatch(/role="tablist"/);
        expect(html).toMatch(/data-testid="tabProjectDenseList"/);
        expect(html).toMatch(/data-testid="tabProjectList"/);
        expect(html).toMatch(/data-testid="tabProjectCards"/);
        expect(html).toMatch(
            new RegExp(
                `aria-label="${selectedLabel}"[^>]*aria-selected="true"`,
            ),
        );
        expect(html).not.toMatch(/>List view<|>Compact view<|>Cards view</);
    });

    it('exposes unavailable controls while a preference save is pending', () => {
        const html = renderToStaticMarkup(
            <ProjectViewToggle
                mode="list"
                onChange={vi.fn()}
                listLabel="List view"
                compactLabel="Compact view"
                cardsLabel="Cards view"
                disabled
            />,
        );

        expect(html.match(/aria-disabled="true"/g)).toHaveLength(3);
    });
});
