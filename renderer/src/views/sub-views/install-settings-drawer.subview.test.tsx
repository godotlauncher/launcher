import type { InstalledRelease } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { useCommandLineGodot } from '../installs/hooks/command-line-godot.hook';
import { getReleaseActionKey } from '../installs/installs-view.model';
import { InstallSettingsDrawer } from './install-settings-drawer.subview';

vi.mock('../../hooks/alerts.hook', () => ({
    useAlerts: () => ({ addCustomConfirm: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
    Trans: ({ i18nKey }: { i18nKey: string }) => <>{i18nKey}</>,
    useTranslation: () => ({ t: (key: string) => key }),
}));
const release = {
    version: '4.7-stable',
    name: 'Studio Godot',
    mono: true,
    install_path: '/editors/studio',
    editor_path: '/editors/studio/godot',
    valid: true,
} as InstalledRelease;

/**
 * Renders the drawer with explicit service-state fixtures rather than real platform integration.
 * @param overrides - Shared command state to present.
 * @param editor - Installation whose settings are shown.
 */
function renderDrawer(
    overrides: Partial<ReturnType<typeof useCommandLineGodot>> = {},
    editor = release,
) {
    return renderToStaticMarkup(
        <InstallSettingsDrawer
            release={editor}
            installed={[editor]}
            isBusy={() => false}
            onOpenChange={vi.fn()}
            aliasState={{
                aliases: [],
                loaded: true,
                loading: false,
                pending: false,
                pendingKey: null,
                error: '',
                status: '',
                refresh: vi.fn(async () => {}),
                apply: vi.fn(async () => true),
            }}
            commandLine={{
                selection: null,
                defaultKey: null,
                pendingKey: null,
                busy: false,
                loading: false,
                loaded: true,
                error: null,
                status: '',
                refresh: vi.fn(async () => {}),
                select: vi.fn(),
                ...overrides,
            }}
        />,
    );
}

describe('InstallSettingsDrawer', () => {
    it('identifies the installation and exposes one labelled CLI tab and an unchecked default', () => {
        const html = renderDrawer();
        expect(html).toContain('Studio Godot');
        expect(html).toContain('.NET');
        expect(html.match(/role="tab"/g)).toHaveLength(1);
        expect(html).toContain('role="tabpanel"');
        expect(html).toContain('settings.default');
        expect(html).toContain('type="checkbox"');
        expect(html).not.toContain('checked=""');
        expect(html).toContain('settings.close');
        expect(html).not.toContain('Additional command');
    });
    it('shows confirmed selection and disables a pending operation without optimistic unchecking', () => {
        const html = renderDrawer({
            defaultKey: getReleaseActionKey(release),
            pendingKey: getReleaseActionKey(release),
            busy: true,
        });
        expect(html).toContain('checked=""');
        expect(html).toMatch(/<input[^>]+disabled=""/);
        expect(html).toContain('settings.pending');
    });
    it('distinguishes cold loading from no default and offers recovery after a failed read', () => {
        const loading = renderDrawer({
            loading: true,
            loaded: false,
            busy: true,
        });
        expect(loading).toContain('settings.loading');
        expect(loading).not.toContain('settings.default');
        const failed = renderDrawer({
            loaded: false,
            busy: true,
            error: 'Permission denied',
        });
        expect(failed).toContain('role="alert"');
        expect(failed).toContain('Permission denied');
        expect(failed).toContain('common:buttons.retry');
        expect(failed).not.toContain('settings.default');
    });
    it('prevents selecting an unavailable target but allows clearing its existing default', () => {
        const unavailable = { ...release, valid: false };
        expect(renderDrawer({}, unavailable)).toMatch(/<input[^>]+disabled=""/);
        const selected = renderDrawer(
            { defaultKey: getReleaseActionKey(release) },
            unavailable,
        );
        expect(selected).toContain('checked=""');
        expect(
            selected.match(/<input[^>]*id="[^"]*-default"[^>]*>/)?.[0],
        ).not.toContain('disabled=""');
    });
});
