import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    containsCopyPath,
    ProjectCopyAttempt,
    resolveCopySavePath,
    setCopyProjectProperty,
} from './project-copy.util.js';

const platform = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => platform.home,
}));

let root: string;
let sourcePath: string;
let destination: string;
let editorRoot: string;
let controller: AbortController;
let attempt: ProjectCopyAttempt;
const original =
    '; untouched comment\nconfig_version=5\n\n[application]\nconfig/name="Original"\nconfig/features=PackedStringArray("4.4", "GL Compatibility")\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n';

/** Creates a copy attempt with all filesystem work inside the test fixture.
 * @param copySaveData - Whether to copy the fixture save data.
 * @param copyEditorSettings - Whether to include the fixture settings.
 * @param report - Receives cumulative completed source-file counts.
 */
function makeAttempt(
    copySaveData = false,
    copyEditorSettings = true,
    report: (files: number) => void = vi.fn(),
): ProjectCopyAttempt {
    return new ProjectCopyAttempt(
        {
            path: sourcePath,
            editor_settings_file: path.join(root, 'editor.tres'),
            release: { mono: true },
        } as ProjectDetails,
        {
            projectPath: sourcePath,
            copySaveData,
            copyEditorSettings,
            jobId: 'test-copy',
        },
        controller.signal,
        report,
    );
}

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-copy-test-'));
    platform.home = root;
    vi.stubEnv('APPDATA', root);
    vi.stubEnv('XDG_DATA_HOME', root);
    sourcePath = path.join(root, 'source');
    destination = path.join(root, 'copy');
    editorRoot = path.join(root, 'copy-editor');
    controller = new AbortController();
    await fs.mkdir(sourcePath);
    await fs.writeFile(path.join(sourcePath, 'project.godot'), original);
    await fs.writeFile(
        path.join(root, 'editor.tres'),
        '[gd_resource type="EditorSettings" format=3]\n[resource]\ninterface/theme/preset="Light"\n',
    );
    attempt = makeAttempt();
});

afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
});

describe('trimmed project copies', () => {
    it('counts project and save files once without resetting during finalisation', async () => {
        const report = vi.fn();
        const saves = resolveCopySavePath(
            process.platform,
            root,
            process.env,
            'Original',
            false,
            '',
        );
        await fs.mkdir(saves, { recursive: true });
        await fs.writeFile(path.join(saves, 'save.dat'), 'progress');
        await fs.writeFile(path.join(sourcePath, 'scene.tscn'), '[gd_scene]');
        attempt = makeAttempt(true, false, report);
        await attempt.prepare(destination, editorRoot, 'Copy');
        expect(report.mock.calls.map(([files]) => files)).toEqual([1, 2]);
        await attempt.install(destination);
        expect(report.mock.calls.map(([files]) => files)).toEqual([1, 2, 3]);
        await attempt.cleanup(true);
    });

    it('preserves hidden assets, import and UID files, comments and C# identity without carrying Git or cache', async () => {
        for (const directory of ['.git', '.godot', 'assets'])
            await fs.mkdir(path.join(sourcePath, directory));
        for (const filename of [
            '.hidden',
            '.gitignore',
            '.gitattributes',
            'assets/icon.svg.import',
            'script.gd.uid',
            'Original.csproj',
            '.git/config',
            '.godot/cache',
        ])
            await fs.writeFile(path.join(sourcePath, filename), filename);
        await attempt.prepare(destination, editorRoot, 'New Project');
        await attempt.install(destination);
        const content = await fs.readFile(
            path.join(destination, 'project.godot'),
            'utf8',
        );
        expect(content).toContain('config/name="New Project"');
        expect(content).toContain('project/assembly_name="Original"');
        expect(content).toContain('; untouched comment');
        expect(content).toContain(
            'renderer/rendering_method="gl_compatibility"',
        );
        expect(
            await fs.readFile(path.join(destination, 'script.gd.uid'), 'utf8'),
        ).toBe('script.gd.uid');
        expect(
            await fs.readFile(path.join(destination, '.hidden'), 'utf8'),
        ).toBe('.hidden');
        expect(
            await fs.readFile(path.join(sourcePath, 'project.godot'), 'utf8'),
        ).toBe(original);
        await expect(
            fs.lstat(path.join(destination, '.git')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(
            fs.lstat(path.join(destination, '.godot')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await attempt.cleanup(true)).toEqual([]);
        expect(await fs.readdir(root)).not.toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^\.godot-project-copy-/),
            ]),
        );
    });

    it.each(['.gitmodules', 'addon/.git', 'addon/.GIT', 'asset.bin'])(
        'rejects unsupported source %s before creating the final folder',
        async (filename) => {
            await fs.mkdir(path.dirname(path.join(sourcePath, filename)), {
                recursive: true,
            });
            await fs.writeFile(
                path.join(sourcePath, filename),
                filename === 'asset.bin'
                    ? 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 20\n'
                    : 'repository',
            );
            await expect(
                attempt.prepare(destination, editorRoot, 'Copy'),
            ).rejects.toThrow(
                filename === 'asset.bin'
                    ? 'unresolvedLfs'
                    : 'unsupportedSource',
            );
            await expect(fs.lstat(destination)).rejects.toMatchObject({
                code: 'ENOENT',
            });
        },
    );

    it('does not overwrite an empty pre-existing destination', async () => {
        await fs.mkdir(destination);
        await expect(
            attempt.prepare(destination, editorRoot, 'Copy'),
        ).rejects.toThrow('destinationConflict');
        expect(await fs.readdir(destination)).toEqual([]);
    });

    it('rejects a copy nested inside the source', async () => {
        await expect(
            attempt.prepare(path.join(sourcePath, 'copy'), editorRoot, 'Copy'),
        ).rejects.toThrow('overlappingPaths');
    });

    it('rejects a missing destination parent inside the source without creating it', async () => {
        const parent = path.join(sourcePath, 'must-not-create');
        await expect(
            attempt.prepare(path.join(parent, 'copy'), editorRoot, 'Copy'),
        ).rejects.toThrow('overlappingPaths');
        await expect(fs.lstat(parent)).rejects.toMatchObject({
            code: 'ENOENT',
        });
        expect(
            await fs.readFile(path.join(sourcePath, 'project.godot'), 'utf8'),
        ).toBe(original);
    });

    it.each([false, true])(
        'rejects a destination inside source save data before writing when save copying is %s',
        async (copySaves) => {
            const saves = resolveCopySavePath(
                process.platform,
                root,
                process.env,
                'Original',
                false,
                '',
            );
            await fs.mkdir(saves, { recursive: true });
            await fs.writeFile(
                path.join(saves, 'save.dat'),
                'original progress',
            );
            const parent = path.join(saves, 'must-not-create');
            attempt = makeAttempt(copySaves);
            await expect(
                attempt.prepare(path.join(parent, 'Copy'), editorRoot, 'Copy'),
            ).rejects.toThrow('savePathUnsupported');
            expect(await fs.readdir(saves)).toEqual(['save.dat']);
            expect(
                await fs.readFile(path.join(saves, 'save.dat'), 'utf8'),
            ).toBe('original progress');
            await expect(fs.lstat(parent)).rejects.toMatchObject({
                code: 'ENOENT',
            });
        },
    );

    it.each([false, true])(
        'rejects a linked parent into source save data before writing when save copying is %s',
        async (copySaves) => {
            const saves = resolveCopySavePath(
                process.platform,
                root,
                process.env,
                'Original',
                false,
                '',
            );
            await fs.mkdir(saves, { recursive: true });
            await fs.writeFile(
                path.join(saves, 'save.dat'),
                'original progress',
            );
            const link = path.join(root, 'save-link');
            await fs.symlink(
                saves,
                link,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            attempt = makeAttempt(copySaves);
            await expect(
                attempt.prepare(
                    path.join(link, 'new-parent', 'Copy'),
                    editorRoot,
                    'Copy',
                ),
            ).rejects.toThrow('savePathUnsupported');
            expect(await fs.readdir(saves)).toEqual(['save.dat']);
            expect(
                await fs.readFile(path.join(saves, 'save.dat'), 'utf8'),
            ).toBe('original progress');
        },
    );

    it('copies the sanitised project-name save folder when a custom name is empty', async () => {
        await fs.writeFile(
            path.join(sourcePath, 'project.godot'),
            setCopyProjectProperty(
                setCopyProjectProperty(
                    original,
                    'application',
                    'config/name',
                    '"Studio/Game"',
                ),
                'application',
                'config/use_custom_user_dir',
                'true',
            ),
        );
        const saves = resolveCopySavePath(
            process.platform,
            root,
            process.env,
            'Studio-Game',
            true,
            '',
        );
        await fs.mkdir(saves, { recursive: true });
        await fs.writeFile(path.join(saves, 'save.dat'), 'original progress');
        attempt = makeAttempt(true);
        await attempt.prepare(destination, editorRoot, 'Copy');
        await attempt.install(destination);
        const saveDestination = attempt.saveDestination;
        if (!saveDestination) throw new Error('Missing destination save path');
        expect(
            await fs.readFile(path.join(saveDestination, 'save.dat'), 'utf8'),
        ).toBe('original progress');
        expect(await fs.readdir(saves)).toEqual(['save.dat']);
        await attempt.cleanup(true);
    });

    it('does not overwrite a destination created after preflight', async () => {
        await attempt.prepare(destination, editorRoot, 'Copy');
        await fs.mkdir(destination);
        await fs.writeFile(path.join(destination, 'foreign'), 'keep');
        await expect(attempt.install(destination)).rejects.toMatchObject({
            code: 'EEXIST',
        });
        await attempt.cleanup();
        expect(
            await fs.readFile(path.join(destination, 'foreign'), 'utf8'),
        ).toBe('keep');
    });

    it('removes an unchanged cancelled attempt but never the source', async () => {
        await attempt.prepare(destination, editorRoot, 'Copy');
        controller.abort(new Error('cancelled'));
        await expect(attempt.install(destination)).rejects.toThrow('cancelled');
        expect(await attempt.cleanup()).toEqual([]);
        expect(
            await fs.readFile(path.join(sourcePath, 'project.godot'), 'utf8'),
        ).toBe(original);
    });

    it('preserves foreign additions and reports their containing destination during recovery', async () => {
        await attempt.prepare(destination, editorRoot, 'Copy');
        await attempt.install(destination);
        await fs.writeFile(path.join(destination, 'foreign'), 'keep');
        expect(await attempt.cleanup()).toContain(destination);
        expect(
            await fs.readFile(path.join(destination, 'foreign'), 'utf8'),
        ).toBe('keep');
    });

    it('preserves a copied file changed after the attempt recorded it', async () => {
        await attempt.prepare(destination, editorRoot, 'Copy');
        await attempt.install(destination);
        await fs.writeFile(
            path.join(destination, 'project.godot'),
            'edited by another process',
        );
        expect(await attempt.cleanup()).toContain(destination);
        expect(
            await fs.readFile(path.join(destination, 'project.godot'), 'utf8'),
        ).toBe('edited by another process');
    });

    it('reports a retained root if another process removes a recorded child', async () => {
        await attempt.prepare(destination, editorRoot, 'Copy');
        await attempt.install(destination);
        await fs.unlink(path.join(destination, 'project.godot'));
        expect(await attempt.cleanup()).toContain(destination);
        expect((await fs.lstat(destination)).isDirectory()).toBe(true);
    });

    it('decodes names containing equals signs and escapes for save data and C# identity', async () => {
        await fs.writeFile(
            path.join(sourcePath, 'project.godot'),
            `${original.replace(
                'config/name="Original"',
                `config/name=${JSON.stringify('Game=One"Test')}`,
            )}\n[dotnet]\nproject/assembly_name=""\n`,
        );
        await attempt.prepare(destination, editorRoot, 'Copy');
        expect(attempt.saveSource).toBe(
            resolveCopySavePath(
                process.platform,
                root,
                process.env,
                'Game=One"Test',
                false,
                '',
            ),
        );
        expect(attempt.projectFile).toContain(
            `project/assembly_name=${JSON.stringify('Game=One"Test')}`,
        );
        await attempt.cleanup();
    });

    it('preserves the source rendering settings without changing the source', async () => {
        await attempt.prepare(destination, editorRoot, 'Copy');
        expect(attempt.projectFile).toContain(
            '[rendering]\nrenderer/rendering_method="gl_compatibility"\n',
        );
        expect(attempt.projectFile).not.toContain('forward_plus');
        expect(
            await fs.readFile(path.join(sourcePath, 'project.godot'), 'utf8'),
        ).toBe(original);
        await attempt.cleanup();
    });

    it('allows opting out of unreadable editor settings', async () => {
        await fs.writeFile(
            path.join(root, 'editor.tres'),
            'not editor preferences',
        );
        await expect(
            attempt.prepare(destination, editorRoot, 'Copy'),
        ).rejects.toThrow('settingsUnreadable');
        const withoutSettings = makeAttempt(false, false);
        await withoutSettings.prepare(destination, editorRoot, 'Copy');
        expect(withoutSettings.sourceSettings).toBeUndefined();
        await withoutSettings.cleanup();
    });

    it.each([false, true])(
        'keeps a source named GodotLauncher unchanged when copying saves is %s',
        async (copySaves) => {
            await fs.writeFile(
                path.join(sourcePath, 'project.godot'),
                setCopyProjectProperty(
                    setCopyProjectProperty(
                        original,
                        'application',
                        'config/use_custom_user_dir',
                        'true ; source preference',
                    ),
                    'application',
                    'config/custom_user_dir_name',
                    '"GodotLauncher"',
                ),
            );
            const saves = resolveCopySavePath(
                process.platform,
                root,
                process.env,
                'Original',
                true,
                'GodotLauncher',
            );
            await fs.mkdir(saves, { recursive: true });
            await fs.writeFile(
                path.join(saves, 'save.dat'),
                'original progress',
            );
            attempt = makeAttempt(copySaves);
            await attempt.prepare(destination, editorRoot, 'Copy');
            await attempt.install(destination);
            expect(attempt.projectFile).toContain(
                'config/custom_user_dir_name="GodotLauncherCopy-',
            );
            expect(await fs.readdir(saves)).toEqual(['save.dat']);
            expect(attempt.saveDestination?.startsWith(saves + path.sep)).toBe(
                false,
            );
            const target = attempt.saveDestination;
            if (!target) throw new Error('Missing destination');
            expect(await fs.readdir(target)).toEqual(
                copySaves ? ['save.dat'] : [],
            );
            await attempt.cleanup();
            expect(
                await fs.readFile(path.join(saves, 'save.dat'), 'utf8'),
            ).toBe('original progress');
        },
    );

    it('copies custom runtime saves outside project content into an independent location only when requested', async () => {
        await fs.writeFile(
            path.join(sourcePath, 'project.godot'),
            setCopyProjectProperty(
                setCopyProjectProperty(
                    original,
                    'application',
                    'config/use_custom_user_dir',
                    'true',
                ),
                'application',
                'config/custom_user_dir_name',
                '"Studio/Original"',
            ),
        );
        const saves = resolveCopySavePath(
            process.platform,
            root,
            process.env,
            'Original',
            true,
            'Studio/Original',
        );
        await fs.mkdir(saves, { recursive: true });
        await fs.writeFile(path.join(saves, 'save.dat'), 'progress');
        attempt = makeAttempt(true);
        await attempt.prepare(destination, editorRoot, 'Copy');
        await attempt.install(destination);
        const saveDestination = attempt.saveDestination;
        expect(saveDestination).toBeDefined();
        if (!saveDestination) throw new Error('Missing destination save path');
        expect(saveDestination).not.toBe(saves);
        expect(
            await fs.readFile(path.join(saveDestination, 'save.dat'), 'utf8'),
        ).toBe('progress');
        expect(await fs.readFile(path.join(saves, 'save.dat'), 'utf8')).toBe(
            'progress',
        );
        expect(await fs.readdir(destination)).not.toContain('save.dat');
        await attempt.cleanup();
        await expect(fs.lstat(saveDestination)).rejects.toMatchObject({
            code: 'ENOENT',
        });
        expect(await fs.readFile(path.join(saves, 'save.dat'), 'utf8')).toBe(
            'progress',
        );
    });
});

describe('copy path and configuration rules', () => {
    it('uses path segments for overlap rather than a textual prefix', () => {
        expect(
            containsCopyPath(
                path.join(root, 'game'),
                path.join(root, 'game', 'copy'),
            ),
        ).toBe(true);
        expect(
            containsCopyPath(
                path.join(root, 'game'),
                path.join(root, 'game-two'),
            ),
        ).toBe(false);
    });

    it.each(['', '  ', '.'])(
        'uses the sanitised project-name fallback for empty custom name %j',
        (customName) => {
            expect(
                resolveCopySavePath(
                    'linux',
                    root,
                    { XDG_DATA_HOME: root },
                    'Studio/Game',
                    true,
                    customName,
                ),
            ).toBe(path.join(root, 'Studio-Game'));
        },
    );

    it('retains unrelated settings and line endings when inserting a property', () => {
        expect(
            setCopyProjectProperty(
                '[application]\r\nconfig/name="Test"\r\n',
                'application',
                'config/custom_user_dir_name',
                '"Copy"',
            ),
        ).toBe(
            '[application]\r\nconfig/custom_user_dir_name="Copy"\r\nconfig/name="Test"\r\n',
        );
    });
});
