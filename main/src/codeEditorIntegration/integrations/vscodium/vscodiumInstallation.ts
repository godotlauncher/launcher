import path from 'node:path';
import type {
    CodeEditorInstallation,
    CodeEditorLaunchConfiguration,
} from '../../codeEditorIntegration.types.js';
import {
    findLinuxVSCodium,
    resolveLinuxVSCodium,
} from './vscodiumInstallation.linux.js';
import {
    findMacOSVSCodium,
    resolveMacOSVSCodium,
} from './vscodiumInstallation.macos.js';
import { isExistingFile } from './vscodiumInstallation.shared.js';
import {
    findWindowsVSCodium,
    resolveWindowsVSCodium,
} from './vscodiumInstallation.windows.js';

export async function getVSCodiumInstallation(
    customPath?: string,
): Promise<CodeEditorInstallation | null> {
    if (process.platform === 'win32') {
        return customPath === undefined
            ? findWindowsVSCodium()
            : resolveWindowsVSCodium(customPath);
    }
    if (process.platform === 'darwin') {
        return customPath === undefined
            ? findMacOSVSCodium()
            : resolveMacOSVSCodium(customPath);
    }
    if (process.platform === 'linux') {
        return customPath === undefined
            ? findLinuxVSCodium()
            : resolveLinuxVSCodium(customPath);
    }
    return null;
}

export function resolveVSCodiumGodotConfiguration(
    installationPath: string,
    execFlags: string,
): CodeEditorLaunchConfiguration {
    if (
        process.platform === 'linux' &&
        path.posix.basename(installationPath) === 'flatpak'
    ) {
        return {
            execPath: installationPath,
            execFlags: `run com.vscodium.codium ${execFlags}`,
        };
    }

    if (process.platform === 'win32') {
        const commandPath = path.win32.resolve(
            path.win32.dirname(installationPath),
            'bin',
            'codium.cmd',
        );
        return {
            execPath: isExistingFile(commandPath)
                ? commandPath
                : installationPath,
            execFlags,
        };
    }

    return { execPath: installationPath, execFlags };
}
