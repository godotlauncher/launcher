import type { ProjectDetails } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { getProjectSections, getProjectsViewState } from './projectsView.model';

function project(
    name: string,
    options: {
        addedAt?: string;
        lastOpened?: string;
        pinned?: boolean;
        pinnedOrder?: number;
    } = {},
): ProjectDetails {
    return {
        name,
        path: `/projects/${name.toLowerCase()}`,
        added_at: options.addedAt ? new Date(options.addedAt) : undefined,
        last_opened: options.lastOpened ? new Date(options.lastOpened) : null,
        pinned: options.pinned,
        pinned_order: options.pinnedOrder,
    } as ProjectDetails;
}

describe('getProjectSections', () => {
    it('keeps pinned projects out of new and recents', () => {
        const newPinned = project('New Pinned', { pinned: true });
        const recentPinned = project('Recent Pinned', {
            pinned: true,
            lastOpened: '2026-08-08T12:00:00Z',
        });

        const sections = getProjectSections([newPinned, recentPinned], '');

        expect(sections.newProjects).toEqual([]);
        expect(sections.pinnedProjects).toEqual([recentPinned, newPinned]);
        expect(sections.recentProjects).toEqual([]);
    });

    it('sorts new projects by last added and recent projects by last opened', () => {
        const alpha = project('Alpha', {
            addedAt: '2026-08-01T12:00:00Z',
        });
        const zulu = project('Zulu', {
            addedAt: '2026-08-08T12:00:00Z',
        });
        const older = project('Older', {
            lastOpened: '2026-08-01T12:00:00Z',
        });
        const newer = project('Newer', {
            lastOpened: '2026-08-08T12:00:00Z',
        });

        const sections = getProjectSections([zulu, older, alpha, newer], '');

        expect(sections.newProjects.map(({ name }) => name)).toEqual([
            'Zulu',
            'Alpha',
        ]);
        expect(sections.recentProjects.map(({ name }) => name)).toEqual([
            'Newer',
            'Older',
        ]);
    });

    it('sorts pinned projects by stored order before legacy fallback', () => {
        const second = project('Second', {
            pinned: true,
            pinnedOrder: 1,
        });
        const first = project('First', {
            pinned: true,
            pinnedOrder: 0,
        });
        const legacyNewer = project('Legacy Newer', {
            pinned: true,
            lastOpened: '2026-08-08T12:00:00Z',
        });
        const legacyOlder = project('Legacy Older', {
            pinned: true,
            lastOpened: '2026-08-01T12:00:00Z',
            pinnedOrder: -1,
        });

        const sections = getProjectSections(
            [legacyOlder, second, legacyNewer, first],
            '',
        );

        expect(sections.pinnedProjects.map(({ name }) => name)).toEqual([
            'First',
            'Second',
            'Legacy Newer',
            'Legacy Older',
        ]);
    });

    it('filters every section using the same search', () => {
        const match = project('Matching Project', { pinned: true });
        const other = project('Other Project', {
            lastOpened: '2026-08-08T12:00:00Z',
        });

        const sections = getProjectSections([match, other], ' matching ');

        expect(sections.newProjects).toEqual([]);
        expect(sections.pinnedProjects).toEqual([match]);
        expect(sections.recentProjects).toEqual([]);
    });
});

describe('getProjectsViewState', () => {
    it('selects the correct first-project state from editor availability', () => {
        expect(
            getProjectsViewState({
                projectCount: 0,
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                textSearch: '',
                projectsLoading: false,
                releasesLoading: false,
                releasesInitialized: true,
            }),
        ).toBe('empty-without-editor');
        expect(
            getProjectsViewState({
                projectCount: 0,
                installedReleaseCount: 1,
                downloadingReleaseCount: 0,
                textSearch: '',
                projectsLoading: false,
                releasesLoading: false,
                releasesInitialized: true,
            }),
        ).toBe('empty-with-editor');
    });

    it('keeps existing and filtered project collections on the list path', () => {
        expect(
            getProjectsViewState({
                projectCount: 1,
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                textSearch: '',
                projectsLoading: false,
                releasesLoading: false,
                releasesInitialized: true,
            }),
        ).toBe('list');
        expect(
            getProjectsViewState({
                projectCount: 0,
                installedReleaseCount: 1,
                downloadingReleaseCount: 0,
                textSearch: 'missing',
                projectsLoading: false,
                releasesLoading: false,
                releasesInitialized: true,
            }),
        ).toBe('list');
    });

    it('does not select an empty state until both resources finish loading', () => {
        expect(
            getProjectsViewState({
                projectCount: 0,
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                textSearch: '',
                projectsLoading: true,
                releasesLoading: false,
                releasesInitialized: true,
            }),
        ).toBe('loading');
        expect(
            getProjectsViewState({
                projectCount: 0,
                installedReleaseCount: 0,
                downloadingReleaseCount: 0,
                textSearch: '',
                projectsLoading: false,
                releasesLoading: true,
                releasesInitialized: false,
            }),
        ).toBe('loading');
    });

    it('keeps installation and ready states stable during background release refreshes', () => {
        expect(
            getProjectsViewState({
                projectCount: 0,
                installedReleaseCount: 0,
                downloadingReleaseCount: 1,
                textSearch: '',
                projectsLoading: false,
                releasesLoading: true,
                releasesInitialized: true,
            }),
        ).toBe('empty-installing-editor');
        expect(
            getProjectsViewState({
                projectCount: 0,
                installedReleaseCount: 1,
                downloadingReleaseCount: 0,
                textSearch: '',
                projectsLoading: false,
                releasesLoading: true,
                releasesInitialized: true,
            }),
        ).toBe('empty-with-editor');
    });
});
