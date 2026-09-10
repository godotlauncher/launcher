import { Module } from '@mariodebono/di';
import { ProjectsStoreModule } from '../../../projects/projects-store.module.js';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { TerminalController } from './terminal.controller.js';
import { TerminalService } from './terminal.service.js';
import { TerminalAdapterService } from './terminal-adapter.service.js';
import { TerminalCatalogueService } from './terminal-catalogue.service.js';
import { TerminalConfigurationService } from './terminal-configuration.service.js';
import { TerminalToolIntegration } from './terminal-tool.integration.js';

/** Registers one specialised Terminal tool and its narrow bridge. */
@Module({
    imports: [ToolIntegrationModule, ProjectsStoreModule],
    providers: [
        TerminalAdapterService,
        TerminalConfigurationService,
        TerminalCatalogueService,
        TerminalToolIntegration,
        TerminalService,
        TerminalController,
    ],
})
export class TerminalModule {}
