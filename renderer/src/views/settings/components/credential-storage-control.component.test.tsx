import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CredentialStorageView } from './credential-storage-control.component';

vi.mock('../../../renderer.bridge', () => ({ appBridge: {} }));

/**
 * Renders storage settings and controlled modal state with readable translations.
 * @param overrides - State under examination.
 */
function render(
    overrides: Partial<React.ComponentProps<typeof CredentialStorageView>> = {},
) {
    return renderToStaticMarkup(
        <CredentialStorageView
            t={(key, values) => `${key}${values ? JSON.stringify(values) : ''}`}
            saved="automatic"
            selected="automatic"
            status={{
                startupPreference: 'automatic',
                selectionSource: 'automatic',
                requestedBackend: null,
                activeBackend: 'unknown',
                available: false,
            }}
            statusError={false}
            saving={false}
            disabled={false}
            dialog={null}
            onDialogChange={vi.fn()}
            onChange={vi.fn()}
            onSave={vi.fn()}
            onRetry={vi.fn()}
            {...overrides}
        />,
    );
}

describe('CredentialStorageView', () => {
    it('shows storage diagnostics inline with accessible choices', () => {
        const html = render();
        expect(html).toContain('value="gnome-libsecret"');
        expect(html).toContain('credentialStorage.unavailable');
        expect(html).not.toContain('credentialStorage.details');
        expect(html).not.toContain('credentialStorage.warning');
        expect(html).toContain('credentialStorage.activeBackend');
        expect(html).not.toContain('<dialog');
    });
    it('shows reconnection and restart warnings before confirmation', () => {
        const html = render({ selected: 'gnome-libsecret', dialog: 'confirm' });
        expect(html).toContain('credentialStorage.confirmTitle');
        expect(html).toContain('credentialStorage.warning');
        expect(html).toContain('credentialStorage.restart');
        expect(html).toContain('common:buttons.cancel');
    });
    it('shows saved restart guidance without claiming storage became available', () => {
        const html = render({
            saved: 'gnome-libsecret',
            selected: 'gnome-libsecret',
            dialog: 'saved',
        });
        expect(html).toContain('credentialStorage.savedTitle');
        expect(html).toContain('credentialStorage.restartNow');
        expect(html).toContain('credentialStorage.notNow');
        expect(html).toContain('credentialStorage.restartPending');
        expect(html).toContain('credentialStorage.restart');
        expect(html).not.toContain('credentialStorage.savedCurrent');
    });
    it('does not request a restart when the saved choice matches startup', () => {
        const html = render({ dialog: 'saved' });
        expect(html).toContain('credentialStorage.savedCurrent');
        expect(html).not.toContain('credentialStorage.restartNow');
        expect(html).not.toContain('credentialStorage.restart');
    });
    it('explains launch overrides in the saved modal', () => {
        const html = render({
            dialog: 'saved',
            saved: 'gnome-libsecret',
            status: {
                startupPreference: 'automatic',
                selectionSource: 'command-line',
                requestedBackend: 'kwallet6',
                activeBackend: 'kwallet6',
                available: true,
            },
        });
        expect(html).toContain('credentialStorage.override');
        expect(html).toContain('kwallet6');
        expect(html).not.toContain('credentialStorage.savedCurrent');
    });
    it('shows selection failure and unavailable-service guidance inline', () => {
        const html = render({
            saved: 'gnome-libsecret',
            status: {
                startupPreference: 'gnome-libsecret',
                selectionSource: 'preference',
                requestedBackend: 'gnome-libsecret',
                activeBackend: 'unknown',
                available: false,
            },
        });
        expect(html).toContain('credentialStorage.selectionFailed');
        expect(html).toContain('credentialStorage.activeBackend');
        expect(html).toContain('credentialStorage.unavailable');
    });
    it('presents save failures in a modal and diagnostic retry in details', () => {
        expect(render({ dialog: 'failed' })).toContain(
            'credentialStorage.saveError',
        );
        const html = render({ statusError: true });
        expect(html).toContain('credentialStorage.statusError');
        expect(html).toContain('common:buttons.retry');
    });
});
