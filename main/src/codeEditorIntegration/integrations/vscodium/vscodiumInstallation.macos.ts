import * as fs from 'node:fs';
import path from 'node:path';
import { findExecutable } from '../../../utils/platform.utils.js';
import type { CodeEditorInstallation } from '../../codeEditorIntegration.types.js';
import {
    execFileText,
    findProductVersion,
    isExecutableFile,
    isExistingFile,
    isJSONObject,
    type JSONObject,
    toInstallation,
} from './vscodiumInstallation.shared.js';

async function readBundleInfo(bundlePath: string): Promise<JSONObject | null> {
    const output = await execFileText('/usr/bin/plutil', [
        '-convert',
        'json',
        '-o',
        '-',
        path.posix.resolve(bundlePath, 'Contents', 'Info.plist'),
    ]);
    if (!output) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(output);
        return isJSONObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

async function resolveBundle(
    bundlePath: string,
): Promise<CodeEditorInstallation | null> {
    const bundleInfo = await readBundleInfo(bundlePath);
    const executableName = bundleInfo?.CFBundleExecutable;
    if (
        bundleInfo?.CFBundleIdentifier !== 'com.vscodium' ||
        typeof executableName !== 'string' ||
        !executableName.trim() ||
        executableName !== executableName.trim() ||
        ['.', '..'].includes(executableName) ||
        executableName.includes('/') ||
        executableName.includes('\\')
    ) {
        return null;
    }

    const executablePath = path.posix.resolve(
        bundlePath,
        'Contents',
        'MacOS',
        executableName,
    );
    if (!isExistingFile(executablePath)) {
        return null;
    }

    return toInstallation(
        executablePath,
        typeof bundleInfo.CFBundleShortVersionString === 'string'
            ? bundleInfo.CFBundleShortVersionString
            : null,
    );
}

function findBundlePath(candidatePath: string): string | null {
    const markerIndex = candidatePath.toLowerCase().indexOf('.app/');
    return markerIndex >= 0
        ? candidatePath.slice(0, markerIndex + '.app'.length)
        : null;
}

export async function resolveMacOSVSCodium(
    candidatePath: string,
): Promise<CodeEditorInstallation | null> {
    const normalizedPath = candidatePath.trim();
    if (!normalizedPath) {
        return null;
    }

    if (path.posix.basename(normalizedPath).toLowerCase() === 'vscodium.app') {
        return resolveBundle(normalizedPath);
    }

    let realPath = normalizedPath;
    try {
        realPath = fs.realpathSync(normalizedPath);
    } catch {
        return null;
    }

    const bundlePath =
        findBundlePath(normalizedPath) ?? findBundlePath(realPath);
    if (bundlePath) {
        const installation = await resolveBundle(bundlePath);
        if (!installation) {
            return null;
        }

        const normalizedRealPath = path.posix.normalize(realPath);
        return normalizedRealPath === path.posix.normalize(installation.path) ||
            normalizedRealPath.includes(
                `${path.posix.normalize(bundlePath)}/Contents/Resources/app/bin/`,
            )
            ? installation
            : null;
    }

    const basename = path.posix.basename(normalizedPath).toLowerCase();
    if (
        !['codium', 'vscodium'].includes(basename) ||
        !isExecutableFile(normalizedPath)
    ) {
        return null;
    }

    const version = findProductVersion(normalizedPath);
    return version === null ? null : toInstallation(normalizedPath, version);
}

export async function findMacOSVSCodium(): Promise<CodeEditorInstallation | null> {
    const home = process.env.HOME;
    const candidates = [
        '/Applications/VSCodium.app',
        '/opt/homebrew/bin/codium',
        '/usr/local/bin/codium',
    ];
    if (home) {
        candidates.push(
            path.posix.resolve(home, 'Applications', 'VSCodium.app'),
            path.posix.resolve(home, '.nix-profile', 'bin', 'codium'),
            path.posix.resolve(
                process.env.XDG_STATE_HOME ??
                    path.posix.resolve(home, '.local', 'state'),
                'nix',
                'profiles',
                'profile',
                'bin',
                'codium',
            ),
        );
    }
    const username = process.env.USER;
    if (username) {
        candidates.push(
            path.posix.resolve(
                '/nix/var/nix/profiles/per-user',
                username,
                'profile/bin/codium',
            ),
        );
    }

    for (const candidate of candidates) {
        const installation = await resolveMacOSVSCodium(candidate);
        if (installation) {
            return installation;
        }
    }

    for (const command of ['codium', 'vscodium']) {
        const executablePath = await findExecutable(command);
        if (executablePath) {
            const installation = await resolveMacOSVSCodium(executablePath);
            if (installation) {
                return installation;
            }
        }
    }
    return null;
}
