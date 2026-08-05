import { Module } from '@mariodebono/di';
import { VSCodiumIntegration } from './vscodiumIntegration.js';

@Module({
    providers: [VSCodiumIntegration],
    exports: [VSCodiumIntegration],
})
export class VSCodiumIntegrationModule {}
