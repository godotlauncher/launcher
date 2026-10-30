import { describe, expect, it } from 'vitest';
import { getExternalProcessEnvironment } from './child-process-environment.util.js';

const root = '/tmp/.mount_launcher';
const inherited = {
    APPDIR: root,
    APPIMAGE: '/downloads/Godot Launcher.AppImage',
    OWD: '/projects',
    ARGV0: './Godot Launcher.AppImage',
};

describe('external process environment', () => {
    it('removes bundled paths while preserving host paths, order and session values', () => {
        const base = {
            ...inherited,
            PATH: `${root}:${root}/usr/sbin:/home/user/bin:/usr/bin`,
            LD_LIBRARY_PATH: `${root}/usr/lib:/opt/user/lib`,
            XDG_DATA_DIRS: `${root}/usr/share/:/usr/local/share:/usr/share`,
            GSETTINGS_SCHEMA_DIR: `${root}/usr/share/glib-2.0/schemas:/opt/schemas`,
            QT_PLUGIN_PATH: `${root}/plugins:/opt/qt/plugins`,
            GIO_EXTRA_MODULES: `${root}/gio`,
            GTK_PATH: '/opt/gtk',
            GDK_PIXBUF_MODULE_FILE: `${root}/cache/loaders`,
            GST_PLUGIN_SCANNER: '/opt/gstreamer/scanner',
            LD_PRELOAD: `${root}/lib/a.so /opt/user/b.so:libcustom.so`,
            DISPLAY: ':0',
            WAYLAND_DISPLAY: 'wayland-0',
            DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/bus',
            DOTNET_ROOT: '/opt/dotnet',
            CUSTOM: 'keep me',
        };
        const snapshot = { ...base };
        const result = getExternalProcessEnvironment({}, base, 'linux');
        expect(result).toEqual({
            PATH: '/home/user/bin:/usr/bin',
            LD_LIBRARY_PATH: '/opt/user/lib',
            XDG_DATA_DIRS: '/usr/local/share:/usr/share',
            GSETTINGS_SCHEMA_DIR: '/opt/schemas',
            QT_PLUGIN_PATH: '/opt/qt/plugins',
            GTK_PATH: '/opt/gtk',
            GST_PLUGIN_SCANNER: '/opt/gstreamer/scanner',
            LD_PRELOAD: '/opt/user/b.so:libcustom.so',
            DISPLAY: ':0',
            WAYLAND_DISPLAY: 'wayland-0',
            DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/bus',
            DOTNET_ROOT: '/opt/dotnet',
            CUSTOM: 'keep me',
        });
        expect(base).toEqual(snapshot);
    });

    it('compares normalised directory boundaries without removing similar prefixes', () => {
        const result = getExternalProcessEnvironment(
            {},
            {
                ...inherited,
                APPDIR: `${root}/`,
                PATH: `${root}-other/bin:${root}2/lib:${root}/../host/bin:${root}/usr/../lib:${root}/`,
            },
            'linux',
        );
        expect(result.PATH).toBe(
            `${root}-other/bin:${root}2/lib:${root}/../host/bin`,
        );
    });

    it('unsets mount-only search variables instead of creating empty search entries', () => {
        const result = getExternalProcessEnvironment(
            {},
            {
                ...inherited,
                LD_LIBRARY_PATH: `${root}/usr/lib`,
                LD_PRELOAD: `${root}/lib/a.so`,
            },
            'linux',
        );
        expect(result).toEqual({});
    });

    it('preserves unrelated values verbatim, including existing empty path entries', () => {
        const result = getExternalProcessEnvironment(
            {},
            {
                ...inherited,
                PATH: `:/usr/bin::${root}/usr/bin:/opt/bin:`,
                LD_LIBRARY_PATH: '',
                LD_PRELOAD: '/opt/a.so  libb.so',
                CUSTOM_PATH: `${root}/user-value`,
            },
            'linux',
        );
        expect(result).toEqual({
            PATH: ':/usr/bin::/opt/bin:',
            LD_LIBRARY_PATH: '',
            LD_PRELOAD: '/opt/a.so  libb.so',
            CUSTOM_PATH: `${root}/user-value`,
        });
    });

    it('applies intentional command overrides after cleanup', () => {
        const result = getExternalProcessEnvironment(
            {
                LD_LIBRARY_PATH: `${root}/explicit-library`,
                CUSTOM: 'project value',
                REMOVE_ME: undefined,
            },
            {
                ...inherited,
                LD_LIBRARY_PATH: `${root}/usr/lib`,
                CUSTOM: 'host value',
                REMOVE_ME: 'old',
            },
            'linux',
        );
        expect(result).toEqual({
            LD_LIBRARY_PATH: `${root}/explicit-library`,
            CUSTOM: 'project value',
            REMOVE_ME: undefined,
        });
    });

    it.each(['darwin', 'win32'] as const)(
        'leaves %s environment values unchanged',
        (platform) => {
            const base = {
                ...inherited,
                PATH: `${root}/bin`,
                LD_LIBRARY_PATH: `${root}/lib`,
            };
            expect(getExternalProcessEnvironment({}, base, platform)).toEqual(
                base,
            );
            expect(getExternalProcessEnvironment({}, base, platform)).not.toBe(
                base,
            );
        },
    );

    it.each([
        { APPIMAGE: '/launcher.AppImage' },
        { APPDIR: root },
        { APPDIR: '/', APPIMAGE: '/launcher.AppImage' },
        { APPDIR: '/tmp/..', APPIMAGE: '/launcher.AppImage' },
        { APPDIR: 'relative', APPIMAGE: '/launcher.AppImage' },
        { APPDIR: root, APPIMAGE: 'relative' },
    ])(
        'leaves non-AppImage or malformed identities unchanged: %j',
        (markers) => {
            const base = {
                ...markers,
                PATH: '/usr/bin',
                LD_LIBRARY_PATH: '/opt/lib',
            };
            expect(getExternalProcessEnvironment({}, base, 'linux')).toEqual(
                base,
            );
        },
    );
});
