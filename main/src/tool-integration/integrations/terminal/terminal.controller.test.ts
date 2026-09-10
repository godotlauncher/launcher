import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import { TerminalController } from './terminal.controller.js';
import type { TerminalService } from './terminal.service.js';

describe('TerminalController', () => {
    it('delegates configuration reset to the terminal service', async () => {
        const summary = {
            enabled: true,
            selection: 'automatic',
            configurationValid: true,
            targets: [],
            resolvedTargetId: null,
        };
        const service = {
            resetConfiguration: vi.fn(async () => summary),
        } as unknown as TerminalService;

        await expect(
            new TerminalController(service).resetConfiguration(),
        ).resolves.toEqual(summary);
        expect(service.resetConfiguration).toHaveBeenCalledOnce();
    });
});
