import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitSubmoduleService } from './git-submodule.service.js';

describe('GitSubmoduleService', () => {
    let repositoryPath: string;
    let supportDirectory: string;
    const execute = vi.fn();
    const executeStreaming = vi.fn();
    const closeCredential = vi.fn();
    const credentials = {
        openRejecting: vi.fn(async () => ({
            environment: { GIT_ASKPASS: '/attempt/reject-askpass' },
            close: closeCredential,
        })),
    };
    const publicSources = { inspect: vi.fn() };
    const logger = { warn: vi.fn() };

    beforeEach(async () => {
        vi.clearAllMocks();
        repositoryPath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'git-submodule-repository-test-'),
        );
        supportDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'git-submodule-support-test-'),
        );
        publicSources.inspect.mockImplementation(async (url: string) => ({
            ok: true,
            source: {
                canonicalUrl: url,
                suggestedDirectoryName: 'dependency',
                approvedAddresses: ['93.184.216.34'],
            },
        }));
    });

    afterEach(async () => {
        await Promise.all([
            fs.rm(repositoryPath, { recursive: true, force: true }),
            fs.rm(supportDirectory, { recursive: true, force: true }),
        ]);
    });

    it('initialises public HTTPS submodules recursively one level at a time', async () => {
        const childPath = path.join(repositoryPath, 'addons', 'extension');
        await fs.writeFile(
            path.join(repositoryPath, '.gitmodules'),
            '[submodule "extension"]\n',
        );
        execute.mockImplementation(async (_toolId, request) => {
            const nested = request.cwd === childPath;
            const key = request.args.at(-1);
            if (request.args.includes('--name-only')) {
                return {
                    success: true,
                    stdout: nested
                        ? 'submodule.vendor.path\n'
                        : 'submodule.extension.path\n',
                    stderr: '',
                    exitCode: 0,
                };
            }
            const values: Record<string, string> = nested
                ? {
                      'submodule.vendor.path': 'vendor/library',
                      'submodule.vendor.url':
                          'https://example.com/vendor/library.git',
                  }
                : {
                      'submodule.extension.path': 'addons/extension',
                      'submodule.extension.url':
                          'https://example.com/addons/extension.git',
                  };
            return {
                success: true,
                stdout: `${values[String(key)]}\n`,
                stderr: '',
                exitCode: 0,
            };
        });
        executeStreaming.mockImplementation(async (_toolId, request) => {
            const destination =
                request.cwd === repositoryPath
                    ? childPath
                    : path.join(childPath, 'vendor', 'library');
            await fs.mkdir(destination, { recursive: true });
            if (request.cwd === repositoryPath) {
                await fs.writeFile(
                    path.join(destination, '.gitmodules'),
                    '[submodule "vendor"]\n',
                );
            }
            return { success: true, exitCode: 0 };
        });
        const onActivity = vi.fn();
        const service = createService();

        await expect(
            service.initialise({
                repositoryPath,
                supportDirectory,
                signal: new AbortController().signal,
                onActivity,
            }),
        ).resolves.toEqual({ ok: true, initialisedCount: 2 });

        expect(executeStreaming).toHaveBeenCalledTimes(2);
        for (const [, request] of executeStreaming.mock.calls) {
            expect(request.args).not.toContain('--recursive');
            expect(request.args).toContain('credential.interactive=false');
            expect(request.args).toContain(
                'http.curloptResolve=example.com:443:93.184.216.34',
            );
            expect(request.env).toMatchObject({
                GIT_ALLOW_PROTOCOL: 'https',
                GIT_ASKPASS: '/attempt/reject-askpass',
                GIT_CONFIG_NOSYSTEM: '1',
                GIT_PROTOCOL_FROM_USER: '0',
                GIT_TERMINAL_PROMPT: '0',
            });
        }
        expect(onActivity).toHaveBeenCalledWith({
            type: 'initialised',
            path: 'addons/extension/vendor/library',
        });
        expect(closeCredential).toHaveBeenCalledOnce();
    });

    it('stops before Git execution when a submodule URL is unsupported', async () => {
        await fs.writeFile(
            path.join(repositoryPath, '.gitmodules'),
            '[submodule "private"]\n',
        );
        execute.mockImplementation(async (_toolId, request) => {
            const key = request.args.at(-1);
            return request.args.includes('--name-only')
                ? {
                      success: true,
                      stdout: 'submodule.private.path\n',
                      stderr: '',
                      exitCode: 0,
                  }
                : {
                      success: true,
                      stdout:
                          key === 'submodule.private.path'
                              ? 'addons/private\n'
                              : '../private.git\n',
                      stderr: '',
                      exitCode: 0,
                  };
        });
        publicSources.inspect.mockResolvedValueOnce({
            ok: false,
            reason: 'invalid-url',
        });
        const service = createService();

        await expect(
            service.initialise({
                repositoryPath,
                supportDirectory,
                signal: new AbortController().signal,
                onActivity: vi.fn(),
            }),
        ).resolves.toEqual({
            ok: false,
            reason: 'unsupported-submodule',
            path: 'addons/private',
        });

        expect(executeStreaming).not.toHaveBeenCalled();
        expect(closeCredential).toHaveBeenCalledOnce();
    });

    /** Creates the service with test-owned process and network boundaries. */
    function createService(): GitSubmoduleService {
        return new GitSubmoduleService(
            { execute, executeStreaming } as never,
            credentials as never,
            publicSources as never,
            logger as never,
        );
    }
});
