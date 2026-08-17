import { describe, expect, it } from 'vitest';
import { mapToolIntegrationSummary } from './tool-integration-summary.mapper.js';

describe('mapToolIntegrationSummary', () => {
    it('exposes the display path but omits executable arguments and settings', () => {
        expect(
            mapToolIntegrationSummary({
                metadata: { id: 'git', displayName: 'Git', order: 100 },
                settings: {
                    enabled: true,
                    executablePathOverride: null,
                    executableArgsOverride: null,
                },
                installation: {
                    executablePath: '/system/bin/git',
                    executableArgs: [],
                    version: 'git version 2.51.0',
                    source: 'detected',
                },
                status: 'available',
                checkedAt: 123,
            }),
        ).toEqual({
            id: 'git',
            displayName: 'Git',
            status: 'available',
            version: 'git version 2.51.0',
            executablePath: '/system/bin/git',
        });
    });
});
