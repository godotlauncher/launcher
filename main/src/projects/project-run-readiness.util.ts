import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectDetails, ProjectRunReadiness } from '@shared/contracts';
import { parseGodotProjectFile } from '../utils/godotProject/projectFile.utils.js';
import { resolveBundleExecutable } from './project-terminal-launch.macos.util.js';

type RunTarget =
    | { status: 'ready'; executable: string }
    | { status: Exclude<ProjectRunReadiness['status'], 'ready'> };

/** Checks for a clearly absent main scene without interpreting overrides.
 * @param projectPath - Registered project directory.
 */
async function hasClearlyMissingMainScene(
    projectPath: string,
): Promise<boolean> {
    try {
        const source = await readFile(
            path.join(projectPath, 'project.godot'),
            'utf8',
        );
        const application = parseGodotProjectFile(source).get('application');
        const lines = source
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(
                (line) =>
                    line && !line.startsWith(';') && !line.startsWith('#'),
            );
        if (
            lines.some(
                (line) =>
                    line.startsWith('[') &&
                    !/^\[[^\]]+\](?:\s*[;#].*)?$/.test(line),
            )
        )
            return false;
        const uncertain = lines.some(
            (line) =>
                line.startsWith('run/main_scene.') ||
                line.includes('project_settings_override') ||
                line.startsWith('"'),
        );
        if (uncertain) return false;
        try {
            await stat(path.join(projectPath, 'override.cfg'));
            return false;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                return false;
        }
        const raw = application?.get('run/main_scene');
        const declarations = lines.filter((line) =>
            line.includes('main_scene'),
        );
        if (raw === undefined) return declarations.length === 0;
        if (declarations.length !== 1) return false;
        const scene: unknown = JSON.parse(raw);
        return typeof scene === 'string' && scene.trim() === '';
    } catch {
        // Uncertain configuration is resolved by Godot when the user selects Run.
        return false;
    }
}

/** Checks basic file availability and only a definitely absent main scene.
 * @param project - Authoritative registered project details.
 */
export async function inspectProjectRunReadiness(
    project: ProjectDetails,
): Promise<RunTarget> {
    try {
        if (!(await stat(path.join(project.path, 'project.godot'))).isFile())
            return { status: 'project_unavailable' };
    } catch (error) {
        return {
            status:
                (error as NodeJS.ErrnoException).code === 'ENOENT'
                    ? 'project_unavailable'
                    : 'check_failed',
        };
    }
    let executable: string;
    try {
        executable =
            process.platform === 'darwin' &&
            project.launch_path.toLowerCase().endsWith('.app')
                ? await resolveBundleExecutable(project.launch_path)
                : project.launch_path;
        if (!(await stat(executable)).isFile())
            return { status: 'editor_unavailable' };
        await access(
            executable,
            process.platform === 'win32' ? constants.F_OK : constants.X_OK,
        );
    } catch {
        return { status: 'editor_unavailable' };
    }
    return (await hasClearlyMissingMainScene(project.path))
        ? { status: 'missing_main_scene' }
        : { status: 'ready', executable };
}
