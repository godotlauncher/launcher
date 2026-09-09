import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from './action-menu.component';

describe('ActionMenu', () => {
    it('keeps portal content out of server-rendered markup', () => {
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

        expect(html).toBe('<span hidden=""></span>');
    });
});
