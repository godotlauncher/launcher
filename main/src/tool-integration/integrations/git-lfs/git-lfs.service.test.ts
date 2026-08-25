import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolIntegrationService } from '../../tool-integration.service.js';
import type { ToolExecutionResult } from '../../tool-integration.types.js';
import type { GitService } from '../git/git.service.js';
import { GitLfsService } from './git-lfs.service.js';
import { GIT_LFS_OPERATION_TIMEOUT_MS } from './git-lfs-tool.constants.js';
import { GODOT_GIT_LFS_TRACKING_POLICY } from './git-lfs-tracking-policy.constants.js';

const fsMocks = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock('node:fs', () => ({ promises: { readFile: fsMocks.readFile } }));

const execute = vi.fn();
const inspectRepository = vi.fn();
const toolIntegrationService = { execute } as unknown as ToolIntegrationService;
const gitService = { inspectRepository } as unknown as GitService;
const success = (): ToolExecutionResult => ({
    success: true,
    stdout: '',
    stderr: '',
    exitCode: 0,
});
const failure = (
    reason: 'unavailable' | 'command-failed' | 'timed-out',
): ToolExecutionResult => ({
    success: false,
    reason,
    stdout: '',
    stderr: '',
    exitCode: reason === 'command-failed' ? 1 : null,
});
const projectPath = path.resolve('projects', 'demo');
const repository = {
    status: 'inside-work-tree' as const,
    root: projectPath,
    isProjectRoot: true,
    kind: 'standard' as const,
};

describe('GitLfsService', () => {
    let service: GitLfsService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new GitLfsService(toolIntegrationService, gitService);
        execute.mockResolvedValue(success());
        inspectRepository.mockResolvedValue(repository);
        fsMocks.readFile.mockResolvedValue(
            [
                '* text=auto eol=lf',
                ...GODOT_GIT_LFS_TRACKING_POLICY.groups.flatMap((group) =>
                    group.patterns.map(
                        (pattern) =>
                            `${pattern} filter=lfs diff=lfs merge=lfs -text`,
                    ),
                ),
            ].join('\n'),
        );
    });

    it('returns the canonical policy as a defensive copy', () => {
        const first = service.getTrackingPolicy();
        const second = service.getTrackingPolicy();

        expect(first).toEqual(GODOT_GIT_LFS_TRACKING_POLICY);
        expect(first).not.toBe(second);
        expect(first.groups[0].patterns).not.toBe(second.groups[0].patterns);
    });

    it('checks availability through the exact tool ID without mutation', async () => {
        await expect(service.isAvailable()).resolves.toBe(true);
        expect(execute).toHaveBeenCalledWith('git-lfs', {
            args: ['--version'],
            env: { LC_ALL: 'C', LANG: 'C' },
            timeoutMs: GIT_LFS_OPERATION_TIMEOUT_MS,
        });
    });

    it('rejects unsupported policies and non-standard repository roots', async () => {
        await expect(
            service.configureProjectRepository(
                projectPath,
                'unknown' as 'godot-recommended-v1',
            ),
        ).resolves.toEqual({ status: 'failed', stage: 'verify' });
        expect(execute).not.toHaveBeenCalled();

        for (const invalidRepository of [
            { ...repository, isProjectRoot: false },
            { ...repository, kind: 'submodule' as const },
            { ...repository, kind: 'linked-worktree' as const },
        ]) {
            inspectRepository.mockResolvedValueOnce(invalidRepository);
            await expect(
                service.configureProjectRepository(
                    projectPath,
                    GODOT_GIT_LFS_TRACKING_POLICY.id,
                ),
            ).resolves.toEqual({ status: 'failed', stage: 'verify' });
        }
        expect(execute).not.toHaveBeenCalled();
    });

    it('installs, tracks separate unique patterns, and verifies in order', async () => {
        const patterns = GODOT_GIT_LFS_TRACKING_POLICY.groups.flatMap(
            (group) => [...group.patterns],
        );

        await expect(
            service.configureProjectRepository(
                projectPath,
                GODOT_GIT_LFS_TRACKING_POLICY.id,
            ),
        ).resolves.toEqual({
            status: 'configured',
            trackingPolicy: GODOT_GIT_LFS_TRACKING_POLICY.id,
        });

        expect(new Set(patterns).size).toBe(patterns.length);
        expect(execute).toHaveBeenNthCalledWith(1, 'git-lfs', {
            args: ['install', '--local'],
            cwd: projectPath,
            env: { LC_ALL: 'C', LANG: 'C' },
            timeoutMs: GIT_LFS_OPERATION_TIMEOUT_MS,
        });
        expect(execute).toHaveBeenNthCalledWith(2, 'git-lfs', {
            args: ['track', ...patterns],
            cwd: projectPath,
            env: { LC_ALL: 'C', LANG: 'C' },
            timeoutMs: GIT_LFS_OPERATION_TIMEOUT_MS,
        });
        expect(inspectRepository).toHaveBeenCalledTimes(3);
        expect(inspectRepository.mock.invocationCallOrder[0]).toBeLessThan(
            execute.mock.invocationCallOrder[0],
        );
        expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
            inspectRepository.mock.invocationCallOrder[1],
        );
        expect(inspectRepository.mock.invocationCallOrder[1]).toBeLessThan(
            execute.mock.invocationCallOrder[1],
        );
        expect(fsMocks.readFile).toHaveBeenCalledWith(
            path.resolve(projectPath, '.gitattributes'),
            'utf8',
        );
    });

    it.each([
        ['unavailable', failure('unavailable'), { status: 'unavailable' }],
        [
            'timeout',
            failure('timed-out'),
            { status: 'failed', stage: 'install' },
        ],
        [
            'command failure',
            failure('command-failed'),
            { status: 'failed', stage: 'install' },
        ],
    ] as const)('maps install %s', async (_name, result, expected) => {
        execute.mockResolvedValueOnce(result);
        await expect(
            service.configureProjectRepository(
                projectPath,
                GODOT_GIT_LFS_TRACKING_POLICY.id,
            ),
        ).resolves.toEqual(expected);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('maps tracking failure without verification', async () => {
        execute
            .mockResolvedValueOnce(success())
            .mockResolvedValueOnce(failure('timed-out'));
        await expect(
            service.configureProjectRepository(
                projectPath,
                GODOT_GIT_LFS_TRACKING_POLICY.id,
            ),
        ).resolves.toEqual({ status: 'failed', stage: 'track' });
        expect(fsMocks.readFile).not.toHaveBeenCalled();
    });

    it('reports unavailability when tool revalidation fails before tracking', async () => {
        execute
            .mockResolvedValueOnce(success())
            .mockResolvedValueOnce(failure('unavailable'));
        await expect(
            service.configureProjectRepository(
                projectPath,
                GODOT_GIT_LFS_TRACKING_POLICY.id,
            ),
        ).resolves.toEqual({ status: 'unavailable' });
        expect(fsMocks.readFile).not.toHaveBeenCalled();
    });

    it.each([
        ['missing base rule', '*.png filter=lfs diff=lfs merge=lfs -text'],
        ['malformed LFS rule', '* text=auto eol=lf\n*.png filter=lfs'],
    ])('fails verification for %s', async (_name, attributes) => {
        fsMocks.readFile.mockResolvedValueOnce(attributes);
        await expect(
            service.configureProjectRepository(
                projectPath,
                GODOT_GIT_LFS_TRACKING_POLICY.id,
            ),
        ).resolves.toEqual({ status: 'failed', stage: 'verify' });
    });
});
