import * as fs from 'node:fs';
import * as path from 'node:path';
import decompress from 'decompress';

import logger from 'electron-log';
import * as os from 'os';
import { checkAndUpdateProjects } from '../checks.js';
import { t } from '../i18n/index.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
} from '../utils/godot.utils.js';
import {
    addStoredInstalledRelease,
    downloadReleaseAsset,
    getPlatformAsset,
} from '../utils/releases.utils.js';
import { getUserPreferences } from './userPreferences.js';

export async function installRelease(
    release: ReleaseSummary,
    mono: boolean,
): Promise<InstallReleaseResult> {
    logger.info(`Installing release '${release.version}'`);

    // get install locations
    const { install_location: installLocation } = await getUserPreferences();
    let releasePath = path.resolve(
        installLocation,
        `${release.version}${mono ? '-mono' : ''}`,
    );
    const downloadPath = path.resolve(
        installLocation,
        'tmp',
        `${release.version}${mono ? '-mono' : ''}`,
    );

    try {
        // check the platform asset
        // pick the right asset for platform
        const asset = getPlatformAsset(
            os.platform(),
            os.arch(),
            release.assets,
        )?.find((a) => a.mono === mono);

        if (!asset) {
            return {
                success: false,
                error: t('installEditor:errors.noPlatformAsset'),
                version: release.version,
            };
        }

        // check if release already installed (folder name exists)

        if (fs.existsSync(releasePath)) {
            // if installed delete folder
            await fs.promises.rm(releasePath, { recursive: true, force: true });
        }
        if (!fs.existsSync(downloadPath)) {
            // await fs.promises.rm(downloadPath, { recursive: true, force: true });
            await fs.promises.mkdir(downloadPath, { recursive: true });
        }

        // create folder
        await fs.promises.mkdir(releasePath, { recursive: true });

        // always start from clean download
        if (fs.existsSync(path.resolve(downloadPath, asset.name))) {
            await fs.promises.rm(downloadPath, {
                recursive: true,
                force: true,
            });
        }

        // download release
        await downloadReleaseAsset(
            asset,
            path.resolve(downloadPath, asset.name),
        );

        // extract release
        let editor_path: string;

        switch (path.extname(asset.name)) {
            case '.zip': {
                await decompress(
                    path.resolve(downloadPath, asset.name),
                    path.resolve(releasePath),
                );

                switch (os.platform()) {
                    case 'win32':
                        // the mono version has an extra folder
                        if (mono) {
                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                                asset.name.replace('.zip', '.exe'),
                            );
                            releasePath = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        } else {
                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        }
                        break;
                    case 'darwin':
                        if (mono) {
                            editor_path = path.resolve(
                                releasePath,
                                'Godot_mono.app',
                            );
                        } else {
                            editor_path = path.resolve(
                                releasePath,
                                'Godot.app',
                            );
                        }
                        break;
                    case 'linux':
                        if (mono) {
                            let ext: string;

                            switch (os.arch()) {
                                case 'x64':
                                    ext = 'x86_64';
                                    break;
                                case 'arm':
                                    ext = 'arm32';
                                    break;
                                case 'arm64':
                                    ext = 'arm64';
                                    break;
                                default:
                                    ext = 'x86_32';
                                    break;
                            }

                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                                asset.name.replace(`_${ext}.zip`, `.${ext}`),
                            );
                            releasePath = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        } else {
                            editor_path = path.resolve(
                                releasePath,
                                asset.name.replace('.zip', ''),
                            );
                        }
                        break;
                    default:
                        throw new Error(
                            t('installEditor:errors.unsupportedPlatform'),
                        );
                }

                break;
            }

            default:
                throw new Error(
                    t('installEditor:errors.unsupportedFileExtension'),
                );
        }

        const config = getProjectDefinition(
            release.version_number,
            DEFAULT_PROJECT_DEFINITION,
        );
        if (!config) {
            return {
                success: false,
                error: t('installEditor:errors.invalidEditorVersion'),
                version: release.version,
            };
        }

        const installedRelease: InstalledRelease = {
            version: release.version,
            version_number: release.version_number,
            install_path: releasePath,
            editor_path,
            platform: os.platform(),
            arch: os.arch(),
            mono,
            config_version: config?.configVersion,
            prerelease: release.prerelease,
            published_at: release.published_at,
            valid: true,
        };
        // update installed releases
        await addStoredInstalledRelease(installedRelease);

        // remove temp folder
        await fs.promises.rm(path.resolve(downloadPath), {
            recursive: true,
            force: true,
        });

        await checkAndUpdateProjects();

        return {
            success: true,
            release: installedRelease,
            version: release.version,
        };
    } catch (error) {
        logger.error('ERROR:', error);
        try {
            // if error delete folder and file
            if (fs.existsSync(releasePath)) {
                // if installed return delete folder
                await fs.promises.rm(releasePath, {
                    recursive: true,
                    force: true,
                });
            }
        } catch (e) {
            // in case it is locked or runnning
            logger.log('Error cleaning up failed install', e);
        }

        return {
            success: false,
            error: (error as Error).message,
            version: release.version,
        };
    }
}
