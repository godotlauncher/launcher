import { describe, expect, it, vi } from 'vitest';
import { ProjectRepositoryOriginIndexService } from './project-repository-origin-index.service.js';

/**
 * Creates a project-store snapshot with minimal test project records.
 *
 * @param version - Stable snapshot version.
 * @param projectPaths - Stored project paths in the snapshot.
 * @returns A minimal versioned project snapshot.
 */
function snapshot(version: string, projectPaths: string[]) {
    return {
        version,
        projects: projectPaths.map((projectPath) => ({ path: projectPath })),
    };
}

describe('ProjectRepositoryOriginIndexService', () => {
    it('caches origins for one project snapshot version', async () => {
        const projects = {
            snapshot: vi.fn(async () =>
                snapshot('version-one', ['/projects/game']),
            ),
        };
        const git = {
            getNormalizedRemoteOrigin: vi.fn(
                async () => 'https://github.com/team/game',
            ),
        };
        const service = new ProjectRepositoryOriginIndexService(
            projects as never,
            git as never,
        );

        await expect(service.getOrigins()).resolves.toEqual(
            new Set(['https://github.com/team/game']),
        );
        await expect(service.getOrigins()).resolves.toEqual(
            new Set(['https://github.com/team/game']),
        );

        expect(projects.snapshot).toHaveBeenCalledTimes(2);
        expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledOnce();
    });

    it('rebuilds after the project snapshot version changes', async () => {
        const projects = {
            snapshot: vi
                .fn()
                .mockResolvedValueOnce(
                    snapshot('version-one', ['/projects/first']),
                )
                .mockResolvedValueOnce(
                    snapshot('version-two', ['/projects/second']),
                ),
        };
        const git = {
            getNormalizedRemoteOrigin: vi
                .fn()
                .mockResolvedValueOnce('https://github.com/team/first')
                .mockResolvedValueOnce('https://github.com/team/second'),
        };
        const service = new ProjectRepositoryOriginIndexService(
            projects as never,
            git as never,
        );

        await expect(service.getOrigins()).resolves.toEqual(
            new Set(['https://github.com/team/first']),
        );
        await expect(service.getOrigins()).resolves.toEqual(
            new Set(['https://github.com/team/second']),
        );
        expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledTimes(2);
    });

    it('shares one in-flight build between concurrent callers', async () => {
        const origin = Promise.withResolvers<string | null>();
        const projects = {
            snapshot: vi.fn(async () =>
                snapshot('version-one', ['/projects/game']),
            ),
        };
        const git = {
            getNormalizedRemoteOrigin: vi.fn(() => origin.promise),
        };
        const service = new ProjectRepositoryOriginIndexService(
            projects as never,
            git as never,
        );

        const first = service.getOrigins();
        const second = service.getOrigins();
        await vi.waitFor(() =>
            expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledOnce(),
        );
        origin.resolve('https://github.com/team/game');

        await expect(Promise.all([first, second])).resolves.toEqual([
            new Set(['https://github.com/team/game']),
            new Set(['https://github.com/team/game']),
        ]);
    });

    it('does not let an older build replace the latest cached snapshot', async () => {
        const firstOrigin = Promise.withResolvers<string | null>();
        const projects = {
            snapshot: vi
                .fn()
                .mockResolvedValueOnce(
                    snapshot('version-one', ['/projects/first']),
                )
                .mockResolvedValue(
                    snapshot('version-two', ['/projects/second']),
                ),
        };
        const git = {
            getNormalizedRemoteOrigin: vi
                .fn()
                .mockReturnValueOnce(firstOrigin.promise)
                .mockResolvedValue('https://github.com/team/second'),
        };
        const service = new ProjectRepositoryOriginIndexService(
            projects as never,
            git as never,
        );

        const first = service.getOrigins();
        await vi.waitFor(() =>
            expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledOnce(),
        );
        await expect(service.getOrigins()).resolves.toEqual(
            new Set(['https://github.com/team/second']),
        );
        firstOrigin.resolve('https://github.com/team/first');
        await expect(first).resolves.toEqual(
            new Set(['https://github.com/team/first']),
        );

        await expect(service.getOrigins()).resolves.toEqual(
            new Set(['https://github.com/team/second']),
        );
        expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledTimes(2);
    });

    it('bounds origin reads and deduplicates stored project paths', async () => {
        const paths = Array.from(
            { length: 9 },
            (_, index) => `/projects/game-${index}`,
        );
        const releases: Array<() => void> = [];
        let active = 0;
        let maximumActive = 0;
        const projects = {
            snapshot: vi.fn(async () =>
                snapshot('version-one', [...paths, paths[0]]),
            ),
        };
        const git = {
            getNormalizedRemoteOrigin: vi.fn(async () => {
                active += 1;
                maximumActive = Math.max(maximumActive, active);
                await new Promise<void>((resolve) => releases.push(resolve));
                active -= 1;
                return null;
            }),
        };
        const service = new ProjectRepositoryOriginIndexService(
            projects as never,
            git as never,
        );

        const result = service.getOrigins();
        await vi.waitFor(() =>
            expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledTimes(4),
        );
        releases.splice(0).forEach((release) => {
            release();
        });
        await vi.waitFor(() =>
            expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledTimes(8),
        );
        releases.splice(0).forEach((release) => {
            release();
        });
        await vi.waitFor(() =>
            expect(git.getNormalizedRemoteOrigin).toHaveBeenCalledTimes(9),
        );
        releases.splice(0).forEach((release) => {
            release();
        });

        await expect(result).resolves.toEqual(new Set());
        expect(maximumActive).toBe(4);
    });

    it('keeps successful origins when another project read fails', async () => {
        const projects = {
            snapshot: vi.fn(async () =>
                snapshot('version-one', [
                    '/projects/first',
                    '/projects/second',
                ]),
            ),
        };
        const git = {
            getNormalizedRemoteOrigin: vi
                .fn()
                .mockRejectedValueOnce(new Error('failed'))
                .mockResolvedValueOnce('https://github.com/team/second'),
        };
        const service = new ProjectRepositoryOriginIndexService(
            projects as never,
            git as never,
        );

        await expect(service.getOrigins()).resolves.toEqual(
            new Set(['https://github.com/team/second']),
        );
    });
});
