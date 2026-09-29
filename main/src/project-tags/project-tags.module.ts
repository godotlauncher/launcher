import path from 'node:path';
import { Module } from '@mariodebono/di';
import { ConfigService } from '@mariodebono/di-config';
import type { AppConfig } from '../config/index.js';
import { PROJECT_TAGS_FILENAME } from '../constants.js';
import { JsonStoreModule } from '../json-store/json-store.module.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { ProjectsStoreModule } from '../projects/projects-store.module.js';
import { ProjectTagService } from './project-tag.service.js';
import { ProjectTagStore } from './project-tag.store.js';
import { ProjectTagsController } from './project-tags.controller.js';

/** Provides project tag persistence and bridge operations. */
@Module({
    imports: [JsonStoreModule, ProjectsStoreModule],
    providers: [
        {
            provide: ProjectTagStore,
            inject: [JsonStoreCoordinatorService, ConfigService],
            useFactory: (
                coordinator: JsonStoreCoordinatorService,
                configService: ConfigService<AppConfig>,
            ) =>
                new ProjectTagStore(
                    coordinator,
                    path.resolve(
                        configService.getOrThrow('paths.configDir'),
                        PROJECT_TAGS_FILENAME,
                    ),
                ),
        },
        ProjectTagService,
        ProjectTagsController,
    ],
    exports: [ProjectTagService],
})
export class ProjectTagsModule {}
