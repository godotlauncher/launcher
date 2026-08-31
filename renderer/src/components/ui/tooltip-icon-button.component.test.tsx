import { CircleHelp } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipIconButton } from './tooltip-icon-button.component';

describe('TooltipIconButton', () => {
    it('renders an accessible tooltip trigger', () => {
        const html = renderToStaticMarkup(
            <TooltipIconButton label="More information" tip="Helpful text">
                <CircleHelp aria-hidden="true" />
            </TooltipIconButton>,
        );

        expect(html).toContain('aria-label="More information"');
        expect(html).toContain('data-tooltip-trigger=""');
        expect(html).not.toContain('Helpful text');
    });
});
