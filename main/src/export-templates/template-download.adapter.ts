import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { ExportTemplateAsset } from '@shared/contracts';
import { TemplateDownloadError } from './template-download.error.js';

/** Fetches official HTTPS assets with bounded redirects and cancellation.
 * @param url - Catalogue asset URL or HTTPS redirect.
 * @param init - Request options.
 */
export async function requestTemplateDownload(
    url: string,
    init: RequestInit,
): Promise<Response> {
    for (let redirects = 0; redirects < 6; redirects++) {
        if (new URL(url).protocol !== 'https:')
            throw new Error('exportTemplates:errors.package');
        let response: Response;
        try {
            response = await fetch(url, { ...init, redirect: 'manual' });
        } catch (cause) {
            if (
                init.signal?.aborted &&
                init.signal.reason?.name !== 'TimeoutError'
            )
                throw init.signal.reason;
            const network =
                cause instanceof TypeError ||
                (cause instanceof Error && cause.name === 'TimeoutError');
            throw new TemplateDownloadError(network ? 'network' : 'unknown', {
                cause,
            });
        }
        if ([401, 403, 404, 410].includes(response.status)) {
            await response.body?.cancel();
            throw new TemplateDownloadError('unavailable');
        }
        if (
            [408, 429].includes(response.status) ||
            (response.status >= 500 && response.status !== 501)
        ) {
            await response.body?.cancel();
            throw new TemplateDownloadError('server');
        }
        if (
            !response.ok &&
            ![405, 416, 501].includes(response.status) &&
            ![301, 302, 303, 307, 308].includes(response.status)
        ) {
            await response.body?.cancel();
            throw new TemplateDownloadError('unknown');
        }
        if (![301, 302, 303, 307, 308].includes(response.status))
            return response;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        url = new URL(location, url).href;
    }
    throw new TemplateDownloadError('unavailable');
}

/** Streams response bytes while keeping connection failures distinct from ZIP failures.
 * @param body - Network response body.
 * @param signal - Request cancellation or timeout.
 */
export async function* templateResponseChunks(
    body: NonNullable<Response['body']>,
    signal: AbortSignal,
): AsyncGenerator<Buffer> {
    try {
        for await (const chunk of Readable.fromWeb(
            body as unknown as ReadableStream<Uint8Array>,
        ))
            yield chunk;
    } catch (cause) {
        if (signal.aborted && signal.reason?.name !== 'TimeoutError')
            throw signal.reason;
        throw new TemplateDownloadError('network', { cause });
    }
}

/** Downloads a complete catalogue package once, with bounded size and streaming integrity.
 * @param asset - Main-resolved official package metadata.
 * @param destination - New archive in the operation's private staging folder.
 * @param signal - User cancellation.
 * @param onProgress - Downloaded bytes and complete package size.
 */
export async function downloadTemplatePackage(
    asset: ExportTemplateAsset,
    destination: string,
    signal: AbortSignal,
    onProgress: (receivedBytes: number, totalBytes: number) => void,
): Promise<void> {
    if (
        !Number.isSafeInteger(asset.sizeBytes) ||
        asset.sizeBytes < 22 ||
        asset.sizeBytes > 64 * 1024 ** 3
    )
        throw new TemplateDownloadError('invalid');
    const timeout = new AbortController();
    const combined = AbortSignal.any([signal, timeout.signal]);
    let idle: ReturnType<typeof setTimeout> | undefined;
    /** Resets the connection timeout after each received chunk. */
    const resetIdle = () => {
        clearTimeout(idle);
        idle = setTimeout(
            () =>
                timeout.abort(
                    new DOMException('Download timed out', 'TimeoutError'),
                ),
            120_000,
        );
    };
    resetIdle();
    try {
        const response = await requestTemplateDownload(asset.downloadUrl, {
            headers: { 'Accept-Encoding': 'identity' },
            signal: combined,
        });
        if (response.status !== 200 || !response.body) {
            await response.body?.cancel();
            throw new TemplateDownloadError(
                response.status >= 500 ? 'server' : 'unknown',
            );
        }
        const declared = response.headers.get('content-length');
        if (
            (declared && Number(declared) !== asset.sizeBytes) ||
            (response.headers.get('content-encoding') &&
                response.headers.get('content-encoding') !== 'identity')
        ) {
            await response.body.cancel();
            throw new TemplateDownloadError('changed');
        }
        const expectedDigest = asset.digest
            ?.match(/^sha256:([a-f0-9]{64})$/i)?.[1]
            ?.toLowerCase();
        const hash = expectedDigest ? createHash('sha256') : undefined;
        let received = 0;
        onProgress(0, asset.sizeBytes);
        const progress = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                resetIdle();
                received += chunk.length;
                if (received > asset.sizeBytes)
                    return callback(new TemplateDownloadError('changed'));
                hash?.update(chunk);
                onProgress(received, asset.sizeBytes);
                callback(null, chunk);
            },
        });
        await pipeline(
            Readable.from(templateResponseChunks(response.body, combined)),
            progress,
            fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
            { signal: combined },
        );
        if (received !== asset.sizeBytes)
            throw new TemplateDownloadError('changed');
        if (hash && hash.digest('hex') !== expectedDigest)
            throw new TemplateDownloadError('invalid');
    } catch (cause) {
        signal.throwIfAborted();
        if (timeout.signal.aborted)
            throw new TemplateDownloadError('network', { cause });
        if ((cause as NodeJS.ErrnoException)?.code === 'ENOSPC')
            throw new Error('exportTemplates:errors.space', { cause });
        throw cause;
    } finally {
        clearTimeout(idle);
    }
}
