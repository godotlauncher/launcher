import type { CodeEditorId } from '@shared/contracts';
import { readProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import type { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
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
