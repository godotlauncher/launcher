import * as fs from 'node:fs';
import path from 'node:path';
import { findExecutable } from '../../../utils/platform.utils.js';
import type { CodeEditorInstallation } from '../../codeEditorIntegration.types.js';
import {
    execFileText,
    findProductVersion,
    isExistingFile,
    toInstallation,
} from './vscodiumInstallation.shared.js';

function parseRegistryValue(output: string | null): string | null {
    if (!output) {
        return null;
    }

    for (const line of output.split(/\r?\n/).reverse()) {
        const match = line.match(/\s+REG_[A-Z_]+\s+(.+)$/i);
        if (match?.[1]?.trim()) {
            return match[1].trim();
        }
    }
    return null;
}

export function resolveWindowsRegistryExecutablePath(
    environment: NodeJS.ProcessEnv,
): string | null {
    const windowsRoot =
        environment.SystemRoot?.trim() || environment.WINDIR?.trim();
    return windowsRoot
        ? path.win32.resolve(windowsRoot, 'System32', 'reg.exe')
        : null;
}

async function queryRegistryValue(
    registryExecutable: string,
    key: string,
    value: string,
    view: '32' | '64',
): Promise<string | null> {
    return parseRegistryValue(
        await execFileText(
            registryExecutable,
            ['query', key, '/v', value, `/reg:${view}`],
            { logFailure: false },
        ),
    );
}

export async function resolveWindowsVSCodium(
    candidatePath: string,
): Promise<CodeEditorInstallation | null> {
    const normalizedPath = candidatePath.trim();
    if (!normalizedPath) {
        return null;
    }

    const basename = path.win32.basename(normalizedPath).toLowerCase();
    let executablePath = normalizedPath;

    if (basename === 'codium.cmd' || basename === 'vscodium.cmd') {
        const commandDir = path.win32.dirname(normalizedPath);
        const directExecutable = path.win32.resolve(
            commandDir,
            '..',
            'VSCodium.exe',
        );
        if (isExistingFile(directExecutable)) {
            executablePath = directExecutable;
        } else if (isExistingFile(normalizedPath)) {
            try {
                const command = fs.readFileSync(normalizedPath, 'utf-8');
                const target = command.match(
                    /["']([^"'\r\n]*VSCodium\.exe)["']/i,
                )?.[1];
                if (!target) {
                    return null;
                }
                executablePath = path.win32.isAbsolute(target)
                    ? target
                    : path.win32.resolve(commandDir, target);
            } catch {
                return null;
            }
        }
    }

    if (
        path.win32.basename(executablePath).toLowerCase() !== 'vscodium.exe' ||
        !isExistingFile(executablePath)
    ) {
        return null;
    }

    const version = findProductVersion(executablePath, path.win32);
    return version === null ? null : toInstallation(executablePath, version);
}

function pushPath(
    candidates: string[],
    root: string | undefined,
    ...segments: string[]
): void {
    if (root?.trim()) {
        candidates.push(path.win32.resolve(root, ...segments));
    }
}

async function getInnoCandidates(
    registryExecutable: string | null,
    hive: 'HKCU' | 'HKLM',
    ids: string[],
): Promise<string[]> {
    if (!registryExecutable) {
        return [];
    }
    const locations = await Promise.all(
        ids.flatMap((id) =>
            (['64', '32'] as const).map((view) =>
                queryRegistryValue(
                    registryExecutable,
                    `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{${id}}_is1`,
                    'InstallLocation',
                    view,
                ),
            ),
        ),
    );
    return locations.flatMap((location) =>
        location ? [path.win32.resolve(location, 'VSCodium.exe')] : [],
    );
}

async function getMsiCandidates(
    registryExecutable: string | null,
): Promise<string[]> {
    if (!registryExecutable) {
        return [];
    }
    const paths = await Promise.all(
        (['64', '32'] as const).map((view) =>
            queryRegistryValue(
                registryExecutable,
                'HKLM\\SOFTWARE\\VSCodium\\VSCodium',
                'Path',
                view,
            ),
        ),
    );
    return paths.flatMap((msiPath) =>
        msiPath
            ? [
                  path.win32.basename(msiPath).toLowerCase() === 'vscodium.exe'
                      ? msiPath
                      : path.win32.resolve(msiPath, 'VSCodium.exe'),
              ]
            : [],
    );
}

async function resolveFirst(
    candidates: string[],
): Promise<CodeEditorInstallation | null> {
    const seen = new Set<string>();
    for (const candidate of candidates) {
        const key = candidate.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        const installation = await resolveWindowsVSCodium(candidate);
        if (installation) {
            return installation;
        }
    }
    return null;
}

export async function findWindowsVSCodium(): Promise<CodeEditorInstallation | null> {
    const registryExecutablePath = resolveWindowsRegistryExecutablePath(
        process.env,
    );
    const registryExecutable =
        registryExecutablePath && isExistingFile(registryExecutablePath)
            ? registryExecutablePath
            : null;
    const userRegistry = await resolveFirst(
        await getInnoCandidates(registryExecutable, 'HKCU', [
            '0FD05EB4-651E-4E78-A062-515204B47A3A',
            '2E1F05D1-C245-4562-81EE-28188DB6FD17',
            '57FD70A5-1B8D-4875-9F40-C5553F094828',
        ]),
    );
    if (userRegistry) {
        return userRegistry;
    }

    const userCandidates: string[] = [];
    pushPath(
        userCandidates,
        process.env.LOCALAPPDATA,
        'Programs',
        'VSCodium',
        'VSCodium.exe',
    );
    const userInstallation = await resolveFirst(userCandidates);
    if (userInstallation) {
        return userInstallation;
    }

    const msiInstallation = await resolveFirst(
        await getMsiCandidates(registryExecutable),
    );
    if (msiInstallation) {
        return msiInstallation;
    }

    const machineRegistry = await resolveFirst(
        await getInnoCandidates(registryExecutable, 'HKLM', [
            '763CBF88-25C6-4B10-952F-326AE657F16B',
            '88DA3577-054F-4CA1-8122-7D820494CFFB',
            '67DEE444-3D04-4258-B92A-BC1F0FF2CAE4',
        ]),
    );
    if (machineRegistry) {
        return machineRegistry;
    }

    const candidates: string[] = [];
    for (const root of [
        process.env.ProgramW6432,
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
    ]) {
        pushPath(candidates, root, 'VSCodium', 'VSCodium.exe');
    }
    pushPath(
        candidates,
        process.env.APPDATA,
        'Apps',
        'VSCodium',
        'VSCodium.exe',
    );

    const userProfile = process.env.USERPROFILE;
    const scoopRoot =
        process.env.SCOOP ??
        (userProfile ? path.win32.resolve(userProfile, 'scoop') : undefined);
    const scoopGlobalRoot =
        process.env.SCOOP_GLOBAL ??
        (process.env.ProgramData
            ? path.win32.resolve(process.env.ProgramData, 'scoop')
            : undefined);
    pushPath(
        candidates,
        scoopRoot,
        'apps',
        'vscodium',
        'current',
        'VSCodium.exe',
    );
    pushPath(
        candidates,
        scoopGlobalRoot,
        'apps',
        'vscodium',
        'current',
        'VSCodium.exe',
    );
    pushPath(
        candidates,
        process.env.ChocolateyToolsLocation ?? 'C:\\tools',
        'VSCodium',
        'VSCodium.exe',
    );

    const conventionalInstallation = await resolveFirst(candidates);
    if (conventionalInstallation) {
        return conventionalInstallation;
    }

    for (const command of ['codium', 'vscodium']) {
        const executablePath = await findExecutable(command);
        if (executablePath) {
            const installation = await resolveWindowsVSCodium(executablePath);
            if (installation) {
                return installation;
            }
        }
    }
    return null;
}
