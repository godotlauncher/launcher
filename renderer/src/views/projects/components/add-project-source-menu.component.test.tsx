import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AddProjectSourceMenu } from './add-project-source-menu.component';

const translate = (key: string) => key;
const anchorRect = {
    top: 10,
    right: 20,
    bottom: 30,
    left: 0,
    width: 20,
    height: 20,
};

describe('AddProjectSourceMenu', () => {
    it('keeps local import enabled while disabling remote choices without Git', () => {
        const html = renderToStaticMarkup(
            <AddProjectSourceMenu
                anchorRect={anchorRect}
                gitAvailability="unavailable"
                t={translate}
                onClose={vi.fn()}
                onFromComputer={vi.fn()}
                onPublicGit={vi.fn()}
                onGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('btnAddProjectFromComputer');
        expect(html).toContain('btnAddProjectPublicGit');
        expect(html).toContain('btnAddProjectGitHub');
        expect(html).toContain('addProject.sources.gitUnavailable');
        expect(html.match(/disabled=""/g)).toHaveLength(2);
    });

    it('enables both remote choices when Git is available', () => {
        const html = renderToStaticMarkup(
            <AddProjectSourceMenu
                anchorRect={anchorRect}
                gitAvailability="available"
                t={translate}
                onClose={vi.fn()}
                onFromComputer={vi.fn()}
                onPublicGit={vi.fn()}
                onGitHub={vi.fn()}
            />,
        );

        expect(html).not.toContain('disabled=""');
        expect(html).not.toContain('addProject.sources.gitUnavailable');
    });
});
