import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    AppIntegrationDisconnectConfirm,
    type AppIntegrationDisconnectConfirmCopy,
    selectAppIntegrationDisconnectCopy,
} from './app-integration-disconnect-confirm.component';

const copy: AppIntegrationDisconnectConfirmCopy = {
    checkbox: 'Revoke all Launcher devices',
    checkedDetail: 'Other devices must reconnect',
    checkedAction: 'Revoke and disconnect',
    uncheckedDetail: 'Copied tokens remain active',
    uncheckedAction: 'Disconnect this device',
    failureDetail: 'Nothing was removed',
    cancel: 'Cancel',
};

describe('AppIntegrationDisconnectConfirm', () => {
    it('starts with remote revocation selected', () => {
        const html = renderToStaticMarkup(
            <AppIntegrationDisconnectConfirm
                close={vi.fn()}
                copy={copy}
                onConfirm={vi.fn(async () => true)}
            />,
        );

        expect(html).toContain('type="checkbox"');
        expect(html).toContain('checked=""');
        expect(html).toContain(copy.checkbox);
        expect(html).toContain(copy.checkedDetail);
        expect(html).toContain(copy.checkedAction);
        expect(html).not.toContain(copy.uncheckedDetail);
        expect(html).not.toContain(copy.failureDetail);
    });

    it('selects the explicit local-only warning and action', () => {
        expect(selectAppIntegrationDisconnectCopy(false, copy)).toEqual({
            action: copy.uncheckedAction,
            detail: copy.uncheckedDetail,
        });
    });
});
