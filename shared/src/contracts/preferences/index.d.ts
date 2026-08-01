import type { CodeEditorId } from '../codeEditorIntegration/index.js';
import type { CachedTool } from '../tools/index.js';

export type CodeEditorIntegrationPreferences = {
    is_default?: boolean;
    enabled?: boolean;
    executable_path?: string;
    executable_args?: string;
};

export type UserPreferences = {
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
    windows_symlink_win_notify: boolean;
    code_editor_integrations?: Partial<
        Record<CodeEditorId, CodeEditorIntegrationPreferences>
    >;
    language?: string;
    skipped_app_update_version?: string;
    installed_tools?: {
        last_scan: number;
        tools: CachedTool[];
    };
};
