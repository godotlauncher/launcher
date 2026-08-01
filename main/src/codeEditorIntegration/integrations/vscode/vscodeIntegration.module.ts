import { Module } from '@mariodebono/di';
import { VSCodeIntegration } from './vscodeIntegration.js';
import { VS_CODE_INTEGRATION } from './vscodeIntegration.token.js';

@Module({
    providers: [
        {
            provide: VS_CODE_INTEGRATION,
            useClass: VSCodeIntegration,
        },
    ],
    exports: [VS_CODE_INTEGRATION],
})
export class VSCodeIntegrationModule {}
