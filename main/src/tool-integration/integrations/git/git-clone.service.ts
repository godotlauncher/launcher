import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { Injectable, Logger } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from '../../tool-integration.service.js';
import type { GitCloneRequest, GitCloneResult } from './git-clone.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitCredentialSessionService } from './git-credential-session.service.js';

const GIT_CLONE_TIMEOUT_MS = 30 * 60 * 1_000;

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

@Injectable()
export class GitCloneService {
    /**
     * Creates the guarded Git clone service.
     *
     * @param tools - Revalidated tool execution boundary.
     * @param credentials - Attempt-owned rejecting or connected sessions.
     * @param logger - Application logger backed by the configured Electron logger.
     */
    constructor(
        private readonly tools: ToolIntegrationService,
        private readonly credentials: GitCredentialSessionService,
        private readonly logger: Logger,
    ) {}

    /**
     * Clones one public or connected HTTPS repository with bounded progress.
     *
     * @param request - Validated source, destination and cancellation request.
     * @returns A safe terminal clone result.
     */
    async clone(request: GitCloneRequest): Promise<GitCloneResult> {
        const url = validateCloneUrl(request.canonicalUrl);
        if (
            !url ||
            (request.source === 'public' &&
                (request.approvedAddresses.length === 0 ||
                    request.approvedAddresses.some(
                        (address) => net.isIP(address) === 0,
                    )))
        ) {
            return { ok: false, reason: 'clone-failed' };
        }
        const configPaths = await createIsolatedConfig(
            request.supportDirectory,
        );
        const askPass =
            request.source === 'connected'
                ? await this.credentials.open(request.credential)
                : await this.credentials.openRejecting();
        try {
            const environment = createCloneEnvironment(
                configPaths,
                askPass.environment,
            );
            const argumentsList = createCloneArguments(request, url);
            let bufferedProgress = '';
            let lastPercent = -1;
            const result = await this.tools.executeStreaming('git', {
                args: argumentsList,
                env: environment,
                signal: request.signal,
                timeoutMs: GIT_CLONE_TIMEOUT_MS,
                onStderr: (chunk) => {
                    bufferedProgress = `${bufferedProgress}${chunk}`.slice(
                        -512,
                    );
                    const percent = readClonePercent(bufferedProgress);
                    if (percent !== null && percent > lastPercent) {
                        lastPercent = percent;
                        request.onProgress(percent);
                    }
                },
            });
            if (result.success) {
                const diagnostic = classifyCloneSuccess(bufferedProgress);
                const details = {
                    diagnostic,
                    event: 'remote_git_clone_completed',
                    lastPercent,
                    source: request.source,
                };
                if (diagnostic === 'empty-repository') {
                    this.logger.warn(
                        'Remote Git clone reported an empty repository',
                        details,
                    );
                } else {
                    this.logger.debug?.('Remote Git clone completed', details);
                }
                request.onProgress(100);
                return { ok: true };
            }
            if (result.reason === 'cancelled') {
                return { ok: false, reason: 'cancelled' };
            }
            if (
                result.reason === 'disabled' ||
                result.reason === 'invalid' ||
                result.reason === 'unavailable'
            ) {
                return { ok: false, reason: 'git-unavailable' };
            }
            if (
                request.source === 'public' &&
                isPublicCloneIncompatible(bufferedProgress)
            ) {
                return { ok: false, reason: 'public-clone-incompatible' };
            }
            this.logger.warn('Remote Git clone failed', {
                diagnostic: classifyCloneFailure(bufferedProgress),
                event: 'remote_git_clone_failed',
                exitCode: result.exitCode,
                lastPercent,
                processReason: result.reason,
                source: request.source,
            });
            return { ok: false, reason: 'clone-failed' };
        } finally {
            await askPass.close();
        }
    }
}

type GitCloneSuccessDiagnostic = 'complete' | 'empty-repository';

/**
 * Classifies safe terminal information emitted by a successful Git clone.
 *
 * @param value - Bounded recent Git standard error text.
 * @returns A credential-safe successful clone classification.
 */
function classifyCloneSuccess(value: string): GitCloneSuccessDiagnostic {
    return /(?:cloned an empty repository|empty repository)/iu.test(value)
        ? 'empty-repository'
        : 'complete';
}

/**
 * Validates the token-free HTTPS clone URL supplied by a trusted source.
 *
 * @param value - Canonical URL supplied by the source boundary.
 * @returns Parsed HTTPS URL, or null when it is unsafe.
 */
function validateCloneUrl(value: string): URL | null {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    return url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        !url.port &&
        url.pathname !== '/'
        ? url
        : null;
}

/**
 * Creates empty attempt-owned Git configuration files.
 *
 * @param supportDirectory - Attempt-owned support directory.
 * @returns Paths for isolated system and global Git configuration.
 */
async function createIsolatedConfig(
    supportDirectory: string,
): Promise<{ system: string; global: string }> {
    const system = path.join(supportDirectory, 'git-system.config');
    const global = path.join(supportDirectory, 'git-global.config');
    await Promise.all([
        fs.writeFile(system, '', { flag: 'wx', mode: 0o600 }),
        fs.writeFile(global, '', { flag: 'wx', mode: 0o600 }),
    ]);
    return { system, global };
}

/**
 * Creates a controlled clone environment without inherited Git injection.
 *
 * @param configPaths - Attempt-owned empty Git configuration paths.
 * @param askPassEnvironment - Opaque askpass session environment.
 * @returns Controlled child process environment.
 */
function createCloneEnvironment(
    configPaths: { system: string; global: string },
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
        GIT_TERMINAL_PROMPT: '0',
        LANG: 'C',
        LC_ALL: 'C',
    };
}

/**
 * Builds exact clone arguments without credentials or shell fragments.
 *
 * @param request - Validated clone request.
 * @param url - Parsed token-free HTTPS clone URL.
 * @returns Exact Git clone argument list.
 */
function createCloneArguments(request: GitCloneRequest, url: URL): string[] {
    const argumentsList = [
        '-c',
        'credential.helper=',
        '-c',
        `credential.interactive=${request.source === 'connected' ? 'true' : 'false'}`,
        '-c',
        'credential.useHttpPath=true',
        '-c',
        'http.followRedirects=false',
        '-c',
        'http.sslVerify=true',
    ];
    if (request.source === 'public') {
        for (const address of request.approvedAddresses) {
            argumentsList.push(
                '-c',
                `http.curloptResolve=${url.hostname}:443:${formatAddress(address)}`,
            );
        }
    }
    argumentsList.push(
        'clone',
        '--progress',
        '--',
        url.toString(),
        request.destinationPath,
    );
    return argumentsList;
}

/**
 * Formats an approved IP address for libcurl resolution pinning.
 *
 * @param address - Approved public IPv4 or IPv6 address.
 * @returns Address in libcurl resolve syntax.
 */
function formatAddress(address: string): string {
    return net.isIP(address) === 6 ? `[${address}]` : address;
}

/**
 * Reads the latest bounded Git clone percentage from progress text.
 *
 * @param value - Bounded recent Git progress text.
 * @returns Latest percentage, or null when no progress is present.
 */
function readClonePercent(value: string): number | null {
    const matches = [
        ...value.matchAll(
            /(?:Receiving objects|Resolving deltas|Updating files):\s+(\d{1,3})%/gu,
        ),
    ];
    const latest = matches.at(-1)?.[1];
    if (!latest) {
        return null;
    }
    return Math.min(100, Number.parseInt(latest, 10));
}

/**
 * Detects a failure to apply libcurl's required DNS resolution override.
 *
 * @param value - Bounded recent Git error text.
 * @returns Whether the required override is unsupported.
 */
function isPublicCloneIncompatible(value: string): boolean {
    return /(?:curloptresolve|curlopt_resolve|curlopt-resolve)/iu.test(value);
}

type GitCloneFailureDiagnostic =
    | 'authentication-denied'
    | 'checkout-failed'
    | 'credential-helper-failed'
    | 'filesystem-failed'
    | 'network-failed'
    | 'repository-unavailable'
    | 'unknown';

/**
 * Classifies bounded Git error output without retaining or logging it.
 *
 * @param value - Bounded recent Git standard error text.
 * @returns A credential-safe diagnostic category.
 */
function classifyCloneFailure(value: string): GitCloneFailureDiagnostic {
    if (
        /(?:askpass|could not read (?:username|password)|credential helper|terminal prompts disabled|unable to get (?:username|password) from user)/iu.test(
            value,
        )
    ) {
        return 'credential-helper-failed';
    }
    if (
        /(?:authentication failed|access denied|invalid username or password|http (?:401|403))/iu.test(
            value,
        )
    ) {
        return 'authentication-denied';
    }
    if (/(?:repository).*(?:not found|does not exist)/iu.test(value)) {
        return 'repository-unavailable';
    }
    if (
        /(?:could not resolve host|failed to connect|connection (?:reset|timed out)|early eof|http\/2 stream|remote end hung up|rpc failed|ssl|tls|unexpected disconnect)/iu.test(
            value,
        )
    ) {
        return 'network-failed';
    }
    if (
        /(?:unable to checkout working tree|cannot create file|filename too long|invalid path)/iu.test(
            value,
        )
    ) {
        return 'checkout-failed';
    }
    if (
        /(?:could not create work tree dir|disk quota exceeded|no space left on device|permission denied|read-only file system)/iu.test(
            value,
        )
    ) {
        return 'filesystem-failed';
    }
    return 'unknown';
}
