import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallsHeader } from './installs-header.component.tsx';

describe('InstallsHeader', () => {
    it('keeps the title and location while hiding list controls', () => {
        const html = renderToStaticMarkup(
            <InstallsHeader
                title="Editor Installs"
                installLocation="/Editors"
                searchPlaceholder="Search"
                searchValue=""
                onSearchChange={vi.fn()}
                addCustomEditorLabel="Custom Editor"
                customEditorMenuOpen={false}
                installLabel="Install Editor"
                copyPathLabel="Copy path"
                copiedLabel="Copied"
                showControls={false}
                onOpenCustomEditorMenu={vi.fn()}
                onInstall={vi.fn()}
            />,
        );

        expect(html).toContain('Editor Installs');
        expect(html).toContain('/Editors');
        expect(html).not.toContain('btnAddCustomEngineMenu');
        expect(html).not.toContain('btnInstallEditor');
        expect(html).not.toContain('inputInstallSearch');
    });

    it('exposes the shared custom editor menu state from its trigger', () => {
        const html = renderToStaticMarkup(
            <InstallsHeader
                title="Editor Installs"
                installLocation="/Editors"
                searchPlaceholder="Search"
                searchValue=""
                onSearchChange={vi.fn()}
                addCustomEditorLabel="Custom Editor"
                customEditorMenuOpen
                installLabel="Install Editor"
                copyPathLabel="Copy path"
                copiedLabel="Copied"
                onOpenCustomEditorMenu={vi.fn()}
                onInstall={vi.fn()}
            />,
        );

        expect(html).toContain('data-testid="btnAddCustomEngineMenu"');
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).toContain('aria-expanded="true"');
        expect(html).not.toContain('btnAddCustomEngine"');
        expect(html).not.toContain('btnCreateCustomEditorManifest');
    });
});
