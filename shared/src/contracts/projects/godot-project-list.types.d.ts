import type { FolderProjectScanResult } from './folder-project-import.types.js';
import type { ProjectImportInspection } from './index.js';

export type GodotProjectListResult = FolderProjectScanResult & {
    inspections: ProjectImportInspection[];
};
