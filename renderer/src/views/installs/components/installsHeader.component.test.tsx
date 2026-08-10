import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallsHeader } from './installsHeader.component.tsx';

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
                selectManifestLabel="Select manifest"
                createManifestLabel="Create manifest"
                installLabel="Install Editor"
                copyPathLabel="Copy path"
                copiedLabel="Copied"
                showControls={false}
                onSelectManifest={vi.fn()}
                onCreateManifest={vi.fn()}
                onInstall={vi.fn()}
            />,
        );

        expect(html).toContain('Editor Installs');
        expect(html).toContain('/Editors');
        expect(html).not.toContain('btnAddCustomEngineMenu');
        expect(html).not.toContain('btnInstallEditor');
        expect(html).not.toContain('inputInstallSearch');
    });
});
