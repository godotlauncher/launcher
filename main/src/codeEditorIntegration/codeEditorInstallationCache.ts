import { Injectable } from '@mariodebono/di';
import type { CodeEditorId } from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationSettingsStore } from './codeEditorIntegration.settingsStore.js';
import type { CodeEditorInstallation } from './codeEditorIntegration.types.js';

const POSITIVE_VALIDATION_INTERVAL_MS = 30 * 1000;
const NEGATIVE_RESCAN_INTERVAL_MS = 5 * 60 * 1000;

type ResolutionMode = 'snapshot' | 'revalidate' | 'rescan';

type InstallationCacheEntry = {
    settingsKey: string;
    installation: CodeEditorInstallation | null;
    checkedAt: number;
};

@Injectable()
export class CodeEditorInstallationCache {
    private readonly entries = new Map<CodeEditorId, InstallationCacheEntry>();
    private readonly inFlight = new Map<
        string,
        Promise<CodeEditorInstallation | null>
    >();

    constructor(
        private readonly registry: CodeEditorIntegrationRegistry,
        private readonly settingsStore: CodeEditorIntegrationSettingsStore,
    ) {}

    getSnapshot(
        integrationId: CodeEditorId,
        customPath?: string,
    ): Promise<CodeEditorInstallation | null> {
        return this.resolve(integrationId, customPath, 'snapshot');
    }

    revalidate(
        integrationId: CodeEditorId,
        customPath?: string,
    ): Promise<CodeEditorInstallation | null> {
        return this.resolve(integrationId, customPath, 'revalidate');
    }

    rescan(
        integrationId: CodeEditorId,
        customPath?: string,
    ): Promise<CodeEditorInstallation | null> {
        return this.resolve(integrationId, customPath, 'rescan');
    }

    invalidate(integrationId: CodeEditorId): void {
        this.entries.delete(integrationId);
    }

    private async resolve(
        integrationId: CodeEditorId,
        customPath: string | undefined,
        mode: ResolutionMode,
    ): Promise<CodeEditorInstallation | null> {
        const settingsKey = customPath ?? '';
        const entry = this.entries.get(integrationId);
        const current = entry?.settingsKey === settingsKey ? entry : undefined;
        const now = Date.now();

        if (mode === 'snapshot' && current) {
            return current.installation;
        }

        if (
            mode === 'revalidate' &&
            current &&
            now - current.checkedAt <
                (current.installation
                    ? POSITIVE_VALIDATION_INTERVAL_MS
                    : NEGATIVE_RESCAN_INTERVAL_MS)
        ) {
            return current.installation;
        }

        return this.runSingleFlight(
            integrationId,
            settingsKey,
            mode,
            async () => {
                if (mode === 'rescan') {
                    return this.discover(
                        integrationId,
                        customPath,
                        settingsKey,
                    );
                }
                if (current) {
                    return this.refresh(
                        integrationId,
                        customPath,
                        settingsKey,
                        current,
                    );
                }
                return this.hydrate(integrationId, customPath, settingsKey);
            },
        );
    }

    private async hydrate(
        integrationId: CodeEditorId,
        customPath: string | undefined,
        settingsKey: string,
    ): Promise<CodeEditorInstallation | null> {
        if (customPath !== undefined) {
            return this.discover(integrationId, customPath, settingsKey);
        }

        const persisted =
            await this.settingsStore.getDetectedInstallation(integrationId);
        if (!persisted) {
            return this.discover(integrationId, undefined, settingsKey);
        }

        if (!persisted.installation) {
            if (
                Date.now() - persisted.checkedAt <
                NEGATIVE_RESCAN_INTERVAL_MS
            ) {
                this.entries.set(integrationId, {
                    settingsKey,
                    installation: null,
                    checkedAt: persisted.checkedAt,
                });
                return null;
            }
            return this.discover(integrationId, undefined, settingsKey);
        }

        const validated = await this.registry
            .get(integrationId)
            .validateInstallation(persisted.installation);
        if (validated) {
            this.entries.set(integrationId, {
                settingsKey,
                installation: validated,
                checkedAt: Date.now(),
            });
            return validated;
        }

        return this.discover(integrationId, undefined, settingsKey);
    }

    private async refresh(
        integrationId: CodeEditorId,
        customPath: string | undefined,
        settingsKey: string,
        entry: InstallationCacheEntry,
    ): Promise<CodeEditorInstallation | null> {
        if (!entry.installation) {
            return this.discover(integrationId, customPath, settingsKey);
        }

        const validated = await this.registry
            .get(integrationId)
            .validateInstallation(entry.installation);
        if (validated) {
            this.entries.set(integrationId, {
                settingsKey,
                installation: validated,
                checkedAt: Date.now(),
            });
            return validated;
        }

        return this.discover(integrationId, customPath, settingsKey);
    }

    private async discover(
        integrationId: CodeEditorId,
        customPath: string | undefined,
        settingsKey: string,
    ): Promise<CodeEditorInstallation | null> {
        const installation = await this.registry
            .get(integrationId)
            .detectInstallation(customPath);
        const checkedAt = Date.now();
        this.entries.set(integrationId, {
            settingsKey,
            installation,
            checkedAt,
        });

        if (customPath === undefined) {
            await this.settingsStore.setDetectedInstallation(
                integrationId,
                installation,
                checkedAt,
            );
        }

        return installation;
    }

    private runSingleFlight(
        integrationId: CodeEditorId,
        settingsKey: string,
        mode: ResolutionMode,
        operation: () => Promise<CodeEditorInstallation | null>,
    ): Promise<CodeEditorInstallation | null> {
        const flightGroup = mode === 'rescan' ? 'rescan' : 'normal';
        const flightKey = `${integrationId}\0${settingsKey}\0${flightGroup}`;
        const existing = this.inFlight.get(flightKey);
        if (existing) {
            return existing;
        }

        const flight = operation().finally(() => {
            if (this.inFlight.get(flightKey) === flight) {
                this.inFlight.delete(flightKey);
            }
        });
        this.inFlight.set(flightKey, flight);
        return flight;
    }
}
