import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from './selectField.component.js';

describe('SelectField', () => {
    it('keeps the subtle selected background with readable text', () => {
        const html = renderToStaticMarkup(
            <SelectField
                id="editor"
                value="vscode"
                onChange={vi.fn()}
                options={[
                    { value: 'none', label: 'None' },
                    { value: 'vscode', label: 'Visual Studio Code' },
                    { value: 'vscodium', label: 'VSCodium' },
                ]}
                showSelectedCheck
            />,
        );
        const selectedOption = html.match(
            /<button[^>]*aria-selected="true"[^>]*>/,
        )?.[0];

        expect(selectedOption).toContain('menu-active');
        expect(
            html.match(/bg-\[var\(--select-field-background\)\]/g),
        ).toHaveLength(2);
        expect(selectedOption).toContain('bg-base-200');
        expect(selectedOption).toContain('text-base-content');
    });
});
