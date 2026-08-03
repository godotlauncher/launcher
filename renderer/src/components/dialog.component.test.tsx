import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from './dialog.component';

describe('Dialog', () => {
    it('renders in a fixed modal layer above drawers', () => {
        const html = renderToStaticMarkup(
            <Dialog title="Example dialog">Dialog content</Dialog>,
        );

        expect(html).toContain('class="fixed z-60 inset-0');
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
});
