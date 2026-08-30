import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectGitLfsOption } from './create-project-git-lfs-option.component';

const labels: Record<string, string> = {
    'otherSettings.gitLfs.label': 'Use Git LFS',
    'otherSettings.gitLfs.description': 'Track common Godot assets.',
    'otherSettings.gitLfs.unavailable': 'Git LFS is not installed',
    'otherSettings.unavailableLabel': 'Unavailable',
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
    it('keeps the tracking descriptor behind an accessible help trigger', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitLfsOption
                t={t}
                available
                policy={policy}
                selected={false}
                onSelectedChange={vi.fn()}
            />,
        );

        expect(html).toContain('data-tooltip-trigger=""');
        expect(html).toContain('aria-label="Tracked file types"');
        expect(html).not.toContain('*.fbx *.gltf *.glb *.blend *.obj');
        expect(html).not.toContain(
            '*.scn *.res *.material *.anim *.mesh *.lmbake',
        );
    });

    it('disables selection when Git LFS is unavailable', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitLfsOption
                t={t}
                available={false}
                policy={policy}
                selected={false}
                onSelectedChange={vi.fn()}
            />,
        );

        expect(html).toContain('Unavailable');
        expect(html).toContain('aria-label="Git LFS is not installed"');
        expect(html).not.toContain('>Git LFS is not installed<');
        expect(html).toContain('disabled=""');
        expect(html).not.toContain('aria-label="Tracked file types"');
    });
});
