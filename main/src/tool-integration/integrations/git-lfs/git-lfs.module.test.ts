import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication, Module } from '@mariodebono/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { ToolIntegrationRegistry } from '../../tool-integration.registry.js';
import { ToolIntegrationService } from '../../tool-integration.service.js';
import { ToolProcessExecutor } from '../../tool-process.executor.js';
import { GitModule } from '../git/git.module.js';
import { GitLfsController } from './git-lfs.controller.js';
import { GitLfsModule } from './git-lfs.module.js';
import { GitLfsService } from './git-lfs.service.js';

const platformMocks = vi.hoisted(() => ({
    findExecutable: vi.fn(),
}));

vi.mock('../../../utils/platform.utils.js', () => platformMocks);

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

@Module({
    imports: [
        ToolIntegrationModule.forRoot({
            directory: '/config',
            fileName: 'tool-integrations.json',
        }),
        GitModule,
        GitLfsModule,
    ],
})
class TestGitLfsModule {}

describe('GitLfsModule', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        platformMocks.findExecutable.mockResolvedValue(null);
    });

    it('registers Git LFS independently after Git', async () => {
        const app = await createApplication(TestGitLfsModule, {
            logger: false,
        });

        expect(
            app
                .get(ToolIntegrationRegistry)
                .list()
                .map((integration) => integration.metadata),
        ).toEqual([
            { id: 'git', displayName: 'Git', order: 100 },
            { id: 'git-lfs', displayName: 'Git LFS', order: 200 },
        ]);
        expect(app.get(GitLfsService)).toBeInstanceOf(GitLfsService);
        expect(app.get(GitLfsController)).toBeInstanceOf(GitLfsController);

        await app.destroyAsync();
    });

    it('keeps Git available when Git LFS is missing', async () => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'launcher-git-lfs-module-'),
        );
        const gitPath = path.join('system', 'bin', 'git');
        platformMocks.findExecutable.mockImplementation(
            async (toolId: string) => (toolId === 'git' ? gitPath : null),
        );

        const app = await createApplication(
            {
                module: GitLfsModule,
                imports: [
                    ToolIntegrationModule.forRoot({
                        directory,
                        fileName: 'tool-integrations.json',
                    }),
                    GitModule,
                ],
            },
            { logger: false },
        );

        try {
            vi.spyOn(app.get(ToolProcessExecutor), 'execute').mockResolvedValue(
                {
                    success: true,
                    stdout: 'git version 2.51.0\n',
                    stderr: '',
                    exitCode: 0,
                },
            );

            await expect(
                app.get(ToolIntegrationService).rescanAll(),
            ).resolves.toMatchObject([
                {
                    metadata: { id: 'git' },
                    status: 'available',
                    installation: { executablePath: gitPath },
                },
                {
                    metadata: { id: 'git-lfs' },
                    status: 'missing',
                    installation: null,
                },
            ]);
        } finally {
            await app.destroyAsync();
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
});
