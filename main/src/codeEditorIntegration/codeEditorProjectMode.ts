import type { CodeEditorId, ProjectDetails } from '@shared/contracts';

export type CodeEditorProjectMode = {
    codeEditorId: CodeEditorId | null;
    withVSCode: boolean;
};

export function resolveCodeEditorProjectMode(
    project: Pick<ProjectDetails, 'codeEditorId' | 'withVSCode'>,
): CodeEditorProjectMode {
    const codeEditorId =
        project.codeEditorId === undefined
            ? project.withVSCode
                ? 'vscode'
                : null
            : project.codeEditorId;

    return {
        codeEditorId,
        withVSCode: codeEditorId === 'vscode',
    };
}
