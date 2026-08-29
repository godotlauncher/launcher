import logger from 'electron-log/main.js';
import type { AppIntegrationRefreshContext } from './app-integration.types.js';

export type AppIntegrationRefreshDiagnosticPhase =
    | 'credential-read'
    | 'credential-decrypt'
    | 'credential-parse'
    | 'credential-classified'
    | 'broker-rotation'
    | 'provider-validation'
    | 'credential-persist'
    | 'metadata-update';

export type AppIntegrationRefreshDiagnosticCode =
    | 'broker-invalid-response'
    | 'broker-rejected-token'
    | 'broker-unavailable'
    | 'credential-invalid'
    | 'credential-missing'
    | 'github-forbidden'
    | 'github-unauthorised'
    | 'identity-mismatch'
    | 'network-error'
    | 'refresh-token-expired'
    | 'refresh-token-missing'
    | 'secure-storage-error'
    | 'timed-out'
    | 'unknown';

export type AppIntegrationRefreshDiagnostic = AppIntegrationRefreshContext & {
    providerId: string;
    phase: AppIntegrationRefreshDiagnosticPhase;
    outcome: 'started' | 'succeeded' | 'temporary-failure' | 'terminal-failure';
    accessTokenState?: 'current' | 'expired' | 'near-expiry' | 'non-expiring';
    refreshTokenState?: 'missing' | 'present' | 'recorded-expired' | 'unknown';
    code?: AppIntegrationRefreshDiagnosticCode;
    status?: number | null;
    requestId?: string | null;
};

/** Writes one allowlisted credential-refresh diagnostic without secret values. */
export function logAppIntegrationRefreshDiagnostic(
    diagnostic: AppIntegrationRefreshDiagnostic,
): void {
    logger.debug('App integration credential refresh', {
        processId: process.pid,
        ...diagnostic,
    });
}
