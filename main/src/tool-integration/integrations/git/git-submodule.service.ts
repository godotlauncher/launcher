import { promises as fs } from 'node:fs';
import path from 'node:path';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { Injectable, Logger } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from '../../tool-integration.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitCredentialSessionService } from './git-credential-session.service.js';
import {
    createGitHttpsSafetyArguments,
    createGitNetworkEnvironment,
    createIsolatedGitConfig,
    formatGitCurlResolve,
} from './git-network-process.util.js';
import type {
    GitSubmoduleInitialiseRequest,
    GitSubmoduleInitialiseResult,
} from './git-submodule.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { PublicGitSourceService } from './public-git-source.service.js';

const GIT_SUBMODULE_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_GITMODULES_BYTES = 1_048_576;
const MAX_SUBMODULE_DEPTH = 8;
const MAX_SUBMODULES = 100;
const MAX_ACTIVITY_PATH_LENGTH = 512;
type SubmoduleDeclaration = {
    configName: string;
    path: string;
    url: string;
};

type PendingRepository = {
    repositoryPath: string;
    displayPrefix: string;
    depth: number;
};

type DeclarationResult =
    | { ok: true; declarations: SubmoduleDeclaration[] }
    | {
          ok: false;
          reason: 'git-unavailable' | 'unsupported-submodule' | 'cancelled';
      };

@Injectable()
export class GitSubmoduleService {
    /**
     * Creates the bounded anonymous public submodule service.
     *
     * @param tools - Revalidated Git execution boundary.
     * @param credentials - Attempt-owned rejecting askpass sessions.
     * @param publicSources - Public HTTPS URL and address validator.
     * @param logger - Application logger backed by the configured Electron logger.
     */
    constructor(
        private readonly tools: ToolIntegrationService,
        private readonly credentials: GitCredentialSessionService,
        private readonly publicSources: PublicGitSourceService,
        private readonly logger: Logger,
    ) {}

    /**
     * Reports whether a completed clone declares at least one submodule.
     *
     * @param repositoryPath - Exact completed clone path.
     * @returns Whether a `.gitmodules` path exists for later strict validation.
     */
    async hasSubmodules(repositoryPath: string): Promise<boolean> {
        try {
            await fs.lstat(path.join(repositoryPath, '.gitmodules'));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Initialises anonymous public HTTPS submodules one validated level at a time.
     *
     * @param request - Exact clone, support, cancellation and activity request.
     * @returns A safe terminal result that preserves partial initialisation.
     */
    async initialise(
        request: GitSubmoduleInitialiseRequest,
    ): Promise<GitSubmoduleInitialiseResult> {
        const configPaths = await createIsolatedGitConfig(
            request.supportDirectory,
        );
        const askPass = await this.credentials.openRejecting();
        try {
            const environment = createGitNetworkEnvironment(
                configPaths,
                askPass.environment,
            );
            const pending: PendingRepository[] = [
                {
                    repositoryPath: request.repositoryPath,
                    displayPrefix: '',
                    depth: 0,
                },
            ];
            let initialisedCount = 0;

            while (pending.length > 0) {
                if (request.signal.aborted) {
                    return { ok: false, reason: 'cancelled' };
                }
                const current = pending.shift();
                if (!current) break;
                if (current.depth > MAX_SUBMODULE_DEPTH) {
                    return {
                        ok: false,
                        reason: 'submodule-limit-exceeded',
                        path: current.displayPrefix,
                    };
                }
                const declared = await this.readDeclarations(
                    current.repositoryPath,
                    environment,
                    request.signal,
                );
                if (!declared.ok) {
                    return {
                        ok: false,
                        reason: declared.reason,
                        path: current.displayPrefix || undefined,
                    };
                }
                if (declared.declarations.length > 0) {
                    request.onActivity({
                        type: 'found',
                        count: declared.declarations.length,
                    });
                }

                for (const declaration of declared.declarations) {
                    initialisedCount += 1;
                    const displayPath = createDisplayPath(
                        current.displayPrefix,
                        declaration.path,
                    );
                    if (initialisedCount > MAX_SUBMODULES) {
                        return {
                            ok: false,
                            reason: 'submodule-limit-exceeded',
                            path: displayPath,
                        };
                    }
                    request.onActivity({
                        type: 'validating',
                        path: displayPath,
                    });
                    const inspected = await this.publicSources.inspect(
                        declaration.url,
                    );
                    if (request.signal.aborted) {
                        return { ok: false, reason: 'cancelled' };
                    }
                    if (!inspected.ok) {
                        return {
                            ok: false,
                            reason: 'unsupported-submodule',
                            path: displayPath,
                        };
                    }
                    request.onActivity({
                        type: 'initialising',
                        path: displayPath,
                    });
                    const result = await this.updateSubmodule(
                        current.repositoryPath,
                        declaration,
                        inspected.source,
                        environment,
                        request.signal,
                    );
                    if (!result.ok) {
                        return { ...result, path: displayPath };
                    }
                    request.onActivity({
                        type: 'initialised',
                        path: displayPath,
                    });
                    pending.push({
                        repositoryPath: path.join(
                            current.repositoryPath,
                            ...declaration.path.split('/'),
                        ),
                        displayPrefix: displayPath,
                        depth: current.depth + 1,
                    });
                }
            }
            return { ok: true, initialisedCount };
        } finally {
            await askPass.close();
        }
    }

    /**
     * Reads direct submodule paths and URLs through Git's own config parser.
     *
     * @param repositoryPath - Repository whose `.gitmodules` is inspected.
     * @param environment - Controlled anonymous Git environment.
     * @param signal - Operation cancellation signal.
     * @returns Validated direct declarations or a safe failure.
     */
    private async readDeclarations(
        repositoryPath: string,
        environment: NodeJS.ProcessEnv,
        signal: AbortSignal,
    ): Promise<DeclarationResult> {
        if (signal.aborted) {
            return { ok: false, reason: 'cancelled' };
        }
        const manifestPath = path.join(repositoryPath, '.gitmodules');
        let stat: Awaited<ReturnType<typeof fs.lstat>>;
        try {
            stat = await fs.lstat(manifestPath);
        } catch (error) {
            return isMissingPath(error)
                ? { ok: true, declarations: [] }
                : { ok: false, reason: 'unsupported-submodule' };
        }
        if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size > MAX_GITMODULES_BYTES
        ) {
            return { ok: false, reason: 'unsupported-submodule' };
        }

        const keys = await this.tools.execute('git', {
            args: [
                'config',
                '--file',
                '.gitmodules',
                '--name-only',
                '--get-regexp',
                '^submodule\\..*\\.path$',
            ],
            cwd: repositoryPath,
            env: environment,
            inheritEnv: false,
        });
        if (!keys.success) {
            if (
                keys.reason === 'disabled' ||
                keys.reason === 'invalid' ||
                keys.reason === 'unavailable'
            ) {
                return { ok: false, reason: 'git-unavailable' };
            }
            return { ok: false, reason: 'unsupported-submodule' };
        }
        const pathKeys = keys.stdout
            .split(/\r?\n/gu)
            .map((value) => value.trim())
            .filter(Boolean);
        if (pathKeys.length > MAX_SUBMODULES) {
            return { ok: false, reason: 'unsupported-submodule' };
        }
        const declarations: SubmoduleDeclaration[] = [];
        const knownPaths = new Set<string>();
        const knownConfigNames = new Set<string>();
        for (const pathKey of pathKeys) {
            if (signal.aborted) {
                return { ok: false, reason: 'cancelled' };
            }
            if (!isSafeSubmodulePathKey(pathKey)) {
                return { ok: false, reason: 'unsupported-submodule' };
            }
            const configName = pathKey.slice(
                'submodule.'.length,
                -'.path'.length,
            );
            const urlKey = `submodule.${configName}.url`;
            if (knownConfigNames.has(configName)) {
                return { ok: false, reason: 'unsupported-submodule' };
            }
            knownConfigNames.add(configName);
            const [pathResult, urlResult] = await Promise.all([
                this.readConfigValue(repositoryPath, pathKey, environment),
                this.readConfigValue(repositoryPath, urlKey, environment),
            ]);
            if (!pathResult.ok) {
                return {
                    ok: false,
                    reason: pathResult.reason,
                };
            }
            if (!urlResult.ok) {
                return { ok: false, reason: urlResult.reason };
            }
            if (
                !isSafeSubmodulePath(repositoryPath, pathResult.value) ||
                knownPaths.has(pathResult.value) ||
                urlResult.value.length > 2_048
            ) {
                return { ok: false, reason: 'unsupported-submodule' };
            }
            knownPaths.add(pathResult.value);
            declarations.push({
                configName,
                path: pathResult.value,
                url: urlResult.value,
            });
        }
        return { ok: true, declarations };
    }

    /**
     * Reads one exact `.gitmodules` value without enabling includes.
     *
     * @param repositoryPath - Repository containing the manifest.
     * @param key - Exact validated config key.
     * @param environment - Controlled anonymous Git environment.
     * @returns One bounded config value or a safe failure.
     */
    private async readConfigValue(
        repositoryPath: string,
        key: string,
        environment: NodeJS.ProcessEnv,
    ): Promise<
        | { ok: true; value: string }
        | { ok: false; reason: 'git-unavailable' | 'unsupported-submodule' }
    > {
        const result = await this.tools.execute('git', {
            args: ['config', '--file', '.gitmodules', '--get', key],
            cwd: repositoryPath,
            env: environment,
            inheritEnv: false,
        });
        if (!result.success) {
            return {
                ok: false,
                reason:
                    result.reason === 'disabled' ||
                    result.reason === 'invalid' ||
                    result.reason === 'unavailable'
                        ? 'git-unavailable'
                        : 'unsupported-submodule',
            };
        }
        const value = result.stdout.replace(/[\r\n]+$/gu, '');
        return value && !hasControlCharacters(value)
            ? { ok: true, value }
            : { ok: false, reason: 'unsupported-submodule' };
    }

    /**
     * Runs one exact direct submodule update with an overridden validated URL.
     *
     * @param repositoryPath - Parent repository path.
     * @param declaration - Validated direct submodule declaration.
     * @param source - Revalidated public source and pinned addresses.
     * @param environment - Controlled anonymous Git environment.
     * @param signal - Operation cancellation signal.
     * @returns A safe terminal result for the direct update.
     */
    private async updateSubmodule(
        repositoryPath: string,
        declaration: SubmoduleDeclaration,
        source: {
            canonicalUrl: string;
            approvedAddresses: string[];
        },
        environment: NodeJS.ProcessEnv,
        signal: AbortSignal,
    ): Promise<GitSubmoduleInitialiseResult> {
        const url = new URL(source.canonicalUrl);
        const args = createGitHttpsSafetyArguments(false);
        for (const address of source.approvedAddresses) {
            args.push('-c', formatGitCurlResolve(url.hostname, address));
        }
        args.push(
            '-c',
            `submodule.${declaration.configName}.url=${source.canonicalUrl}`,
            'submodule',
            'update',
            '--init',
            '--checkout',
            '--',
            declaration.path,
        );
        const result = await this.tools.executeStreaming('git', {
            args,
            cwd: repositoryPath,
            env: environment,
            signal,
            timeoutMs: GIT_SUBMODULE_TIMEOUT_MS,
        });
        if (result.success) return { ok: true, initialisedCount: 1 };
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
        this.logger.warn('Public Git submodule initialisation failed', {
            event: 'remote_git_submodule_failed',
            exitCode: result.exitCode,
            processReason: result.reason,
        });
        return { ok: false, reason: 'submodule-unavailable' };
    }
}

/** Returns whether one filesystem error represents an absent path. */
function isMissingPath(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Returns whether a Git config key safely names one submodule path value. */
function isSafeSubmodulePathKey(value: string): boolean {
    return (
        value.startsWith('submodule.') &&
        value.endsWith('.path') &&
        value.length > 'submodule..path'.length &&
        !hasControlCharacters(value) &&
        !value.includes('=')
    );
}

/** Returns whether one declared submodule path is a contained POSIX path. */
function isSafeSubmodulePath(repositoryPath: string, value: string): boolean {
    if (
        !value ||
        value.length > 1_024 ||
        value.includes('\\') ||
        path.posix.isAbsolute(value) ||
        path.win32.isAbsolute(value)
    ) {
        return false;
    }
    const segments = value.split('/');
    if (
        segments.some(
            (segment) => !segment || segment === '.' || segment === '..',
        )
    ) {
        return false;
    }
    const resolved = path.resolve(repositoryPath, ...segments);
    const relative = path.relative(repositoryPath, resolved);
    return (
        Boolean(relative) &&
        !relative.startsWith(`..${path.sep}`) &&
        relative !== '..'
    );
}

/** Creates one bounded renderer-safe relative activity path. */
function createDisplayPath(prefix: string, child: string): string {
    const value = prefix ? `${prefix}/${child}` : child;
    return value.length <= MAX_ACTIVITY_PATH_LENGTH
        ? value
        : `${value.slice(0, MAX_ACTIVITY_PATH_LENGTH - 3)}...`;
}

/** Returns whether text contains an ASCII control character. */
function hasControlCharacters(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}
