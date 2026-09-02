import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FormField } from './formField.component';
import { HelpTooltip } from './helpTooltip.component';
import { PathField } from './pathField.component';
import { SearchField } from './searchField.component';
import {
    getEnabledOptionEdgeIndex,
    getEnabledOptionIndex,
    SelectField,
} from './selectField.component';
import { TextField } from './textField.component';
import { Tooltip } from './tooltip.component';

describe('UI form primitives', () => {
    it('renders help tooltip content accessibly', () => {
        const html = renderToStaticMarkup(
            <HelpTooltip help="Use an absolute path." />,
        );

        expect(html).toContain('data-tooltip-trigger=""');
        expect(html).toContain('aria-label="Use an absolute path."');
        expect(html).toContain('lucide-circle-question-mark');
    });

    it('renders a generic tooltip trigger without pre-rendering content', () => {
        const html = renderToStaticMarkup(
            <Tooltip
                tip="Open folder"
                placement="left"
                tone="primary"
                delay={0}
            >
                <button type="button">Open</button>
            </Tooltip>,
        );

        expect(html).toContain('data-tooltip-trigger=""');
        expect(html).toContain('<button type="button">Open</button>');
        expect(html).not.toContain('Open folder');
    });

    it('mounts tooltip content only when the trigger opens', () => {
        const html = renderToStaticMarkup(
            <Tooltip tip="More information" tone="info">
                <span>Info</span>
            </Tooltip>,
        );

        expect(html).not.toContain('More information');
        expect(html).not.toContain('role="tooltip"');
    });

    it('renders form labels, help, children, and field errors', () => {
        const html = renderToStaticMarkup(
            <FormField
                id="engineName"
                label="Engine name"
                labelAction={<button type="button">Reset</button>}
                help="Shown in launcher."
                error="Engine name is required."
                compact
            >
                <input id="engineName" />
            </FormField>,
        );

        expect(html).toContain('for="engineName"');
        expect(html).toContain('Engine name');
        expect(html).toContain('>Reset</button>');
        expect(html).toContain('aria-label="Shown in launcher."');
        expect(html).toContain('aria-label="Engine name is required."');
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

    it('renders path field errors inside the input wrapper before the browse button', () => {
        const html = renderToStaticMarkup(
            <PathField
                id="customDirectory"
                label="Output folder"
                help="Folder where the file will be written."
                value=""
                onChange={vi.fn()}
                onSelect={vi.fn()}
                browseKind="directory"
                error="Output folder is required."
            />,
        );

        expect(html).toContain('data-tooltip-trigger=""');
        expect(html).toContain('aria-label="Output folder is required."');
        expect(html).toContain('lucide-circle-x');
        expect(html).toContain('lucide-folder');
    });

    it('disables both path input and browse action', () => {
        const html = renderToStaticMarkup(
            <PathField
                id="disabledPath"
                label="Editor path"
                help="Path to the editor executable."
                value=""
                onChange={vi.fn()}
                onSelect={vi.fn()}
                disabled
            />,
        );

        expect(html.match(/disabled=""/g)).toHaveLength(2);
    });

    it('can disable only the path browse action', () => {
        const html = renderToStaticMarkup(
            <PathField
                id="selectingPath"
                label="Project folder"
                value="/projects"
                onChange={vi.fn()}
                onSelect={vi.fn()}
                browseKind="directory"
                browseDisabled
            />,
        );

        expect(html.match(/disabled=""/g)).toHaveLength(1);
    });

    it('renders search field with an internal clear action', () => {
        const html = renderToStaticMarkup(
            <SearchField
                value="godot"
                onChange={vi.fn()}
                placeholder="Search"
                clearLabel="Clear search"
                compact
                data-testid="searchInput"
            />,
        );

        expect(html).toContain('placeholder="Search"');
        expect(html).toContain('value="godot"');
        expect(html).toContain('data-testid="searchInput"');
        expect(html).toContain('aria-label="Clear search"');
        expect(html).toContain('lucide-circle-x');
    });

    it('renders select field as a popover dropdown', () => {
        const html = renderToStaticMarkup(
            <SelectField
                id="engineArch"
                label="Architecture"
                help="CPU architecture."
                value="x64"
                onChange={vi.fn()}
                options={[
                    { value: 'universal', label: 'Universal' },
                    { value: 'x64', label: 'x64' },
                    { value: 'arm64', label: 'ARM64' },
                ]}
            />,
        );

        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain('aria-label="Architecture: x64"');
        expect(html).toContain('aria-controls=');
        expect(html).toContain('popover="auto"');
        expect(html).toContain('role="listbox"');
        expect(html).toContain('role="option"');
        expect(html).toContain('aria-selected="true"');
        expect(html).not.toContain('lucide-check');
        expect(html).not.toContain('<select');
        expect(html).not.toContain('<option');
    });

    it('renders an optional check only for the selected option', () => {
        const html = renderToStaticMarkup(
            <SelectField
                id="codeEditorWithCheck"
                ariaLabel="Code editor"
                value="vscode"
                showSelectedCheck
                onChange={vi.fn()}
                options={[
                    { value: '', label: 'None' },
                    { value: 'vscode', label: 'Visual Studio Code' },
                ]}
            />,
        );

        expect(html.match(/lucide-check/g)).toHaveLength(1);
    });

    it('supports label-free disabled fields and disabled options', () => {
        const html = renderToStaticMarkup(
            <SelectField
                id="codeEditor"
                testId="selectCodeEditor"
                ariaLabel="Code editor"
                value=""
                disabled
                onChange={vi.fn()}
                options={[
                    { value: '', label: 'None' },
                    {
                        value: 'vscode',
                        label: 'Visual Studio Code',
                        disabled: true,
                    },
                ]}
            />,
        );

        expect(html).toContain('aria-label="Code editor: None"');
        expect(html).toContain('data-testid="selectCodeEditor"');
        expect(html.match(/disabled=""/g)).toHaveLength(2);
        expect(html).toContain('Visual Studio Code');
    });

    it('navigates only enabled select options and preserves normal Tab flow', () => {
        const options = [
            { value: '', label: 'None' },
            { value: 'disabled', label: 'Disabled', disabled: true },
            { value: 'vscode', label: 'Visual Studio Code' },
            { value: 'other', label: 'Other editor' },
        ];

        expect(getEnabledOptionEdgeIndex(options, 'first')).toBe(0);
        expect(getEnabledOptionEdgeIndex(options, 'last')).toBe(3);
        expect(getEnabledOptionIndex(options, 0, 1)).toBe(2);
        expect(getEnabledOptionIndex(options, 3, 1)).toBe(0);
        expect(getEnabledOptionIndex(options, 0, -1)).toBe(3);
    });

    it('disables text fields through the reusable primitive', () => {
        const html = renderToStaticMarkup(
            <TextField
                id="disabledText"
                label="Launch arguments"
                help="Arguments passed to the editor."
                value=""
                onChange={vi.fn()}
                disabled
            />,
        );

        expect(html).toContain('disabled=""');
    });
});
