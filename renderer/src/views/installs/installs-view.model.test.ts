import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    getEditorProjectUsageCount,
    getInstallsViewState,
    getSelectableInstalledEditors,
} from './installs-view.model.ts';

describe('getInstallsViewState', () => {
    it('selects the guided empty state after loading completes', () => {
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                loading: false,
                hasError: false,
            }),
        ).toBe('empty');
    });

    it('keeps download and installed rows on the list path', () => {
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 1,
                loading: false,
                hasError: false,
            }),
        ).toBe('list');
        expect(
            getInstallsViewState({
                installedReleaseCount: 1,
                downloadingReleaseCount: 0,
                loading: false,
                hasError: false,
            }),
        ).toBe('list');
    });

    it('does not flash the empty state while loading or after an error', () => {
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                loading: true,
                hasError: false,
            }),
        ).toBe('loading');
        expect(
            getInstallsViewState({
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                loading: false,
                hasError: true,
            }),
        ).toBe('loading');
    });
});

describe('getSelectableInstalledEditors', () => {
    it('excludes queued, reinstalling and busy editors without mixing flavours', () => {
        const standard = {
            version: '4.7-stable',
            mono: false,
            install_path: '/standard',
        } as InstalledRelease;
        const dotnet = { ...standard, mono: true, install_path: '/dotnet' };
        const busy = { ...standard, version: '4.6-stable' };
        const custom = {
            ...standard,
            version: 'custom',
            source: 'custom' as const,
        };

        expect(
            getSelectableInstalledEditors(
                [standard, dotnet, busy, custom],
                [{ version: standard.version, mono: false }],
                (release) => release === busy,
            ),
        ).toEqual([dotnet, custom]);
    });
});

describe('getEditorProjectUsageCount', () => {
    it('matches project assignments by identity or stored editor path', () => {
        const release = {
            version: '4.8-dev3',
            mono: false,
            editor_path: '/editors/4.8/Godot',
        } as InstalledRelease;
        const projects = [
            {
                release: {
                    version: '4.8-dev3',
                    mono: false,
                    editor_path: '/old/location/Godot',
                },
            },
            {
                release: {
                    version: 'custom-name',
                    mono: false,
                    editor_path: '/editors/4.8/Godot',
                },
            },
            {
                release: {
                    version: '4.7-stable',
                    mono: false,
                    editor_path: '/editors/4.7/Godot',
                },
            },
        ] as ProjectDetails[];

        expect(getEditorProjectUsageCount(release, projects)).toBe(2);
    });
});
