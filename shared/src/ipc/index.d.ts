import type {
    AppUpdateMessage,
    CheckForUpdatesOptions,
    SetAutoStartResult,
} from '../app/index.js';
import type { UserPreferences } from '../preferences/index.js';
import type {
    AddProjectToListResult,
    ChangeProjectEditorResult,
    CreateProjectResult,
    ProjectDetails,
} from '../projects/index.js';
import type {
    InstalledRelease,
    InstallReleaseResult,
    RegisterCustomEngineResult,
    ReleaseSummary,
    RemovedReleaseResult,
} from '../releases/index.js';
import type { CachedTool, InstalledTool } from '../tools/index.js';

export type EventChannelMapping = {
    'get-user-preferences': Promise<UserPreferences>;
    'set-user-preferences': Promise<UserPreferences>;
    'set-auto-start': Promise<SetAutoStartResult>;
    'set-auto-check-updates': Promise<boolean>;
    'set-receive-beta-updates': Promise<boolean>;

    'get-version': Promise<string>;
    'app-updates': AppUpdateMessage;
    'check-updates': Promise<AppUpdateMessage>;

    'open-file-dialog': Promise<Electron.OpenDialogReturnValue>;
    'open-directory-dialog': Promise<Electron.OpenDialogReturnValue>;
    'shell-open-folder': Promise<void>;
    'path-exists': Promise<boolean>;
    'file-exists': Promise<boolean>;
    'ensure-directory': Promise<boolean>;

    'show-project-menu': Promise<void>;
    'show-release-menu': Promise<void>;

    'open-external': Promise<void>;
    'relaunch-app': Promise<void>;
    'install-update-and-restart': Promise<void>;
    'download-app-update': Promise<void>;
    'skip-app-update': Promise<string>;
    'unskip-app-update': Promise<void>;

    'get-available-releases': Promise<ReleaseSummary[]>;
    'get-available-prereleases': Promise<ReleaseSummary[]>;
    'get-installed-releases': Promise<InstalledRelease[]>;
    'install-release': Promise<InstallReleaseResult>;
    'remove-release': Promise<RemovedReleaseResult>;
    'reinstall-release': Promise<InstallReleaseResult>;
    'register-custom-engine': Promise<RegisterCustomEngineResult>;

    'open-editor-project-manager': Promise<void>;
    'check-all-releases-valid': Promise<InstalledRelease[]>;
    'clear-release-cache': Promise<void>;

    'create-project': Promise<CreateProjectResult>;
    'get-projects-details': Promise<ProjectDetails[]>;
    'remove-project': Promise<ProjectDetails[]>;
    'add-project': Promise<AddProjectToListResult>;
    'set-project-editor': Promise<ChangeProjectEditorResult>;
    'launch-project': Promise<void>;
    'check-project-valid': Promise<ProjectDetails>;
    'check-all-projects-valid': Promise<ProjectDetails[]>;

    'get-installed-tools': Promise<InstalledTool[]>;
    'get-cached-tools': Promise<CachedTool[]>;
    'refresh-tool-cache': Promise<CachedTool[]>;

    'projects-updated': ProjectDetails[];
    'releases-updated': InstalledRelease[];

    'get-platform': Promise<string>;
    'get-app-version': Promise<string>;

    'i18n:get-current-language': Promise<string>;
    'i18n:get-available-languages': Promise<string[]>;
    'i18n:get-all-translations': Promise<
        Record<string, Record<string, unknown>>
    >;
    'i18n:change-language': Promise<Record<string, Record<string, unknown>>>;
};

export type { CheckForUpdatesOptions };
