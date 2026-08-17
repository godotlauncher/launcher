import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '@mariodebono/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { ToolIntegrationService } from '../../tool-integration.service.js';
import type {
    ToolExecutionResult,
    ToolInstallation,
    ToolSettings,
} from '../../tool-integration.types.js';
import { ToolProcessExecutor } from '../../tool-process.executor.js';
import { GitLfsModule } from './git-lfs.module.js';
import { GIT_LFS_TOOL_VALIDATION_TIMEOUT_MS } from './git-lfs-tool.constants.js';
import { GitLfsToolIntegration } from './git-lfs-tool.integration.js';

const platformMocks = vi.hoisted(() => ({
    findExecutable: vi.fn(),
}));

vi.mock('../../../utils/platform.utils.js', () => platformMocks);

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

const defaultSettings: ToolSettings = {
    enabled: true,
    executablePathOverride: null,
    executableArgsOverride: null,
};

const detectedInstallation: ToolInstallation = {
    executablePath: path.join('tools', 'git-lfs'),
    executableArgs: [],
    version: null,
    source: 'detected',
};

describe('GitLfsToolIntegration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        platformMocks.findExecutable.mockResolvedValue(null);
    });

    it('discovers the standard Git LFS executable from PATH', async () => {
        const executablePath = path.join('system', 'bin', 'git-lfs');
        platformMocks.findExecutable.mockResolvedValue(executablePath);
        const { integration } = createIntegration();

        await expect(
            integration.detectInstallation(defaultSettings),
        ).resolves.toEqual({
            executablePath,
            executableArgs: [],
            version: null,
            source: 'detected',
        });
        expect(platformMocks.findExecutable).toHaveBeenCalledWith('git-lfs');
    });

    it('reports Git LFS as missing when PATH discovery finds nothing', async () => {
        const { integration } = createIntegration();

        await expect(
            integration.detectInstallation(defaultSettings),
        ).resolves.toBeNull();
    });

    it.each([
        {
            executablePathOverride: path.join('custom', 'git-lfs'),
            executableArgsOverride: null,
        },
        {
            executablePathOverride: null,
            executableArgsOverride: ['--wrapper'],
        },
    ])('does not apply Git LFS execution overrides', async (overrides) => {
        const { integration } = createIntegration();

        await expect(
            integration.detectInstallation({
                ...defaultSettings,
                ...overrides,
            }),
        ).resolves.toBeNull();
        expect(platformMocks.findExecutable).not.toHaveBeenCalled();
    });

    it.each([
        'git-lfs/3.7.1 (GitHub; darwin arm64; go 1.24.4)\n',
        'git-lfs/3.7.1 (GitHub; windows amd64; go 1.24.4)\r\n',
        'git-lfs/3.6.1\nignored line',
    ])('validates the exact detected Git LFS path for %s', async (stdout) => {
        const { execute, integration } = createIntegration();
        execute.mockResolvedValue(success(stdout));

        await expect(
            integration.validateInstallation(detectedInstallation),
        ).resolves.toEqual({
            ...detectedInstallation,
            version: stdout.split(/\r?\n/, 1)[0],
        });
        expect(execute).toHaveBeenCalledWith(detectedInstallation, {
            args: ['--version'],
            timeoutMs: GIT_LFS_TOOL_VALIDATION_TIMEOUT_MS,
        });
    });

    it.each(['', 'git lfs 3.7.1', 'git-lfs version 3.7.1'])(
        'rejects incompatible version output %j',
        async (stdout) => {
            const { execute, integration } = createIntegration();
            execute.mockResolvedValue(success(stdout));

            await expect(
                integration.validateInstallation(detectedInstallation),
            ).resolves.toBeNull();
        },
    );

    it('rejects command failures', async () => {
        const { execute, integration } = createIntegration();
        execute.mockResolvedValue({
            success: false,
            reason: 'command-failed',
            stdout: '',
            stderr: 'failed',
            exitCode: 1,
        });

        await expect(
            integration.validateInstallation(detectedInstallation),
        ).resolves.toBeNull();
    });

    it.each([
        { ...detectedInstallation, source: 'override' as const },
        { ...detectedInstallation, executableArgs: ['--wrapper'] },
        { ...detectedInstallation, executablePath: '  ' },
    ])(
        'rejects non-standard Git LFS command specifications',
        async (candidate) => {
            const { execute, integration } = createIntegration();

            await expect(
                integration.validateInstallation(candidate),
            ).resolves.toBeNull();
            expect(execute).not.toHaveBeenCalled();
        },
    );

    it('persists a validated production Git LFS snapshot through the lifecycle', async () => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'launcher-git-lfs-tool-'),
        );
        const executablePath = path.join('system', 'bin', 'git-lfs');
        platformMocks.findExecutable.mockResolvedValue(executablePath);

        const application = await createApplication(
            {
                module: GitLfsModule,
                imports: [
                    ToolIntegrationModule.forRoot({
                        directory,
                        fileName: 'tool-integrations.json',
                    }),
                ],
            },
            { logger: false },
        );

        try {
            vi.spyOn(
                application.get(ToolProcessExecutor),
                'execute',
            ).mockResolvedValue(
                success('git-lfs/3.7.1 (GitHub; darwin arm64; go 1.24.4)\n'),
            );

            await expect(
                application.get(ToolIntegrationService).rescan('git-lfs'),
            ).resolves.toMatchObject({
                metadata: {
                    id: 'git-lfs',
                    displayName: 'Git LFS',
                    order: 200,
                },
                installation: {
                    executablePath,
                    executableArgs: [],
                    version: 'git-lfs/3.7.1 (GitHub; darwin arm64; go 1.24.4)',
                    source: 'detected',
                },
                status: 'available',
            });

            const persisted = JSON.parse(
                await fs.readFile(
                    path.join(directory, 'tool-integrations.json'),
                    'utf-8',
                ),
            );
            expect(
                persisted.tools['git-lfs'].installations[process.platform][
                    process.arch
                ],
            ).toMatchObject({
                installation: {
                    executablePath,
                    executableArgs: [],
                    version: 'git-lfs/3.7.1 (GitHub; darwin arm64; go 1.24.4)',
                    source: 'detected',
                },
                settingsFingerprint:
                    '{"executablePathOverride":null,"executableArgsOverride":null}',
            });
        } finally {
            await application.destroyAsync();
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
});

/**
 * Creates a Git LFS provider with a mocked process boundary.
 *
 * @returns The provider and its process execution mock.
 */
function createIntegration(): {
    integration: GitLfsToolIntegration;
    execute: ReturnType<typeof vi.fn>;
} {
    const execute = vi.fn();
    const processExecutor = { execute } as unknown as ToolProcessExecutor;
    return {
        integration: new GitLfsToolIntegration(processExecutor),
        execute,
    };
}

/**
 * Creates one successful tool execution result.
 *
 * @param stdout - Standard output returned by the command.
 * @returns A successful structured process result.
 */
function success(stdout: string): ToolExecutionResult {
    return {
        success: true,
        stdout,
        stderr: '',
        exitCode: 0,
    };
}
