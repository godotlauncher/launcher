import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CopyBadge } from './copyBadge.component';

describe('CopyBadge', () => {
    it('renders a compact copy affordance for long values', () => {
        const html = renderToStaticMarkup(
            <CopyBadge
                value="/Users/docs/Godot/Projects/my-awesome-game"
                label="Copy path"
                copiedLabel="Copied"
                data-testid="copyPath"
            />,
        );

        expect(html).toContain('aria-label="Copy path"');
        expect(html).toContain(
            'title="/Users/docs/Godot/Projects/my-awesome-game"',
        );
        expect(html).toContain('data-testid="copyPath"');
        expect(html).toContain('font-mono');
        expect(html).toContain('truncate');
        expect(html).toContain('lucide-copy');
    });
});
