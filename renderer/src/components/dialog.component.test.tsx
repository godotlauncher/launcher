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
        expect(html).toContain('max-w-lg');
        expect(html).not.toContain(' open=""');
        expect(html).not.toContain('role="dialog"');
        expect(html).not.toContain('aria-modal="true"');
    });

    it('wraps footer actions when they exceed the dialog width', () => {
        const html = renderToStaticMarkup(
            <Dialog
                title="Example dialog"
                footer={
                    <>
                        <button type="button">Primary action</button>
                        <button type="button">Secondary action</button>
                    </>
                }
            >
                Dialog content
            </Dialog>,
        );

        expect(html).toContain('flex flex-wrap justify-end gap-2');
    });

    it('uses a custom panel width without retaining the default width', () => {
        const html = renderToStaticMarkup(
            <Dialog title="Wide dialog" panelClassName="max-w-4xl">
                Dialog content
            </Dialog>,
        );

        expect(html).toContain('max-w-4xl');
        expect(html).not.toContain('max-w-lg');
        expect(html).toContain('min-h-0 flex-1');
    });
});
