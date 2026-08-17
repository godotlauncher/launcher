import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectSourceControlSection } from './create-project-source-control-section.component';

const labels: Record<string, string> = {
    'projects:editProject.sourceControl.title': 'Source Control',
    'otherSettings.initGit': 'Initialize Git Repository',
    'otherSettings.gitNotInstalled': 'Git is not installed',
    'otherSettings.gitLfs.label': 'Use Git LFS',
    'otherSettings.gitLfs.description': 'Track common Godot assets.',
};

const t = (key: string) => labels[key] ?? key;

describe('CreateProjectSourceControlSection', () => {
    it('hides the dependent Git LFS option when Git is not selected', () => {
        const html = renderToStaticMarkup(
            <CreateProjectSourceControlSection
                t={t}
                loading={false}
                gitAvailable
                gitLfsAvailable
                gitLfsPolicy={{
                    id: 'godot-documentation-defaults',
                    groups: [],
                }}
                withGit={false}
                withGitLfs={false}
                onWithGitChange={vi.fn()}
                onWithGitLfsChange={vi.fn()}
            />,
        );

        expect(html).toContain('Source Control');
        expect(html).not.toContain('Use Git LFS');
    });
});
