import { Module } from '@mariodebono/di';
import { ConfigService } from '@mariodebono/di-config';
import { CodeEditorIntegrationModule } from '../codeEditorIntegration/codeEditorIntegration.module.js';
import type { AppConfig } from '../config/index.js';
import { EditorCatalogModule } from '../editor-catalog/editor-catalog.module.js';
import { JsonStoreModule } from '../json-store/json-store.module.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { ProjectsStoreModule } from '../projects/projects-store.module.js';
import { EditorInstallService } from './editor-install.service.js';
import { EditorInstallProgressService } from './editor-install-progress.service.js';
import { EditorInstallsController } from './editor-installs.controller.js';
import { EditorProjectRepairAdapter } from './editor-project-repair.adapter.js';
import { InstalledEditorService } from './installed-editor.service.js';
import { InstalledEditorStore } from './installed-editor.store.js';

@Module({
    imports: [
        JsonStoreModule,
        EditorCatalogModule,
        CodeEditorIntegrationModule,
        ProjectsStoreModule,
    ],
    providers: [
        {
            provide: InstalledEditorStore,
            inject: [JsonStoreCoordinatorService, ConfigService],
            useFactory: (
                coordinator: JsonStoreCoordinatorService,
                configService: ConfigService<AppConfig>,
            ) =>
                new InstalledEditorStore(
                    coordinator,
                    configService.getOrThrow(
                        'paths.installedReleasesCachePath',
                    ),
                ),
        },
        EditorProjectRepairAdapter,
        InstalledEditorService,
        EditorInstallProgressService,
        EditorInstallService,
        EditorInstallsController,
    ],
    exports: [InstalledEditorService, EditorInstallService],
})
export class EditorInstallsModule {}
