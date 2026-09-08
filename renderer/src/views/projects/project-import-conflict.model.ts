import type {
    ProjectDetails,
    ProjectImportInspection,
} from '@shared/contracts';

/** Derives the settings directory key used by Launcher.
 * @param name - Proposed Launcher display name.
 */
export function importNameKey(name: string): string {
    let key = name
        .trim()
        .replace(/[<>:"/\\|?*]+/g, '-')
        .replace(/[. ]+$/g, '');
    if (!key || key === '.' || key === '..') key = 'project';
    if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(key))
        key = `_${key}`;
    return key.toLowerCase();
}

/** Normalises a file's containing directory for preflight comparisons.
 * @param value - File or directory path.
 * @param platform - Host platform.
 * @param file - Whether the input names a project file.
 */
export function importPathKey(
    value: string,
    platform?: string,
    file = false,
): string {
    let key = value.replace(/\\/g, '/').replace(/\/+$/, '');
    if (file) key = key.slice(0, key.lastIndexOf('/'));
    const segments: string[] = [];
    for (const segment of key.split('/')) {
        if (segment === '.') continue;
        if (segment === '..' && segments.length > 1) segments.pop();
        else segments.push(segment);
    }
    key = segments.join('/');
    return platform === 'win32' ? key.toLowerCase() : key;
}

/** Finds selected name conflicts and duplicate folders before registration.
 * @param rows - Selected project files and display names.
 * @param existing - Registered projects.
 * @param platform - Host platform.
 */
export function getImportConflicts(
    rows: ProjectImportInspection[],
    existing: Pick<ProjectDetails, 'name' | 'path'>[],
    platform?: string,
): (string | undefined)[] {
    const paths = new Set(existing.map((p) => importPathKey(p.path, platform)));
    const names = new Set(existing.map((p) => importNameKey(p.name)));
    return rows.map((row) => {
        const folder = importPathKey(
            row.directory ?? row.projectFilePath,
            platform,
            !row.directory,
        );
        if (row.registered || paths.has(folder)) return 'folder';
        paths.add(folder);
        if (row.error) return 'invalid';
        if (
            !row.name.trim() ||
            row.name.length > 255 ||
            Array.from(row.name).some(
                (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
            )
        )
            return 'invalid';
        const name = importNameKey(row.name);
        if (names.has(name)) return 'name';
        names.add(name);
        return undefined;
    });
}
