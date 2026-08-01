import { describe, expect, it } from 'vitest';
import { resolveCodeEditorProjectMode } from './codeEditorProjectMode.js';

describe('resolveCodeEditorProjectMode', () => {
    it('copies an absent code editor ID from the legacy VS Code flag', () => {
        expect(
            resolveCodeEditorProjectMode({
                withVSCode: true,
            }),
        ).toEqual({
            codeEditorId: 'vscode',
            withVSCode: true,
        });
    });

    it('keeps an explicit null code editor selection', () => {
        expect(
            resolveCodeEditorProjectMode({
                codeEditorId: null,
                withVSCode: true,
            }),
        ).toEqual({
            codeEditorId: null,
            withVSCode: false,
        });
    });

    it('derives the legacy mirror from the selected integration', () => {
        expect(
            resolveCodeEditorProjectMode({
                codeEditorId: 'vscode',
                withVSCode: false,
            }),
        ).toEqual({
            codeEditorId: 'vscode',
            withVSCode: true,
        });
    });
});
