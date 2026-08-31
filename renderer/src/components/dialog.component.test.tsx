import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from './dialog.component';

describe('Dialog', () => {
    it('renders a labelled native dialog without opening it declaratively', () => {
        const html = renderToStaticMarkup(
            <Dialog title="Example dialog">Dialog content</Dialog>,
        );

        expect(html).toContain('<dialog');
        expect(html).toContain('aria-labelledby=');
        expect(html).toContain('tabindex="-1"');
        expect(html).not.toContain(' open=""');
        expect(html).not.toContain('role="dialog"');
        expect(html).not.toContain('aria-modal="true"');
    });
});
