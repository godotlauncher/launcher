import { createServer, type Server, type ServerResponse } from 'node:http';
import { Injectable } from '@mariodebono/di';
import {
    COMPLETION_PATH_PREFIX,
    COMPLETION_TICKET_PATTERN,
    LOCAL_BROKER_COMPLETION_URL,
    PRODUCTION_BROKER_COMPLETION_URL,
} from './github-app-integration.constants.js';
import type {
    GitHubLoopbackCompletion,
    GitHubLoopbackListener,
} from './github-app-integration.types.js';

@Injectable()
export class GitHubAuthLoopbackListenerService {
    /**
     * Starts an OS-assigned listener on IPv6 loopback, then IPv4 loopback.
     *
     * @param nonce - Random listener nonce encoded as base64url.
     * @param useLocalBroker - Whether the local broker completion page is used.
     * @param signal - Connection-attempt cancellation signal.
     * @returns The ready listener and its broker descriptor.
     */
    async start(
        nonce: string,
        useLocalBroker: boolean,
        signal: AbortSignal,
    ): Promise<GitHubLoopbackListener> {
        try {
            return await this.listen('::1', nonce, useLocalBroker, signal);
        } catch {
            if (signal.aborted) {
                throw signal.reason;
            }
            return this.listen('127.0.0.1', nonce, useLocalBroker, signal);
        }
    }

    /** Starts one concrete loopback listener. */
    private async listen(
        host: '127.0.0.1' | '::1',
        nonce: string,
        useLocalBroker: boolean,
        signal: AbortSignal,
    ): Promise<GitHubLoopbackListener> {
        let resolveCompletion:
            | ((completion: GitHubLoopbackCompletion) => void)
            | undefined;
        let rejectCompletion: ((reason?: unknown) => void) | undefined;
        let queuedCompletion: GitHubLoopbackCompletion | undefined;
        let responsePending = false;
        let closed = false;

        const waitForCompletion = (): Promise<GitHubLoopbackCompletion> => {
            if (queuedCompletion) {
                const completion = queuedCompletion;
                queuedCompletion = undefined;
                return Promise.resolve(completion);
            }
            if (closed) {
                return Promise.reject(new Error('Loopback listener is closed'));
            }
            if (resolveCompletion) {
                return Promise.reject(
                    new Error('A loopback completion is already awaited'),
                );
            }
            return new Promise<GitHubLoopbackCompletion>((resolve, reject) => {
                resolveCompletion = resolve;
                rejectCompletion = reject;
            });
        };
        const server = createServer((request, response) => {
            if (closed || responsePending || queuedCompletion) {
                respondText(
                    response,
                    409,
                    'This connection request is closed.',
                );
                return;
            }
            if (
                request.method !== 'GET' ||
                request.socket.remoteAddress !== host ||
                !request.url ||
                request.url.length > 9_000
            ) {
                respondText(response, 400, 'Invalid connection request.');
                return;
            }

            const url = new URL(request.url, `http://${formatHost(host)}`);
            const ticket = url.searchParams.get('ticket');
            if (
                url.pathname !== `${COMPLETION_PATH_PREFIX}${nonce}` ||
                url.searchParams.size !== 1 ||
                !ticket ||
                !COMPLETION_TICKET_PATTERN.test(ticket)
            ) {
                respondText(response, 400, 'Invalid connection request.');
                return;
            }

            responsePending = true;
            const completion: GitHubLoopbackCompletion = {
                ticket,
                respond: (completed) => {
                    if (response.writableEnded) {
                        return;
                    }
                    responsePending = false;
                    if (completed) {
                        response.writeHead(302, {
                            'Cache-Control': 'no-store',
                            Location: useLocalBroker
                                ? LOCAL_BROKER_COMPLETION_URL
                                : PRODUCTION_BROKER_COMPLETION_URL,
                        });
                        response.end();
                    } else {
                        respondText(
                            response,
                            400,
                            'GitHub connection was not completed.',
                        );
                    }
                },
            };
            if (resolveCompletion) {
                const resolve = resolveCompletion;
                resolveCompletion = undefined;
                rejectCompletion = undefined;
                resolve(completion);
            } else {
                queuedCompletion = completion;
            }
        });

        const close = () => closeServer(server);
        const handleAbort = () => {
            closed = true;
            rejectCompletion?.(signal.reason);
            resolveCompletion = undefined;
            rejectCompletion = undefined;
            void close();
        };
        signal.addEventListener('abort', handleAbort, { once: true });

        try {
            await listenOnLoopback(server, host);
        } catch (error) {
            signal.removeEventListener('abort', handleAbort);
            await close();
            throw error;
        }

        const address = server.address();
        if (!address || typeof address === 'string') {
            signal.removeEventListener('abort', handleAbort);
            await close();
            throw new Error('Loopback listener did not receive a port');
        }

        return {
            descriptor: { host, port: address.port, nonce },
            waitForCompletion,
            close: async () => {
                closed = true;
                rejectCompletion?.(new Error('Loopback listener is closed'));
                resolveCompletion = undefined;
                rejectCompletion = undefined;
                signal.removeEventListener('abort', handleAbort);
                await close();
            },
        };
    }
}

/** Formats a loopback host for use as a URL authority. */
function formatHost(host: '127.0.0.1' | '::1'): string {
    return host === '::1' ? '[::1]' : host;
}

/** Starts listening on one loopback address. */
function listenOnLoopback(
    server: Server,
    host: '127.0.0.1' | '::1',
): Promise<void> {
    return new Promise((resolve, reject) => {
        const handleError = (error: Error) => reject(error);
        server.once('error', handleError);
        server.listen({ host, port: 0, exclusive: true }, () => {
            server.off('error', handleError);
            resolve();
        });
    });
}

/** Closes a listener without failing if it is already closed. */
function closeServer(server: Server): Promise<void> {
    return new Promise((resolve) => {
        if (!server.listening) {
            resolve();
            return;
        }
        server.close(() => resolve());
        server.closeAllConnections();
    });
}

/** Writes a small credential-free loopback response. */
function respondText(
    response: ServerResponse,
    status: number,
    message: string,
): void {
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
    });
    response.end(message);
}
