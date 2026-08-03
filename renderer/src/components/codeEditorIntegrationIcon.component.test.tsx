import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodeEditorIntegrationIcon } from './codeEditorIntegrationIcon.component';

describe('CodeEditorIntegrationIcon', () => {
    it('renders the icon registered for an integration', () => {
        const html = renderToStaticMarkup(
            <CodeEditorIntegrationIcon
                integrationId="vscode"
                className="size-5"
            />,
        );

        expect(html).toContain('<img');
        expect(html).toContain('vscode.svg');
        expect(html).toContain('class="size-5"');
        expect(html).toContain('alt=""');
        expect(html).toContain('aria-hidden="true"');
    });
});
