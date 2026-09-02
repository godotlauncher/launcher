import { describe, expect, it } from 'vitest';
import { normalizeAppIntegrationStore } from './app-integration.schema.js';

const CONNECTION_ID = 'd7ecbb8f-16b4-43c6-b1a7-2f399fd52463';

describe('normalizeAppIntegrationStore', () => {
    it('upgrades pre-installation metadata into a connection-keyed store', () => {
        const normalized = normalizeAppIntegrationStore({
            schemaVersion: 1,
            connections: {
                github: {
                    id: CONNECTION_ID,
                    providerId: 'github',
                    accountId: '1',
                    accountLogin: 'octocat',
                    accountDisplayName: 'The Octocat',
                    connectedAt: '2026-08-20T10:00:00.000Z',
                    accessTokenExpiresAt: null,
                    refreshTokenExpiresAt: null,
                },
            },
        });

        expect(normalized).toMatchObject({
            schemaVersion: 3,
            connections: {
                [CONNECTION_ID]: {
                    id: CONNECTION_ID,
                    accessTargets: [],
                },
            },
        });
        expect(normalized.connections.github).toBeUndefined();
    });

    it('upgrades one legacy installation without exposing its provider ID', () => {
        const normalized = normalizeAppIntegrationStore({
            schemaVersion: 1,
            connections: {
                github: {
                    id: CONNECTION_ID,
                    providerId: 'github',
                    accountId: '1',
                    accountLogin: 'octocat',
                    accountDisplayName: null,
                    connectedAt: '2026-08-20T10:00:00.000Z',
                    accessTokenExpiresAt: null,
                    refreshTokenExpiresAt: null,
                    accessTarget: {
                        id: '123456',
                        login: 'godotlauncher',
                        type: 'organization',
                        manageUrl:
                            'https://github.com/organizations/godotlauncher/settings/installations/123456',
                    },
                },
            },
        });

        const target = normalized.connections[CONNECTION_ID]?.accessTargets[0];
        expect(target).toMatchObject({
            providerTargetId: '123456',
            login: 'godotlauncher',
            type: 'organization',
            availability: 'available',
        });
        expect(target?.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u,
        );
        expect(target?.id).not.toContain('123456');
    });

    it('defaults unreleased schema-two connections to available', () => {
        const normalized = normalizeAppIntegrationStore({
            schemaVersion: 2,
            connections: {
                [CONNECTION_ID]: {
                    id: CONNECTION_ID,
                    providerId: 'github',
                    accountId: '1',
                    accountLogin: 'octocat',
                    accountDisplayName: null,
                    connectedAt: '2026-08-20T10:00:00.000Z',
                    accessTokenExpiresAt: null,
                    refreshTokenExpiresAt: null,
                    accessTargets: [
                        {
                            id: 'dc8509cb-6c15-4a3f-9305-f4e5e858098a',
                            providerTargetId: '123456',
                            login: 'godotlauncher',
                            type: 'organization',
                            manageUrl:
                                'https://github.com/organizations/godotlauncher/settings/installations/123456',
                        },
                    ],
                },
            },
        });

        expect(normalized.connections[CONNECTION_ID]).toMatchObject({
            requiresReauthorisation: false,
            accessTargets: [
                {
                    availability: 'available',
                    capabilities: ['repository-browsing'],
                },
            ],
        });
    });
});
