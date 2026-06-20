import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FormField } from './formField.component';
import { HelpTooltip } from './helpTooltip.component';
import { PathField } from './pathField.component';

describe('UI form primitives', () => {
    it('renders help tooltip content accessibly', () => {
        const html = renderToStaticMarkup(
            <HelpTooltip help="Use an absolute path." />,
        );

        expect(html).toContain('data-tip="Use an absolute path."');
        expect(html).toContain('aria-label="Use an absolute path."');
        expect(html).toContain('lucide-circle-question-mark');
    });

    it('renders form labels, help, children, and field errors', () => {
        const html = renderToStaticMarkup(
            <FormField
                id="engineName"
                label="Engine name"
                help="Shown in launcher."
                error="Engine name is required."
                compact
            >
                <input id="engineName" />
            </FormField>,
        );

        expect(html).toContain('for="engineName"');
        expect(html).toContain('Engine name');
        expect(html).toContain('data-tip="Shown in launcher."');
        expect(html).toContain('data-tip="Engine name is required."');
        expect(html).toContain('lucide-circle-x');
    });

    it('uses explicit path browse kind for folder and file icons', () => {
        const directoryHtml = renderToStaticMarkup(
            <PathField
                id="customDirectory"
                label="Output folder"
                help="Folder where the file will be written."
                value=""
                onChange={vi.fn()}
                onSelect={vi.fn()}
                browseKind="directory"
            />,
        );
        const fileHtml = renderToStaticMarkup(
            <PathField
                id="customFile"
                label="Editor path"
                help="Path to the editor executable."
                value=""
                onChange={vi.fn()}
                onSelect={vi.fn()}
                browseKind="file"
            />,
        );

        expect(directoryHtml).toContain('lucide-folder');
        expect(directoryHtml).not.toContain('lucide-file');
        expect(fileHtml).toContain('lucide-file');
    });
});
