import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsHeader } from './projectsHeader.component.tsx';

describe('ProjectsHeader', () => {
    it('keeps the title and location while hiding list controls', () => {
        const html = renderToStaticMarkup(
            <ProjectsHeader
                title="Projects"
                projectsLocation="/Projects"
                searchPlaceholder="Search"
                searchValue=""
                onSearchChange={vi.fn()}
                onAddProject={vi.fn()}
                onCreateProject={vi.fn()}
                createDisabled={false}
                addLabel="Add"
                createLabel="New Project"
                copyPathLabel="Copy path"
                copiedLabel="Copied"
                showControls={false}
            />,
        );

        expect(html).toContain('Projects');
        expect(html).toContain('/Projects');
        expect(html).not.toContain('btnProjectAdd');
        expect(html).not.toContain('btnProjectCreate');
        expect(html).not.toContain('inputProjectSearch');
    });
});
