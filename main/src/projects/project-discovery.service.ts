import { type Dirent, promises as fs } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    FolderProjectScanIssue,
    FolderProjectScanProgress,
    FolderProjectScanResult,
    RemoteDetectedProjectEditor,
    RemoteDiscoveredProject,
} from '@shared/contracts';
import {
    getProjectConfigVersionFromParsed,
    getProjectGodotVersionFromParsed,
    getProjectNameFromParsed,
    parseGodotProjectFile,
} from '../utils/godotProject.utils.js';
import { readProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';

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
     * Scans existing folders while retaining valid findings and individual problems.
     * @param folder - Canonical selected scan root.
     * @param signal - Cancellation signal for this scan.
     * @param onProgress - Observer receiving counts without filesystem errors.
     * @returns Partial discoveries and a bounded list of scan problems.
     */
    async scanFolder(
        folder: string,
        signal: AbortSignal,
        onProgress: (
            progress: Omit<FolderProjectScanProgress, 'scanId'>,
        ) => void,
    ): Promise<Omit<FolderProjectScanResult, 'scanId'>> {
        const result: Omit<FolderProjectScanResult, 'scanId'> = {
            folder,
            status: 'complete',
            projects: [],
            issues: [],
            omittedIssueCount: 0,
            visitedDirectories: 0,
            visitedEntries: 0,
        };
        const pending = [{ directory: folder, depth: 0 }];
        /** Records a safe relative-path issue while bounding renderer data.
         * @param entryPath - Failed directory or candidate path.
         * @param reason - Safe problem classification.
         */
        const recordIssue = (
            entryPath: string,
            reason: FolderProjectScanIssue['reason'],
        ) => {
            if (result.issues.length < 100)
                result.issues.push({
                    relativePath: path.relative(folder, entryPath) || '.',
                    reason,
                });
            else result.omittedIssueCount++;
        };
        scan: while (pending.length > 0) {
            if (signal.aborted) {
                result.status = 'cancelled';
                break;
            }
            const current = pending.shift();
            if (!current) break;
            let entries: Dirent[];
            try {
                const stat = await fs.lstat(current.directory);
                if (!stat.isDirectory() || stat.isSymbolicLink()) {
                    recordIssue(current.directory, 'unreadable-folder');
                    if (current.depth === 0) result.status = 'failed';
                    continue;
                }
                entries = await fs.readdir(current.directory, {
                    withFileTypes: true,
                });
            } catch {
                recordIssue(current.directory, 'unreadable-folder');
                if (current.depth === 0) result.status = 'failed';
                continue;
            }
            result.visitedDirectories++;
            for (const entry of entries) {
                if (signal.aborted) {
                    result.status = 'cancelled';
                    break scan;
                }
                result.visitedEntries++;
                if (result.visitedEntries > MAX_DISCOVERY_ENTRIES) {
                    result.status = 'limited';
                    break scan;
                }
                const entryPath = path.join(current.directory, entry.name);
                if (entry.isSymbolicLink()) continue;
                if (entry.isDirectory()) {
                    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
                    if (current.depth >= MAX_DISCOVERY_DEPTH) {
                        result.status = 'limited';
                        recordIssue(entryPath, 'depth-limit');
                    } else
                        pending.push({
                            directory: entryPath,
                            depth: current.depth + 1,
                        });
                } else if (entry.isFile() && entry.name === 'project.godot') {
                    try {
                        const project = await this.inspectProject(
                            folder,
                            entryPath,
                        );
                        if (!project) recordIssue(entryPath, 'invalid-project');
                        else if (
                            result.projects.length >= MAX_DISCOVERED_PROJECTS
                        ) {
                            result.status = 'limited';
                            break scan;
                        } else result.projects.push(project);
                    } catch {
                        recordIssue(entryPath, 'unreadable-project');
                    }
                }
            }
            onProgress({
                visitedDirectories: result.visitedDirectories,
                visitedEntries: result.visitedEntries,
                projectCount: result.projects.length,
            });
        }
        if (signal.aborted) result.status = 'cancelled';
        result.projects.sort((left, right) =>
            left.relativePath.localeCompare(right.relativePath),
        );
        return result;
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
        let savedName: string | undefined;
        try {
            savedName = (
                await readProjectLauncherConfig(path.dirname(projectFilePath))
            )?.launcher.project_name;
        } catch {
            /* Optional metadata falls back to the Godot name. */
        }
        const name = savedName ?? (await getProjectNameFromParsed(parsed));
        const configVersion = await getProjectConfigVersionFromParsed(parsed);
        if (!name || name === 'Unknown' || configVersion !== 5) {
            return null;
        }
        const relativePath =
            path.relative(repositoryPath, path.dirname(projectFilePath)) || '.';
        return {
            name,
            relativePath,
            projectFilePath,
            detectedEditor: await this.detectProjectEditor(
                path.dirname(projectFilePath),
                parsed,
            ),
        };
    }

    /**
     * Resolves the renderer-safe editor requirement for one discovery row.
     *
     * @param projectDirectory - Directory containing project.godot.
     * @param parsedProject - Parsed project.godot content.
     * @returns The exact or inferred editor request, when detectable.
     */
    private async detectProjectEditor(
        projectDirectory: string,
        parsedProject: ReturnType<typeof parseGodotProjectFile>,
    ): Promise<RemoteDetectedProjectEditor | null> {
        try {
            const launcherConfig =
                await readProjectLauncherConfig(projectDirectory);
            if (launcherConfig) {
                return {
                    kind: 'exact',
                    channel: launcherConfig.editor.channel,
                    flavor: launcherConfig.editor.flavor,
                    baseVersion: launcherConfig.editor.base_version,
                    version: launcherConfig.editor.version,
                };
            }
        } catch {
            // Invalid or unreadable optional metadata falls back to project.godot.
        }

        const baseVersion = getProjectGodotVersionFromParsed(parsedProject);
        if (!baseVersion) {
            return null;
        }

        const entries = await fs.readdir(projectDirectory);
        const hasDotNet = entries.some(
            (entry) => entry.endsWith('.csproj') || entry.endsWith('.sln'),
        );
        return {
            kind: 'stable-base',
            channel: 'official',
            flavor: hasDotNet ? 'dotnet' : 'gdscript',
            baseVersion,
        };
    }
}
