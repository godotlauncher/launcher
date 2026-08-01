import { Module } from '@mariodebono/di';
import { CodeEditorIntegrationController } from './codeEditorIntegration.controller.js';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import { VSCodeIntegration } from './integrations/vscode/vscodeIntegration.js';
import { VSCodeIntegrationModule } from './integrations/vscode/vscodeIntegration.module.js';

@Module({
    imports: [VSCodeIntegrationModule],
    providers: [
        {
            provide: CodeEditorIntegrationRegistry,
            inject: [VSCodeIntegration],
            useFactory: (
                vscode: VSCodeIntegration,
            ): CodeEditorIntegrationRegistry =>
                new CodeEditorIntegrationRegistry([vscode]),
        },
        CodeEditorIntegrationService,
        CodeEditorIntegrationController,
    ],
    exports: [CodeEditorIntegrationService],
})
export class CodeEditorIntegrationModule {}
