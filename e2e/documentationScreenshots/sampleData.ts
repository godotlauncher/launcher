import type { InstalledRelease, ProjectDetails, ReleaseSummary, UserPreferences } from '@shared';
import type { CachedTool } from './types';
import releasesCache from '../fixtures/releases.json' with { type: 'json' };
import prereleasesCache from '../fixtures/prereleases.json' with { type: 'json' };

export const SAMPLE_INSTALLED_RELEASES: InstalledRelease[] = [
    {
        version: '4.7-stable',
        version_number: 4.7,
        install_path: '/Applications/Godot_4.7',
        editor_path: '/Applications/Godot_4.7/Godot.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2026-06-18T12:06:17Z',
        valid: true,
    },
    {
        version: '4.5.1-stable',
        version_number: 4.5,
        install_path: '/Applications/Godot_4.5.1_dotnet',
        editor_path:
            '/Applications/Godot_4.5.1_dotnet/Godot_mono.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: true,
        prerelease: false,
        config_version: 5,
        published_at: '2025-08-18T17:04:20Z',
        valid: true,
    },
];

export const SAMPLE_CUSTOM_RELEASE: InstalledRelease = {
    version: '4.7.0-custom.1',
    name: 'Acme 4.7 Custom Editor',
    base_version: '4.7',
    flavor: 'gdscript',
    version_number: 4.7,
    install_path: '/Users/docs/Godot/Editors/StudioCustom47',
    editor_path:
        '/Users/docs/Godot/Editors/StudioCustom47/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: true,
    source: 'custom',
    manifest_path:
        '/Users/docs/Godot/Editors/StudioCustom47/godotlauncher-editor-manifest.json',
    managed_by_launcher: false,
};

export const SAMPLE_UNAVAILABLE_RELEASE: InstalledRelease = {
    version: '4.5.1-stable',
    version_number: 4.5,
    install_path: '/Volumes/Archive/Godot_4.5.1',
    editor_path: '/Volumes/Archive/Godot_4.5.1/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: '2025-08-18T17:04:20Z',
    valid: false,
};

export const SAMPLE_UNAVAILABLE_CUSTOM_RELEASE: InstalledRelease = {
    version: '4.3.0-stable',
    name: 'Experimental Fork',
    base_version: '4.3',
    flavor: 'gdscript',
    version_number: 4.3,
    install_path: '/Volumes/Archive/Godot/ExperimentalFork',
    editor_path:
        '/Volumes/Archive/Godot/ExperimentalFork/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: false,
    source: 'custom',
    manifest_path:
        '/Volumes/Archive/Godot/ExperimentalFork/godotlauncher-editor-manifest.json',
    managed_by_launcher: false,
};

export const SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM: InstalledRelease[] = [
    ...SAMPLE_INSTALLED_RELEASES,
    SAMPLE_CUSTOM_RELEASE,
];

export const SAMPLE_INSTALLED_RELEASES_CUSTOM_OVERVIEW: InstalledRelease[] = [
    SAMPLE_INSTALLED_RELEASES[0],
    SAMPLE_CUSTOM_RELEASE,
];

export const SAMPLE_INSTALLED_RELEASES_WITHOUT_LATEST: InstalledRelease[] = [
    SAMPLE_INSTALLED_RELEASES[1],
    SAMPLE_CUSTOM_RELEASE,
];

export const SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE: InstalledRelease[] =
    [
        ...SAMPLE_INSTALLED_RELEASES,
        SAMPLE_CUSTOM_RELEASE,
        SAMPLE_UNAVAILABLE_RELEASE,
        SAMPLE_UNAVAILABLE_CUSTOM_RELEASE,
    ];

export const SAMPLE_EDITOR_RESOLUTION_FALLBACK_RELEASE: InstalledRelease = {
    version: '4.6.2-stable',
    version_number: 4.6,
    install_path: '/Applications/Godot_4.6.2',
    editor_path: '/Applications/Godot_4.6.2/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: '2026-03-18T12:00:00Z',
    valid: true,
};

export const SAMPLE_PROJECT_ICON_PATH =
    'data:image/svg+xml;base64,PHN2ZyBoZWlnaHQ9IjEyOCIgd2lkdGg9IjEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMTI0IiBoZWlnaHQ9IjEyNCIgcng9IjE0IiBmaWxsPSIjMzYzZDUyIiBzdHJva2U9IiMyMTI1MzIiIHN0cm9rZS13aWR0aD0iNCIvPjxnIHRyYW5zZm9ybT0ic2NhbGUoLjEwMSkgdHJhbnNsYXRlKDEyMiAxMjIpIj48ZyBmaWxsPSIjZmZmIj48cGF0aCBkPSJNMTA1IDY3M3YzM3E0MDcgMzU0IDgxNCAwdi0zM3oiLz48cGF0aCBmaWxsPSIjNDc4Y2JmIiBkPSJtMTA1IDY3MyAxNTIgMTRxMTIgMSAxNSAxNGw0IDY3IDEzMiAxMCA4LTYxcTItMTEgMTUtMTVoMTYycTEzIDQgMTUgMTVsOCA2MSAxMzItMTAgNC02N3EzLTEzIDE1LTE0bDE1Mi0xNFY0MjdxMzAtMzkgNTYtODEtMzUtNTktODMtMTA4LTQzIDIwLTgyIDQ3LTQwLTM3LTg4LTY0IDctNTEgOC0xMDItNTktMjgtMTIzLTQyLTI2IDQzLTQ2IDg5LTQ5LTctOTggMC0yMC00Ni00Ni04OS02NCAxNC0xMjMgNDIgMSA1MSA4IDEwMi00OCAyNy04OCA2NC0zOS0yNy04Mi00Ny00OCA0OS04MyAxMDggMjYgNDIgNTYgODF6bTAgMzN2MzljMCAyNzYgODEzIDI3NiA4MTMgMHYtMzlsLTEzNCAxMi01IDY5cS0yIDEwLTE0IDEzbC0xNjIgMTFxLTEyIDAtMTYtMTFsLTEwLTY1SDQ0N2wtMTAgNjVxLTQgMTEtMTYgMTFsLTE2Mi0xMXEtMTItMy0xNC0xM2wtNS02OXoiLz48cGF0aCBkPSJNNDgzIDYwMGMzIDM0IDU1IDM0IDU4IDB2LTg2Yy0zLTM0LTU1LTM0LTU4IDB6Ii8+PGNpcmNsZSBjeD0iNzI1IiBjeT0iNTI2IiByPSI5MCIvPjxjaXJjbGUgY3g9IjI5OSIgY3k9IjUyNiIgcj0iOTAiLz48L2c+PGcgZmlsbD0iIzQxNDA0MiI+PGNpcmNsZSBjeD0iMzA3IiBjeT0iNTMyIiByPSI2MCIvPjxjaXJjbGUgY3g9IjcxNyIgY3k9IjUzMiIgcj0iNjAiLz48L2c+PC9nPjwvc3ZnPg0K';

export const SAMPLE_PROJECTS: ProjectDetails[] = [
    {
        name: 'My-Awesome-game',
        path: '/Users/docs/Godot/Projects/my-awesome-game',
        icon_path: SAMPLE_PROJECT_ICON_PATH,
        version: '4.7-stable',
        version_number: 4.7,
        renderer: 'FORWARD_PLUS',
        editor_settings_path:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot/editor_settings-4.7.tres',
        last_opened: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        open_windowed: false,
        release: SAMPLE_INSTALLED_RELEASES[0],
        launch_path: '/Applications/Godot_4.7/Godot.app/Contents/MacOS/Godot',
        config_version: 5,
        withVSCode: true,
        withGit: true,
        valid: true,
    },
    {
        name: 'My-Other-Game',
        path: '/Users/docs/Godot/Projects/my-other-game',
        icon_path: SAMPLE_PROJECT_ICON_PATH,
        version: '4.5.1-stable',
        version_number: 4.5,
        renderer: 'FORWARD_PLUS',
        editor_settings_path: '/Users/docs/Godot/Projects/my-other-game/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-other-game/.godot/editor_settings-4.5.tres',
        last_opened: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        open_windowed: false,
        release: SAMPLE_INSTALLED_RELEASES[1],
        launch_path:
            '/Applications/Godot_4.5.1_dotnet/Godot_mono.app/Contents/MacOS/Godot',
        config_version: 5,
        withVSCode: true,
        withGit: true,
        valid: true,
    },
    {
        name: 'My-Prototype',
        path: '/Users/docs/Godot/Projects/my-prototype',
        icon_path: SAMPLE_PROJECT_ICON_PATH,
        version: SAMPLE_CUSTOM_RELEASE.version,
        version_number: SAMPLE_CUSTOM_RELEASE.version_number,
        renderer: 'FORWARD_PLUS',
        editor_settings_path: '/Users/docs/Godot/Projects/my-prototype/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-prototype/.godot/editor_settings-4.7.tres',
        last_opened: new Date(Date.now() - 6 * 60 * 60 * 1000),
        open_windowed: false,
        release: SAMPLE_CUSTOM_RELEASE,
        launch_path: SAMPLE_CUSTOM_RELEASE.editor_path,
        config_version: 5,
        withVSCode: true,
        withGit: false,
        valid: true,
    },
];

export const SAMPLE_PROJECT_PROTOTYPE = SAMPLE_PROJECTS[2];

export const SAMPLE_PROJECT_WITH_MISSING_EDITOR: ProjectDetails = {
    name: 'Archive-Prototype',
    path: '/Volumes/Archive/Godot/Projects/archive-prototype',
    icon_path: SAMPLE_PROJECT_ICON_PATH,
    version: SAMPLE_UNAVAILABLE_RELEASE.version,
    version_number: SAMPLE_UNAVAILABLE_RELEASE.version_number,
    renderer: 'FORWARD_PLUS',
    editor_settings_path:
        '/Volumes/Archive/Godot/Projects/archive-prototype/.godot',
    editor_settings_file:
        '/Volumes/Archive/Godot/Projects/archive-prototype/.godot/editor_settings-4.5.tres',
    last_opened: new Date(Date.now() - 12 * 60 * 60 * 1000),
    open_windowed: false,
    release: SAMPLE_UNAVAILABLE_RELEASE,
    launch_path: SAMPLE_UNAVAILABLE_RELEASE.editor_path,
    config_version: 5,
    withVSCode: false,
    withGit: true,
    valid: false,
    invalid_reason: 'missing_editor',
};

export const SAMPLE_PROJECTS_WITH_MISSING_EDITOR: ProjectDetails[] = [
    SAMPLE_PROJECT_WITH_MISSING_EDITOR,
    ...SAMPLE_PROJECTS,
];

export const SAMPLE_RELEASES_CACHE_FILE = releasesCache;

export const SAMPLE_PRERELEASE_CACHE_FILE = prereleasesCache;

export const SAMPLE_AVAILABLE_RELEASES: ReleaseSummary[] =
    SAMPLE_RELEASES_CACHE_FILE.releases;

export const SAMPLE_AVAILABLE_PRERELEASES: ReleaseSummary[] =
    SAMPLE_PRERELEASE_CACHE_FILE.releases;

export const SAMPLE_EDITOR_RESOLUTION_AVAILABLE_RELEASE: ReleaseSummary = {
    version: '4.6.3-stable',
    version_number: 4.6,
    name: '4.6.3-stable',
    published_at: '2026-05-12T12:00:00Z',
    draft: false,
    prerelease: false,
    assets: [],
};

export const SAMPLE_AVAILABLE_RELEASES_WITH_EDITOR_RESOLUTION: ReleaseSummary[] = [
    SAMPLE_EDITOR_RESOLUTION_AVAILABLE_RELEASE,
    ...SAMPLE_AVAILABLE_RELEASES,
];

export const SAMPLE_PREFS: UserPreferences = {
    prefs_version: 3,
    install_location: '/Users/docs/Godot/Editors',
    config_location: '/Users/docs/.gd-launcher',
    projects_location: '/Users/docs/Godot/Projects',
    post_launch_action: 'close_to_tray',
    auto_check_updates: true,
    receive_beta_updates: false,
    auto_start: true,
    start_in_tray: true,
    confirm_project_remove: true,
    first_run: false,
    windows_enable_symlinks: true,
    windows_symlink_win_notify: true,
    vs_code_path: '/Applications/Visual Studio Code.app',
    language: 'system',
};

export function createPreferences(
    overrides: Partial<UserPreferences> = {},
): UserPreferences {
    return {
        ...SAMPLE_PREFS,
        ...overrides,
    };
}

export const DEFAULT_TOOLS: CachedTool[] = [
    { name: 'Git', path: '/usr/bin/git', version: '2.45.0', verified: true },
    {
        name: 'VSCode',
        path: '/Applications/Visual Studio Code.app',
        version: '1.95.0',
        verified: true,
    },
];

export const TOOLS_NO_GIT: CachedTool[] = DEFAULT_TOOLS.filter(
    (tool) => tool.name !== 'Git',
);

export const TOOLS_NO_VSCODE: CachedTool[] = DEFAULT_TOOLS.filter(
    (tool) => tool.name !== 'VSCode',
);

export const TOOLS_NONE: CachedTool[] = [];
