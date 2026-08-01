import { describe, expect, it } from 'vitest';
import {
    codeEditorIdToLegacyVSCodeFlag,
    legacyVSCodeFlagToCodeEditorId,
} from './codeEditorIntegration.model.ts';

describe('code editor integration model', () => {
    it('maps the legacy VS Code flag to an explicit code editor selection', () => {
        expect(legacyVSCodeFlagToCodeEditorId(true)).toBe('vscode');
        expect(legacyVSCodeFlagToCodeEditorId(false)).toBeNull();
    });

    it('maps an explicit code editor selection to the legacy VS Code flag', () => {
        expect(codeEditorIdToLegacyVSCodeFlag('vscode')).toBe(true);
        expect(codeEditorIdToLegacyVSCodeFlag(null)).toBe(false);
    });
});
