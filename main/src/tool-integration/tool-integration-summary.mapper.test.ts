import { describe, expect, it } from 'vitest';
import { mapToolIntegrationSummary } from './tool-integration-summary.mapper.js';

describe('mapToolIntegrationSummary', () => {
    it('omits executable and settings details from the bridge summary', () => {
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
        });
    });
});
