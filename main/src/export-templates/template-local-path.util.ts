import path from 'node:path';

/** Checks that a saved recovery location names only the project template child.
 * @param value - Absolute project-local template path from a journal.
 */
export function isLocalTemplatePath(value: string): boolean {
    return (
        path.isAbsolute(value) &&
        path.resolve(value) === value &&
        ((path.basename(value) === 'export_templates' &&
            path.basename(path.dirname(value)) === 'editor_data') ||
            (path.basename(value) === 'official' &&
                path.basename(path.dirname(value)) ===
                    'launcher_export_templates' &&
                path.basename(path.dirname(path.dirname(value))) ===
                    'editor_data'))
    );
}
