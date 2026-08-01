import { Module } from '@mariodebono/di';
import { CodeEditorIntegrationController } from './codeEditorIntegration.controller.js';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import { CODE_EDITOR_INTEGRATIONS } from './codeEditorIntegration.tokens.js';
import type { CodeEditorIntegration } from './codeEditorIntegration.types.js';
import { VSCodeIntegration } from './integrations/vscode/vscodeIntegration.js';
import { VSCodeIntegrationModule } from './integrations/vscode/vscodeIntegration.module.js';

@Module({
    imports: [VSCodeIntegrationModule],
    providers: [
        {
            provide: CODE_EDITOR_INTEGRATIONS,
            inject: [VSCodeIntegration],
            useFactory: (
                vscode: VSCodeIntegration,
            ): CodeEditorIntegration[] => [vscode],
        },
        {
            provide: CodeEditorIntegrationRegistry,
            inject: [CODE_EDITOR_INTEGRATIONS],
            useFactory: (
                integrations: CodeEditorIntegration[],
            ): CodeEditorIntegrationRegistry =>
                new CodeEditorIntegrationRegistry(integrations),
        },
        CodeEditorIntegrationService,
        CodeEditorIntegrationController,
    ],
    exports: [CodeEditorIntegrationService],
})
export class CodeEditorIntegrationModule {}
