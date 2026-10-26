import { spawn } from 'node:child_process';
import { Injectable } from '@mariodebono/di';
import type {
    ProjectDetails,
    ProjectRunReadiness,
    RunProjectResult,
} from '@shared/contracts';
import logger from 'electron-log';
import { publishProjectRunFailure } from './project-events.util.js';
import { inspectProjectRunReadiness } from './project-run-readiness.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

const OUTPUT_LIMIT = 16384;

/** Dispatches registered projects and tracks the runtime processes it starts. */
@Injectable()
export class ProjectRunService {
    private readonly active = new Map<string, object>();

    /** Creates the runtime boundary.
     * @param store - Authoritative registered projects.
     */
    constructor(private readonly store: ProjectsStore) {}

    /** Checks the exact registered project's current run readiness.
     * @param projectPath - Exact stored project directory.
     */
    async inspectProjectRun(projectPath: string): Promise<ProjectRunReadiness> {
        if (this.active.has(projectPath)) return { status: 'already_running' };
        try {
            const project = (await this.store.list()).find(
                (item) => item.path === projectPath,
            );
            return {
                status: project
                    ? (await inspectProjectRunReadiness(project)).status
                    : 'project_unavailable',
            };
        } catch {
            return { status: 'check_failed' };
        }
    }

    /** Dispatches a freshly validated project with its assigned Godot executable.
     * @param projectPath - Exact stored project directory.
     */
    async runProject(projectPath: string): Promise<RunProjectResult> {
        if (this.active.has(projectPath))
            return { launched: false, reason: 'already_running' };
        const ownership = {};
        this.active.set(projectPath, ownership);
        let started = false;
        try {
            const project = (await this.store.list()).find(
                (item) => item.path === projectPath,
            );
            if (!project)
                return { launched: false, reason: 'project_unavailable' };
            const target = await inspectProjectRunReadiness(project);
            if (target.status !== 'ready')
                return { launched: false, reason: target.status };
            await this.start(project, target.executable, ownership);
            started = true;
            return { launched: true };
        } catch {
            return { launched: false, reason: 'launch_failed' };
        } finally {
            if (!started) this.release(projectPath, ownership);
        }
    }

    /** Confirms native dispatch and reports subsequent process failures once.
     * @param project - Authoritative project details.
     * @param executable - Executable validated by the readiness check.
     * @param ownership - Identity used to release only this process's guard.
     */
    private start(
        project: ProjectDetails,
        executable: string,
        ownership: object,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const args = ['--path', project.path];
            // Ignore broken output pipes after the launcher quits. exec preserves
            // the game's PID, and quoted positional arguments keep paths literal.
            const child = spawn(
                process.platform === 'win32' ? executable : '/bin/sh',
                process.platform === 'win32'
                    ? args
                    : [
                          '-c',
                          'trap "" PIPE; exec "$@"',
                          'godot-launcher-run',
                          executable,
                          ...args,
                      ],
                {
                    cwd: project.path,
                    detached: true,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    shell: false,
                    windowsHide: true,
                },
            );
            let spawned = false;
            let failed = false;
            let output = '';
            /** Reports a native or Godot-reported error once per runtime.
             * @param diagnostic - Optional error line captured from Godot.
             */
            const reportFailure = (diagnostic?: string) => {
                if (failed) return;
                failed = true;
                if (output) logger.warn('Godot runtime failed', output);
                output = '';
                if (spawned) publishProjectRunFailure(project, diagnostic);
                else reject(new Error('Godot runtime could not be started'));
            };
            /** Reports a completed or bounded Godot diagnostic line.
             * @param line - One line from a single output stream.
             */
            const reportLine = (line: string) => {
                const diagnostic = line
                    .trim()
                    .match(/^(?:SCRIPT ERROR|ERROR|Error):.*$/)?.[0];
                if (diagnostic) reportFailure(diagnostic.slice(0, 2000));
            };
            for (const stream of [child.stdout, child.stderr]) {
                let pending = '';
                stream?.setEncoding('utf8');
                /** Frames each stream independently and caps incomplete lines.
                 * @param chunk - UTF-8 output received from Godot.
                 */
                const capture = (chunk: string) => {
                    output = (output + chunk).slice(-OUTPUT_LIMIT);
                    const lines = (pending + chunk).split('\n');
                    pending = (lines.pop() ?? '').slice(0, OUTPUT_LIMIT);
                    for (const line of lines) reportLine(line);
                    if (pending.length === OUTPUT_LIMIT) reportLine(pending);
                };
                /** Flushes a final diagnostic that has no trailing newline. */
                const flush = () => {
                    reportLine(pending);
                    pending = '';
                };
                stream?.on('data', capture);
                stream?.once('end', flush);
                stream?.once('close', flush);
            }
            child.once('error', () => {
                this.release(project.path, ownership);
                reportFailure();
            });
            child.once('exit', () => {
                this.release(project.path, ownership);
            });
            child.once('close', (code, signal) => {
                if (code !== 0 || signal !== null) reportFailure();
                output = '';
            });
            child.once('spawn', () => {
                spawned = true;
                child.unref();
                // Native pipe sockets otherwise keep Electron alive after child.unref().
                for (const stream of [child.stdout, child.stderr]) {
                    (
                        stream as unknown as { unref?: () => void } | null
                    )?.unref?.();
                }
                resolve();
            });
        });
    }

    /** Releases only the launch that currently owns the guard.
     * @param projectPath - Registered project directory.
     * @param ownership - Identity of this launch attempt.
     */
    private release(projectPath: string, ownership: object): void {
        if (this.active.get(projectPath) === ownership)
            this.active.delete(projectPath);
    }
}
