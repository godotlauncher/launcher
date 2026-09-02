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
import { formatGitAlternateObjectPath } from './git-alternate-object-path.util.js';
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

type GitRemoteEmptyInspectionResult =
    | { ok: true; empty: boolean }
    | { ok: false; reason: GitPushFailureReason };

type GitRemoteMainExpectation =
    | { state: 'absent' }
    | { state: 'exact'; commit: string };

type GitRemoteMainInspectionResult =
    | { ok: true; expectation: GitRemoteMainExpectation }
    | { ok: false; reason: GitPushFailureReason };

type GitRemoteRefsResult =
    | { ok: true; refs: string[]; outputExceededLimit: boolean }
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
     * Pushes main, adds or reuses one matching origin, and verifies upstream.
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
        const expectedMainSha = await this.readMainCommit(
            execute,
            request.projectPath,
        );
        if (!expectedMainSha) {
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
        let networkCredentialSession:
            | Awaited<ReturnType<GitCredentialSessionService['open']>>
            | undefined;
        let pushCredentialSession:
            | Awaited<ReturnType<GitCredentialSessionService['openBound']>>
            | undefined;
        try {
            const hooksDirectory = path.join(supportDirectory, 'hooks');
            await fs.mkdir(hooksDirectory, { mode: 0o700 });
            const configPaths = await createIsolatedGitConfig(supportDirectory);
            const stagingRepository = path.join(
                supportDirectory,
                'repository.git',
            );
            const stagingEnvironment = createGitNetworkEnvironment(
                configPaths,
                {},
            );
            if (
                !(await prepareStagingRepository(
                    execute,
                    stagingRepository,
                    stagingEnvironment,
                    request.projectPath,
                    canonicalUrl,
                    expectedMainSha,
                ))
            ) {
                return { ok: false, reason: 'push-failed' };
            }
            if (
                (await this.readMainCommit(execute, request.projectPath)) !==
                expectedMainSha
            ) {
                return { ok: false, reason: 'local-repository-changed' };
            }
            networkCredentialSession = await this.credentials.open(
                request.credential,
            );
            const networkEnvironment = createGitNetworkEnvironment(
                configPaths,
                networkCredentialSession.environment,
            );
            const remoteMain = await this.inspectRemoteMain(
                canonicalUrl,
                supportDirectory,
                networkEnvironment,
                request.signal,
                expectedMainSha,
            );
            if (!remoteMain.ok) {
                return remoteMain;
            }
            if (request.requiresGitLfsUpload) {
                let bufferedError = '';
                const lfsResult = await this.tools.executeStreaming(
                    GIT_LFS_TOOL_ID,
                    {
                        args: ['push', 'origin', 'main'],
                        cwd: stagingRepository,
                        env: createGitLfsPushEnvironment(
                            networkEnvironment,
                            createGitLfsEndpoint(canonicalUrl),
                            path.join(request.projectPath, '.git', 'lfs'),
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
            await networkCredentialSession?.close();
            networkCredentialSession = undefined;
            if (
                (await this.readMainCommit(execute, request.projectPath)) !==
                expectedMainSha
            ) {
                return { ok: false, reason: 'local-repository-changed' };
            }
            pushCredentialSession = await this.credentials.openBound(
                request.credential,
                canonicalUrl,
            );
            const pushEnvironment = createGitNetworkEnvironment(
                configPaths,
                pushCredentialSession.environment,
            );
            let bufferedError = '';
            const pushResult = await this.tools.executeStreaming('git', {
                args: [
                    ...createGitHttpsSafetyArguments(true),
                    '-c',
                    `credential.helper=${pushCredentialSession.helper}`,
                    '-c',
                    'core.askPass=',
                    '-c',
                    'remote.origin.pushurl=',
                    '-c',
                    `remote.origin.pushurl=${canonicalUrl}`,
                    '-c',
                    `core.hooksPath=${hooksDirectory}`,
                    'push',
                    createMainLease(remoteMain.expectation),
                    '--no-verify',
                    'origin',
                    'refs/heads/main:refs/heads/main',
                ],
                cwd: stagingRepository,
                env: pushEnvironment,
                signal: request.signal,
                timeoutMs: GIT_PUSH_TIMEOUT_MS,
                onStderr: (chunk) => {
                    bufferedError = `${bufferedError}${chunk}`.slice(-512);
                },
            });
            if (!pushResult.success) {
                if (classifyPushFailure(bufferedError) === 'stale-info') {
                    return { ok: false, reason: 'remote-not-empty' };
                }
                return {
                    ok: false,
                    reason: toGitPushFailureReason(bufferedError),
                };
            }
            await pushCredentialSession.close().catch(() => undefined);
            pushCredentialSession = undefined;

            if (
                !(await this.isExactStandardRoot(request.projectPath)) ||
                (await this.readMainCommit(execute, request.projectPath)) !==
                    expectedMainSha
            ) {
                return { ok: false, reason: 'local-repository-changed' };
            }
            if (origin.status === 'missing') {
                const addResult = await execute({
                    args: ['remote', 'add', '--', 'origin', canonicalUrl],
                    cwd: request.projectPath,
                    timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
                });
                if (!addResult.success) {
                    return { ok: false, reason: 'origin-failed' };
                }
            }
            const verifiedOrigin = await readOrigin(
                execute,
                request.projectPath,
            );
            if (
                verifiedOrigin.status !== 'present' ||
                verifiedOrigin.canonicalUrl !==
                    normalizeGitRemoteUrl(canonicalUrl)
            ) {
                return { ok: false, reason: 'local-repository-changed' };
            }
            if (
                !(await reconcileLocalUpstream(
                    execute,
                    request.projectPath,
                    expectedMainSha,
                    hooksDirectory,
                ))
            ) {
                return { ok: false, reason: 'verification-failed' };
            }
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
                !upstream.success ||
                trimLine(upstream.stdout) !== 'origin/main'
            ) {
                return { ok: false, reason: 'verification-failed' };
            }
            return { ok: true, canonicalUrl };
        } catch {
            return { ok: false, reason: 'push-failed' };
        } finally {
            await networkCredentialSession?.close().catch(() => undefined);
            await pushCredentialSession?.close().catch(() => undefined);
            await fs
                .rm(supportDirectory, { recursive: true, force: true })
                .catch(() => undefined);
        }
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
     * @returns Whether the remote has no refs.
     */
    private async inspectRemoteEmpty(
        canonicalUrl: string,
        supportDirectory: string,
        environment: NodeJS.ProcessEnv,
        signal: AbortSignal,
    ): Promise<GitRemoteEmptyInspectionResult> {
        const result = await this.readRemoteRefs(
            canonicalUrl,
            supportDirectory,
            environment,
            signal,
        );
        return result.ok
            ? {
                  ok: true,
                  empty:
                      !result.outputExceededLimit && result.refs.length === 0,
              }
            : result;
    }

    /**
     * Reads only remote main and derives the exact lease for one guarded push.
     *
     * @param canonicalUrl - Validated token-free HTTPS clone URL.
     * @param supportDirectory - Attempt-owned directory outside the repository.
     * @param environment - Isolated Git network environment.
     * @param signal - Cancellation signal for the remote operation.
     * @param expectedMainSha - Captured local main object ID accepted for an idempotent retry.
     * @returns An absent or exact-main expectation, or one safe failure.
     */
    private async inspectRemoteMain(
        canonicalUrl: string,
        supportDirectory: string,
        environment: NodeJS.ProcessEnv,
        signal: AbortSignal,
        expectedMainSha: string,
    ): Promise<GitRemoteMainInspectionResult> {
        const result = await this.readRemoteRefs(
            canonicalUrl,
            supportDirectory,
            environment,
            signal,
            'refs/heads/main',
        );
        if (!result.ok) {
            return result;
        }
        if (result.outputExceededLimit) {
            return { ok: false, reason: 'remote-not-empty' };
        }
        if (result.refs.length === 0) {
            return { ok: true, expectation: { state: 'absent' } };
        }
        if (
            result.refs.length === 1 &&
            result.refs[0] === `${expectedMainSha}\trefs/heads/main`
        ) {
            return {
                ok: true,
                expectation: { state: 'exact', commit: expectedMainSha },
            };
        }
        return { ok: false, reason: 'remote-not-empty' };
    }

    /**
     * Reads bounded remote refs through one isolated credential session.
     *
     * @param canonicalUrl - Validated token-free HTTPS clone URL.
     * @param supportDirectory - Attempt-owned directory outside the repository.
     * @param environment - Isolated Git network environment.
     * @param signal - Cancellation signal for the remote operation.
     * @param patterns - Optional exact ref patterns passed after the remote URL.
     * @returns Normalised ref lines, or one safe failure.
     */
    private async readRemoteRefs(
        canonicalUrl: string,
        supportDirectory: string,
        environment: NodeJS.ProcessEnv,
        signal: AbortSignal,
        ...patterns: string[]
    ): Promise<GitRemoteRefsResult> {
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
                ...patterns,
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
            .map((line) => line.trim().toLowerCase())
            .filter(Boolean);
        return { ok: true, refs, outputExceededLimit };
    }
}

/**
 * Creates the only force-with-lease form allowed for publication.
 *
 * @param expectation - Captured absent or exact remote main state.
 * @returns Explicit refs/heads/main lease argument.
 */
function createMainLease(expectation: GitRemoteMainExpectation): string {
    return `--force-with-lease=refs/heads/main:${
        expectation.state === 'exact' ? expectation.commit : ''
    }`;
}

/**
 * Creates the command-scoped Git configuration used by the direct Git LFS
 * executable without allowing repository-selected helpers or transfer agents.
 *
 * @param environment - Isolated network environment with the askpass session.
 * @param endpoint - Confirmed repository-specific Git LFS API endpoint.
 * @param storage - Exact project-owned Git LFS object storage path.
 * @returns Environment with command-scoped Git LFS safety configuration.
 */
function createGitLfsPushEnvironment(
    environment: NodeJS.ProcessEnv,
    endpoint: string,
    storage: string,
): NodeJS.ProcessEnv {
    const entries = [
        ['credential.helper', ''],
        ['lfs.url', endpoint],
        ['lfs.pushurl', endpoint],
        ['lfs.storage', storage],
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
 * Creates one clean bare repository containing only the approved main ref and
 * canonical origin.
 *
 * @param execute - Validated Git execution session.
 * @param stagingRepository - Attempt-owned bare repository path.
 * @param environment - Isolated staging Git environment.
 * @param projectPath - Exact standard project repository root.
 * @param canonicalUrl - Validated token-free HTTPS clone URL.
 * @param expectedMainSha - Validated project main commit object ID.
 * @returns Whether every staging repository setup command succeeded.
 */
async function prepareStagingRepository(
    execute: ToolExecutionSession,
    stagingRepository: string,
    environment: NodeJS.ProcessEnv,
    projectPath: string,
    canonicalUrl: string,
    expectedMainSha: string,
): Promise<boolean> {
    const initResult = await execute({
        args: [
            '-c',
            'init.templateDir=',
            'init',
            '--bare',
            '--initial-branch=main',
            '--',
            stagingRepository,
        ],
        cwd: path.dirname(stagingRepository),
        env: environment,
        inheritEnv: false,
        timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
    });
    if (!initResult.success) {
        return false;
    }
    try {
        await writeStagingObjectAlternate(stagingRepository, projectPath);
    } catch {
        return false;
    }
    const requests = [
        {
            args: ['update-ref', 'refs/heads/main', expectedMainSha],
            cwd: stagingRepository,
        },
        {
            args: ['remote', 'add', '--', 'origin', canonicalUrl],
            cwd: stagingRepository,
        },
    ];
    for (const request of requests) {
        const result = await execute({
            ...request,
            env: environment,
            inheritEnv: false,
            timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
        });
        if (!result.success) {
            return false;
        }
    }
    return true;
}

/**
 * Exposes one validated project's Git objects to a staging repository.
 *
 * @param stagingRepository - Attempt-owned bare repository path.
 * @param projectPath - Exact standard project repository root.
 */
async function writeStagingObjectAlternate(
    stagingRepository: string,
    projectPath: string,
): Promise<void> {
    const objectsDirectory = formatGitAlternateObjectPath(
        path.join(projectPath, '.git', 'objects'),
    );
    const infoDirectory = path.join(stagingRepository, 'objects', 'info');
    await fs.mkdir(infoDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(
        path.join(infoDirectory, 'alternates'),
        `${objectsDirectory}\n`,
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
}

/**
 * Records the successfully pushed snapshot as the local main upstream.
 *
 * @param execute - Validated Git execution session.
 * @param projectPath - Exact standard project repository root.
 * @param expectedMainSha - Commit object ID that was pushed successfully.
 * @param hooksDirectory - Attempt-owned empty hooks directory.
 * @returns Whether the remote-tracking ref and upstream configuration were set.
 */
async function reconcileLocalUpstream(
    execute: ToolExecutionSession,
    projectPath: string,
    expectedMainSha: string,
    hooksDirectory: string,
): Promise<boolean> {
    const commands = [
        [
            '-c',
            `core.hooksPath=${hooksDirectory}`,
            'update-ref',
            'refs/remotes/origin/main',
            expectedMainSha,
        ],
        ['config', '--local', 'branch.main.remote', 'origin'],
        ['config', '--local', 'branch.main.merge', 'refs/heads/main'],
    ];
    for (const args of commands) {
        const result = await execute({
            args,
            cwd: projectPath,
            timeoutMs: GIT_LOCAL_COMMAND_TIMEOUT_MS,
        });
        if (!result.success) {
            return false;
        }
    }
    return true;
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
    | 'stale-info'
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
    if (/\(stale info\)/iu.test(value)) {
        return 'stale-info';
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
