import type { InstalledRelease } from '@shared';
import { describe, expect, it } from 'vitest';
import {
    getSelectableInstalledReleaseRows,
    getSelectableReleaseKey,
} from './selectInstalledRelease.model';

const installedRelease = (
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease => ({
    version,
    version_number: parseInt(version, 10),
    install_path: `/Godot/${version}`,
    editor_path: `/Godot/${version}/Godot`,
    platform: 'linux',
    arch: 'x64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: true,
    ...overrides,
});

describe('select installed release model helpers', () => {
    it('keeps compatible releases and appends downloading release rows', () => {
        const rows = getSelectableInstalledReleaseRows(
            [
                installedRelease('3.6', { version_number: 3 }),
                installedRelease('4.2', { version_number: 4 }),
            ],
            [
                {
                    version: '4.3',
                    mono: true,
                    prerelease: false,
                    published_at: null,
                },
            ],
            installedRelease('4.1', { version_number: 4 }),
        );

        expect(rows.some((row) => row.version === '3.6')).toBe(false);
        expect(rows.some((row) => row.version === '4.2')).toBe(true);
        expect(rows.find((row) => row.version === '4.3')).toMatchObject({
            editor_path: '',
            mono: true,
            valid: true,
        });
    });

    it('builds stable release keys', () => {
        expect(getSelectableReleaseKey(installedRelease('4.2'))).toBe(
            '4.2_standard',
        );
        expect(
            getSelectableReleaseKey(installedRelease('4.2', { mono: true })),
        ).toBe('4.2_mono');
    });
});
