import path from 'node:path';
import { Module } from '@mariodebono/di';
import { ConfigService } from '@mariodebono/di-config';
import type { AppConfig } from '../config/index.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { JsonStoreModule } from '../json-store/json-store.module.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { ProjectsStore } from './projects.store.js';

/** Provides the one canonical project store to project-owned workflows. */
@Module({
    imports: [JsonStoreModule],
    providers: [
        {
            provide: ProjectsStore,
            inject: [JsonStoreCoordinatorService, ConfigService],
            useFactory: (
                coordinator: JsonStoreCoordinatorService,
                configService: ConfigService<AppConfig>,
            ) =>
                new ProjectsStore(
                    coordinator,
                    path.resolve(
                        configService.getOrThrow('paths.configDir'),
                        PROJECTS_FILENAME,
                    ),
                ),
        },
    ],
    exports: [ProjectsStore],
})
export class ProjectsStoreModule {}
