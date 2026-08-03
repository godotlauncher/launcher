import type { ProjectDetails } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { getCodeEditorProjectUsage } from './projectCodeEditorHealth.model';

const project = {
    path: '/projects/one',
    codeEditorId: 'vscode',
    release: { mono: false },
} as ProjectDetails;

describe('project code editor health', () => {
    it('counts configured projects and their .NET subset', () => {
        expect(
            getCodeEditorProjectUsage(
                [
                    project,
                    {
                        ...project,
                        path: '/projects/two',
                        release: { ...project.release, mono: true },
                    },
                    {
                        ...project,
                        path: '/projects/none',
                        codeEditorId: null,
                    },
                ],
                'vscode',
            ),
        ).toEqual({ count: 2, dotnetCount: 1 });
    });
});
