import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

import {
    migrateCodeEditorPreferences,
    migrateCodeEditorProjects,
    migrateStoredPreferencesRecord,
    migrateStoredProjectRecord,
} from './codeEditorPersistence.js';

describe('code editor persistence migrations', () => {
    let tempDir: string;
    let prefsPath: string;
    let projectsPath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(path.join(os.tmpdir(), 'launcher-code-editor-'));
        prefsPath = path.join(tempDir, 'prefs.json');
        projectsPath = path.join(tempDir, 'projects.json');
        platformMocks.getDefaultDirs.mockReturnValue({
            configDir: tempDir,
            prefsPath,
        });
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('canonicalizes missing project selections and retains the mirror', () => {
        expect(migrateStoredProjectRecord({ withVSCode: true })).toEqual({
            codeEditorId: 'vscode',
            withVSCode: true,
        });
        expect(migrateStoredProjectRecord({ withVSCode: false })).toEqual({
            codeEditorId: null,
            withVSCode: false,
        });
    });

    it('gives explicit project selections precedence over the mirror', () => {
        expect(
            migrateStoredProjectRecord({
                codeEditorId: null,
                withVSCode: true,
            }),
        ).toEqual({ codeEditorId: null, withVSCode: false });
    });

    it('copies a pre-v4 legacy path and removes the old field', () => {
        expect(
            migrateStoredPreferencesRecord({
                prefs_version: 3,
                vs_code_path: '/legacy/code',
                installed_tools: {
                    last_scan: 1,
                    tools: [{ name: 'Git' }, { name: 'VSCode' }],
                },
            }),
        ).toEqual({
            prefs_version: 3,
            installed_tools: {
                last_scan: 1,
                tools: [{ name: 'Git' }],
            },
            code_editor_integrations: {
                vscode: {
                    enabled: true,
                    executable_path: '/legacy/code',
                },
            },
        });
    });

    it('removes a legacy path from version 4 preferences', () => {
        const stored = {
            prefs_version: 4,
            vs_code_path: '/legacy/code',
        };
        expect(migrateStoredPreferencesRecord(stored)).toEqual({
            prefs_version: 4,
        });
    });

    it('migrates project files and keeps legacy fields on disk', async () => {
        writeFileSync(
            projectsPath,
            JSON.stringify([{ path: '/project', withVSCode: true }]),
        );

        await migrateCodeEditorProjects();

        expect(JSON.parse(readFileSync(projectsPath, 'utf-8'))).toEqual([
            {
                path: '/project',
                codeEditorId: 'vscode',
                withVSCode: true,
            },
        ]);
    });

    it('rejects malformed project JSON without rewriting it', async () => {
        const malformed = '{not json';
        writeFileSync(projectsPath, malformed);

        await expect(migrateCodeEditorProjects()).rejects.toThrow();
        expect(readFileSync(projectsPath, 'utf-8')).toBe(malformed);
    });

    it('migrates preferences independently from project data', async () => {
        writeFileSync(
            prefsPath,
            JSON.stringify({
                prefs_version: 3,
                vs_code_path: '/legacy/code',
            }),
        );
        writeFileSync(projectsPath, '{not json');

        await migrateCodeEditorPreferences();

        const persisted = JSON.parse(readFileSync(prefsPath, 'utf-8'));
        expect(persisted).toMatchObject({
            prefs_version: 3,
            code_editor_integrations: {
                vscode: { executable_path: '/legacy/code' },
            },
        });
        expect(persisted).not.toHaveProperty('vs_code_path');
    });
});
