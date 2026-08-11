import { execFile } from 'node:child_process';
import type { GitIdentity, GitIdentityScope } from '@shared/contracts';
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
 * @param logError - Whether command failures should be logged.
 * @returns The command success state and standard output.
 */
function runGit(
    args: string[],
    cwd?: string,
    logError = true,
): Promise<GitCommandResult> {
    return new Promise((resolve) => {
        execFile('git', args, { cwd, windowsHide: true }, (error, stdout) => {
            if (error) {
                if (logError) {
                    logger.error(error);
                }
                resolve({ success: false, stdout: '' });
                return;
            }

            resolve({ success: true, stdout });
        });
    });
}

/**
 * Removes the line terminator Git appends to a configuration value.
 *
 * @param value - Git standard output to normalize.
 * @returns The output without its final line terminator.
 */
function removeLineTerminator(value: string): string {
    return value.replace(/\r?\n$/, '');
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
        name: removeLineTerminator(nameResult.stdout),
        email: removeLineTerminator(emailResult.stdout),
    };
}

/**
 * Gets global Git identity values independently.
 *
 * Missing values are expected during Create Project setup, so failed reads
 * return an empty value without logging an error.
 *
 * @returns The configured global name and email, including partial identity.
 */
export async function gitConfigGetGlobalIdentity(): Promise<GitIdentity> {
    const nameResult = await runGit(
        ['config', '--global', '--get', 'user.name'],
        undefined,
        false,
    );
    const emailResult = await runGit(
        ['config', '--global', '--get', 'user.email'],
        undefined,
        false,
    );

    return {
        name: nameResult.success ? removeLineTerminator(nameResult.stdout) : '',
        email: emailResult.success
            ? removeLineTerminator(emailResult.stdout)
            : '',
    };
}

/**
 * Sets Git identity for one repository or the global user configuration.
 *
 * @param name - Git user name to set.
 * @param email - Git user email to set.
 * @param scope - Configuration scope to update.
 * @param dir - Project directory used for repository-scoped configuration.
 * @returns Whether both configuration commands succeeded.
 */
export async function gitConfigSetIdentity(
    name: string,
    email: string,
    scope: GitIdentityScope,
    dir: string,
): Promise<boolean> {
    const scopeArgs = scope === 'global' ? ['--global'] : [];
    const cwd = scope === 'repository' ? dir : undefined;
    const nameResult = await runGit(
        ['config', ...scopeArgs, 'user.name', name],
        cwd,
        false,
    );
    if (!nameResult.success) {
        logger.error('Failed to set Git identity name');
        return false;
    }

    const emailResult = await runGit(
        ['config', ...scopeArgs, 'user.email', email],
        cwd,
        false,
    );
    if (!emailResult.success) {
        logger.error('Failed to set Git identity email');
        return false;
    }

    return true;
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
 * Renames the current branch to main, including an unborn branch.
 *
 * @param dir - Project directory used as the Git working directory.
 * @returns Whether the branch rename succeeded.
 */
export async function gitRenameBranch(dir: string): Promise<boolean> {
    return (await runGit(['branch', '-m', 'main'], dir)).success;
}

/**
 * Stages project files and creates the initial commit.
 *
 * @param dir - Project directory used as the Git working directory.
 * @returns Whether every initial commit command succeeded.
 */
export async function gitAddAndCommit(dir: string): Promise<boolean> {
    const addResult = await runGit(['add', '.'], dir);
    if (!addResult.success) {
        return false;
    }

    return (await runGit(['commit', '-m', 'Initial commit'], dir)).success;
}
