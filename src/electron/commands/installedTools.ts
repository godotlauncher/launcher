import { findExecutable, getCommandVersion } from '../utils/platform.utils.js';
import { getVSCodeInstallPath } from '../utils/vscode.utils.js';
import { getUserPreferences } from './userPreferences.js';

export async function getInstalledTools(): Promise<InstalledTool[]> {
    const installedTools: InstalledTool[] = [];

    // check if git is installed
    const gitPath = await findExecutable('git');

    if (gitPath) {
        const gitVersion = gitPath ? await getCommandVersion('git') : '';
        installedTools.push({
            name: 'Git',
            version: gitVersion,
            path: gitPath,
        });
    }

    // check if vscode is installed
    const { vs_code_path } = await getUserPreferences();
    const vscodePath = await getVSCodeInstallPath(vs_code_path);

    if (vscodePath) {
        installedTools.push({
            name: 'VSCode',
            version: '',
            path: vscodePath ?? '',
        });
    }

    return installedTools;
}
