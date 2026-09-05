import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CopyBadge } from './copyBadge.component';

describe('CopyBadge', () => {
    it('provides an accessible copy affordance for long values', () => {
        const html = renderToStaticMarkup(
            <CopyBadge
                value="/Users/docs/Godot/Projects/my-awesome-game"
                label="Copy path"
                copiedLabel="Copied"
            />,
        );

        expect(html).toContain('aria-label="Copy path"');
        expect(html).toContain(
            'title="/Users/docs/Godot/Projects/my-awesome-game"',
        );
    });
});
