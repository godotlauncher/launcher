import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    getEditorProjectUsageCount,
    getInstallsViewState,
} from './installsView.model.ts';

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
