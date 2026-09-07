import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GitHubConnectionDialog } from './github-connection-dialog.component';

describe('GitHubConnectionDialog', () => {
    it('starts with an explicit browser continuation instead of authorising on mount', () => {
        const html = renderToStaticMarkup(
            <GitHubConnectionDialog onConnected={vi.fn()} onCancel={vi.fn()} />,
        );

        expect(html).toContain('<dialog');
        expect(html).toContain('connections.github.description');
        expect(html).toContain('connections.flow.browserDescription');
        expect(html).toContain('connections.github.accessNote');
        expect(html).toContain('connections.flow.continueInBrowser');
        expect(html).not.toContain('connections.flow.waiting');
    });
});
