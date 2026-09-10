export type TerminalTargetId =
    | 'windows-terminal'
    | 'command-prompt'
    | 'macos-terminal'
    | 'gnome-terminal'
    | 'konsole'
    | 'foot'
    | 'alacritty'
    | 'ghostty'
    | 'kitty';
export type TerminalSelection = 'automatic' | TerminalTargetId;
export type TerminalSummary = {
    enabled: boolean;
    selection: string;
    configurationValid: boolean;
    targets: {
        id: TerminalTargetId;
        displayName: string;
        executablePath: string;
    }[];
    resolvedTargetId: TerminalTargetId | null;
};
export type TerminalLaunchResult =
    | { success: true }
    | {
          success: false;
          reason:
              | 'missing-project'
              | 'missing-directory'
              | 'disabled'
              | 'invalid-configuration'
              | 'unavailable'
              | 'unsupported-directory'
              | 'launch-failed';
      };
export type TerminalBridge = {
    /** Gets supported terminals and the remembered selection. */
    getSummary(): Promise<TerminalSummary>;
    /** Rescans supported terminal installations. */
    rescan(): Promise<TerminalSummary>;
    /**
     * Remembers a compiled terminal target for this operating system.
     * @param selection - Automatic or a supported target identifier.
     */
    selectTarget(selection: TerminalSelection): Promise<TerminalSummary>;
    /**
     * Enables or disables the terminal integration.
     * @param enabled - Whether project terminal launches are allowed.
     */
    setEnabled(enabled: boolean): Promise<TerminalSummary>;
    /**
     * Opens the directory of a known stored project.
     * @param projectPath - Exact project identity in the project store.
     */
    openProject(projectPath: string): Promise<TerminalLaunchResult>;
};
