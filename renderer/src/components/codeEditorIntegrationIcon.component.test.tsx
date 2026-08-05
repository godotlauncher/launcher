import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodeEditorIntegrationIcon } from './codeEditorIntegrationIcon.component';

describe('CodeEditorIntegrationIcon', () => {
    it.each([
        ['vscode', 'vscode.svg'],
        ['vscodium', 'data:image/svg+xml'],
    ] as const)(
        'renders the icon registered for %s',
        (integrationId, source) => {
            const html = renderToStaticMarkup(
                <CodeEditorIntegrationIcon
                    integrationId={integrationId}
                    className="size-5"
                />,
            );

            expect(html).toContain('<img');
            expect(html).toContain(source);
            expect(html).toContain('class="size-5"');
            expect(html).toContain('alt=""');
            expect(html).toContain('aria-hidden="true"');
        },
    );
});
