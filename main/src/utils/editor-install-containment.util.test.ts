import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    type EditorInstallValidationError,
    validateExtractedEditor,
} from './editor-install-containment.util.js';

const temporaryDirectories: string[] = [];

describe('managed editor containment', () => {
    afterEach(async () => {
        await Promise.all(
            temporaryDirectories.splice(0).map((directory) =>
                fs.promises.rm(directory, {
                    recursive: true,
                    force: true,
                }),
            ),
        );
    });

    it('accepts a regular executable inside the managed root', async () => {
        const root = await createTemporaryDirectory();
        const editorPath = path.join(root, 'Godot');
        await fs.promises.writeFile(editorPath, 'editor', { mode: 0o755 });

        await expect(
            validateExtractedEditor(root, editorPath, 'linux'),
        ).resolves.toBeUndefined();
    });

    it('rejects an editor symlink that resolves outside the managed root', async () => {
        const parent = await createTemporaryDirectory();
        const root = path.join(parent, 'install');
        const outside = path.join(parent, 'outside-editor');
        await fs.promises.mkdir(root);
        await fs.promises.writeFile(outside, 'editor', { mode: 0o755 });
        await fs.promises.symlink(outside, path.join(root, 'Godot'));

        await expect(
            validateExtractedEditor(root, path.join(root, 'Godot'), 'linux'),
        ).rejects.toMatchObject<Partial<EditorInstallValidationError>>({
            reason: 'outside-install-root',
        });
    });

    it('rejects a non-executable Linux editor', async () => {
        const root = await createTemporaryDirectory();
        const editorPath = path.join(root, 'Godot');
        await fs.promises.writeFile(editorPath, 'editor', { mode: 0o644 });

        await expect(
            validateExtractedEditor(root, editorPath, 'linux'),
        ).rejects.toMatchObject<Partial<EditorInstallValidationError>>({
            reason: 'invalid-editor',
        });
    });
});

/**
 * Creates a tracked temporary directory for one test.
 *
 * @returns The absolute temporary directory path.
 */
async function createTemporaryDirectory(): Promise<string> {
    const directory = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'launcher-editor-containment-'),
    );
    temporaryDirectories.push(directory);
    return directory;
}
