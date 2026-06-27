import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from './actionMenu.component';

describe('ActionMenu', () => {
    it('renders a blocking DaisyUI menu with a base-300 panel', () => {
        const html = renderToStaticMarkup(
            <ActionMenu
                open
                anchorRect={{
                    top: 10,
                    right: 100,
                    bottom: 50,
                    left: 60,
                    width: 40,
                    height: 40,
                }}
                ariaLabel="Project actions"
                title="My Project"
                onClose={vi.fn()}
                items={[
                    {
                        key: 'open',
                        label: 'Open folder',
                        onSelect: vi.fn(),
                    },
                    {
                        type: 'separator',
                        key: 'separator',
                    },
                    {
                        key: 'delete',
                        label: 'Delete',
                        destructive: true,
                        onSelect: vi.fn(),
                    },
                ]}
            />,
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('aria-modal="true"');
        expect(html).toContain('menu-title');
        expect(html).toContain('My Project');
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain('bg-base-300');
        expect(html).toContain('text-error');
    });
});
