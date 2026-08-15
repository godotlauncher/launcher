import { Injectable } from '@mariodebono/di';
import type { GitIdentity, GitIdentityScope } from '@shared/contracts';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from '../../tool-integration.service.js';
import type { ToolExecutionResult } from '../../tool-integration.types.js';

@Injectable()
export class GitService {
    /**
     * Creates the Git domain service.
     *
     * @param toolIntegrationService - Validated command-line tool facade.
     */
    constructor(
        private readonly toolIntegrationService: ToolIntegrationService,
    ) {}

    /**
     * Checks whether Git can be executed.
     *
     * @returns Whether Git is available.
     */
    async exists(): Promise<boolean> {
        return (await this.run(['--version'])).success;
    }

    /**
     * Sets the effective Git user name and email.
     *
     * @param name - Git user name to set.
     * @param email - Git user email to set.
     * @returns Whether both configuration commands succeeded.
     */
    async setUser(name: string, email: string): Promise<boolean> {
        const nameResult = await this.run(
            ['config', 'user.name', name],
            undefined,
            false,
        );
        if (!nameResult.success) {
            logger.error('Failed to set Git user name');
            return false;
        }

        const emailResult = await this.run(
            ['config', 'user.email', email],
            undefined,
            false,
        );
        if (!emailResult.success) {
            logger.error('Failed to set Git user email');
            return false;
        }

        return true;
    }

    /**
     * Gets the global Git user name and email.
     *
     * @returns The configured name and email, or empty values when either read fails.
     */
    async getUser(): Promise<GitIdentity> {
        const nameResult = await this.run(['config', '--global', 'user.name']);
        if (!nameResult.success) {
            return { name: '', email: '' };
        }

        const emailResult = await this.run([
            'config',
            '--global',
            'user.email',
        ]);
        if (!emailResult.success) {
            return { name: '', email: '' };
        }

        return {
            name: this.removeLineTerminator(nameResult.stdout),
            email: this.removeLineTerminator(emailResult.stdout),
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
    async getGlobalIdentity(): Promise<GitIdentity> {
        const nameResult = await this.run(
            ['config', '--global', '--get', 'user.name'],
            undefined,
            false,
        );
        const emailResult = await this.run(
            ['config', '--global', '--get', 'user.email'],
            undefined,
            false,
        );

        return {
            name: nameResult.success
                ? this.removeLineTerminator(nameResult.stdout)
                : '',
            email: emailResult.success
                ? this.removeLineTerminator(emailResult.stdout)
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
    async setIdentity(
        name: string,
        email: string,
        scope: GitIdentityScope,
        dir: string,
    ): Promise<boolean> {
        const scopeArgs = scope === 'global' ? ['--global'] : [];
        const cwd = scope === 'repository' ? dir : undefined;
        const nameResult = await this.run(
            ['config', ...scopeArgs, 'user.name', name],
            cwd,
            false,
        );
        if (!nameResult.success) {
            logger.error('Failed to set Git identity name');
            return false;
        }

        const emailResult = await this.run(
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
    async setAutoCrlf(autoCrlf: boolean): Promise<boolean> {
        return (
            await this.run([
                'config',
                'core.autocrlf',
                autoCrlf ? 'true' : 'false',
            ])
        ).success;
    }

    /**
     * Gets the effective Git configuration list.
     *
     * @returns Git configuration output, or an empty string when the command fails.
     */
    async getConfig(): Promise<string> {
        const result = await this.run(['config', '--list']);
        return result.success ? result.stdout : '';
    }

    /**
     * Initializes a Git repository in an existing directory.
     *
     * @param dir - Project directory used as the Git working directory.
     * @returns Whether repository initialization succeeded.
     */
    async init(dir: string): Promise<boolean> {
        return (await this.run(['init'], dir)).success;
    }

    /**
     * Renames the current branch to main, including an unborn branch.
     *
     * @param dir - Project directory used as the Git working directory.
     * @returns Whether the branch rename succeeded.
     */
    async renameBranch(dir: string): Promise<boolean> {
        return (await this.run(['branch', '-m', 'main'], dir)).success;
    }

    /**
     * Stages project files and creates the initial commit.
     *
     * @param dir - Project directory used as the Git working directory.
     * @returns Whether every initial commit command succeeded.
     */
    async addAndCommit(dir: string): Promise<boolean> {
        const addResult = await this.run(['add', '.'], dir);
        if (!addResult.success) {
            return false;
        }

        return (await this.run(['commit', '-m', 'Initial commit'], dir))
            .success;
    }

    /**
     * Executes Git through its revalidated tool installation.
     *
     * @param args - Arguments passed to Git as separate process arguments.
     * @param cwd - Optional working directory for the Git process.
     * @param logError - Whether command failures should be logged.
     * @returns Structured tool execution output.
     */
    private async run(
        args: readonly string[],
        cwd?: string,
        logError = true,
    ): Promise<ToolExecutionResult> {
        try {
            const result = await this.toolIntegrationService.execute('git', {
                args,
                cwd,
            });
            if (!result.success && logError) {
                logger.error(`Git command failed: ${result.reason}`);
            }
            return result;
        } catch {
            if (logError) {
                logger.error('Git command failed unexpectedly');
            }
            return {
                success: false,
                reason: 'command-failed',
                stdout: '',
                stderr: '',
                exitCode: null,
            };
        }
    }

    /**
     * Removes the line terminator Git appends to a configuration value.
     *
     * @param value - Git standard output to normalize.
     * @returns The output without its final line terminator.
     */
    private removeLineTerminator(value: string): string {
        return value.replace(/\r?\n$/, '');
    }
}
