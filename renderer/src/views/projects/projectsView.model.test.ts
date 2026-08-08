import type { ProjectDetails } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { getProjectSections } from './projectsView.model';

function project(
    name: string,
    options: { addedAt?: string; lastOpened?: string; pinned?: boolean } = {},
): ProjectDetails {
    return {
        name,
        path: `/projects/${name.toLowerCase()}`,
        added_at: options.addedAt ? new Date(options.addedAt) : undefined,
        last_opened: options.lastOpened ? new Date(options.lastOpened) : null,
        pinned: options.pinned,
    } as ProjectDetails;
}

describe('getProjectSections', () => {
    it('keeps section membership independent', () => {
        const newPinned = project('New Pinned', { pinned: true });
        const recentPinned = project('Recent Pinned', {
            pinned: true,
            lastOpened: '2026-08-08T12:00:00Z',
        });

        const sections = getProjectSections([newPinned, recentPinned], '');

        expect(sections.newProjects).toEqual([newPinned]);
        expect(sections.pinnedProjects).toEqual([recentPinned, newPinned]);
        expect(sections.recentProjects).toEqual([recentPinned]);
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

    it('filters every section using the same search', () => {
        const match = project('Matching Project', { pinned: true });
        const other = project('Other Project', {
            lastOpened: '2026-08-08T12:00:00Z',
        });

        const sections = getProjectSections([match, other], ' matching ');

        expect(sections.newProjects).toEqual([match]);
        expect(sections.pinnedProjects).toEqual([match]);
        expect(sections.recentProjects).toEqual([]);
    });
});
