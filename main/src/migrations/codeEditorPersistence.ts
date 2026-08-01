import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { PROJECTS_FILENAME } from '../constants.js';
import { getDefaultDirs } from '../utils/platform.utils.js';

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonIfPresent(
    filePath: string,
): Promise<unknown | undefined> {
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(raw) as unknown;
    } catch (error) {
        const fileError = error as NodeJS.ErrnoException;
        if (fileError.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

async function writeJsonIfChanged(
    filePath: string,
    original: unknown,
    migrated: unknown,
): Promise<void> {
    if (JSON.stringify(original) === JSON.stringify(migrated)) {
        return;
    }

    await fs.writeFile(filePath, JSON.stringify(migrated, null, 4), 'utf-8');
}

export function migrateStoredProjectRecord(project: JsonRecord): JsonRecord {
    const codeEditorId =
        project.codeEditorId !== undefined
            ? project.codeEditorId
            : project.withVSCode === true
              ? 'vscode'
              : null;

    return {
        ...project,
        codeEditorId,
        withVSCode: codeEditorId === 'vscode',
    };
}

export function migrateStoredPreferencesRecord(prefs: JsonRecord): JsonRecord {
    const storedVersion =
        typeof prefs.prefs_version === 'number' ? prefs.prefs_version : 0;
    if (storedVersion >= 4) {
        return prefs;
    }

    const legacyPath =
        typeof prefs.vs_code_path === 'string' ? prefs.vs_code_path.trim() : '';
    const integrations = isJsonRecord(prefs.code_editor_integrations)
        ? prefs.code_editor_integrations
        : {};
    const vscode = isJsonRecord(integrations.vscode) ? integrations.vscode : {};
    const genericPath =
        typeof vscode.executable_path === 'string'
            ? vscode.executable_path.trim()
            : '';

    return {
        ...prefs,
        ...(legacyPath && !genericPath
            ? {
                  code_editor_integrations: {
                      ...integrations,
                      vscode: {
                          ...vscode,
                          enabled:
                              typeof vscode.enabled === 'boolean'
                                  ? vscode.enabled
                                  : true,
                          executable_path: legacyPath,
                      },
                  },
              }
            : {}),
    };
}

export async function migrateCodeEditorProjects(): Promise<void> {
    const { configDir } = getDefaultDirs();
    const projectsPath = path.resolve(configDir, PROJECTS_FILENAME);
    const stored = await readJsonIfPresent(projectsPath);
    if (stored === undefined) {
        return;
    }
    if (!Array.isArray(stored) || !stored.every(isJsonRecord)) {
        throw new Error('Stored project list must be an array of objects');
    }

    const migrated = stored.map(migrateStoredProjectRecord);
    await writeJsonIfChanged(projectsPath, stored, migrated);
}

export async function migrateCodeEditorPreferences(): Promise<void> {
    const { prefsPath } = getDefaultDirs();
    const stored = await readJsonIfPresent(prefsPath);
    if (stored === undefined) {
        return;
    }
    if (!isJsonRecord(stored)) {
        throw new Error('Stored preferences must be an object');
    }

    const migrated = migrateStoredPreferencesRecord(stored);
    await writeJsonIfChanged(prefsPath, stored, migrated);
}
