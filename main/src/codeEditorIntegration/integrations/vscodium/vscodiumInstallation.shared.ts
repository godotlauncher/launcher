import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import logger from 'electron-log';
import type { CodeEditorInstallation } from '../../codeEditorIntegration.types.js';

export type JSONObject = Record<string, unknown>;

export function isJSONObject(value: unknown): value is JSONObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isExistingFile(candidatePath: string): boolean {
    try {
        return fs.statSync(candidatePath).isFile();
    } catch {
        return false;
    }
}

export function isExecutableFile(candidatePath: string): boolean {
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

function readJSONFile(filePath: string): JSONObject | null {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return isJSONObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function readVSCodiumProductVersion(productPath: string): string | null {
    const product = readJSONFile(productPath);
    if (
        product?.applicationName !== 'codium' ||
        product.nameShort !== 'VSCodium' ||
        product.quality !== 'stable'
    ) {
        return null;
    }

    return typeof product.version === 'string' ? product.version : '';
}

export function findProductVersion(
    candidatePath: string,
    pathModule: typeof path.posix = path.posix,
): string | null {
    let realCandidatePath = candidatePath;
    try {
        realCandidatePath = fs.realpathSync(candidatePath);
    } catch {
        // The original path still provides useful bounded layout candidates.
    }

    const productCandidates = new Set<string>();
    for (const executablePath of [candidatePath, realCandidatePath]) {
        let currentDir = pathModule.dirname(executablePath);
        for (let depth = 0; depth < 5; depth += 1) {
            for (const segments of [
                ['resources', 'app', 'product.json'],
                ['lib', 'vscode', 'resources', 'app', 'product.json'],
                ['usr', 'share', 'codium', 'resources', 'app', 'product.json'],
            ]) {
                productCandidates.add(
                    pathModule.resolve(currentDir, ...segments),
                );
            }
            currentDir = pathModule.dirname(currentDir);
        }
    }

    if (candidatePath.startsWith('/usr/')) {
        for (const productPath of [
            '/usr/share/codium/resources/app/product.json',
            '/usr/share/vscodium/resources/app/product.json',
            '/usr/lib/codium/resources/app/product.json',
            '/usr/lib/vscodium/resources/app/product.json',
            '/usr/lib64/codium/resources/app/product.json',
            '/usr/lib64/vscodium/resources/app/product.json',
            '/opt/vscodium/resources/app/product.json',
            '/opt/vscodium-bin/resources/app/product.json',
        ]) {
            productCandidates.add(productPath);
        }
    }

    for (const productPath of productCandidates) {
        const version = readVSCodiumProductVersion(productPath);
        if (version !== null) {
            return version;
        }
    }

    return null;
}

export function toInstallation(
    executablePath: string,
    productVersion: string | null,
): CodeEditorInstallation {
    return {
        path: executablePath,
        version: productVersion || null,
    };
}

export function execFileText(
    executablePath: string,
    args: string[],
    options: { logFailure?: boolean } = {},
): Promise<string | null> {
    return new Promise((resolve) => {
        execFile(
            executablePath,
            args,
            {
                encoding: 'utf8',
                timeout: 3000,
                windowsHide: true,
            },
            (error, stdout) => {
                if (error) {
                    if (options.logFailure !== false) {
                        logger.debug('VSCodium metadata command failed', {
                            executablePath,
                            args,
                            error: error.message,
                        });
                    }
                    resolve(null);
                    return;
                }
                resolve(stdout.trim());
            },
        );
    });
}
