import { Module } from '@mariodebono/di';
import { CodeEditorIntegrationModule } from '../codeEditorIntegration/codeEditorIntegration.module.js';
import { EditorInstallsModule } from '../editor-installs/editor-installs.module.js';
import { TrayAvailabilityModule } from '../services/tray-availability.module.js';
import { GitModule } from '../tool-integration/integrations/git/git.module.js';
import { GitLfsModule } from '../tool-integration/integrations/git-lfs/git-lfs.module.js';
import { ProjectCreationService } from './project-creation.service.js';
import { ProjectImportService } from './project-import.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ProjectsStoreModule } from './projects-store.module.js';

/** Owns project bridge requests and project workflow orchestration. */
@Module({
    imports: [
        ProjectsStoreModule,
        CodeEditorIntegrationModule,
        EditorInstallsModule,
        GitModule,
        GitLfsModule,
        TrayAvailabilityModule,
    ],
    providers: [
        ProjectCreationService,
        ProjectImportService,
        ProjectsService,
        ProjectsController,
    ],
    exports: [ProjectsService],
})
export class ProjectsModule {}
