import type { AppUpdateMessage } from '../app/index.js';
import type { ProjectDetails } from '../projects/index.js';
import type {
    InstalledRelease,
    ReleaseInstallProgress,
} from '../releases/index.js';

export type AppEventMap = {
    'app-updates': AppUpdateMessage;
    'projects-updated': ProjectDetails[];
    'releases-updated': InstalledRelease[];
    'release-install-progress': ReleaseInstallProgress;
};
