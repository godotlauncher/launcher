import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    EditorChannel,
    EditorFlavor,
    InstalledRelease,
} from '@shared/contracts';
import { PROJECT_LAUNCHER_CONFIG_FILENAME } from '../constants.js';

export type ProjectLauncherConfig = {
    config: {
        version: 1;
    };
    launcher: {
        version: string;
    };
    project?: {
        last_opened: Date;
    };
    editor: {
        channel: EditorChannel;
        flavor: EditorFlavor;
        base_version: string;
        version: string;
    };
};

type IniDocument = Record<string, Record<string, string>>;

function parseIni(content: string): IniDocument {
    const sections: IniDocument = {};
    let currentSection = '';

    for (const rawLine of content.replaceAll('\r', '').split('\n')) {
        const line = rawLine.trim();

        if (!line || line.startsWith(';') || line.startsWith('#')) {
            continue;
        }

        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1).trim();
            sections[currentSection] = sections[currentSection] ?? {};
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1 || !currentSection) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (key) {
            sections[currentSection][key] = value;
        }
    }

    return sections;
}

function isEditorChannel(value: string | undefined): value is EditorChannel {
    return value === 'official' || value === 'custom';
}

function isEditorFlavor(value: string | undefined): value is EditorFlavor {
    return Boolean(value?.trim());
}

function parseOptionalDate(value: string | undefined): Date | null {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getReleaseChannel(
    release: Pick<InstalledRelease, 'source'>,
): EditorChannel {
    return release.source === 'custom' ? 'custom' : 'official';
}

export function getReleaseFlavor(
    release: Pick<InstalledRelease, 'flavor' | 'mono'>,
): EditorFlavor {
    if (release.flavor) {
        return release.flavor;
    }

    return release.mono ? 'dotnet' : 'gdscript';
}

export function getReleaseBaseVersion(
    release: Pick<
        InstalledRelease,
        'base_version' | 'version' | 'version_number'
    >,
): string {
    if (release.base_version) {
        return release.base_version;
    }

    const versionMatch = release.version.match(/(\d+\.\d+)/);
    if (versionMatch) {
        return versionMatch[1];
    }

    return release.version_number.toFixed(1);
}

export function createProjectLauncherConfig(
    release: InstalledRelease,
    launcherVersion: string,
    lastOpened?: Date | null,
): ProjectLauncherConfig {
    return {
        config: {
            version: 1,
        },
        launcher: {
            version: launcherVersion,
        },
        ...(lastOpened ? { project: { last_opened: lastOpened } } : {}),
        editor: {
            channel: getReleaseChannel(release),
            flavor: getReleaseFlavor(release),
            base_version: getReleaseBaseVersion(release),
            version: release.version,
        },
    };
}

export function serializeProjectLauncherConfig(
    config: ProjectLauncherConfig,
): string {
    const lines = [
        '[config]',
        `version=${config.config.version}`,
        '',
        '[launcher]',
        `version=${config.launcher.version}`,
        '',
    ];

    if (config.project?.last_opened) {
        lines.push(
            '[project]',
            `last_opened=${config.project.last_opened.toISOString()}`,
            '',
        );
    }

    lines.push(
        '[editor]',
        `channel=${config.editor.channel}`,
        `flavor=${config.editor.flavor}`,
        `base_version=${config.editor.base_version}`,
        `version=${config.editor.version}`,
        '',
    );

    return lines.join('\n');
}

export function parseProjectLauncherConfig(
    content: string,
): ProjectLauncherConfig | null {
    const ini = parseIni(content);

    if (ini.config?.version !== '1') {
        return null;
    }

    const channel = ini.editor?.channel;
    const flavor = ini.editor?.flavor;
    const baseVersion = ini.editor?.base_version;
    const editorVersion = ini.editor?.version;
    const launcherVersion = ini.launcher?.version;
    const lastOpened = parseOptionalDate(ini.project?.last_opened);

    if (
        !isEditorChannel(channel) ||
        !isEditorFlavor(flavor) ||
        !baseVersion ||
        !editorVersion ||
        !launcherVersion
    ) {
        return null;
    }

    return {
        config: {
            version: 1,
        },
        launcher: {
            version: launcherVersion,
        },
        ...(lastOpened ? { project: { last_opened: lastOpened } } : {}),
        editor: {
            channel,
            flavor,
            base_version: baseVersion,
            version: editorVersion,
        },
    };
}

export async function readProjectLauncherConfig(
    projectDir: string,
): Promise<ProjectLauncherConfig | null> {
    const configPath = path.resolve(
        projectDir,
        PROJECT_LAUNCHER_CONFIG_FILENAME,
    );

    try {
        const content = await fs.promises.readFile(configPath, 'utf-8');
        return parseProjectLauncherConfig(content);
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

export async function writeProjectLauncherConfig(
    projectDir: string,
    release: InstalledRelease,
    launcherVersion: string,
    lastOpened?: Date | null,
): Promise<void> {
    const config = createProjectLauncherConfig(
        release,
        launcherVersion,
        lastOpened,
    );
    await fs.promises.writeFile(
        path.resolve(projectDir, PROJECT_LAUNCHER_CONFIG_FILENAME),
        serializeProjectLauncherConfig(config),
        'utf-8',
    );
}
