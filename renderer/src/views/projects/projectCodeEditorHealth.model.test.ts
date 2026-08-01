import type {
    CodeEditorIntegrationSettings,
    ProjectDetails,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    getCodeEditorProjectUsage,
    getUnavailableCodeEditorUsage,
} from './projectCodeEditorHealth.model';

const settings: CodeEditorIntegrationSettings = {
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: { dotnet: true },
    },
    isDefault: false,
    enabled: false,
    customPath: null,
    defaultExecFlags: '',
    execFlagsOverride: null,
    resolvedExecFlags: '',
    installation: null,
    resolvedGodotExecPath: null,
};

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

    it('returns only unavailable integrations used by projects', () => {
        expect(
            getUnavailableCodeEditorUsage(
                [project],
                [
                    settings,
                    {
                        ...settings,
                        installation: {
                            integrationId: 'vscode',
                            path: '/tools/code',
                            version: null,
                        },
                    },
                ],
            ),
        ).toEqual([
            {
                settings,
                count: 1,
                dotnetCount: 0,
            },
        ]);
    });
});
