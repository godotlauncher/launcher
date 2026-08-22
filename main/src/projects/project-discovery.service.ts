import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { RemoteDiscoveredProject } from '@shared/contracts';
import {
    getProjectConfigVersionFromParsed,
    getProjectNameFromParsed,
    parseGodotProjectFile,
} from '../utils/godotProject.utils.js';

const MAX_DISCOVERY_DEPTH = 12;
const MAX_DISCOVERY_ENTRIES = 10_000;
const MAX_DISCOVERED_PROJECTS = 100;
const MAX_PROJECT_FILE_BYTES = 1_048_576;
const SKIPPED_DIRECTORIES = new Set(['.git', '.godot', 'node_modules']);

export type ProjectDiscoveryResult =
    | { ok: true; projects: RemoteDiscoveredProject[] }
    | {
          ok: false;
          reason: 'discovery-failed' | 'discovery-limit-exceeded' | 'cancelled';
      };

@Injectable()
export class ProjectDiscoveryService {
    /**
     * Finds valid Godot projects inside one cloned repository.
     *
     * @param repositoryPath - Canonical root of the completed clone.
     * @param signal - Import cancellation signal.
     * @returns Bounded renderer-safe project discoveries or a typed failure.
     */
    async discover(
        repositoryPath: string,
        signal: AbortSignal,
    ): Promise<ProjectDiscoveryResult> {
        let visitedEntries = 0;
        const projects: RemoteDiscoveredProject[] = [];
        const pending: Array<{ directory: string; depth: number }> = [
            { directory: repositoryPath, depth: 0 },
        ];

        try {
            while (pending.length > 0) {
                if (signal.aborted) {
                    return { ok: false, reason: 'cancelled' };
                }
                const current = pending.shift();
                if (!current) {
                    break;
                }
                const entries = await fs.readdir(current.directory, {
                    withFileTypes: true,
                });
                visitedEntries += entries.length;
                if (visitedEntries > MAX_DISCOVERY_ENTRIES) {
                    return {
                        ok: false,
                        reason: 'discovery-limit-exceeded',
                    };
                }

                for (const entry of entries) {
                    if (signal.aborted) {
                        return { ok: false, reason: 'cancelled' };
                    }
                    if (entry.isSymbolicLink()) {
                        continue;
                    }
                    const entryPath = path.join(current.directory, entry.name);
                    if (entry.isDirectory()) {
                        if (SKIPPED_DIRECTORIES.has(entry.name)) {
                            continue;
                        }
                        if (current.depth >= MAX_DISCOVERY_DEPTH) {
                            return {
                                ok: false,
                                reason: 'discovery-limit-exceeded',
                            };
                        }
                        pending.push({
                            directory: entryPath,
                            depth: current.depth + 1,
                        });
                        continue;
                    }
                    if (!entry.isFile() || entry.name !== 'project.godot') {
                        continue;
                    }
                    const project = await this.inspectProject(
                        repositoryPath,
                        entryPath,
                    );
                    if (!project) {
                        continue;
                    }
                    projects.push(project);
                    if (projects.length > MAX_DISCOVERED_PROJECTS) {
                        return {
                            ok: false,
                            reason: 'discovery-limit-exceeded',
                        };
                    }
                }
            }
        } catch {
            return { ok: false, reason: 'discovery-failed' };
        }

        projects.sort((left, right) =>
            left.relativePath.localeCompare(right.relativePath),
        );
        return { ok: true, projects };
    }

    /**
     * Reads and validates one candidate project file without modifying it.
     *
     * @param repositoryPath - Canonical repository root.
     * @param projectFilePath - Candidate project.godot path.
     * @returns A discovery row, or null when the candidate is invalid.
     */
    private async inspectProject(
        repositoryPath: string,
        projectFilePath: string,
    ): Promise<RemoteDiscoveredProject | null> {
        const stat = await fs.lstat(projectFilePath);
        if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size > MAX_PROJECT_FILE_BYTES
        ) {
            return null;
        }
        const parsed = parseGodotProjectFile(
            await fs.readFile(projectFilePath, 'utf8'),
        );
        const name = await getProjectNameFromParsed(parsed);
        const configVersion = await getProjectConfigVersionFromParsed(parsed);
        if (!name || name === 'Unknown' || configVersion !== 5) {
            return null;
        }
        const relativePath =
            path.relative(repositoryPath, path.dirname(projectFilePath)) || '.';
        return { name, relativePath, projectFilePath };
    }
}
