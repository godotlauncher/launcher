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
} from './code-editor-persistence.util.js';

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

    it('canonicalises missing project selections without the mirror', () => {
        expect(migrateStoredProjectRecord({ withVSCode: true })).toEqual({
            codeEditorId: 'vscode',
        });
        expect(migrateStoredProjectRecord({ withVSCode: false })).toEqual({
            codeEditorId: null,
        });
    });

    it('gives explicit project selections precedence over the mirror', () => {
        expect(
            migrateStoredProjectRecord({
                codeEditorId: null,
                withVSCode: true,
            }),
        ).toEqual({ codeEditorId: null });
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

    it('migrates project files and removes legacy fields from disk', async () => {
        writeFileSync(
            projectsPath,
            JSON.stringify([{ path: '/project', withVSCode: true }]),
        );

        await migrateCodeEditorProjects();

        expect(JSON.parse(readFileSync(projectsPath, 'utf-8'))).toEqual([
            {
                path: '/project',
                codeEditorId: 'vscode',
            },
        ]);
    });

    it('rejects malformed project JSON without rewriting it', async () => {
        const malformed = '{not json';
        writeFileSync(projectsPath, malformed);

        await expect(migrateCodeEditorProjects()).rejects.toThrow();
        expect(readFileSync(projectsPath, 'utf-8')).toBe(malformed);
    });

    it('preserves selections, unrelated fields and order across repeated runs', async () => {
        const records = [
            { path: '/z', codeEditorId: 'vscodium', withVSCode: true },
            { path: '/a', codeEditorId: 'vscode', withVSCode: false },
            { path: '/b', codeEditorId: null, withVSCode: true },
            { path: '/c', withVSCode: false },
            {
                path: '/d',
                last_opened: '2026-09-01T10:00:00.000Z',
                extra: { keep: true },
            },
        ];
        writeFileSync(projectsPath, JSON.stringify(records));

        await migrateCodeEditorProjects();
        const first = readFileSync(projectsPath, 'utf-8');
        await migrateCodeEditorProjects();

        expect(readFileSync(projectsPath, 'utf-8')).toBe(first);
        expect(JSON.parse(first)).toEqual([
            { path: '/z', codeEditorId: 'vscodium' },
            { path: '/a', codeEditorId: 'vscode' },
            { path: '/b', codeEditorId: null },
            { path: '/c', codeEditorId: null },
            {
                path: '/d',
                codeEditorId: null,
                last_opened: '2026-09-01T10:00:00.000Z',
                extra: { keep: true },
            },
        ]);
    });

    it('leaves a missing project file absent', async () => {
        await expect(migrateCodeEditorProjects()).resolves.toBeUndefined();
        expect(() => readFileSync(projectsPath)).toThrow();
    });

    it.each([{}, [null], [{ withVSCode: true }, 42]])(
        'rejects an invalid project list without a partial rewrite: %j',
        async (value) => {
            const original = JSON.stringify(value);
            writeFileSync(projectsPath, original);
            await expect(migrateCodeEditorProjects()).rejects.toThrow();
            expect(readFileSync(projectsPath, 'utf-8')).toBe(original);
        },
    );

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
