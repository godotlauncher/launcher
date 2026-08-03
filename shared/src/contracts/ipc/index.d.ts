import type { AppUpdateMessage } from '../app/index.js';
import type { CodeEditorIntegrationSettings } from '../codeEditorIntegration/index.js';
import type { LaunchProjectResult, ProjectDetails } from '../projects/index.js';
import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '../releases/index.js';

export type AppEventMap = {
    'app-updates': AppUpdateMessage;
    'projects-updated': ProjectDetails[];
    'code-editor-integrations-updated': CodeEditorIntegrationSettings[];
    'project-launch-code-editor-warning': {
        project: ProjectDetails;
        result: Extract<LaunchProjectResult, { launched: false }>;
    };
    'releases-updated': InstalledRelease[];
    'release-install-progress': ReleaseInstallProgress;
};
