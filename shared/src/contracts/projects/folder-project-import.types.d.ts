import type { RemoteDiscoveredProject } from './remote-project-import.types.js';

export type FolderProjectScanIssue = {
    relativePath: string;
    reason:
        | 'invalid-project'
        | 'unreadable-project'
        | 'unreadable-folder'
        | 'depth-limit';
};

export type FolderProjectScanProgress = {
    scanId: string;
    visitedDirectories: number;
    visitedEntries: number;
    projectCount: number;
};

export type FolderProjectScanResult = {
    scanId: string;
    folder: string;
    status: 'complete' | 'cancelled' | 'limited' | 'failed';
    projects: RemoteDiscoveredProject[];
    issues: FolderProjectScanIssue[];
    omittedIssueCount: number;
    visitedDirectories: number;
    visitedEntries: number;
};
