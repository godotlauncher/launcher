import { describe, expect, it } from 'vitest';
import type { ToolSummary } from './tool-integration.types.js';
import {
    mapToolSummariesToCachedTools,
    mapToolSummariesToInstalledTools,
} from './tool-integration-legacy.mapper.js';

const availableSummary: ToolSummary = {
    metadata: { id: 'git', displayName: 'Git', order: 100 },
    settings: {
        enabled: true,
        executablePathOverride: null,
        executableArgsOverride: null,
    },
    installation: {
        executablePath: '/tools/git',
        executableArgs: [],
        version: 'git version 2.51.0',
        source: 'detected',
    },
    status: 'available',
    checkedAt: 123,
};

describe('tool integration legacy mapper', () => {
    it('maps available summaries to both temporary bridge shapes', () => {
        expect(mapToolSummariesToInstalledTools([availableSummary])).toEqual([
            {
                name: 'Git',
                path: '/tools/git',
                version: 'git version 2.51.0',
            },
        ]);
        expect(mapToolSummariesToCachedTools([availableSummary])).toEqual([
            {
                name: 'Git',
                path: '/tools/git',
                version: 'git version 2.51.0',
                verified: true,
            },
        ]);
    });

    it('omits missing tools and marks unchecked installations unverified', () => {
        const missingSummary: ToolSummary = {
            ...availableSummary,
            installation: null,
            status: 'missing',
        };
        const uncheckedSummary: ToolSummary = {
            ...availableSummary,
            status: 'unchecked',
        };

        expect(mapToolSummariesToInstalledTools([missingSummary])).toEqual([]);
        expect(mapToolSummariesToCachedTools([uncheckedSummary])).toEqual([
            expect.objectContaining({ verified: false }),
        ]);
    });
});
