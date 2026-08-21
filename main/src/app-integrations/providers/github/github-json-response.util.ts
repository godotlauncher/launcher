export class GitHubJsonResponseError extends Error {
    /** Creates a response error that never includes provider-controlled data. */
    constructor() {
        super('GitHub returned an invalid response');
        this.name = 'GitHubJsonResponseError';
    }
}

/**
 * Reads and parses one JSON response without buffering beyond the byte limit.
 *
 * @param response - Fetch response whose body is provider-controlled.
 * @param maximumBytes - Maximum decompressed response bytes to accept.
 * @returns The parsed JSON value.
 */
export async function readGitHubJsonResponse(
    response: Response,
    maximumBytes: number,
): Promise<unknown> {
    const contentLength = response.headers.get('content-length');
    if (
        contentLength !== null &&
        /^[0-9]+$/u.test(contentLength) &&
        Number(contentLength) > maximumBytes
    ) {
        await cancelResponseBody(response);
        throw new GitHubJsonResponseError();
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new GitHubJsonResponseError();
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) {
            break;
        }
        receivedBytes += result.value.byteLength;
        if (receivedBytes > maximumBytes) {
            try {
                await reader.cancel();
            } catch {
                // The bounded response is rejected even when cancellation fails.
            }
            throw new GitHubJsonResponseError();
        }
        chunks.push(result.value);
    }

    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (text.length === 0) {
            throw new GitHubJsonResponseError();
        }
        return JSON.parse(text) as unknown;
    } catch {
        throw new GitHubJsonResponseError();
    }
}

/**
 * Cancels an unused provider response body without replacing the safe error.
 *
 * @param response - Oversized provider response.
 */
async function cancelResponseBody(response: Response): Promise<void> {
    try {
        await response.body?.cancel();
    } catch {
        // The bounded response is rejected even when cancellation fails.
    }
}
