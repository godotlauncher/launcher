import type { InstalledRelease } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    createProjectLauncherConfig,
    getReleaseBaseVersion,
    parseProjectLauncherConfig,
    serializeProjectLauncherConfig,
} from './projectLauncherConfig.utils.js';

const release: InstalledRelease = {
    version: '4.3-stable',
    version_number: 4.3,
    install_path: '/install/4.3',
    editor_path: '/install/4.3/Godot',
    platform: 'darwin',
    arch: 'arm64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: true,
};

describe('projectLauncherConfig.utils', () => {
    it('serializes the v1 project config shape', () => {
        const config = createProjectLauncherConfig(release, '1.9.0');

        expect(serializeProjectLauncherConfig(config)).toBe(`[config]
version=1

[launcher]
version=1.9.0

[editor]
channel=official
flavor=gdscript
base_version=4.3
version=4.3-stable
`);
    });

    it('parses a valid project config', () => {
        const config = parseProjectLauncherConfig(`[config]
version=1

[launcher]
version=1.9.0

[editor]
channel=custom
flavor=dotnet
base_version=4.6
version=4.6-custom.1
`);

        expect(config).toEqual({
            config: { version: 1 },
            launcher: { version: '1.9.0' },
            editor: {
                channel: 'custom',
                flavor: 'dotnet',
                base_version: '4.6',
                version: '4.6-custom.1',
            },
        });
    });

    it('serializes and parses the optional last opened timestamp', () => {
        const lastOpened = new Date('2024-05-06T07:08:09.000Z');
        const config = createProjectLauncherConfig(
            release,
            '1.9.0',
            lastOpened,
        );

        expect(serializeProjectLauncherConfig(config)).toBe(`[config]
version=1

[launcher]
version=1.9.0

[project]
last_opened=2024-05-06T07:08:09.000Z

[editor]
channel=official
flavor=gdscript
base_version=4.3
version=4.3-stable
`);

        expect(
            parseProjectLauncherConfig(serializeProjectLauncherConfig(config)),
        ).toEqual(config);
    });

    it('ignores invalid last opened timestamps', () => {
        const config = parseProjectLauncherConfig(`[config]
version=1

[launcher]
version=1.9.0

[project]
last_opened=not-a-date

[editor]
channel=official
flavor=gdscript
base_version=4.3
version=4.3-stable
`);

        expect(config?.project).toBeUndefined();
    });

    it('ignores unsupported config versions', () => {
        const config = parseProjectLauncherConfig(`[config]
version=2

[launcher]
version=1.9.0

[editor]
channel=official
flavor=gdscript
base_version=4.3
version=4.3-stable
`);

        expect(config).toBeNull();
    });

    it('preserves base versions from the version string when possible', () => {
        expect(
            getReleaseBaseVersion({
                version: '4.10.1-stable',
                version_number: 4.1,
            }),
        ).toBe('4.10');
    });

    it('writes custom release flavors when present', () => {
        const config = createProjectLauncherConfig(
            {
                ...release,
                source: 'custom',
                flavor: 'steam',
            },
            '1.9.0',
        );

        expect(config.editor).toMatchObject({
            channel: 'custom',
            flavor: 'steam',
        });
    });
});
