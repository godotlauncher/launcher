export type LaunchPath = string;

export type PublishedReleases = {
    releases: ReleaseSummary[];
    lastPublishDate: Date;
};

export type ReleaseSummary = {
    version: string;
    version_number: number;
    name: string;
    published_at: string | null;
    draft: boolean;
    prerelease: boolean;
    assets: AssetSummary[];
    tag?: string;
};

export type AssetSummary = {
    name: string;
    download_url: string;
    platform_tags: string[];
    mono: boolean;
};

export type CachedTool = {
    name: string;
    path: string;
    version: string | null;
    verified: boolean;
};

export type UserPreferences = {
    prefs_version: number;
    install_location: string;
    config_location: string;
    projects_location: string;
    post_launch_action: 'none' | 'minimize' | 'close_to_tray';
    auto_check_updates: boolean;
    auto_start: boolean;
    start_in_tray: boolean;
    confirm_project_remove: boolean;
    first_run: boolean;
    windows_enable_symlinks: boolean;
    windows_symlink_win_notify: boolean;
    vs_code_path?: string;
    language?: string; // 'system' for auto-detect, or locale code like 'en', 'es', 'fr'
    installed_tools?: {
        last_scan: number; // timestamp
        tools: CachedTool[];
    };
};

export type InstalledRelease = {
    version: string;
    version_number: number;
    install_path: string;
    editor_path: string;
    platform: string;
    arch: string;
    mono: boolean;
    prerelease: boolean;
    config_version: 4 | 5;
    published_at: string | null;
    valid: boolean;
};

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
};

export type BackendResult = {
    success: boolean;
    error?: string;
};

export type InstallReleaseResult = BackendResult & {
    version: string;
    release?: InstalledRelease;
};

export type RemovedReleaseResult = BackendResult & {
    version: string;
    mono: boolean;
    releases: InstalledRelease[];
};

export type CreateProjectResult = BackendResult & {
    projectPath?: string;
    projectDetails?: ProjectDetails;
};

export type AddProjectToListResult = BackendResult & {
    projects?: ProjectDetails[];
    newProject?: ProjectDetails;
};

export type InstalledTool = {
    name: string;
    version: string | null;
    path: string;
};

export type ChangeProjectEditorResult = BackendResult & {
    projects?: ProjectDetails[];
};

export type PromotionClickPayload = {
    id: string;
    externalLink?: string | null;
    expiresAt: string;
};

/**
 * Defines the types of renderers available for Godot Engine config version 5 (godot 4+).
 *
 * @property {('FORWARD_PLUS' | 'MOBILE' | 'COMPATIBLE')} 5 - The renderer options for Godot 4+:
 *   - FORWARD_PLUS: Default renderer with advanced lighting features
 *   - MOBILE: Optimized renderer for mobile devices with limited capabilities
 *   - COMPATIBLE: Renderer designed for compatibility with older hardware
 */
export type RendererType = {
    5: 'FORWARD_PLUS' | 'MOBILE' | 'COMPATIBLE';
};

export type UnsubscribeFunction = () => void;

export type SetAutoStartResult = {
    success: boolean;
    error?: string;
};

export type AppUpdateMessage = {
    type: 'ready' | 'none' | 'error' | 'checking' | 'available' | 'downloading';
    available: boolean;
    downloaded: boolean;
    version?: string;
    message?: string;
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
