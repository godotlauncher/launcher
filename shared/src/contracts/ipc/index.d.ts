import type { AppUpdateMessage } from '../app/index.js';
import type {
    CodeEditorIntegrationSettings,
    OpenProjectCodeEditorResult,
} from '../codeEditorIntegration/index.js';
import type { ProjectTagsSnapshot } from '../project-tags/index.js';
import type {
    FolderProjectScanProgress,
    LaunchProjectResult,
    ProjectCopyProgress,
    ProjectDetails,
    RemoteProjectImportProgress,
} from '../projects/index.js';
import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '../releases/index.js';

export type AppEventMap = {
    'app-updates': AppUpdateMessage;
    'projects-updated': ProjectDetails[];
    'project-run-failed': {
        project: ProjectDetails;
        reason: 'launch_failed';
        diagnostic?: string;
    };
    'project-copy-progress': ProjectCopyProgress;
    'folder-project-scan-progress': FolderProjectScanProgress;
    'project-tags-updated': ProjectTagsSnapshot;
    'remote-project-import-progress': RemoteProjectImportProgress;
    'code-editor-integrations-updated': CodeEditorIntegrationSettings[];
    'project-launch-code-editor-warning': {
        project: ProjectDetails;
        result: Extract<
            LaunchProjectResult,
            { reason: 'code_editor_unavailable' }
        >;
    };
    'project-code-editor-open-failed': Extract<
        OpenProjectCodeEditorResult,
        { success: false }
    >;
    'releases-updated': InstalledRelease[];
    'release-install-progress': ReleaseInstallProgress;
};
