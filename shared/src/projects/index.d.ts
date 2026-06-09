import type { BackendResult } from '../app/index.js';
import type {
    EditorChannel,
    EditorFlavor,
    InstalledRelease,
} from '../releases/index.js';

export type LaunchPath = string;

export type ProjectInvalidReason = 'missing_project_file' | 'missing_editor';

export type ProjectDetails = {
    name: string;
    version: string;
    version_number: number;
    renderer: string;
    path: string;
    editor_settings_path: string;
    editor_settings_file: string;
    last_opened: Date | null;
    open_windowed?: boolean;
    release: InstalledRelease;
    launch_path: string;
    config_version: 4 | 5;
    withVSCode: boolean;
    withGit: boolean;
    valid: boolean;
    invalid_reason?: ProjectInvalidReason;
};

export type CreateProjectResult = BackendResult & {
    projectPath?: string;
    projectDetails?: ProjectDetails;
};

export type ProjectLauncherEditorRequest = {
    channel: EditorChannel;
    flavor: EditorFlavor;
    base_version: string;
    version: string;
};

export type AddProjectOptions =
    | {
          resolution?: undefined;
      }
    | {
          resolution: 'add_missing';
      }
    | {
          resolution: 'use_fallback';
          release: InstalledRelease;
      };

export type AddProjectEditorResolution = {
    requested: ProjectLauncherEditorRequest;
    fallback?: InstalledRelease;
    downloadable?: {
        version: string;
        flavor: EditorFlavor;
        prerelease: boolean;
    };
};

export type AddProjectToListResult = BackendResult & {
    projects?: ProjectDetails[];
    newProject?: ProjectDetails;
    editorResolution?: AddProjectEditorResolution;
    recoveredVSCodeConfigFiles?: string[];
};

export type ChangeProjectEditorResult = BackendResult & {
    projects?: ProjectDetails[];
};

export type SetProjectVSCodeResult = ProjectDetails & {
    recoveredVSCodeConfigFiles?: string[];
};

export type RendererType = {
    5: 'FORWARD_PLUS' | 'MOBILE' | 'COMPATIBLE';
};

export type ProjectConfig = {
    configVersion: keyof RendererType;
    defaultRenderer: RendererType[keyof RendererType];
    resources: { src: string; dst: string }[];
    projectFilename: string;
    editorConfigFilename: (editor_version: number) => string;
    editorConfigFormat: number;
};

export type ProjectDefinition = Map<number, ProjectConfig>;
