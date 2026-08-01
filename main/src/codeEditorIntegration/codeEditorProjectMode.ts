import type { CodeEditorId, ProjectDetails } from '@shared/contracts';

export type CodeEditorProjectMode =
    | {
          kind: 'legacy';
          withVSCode: boolean;
      }
    | {
          kind: 'integration';
          codeEditorId: CodeEditorId | null;
          withVSCode: boolean;
      };

export function resolveCodeEditorProjectMode(
    project: Pick<ProjectDetails, 'codeEditorId' | 'withVSCode'>,
): CodeEditorProjectMode {
    if (project.codeEditorId === undefined) {
        return {
            kind: 'legacy',
            withVSCode: project.withVSCode,
        };
    }

    return {
        kind: 'integration',
        codeEditorId: project.codeEditorId,
        withVSCode: project.codeEditorId === 'vscode',
    };
}
