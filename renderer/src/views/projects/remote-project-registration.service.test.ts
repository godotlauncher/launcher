import type {
    ProjectDetails,
    RemoteDiscoveredProject,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { LocalImportRow } from './local-import-editor.model';
import { registerResolvedRemoteProjectBatch } from './remote-project-registration.service';

/** Builds a reviewed row without real editor or filesystem dependencies.
 * @param id - Distinct row path and name.
 */
function row(id: string): LocalImportRow {
    return {
        projectFilePath: id,
        name: id,
        editorActions: [{ id: 'use', kind: 'use', options: {} }],
        editorActionId: 'use',
    } as LocalImportRow;
}
describe('registerResolvedRemoteProjectBatch tag assignments', () => {
    it('applies tags only to successful rows and retains stale rows for review', async () => {
        const rows = ['added', 'failed', 'stale'].map(row);
        const project = { path: 'registered-directory' } as ProjectDetails;
        const addProject = vi
            .fn()
            .mockResolvedValueOnce({ success: true, newProject: project })
            .mockResolvedValueOnce({ success: false, error: 'failed' })
            .mockResolvedValueOnce({ success: false, importConflict: 'name' });
        const onRegistered = vi.fn(async () => {});
        const result = await registerResolvedRemoteProjectBatch({
            rows,
            projects: rows.map(
                (r) =>
                    ({
                        projectFilePath: r.projectFilePath,
                        name: r.name,
                    }) as RemoteDiscoveredProject,
            ),
            codeEditorChoices: {},
            addProject,
            onRegistered,
            handleAddProjectResult: vi.fn(async () => true),
            t: (key) => key,
            onProgress: vi.fn(),
            onOutcomesChange: vi.fn(),
        });
        expect(onRegistered).toHaveBeenCalledExactlyOnceWith(project, rows[0]);
        expect(result.outcomes.map((outcome) => outcome.status)).toEqual([
            'added',
            'failed',
        ]);
        expect(result.staleResults.has('stale')).toBe(true);
    });
});
