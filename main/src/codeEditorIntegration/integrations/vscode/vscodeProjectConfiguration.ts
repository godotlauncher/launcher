import { updateVSCodeDotNetConfiguration } from './vscodeDotNetConfiguration.js';
import {
    updateVSCodeRecommendations,
    updateVSCodeWorkspaceSettings,
} from './vscodeWorkspaceConfiguration.js';

export async function updateVSCodeSettings(
    projectDir: string,
    launchPath: string,
    editorVersion: number,
    isMono: boolean,
    switchingFromVSCodium = false,
): Promise<string[]> {
    const recoveredFiles = await updateVSCodeWorkspaceSettings(
        projectDir,
        launchPath,
        editorVersion,
    );

    if (isMono) {
        recoveredFiles.push(
            ...(await updateVSCodeDotNetConfiguration(
                projectDir,
                launchPath,
                switchingFromVSCodium,
            )),
        );
    }

    return recoveredFiles;
}

export function addVSCodeNETLaunchConfig(
    projectDir: string,
    launchPath: string,
    removeVSCodiumConfiguration = false,
): Promise<string[]> {
    return updateVSCodeDotNetConfiguration(
        projectDir,
        launchPath,
        removeVSCodiumConfiguration,
    );
}

export function addOrUpdateVSCodeRecommendedExtensions(
    projectDir: string,
    isMono: boolean,
    removeVSCodiumRecommendation = false,
): Promise<string[]> {
    return updateVSCodeRecommendations(
        projectDir,
        isMono,
        removeVSCodiumRecommendation,
    );
}
