import { describe, expect, it } from 'vitest';
import { resolveCodeEditorProjectMode } from './codeEditorProjectMode.js';

describe('resolveCodeEditorProjectMode', () => {
    it('keeps projects without a code editor ID on the legacy path', () => {
        expect(
            resolveCodeEditorProjectMode({
                withVSCode: true,
            }),
        ).toEqual({
            kind: 'legacy',
            withVSCode: true,
        });
    });

    it('opts a project into the integration path with no code editor', () => {
        expect(
            resolveCodeEditorProjectMode({
                codeEditorId: null,
                withVSCode: true,
            }),
        ).toEqual({
            kind: 'integration',
            codeEditorId: null,
            withVSCode: false,
        });
    });

    it('opts a project into the selected code editor integration', () => {
        expect(
            resolveCodeEditorProjectMode({
                codeEditorId: 'vscode',
                withVSCode: false,
            }),
        ).toEqual({
            kind: 'integration',
            codeEditorId: 'vscode',
            withVSCode: true,
        });
    });
});
