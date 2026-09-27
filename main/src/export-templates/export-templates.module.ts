import { Module } from '@mariodebono/di';
import { ArchivesModule } from '../archives/archives.module.js';
import { EditorCatalogModule } from '../editor-catalog/editor-catalog.module.js';
import { ProjectsStoreModule } from '../projects/projects-store.module.js';
import { ExportTemplatesController } from './export-templates.controller.js';
import { ExportTemplatesService } from './export-templates.service.js';
import { TemplateArchiveAdapter } from './template-archive.adapter.js';
/** Provides shared-template inventory and management. */
@Module({
    imports: [ArchivesModule, EditorCatalogModule, ProjectsStoreModule],
    providers: [
        TemplateArchiveAdapter,
        ExportTemplatesService,
        ExportTemplatesController,
    ],
})
export class ExportTemplatesModule {}
