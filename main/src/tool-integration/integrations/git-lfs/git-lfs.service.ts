import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    GitLfsTrackingPolicy,
    GitLfsTrackingPolicyDescriptor,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from '../../tool-integration.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../git/git.service.js';
import type { GitLfsConfigurationResult } from './git-lfs.types.js';
import {
    GIT_LFS_OPERATION_TIMEOUT_MS,
    GIT_LFS_TOOL_ID,
} from './git-lfs-tool.constants.js';
import { GODOT_GIT_LFS_TRACKING_POLICY } from './git-lfs-tracking-policy.constants.js';

const GIT_LFS_ENV = { LC_ALL: 'C', LANG: 'C' } as const;
const GIT_ATTRIBUTES_FILENAME = '.gitattributes';
const DEFAULT_TEXT_ATTRIBUTES = ['*', 'text=auto', 'eol=lf'] as const;
const LFS_ATTRIBUTES = [
    'filter=lfs',
    'diff=lfs',
    'merge=lfs',
    '-text',
] as const;

@Injectable()
export class GitLfsService {
    /**
     * Creates the Git LFS domain service.
     *
     * @param toolIntegrationService - Validated exact-path tool facade.
     * @param gitService - Repository inspection and scope protection service.
     */
    constructor(
        private readonly toolIntegrationService: ToolIntegrationService,
        private readonly gitService: GitService,
    ) {}

    /**
     * Gets a renderer-safe copy of the canonical Git LFS tracking policy.
     *
     * @returns The policy identifier, display groups, and tracked patterns.
     */
    getTrackingPolicy(): GitLfsTrackingPolicyDescriptor {
        return {
            id: GODOT_GIT_LFS_TRACKING_POLICY.id,
            groups: GODOT_GIT_LFS_TRACKING_POLICY.groups.map((group) => ({
                id: group.id,
                patterns: [...group.patterns],
            })),
        };
    }

    /**
     * Checks whether the validated Git LFS executable is currently available.
     *
     * @returns Whether Git LFS can be executed without mutation.
     */
    async isAvailable(): Promise<boolean> {
        try {
            const result = await this.toolIntegrationService.execute(
                GIT_LFS_TOOL_ID,
                {
                    args: ['--version'],
                    env: GIT_LFS_ENV,
                    timeoutMs: GIT_LFS_OPERATION_TIMEOUT_MS,
                },
            );
            return result.success;
        } catch {
            return false;
        }
    }

    /**
     * Checks whether a runtime value names the canonical tracking policy.
     *
     * @param trackingPolicy - Untrusted policy identifier from Create Project.
     * @returns Whether the policy is supported by this Launcher build.
     */
    supportsTrackingPolicy(
        trackingPolicy: unknown,
    ): trackingPolicy is GitLfsTrackingPolicy {
        return trackingPolicy === GODOT_GIT_LFS_TRACKING_POLICY.id;
    }

    /**
     * Installs and verifies Git LFS in one exact new project repository.
     *
     * @param projectPath - Exact project repository root used as the working directory.
     * @param trackingPolicy - Canonical main-owned policy to configure.
     * @returns Structured configuration, availability, or failure state.
     */
    async configureProjectRepository(
        projectPath: string,
        trackingPolicy: GitLfsTrackingPolicy,
    ): Promise<GitLfsConfigurationResult> {
        if (
            !this.supportsTrackingPolicy(trackingPolicy) ||
            !(await this.isExactStandardRepositoryRoot(projectPath))
        ) {
            return { status: 'failed', stage: 'verify' };
        }

        const installResult = await this.executeConfigurationCommand(
            ['install', '--local'],
            projectPath,
        );
        if (!installResult) {
            return { status: 'failed', stage: 'install' };
        }
        if (!installResult.success) {
            if (
                installResult.reason === 'disabled' ||
                installResult.reason === 'invalid' ||
                installResult.reason === 'unavailable'
            ) {
                return { status: 'unavailable' };
            }
            return { status: 'failed', stage: 'install' };
        }

        if (!(await this.isExactStandardRepositoryRoot(projectPath))) {
            return { status: 'failed', stage: 'verify' };
        }

        const patterns = this.getTrackingPatterns(trackingPolicy);
        const trackResult = await this.executeConfigurationCommand(
            ['track', ...patterns],
            projectPath,
        );
        if (!trackResult) {
            return { status: 'failed', stage: 'track' };
        }
        if (!trackResult.success) {
            if (
                trackResult.reason === 'disabled' ||
                trackResult.reason === 'invalid' ||
                trackResult.reason === 'unavailable'
            ) {
                return { status: 'unavailable' };
            }
            return { status: 'failed', stage: 'track' };
        }

        if (
            !(await this.isExactStandardRepositoryRoot(projectPath)) ||
            !(await this.hasExpectedAttributes(projectPath, patterns))
        ) {
            return { status: 'failed', stage: 'verify' };
        }

        return { status: 'configured', trackingPolicy };
    }

    /**
     * Gets a fresh flattened copy of one supported policy's patterns.
     *
     * @param trackingPolicy - Canonical policy identifier.
     * @returns Every approved pattern in display order.
     */
    private getTrackingPatterns(
        trackingPolicy: GitLfsTrackingPolicy,
    ): string[] {
        if (!this.supportsTrackingPolicy(trackingPolicy)) {
            return [];
        }
        return GODOT_GIT_LFS_TRACKING_POLICY.groups.flatMap((group) => [
            ...group.patterns,
        ]);
    }

    /**
     * Verifies the project is the root of a standard Git work tree.
     *
     * @param projectPath - Project directory to inspect.
     * @returns Whether mutations are scoped to the expected new repository.
     */
    private async isExactStandardRepositoryRoot(
        projectPath: string,
    ): Promise<boolean> {
        try {
            const inspection =
                await this.gitService.inspectRepository(projectPath);
            return (
                inspection.status === 'inside-work-tree' &&
                inspection.isProjectRoot &&
                inspection.kind === 'standard'
            );
        } catch {
            return false;
        }
    }

    /**
     * Runs one shell-free Git LFS command through exact-path revalidation.
     *
     * @param args - Complete command arguments without a shell.
     * @param projectPath - Exact repository working directory.
     * @returns The command result, or null when execution unexpectedly throws.
     */
    private async executeConfigurationCommand(
        args: string[],
        projectPath: string,
    ) {
        try {
            return await this.toolIntegrationService.execute(GIT_LFS_TOOL_ID, {
                args,
                cwd: projectPath,
                env: GIT_LFS_ENV,
                timeoutMs: GIT_LFS_OPERATION_TIMEOUT_MS,
            });
        } catch {
            return null;
        }
    }

    /**
     * Verifies the default text rule and every requested Git LFS rule.
     *
     * @param projectPath - Exact project repository root.
     * @param patterns - Canonical patterns expected in `.gitattributes`.
     * @returns Whether the resulting attributes file contains every rule.
     */
    private async hasExpectedAttributes(
        projectPath: string,
        patterns: readonly string[],
    ): Promise<boolean> {
        try {
            const content = await fs.promises.readFile(
                path.resolve(projectPath, GIT_ATTRIBUTES_FILENAME),
                'utf8',
            );
            const rules = content
                .replaceAll('\r', '')
                .split('\n')
                .map((line) => line.trim().split(/\s+/))
                .filter((tokens) => tokens.length > 1);
            const hasDefaultRule = rules.some(
                (tokens) =>
                    tokens.length === DEFAULT_TEXT_ATTRIBUTES.length &&
                    DEFAULT_TEXT_ATTRIBUTES.every(
                        (attribute, index) => tokens[index] === attribute,
                    ),
            );
            if (!hasDefaultRule) {
                return false;
            }

            return patterns.every((pattern) =>
                rules.some(
                    ([candidate, ...attributes]) =>
                        candidate === pattern &&
                        LFS_ATTRIBUTES.every((attribute) =>
                            attributes.includes(attribute),
                        ),
                ),
            );
        } catch {
            return false;
        }
    }
}
