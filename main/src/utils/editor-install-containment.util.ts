import * as fs from 'node:fs';
import * as path from 'node:path';

/** Identifies why a managed editor failed post-extraction validation. */
export class EditorInstallValidationError extends Error {
    /**
     * Creates a managed editor validation error.
     *
     * @param reason - The security boundary that failed.
     * @param message - Diagnostic detail for logs and tests.
     */
    constructor(
        readonly reason: 'outside-install-root' | 'invalid-editor',
        message: string,
    ) {
        super(message);
        this.name = 'EditorInstallValidationError';
    }
}

/**
 * Validates the executable produced by a managed editor extraction.
 *
 * @param installRoot - The managed extraction root.
 * @param editorPath - The expected editor file or macOS application path.
 * @param platform - The target operating system.
 * @returns A promise that completes when the editor is safely contained.
 */
export async function validateExtractedEditor(
    installRoot: string,
    editorPath: string,
    platform: NodeJS.Platform,
): Promise<void> {
    const rootEntry = await fs.promises.lstat(installRoot);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
        throw new EditorInstallValidationError(
            'invalid-editor',
            'Managed editor root must be a real directory',
        );
    }

    const resolvedRoot = await fs.promises.realpath(installRoot);
    const resolvedEditor = await fs.promises.realpath(editorPath);
    assertContained(resolvedRoot, resolvedEditor);

    const editorEntry = await fs.promises.stat(resolvedEditor);
    if (platform === 'darwin') {
        if (!editorEntry.isDirectory()) {
            throw new EditorInstallValidationError(
                'invalid-editor',
                'Expected a macOS editor application directory',
            );
        }

        const executablePath = path.resolve(
            resolvedEditor,
            'Contents',
            'MacOS',
            'Godot',
        );
        const resolvedExecutable = await fs.promises.realpath(executablePath);
        assertContained(resolvedRoot, resolvedExecutable);
        const executable = await fs.promises.stat(resolvedExecutable);
        if (!executable.isFile() || (executable.mode & 0o111) === 0) {
            throw new EditorInstallValidationError(
                'invalid-editor',
                'Expected an executable macOS editor file',
            );
        }
        return;
    }

    if (!editorEntry.isFile()) {
        throw new EditorInstallValidationError(
            'invalid-editor',
            'Expected an editor executable file',
        );
    }
    if (platform === 'linux' && (editorEntry.mode & 0o111) === 0) {
        throw new EditorInstallValidationError(
            'invalid-editor',
            'Expected an executable Linux editor file',
        );
    }
}

/**
 * Proves a resolved path is a child of the resolved install root.
 *
 * @param resolvedRoot - Canonical managed install root.
 * @param resolvedTarget - Canonical filesystem target.
 */
function assertContained(resolvedRoot: string, resolvedTarget: string): void {
    const relative = path.relative(resolvedRoot, resolvedTarget);
    if (
        !relative ||
        path.isAbsolute(relative) ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`)
    ) {
        throw new EditorInstallValidationError(
            'outside-install-root',
            'Extracted editor escapes the managed install root',
        );
    }
}
