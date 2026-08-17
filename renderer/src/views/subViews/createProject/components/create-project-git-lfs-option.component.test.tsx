import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectGitLfsOption } from './create-project-git-lfs-option.component';

const labels: Record<string, string> = {
    'otherSettings.gitLfs.label': 'Use Git LFS',
    'otherSettings.gitLfs.description': 'Track common Godot assets.',
    'otherSettings.gitLfs.unavailable': 'Git LFS is unavailable.',
    'otherSettings.gitLfs.patternsTitle': 'Tracked file types',
    'otherSettings.gitLfs.groups.models': '3D models',
    'otherSettings.gitLfs.groups.godot': 'Godot resources',
    'otherSettings.gitLfs.storageAndBandwidth':
        'Git LFS uses remote storage and bandwidth.',
};

const policy: GitLfsTrackingPolicyDescriptor = {
    id: 'godot-documentation-defaults',
    groups: [
        {
            id: 'models',
            patterns: ['*.fbx', '*.gltf', '*.glb', '*.blend', '*.obj'],
        },
        {
            id: 'godot',
            patterns: [
                '*.scn',
                '*.res',
                '*.material',
                '*.anim',
                '*.mesh',
                '*.lmbake',
            ],
        },
    ],
};

const t = (key: string) => labels[key] ?? key;

describe('CreateProjectGitLfsOption', () => {
    it('renders the main-owned tracking descriptor when selected', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitLfsOption
                t={t}
                available
                policy={policy}
                selected
                onSelectedChange={vi.fn()}
            />,
        );

        expect(html).toContain('Tracked file types');
        expect(html).toContain('*.fbx *.gltf *.glb *.blend *.obj');
        expect(html).toContain('*.scn *.res *.material *.anim *.mesh *.lmbake');
        expect(html).toContain('Git LFS uses remote storage and bandwidth.');
    });

    it('disables selection when Git LFS is unavailable', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitLfsOption
                t={t}
                available={false}
                policy={null}
                selected={false}
                onSelectedChange={vi.fn()}
            />,
        );

        expect(html).toContain('Git LFS is unavailable.');
        expect(html).toContain('disabled=""');
        expect(html).not.toContain('Tracked file types');
    });
});
