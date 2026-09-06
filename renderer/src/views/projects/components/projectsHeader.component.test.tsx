import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsHeader } from './projectsHeader.component.tsx';

describe('ProjectsHeader', () => {
    it('keeps the title and location while hiding list controls', () => {
        const html = renderToStaticMarkup(
            <ProjectsHeader
                viewMode="cards"
                onViewModeChange={vi.fn()}
                cardsViewLabel="Cards view"
                listViewLabel="List view"
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
        expect(html).not.toContain('tabProjectList');
        expect(html).not.toContain('>Add<');
        expect(html).not.toContain('>New Project<');
        expect(html).not.toContain('placeholder="Search"');
    });
});
