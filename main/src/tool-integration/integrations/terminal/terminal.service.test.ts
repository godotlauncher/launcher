import type { TerminalSummary } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import { TerminalService } from './terminal.service.js';

vi.mock('electron-log', () => ({
    default: { error: vi.fn(), debug: vi.fn() },
}));

/** Builds a workflow with isolated project, preference and native boundaries. */
function setup() {
    const summary: TerminalSummary = {
        enabled: true,
        selection: 'automatic',
        configurationValid: true,
        targets: [
            {
                id: 'macos-terminal',
                displayName: 'Terminal.app',
                executablePath: '/System/Applications/Utilities/Terminal.app',
            },
        ],
        resolvedTargetId: 'macos-terminal',
    };
    const catalogue = { get: vi.fn(async () => summary), invalidate: vi.fn() };
    const configuration = { select: vi.fn(), reset: vi.fn() };
    const adapters = { launch: vi.fn(async () => ({ success: true })) };
    const projects = { list: vi.fn(async () => [{ path: '/stored/project' }]) };
    const store = { get: vi.fn(async () => ({ enabled: true })) };
    const cache = { invalidate: vi.fn() };
    const tools = { rescan: vi.fn(), updateSettings: vi.fn() };
    const service = new TerminalService(
        ...([
            catalogue,
            configuration,
            adapters,
            projects,
            store,
            cache,
            tools,
        ] as unknown as ConstructorParameters<typeof TerminalService>),
    );
    return {
        service,
        catalogue,
        configuration,
        adapters,
        projects,
        store,
        cache,
        tools,
        summary,
    };
}

describe('TerminalService', () => {
    it('rejects arbitrary directories not present in the project store', async () => {
        const { service, adapters } = setup();
        expect(await service.openProject('/arbitrary/directory')).toEqual({
            success: false,
            reason: 'missing-project',
        });
        expect(adapters.launch).not.toHaveBeenCalled();
    });
    it('launches the canonical stored project without requiring an editor', async () => {
        const { service, adapters, summary } = setup();
        expect(await service.openProject('/stored/project')).toEqual({
            success: true,
        });
        expect(adapters.launch).toHaveBeenCalledWith(
            summary.targets[0],
            '/stored/project',
        );
    });
    it.each(['disabled', 'invalid-configuration', 'unavailable'] as const)(
        'does not dispatch when %s',
        async (reason) => {
            const { service, adapters, summary } = setup();
            if (reason === 'disabled') summary.enabled = false;
            if (reason === 'invalid-configuration')
                summary.configurationValid = false;
            if (reason === 'unavailable') summary.resolvedTargetId = null;
            expect(await service.openProject('/stored/project')).toEqual({
                success: false,
                reason,
            });
            expect(adapters.launch).not.toHaveBeenCalled();
        },
    );
    it.each(['foot', 'alacritty', 'ghostty', 'kitty'] as const)(
        'allows selecting %s only on Linux',
        async (selection) => {
            const platform = vi.spyOn(process, 'platform', 'get');
            const { service, configuration } = setup();
            try {
                platform.mockReturnValue('linux');
                await service.selectTarget(selection);
                expect(configuration.select).toHaveBeenCalledWith(selection);
                configuration.select.mockClear();
                platform.mockReturnValue('darwin');
                await expect(service.selectTarget(selection)).rejects.toThrow(
                    'Unsupported terminal target',
                );
                expect(configuration.select).not.toHaveBeenCalled();
            } finally {
                platform.mockRestore();
            }
        },
    );
    it('rejects unknown target identifiers without persisting', async () => {
        const { service, configuration } = setup();
        await expect(
            service.selectTarget('arbitrary' as never),
        ).rejects.toThrow('Unsupported terminal target');
        expect(configuration.select).not.toHaveBeenCalled();
    });
    it('invalidates both catalogue and generic cache after a preference change', async () => {
        const { service, catalogue, cache, tools } = setup();
        await service.selectTarget('automatic');
        expect(catalogue.invalidate).toHaveBeenCalled();
        expect(cache.invalidate).toHaveBeenCalledWith('terminal');
        expect(tools.rescan).toHaveBeenCalledWith('terminal');
    });
    it('resets preferences then refreshes the terminal summary', async () => {
        const { service, configuration, catalogue, cache, tools, summary } =
            setup();

        await expect(service.resetConfiguration()).resolves.toEqual(summary);

        expect(configuration.reset).toHaveBeenCalledOnce();
        expect(catalogue.invalidate).toHaveBeenCalledOnce();
        expect(cache.invalidate).toHaveBeenCalledWith('terminal');
        expect(tools.rescan).toHaveBeenCalledWith('terminal');
    });
    it('propagates configuration reset errors without refreshing terminal state', async () => {
        const { service, configuration, catalogue, cache, tools } = setup();
        configuration.reset.mockRejectedValueOnce(
            new Error('Storage unavailable'),
        );

        await expect(service.resetConfiguration()).rejects.toThrow(
            'Storage unavailable',
        );

        expect(catalogue.invalidate).not.toHaveBeenCalled();
        expect(cache.invalidate).not.toHaveBeenCalled();
        expect(tools.rescan).not.toHaveBeenCalled();
    });
});
