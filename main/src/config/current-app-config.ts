import { configuration } from './app-config.js';
import type { AppConfig } from './app-config.schema.js';

let currentAppConfig: AppConfig | undefined;

export function setCurrentAppConfig(config: AppConfig): void {
    currentAppConfig = config;
}

export function getCurrentAppConfig(): AppConfig {
    return currentAppConfig ?? configuration();
}

export function getCurrentAppConfigIfInitialized(): AppConfig | undefined {
    return currentAppConfig;
}

export function __resetCurrentAppConfigForTesting(): void {
    currentAppConfig = undefined;
}
