import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import logger from 'electron-log';
import { findExecutable } from '../../../utils/platform.utils.js';

type JSONObject = Record<string, unknown>;
type SupportedVSCodePlatform = 'win32' | 'darwin' | 'linux';

const MACOS_PLIST_READ_TIMEOUT_MS = 3000;
const VS_CODE_MACOS_BUNDLE_ID = 'com.microsoft.VSCode';

function isJSONObject(value: unknown): value is JSONObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Retrieves the installation path of Visual Studio Code.
 *
 * A custom path must identify a supported VS Code executable or macOS app
 * bundle. Without a custom path, the platform defaults are checked using the
 * same validation.
 *
 * @param customPath - An optional path to check for the Visual Studio Code installation.
 * @returns A promise that resolves to the installation path of Visual Studio Code if found, or null if not found.
 */
export async function getVSCodeInstallPath(
    customPath?: string,
): Promise<string | null> {
    if (!['win32', 'darwin', 'linux'].includes(process.platform)) {
        return null;
    }

    const platform = process.platform as SupportedVSCodePlatform;
    if (customPath !== undefined) {
        return await resolveVSCodeInstallCandidate(customPath, platform);
    }

    const defaultLocations = {
        darwin: ['/Applications/Visual Studio Code.app'],
        win32: [
            'C:\\Program Files\\Microsoft VS Code\\Code.exe',
            'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe',
            process.env.LOCALAPPDATA +
                '\\Programs\\Microsoft VS Code\\Code.exe',
        ],
        linux: ['/usr/bin/code', '/snap/bin/code'],
    };

    const locations: string[] | undefined = defaultLocations[platform];

    if (platform === 'linux') {
        const pathCandidate = await findExecutable('code');
        if (pathCandidate) {
            const resolvedPathCandidate = await resolveVSCodeInstallCandidate(
                pathCandidate,
                platform,
            );
            if (resolvedPathCandidate) {
                return resolvedPathCandidate;
            }
        }
    }

    if (locations) {
        for (const location of locations) {
            const candidate = await resolveVSCodeInstallCandidate(
                location,
                platform,
            );
            if (candidate) {
                return candidate;
            }
        }
    }

    if (platform === 'linux') {
        return null;
    }

    const pathCandidate = await findExecutable('code');
    return pathCandidate
        ? await resolveVSCodeInstallCandidate(pathCandidate, platform)
        : null;
}

export function resolveVSCodeGodotExecPath(installationPath: string): string {
    if (process.platform !== 'win32') {
        return installationPath;
    }

    if (path.basename(installationPath).toLowerCase() === 'code.cmd') {
        return installationPath;
    }

    const codeCommandPath = path.resolve(
        path.dirname(installationPath),
        'bin',
        'code.cmd',
    );

    return fs.existsSync(codeCommandPath) ? codeCommandPath : installationPath;
}

function isExistingFile(candidatePath: string): boolean {
    try {
        return (
            fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()
        );
    } catch {
        return false;
    }
}

function isExistingExecutable(candidatePath: string): boolean {
    try {
        if (!isExistingFile(candidatePath)) {
            return false;
        }

        fs.accessSync(candidatePath, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

async function readMacOSBundleInfo(
    bundlePath: string,
): Promise<JSONObject | null> {
    const infoPlistPath = path.posix.resolve(
        bundlePath,
        'Contents',
        'Info.plist',
    );

    return await new Promise((resolve) => {
        execFile(
            '/usr/bin/plutil',
            ['-convert', 'json', '-o', '-', infoPlistPath],
            { encoding: 'utf8', timeout: MACOS_PLIST_READ_TIMEOUT_MS },
            (error, stdout) => {
                if (error) {
                    logger.debug('Failed to read macOS application metadata', {
                        bundlePath,
                        error,
                    });
                    resolve(null);
                    return;
                }

                try {
                    const bundleInfo: unknown = JSON.parse(stdout);
                    resolve(isJSONObject(bundleInfo) ? bundleInfo : null);
                } catch (error) {
                    logger.debug('Failed to parse macOS application metadata', {
                        bundlePath,
                        error,
                    });
                    resolve(null);
                }
            },
        );
    });
}

async function resolveMacOSVSCodeBundleExecutable(
    bundlePath: string,
): Promise<string | null> {
    if (!fs.existsSync(bundlePath)) {
        return null;
    }

    const bundleInfo = await readMacOSBundleInfo(bundlePath);
    if (bundleInfo?.CFBundleIdentifier !== VS_CODE_MACOS_BUNDLE_ID) {
        return null;
    }

    const executableName = bundleInfo.CFBundleExecutable;
    if (
        typeof executableName !== 'string' ||
        !executableName.trim() ||
        executableName !== executableName.trim() ||
        executableName === '.' ||
        executableName === '..' ||
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
    return isExistingFile(executablePath) ? executablePath : null;
}

async function resolveVSCodeInstallCandidate(
    candidatePath: string,
    platform: SupportedVSCodePlatform,
): Promise<string | null> {
    const normalizedPath = candidatePath.trim();
    if (!normalizedPath) {
        return null;
    }

    const pathModule = platform === 'win32' ? path.win32 : path.posix;
    const basename = pathModule.basename(normalizedPath).toLowerCase();

    if (platform === 'win32') {
        return (basename === 'code.exe' || basename === 'code.cmd') &&
            isExistingFile(normalizedPath)
            ? normalizedPath
            : null;
    }

    if (platform === 'linux') {
        return basename === 'code' && isExistingExecutable(normalizedPath)
            ? normalizedPath
            : null;
    }

    if (basename === 'visual studio code.app') {
        return await resolveMacOSVSCodeBundleExecutable(normalizedPath);
    }

    if (basename === 'code') {
        return isExistingFile(normalizedPath) ? normalizedPath : null;
    }

    const macosDir = pathModule.dirname(normalizedPath);
    const contentsDir = pathModule.dirname(macosDir);
    const bundlePath = pathModule.dirname(contentsDir);
    const isBundleExecutable =
        pathModule.basename(macosDir).toLowerCase() === 'macos' &&
        pathModule.basename(contentsDir).toLowerCase() === 'contents' &&
        pathModule.basename(bundlePath).toLowerCase() ===
            'visual studio code.app';

    if (!isBundleExecutable) {
        return null;
    }

    const resolvedExecutable =
        await resolveMacOSVSCodeBundleExecutable(bundlePath);
    return resolvedExecutable === normalizedPath ? normalizedPath : null;
}
