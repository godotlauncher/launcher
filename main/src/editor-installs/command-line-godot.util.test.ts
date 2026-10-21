import type { InstalledRelease } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    createGodotPathBlock,
    createGodotWrapper,
    getCommandLineExecutable,
    quoteShellArgument,
} from './command-line-godot.util.js';

describe('command-line Godot script generation', () => {
    it('quotes literal POSIX paths instead of expanding shell commands', () => {
        expect(quoteShellArgument("/editors/it's $(echo unsafe)/godot")).toBe(
            "'/editors/it'\\''s $(echo unsafe)/godot'",
        );
        expect(() => quoteShellArgument('/editors/godot\nother')).toThrow();
    });

    it('chooses the registered Windows console executable', () => {
        const editor = {
            editor_path: 'C:\\Editors\\Godot.exe',
            console_path: 'C:\\Editors\\Godot_console.exe',
        } as InstalledRelease;
        expect(getCommandLineExecutable(editor, 'win32')).toBe(
            editor.console_path,
        );
        expect(
            getCommandLineExecutable(
                { ...editor, console_path: undefined },
                'win32',
            ),
        ).toBe(editor.console_path);
        expect(
            getCommandLineExecutable(
                { ...editor, source: 'custom', console_path: undefined },
                'win32',
            ),
        ).toBe(editor.editor_path);
    });

    it('targets the macOS bundle executable and leaves standalone custom binaries intact', () => {
        expect(
            getCommandLineExecutable(
                { editor_path: '/Editors/Godot.app' } as InstalledRelease,
                'darwin',
            ),
        ).toBe('/Editors/Godot.app/Contents/MacOS/Godot');
        expect(
            getCommandLineExecutable(
                { editor_path: '/build/godot.custom' } as InstalledRelease,
                'darwin',
            ),
        ).toBe('/build/godot.custom');
    });

    it('keeps Windows literal path characters out of environment expansion', () => {
        const wrapper = createGodotWrapper(
            'C:\\Editors\\100% ! build\\godot.exe',
            'win32',
        );
        expect(wrapper).toContain('"C:\\Editors\\100%% ! build\\godot.exe" %*');
        expect(wrapper).toContain('setlocal DisableDelayedExpansion');
        expect(() =>
            createGodotWrapper('C:\\editors\\bad"name.exe', 'win32'),
        ).toThrow();
    });

    it('sets UTF-8 before reading Windows paths and restores the code page without losing exit status', () => {
        const target = 'C:\\Users\\Jos\u00e9\\Godot\\godot_console.exe';
        const wrapper = createGodotWrapper(target, 'win32');
        expect(wrapper.indexOf('chcp 65001')).toBeLessThan(
            wrapper.indexOf(target),
        );
        expect(wrapper).toContain('set "GODOT_LAUNCHER_EXIT=%errorlevel%"');
        expect(wrapper).toContain('chcp %GODOT_LAUNCHER_CODEPAGE% >nul');
        expect(wrapper).toContain('exit /b %GODOT_LAUNCHER_EXIT%');
        expect(wrapper).toContain('set "GODOT_LAUNCHER_EXIT=127"');
    });

    it('does not use project-local settings or detach terminal IO', () => {
        const wrapper = createGodotWrapper('/Editors/godot', 'linux');
        expect(wrapper).toContain('exec \'/Editors/godot\' "$@"');
        expect(wrapper).not.toContain('._sc_');
        expect(wrapper).not.toContain('--editor');
    });

    it('adds an identifiable conditional PATH append', () => {
        const block = createGodotPathBlock('/home/user/Godot Launcher/bin');
        expect(block).toContain("'/home/user/Godot Launcher/bin'");
        // biome-ignore lint/suspicious/noTemplateCurlyInString: This is literal shell parameter expansion.
        expect(block).toContain('${PATH:+${PATH}:}');
    });
});
