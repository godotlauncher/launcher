import { describe, expect, it, vi } from 'vitest';
import type { ToolIntegrationStore } from '../../tool-integration.store.js';
import type { TerminalTarget } from './terminal.types.js';
import type { TerminalAdapterService } from './terminal-adapter.service.js';
import { TerminalCatalogueService } from './terminal-catalogue.service.js';
import type { TerminalConfigurationService } from './terminal-configuration.service.js';

/** Creates a catalogue with isolated discovery and preference boundaries. */
function setup() {
    const targets: TerminalTarget[] = [
        {
            id: 'gnome-terminal',
            displayName: 'GNOME Terminal',
            executablePath: '/usr/bin/gnome-terminal',
        },
        {
            id: 'konsole',
            displayName: 'Konsole',
            executablePath: '/usr/bin/konsole',
        },
    ];
    const adapters = { discover: vi.fn(async () => targets) };
    const configuration = {
        get: vi.fn(async () => ({ valid: true, selection: 'automatic' })),
    };
    const store = { get: vi.fn(async () => ({ enabled: true })) };
    const catalogue = new TerminalCatalogueService(
        adapters as unknown as TerminalAdapterService,
        configuration as unknown as TerminalConfigurationService,
        store as unknown as ToolIntegrationStore,
    );
    return { catalogue, adapters, configuration, store, targets };
}

describe('TerminalCatalogueService', () => {
    it.each([
        ['GNOME', 'gnome-terminal'],
        ['KDE', 'konsole'],
        ['XFCE', 'gnome-terminal'],
    ])(
        'uses the automatic desktop preference on %s',
        async (desktop, expected) => {
            vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
            vi.stubEnv('XDG_CURRENT_DESKTOP', desktop);
            const { catalogue } = setup();
            expect((await catalogue.get()).resolvedTargetId).toBe(expected);
            vi.unstubAllEnvs();
            vi.restoreAllMocks();
        },
    );
    it('skips unavailable automatic candidates before launch', async () => {
        const { catalogue, adapters, targets } = setup();
        adapters.discover.mockResolvedValue([targets[1]]);
        expect((await catalogue.get()).resolvedTargetId).toBe('konsole');
    });
    it('keeps an unavailable explicit selection without falling back', async () => {
        const { catalogue, configuration } = setup();
        configuration.get.mockResolvedValue({
            valid: true,
            selection: 'removed-terminal',
        });
        expect(await catalogue.get()).toMatchObject({
            selection: 'removed-terminal',
            resolvedTargetId: null,
        });
    });
    it('blocks resolution for unknown configuration', async () => {
        const { catalogue, configuration } = setup();
        configuration.get.mockResolvedValue({
            valid: false,
            selection: 'automatic',
        });
        expect(await catalogue.get()).toMatchObject({
            configurationValid: false,
            resolvedTargetId: null,
        });
    });
    it('blocks resolution when disabled', async () => {
        const { catalogue, store } = setup();
        store.get.mockResolvedValue({ enabled: false });
        expect(await catalogue.get()).toMatchObject({
            enabled: false,
            resolvedTargetId: null,
        });
    });
    it('does not publish an old scan after changing the preference', async () => {
        const { catalogue, adapters, configuration, targets } = setup();
        let finish!: (value: TerminalTarget[]) => void;
        adapters.discover.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        const old = catalogue.get();
        configuration.get.mockResolvedValue({
            valid: true,
            selection: 'konsole',
        });
        catalogue.invalidate();
        const current = await catalogue.get();
        finish(targets);
        expect(current.resolvedTargetId).toBe('konsole');
        expect((await old).resolvedTargetId).toBe('konsole');
        expect((await catalogue.get()).resolvedTargetId).toBe('konsole');
    });
    it('shares discovery between concurrent consumers', async () => {
        const { catalogue, adapters } = setup();
        await Promise.all([catalogue.get(), catalogue.get(true)]);
        expect(adapters.discover).toHaveBeenCalledOnce();
    });
});
