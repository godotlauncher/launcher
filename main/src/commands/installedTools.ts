import type { InstalledTool } from '@shared/contracts';
import { findExecutable, getCommandVersion } from '../utils/platform.utils.js';

export async function getInstalledTools(): Promise<InstalledTool[]> {
    const installedTools: InstalledTool[] = [];

    // check if git is installed
    const gitPath = await findExecutable('git');

    if (gitPath) {
        const gitVersion = await getCommandVersion(gitPath);
        installedTools.push({
            name: 'Git',
            version: gitVersion,
            path: gitPath,
        });
    }

    return installedTools;
}
