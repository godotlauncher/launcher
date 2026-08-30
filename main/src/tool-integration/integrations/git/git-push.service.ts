import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from '../../tool-integration.service.js';
import type { ToolExecutionSession } from '../../tool-integration.types.js';
import { GIT_LFS_TOOL_ID } from '../git-lfs/git-lfs-tool.constants.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from './git.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitCredentialSessionService } from './git-credential-session.service.js';
import {
    createGitHttpsSafetyArguments,
    createGitNetworkEnvironment,
    createIsolatedGitConfig,
} from './git-network-process.util.js';
import type {
    GitPushFailureReason,
    GitPushRequest,
    GitPushResult,
    GitRemoteEmptyCheckRequest,
    GitRemoteEmptyCheckResult,
} from './git-push.types.js';
import { normalizeGitRemoteUrl } from './git-remote-url-normalizer.util.js';

const GIT_PUSH_TIMEOUT_MS = 30 * 60 * 1_000;
const GIT_LOCAL_COMMAND_TIMEOUT_MS = 15_000;
const GIT_REMOTE_REFS_MAX_BYTES = 4 * 1024;

type GitRemoteInspectionResult =
    | { ok: true; empty: boolean; matchesExpectedMain: boolean }
    | { ok: false; reason: GitPushFailureReason };

@Injectable()
export class GitPushService {
    /**
     * Creates the guarded Git push service.
     *
     * @param tools - Revalidated Git execution boundary.
     * @param credentials - Loopback-only askpass credential sessions.
     * @param git - Repository inspection service.
     */
    constructor(
        private readonly tools: ToolIntegrationService,
        private readonly credentials: GitCredentialSessionService,
        private readonly git: GitService,
    ) {}

    /**
     * Checks whether one exact HTTPS remote has no refs.
     *
     * @param request - Exact remote, credential, and cancellation data.
     * @returns Whether the remote is empty, or one safe network failure.
     */
    async checkRemoteEmpty(
        request: GitRemoteEmptyCheckRequest,
    ): Promise<GitRemoteEmptyCheckResult> {
        const canonicalUrl = validateCanonicalUrl(request.canonicalUrl);
        if (!canonicalUrl) {
            return { ok: false, reason: 'origin-failed' };
        }
        const supportDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'godot-launcher-git-remote-check-'),
        );
        let credentialSession:
            | Awaited<ReturnType<GitCredentialSessionService['open']>>
            | undefined;
        try {
            const configPaths = await createIsolatedGitConfig(supportDirectory);
            credentialSession = await this.credentials.open(request.credential);
            const environment = createGitNetworkEnvironment(
                configPaths,
                credentialSession.environment,
            );
            const inspection = await this.inspectRemoteEmpty(
                canonicalUrl,
                supportDirectory,
                environment,
                request.signal,
                null,
            );
            return inspection.ok
                ? { ok: true, empty: inspection.empty }
                : inspection;
        } catch {
            return { ok: false, reason: 'push-failed' };
        } finally {
            await credentialSession?.close().catch(() => undefined);
            await fs
                .rm(supportDirectory, { recursive: true, force: true })
                .catch(() => undefined);
        }
    }

    /**
     * Adds or reuses one matching origin, pushes main, and verifies upstream.
     *
     * @param request - Exact project, remote, credential, and cancellation data.
     * @returns The verified token-free origin or one safe failure.
     */
    async pushMain(request: GitPushRequest): Promise<GitPushResult> {
        const canonicalUrl = validateCanonicalUrl(request.canonicalUrl);
        if (!canonicalUrl) {
            return { ok: false, reason: 'origin-failed' };
        }
        if (!(await this.isExactStandardRoot(request.projectPath))) {
            return { ok: false, reason: 'local-repository-changed' };
        }

        let execute: ToolExecutionSession;
        try {
            execute = await this.tools.createExecutionSession('git');
        } catch {
            return { ok: false, reason: 'git-unavailable' };
        }
        if (!(await this.hasMainBranch(execute, request.projectPath))) {
            return { ok: false, reason: 'local-repository-changed' };
        }
        const expectedMainSha = request.requiresEmptyRemote
            ? await this.readMainCommit(execute, request.projectPath)
            : null;
        if (request.requiresEmptyRemote && !expectedMainSha) {
            return { ok: false, reason: 'local-repository-changed' };
        }

        const origin = await readOrigin(execute, request.projectPath);
        if (origin.status === 'failed') {
            return { ok: false, reason: 'origin-failed' };
        }
        if (
            origin.status === 'present' &&
            origin.canonicalUrl !== normalizeGitRemoteUrl(canonicalUrl)
        ) {
            return { ok: false, reason: 'local-repository-changed' };
        }
        const supportDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'godot-launcher-git-push-'),
        );
        let credentialSession:
            | Awaited<ReturnType<GitCredentialSessionService['open']>>
            | undefined;
        try {
            const hooksDirectory = path.join(supportDirectory, 'hooks');
            await fs.mkdir(hooksDirectory, { mode: 0o700 });
            const configPaths = await createIsolatedGitConfig(supportDirectory);
            credentialSession = await this.credentials.open(request.credential);
            const environment = createGitNetworkEnvironment(
                configPaths,
                credentialSession.environment,
            );
            if (request.requiresEmptyRemote) {
                const remote = await this.inspectRemoteEmpty(
                    canonicalUrl,
                    supportDirectory,
                    environment,
                    request.signal,
                    expectedMainSha,
                );
                if (!remote.ok) {
                    return remote;
                }
                if (!remote.empty && !remote.matchesExpectedMain) {
                    return { ok: false, reason: 'remote-not-empty' };
                }
            }
            if (origin.status === 'missing') {
                if (!(await this.isExactStandardRoot(request.projectPath))) {
                    return { ok: false, reason: 'local-repository-changed' };
                }
                const addResult = await execute({
                    args: ['remote', 'add', '--', 'origin', canonicalUrl],
                    cwd: request.projectPath,
                    timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
                });
                if (!addResult.success) {
                    return { ok: false, reason: 'origin-failed' };
                }
            }
            if (request.requiresGitLfsUpload) {
                let bufferedError = '';
                const lfsResult = await this.tools.executeStreaming(
                    GIT_LFS_TOOL_ID,
                    {
                        args: ['push', 'origin', 'main'],
                        cwd: request.projectPath,
                        env: createGitLfsPushEnvironment(
                            environment,
                            createGitLfsEndpoint(canonicalUrl),
                        ),
                        signal: request.signal,
                        timeoutMs: GIT_PUSH_TIMEOUT_MS,
                        onStderr: (chunk) => {
                            bufferedError = `${bufferedError}${chunk}`.slice(
                                -512,
                            );
                        },
                    },
                );
                if (!lfsResult.success) {
                    return {
                        ok: false,
                        reason: toGitPushFailureReason(bufferedError),
                    };
                }
            }
            let bufferedError = '';
            const pushResult = await this.tools.executeStreaming('git', {
                args: [
                    ...createGitHttpsSafetyArguments(true),
                    '-c',
                    `core.hooksPath=${hooksDirectory}`,
                    'push',
                    '--no-verify',
                    '--set-upstream',
                    'origin',
                    'main',
                ],
                cwd: request.projectPath,
                env: environment,
                signal: request.signal,
                timeoutMs: GIT_PUSH_TIMEOUT_MS,
                onStderr: (chunk) => {
                    bufferedError = `${bufferedError}${chunk}`.slice(-512);
                },
            });
            if (!pushResult.success) {
                return {
                    ok: false,
                    reason: toGitPushFailureReason(bufferedError),
                };
            }
        } catch {
            return { ok: false, reason: 'push-failed' };
        } finally {
            await credentialSession?.close().catch(() => undefined);
            await fs
                .rm(supportDirectory, { recursive: true, force: true })
                .catch(() => undefined);
        }

        if (!(await this.isExactStandardRoot(request.projectPath))) {
            return { ok: false, reason: 'local-repository-changed' };
        }
        const verifiedOrigin = await readOrigin(execute, request.projectPath);
        const upstream = await execute({
            args: [
                'rev-parse',
                '--abbrev-ref',
                '--symbolic-full-name',
                '@{upstream}',
            ],
            cwd: request.projectPath,
            timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
        });
        if (
            verifiedOrigin.status !== 'present' ||
            verifiedOrigin.canonicalUrl !==
                normalizeGitRemoteUrl(canonicalUrl) ||
            !upstream.success ||
            trimLine(upstream.stdout) !== 'origin/main'
        ) {
            return { ok: false, reason: 'verification-failed' };
        }
        return { ok: true, canonicalUrl };
    }

    /**
     * Checks the exact ordinary repository boundary required for publishing.
     *
     * @param projectPath - Project directory to inspect.
     * @returns Whether the directory is the standard repository root.
     */
    private async isExactStandardRoot(projectPath: string): Promise<boolean> {
        const inspection = await this.git.inspectRepository(projectPath);
        return (
            inspection.status === 'inside-work-tree' &&
            inspection.isProjectRoot &&
            inspection.kind === 'standard'
        );
    }

    /**
     * Checks that the current branch is exactly main.
     *
     * @param execute - Validated Git execution session.
     * @param projectPath - Exact project root.
     * @returns Whether main is the current branch.
     */
    private async hasMainBranch(
        execute: ToolExecutionSession,
        projectPath: string,
    ): Promise<boolean> {
        const result = await execute({
            args: ['branch', '--show-current'],
            cwd: projectPath,
            timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
        });
        return result.success && trimLine(result.stdout) === 'main';
    }

    /**
     * Reads the exact local main commit used for idempotent recovered retries.
     *
     * @param execute - Validated Git execution session.
     * @param projectPath - Exact project root.
     * @returns A validated object ID, or null.
     */
    private async readMainCommit(
        execute: ToolExecutionSession,
        projectPath: string,
    ): Promise<string | null> {
        const result = await execute({
            args: ['rev-parse', '--verify', 'main^{commit}'],
            cwd: projectPath,
            timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
        });
        if (!result.success) {
            return null;
        }
        const value = trimLine(result.stdout).toLowerCase();
        return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/u.test(value) ? value : null;
    }

    /**
     * Reads remote refs without retaining provider-controlled output.
     *
     * @param canonicalUrl - Validated token-free HTTPS clone URL.
     * @param supportDirectory - Attempt-owned directory outside the repository.
     * @param environment - Isolated Git network environment.
     * @param signal - Cancellation signal for the remote operation.
     * @param expectedMainSha - Optional local main object ID accepted as an idempotent retry.
     * @returns Whether the remote is empty or contains only the expected main ref.
     */
    private async inspectRemoteEmpty(
        canonicalUrl: string,
        supportDirectory: string,
        environment: NodeJS.ProcessEnv,
        signal: AbortSignal,
        expectedMainSha: string | null,
    ): Promise<GitRemoteInspectionResult> {
        let bufferedOutput = '';
        let outputExceededLimit = false;
        let bufferedError = '';
        const result = await this.tools.executeStreaming('git', {
            args: [
                ...createGitHttpsSafetyArguments(true),
                'ls-remote',
                '--refs',
                '--',
                canonicalUrl,
            ],
            cwd: supportDirectory,
            env: environment,
            signal,
            timeoutMs: GIT_PUSH_TIMEOUT_MS,
            onStdout: (chunk) => {
                if (outputExceededLimit) {
                    return;
                }
                if (
                    Buffer.byteLength(bufferedOutput, 'utf8') +
                        Buffer.byteLength(chunk, 'utf8') >
                    GIT_REMOTE_REFS_MAX_BYTES
                ) {
                    outputExceededLimit = true;
                    return;
                }
                bufferedOutput += chunk;
            },
            onStderr: (chunk) => {
                bufferedError = `${bufferedError}${chunk}`.slice(-512);
            },
        });
        if (!result.success) {
            return {
                ok: false,
                reason: toGitPushFailureReason(bufferedError),
            };
        }
        const refs = bufferedOutput
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean);
        const expectedLine = expectedMainSha
            ? `${expectedMainSha}\trefs/heads/main`
            : null;
        return {
            ok: true,
            empty: !outputExceededLimit && refs.length === 0,
            matchesExpectedMain:
                !outputExceededLimit &&
                expectedLine !== null &&
                refs.length === 1 &&
                refs[0]?.toLowerCase() === expectedLine,
        };
    }
}

/**
 * Creates the command-scoped Git configuration used by the direct Git LFS
 * executable without allowing repository-selected helpers or transfer agents.
 *
 * @param environment - Isolated network environment with the askpass session.
 * @param endpoint - Confirmed repository-specific Git LFS API endpoint.
 * @returns Environment with command-scoped Git LFS safety configuration.
 */
function createGitLfsPushEnvironment(
    environment: NodeJS.ProcessEnv,
    endpoint: string,
): NodeJS.ProcessEnv {
    const entries = [
        ['credential.helper', ''],
        ['lfs.url', endpoint],
        ['lfs.pushurl', endpoint],
        ['lfs.standalonetransferagent', ''],
        ['lfs.basictransfersonly', 'true'],
    ] as const;
    const configuredEnvironment: NodeJS.ProcessEnv = {
        ...environment,
        GIT_CONFIG_COUNT: String(entries.length),
    };
    entries.forEach(([key, value], index) => {
        configuredEnvironment[`GIT_CONFIG_KEY_${index}`] = key;
        configuredEnvironment[`GIT_CONFIG_VALUE_${index}`] = value;
    });
    return configuredEnvironment;
}

/**
 * Derives the standard GitHub Git LFS API endpoint from a validated clone URL.
 *
 * @param canonicalUrl - Validated token-free HTTPS clone URL.
 * @returns Repository-specific Git LFS API endpoint.
 */
function createGitLfsEndpoint(canonicalUrl: string): string {
    const url = new URL(canonicalUrl);
    url.pathname = `${url.pathname}/info/lfs`;
    return url.toString();
}

type OriginState =
    | { status: 'missing' }
    | { status: 'present'; canonicalUrl: string }
    | { status: 'failed' };

/**
 * Reads one local origin without treating unsafe or duplicate values as absent.
 *
 * @param execute - Validated Git execution session.
 * @param projectPath - Exact project root.
 * @returns Missing, safe present, or failed origin state.
 */
async function readOrigin(
    execute: ToolExecutionSession,
    projectPath: string,
): Promise<OriginState> {
    const result = await execute({
        args: [
            'config',
            '--local',
            '--no-includes',
            '--get-all',
            'remote.origin.url',
        ],
        cwd: projectPath,
        timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
    });
    if (!result.success) {
        return result.reason === 'command-failed' && result.exitCode === 1
            ? { status: 'missing' }
            : { status: 'failed' };
    }
    const values = result.stdout
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter(Boolean);
    if (values.length !== 1) {
        return { status: 'failed' };
    }
    const canonicalUrl = normalizeGitRemoteUrl(values[0]);
    return canonicalUrl
        ? { status: 'present', canonicalUrl }
        : { status: 'failed' };
}

/**
 * Validates a token-free HTTPS remote before it reaches Git.
 *
 * @param value - Provider-returned canonical clone URL.
 * @returns The unchanged safe URL, or null.
 */
function validateCanonicalUrl(value: string): string | null {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    return url.protocol === 'https:' &&
        url.username === '' &&
        url.password === '' &&
        url.port === '' &&
        url.search === '' &&
        url.hash === '' &&
        url.pathname.endsWith('.git')
        ? url.toString()
        : null;
}

/**
 * Removes the final line ending from one bounded Git value.
 *
 * @param value - Bounded Git output containing at most one useful line.
 * @returns The output without its final line ending.
 */
function trimLine(value: string): string {
    return value.replace(/\r?\n$/u, '');
}

type GitPushDiagnostic =
    | 'authentication-denied'
    | 'credential-helper-failed'
    | 'network-failed'
    | 'rejected'
    | 'unknown';

/**
 * Maps bounded Git or Git LFS diagnostics to the existing safe push contract.
 *
 * @param value - Bounded recent standard error text.
 * @returns Stable push failure reason.
 */
function toGitPushFailureReason(
    value: string,
): Extract<GitPushResult, { ok: false }>['reason'] {
    const diagnostic = classifyPushFailure(value);
    if (diagnostic === 'network-failed') {
        return 'network-unavailable';
    }
    if (
        diagnostic === 'authentication-denied' ||
        diagnostic === 'credential-helper-failed'
    ) {
        return 'authentication-failed';
    }
    return 'push-failed';
}

/**
 * Classifies bounded push output without retaining or logging it.
 *
 * @param value - Bounded recent Git standard error text.
 * @returns A credential-safe diagnostic category.
 */
function classifyPushFailure(value: string): GitPushDiagnostic {
    if (
        /(?:askpass|could not read (?:username|password)|credential helper)/iu.test(
            value,
        )
    ) {
        return 'credential-helper-failed';
    }
    if (
        /(?:authentication failed|access denied|http (?:401|403))/iu.test(value)
    ) {
        return 'authentication-denied';
    }
    if (/(?:rejected|non-fast-forward|fetch first)/iu.test(value)) {
        return 'rejected';
    }
    if (
        /(?:could not resolve host|failed to connect|timed out|unexpected disconnect|tls|ssl)/iu.test(
            value,
        )
    ) {
        return 'network-failed';
    }
    return 'unknown';
}
