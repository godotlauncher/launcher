import { Module } from '@mariodebono/di';
import { VSCodeIntegration } from './vscodeIntegration.js';

@Module({
    providers: [VSCodeIntegration],
    exports: [VSCodeIntegration],
})
export class VSCodeIntegrationModule {}
