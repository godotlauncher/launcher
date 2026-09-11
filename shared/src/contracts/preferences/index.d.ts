import type { CodeEditorId } from '../codeEditorIntegration/index.js';

export type LinuxCredentialStoragePreference = 'automatic' | 'gnome-libsecret';

export type LinuxCredentialStorageStatus = {
    startupPreference: LinuxCredentialStoragePreference;
    selectionSource: 'automatic' | 'preference' | 'command-line';
    requestedBackend: string | null;
    activeBackend: string;
    available: boolean;
};

export type CodeEditorDetectedInstallationPreferences = {
    path: string | null;
    version: string | null;
    checked_at: number;
};

export type CodeEditorIntegrationPreferences = {
    is_default?: boolean;
    enabled?: boolean;
    executable_path?: string;
    executable_args?: string;
    detected_installations?: Record<
        string,
        Record<string, CodeEditorDetectedInstallationPreferences>
    >;
};

export type UserPreferences = {
    /** Preferred Projects presentation; older preferences default to Cards. */
    projects_view_mode?: 'cards' | 'list';
    prefs_version: number;
    install_location: string;
    config_location: string;
    projects_location: string;
    post_launch_action: 'none' | 'minimize' | 'close_to_tray';
    auto_check_updates: boolean;
    receive_beta_updates: boolean;
    auto_start: boolean;
    start_in_tray: boolean;
    confirm_project_remove: boolean;
    first_run: boolean;
    windows_enable_symlinks: boolean;
    code_editor_integrations?: Partial<
        Record<CodeEditorId, CodeEditorIntegrationPreferences>
    >;
    linux_credential_storage?: LinuxCredentialStoragePreference;
    language?: string;
    skipped_app_update_version?: string;
};
