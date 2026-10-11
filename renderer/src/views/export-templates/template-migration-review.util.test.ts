import type {
    TemplateMigrationProjectPlan,
    TemplateMigrationVersionPlan,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { migrationReviewGroups } from './template-migration-review.util';

const versions: TemplateMigrationVersionPlan[] = [
    '4.3.stable',
    '4.4.stable',
    '4.4.stable.mono',
].map((setId, index) => ({
    setId,
    choice: 'save-imported',
    destination: 'imported',
    sharedFiles: 'unchanged',
    localFiles: 'remove-after-verification',
    pending: false,
    fileCount: index + 1,
    sizeBytes: 100 * (index + 1),
}));
const project: TemplateMigrationProjectPlan = {
    projectPath: 'sample',
    name: 'Project',
    selectionMode: 'all-versions',
    versions,
};

describe('migrationReviewGroups', () => {
    it('combines one project-wide action without losing any version or its file details', () => {
        const before = structuredClone(project);
        expect(migrationReviewGroups(project)).toEqual([versions]);
        expect(project).toEqual(before);
    });

    it('keeps explicitly individual choices separate even when they match', () => {
        expect(
            migrationReviewGroups({ ...project, selectionMode: 'per-version' }),
        ).toEqual(versions.map((version) => [version]));
    });

    it.each<Partial<TemplateMigrationVersionPlan>>([
        { choice: 'share-project' },
        { destination: 'shared' },
        { sharedFiles: 'add-missing' },
        { localFiles: 'remove-after-connection' },
        { pending: true },
    ])('does not conceal a different reviewed effect (%j)', (difference) => {
        const changed = [
            versions[0],
            { ...versions[1], ...difference },
            versions[2],
        ];
        expect(
            migrationReviewGroups({ ...project, versions: changed }),
        ).toEqual(changed.map((version) => [version]));
    });

    it('does not create an empty group for a project without versions', () => {
        expect(migrationReviewGroups({ ...project, versions: [] })).toEqual([]);
    });
});
