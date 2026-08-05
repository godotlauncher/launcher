import * as fs from 'node:fs';
import path from 'node:path';
import { findExecutable } from '../../../utils/platform.utils.js';
import type { CodeEditorInstallation } from '../../codeEditorIntegration.types.js';
import {
    execFileText,
    findProductVersion,
    isExecutableFile,
    readVSCodiumProductVersion,
    toInstallation,
} from './vscodiumInstallation.shared.js';

function isAppImage(candidatePath: string): boolean {
    if (
        !/^VSCodium-.*\.AppImage$/i.test(path.posix.basename(candidatePath)) ||
        !isExecutableFile(candidatePath)
    ) {
        return false;
    }

    try {
        const descriptor = fs.openSync(candidatePath, 'r');
        try {
            const header = Buffer.alloc(11);
            const bytesRead = fs.readSync(
                descriptor,
                header,
                0,
                header.length,
                0,
            );
            return (
                bytesRead === header.length &&
                header[0] === 0x7f &&
                header.subarray(1, 4).toString('ascii') === 'ELF' &&
                header[8] === 0x41 &&
                header[9] === 0x49 &&
                [1, 2].includes(header[10])
            );
        } finally {
            fs.closeSync(descriptor);
        }
    } catch {
        return false;
    }
}

export async function resolveFlatpakVSCodium(
    flatpakPath: string,
): Promise<CodeEditorInstallation | null> {
    if (
        path.posix.basename(flatpakPath) !== 'flatpak' ||
        !isExecutableFile(flatpakPath)
    ) {
        return null;
    }

    const installedRef = await execFileText(flatpakPath, [
        'info',
        '--show-ref',
        'com.vscodium.codium',
    ]);
    if (
        !installedRef ||
        !/^app\/com\.vscodium\.codium\/[^/]+\/stable$/.test(installedRef)
    ) {
        return null;
    }

    const version = await execFileText(flatpakPath, [
        'info',
        '--show-version',
        'com.vscodium.codium',
    ]);
    return toInstallation(flatpakPath, version);
}

function resolveSnap(): CodeEditorInstallation | null {
    const wrapperPath = '/snap/bin/codium';
    if (!isExecutableFile(wrapperPath)) {
        return null;
    }

    try {
        const manifest = fs.readFileSync(
            '/snap/codium/current/meta/snap.yaml',
            'utf-8',
        );
        if (!/^name:\s*codium\s*$/m.test(manifest)) {
            return null;
        }
    } catch {
        return null;
    }

    const version = readVSCodiumProductVersion(
        '/snap/codium/current/usr/share/codium/resources/app/product.json',
    );
    return version === null ? null : toInstallation(wrapperPath, version);
}

export async function resolveLinuxVSCodium(
    candidatePath: string,
): Promise<CodeEditorInstallation | null> {
    const normalizedPath = candidatePath.trim();
    if (!normalizedPath) {
        return null;
    }

    // Flatpak metadata commands are restricted to automatic detection. A
    // manually selected executable must never be run merely to validate it.
    if (path.posix.basename(normalizedPath) === 'flatpak') {
        return null;
    }
    if (normalizedPath === '/snap/bin/codium') {
        return resolveSnap();
    }
    if (isAppImage(normalizedPath)) {
        return toInstallation(normalizedPath, null);
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

export async function findLinuxVSCodium(): Promise<CodeEditorInstallation | null> {
    const home = process.env.HOME;
    const candidates = [
        '/usr/bin/codium',
        '/usr/bin/vscodium',
        '/usr/local/bin/codium',
        '/usr/local/bin/vscodium',
    ];

    if (home) {
        candidates.push(
            path.posix.resolve(home, '.local', 'bin', 'codium'),
            path.posix.resolve(home, '.local', 'bin', 'vscodium'),
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
    candidates.push('/run/current-system/sw/bin/codium');

    for (const candidate of candidates) {
        const installation = await resolveLinuxVSCodium(candidate);
        if (installation) {
            return installation;
        }
    }

    for (const command of ['codium', 'vscodium']) {
        const executablePath = await findExecutable(command);
        if (executablePath) {
            const installation = await resolveLinuxVSCodium(executablePath);
            if (installation) {
                return installation;
            }
        }
    }

    const snapInstallation = await resolveLinuxVSCodium('/snap/bin/codium');
    if (snapInstallation) {
        return snapInstallation;
    }

    const flatpakPath = isExecutableFile('/usr/bin/flatpak')
        ? '/usr/bin/flatpak'
        : await findExecutable('flatpak');
    return flatpakPath ? resolveFlatpakVSCodium(flatpakPath) : null;
}
