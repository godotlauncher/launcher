import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    GitIdentity,
    GitIdentityScope,
    GitRepositoryInspection,
    GitRepositoryKind,
} from '@shared/contracts';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from '../../tool-integration.service.js';
import type {
    ToolExecutionRequest,
    ToolExecutionResult,
    ToolExecutionSession,
} from '../../tool-integration.types.js';
import { normalizeGitRemoteUrl } from './git-remote-url-normalizer.util.js';

const GIT_INSPECTION_TIMEOUT_MS = 5000;
const GIT_INSPECTION_ENV = { LC_ALL: 'C', LANG: 'C' } as const;

export type GitRepositoryInspector = Pick<GitService, 'inspectRepository'>;

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
     * Inspects the Git work tree that contains a project path.
     *
     * For a path that does not exist yet, Git runs from its nearest existing
     * parent so project creation can detect an enclosing repository.
     *
     * @param projectPath - Existing or planned project directory to inspect.
     * @returns A typed repository inspection result.
     */
    async inspectRepository(
        projectPath: string,
    ): Promise<GitRepositoryInspection> {
        const inspector = await this.createRepositoryInspectionSession();
        return inspector.inspectRepository(projectPath);
    }

    /**
     * Creates a repository inspector that validates Git once for a compound scan.
     *
     * @returns A repository inspector bound to one validated Git installation.
     */
    async createRepositoryInspectionSession(): Promise<GitRepositoryInspector> {
        let execute: ToolExecutionSession;
        try {
            execute =
                await this.toolIntegrationService.createExecutionSession('git');
        } catch {
            logger.error('Git command failed unexpectedly');
            return {
                inspectRepository: async () => ({
                    status: 'inspection-failed',
                }),
            };
        }
        return {
            inspectRepository: (projectPath) =>
                this.inspectRepositoryWithSession(projectPath, execute),
        };
    }

    /**
     * Inspects one repository through an existing validated execution session.
     *
     * @param projectPath - Existing or planned project directory to inspect.
     * @param execute - Git execution function validated for this scan.
     * @returns A typed repository inspection result.
     */
    private async inspectRepositoryWithSession(
        projectPath: string,
        execute: ToolExecutionSession,
    ): Promise<GitRepositoryInspection> {
        const inspectionDirectory =
            await this.findInspectionDirectory(projectPath);
        if (!inspectionDirectory) {
            return { status: 'inspection-failed' };
        }

        const requestOptions = {
            env: GIT_INSPECTION_ENV,
            timeoutMs: GIT_INSPECTION_TIMEOUT_MS,
        };
        const inspectionResult = await execute({
            args: [
                'rev-parse',
                '--is-inside-work-tree',
                '--show-toplevel',
                '--show-superproject-working-tree',
            ],
            cwd: inspectionDirectory,
            ...requestOptions,
        });
        if (!inspectionResult.success) {
            if (
                inspectionResult.reason === 'disabled' ||
                inspectionResult.reason === 'invalid' ||
                inspectionResult.reason === 'unavailable'
            ) {
                return { status: 'git-unavailable' };
            }
            if (
                inspectionResult.reason === 'command-failed' &&
                inspectionResult.stderr
                    .toLowerCase()
                    .includes('not a git repository')
            ) {
                return { status: 'not-a-repository' };
            }
            return { status: 'inspection-failed' };
        }
        const [insideWorkTree, rootOutput, superprojectOutput] =
            inspectionResult.stdout.split(/\r?\n/);
        if (insideWorkTree?.trim() !== 'true') {
            return { status: 'not-a-repository' };
        }
        if (!rootOutput?.trim()) {
            return { status: 'inspection-failed' };
        }

        const root = await this.normalizePath(rootOutput.trim());
        const normalizedProjectPath = await this.normalizePath(projectPath);

        let kind: GitRepositoryKind = 'standard';
        if (superprojectOutput?.trim()) {
            kind = 'submodule';
        } else if (await this.isGitFile(path.resolve(root, '.git'))) {
            kind = 'linked-worktree';
        }

        return {
            status: 'inside-work-tree',
            root,
            isProjectRoot: this.pathsEqual(root, normalizedProjectPath),
            kind,
        };
    }

    /**
     * Reads and normalises the local origin visible from a stored project.
     *
     * The project may be at the repository root or nested inside its work tree.
     * Raw origin output is never logged or returned.
     *
     * @param projectPath - Stored project working directory.
     * @returns A token-free canonical HTTPS origin, or null.
     */
    async getNormalizedRemoteOrigin(
        projectPath: string,
    ): Promise<string | null> {
        const result = await this.run(
            [
                'config',
                '--local',
                '--no-includes',
                '--get',
                'remote.origin.url',
            ],
            projectPath,
            false,
            {
                env: GIT_INSPECTION_ENV,
                timeoutMs: GIT_INSPECTION_TIMEOUT_MS,
            },
        );
        if (!result.success) {
            return null;
        }
        return normalizeGitRemoteUrl(this.removeLineTerminator(result.stdout));
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
     * Gets effective Git identity values for a working directory.
     *
     * @param dir - Working directory whose effective configuration is read.
     * @returns The effective name and email, including partial identity.
     */
    async getIdentity(dir: string): Promise<GitIdentity> {
        return this.readIdentity([], dir);
    }

    /**
     * Gets repository-local Git identity values for a working directory.
     *
     * @param dir - Working directory whose local configuration is read.
     * @returns The local name and email, including partial identity.
     */
    async getLocalIdentity(dir: string): Promise<GitIdentity> {
        return this.readIdentity(['--local'], dir);
    }

    /**
     * Sets Git identity for one repository or the global user configuration.
     *
     * @param name - Git user name to set.
     * @param email - Git user email to set.
     * @param scope - Configuration scope to update.
     * @param dir - Project directory required for repository-scoped configuration.
     * @returns Whether both configuration commands succeeded.
     */
    async setIdentity(
        name: string,
        email: string,
        scope: GitIdentityScope,
        dir?: string,
    ): Promise<boolean> {
        const normalizedName = name.trim();
        const normalizedEmail = email.trim();
        if (!normalizedName || !normalizedEmail) {
            return false;
        }
        if (
            scope === 'repository' &&
            (!dir || !(await this.isProjectRepositoryRoot(dir)))
        ) {
            logger.error(
                'Refusing to set repository identity outside the project repository root',
            );
            return false;
        }
        const scopeArgs = scope === 'global' ? ['--global'] : [];
        const cwd = scope === 'repository' ? dir : undefined;
        const nameResult = await this.run(
            ['config', ...scopeArgs, 'user.name', normalizedName],
            cwd,
            false,
        );
        if (!nameResult.success) {
            logger.error('Failed to set Git identity name');
            return false;
        }

        const emailResult = await this.run(
            ['config', ...scopeArgs, 'user.email', normalizedEmail],
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
     * Reads Git identity values independently for one configuration scope.
     *
     * @param scopeArgs - Optional Git configuration scope arguments.
     * @param dir - Working directory used to resolve the configuration.
     * @returns The configured name and email, including partial identity.
     */
    private async readIdentity(
        scopeArgs: string[],
        dir: string,
    ): Promise<GitIdentity> {
        const nameResult = await this.run(
            ['config', ...scopeArgs, '--get', 'user.name'],
            dir,
            false,
        );
        const emailResult = await this.run(
            ['config', ...scopeArgs, '--get', 'user.email'],
            dir,
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
        const inspection = await this.inspectRepository(dir);
        if (inspection.status !== 'not-a-repository') {
            logger.error(
                'Refusing to initialize Git inside an existing work tree',
            );
            return false;
        }
        if (!(await this.run(['init'], dir)).success) {
            return false;
        }
        return await this.isProjectRepositoryRoot(dir);
    }

    /**
     * Renames the current branch to main, including an unborn branch.
     *
     * @param dir - Project directory used as the Git working directory.
     * @returns Whether the branch rename succeeded.
     */
    async renameBranch(dir: string): Promise<boolean> {
        if (!(await this.isProjectRepositoryRoot(dir))) {
            logger.error(
                'Refusing to rename a branch outside the project repository root',
            );
            return false;
        }
        return (await this.run(['branch', '-m', 'main'], dir)).success;
    }

    /**
     * Stages project files and creates the initial commit.
     *
     * @param dir - Project directory used as the Git working directory.
     * @returns Whether every initial commit command succeeded.
     */
    async addAndCommit(dir: string): Promise<boolean> {
        if (!(await this.isProjectRepositoryRoot(dir))) {
            logger.error(
                'Refusing to stage files outside the project repository root',
            );
            return false;
        }
        const addResult = await this.run(['add', '.'], dir);
        if (!addResult.success) {
            return false;
        }

        if (!(await this.isProjectRepositoryRoot(dir))) {
            logger.error(
                'Refusing to commit outside the project repository root',
            );
            return false;
        }

        return (await this.run(['commit', '-m', 'Initial commit'], dir))
            .success;
    }

    /**
     * Checks whether a directory is the root of its current Git work tree.
     *
     * @param dir - Project directory to inspect.
     * @returns Whether the project is exactly the repository root.
     */
    private async isProjectRepositoryRoot(dir: string): Promise<boolean> {
        const inspection = await this.inspectRepository(dir);
        return (
            inspection.status === 'inside-work-tree' && inspection.isProjectRoot
        );
    }

    /**
     * Finds the nearest existing directory that Git can inspect.
     *
     * @param targetPath - Existing or planned project path.
     * @returns The nearest existing directory, or null when none can be read.
     */
    private async findInspectionDirectory(
        targetPath: string,
    ): Promise<string | null> {
        let candidate = path.resolve(targetPath);
        while (true) {
            try {
                const stat = await fs.promises.stat(candidate);
                if (stat.isDirectory()) {
                    return candidate;
                }
                candidate = path.dirname(candidate);
            } catch (error) {
                if (
                    !(error instanceof Error) ||
                    !('code' in error) ||
                    (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')
                ) {
                    return null;
                }
                candidate = path.dirname(candidate);
            }

            const parent = path.dirname(candidate);
            if (parent === candidate) {
                try {
                    return (await fs.promises.stat(candidate)).isDirectory()
                        ? candidate
                        : null;
                } catch {
                    return null;
                }
            }
        }
    }

    /**
     * Normalizes an existing path or resolves a planned path through its
     * nearest real parent directory.
     *
     * @param targetPath - Path to normalize.
     * @returns An absolute path with resolved parent symlinks.
     */
    private async normalizePath(targetPath: string): Promise<string> {
        const resolvedPath = path.resolve(targetPath);
        try {
            return path.normalize(await fs.promises.realpath(resolvedPath));
        } catch {
            const parent = await this.findInspectionDirectory(resolvedPath);
            if (!parent) {
                return path.normalize(resolvedPath);
            }
            const realParent = await fs.promises.realpath(parent);
            return path.normalize(
                path.resolve(realParent, path.relative(parent, resolvedPath)),
            );
        }
    }

    /**
     * Checks whether a repository marker is a file.
     *
     * @param gitPath - Repository marker path.
     * @returns Whether the marker exists as a file.
     */
    private async isGitFile(gitPath: string): Promise<boolean> {
        try {
            return (await fs.promises.stat(gitPath)).isFile();
        } catch {
            return false;
        }
    }

    /**
     * Compares normalized paths using platform case rules.
     *
     * @param left - First path.
     * @param right - Second path.
     * @returns Whether both paths identify the same location.
     */
    private pathsEqual(left: string, right: string): boolean {
        const normalizedLeft = path.normalize(left);
        const normalizedRight = path.normalize(right);
        return process.platform === 'win32'
            ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
            : normalizedLeft === normalizedRight;
    }

    /**
     * Executes Git through its revalidated tool installation.
     *
     * @param args - Arguments passed to Git as separate process arguments.
     * @param cwd - Optional working directory for the Git process.
     * @param logError - Whether command failures should be logged.
     * @param requestOptions - Optional environment and timeout overrides.
     * @returns Structured tool execution output.
     */
    private async run(
        args: readonly string[],
        cwd?: string,
        logError = true,
        requestOptions: Omit<ToolExecutionRequest, 'args' | 'cwd'> = {},
    ): Promise<ToolExecutionResult> {
        try {
            const result = await this.toolIntegrationService.execute('git', {
                args,
                cwd,
                ...requestOptions,
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
