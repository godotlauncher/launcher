import { execFile } from 'node:child_process';
import logger from 'electron-log';

type GitCommandResult = {
    success: boolean;
    stdout: string;
};

/**
 * Runs Git directly without invoking a shell.
 *
 * @param args - Arguments passed to the Git executable.
 * @param cwd - Optional working directory for the Git process.
 * @returns The command success state and standard output.
 */
function runGit(args: string[], cwd?: string): Promise<GitCommandResult> {
    return new Promise((resolve) => {
        execFile('git', args, { cwd, windowsHide: true }, (error, stdout) => {
            if (error) {
                logger.error(error);
                resolve({ success: false, stdout: '' });
                return;
            }

            resolve({ success: true, stdout });
        });
    });
}

/**
 * Checks whether Git can be executed.
 *
 * @returns Whether Git is available.
 */
export async function gitExists(): Promise<boolean> {
    return (await runGit(['--version'])).success;
}

/**
 * Sets the effective Git user name and email.
 *
 * @param name - Git user name to set.
 * @param email - Git user email to set.
 * @returns Whether both configuration commands succeeded.
 */
export async function gitConfigSetUser(
    name: string,
    email: string,
): Promise<boolean> {
    const nameResult = await runGit(['config', 'user.name', name]);
    if (!nameResult.success) {
        return false;
    }

    return (await runGit(['config', 'user.email', email])).success;
}

/**
 * Gets the global Git user name and email.
 *
 * @returns The configured name and email, or empty values when either read fails.
 */
export async function gitConfigGetUser(): Promise<{
    name: string;
    email: string;
}> {
    const nameResult = await runGit(['config', '--global', 'user.name']);
    if (!nameResult.success) {
        return { name: '', email: '' };
    }

    const emailResult = await runGit(['config', '--global', 'user.email']);
    if (!emailResult.success) {
        return { name: '', email: '' };
    }

    return {
        name: nameResult.stdout.replace(/\r?\n$/, ''),
        email: emailResult.stdout.replace(/\r?\n$/, ''),
    };
}

/**
 * Sets the effective Git core.autocrlf value.
 *
 * @param autoCrlf - Whether Git should enable automatic CRLF conversion.
 * @returns Whether the configuration command succeeded.
 */
export async function gitConfigSetAutoCrlf(
    autoCrlf: boolean,
): Promise<boolean> {
    return (
        await runGit(['config', 'core.autocrlf', autoCrlf ? 'true' : 'false'])
    ).success;
}

/**
 * Gets the effective Git configuration list.
 *
 * @returns Git configuration output, or an empty string when the command fails.
 */
export async function gitConfig(): Promise<string> {
    const result = await runGit(['config', '--list']);
    return result.success ? result.stdout : '';
}

/**
 * Initializes a Git repository in an existing directory.
 *
 * @param dir - Project directory used as the Git working directory.
 * @returns Whether repository initialization succeeded.
 */
export async function gitInit(dir: string): Promise<boolean> {
    return (await runGit(['init'], dir)).success;
}

/**
 * Stages project files, creates the initial commit, and renames its branch.
 *
 * @param dir - Project directory used as the Git working directory.
 * @returns Whether every initial commit command succeeded.
 */
export async function gitAddAndCommit(dir: string): Promise<boolean> {
    const addResult = await runGit(['add', '.'], dir);
    if (!addResult.success) {
        return false;
    }

    const commitResult = await runGit(['commit', '-m', 'Initial commit'], dir);
    if (!commitResult.success) {
        return false;
    }

    return (await runGit(['branch', '-m', 'main'], dir)).success;
}
