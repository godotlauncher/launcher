import type { CodeEditorId, ProjectDetails } from '@shared/contracts';
import { readProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import type { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';

export type CodeEditorProjectMode = {
    codeEditorId: CodeEditorId | null;
    withVSCode: boolean;
};

export function resolveCodeEditorProjectMode(
    project: Pick<ProjectDetails, 'codeEditorId' | 'withVSCode'>,
): CodeEditorProjectMode {
    const codeEditorId =
        project.codeEditorId === undefined
            ? project.withVSCode
                ? 'vscode'
                : null
            : project.codeEditorId;

    return {
        codeEditorId,
        withVSCode: codeEditorId === 'vscode',
    };
}

export async function resolvePortableCodeEditorIdForWrite(
    projectPath: string,
    canonicalId: CodeEditorId | null,
    codeEditorIntegrationService: CodeEditorIntegrationService,
): Promise<string | null> {
    const existingConfig = await readProjectLauncherConfig(projectPath);

    return codeEditorIntegrationService.resolvePortableSelectionId(
        canonicalId,
        existingConfig?.code_editor?.id,
    );
}
