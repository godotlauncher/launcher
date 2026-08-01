import type { CodeEditorId } from '@shared/contracts';

export function legacyVSCodeFlagToCodeEditorId(
    withVSCode: boolean,
): CodeEditorId | null {
    return withVSCode ? 'vscode' : null;
}

export function codeEditorIdToLegacyVSCodeFlag(
    codeEditorId: CodeEditorId | null,
): boolean {
    return codeEditorId === 'vscode';
}
