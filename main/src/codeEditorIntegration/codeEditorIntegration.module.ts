import { Module } from '@mariodebono/di';
import { CodeEditorIntegrationController } from './codeEditorIntegration.controller.js';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import { CodeEditorIntegrationSettingsStore } from './codeEditorIntegration.settingsStore.js';
import type { CodeEditorIntegration } from './codeEditorIntegration.types.js';
import { VSCodeIntegrationModule } from './integrations/vscode/vscodeIntegration.module.js';
import { VS_CODE_INTEGRATION } from './integrations/vscode/vscodeIntegration.token.js';

@Module({
    imports: [VSCodeIntegrationModule],
    providers: [
        {
            provide: CodeEditorIntegrationRegistry,
            inject: [VS_CODE_INTEGRATION],
            useFactory: (vscode: CodeEditorIntegration) =>
                new CodeEditorIntegrationRegistry([vscode]),
        },
        CodeEditorIntegrationSettingsStore,
        CodeEditorIntegrationService,
        CodeEditorIntegrationController,
    ],
    exports: [CodeEditorIntegrationService],
})
export class CodeEditorIntegrationModule {}
