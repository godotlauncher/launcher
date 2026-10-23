import path from 'node:path';

/** Resolves ordinary Godot project-list candidates without searching the disk.
 * @param platform - Host desktop platform.
 * @param home - Current user's home directory.
 * @param env - Environment visible to the launcher.
 */
export function getGodotProjectListPaths(
    platform: NodeJS.Platform,
    home: string,
    env: NodeJS.ProcessEnv,
): string[] {
    if (platform === 'win32') {
        const root =
            env.APPDATA && path.win32.isAbsolute(env.APPDATA)
                ? env.APPDATA
                : path.win32.join(home, 'AppData', 'Roaming');
        return [path.win32.join(root, 'Godot', 'projects.cfg')];
    }
    if (platform === 'darwin')
        return [
            path.posix.join(
                home,
                'Library/Application Support/Godot/projects.cfg',
            ),
        ];
    const root =
        env.XDG_DATA_HOME && path.posix.isAbsolute(env.XDG_DATA_HOME)
            ? env.XDG_DATA_HOME
            : path.posix.join(home, '.local/share');
    return [
        ...new Set([
            path.posix.join(root, 'godot/projects.cfg'),
            path.posix.join(
                home,
                '.var/app/org.godotengine.Godot/data/godot/projects.cfg',
            ),
        ]),
    ];
}

/** Reads directory section names from Godot's projects.cfg format.
 * Godot saves section names literally, escaping closing brackets as \].
 * @param text - Bounded UTF-8 source text.
 * @returns Unique absolute directories, or throws for malformed source text.
 */
export function parseGodotProjectList(text: string): string[] {
    const directories = new Set<string>();
    let section = false;
    for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) continue;
        if (line.startsWith('[')) {
            const match = /^\[((?:\\\]|[^\]])+)\]\s*(?:;.*)?$/.exec(line);
            if (!match) throw new Error('Invalid project list section');
            const directory = match[1].replace(/\\\]/g, ']');
            if (
                directory.includes('\0') ||
                (!path.posix.isAbsolute(directory) &&
                    !path.win32.isAbsolute(directory))
            )
                throw new Error('Invalid project list directory');
            directories.add(directory);
            section = true;
        } else if (!section || !/^[\w/]+\s*=/.test(line)) {
            throw new Error('Invalid project list entry');
        }
    }
    return [...directories];
}
