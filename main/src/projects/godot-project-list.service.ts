import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { GodotProjectListResult } from '@shared/contracts';
import { getCurrentAppConfig } from '../config/current-app-config.js';
import {
    getGodotProjectListPaths,
    parseGodotProjectList,
} from './godot-project-list.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectImportService } from './project-import.service.js';

const MAX_LIST_BYTES = 1_048_576;
const MAX_PROJECTS = 100;

/** Reads Godot registration sources without changing them. */
@Injectable()
export class GodotProjectListService {
    /** Creates the source reader.
     * @param imports - Existing read-only project inspection boundary.
     */
    constructor(private readonly imports: ProjectImportService) {}

    /** Finds known existing lists for the current user. */
    async discover(): Promise<string[]> {
        const config = getCurrentAppConfig();
        const home = config.e2eFixtures
            ? path.dirname(config.paths.configDir)
            : os.homedir();
        const candidates = getGodotProjectListPaths(
            process.platform,
            home,
            config.e2eFixtures ? {} : process.env,
        );
        const found: string[] = [];
        const seen = new Set<string>();
        for (const candidate of candidates) {
            try {
                // Include unreadable files so the selected source can explain failure.
                if (!(await fs.stat(candidate)).isFile()) continue;
                const canonical = await fs.realpath(candidate);
                if (!seen.has(canonical)) {
                    seen.add(canonical);
                    found.push(candidate);
                }
            } catch {
                /* Missing normal sources are handled by the manual picker. */
            }
        }
        return found;
    }

    /** Reads one reviewed source and inspects its project paths.
     * @param source - Absolute projects.cfg chosen or discovered by the user.
     * @param scanId - Renderer-owned identity for the read response.
     */
    async read(
        source: string,
        scanId: string,
    ): Promise<GodotProjectListResult> {
        const result: GodotProjectListResult = {
            scanId,
            folder: source,
            status: 'failed',
            projects: [],
            inspections: [],
            issues: [],
            omittedIssueCount: 0,
            visitedDirectories: 0,
            visitedEntries: 0,
        };
        if (
            typeof source !== 'string' ||
            !path.isAbsolute(source) ||
            typeof scanId !== 'string' ||
            !/^[\w-]{1,100}$/.test(scanId)
        )
            return result;
        try {
            const handle = await fs.open(source, 'r');
            let text: string;
            try {
                if (!(await handle.stat()).isFile()) return result;
                const buffer = Buffer.alloc(MAX_LIST_BYTES + 1);
                let bytes = 0;
                while (bytes < buffer.length) {
                    const read = await handle.read(
                        buffer,
                        bytes,
                        buffer.length - bytes,
                        null,
                    );
                    if (!read.bytesRead) break;
                    bytes += read.bytesRead;
                }
                if (bytes > MAX_LIST_BYTES) return result;
                text = buffer.subarray(0, bytes).toString('utf8');
            } finally {
                await handle.close();
            }
            const directories = parseGodotProjectList(text);
            const seen = new Set<string>();
            result.status = 'complete';
            for (const directory of directories) {
                let canonical = directory;
                try {
                    canonical = await fs.realpath(directory);
                } catch {
                    /* Retain unavailable registrations for review. */
                }
                const key =
                    process.platform === 'win32'
                        ? canonical.toLowerCase()
                        : canonical;
                if (seen.has(key)) continue;
                seen.add(key);
                if (result.projects.length === MAX_PROJECTS) {
                    result.status = 'limited';
                    break;
                }
                const paths =
                    path.win32.isAbsolute(directory) &&
                    !path.posix.isAbsolute(directory)
                        ? path.win32
                        : path;
                result.projects.push({
                    name: paths.basename(directory) || directory,
                    relativePath: directory,
                    projectFilePath: paths.join(directory, 'project.godot'),
                    detectedEditor: null,
                });
            }
            const inspections = await this.imports.inspectProjectImports(
                result.projects.map((p) => p.projectFilePath),
            );
            result.inspections = inspections.map((inspection, index) => ({
                ...inspection,
                name: inspection.name || result.projects[index].name,
            }));
            for (let i = 0; i < result.projects.length; i++)
                result.projects[i].name = result.inspections[i].name;
            return result;
        } catch {
            return {
                ...result,
                status: 'failed',
                projects: [],
                inspections: [],
            };
        }
    }
}
