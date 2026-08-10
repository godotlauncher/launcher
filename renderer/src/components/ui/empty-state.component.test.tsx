import { FolderPlus } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state.component.tsx';

describe('EmptyState', () => {
    it('renders an informational heading, decorative icon, and both actions', () => {
        const html = renderToStaticMarkup(
            <EmptyState
                icon={FolderPlus}
                heading="Start your first project"
                description="Create something new."
                primaryActionLabel="New Project"
                secondaryActionLabel="Add an existing project"
                onPrimaryAction={vi.fn()}
                onSecondaryAction={vi.fn()}
            />,
        );

        expect(html).toContain('aria-labelledby=');
        expect(html).not.toContain('role="alert"');
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain('lucide-folder-plus');
        expect(html).toContain('Start your first project');
        expect(html).toContain('Create something new.');
        expect(html).toContain('btn btn-primary');
        expect(html).toContain('New Project');
        expect(html).toContain('Add an existing project');
    });

    it('omits the secondary action when no label is provided', () => {
        const html = renderToStaticMarkup(
            <EmptyState
                icon={FolderPlus}
                heading="Empty"
                description="Nothing here."
                primaryActionLabel="Continue"
            />,
        );

        expect(html).toContain('btnEmptyStatePrimary');
        expect(html).not.toContain('btnEmptyStateSecondary');
    });
});
