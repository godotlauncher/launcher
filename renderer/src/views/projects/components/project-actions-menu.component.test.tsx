import type { ProjectDetails } from '@shared/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectActionsMenu } from './project-actions-menu.component';

const menuCapture = vi.hoisted(() => ({
    items: [] as Array<{
        key: string;
        label?: ReactNode;
        disabled?: boolean;
        closeOnSelect?: boolean;
        onSelect?: () => void | Promise<void>;
    }>,
}));

vi.mock('../../../components/ui/action-menu.component', () => ({
    ActionMenu: ({
        open,
        items,
    }: {
        open: boolean;
        items: Array<{
            key: string;
            label?: ReactNode;
            disabled?: boolean;
            closeOnSelect?: boolean;
            onSelect?: () => void | Promise<void>;
        }>;
    }) => {
        menuCapture.items = items;
        return open ? (
            <div>
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        disabled={item.disabled}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        ) : null;
    },
}));

const project: ProjectDetails = {
    name: 'Demo',
    path: '/projects/demo',
    version: '4.2',
    version_number: 4.2,
    renderer: 'FORWARD_PLUS',
    editor_settings_path: '/editors/Demo/editor_data',
    editor_settings_file: '/editors/Demo/editor_data/editor_settings-4.2.tres',
    last_opened: null,
    open_windowed: false,
    release: {
        version: '4.2',
        version_number: 4.2,
        install_path: '/godot',
        editor_path: '/godot/godot.exe',
        platform: 'win32',
        arch: 'x86_64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: null,
        valid: true,
    },
    launch_path: '/editors/Demo/godot.exe',
    config_version: 5,
    codeEditorId: null,
    withGit: false,
    valid: true,
};

describe('ProjectActionsMenu', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('starts duplication with the selected source project', async () => {
        const duplicate = vi.fn();
        renderToStaticMarkup(
            <ProjectActionsMenu
                project={project}
                anchorRect={null}
                t={(key) => key}
                onClose={vi.fn()}
                onDuplicateProject={duplicate}
                onExportEditorSettings={vi.fn()}
                onImportEditorSettings={vi.fn()}
                onRemoveProject={vi.fn()}
                onClearNewStatus={vi.fn()}
            />,
        );
        await menuCapture.items
            .find((item) => item.key === 'duplicate-project')
            ?.onSelect?.();
        expect(duplicate).toHaveBeenCalledExactlyOnceWith(project);
    });

    it('renders the remaining project management actions', () => {
        const html = renderToStaticMarkup(
            <ProjectActionsMenu
                project={project}
                anchorRect={{
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                }}
                t={(key) => key}
                onClose={vi.fn()}
                onExportEditorSettings={vi.fn()}
                onImportEditorSettings={vi.fn()}
                onClearNewStatus={vi.fn()}
                onRemoveProject={vi.fn()}
            />,
        );

        expect(html).not.toContain('menus:project.copyProjectPath');
        expect(html).toContain('project.exportEditorSettings');
        expect(html).toContain('project.importEditorSettings');
        expect(html).toContain('project.removeFromList');
        expect(html).not.toContain('project.launchEditor');
        expect(html).not.toContain('project.projectSettings');
        expect(html).not.toContain('project.openProjectFolder');
        expect(html).not.toContain('project.openEditorSettingsFolder');
        expect(html).not.toContain('project.pinProject');
        expect(html).not.toContain('project.openWindowed');
        expect(html).not.toContain('project.initGit');
    });

    it.each([
        { is_new: true, last_opened: null, pinned: false, available: true },
        { is_new: true, last_opened: null, pinned: true, available: true },
        { is_new: false, last_opened: null, pinned: false, available: false },
        {
            is_new: undefined,
            last_opened: null,
            pinned: false,
            available: false,
        },
        {
            is_new: true,
            last_opened: new Date('2026-10-19T10:00:00Z'),
            pinned: false,
            available: false,
        },
    ])(
        'offers Clear New only for a currently new unopened project: %s',
        async ({ available, ...state }) => {
            const selected = { ...project, ...state };
            const clear = vi.fn();
            renderToStaticMarkup(
                <ProjectActionsMenu
                    project={selected}
                    anchorRect={null}
                    t={(key) => key}
                    onClose={vi.fn()}
                    onExportEditorSettings={vi.fn()}
                    onImportEditorSettings={vi.fn()}
                    onRemoveProject={vi.fn()}
                    onClearNewStatus={clear}
                />,
            );
            const action = menuCapture.items.find(
                (item) => item.key === 'clear-new-status',
            );
            expect(Boolean(action)).toBe(available);
            if (available) {
                expect(action?.label).toBe('newStatus.markAsNotNew');
                await action?.onSelect?.();
                expect(clear).toHaveBeenCalledWith(selected);
            }
        },
    );

    it('does not restore moved actions for pinned projects', () => {
        const html = renderToStaticMarkup(
            <ProjectActionsMenu
                project={{ ...project, pinned: true }}
                anchorRect={{
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                }}
                t={(key) => key}
                onClose={vi.fn()}
                onExportEditorSettings={vi.fn()}
                onImportEditorSettings={vi.fn()}
                onClearNewStatus={vi.fn()}
                onRemoveProject={vi.fn()}
            />,
        );

        expect(html).not.toContain('project.unpinProject');
        expect(html).toContain('project.removeFromList');
    });
});
