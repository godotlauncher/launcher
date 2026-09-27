import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectDetails } from '@shared/contracts';

/** Experimental process check retained for future use; no template operation calls it.
 * An open editor does not establish whether export templates are in use.
 * Command-line matching also cannot reliably establish that an editor is closed.
 * @param projects - Projects whose selected collections or connections may change.
 */
export async function assertTemplateEditorsClosed(
    projects: ProjectDetails[],
): Promise<void> {
    if (!projects.length) return;
    const command =
        process.platform === 'win32'
            ? ([
                  'powershell.exe',
                  [
                      '-NoProfile',
                      '-NonInteractive',
                      '-Command',
                      'Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine',
                  ],
              ] as const)
            : (['ps', ['-ax', '-o', 'command=']] as const);
    const { stdout } = await promisify(execFile)(command[0], [...command[1]], {
        timeout: 10000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
    });
    const lines = stdout
        .split('\n')
        .filter(
            (line) =>
                /--path(?:\s|=)/.test(line) &&
                /(?:\s-e(?:\s|$)|--editor(?:\s|$))/.test(line),
        );
    for (const project of projects) {
        if (
            lines.some((line) =>
                process.platform === 'win32'
                    ? line.toLowerCase().includes(project.path.toLowerCase())
                    : line.includes(project.path),
            )
        )
            throw new Error('exportTemplates:library.editorRunning');
    }
}
