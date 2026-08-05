import type { CodeEditorId } from '@shared/contracts';
import { updateVSCodiumDotNetConfiguration } from './vscodiumDotNetConfiguration.js';
import {
    updateVSCodiumRecommendations,
    updateVSCodiumWorkspaceSettings,
} from './vscodiumWorkspaceConfiguration.js';

export async function configureVSCodiumProject(
    projectDir: string,
    godotLaunchPath: string,
    godotVersion: number,
    isMono: boolean,
    previousCodeEditorId: CodeEditorId | null = null,
): Promise<string[]> {
    const switchingFromVSCode = previousCodeEditorId === 'vscode';
    const recoveredFiles = await updateVSCodiumWorkspaceSettings(
        projectDir,
        godotLaunchPath,
        godotVersion,
    );
    recoveredFiles.push(
        ...(await updateVSCodiumRecommendations(
            projectDir,
            isMono,
            switchingFromVSCode,
        )),
    );

    if (isMono) {
        recoveredFiles.push(
            ...(await updateVSCodiumDotNetConfiguration(
                projectDir,
                godotLaunchPath,
                switchingFromVSCode,
            )),
        );
    }

    return recoveredFiles;
}
