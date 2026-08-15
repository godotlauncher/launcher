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
import { GitModule } from './git.module.js';
import { GIT_TOOL_VALIDATION_TIMEOUT_MS } from './git-tool.constants.js';
import { GitToolIntegration } from './git-tool.integration.js';

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
    executablePath: path.join('tools', 'git'),
    executableArgs: [],
    version: null,
    source: 'detected',
};

describe('GitToolIntegration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        platformMocks.findExecutable.mockResolvedValue(null);
    });

    it('discovers the standard Git executable from PATH', async () => {
        const executablePath = path.join('system', 'bin', 'git');
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
        expect(platformMocks.findExecutable).toHaveBeenCalledWith('git');
    });

    it('reports Git as missing when PATH discovery finds nothing', async () => {
        const { integration } = createIntegration();

        await expect(
            integration.detectInstallation(defaultSettings),
        ).resolves.toBeNull();
    });

    it.each([
        {
            executablePathOverride: path.join('custom', 'git'),
            executableArgsOverride: null,
        },
        {
            executablePathOverride: null,
            executableArgsOverride: ['--wrapper'],
        },
    ])('does not apply Git execution overrides', async (overrides) => {
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
        'git version 2.51.0\n',
        'git version 2.39.5 (Apple Git-154)\r\n',
        'git version 2.51.0.windows.1\nignored line',
    ])('validates the exact detected Git path for %s', async (stdout) => {
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
            timeoutMs: GIT_TOOL_VALIDATION_TIMEOUT_MS,
        });
    });

    it.each(['', 'version 2.51.0', 'not-git version 2.51.0'])(
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
    ])('rejects non-standard Git command specifications', async (candidate) => {
        const { execute, integration } = createIntegration();

        await expect(
            integration.validateInstallation(candidate),
        ).resolves.toBeNull();
        expect(execute).not.toHaveBeenCalled();
    });

    it('persists a validated production Git snapshot through the lifecycle', async () => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'launcher-git-tool-'),
        );
        const executablePath = path.join('system', 'bin', 'git');
        platformMocks.findExecutable.mockResolvedValue(executablePath);

        const application = await createApplication(
            {
                module: GitModule,
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
            ).mockResolvedValue(success('git version 2.51.0\n'));

            await expect(
                application.get(ToolIntegrationService).rescan('git'),
            ).resolves.toMatchObject({
                metadata: { id: 'git', displayName: 'Git', order: 100 },
                installation: {
                    executablePath,
                    executableArgs: [],
                    version: 'git version 2.51.0',
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
                persisted.tools.git.installations[process.platform][
                    process.arch
                ],
            ).toMatchObject({
                installation: {
                    executablePath,
                    executableArgs: [],
                    version: 'git version 2.51.0',
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
 * Creates a Git provider with a mocked process boundary.
 *
 * @returns The provider and its process execution mock.
 */
function createIntegration(): {
    integration: GitToolIntegration;
    execute: ReturnType<typeof vi.fn>;
} {
    const execute = vi.fn();
    const processExecutor = { execute } as unknown as ToolProcessExecutor;
    return {
        integration: new GitToolIntegration(processExecutor),
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
