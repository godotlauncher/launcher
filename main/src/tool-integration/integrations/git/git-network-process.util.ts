import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const REMOVED_ENVIRONMENT_KEYS = new Set([
    'CURL_CA_BUNDLE',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'SSH_ASKPASS',
]);

export type IsolatedGitConfigPaths = {
    system: string;
    global: string;
};

/**
 * Creates empty attempt-owned Git configuration files.
 *
 * @param supportDirectory - Attempt-owned support directory.
 * @returns Paths for isolated system and global Git configuration.
 */
export async function createIsolatedGitConfig(
    supportDirectory: string,
): Promise<IsolatedGitConfigPaths> {
    const system = path.join(supportDirectory, 'git-system.config');
    const global = path.join(supportDirectory, 'git-global.config');
    await Promise.all([
        fs.writeFile(system, '', { flag: 'wx', mode: 0o600 }),
        fs.writeFile(global, '', { flag: 'wx', mode: 0o600 }),
    ]);
    return { system, global };
}

/**
 * Creates a controlled Git network environment without inherited injection.
 *
 * @param configPaths - Attempt-owned empty Git configuration paths.
 * @param askPassEnvironment - Opaque askpass session environment.
 * @returns Controlled child process environment.
 */
export function createGitNetworkEnvironment(
    configPaths: IsolatedGitConfigPaths,
    askPassEnvironment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
        const upperKey = key.toUpperCase();
        if (
            upperKey.startsWith('GIT_') ||
            upperKey.startsWith('GCM_') ||
            REMOVED_ENVIRONMENT_KEYS.has(upperKey)
        ) {
            continue;
        }
        environment[key] = value;
    }
    return {
        ...environment,
        ...askPassEnvironment,
        GIT_ALLOW_PROTOCOL: 'https',
        GIT_CONFIG_GLOBAL: configPaths.global,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: configPaths.system,
        GIT_PROTOCOL_FROM_USER: '0',
        GIT_TERMINAL_PROMPT: '0',
        LANG: 'C',
        LC_ALL: 'C',
    };
}

/**
 * Builds common HTTPS safety configuration for one Git network command.
 *
 * @param interactive - Whether the rejecting or connected askpass may run.
 * @returns Exact Git configuration arguments.
 */
export function createGitHttpsSafetyArguments(interactive: boolean): string[] {
    return [
        '-c',
        'credential.helper=',
        '-c',
        `credential.interactive=${interactive ? 'true' : 'false'}`,
        '-c',
        'credential.useHttpPath=true',
        '-c',
        'http.followRedirects=false',
        '-c',
        'http.sslVerify=true',
    ];
}

/**
 * Formats one validated host and address as a libcurl resolution override.
 *
 * @param hostname - Validated HTTPS hostname.
 * @param address - Validated public IPv4 or IPv6 address.
 * @returns Git configuration value for libcurl resolution pinning.
 */
export function formatGitCurlResolve(
    hostname: string,
    address: string,
): string {
    const formattedAddress = net.isIP(address) === 6 ? `[${address}]` : address;
    return `http.curloptResolve=${hostname}:443:${formattedAddress}`;
}
