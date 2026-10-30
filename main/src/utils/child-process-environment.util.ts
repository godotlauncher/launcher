import path from 'node:path';

const PATH_LIST_KEYS = [
    'PATH',
    'LD_LIBRARY_PATH',
    'XDG_DATA_DIRS',
    'GSETTINGS_SCHEMA_DIR',
    'GTK_PATH',
    'GIO_EXTRA_MODULES',
    'GI_TYPELIB_PATH',
    'QT_PLUGIN_PATH',
    'QT_QPA_PLATFORM_PLUGIN_PATH',
    'QML_IMPORT_PATH',
    'QML2_IMPORT_PATH',
    'GST_PLUGIN_PATH',
    'GST_PLUGIN_PATH_1_0',
    'GST_PLUGIN_SYSTEM_PATH',
    'GST_PLUGIN_SYSTEM_PATH_1_0',
];
const SINGLE_PATH_KEYS = [
    'GTK_EXE_PREFIX',
    'GTK_DATA_PREFIX',
    'GTK_IM_MODULE_FILE',
    'GDK_PIXBUF_MODULE_FILE',
    'GDK_PIXBUF_MODULEDIR',
    'GST_PLUGIN_SCANNER',
    'GST_PLUGIN_SCANNER_1_0',
];

/**
 * Copies the host environment without this AppImage's paths or identity markers.
 * Explicit command overrides are applied afterwards, including deliberate library paths.
 * Complete isolated environments should instead be built from this clean base and
 * passed to executors without inheritance. The parent environment remains unchanged.
 * @param overrides - Intentional command-specific values applied after cleanup.
 * @param inherited - Parent environment to copy, normally the launcher's environment.
 * @param platform - Platform owning the inherited environment.
 * @returns An independent environment suitable for an external process.
 */
export function getExternalProcessEnvironment(
    overrides: NodeJS.ProcessEnv = {},
    inherited: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
    const environment = { ...inherited };
    const appDir = inherited.APPDIR;
    if (
        platform === 'linux' &&
        appDir &&
        path.posix.isAbsolute(appDir) &&
        path.posix.isAbsolute(inherited.APPIMAGE ?? '')
    ) {
        const root = path.posix.normalize(appDir).replace(/\/+$/, '');
        // A malformed root must never cause all absolute host paths to be removed.
        if (root) {
            /** Checks directory ownership without matching similarly named siblings.
             * @param value - One inherited absolute path.
             */
            const isOwnedPath = (value: string): boolean => {
                if (!path.posix.isAbsolute(value)) return false;
                const normalised = path.posix.normalize(value);
                return normalised === root || normalised.startsWith(`${root}/`);
            };
            for (const key of PATH_LIST_KEYS) {
                const value = environment[key];
                if (value === undefined) continue;
                const entries = value.split(':');
                const retained = entries.filter((entry) => !isOwnedPath(entry));
                if (retained.length === entries.length) continue;
                if (retained.length) environment[key] = retained.join(':');
                else delete environment[key];
            }
            // The dynamic loader also accepts spaces between preload entries.
            // Preserve the original value exactly when none belong to the AppImage.
            const preload = environment.LD_PRELOAD;
            if (preload?.split(/[\s:]+/).some(isOwnedPath)) {
                const retained = preload
                    .split(/[\s:]+/)
                    .filter((entry) => entry && !isOwnedPath(entry));
                if (retained.length)
                    environment.LD_PRELOAD = retained.join(':');
                else delete environment.LD_PRELOAD;
            }
            for (const key of SINGLE_PATH_KEYS) {
                if (isOwnedPath(environment[key] ?? ''))
                    delete environment[key];
            }
            for (const key of ['APPIMAGE', 'APPDIR', 'OWD', 'ARGV0']) {
                delete environment[key];
            }
        }
    }
    // Session/display, user paths, .NET configuration and unrelated variables survive.
    return { ...environment, ...overrides };
}
