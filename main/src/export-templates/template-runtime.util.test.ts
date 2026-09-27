import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readImportedTemplates } from './imported-templates.store.js';
import {
    areTemplateConnectionsActive,
    areTemplatesMutating,
    connectEmptyTemplateFolder,
    reserveTemplateOperation,
    setTemplatesMutating,
    templateConnectionStatus,
} from './template-files.util.js';
import { projectOfficialTemplateRoot } from './template-paths.util.js';
import { projectTemplateBuilds } from './template-projection.util.js';
import { connectProjectTemplates } from './template-runtime.util.js';
import { assertTemplateStorageAvailable } from './template-storage.service.js';

vi.mock('node:fs', () => ({
    promises: { unlink: vi.fn(), mkdir: vi.fn(), readdir: vi.fn() },
}));
vi.mock('./template-storage.service.js', () => ({
    assertTemplateStorageAvailable: vi.fn(async () => undefined),
}));
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }));
vi.mock('../config/current-app-config.js', () => ({
    getCurrentAppConfig: () => ({
        e2eFixtures: true,
        paths: { configDir: path.resolve('fixture-config') },
    }),
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    connectEmptyTemplateFolder: vi.fn(),
    templateConnectionStatus: vi.fn(),
}));
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(projectOfficialTemplateRoot).mockImplementation((editor) =>
        path.join(editor, 'editor_data', 'export_templates'),
    );
});

describe('project template connection', () => {
    it('disconnects a custom editor despite a saved import on an unavailable drive', async () => {
        vi.mocked(assertTemplateStorageAvailable).mockImplementation(
            async (kind) => {
                if (kind === 'imported')
                    throw new Error('storage.errors.unavailable');
            },
        );
        await expect(
            connectProjectTemplates(
                path.resolve('editor'),
                { source: 'custom' },
                undefined,
                { '4.4.stable': 'saved-import' },
                '4.4.stable',
            ),
        ).resolves.toBeUndefined();
        expect(assertTemplateStorageAvailable).toHaveBeenCalledWith('journal');
        expect(assertTemplateStorageAvailable).not.toHaveBeenCalledWith(
            'imported',
        );
        expect(readImportedTemplates).not.toHaveBeenCalled();
    });
    it('connects the current Official choice without reading old imported choices', async () => {
        await connectProjectTemplates(
            path.resolve('editor'),
            { source: 'official' },
            undefined,
            { '4.4.stable': 'official', '4.3.stable': 'old-import' },
            '4.4.stable',
        );
        expect(readImportedTemplates).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).toHaveBeenCalledWith(
            path.resolve('editor'),
            path.join(
                path.resolve('fixture-config'),
                'godot',
                'export_templates',
            ),
            { schemaVersion: 1, builds: [] },
            { '4.4.stable': 'official', '4.3.stable': 'old-import' },
            '4.4.stable',
        );
    });
    it('serialises concurrent editor repairs and continues after a failed connection', async () => {
        let finishFirst!: () => void;
        let firstStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            firstStarted = resolve;
        });
        const firstFinished = new Promise<void>((resolve) => {
            finishFirst = resolve;
        });
        vi.mocked(projectTemplateBuilds).mockImplementationOnce(async () => {
            firstStarted();
            await firstFinished;
            throw new Error('connection failed');
        });
        const first = connectProjectTemplates(path.resolve('first'), {
            source: 'official',
        });
        const firstResult = expect(first).rejects.toThrow('connection failed');
        await started;
        const second = connectProjectTemplates(path.resolve('second'), {
            source: 'official',
        });
        expect(projectTemplateBuilds).toHaveBeenCalledOnce();
        finishFirst();
        await firstResult;
        await expect(second).resolves.toBeUndefined();
        expect(projectTemplateBuilds).toHaveBeenCalledTimes(2);
        expect(areTemplateConnectionsActive()).toBe(false);
    });
    it('waits for an existing connection before starting a mutation and prevents new collisions', async () => {
        let finishConnection!: () => void;
        let connectionStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            connectionStarted = resolve;
        });
        vi.mocked(projectTemplateBuilds).mockImplementationOnce(async () => {
            connectionStarted();
            await new Promise<void>((resolve) => {
                finishConnection = resolve;
            });
        });
        const connection = connectProjectTemplates(path.resolve('first'), {
            source: 'official',
        });
        await started;
        let mutationStarted = false;
        const mutation = reserveTemplateOperation().then((release) => {
            mutationStarted = true;
            return release;
        });
        await expect(
            connectProjectTemplates(path.resolve('second'), {
                source: 'official',
            }),
        ).rejects.toThrow('errors.busy');
        expect(mutationStarted).toBe(false);
        finishConnection();
        await connection;
        const release = await mutation;
        try {
            // A nested transaction ending must not release the outer operation.
            setTemplatesMutating(true);
            setTemplatesMutating(false);
            expect(areTemplatesMutating()).toBe(true);
        } finally {
            release();
        }
        expect(areTemplatesMutating()).toBe(false);
    });
    it('reserves connections until imported links are ready and releases after failure', async () => {
        const { projectTemplateBuilds } = await import(
            './template-projection.util.js'
        );
        vi.mocked(projectTemplateBuilds).mockImplementationOnce(async () => {
            expect(areTemplateConnectionsActive()).toBe(true);
            throw new Error('connection failed');
        });
        await expect(
            connectProjectTemplates(
                path.resolve('editor'),
                { source: 'official' },
                'separate',
            ),
        ).rejects.toThrow('connection failed');
        expect(areTemplateConnectionsActive()).toBe(false);
    });
    it('does not touch project links while a library mutation is active', async () => {
        setTemplatesMutating(true);
        try {
            await expect(
                connectProjectTemplates(path.resolve('editor'), {
                    source: 'official',
                }),
            ).rejects.toThrow('errors.busy');
            expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
        } finally {
            setTemplatesMutating(false);
        }
    });
    it.each([
        { folder: 'empty', status: 'local' },
        { folder: 'missing', status: 'missing' },
    ] as const)(
        'does not mutate a $folder custom template folder when templates stay separate',
        async ({ status }) => {
            vi.mocked(templateConnectionStatus).mockResolvedValue(status);

            await connectProjectTemplates(
                path.resolve('editor'),
                { source: 'custom' },
                'separate',
            );

            expect(templateConnectionStatus).not.toHaveBeenCalled();
            expect(fs.promises.unlink).not.toHaveBeenCalled();
            expect(fs.promises.mkdir).not.toHaveBeenCalled();
            expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
        },
    );

    it('no longer honours the old dedicated opt-out for official editors', async () => {
        await connectProjectTemplates(
            path.resolve('editor'),
            { source: 'official' },
            'separate',
        );

        expect(connectEmptyTemplateFolder).toHaveBeenCalled();
    });

    it.each(['missing', 'local'] as const)(
        'keeps an official editor usable when link creation is denied and its folder is %s',
        async (status) => {
            const permission = Object.assign(new Error('permission'), {
                code: 'EPERM',
            });
            vi.mocked(connectEmptyTemplateFolder).mockRejectedValue(permission);
            vi.mocked(projectTemplateBuilds).mockRejectedValue(permission);
            vi.mocked(templateConnectionStatus).mockResolvedValue(status);
            vi.mocked(fs.promises.readdir).mockResolvedValue([]);
            await expect(
                connectProjectTemplates(path.resolve('editor'), {
                    source: 'official',
                }),
            ).resolves.toBeUndefined();
            expect(projectTemplateBuilds).toHaveBeenCalledOnce();
            expect(fs.promises.unlink).not.toHaveBeenCalled();
        },
    );
    it('does not ignore denied link creation over an active imported view', async () => {
        const editor = path.resolve('editor');
        const backing = path.join(
            editor,
            'editor_data',
            'launcher_export_templates',
            'official',
        );
        vi.mocked(projectOfficialTemplateRoot).mockReturnValue(backing);
        vi.mocked(templateConnectionStatus).mockImplementation(async (local) =>
            local === backing ? 'shared' : 'local',
        );
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(projectTemplateBuilds).mockRejectedValue(
            Object.assign(new Error('permission'), { code: 'EPERM' }),
        );
        await expect(
            connectProjectTemplates(editor, { source: 'official' }),
        ).rejects.toThrow('permission');
    });
    it('does not ignore denied link creation for an imported selection', async () => {
        vi.mocked(readImportedTemplates).mockResolvedValue({
            schemaVersion: 1,
            builds: [],
        });
        vi.mocked(templateConnectionStatus).mockResolvedValue('missing');
        vi.mocked(projectTemplateBuilds).mockRejectedValue(
            Object.assign(new Error('permission'), { code: 'EPERM' }),
        );
        await expect(
            connectProjectTemplates(
                path.resolve('editor'),
                { source: 'official' },
                undefined,
                { '4.4.stable': 'saved-import' },
                '4.4.stable',
            ),
        ).rejects.toThrow('permission');
    });
    it('does not ignore denied link creation over a foreign view', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('foreign');
        vi.mocked(projectTemplateBuilds).mockRejectedValue(
            Object.assign(new Error('permission'), { code: 'EPERM' }),
        );
        await expect(
            connectProjectTemplates(path.resolve('editor'), {
                source: 'official',
            }),
        ).rejects.toThrow('permission');
    });
    it('detaches only the shared link when selecting a custom editor', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('shared');
        const editor = path.resolve('editor');
        await connectProjectTemplates(editor, { source: 'custom' });
        expect(fs.promises.unlink).toHaveBeenCalledWith(
            path.join(editor, 'editor_data', 'export_templates'),
        );
        expect(fs.promises.mkdir).toHaveBeenCalledWith(
            path.join(editor, 'editor_data', 'export_templates'),
        );
        expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
    });
    it.each(['local', 'foreign'] as const)(
        'preserves a custom editor with a %s collection',
        async (status) => {
            vi.mocked(templateConnectionStatus).mockResolvedValue(status);
            await connectProjectTemplates(path.resolve('editor'), {
                source: 'custom',
            });
            expect(fs.promises.unlink).not.toHaveBeenCalled();
            expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
        },
    );
    it('does not silently keep custom editor writes connected when detachment fails', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('shared');
        vi.mocked(fs.promises.unlink).mockRejectedValue(
            new Error('permission'),
        );
        await expect(
            connectProjectTemplates(path.resolve('editor'), {
                source: 'custom',
            }),
        ).rejects.toThrow('permission');
    });
});

vi.mock('./imported-templates.store.js', () => ({
    readImportedTemplates: vi.fn(async () => ({
        schemaVersion: 1,
        builds: [],
        defaults: {},
    })),
    resolveImportedTemplate: vi.fn(),
}));
vi.mock('./template-projection.util.js', () => ({
    projectTemplateBuilds: vi.fn(),
    disconnectImportedTemplateView: vi.fn(),
}));

vi.mock('./template-paths.util.js', () => ({
    projectOfficialTemplateRoot: vi.fn(),
}));
