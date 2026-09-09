import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AddProjectSourceMenu } from './add-project-source-menu.component';

vi.mock('../../../components/ui/action-menu.component', () => ({
    ActionMenu: ({
        open,
        items,
    }: {
        open: boolean;
        items: Array<{
            key: string;
            label?: ReactNode;
            disabled?: boolean;
        }>;
    }) =>
        open ? (
            <div>
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        disabled={item.disabled}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        ) : null,
}));

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

        expect(html).toContain('addProject.sources.fromComputer');
        expect(html).toContain('addProject.sources.publicGit');
        expect(html).toContain('addProject.sources.github');
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

    it('keeps remote choices unavailable while checking Git', () => {
        const html = renderToStaticMarkup(
            <AddProjectSourceMenu
                anchorRect={anchorRect}
                gitAvailability="loading"
                t={translate}
                onClose={vi.fn()}
                onFromComputer={vi.fn()}
                onPublicGit={vi.fn()}
                onGitHub={vi.fn()}
            />,
        );

        expect(html).toContain('addProject.sources.publicGit');
        expect(html).toContain('addProject.sources.github');
        expect(html).not.toContain('addProject.sources.checkingGit');
        expect(html.match(/disabled=""/g)).toHaveLength(2);
    });
});
