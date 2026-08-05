import { Module } from '@mariodebono/di';
import { CodeEditorIntegrationController } from './codeEditorIntegration.controller.js';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import { CodeEditorIntegrationSettingsStore } from './codeEditorIntegration.settingsStore.js';
import type { CodeEditorIntegration } from './codeEditorIntegration.types.js';
import { VSCodeIntegration } from './integrations/vscode/vscodeIntegration.js';
import { VSCodeIntegrationModule } from './integrations/vscode/vscodeIntegration.module.js';
import { VSCodiumIntegration } from './integrations/vscodium/vscodiumIntegration.js';
import { VSCodiumIntegrationModule } from './integrations/vscodium/vscodiumIntegration.module.js';

@Module({
    imports: [VSCodeIntegrationModule, VSCodiumIntegrationModule],
    providers: [
        {
            provide: CodeEditorIntegrationRegistry,
            inject: [VSCodeIntegration, VSCodiumIntegration],
            useFactory: (
                vscode: CodeEditorIntegration,
                vscodium: CodeEditorIntegration,
            ) => new CodeEditorIntegrationRegistry([vscode, vscodium]),
        },
        CodeEditorIntegrationSettingsStore,
        CodeEditorIntegrationService,
        CodeEditorIntegrationController,
    ],
    exports: [CodeEditorIntegrationService],
})
export class CodeEditorIntegrationModule {}
