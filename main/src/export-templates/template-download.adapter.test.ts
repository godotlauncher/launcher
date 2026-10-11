import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import type { ExportTemplateAsset } from '@shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTemplatePackage } from './template-download.adapter.js';

vi.mock('node:fs', () => ({ createWriteStream: vi.fn() }));
const fetchMock = vi.fn();
const bytes = Buffer.from('complete template archive contents');
const asset: ExportTemplateAsset = {
    id: 'templates',
    name: 'templates.tpz',
    flavor: 'gdscript',
    downloadUrl: 'https://example.test/templates.tpz',
    sizeBytes: bytes.length,
};
const destination = path.resolve('work', 'package.tpz');
let written: Buffer[];
beforeEach(() => {
    vi.resetAllMocks();
    written = [];
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response(bytes));
    vi.mocked(fs.createWriteStream).mockImplementation(
        () =>
            new Writable({
                write(chunk, _encoding, callback) {
                    written.push(Buffer.from(chunk));
                    callback();
                },
            }) as fs.WriteStream,
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('complete template downloads', () => {
    it('uses GET without HEAD or ranges, reports bytes and verifies the catalogue digest while streaming', async () => {
        const progress = vi.fn();
        const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        await downloadTemplatePackage(
            { ...asset, digest },
            destination,
            new AbortController().signal,
            progress,
        );
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledWith(
            asset.downloadUrl,
            expect.objectContaining({
                headers: { 'Accept-Encoding': 'identity' },
                redirect: 'manual',
            }),
        );
        expect(Buffer.concat(written)).toEqual(bytes);
        expect(progress).toHaveBeenLastCalledWith(bytes.length, bytes.length);
        expect(fs.createWriteStream).toHaveBeenCalledWith(destination, {
            flags: 'wx',
            mode: 0o600,
        });
    });
    it('rejects a package with a mismatched catalogue digest', async () => {
        await expect(
            downloadTemplatePackage(
                { ...asset, digest: `sha256:${'0'.repeat(64)}` },
                destination,
                new AbortController().signal,
                vi.fn(),
            ),
        ).rejects.toThrow('downloadInvalid');
    });
    it.each(['declared', 'short', 'long'])(
        'rejects %s package sizes',
        async (caseName) => {
            fetchMock.mockResolvedValueOnce(
                caseName === 'declared'
                    ? new Response(bytes, {
                          headers: {
                              'content-length': String(bytes.length + 1),
                          },
                      })
                    : new Response(
                          caseName === 'short'
                              ? bytes.subarray(0, 10)
                              : Buffer.concat([bytes, bytes]),
                      ),
            );
            await expect(
                downloadTemplatePackage(
                    asset,
                    destination,
                    new AbortController().signal,
                    vi.fn(),
                ),
            ).rejects.toThrow('downloadChanged');
        },
    );
    it.each([
        { status: 404, key: 'downloadUnavailable' },
        { status: 503, key: 'downloadServer' },
        { status: 206, key: 'downloadFailed' },
    ])('rejects HTTP $status', async ({ status, key }) => {
        fetchMock.mockResolvedValueOnce(new Response('error', { status }));
        await expect(
            downloadTemplatePackage(
                asset,
                destination,
                new AbortController().signal,
                vi.fn(),
            ),
        ).rejects.toThrow(key);
        expect(fs.createWriteStream).not.toHaveBeenCalled();
    });
    it('rejects HTTPS downgrades before requesting the redirected URL', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(null, {
                status: 302,
                headers: { location: 'http://example.test/templates.tpz' },
            }),
        );
        await expect(
            downloadTemplatePackage(
                asset,
                destination,
                new AbortController().signal,
                vi.fn(),
            ),
        ).rejects.toThrow('errors.package');
        expect(fetchMock).toHaveBeenCalledOnce();
    });
    it('keeps dropped connections distinct from invalid archives', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.error(new TypeError('connection dropped'));
                    },
                }),
            ),
        );
        await expect(
            downloadTemplatePackage(
                asset,
                destination,
                new AbortController().signal,
                vi.fn(),
            ),
        ).rejects.toThrow('downloadNetwork');
    });
    it('keeps disk-full failures distinct from network failures', async () => {
        vi.mocked(fs.createWriteStream).mockImplementationOnce(
            () =>
                new Writable({
                    write(_chunk, _encoding, callback) {
                        callback(
                            Object.assign(new Error('disk full'), {
                                code: 'ENOSPC',
                            }),
                        );
                    },
                }) as fs.WriteStream,
        );
        await expect(
            downloadTemplatePackage(
                asset,
                destination,
                new AbortController().signal,
                vi.fn(),
            ),
        ).rejects.toThrow('errors.space');
    });
    it('preserves user cancellation', async () => {
        const controller = new AbortController();
        controller.abort();
        fetchMock.mockRejectedValueOnce(controller.signal.reason);
        await expect(
            downloadTemplatePackage(
                asset,
                destination,
                controller.signal,
                vi.fn(),
            ),
        ).rejects.toMatchObject({ name: 'AbortError' });
    });
    it('stops an idle connection and classifies the timeout as a network failure', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(
            (_url, init: RequestInit) =>
                new Promise((_resolve, reject) =>
                    init.signal?.addEventListener('abort', () =>
                        reject(init.signal?.reason),
                    ),
                ),
        );
        const result = expect(
            downloadTemplatePackage(
                asset,
                destination,
                new AbortController().signal,
                vi.fn(),
            ),
        ).rejects.toThrow('downloadNetwork');
        await vi.advanceTimersByTimeAsync(120_000);
        await result;
        expect(vi.getTimerCount()).toBe(0);
    });
});
