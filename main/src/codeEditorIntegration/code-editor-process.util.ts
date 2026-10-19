import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Dispatches a code editor with literal folder arguments.
 * @param command - Validated provider executable or Windows command wrapper.
 * @param args - Provider arguments and the project folder as separate values.
 */
export async function launchCodeEditorProcess(
    command: string,
    args: string[],
): Promise<void> {
    const windowsWrapper =
        process.platform === 'win32' &&
        path.win32.extname(command).toLowerCase() === '.cmd';
    let executable = command;
    let launchArgs = args;
    let environment: NodeJS.ProcessEnv | undefined;
    if (windowsWrapper) {
        const systemRoot = process.env.SystemRoot;
        if (!systemRoot || !path.win32.isAbsolute(systemRoot))
            throw new Error('Windows system directory is unavailable');
        // Wrappers forward these quoted arguments to a native executable via %*.
        const values = [
            command,
            ...args.map((value) => value.replace(/\\+$/, '$&$&')),
        ];
        if (values.some((value) => /["\r\n\0]/.test(value)))
            throw new Error('Invalid Windows editor path');
        environment = { ...process.env };
        const launchValues = Object.fromEntries(
            values.map((value, index) => [
                `GODOT_LAUNCHER_EDITOR_ARG_${index}`,
                value,
            ]),
        );
        for (const key of Object.keys(environment)) {
            if (Object.hasOwn(launchValues, key.toUpperCase()))
                delete environment[key];
        }
        Object.assign(environment, launchValues);
        executable = path.win32.join(systemRoot, 'System32', 'cmd.exe');
        // CMD expands quoted environment values once; literal paths never form command text.
        const invocation = values
            .map((_, index) => `"%GODOT_LAUNCHER_EDITOR_ARG_${index}%"`)
            .join(' ');
        launchArgs = ['/d', '/e:on', '/v:off', '/s', '/c', `"${invocation}"`];
    }
    await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, launchArgs, {
            detached: true,
            stdio: 'ignore',
            shell: false,
            ...(windowsWrapper
                ? {
                      env: environment,
                      windowsHide: true,
                      windowsVerbatimArguments: true,
                      timeout: 10000,
                  }
                : {}),
        });
        child.once('error', reject);
        if (windowsWrapper) {
            child.once('exit', (code) => {
                child.unref();
                if (code === 0) resolve();
                else reject(new Error('Code editor command wrapper failed'));
            });
        } else {
            child.once('spawn', () => {
                child.unref();
                resolve();
            });
        }
    });
}
