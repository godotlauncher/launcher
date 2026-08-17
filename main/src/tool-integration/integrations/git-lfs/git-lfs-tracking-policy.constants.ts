import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';

export const GODOT_GIT_LFS_TRACKING_POLICY = {
    id: 'godot-documentation-defaults',
    groups: [
        {
            id: 'models',
            patterns: ['*.fbx', '*.gltf', '*.glb', '*.blend', '*.obj'],
        },
        {
            id: 'images',
            patterns: [
                '*.png',
                '*.svg',
                '*.jpg',
                '*.jpeg',
                '*.gif',
                '*.tga',
                '*.webp',
                '*.exr',
                '*.hdr',
                '*.dds',
            ],
        },
        { id: 'audio', patterns: ['*.mp3', '*.wav', '*.ogg'] },
        {
            id: 'fontsAndIcons',
            patterns: ['*.ttf', '*.otf', '*.ico'],
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
} as const satisfies GitLfsTrackingPolicyDescriptor;
