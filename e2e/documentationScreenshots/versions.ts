import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export const APP_UPDATE_VERSION = packageJson.version.split('-')[0];
export const APP_UPDATE_MESSAGE = `New version available: ${APP_UPDATE_VERSION}`;
export const APP_UPDATE_RELEASE_URL = `https://github.com/godotlauncher/launcher/releases/tag/v${APP_UPDATE_VERSION}`;
