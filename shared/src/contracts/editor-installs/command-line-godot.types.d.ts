/** Identifies the installation selected for the plain godot command. */
export type CommandLineGodotSelection = {
    version: string;
    mono: boolean;
    editorPath: string;
};

/** Reports command registration independently of project editor preferences. */
export type CommandLineGodotState = {
    selection: CommandLineGodotSelection | null;
    binDirectory: string;
};

/** Reports selection, PATH setup changes and any command taking precedence. */
export type CommandLineGodotResult = CommandLineGodotState & {
    conflict: string | null;
    pathChanged: boolean;
};
