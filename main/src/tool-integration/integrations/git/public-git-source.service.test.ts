import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns', () => ({ promises: { lookup } }));

import { PublicGitSourceService } from './public-git-source.service.js';

describe('PublicGitSourceService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    });

    it.each([
        'https://github.com/godotlauncher/launcher.git',
        'https://gitlab.com/group/project.git',
        'https://bitbucket.org/team/project.git',
        'https://code.example.com/team/project',
    ])('accepts an anonymous public repository URL', async (url) => {
        const service = new PublicGitSourceService();

        await expect(service.inspect(url)).resolves.toMatchObject({
            ok: true,
            source: {
                canonicalUrl: url,
                suggestedDirectoryName: expect.any(String),
                approvedAddresses: ['93.184.216.34'],
            },
        });
    });

    it.each([
        ['http://example.com/team/project', 'unsupported-url'],
        ['https://user@example.com/team/project', 'invalid-url'],
        ['https://example.com/team/project?token=secret', 'invalid-url'],
        ['https://127.0.0.1/team/project', 'invalid-host'],
        ['https://localhost/team/project', 'invalid-host'],
        ['https://example.com/', 'invalid-path'],
        ['git@example.com:team/project.git', 'invalid-url'],
        ['https://example.com/team%2fproject', 'invalid-url'],
        ['https://example.com/team/project%00', 'invalid-path'],
    ] as const)('rejects unsafe URL syntax', async (url, reason) => {
        const service = new PublicGitSourceService();

        await expect(service.inspect(url)).resolves.toEqual({
            ok: false,
            reason,
        });
        expect(lookup).not.toHaveBeenCalled();
    });

    it.each([
        [[{ address: '10.0.0.1', family: 4 }]],
        [[{ address: '2001:db8::1', family: 6 }]],
        [[{ address: '::ffff:7f00:1', family: 6 }]],
        [
            [
                { address: '93.184.216.34', family: 4 },
                { address: '192.168.1.2', family: 4 },
            ],
        ],
        [[]],
    ])('rejects empty, mixed, and non-public DNS answers', async (answers) => {
        lookup.mockResolvedValueOnce(answers);
        const service = new PublicGitSourceService();

        await expect(
            service.inspect('https://example.com/team/project.git'),
        ).resolves.toEqual({ ok: false, reason: 'non-public-host' });
    });

    it('maps DNS failure without exposing the hostname resolution error', async () => {
        lookup.mockRejectedValueOnce(new Error('resolver details'));
        const service = new PublicGitSourceService();

        await expect(
            service.inspect('https://example.com/team/project.git'),
        ).resolves.toEqual({ ok: false, reason: 'dns-unavailable' });
    });
});
