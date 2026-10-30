import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    LaunchProjectOptions,
    LaunchProjectResult,
    ProjectDetails,
    UserPreferences,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import { areTemplatesMutating } from '../export-templates/template-files.util.js';
import { connectProjectTemplates } from '../export-templates/template-runtime.util.js';
import { t } from '../i18n/index.js';
import { getMainWindow, revealMainWindow } from '../mainWindow.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TrayAvailabilityService } from '../services/tray-availability.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalService } from '../tool-integration/integrations/terminal/terminal.service.js';
import { getExternalProcessEnvironment } from '../utils/child-process-environment.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectEditorService } from './project-editor.service.js';
import {
    createMacOSTerminalLaunchScript,
    openMacOSTerminalLaunchScript,
} from './project-terminal-launch.macos.util.js';
import {
    createPosixTerminalLaunchScript,
    removePosixTerminalLaunchScript,
} from './project-terminal-launch.posix.util.js';
import { launchWindowsTerminal } from './project-terminal-launch.windows.util.js';

/** Owns native Godot dispatch and the configured post-launch actions. */
@Injectable()
export class ProjectLaunchService {
    /**
     * Creates the editor launch workflow.
     * @param projectEditors - Project code editor opening boundary.
     * @param trayAvailability - System tray availability.
     * @param terminals - Native terminal launch boundary.
     */
    constructor(
        private readonly projectEditors: ProjectEditorService,
        private readonly trayAvailability: TrayAvailabilityService,
        private readonly terminals: TerminalService,
    ) {}

    /**
     * Dispatches a prepared project and applies post-launch actions after hand-off.
     * @param project - Validated project with its launch state already recorded.
     * @param prefs - User preferences captured before recording the launch.
     * @param options - Launch overrides used by the existing facade.
     */
    async launchProject(
        project: ProjectDetails,
        prefs: Pick<
            UserPreferences,
            'auto_open_code_editor' | 'post_launch_action'
        >,
        options: LaunchProjectOptions = {},
    ): Promise<LaunchProjectResult> {
        if (areTemplatesMutating())
            throw new Error(t('exportTemplates:errors.busy'));
        await connectProjectTemplates(
            path.dirname(project.launch_path),
            project.release,
            project.exportTemplateMode,
            project.exportTemplateBuilds,
            `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}`,
        );
        if (areTemplatesMutating())
            throw new Error(t('exportTemplates:errors.busy'));
        const autoOpenCodeEditor =
            prefs.auto_open_code_editor === true &&
            Boolean(project.codeEditorId) &&
            !options.allowMissingCodeEditor;
        const command = project.launch_path;
        let editor:
            | ChildProcess
            | ChildProcessByStdio<null, null, null>
            | undefined;
        if (process.platform === 'darwin' && project.launch_with_console) {
            const terminalScriptPath = await createMacOSTerminalLaunchScript(
                command,
                project.path,
                Boolean(project.open_windowed),
            );
            try {
                await openMacOSTerminalLaunchScript(terminalScriptPath);
            } catch (error) {
                logger.warn('macOS terminal launch failed', error);
                await removePosixTerminalLaunchScript(terminalScriptPath).catch(
                    (cleanupError: unknown) =>
                        logger.warn(
                            'Failed to remove unused terminal launch script',
                            cleanupError,
                        ),
                );
                throw new Error(t('projects:terminal.errors.launch-failed'));
            }
        } else if (
            process.platform === 'win32' &&
            project.launch_with_console
        ) {
            try {
                await launchWindowsTerminal(
                    command,
                    project.path,
                    Boolean(project.open_windowed),
                    project.release.console_path,
                );
            } catch (error) {
                logger.warn('Windows terminal launch failed', error);
                throw new Error(t('projects:terminal.errors.launch-failed'));
            }
        } else if (
            process.platform === 'linux' &&
            project.launch_with_console
        ) {
            const terminalScriptPath = await createPosixTerminalLaunchScript(
                command,
                project.path,
                Boolean(project.open_windowed),
                'sh',
            );
            try {
                const result = await this.terminals.launchEditorScript(
                    project.path,
                    terminalScriptPath,
                );
                if (!result.success)
                    throw new Error(
                        t(`projects:terminal.errors.${result.reason}`),
                    );
            } catch (error) {
                await removePosixTerminalLaunchScript(terminalScriptPath).catch(
                    (cleanupError: unknown) =>
                        logger.warn(
                            'Failed to remove unused terminal launch script',
                            cleanupError,
                        ),
                );
                throw error;
            }
        } else if (process.platform === 'darwin') {
            const launchArguments = [
                command,
                '--args',
                '--path',
                project.path,
                '-e',
            ];
            if (project.open_windowed) {
                launchArguments.push('-w');
            }
            editor = spawn('open', launchArguments, {
                env: getExternalProcessEnvironment(),
                detached: true,
                stdio: 'ignore',
            });
        } else {
            const launchArguments = ['--path', project.path, '-e'];
            if (project.open_windowed) {
                launchArguments.push('-w');
            }
            editor = spawn(command, launchArguments, {
                env: getExternalProcessEnvironment(),
                detached: true,
                stdio: 'ignore',
            });
        }

        if (editor) {
            if (autoOpenCodeEditor) {
                const child = editor;
                await new Promise<void>((resolve, reject) => {
                    child.once('error', reject);
                    if (process.platform === 'darwin') {
                        child.once('exit', (code) =>
                            code === 0
                                ? resolve()
                                : reject(
                                      new Error(
                                          t(
                                              'projects:terminal.errors.launch-failed',
                                          ),
                                      ),
                                  ),
                        );
                    } else {
                        child.once('spawn', resolve);
                    }
                });
            }
            editor.on('error', (error: Error) => {
                logger.error(`Failed to start process: ${error.message}`);
            });
            editor.on('exit', (code: number, signal: NodeJS.Signals | null) => {
                if (code !== 0 && code !== null) {
                    logger.error(`Editor exited with error code ${code}`);
                    logger.error(editor?.stderr);
                } else if (signal) {
                    logger.error(`Editor was killed by signal: ${signal}`);
                }
            });
            editor.unref();
        }

        const codeEditorResult = autoOpenCodeEditor
            ? await this.projectEditors
                  .openProjectCodeEditor(project.path)
                  .catch(() => ({
                      success: false as const,
                      reason: 'launch-failed' as const,
                      editor: project.codeEditorId ?? undefined,
                  }))
            : undefined;
        if (codeEditorResult && !codeEditorResult.success) {
            revealMainWindow();
            return { launched: true, codeEditorWarning: codeEditorResult };
        }

        const currentMainWindow = getMainWindow();
        switch (prefs.post_launch_action) {
            case 'minimize':
                currentMainWindow?.minimize();
                break;
            case 'close_to_tray':
                if (!(await this.trayAvailability.isAvailable())) {
                    logger.info(
                        'System tray is unavailable; leaving the window visible after project launch',
                    );
                    break;
                }
                currentMainWindow?.hide();
                if (process.platform === 'darwin') {
                    app.dock?.hide();
                    app.setActivationPolicy('accessory');
                }
                break;
        }

        return { launched: true };
    }
}
