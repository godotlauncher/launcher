import { describe, expect, it, vi } from 'vitest';
import type { ToolIntegrationStore } from '../../tool-integration.store.js';
import {
    readTerminalConfiguration,
    TerminalConfigurationService,
} from './terminal-configuration.service.js';

describe('terminal configuration', () => {
    it('defaults absent preferences to automatic', () => {
        expect(readTerminalConfiguration({}, 'linux')).toEqual({
            valid: true,
            selection: 'automatic',
        });
    });
    it('preserves unknown target IDs as explicit unavailable selections', () => {
        expect(
            readTerminalConfiguration(
                { version: 1, preferences: { linux: 'future-terminal' } },
                'linux',
            ),
        ).toEqual({ valid: true, selection: 'future-terminal' });
    });
    it('preserves other platforms and unrelated provider fields on selection', async () => {
        let current = {
            version: 1,
            preferences: { otherOS: 'future-terminal' },
            futureField: 'preserved',
        };
        const store = {
            updateConfiguration: vi.fn(async (_id, mutate) => {
                current = mutate(current);
            }),
        } as unknown as ToolIntegrationStore;
        await new TerminalConfigurationService(store).select('automatic');
        expect(current).toEqual({
            version: 1,
            preferences: {
                otherOS: 'future-terminal',
                [process.platform]: 'automatic',
            },
            futureField: 'preserved',
        });
    });
    it.each([
        { version: 2, preferences: {} },
        { version: 1, preferences: [] },
        { version: 1, preferences: { linux: 5 } },
    ])('does not overwrite unsupported configuration %j', async (current) => {
        const original = structuredClone(current);
        const store = {
            updateConfiguration: vi.fn(async (_id, mutate) => mutate(current)),
        } as unknown as ToolIntegrationStore;
        await expect(
            new TerminalConfigurationService(store).select('automatic'),
        ).rejects.toThrow('Unsupported terminal configuration');
        expect(current).toEqual(original);
    });
    it('replaces unsupported provider configuration with automatic preferences', async () => {
        let current: Record<string, unknown> = {
            version: 8,
            preferences: { linux: 'custom-terminal' },
            customTargets: [{ executablePath: '/unsafe/terminal' }],
        };
        const store = {
            updateConfiguration: vi.fn(async (_id, mutate) => {
                current = mutate(current);
            }),
        } as unknown as ToolIntegrationStore;

        await new TerminalConfigurationService(store).reset();

        expect(store.updateConfiguration).toHaveBeenCalledWith(
            'terminal',
            expect.any(Function),
        );
        expect(current).toEqual({ version: 1, preferences: {} });
    });
});
