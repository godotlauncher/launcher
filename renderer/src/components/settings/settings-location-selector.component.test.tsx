import type { UserPreferences } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '../../hooks/usePreferences';
import {
    SettingsLocationSelector,
    selectSettingsLocation,
} from './settings-location-selector.component';

vi.mock('../../hooks/usePreferences', () => ({
    usePreferences: vi.fn(),
}));
vi.mock('../../bridge.ts', () => ({
    appBridge: { openDirectoryDialog: vi.fn() },
}));

const preferences = {
    projects_location: '/Users/test/GodotProjects',
    install_location: '/Users/test/GodotEditors',
} as UserPreferences;

describe('SettingsLocationSelector', () => {
    beforeEach(() => {
        vi.mocked(usePreferences).mockReturnValue({
            preferences,
            savePreferences: vi.fn(),
        } as unknown as ReturnType<typeof usePreferences>);
    });

    it.each([
        {
            preferenceKey: 'projects_location' as const,
            title: 'Project Location',
            fieldLabel: 'Default Location',
            pathTestId: 'projectLocationPath',
            browseTestId: 'btnSelectProjectDir',
            value: preferences.projects_location,
        },
        {
            preferenceKey: 'install_location' as const,
            title: 'Editor Installs Location',
            fieldLabel: 'Install Location',
            pathTestId: 'editorInstallLocationPath',
            browseTestId: 'btnSelectInstallDir',
            value: preferences.install_location,
        },
    ])('renders the $preferenceKey configuration', (configuration) => {
        const html = renderToStaticMarkup(
            <SettingsLocationSelector
                preferenceKey={configuration.preferenceKey}
                title={configuration.title}
                description="Location description"
                fieldLabel={configuration.fieldLabel}
                browseLabel="Browse"
                waitingMessage="Waiting for dialog..."
                dialogTitle="Select Directory"
                headerTestId="locationHeader"
                descriptionTestId="locationDescription"
                pathTestId={configuration.pathTestId}
                browseTestId={configuration.browseTestId}
            />,
        );

        expect(html).toContain(configuration.title);
        expect(html).toContain(configuration.fieldLabel);
        expect(html).toContain(`value="${configuration.value}"`);
        expect(html).toContain(`data-testid="${configuration.pathTestId}"`);
        expect(html).toContain(`data-testid="${configuration.browseTestId}"`);
        expect(html).toContain('readOnly=""');
        expect(html).toContain('aria-label="Browse"');
        expect(html).toContain('>Browse</span>');
    });

    it('does not save a cancelled selection and always clears waiting state', async () => {
        const savePath = vi.fn();
        const setDialogOpen = vi.fn();

        await selectSettingsLocation({
            currentPath: '/current',
            dialogTitle: 'Select Directory',
            setDialogOpen,
            openDirectoryDialog: vi.fn().mockResolvedValue({
                canceled: true,
                filePaths: [],
            }),
            savePath,
        });

        expect(savePath).not.toHaveBeenCalled();
        expect(setDialogOpen.mock.calls).toEqual([[true], [false]]);
    });

    it('saves only a returned path', async () => {
        const savePath = vi.fn().mockResolvedValue(undefined);

        await selectSettingsLocation({
            currentPath: '/current',
            dialogTitle: 'Select Directory',
            setDialogOpen: vi.fn(),
            openDirectoryDialog: vi.fn().mockResolvedValue({
                canceled: false,
                filePaths: ['/selected'],
            }),
            savePath,
        });

        expect(savePath).toHaveBeenCalledWith('/selected');
    });

    it('clears waiting state when the dialog fails', async () => {
        const setDialogOpen = vi.fn();

        await expect(
            selectSettingsLocation({
                currentPath: '/current',
                dialogTitle: 'Select Directory',
                setDialogOpen,
                openDirectoryDialog: vi
                    .fn()
                    .mockRejectedValue(new Error('Dialog failed')),
                savePath: vi.fn(),
            }),
        ).rejects.toThrow('Dialog failed');
        expect(setDialogOpen.mock.calls).toEqual([[true], [false]]);
    });
});
