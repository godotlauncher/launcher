import * as fs from 'node:fs';
import path from 'node:path';

/** Returns the project-owned backing storage outside Godot's active template paths.
 * @param editorDirectory - Project editor environment.
 */
export function projectTemplateStorage(editorDirectory: string): string {
    return path.join(
        editorDirectory,
        'editor_data',
        'launcher_export_templates',
    );
}
/** Locates the official collection for a project with or without backing storage.
 * @param editorDirectory - Project editor environment.
 */
export function projectOfficialTemplateRoot(editorDirectory: string): string {
    const saved = path.join(
        projectTemplateStorage(editorDirectory),
        'official',
    );
    try {
        const backing = fs.lstatSync(saved);
        const active = path.join(
            editorDirectory,
            'editor_data',
            'export_templates',
        );
        if (backing.isSymbolicLink()) {
            const current = fs.lstatSync(active, { throwIfNoEntry: false });
            if (current?.isSymbolicLink()) return active;
            if (
                current?.isDirectory() &&
                fs
                    .readdirSync(active)
                    .some(
                        (name) =>
                            !fs
                                .lstatSync(path.join(active, name))
                                .isSymbolicLink(),
                    )
            )
                return active;
        }
        return saved;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return path.join(editorDirectory, 'editor_data', 'export_templates');
    }
}
