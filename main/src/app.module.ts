import { Module } from '@mariodebono/di';
import { ConfigModule, ConfigService } from '@mariodebono/di-config';
import {
    I18nModule,
    type I18nModuleOptions,
} from '@mariodebono/di-electron-i18n';
import { AppController } from './app.controller.js';
import { AppLifecycleService } from './app-lifecycle.service.js';
import { AppMigrationsModule } from './app-migrations/app-migrations.module.js';
import { CodeEditorIntegrationModule } from './codeEditorIntegration/codeEditorIntegration.module.js';
import {
    type AppConfig,
    AppConfigSchema,
    getCurrentAppConfig,
} from './config/index.js';
import {
    EDITOR_CATALOG_FILENAME,
    TOOL_INTEGRATIONS_FILENAME,
} from './constants.js';
import { EditorCatalogModule } from './editor-catalog/editor-catalog.module.js';
import { EditorInstallsModule } from './editor-installs/editor-installs.module.js';
import {
    DEFAULT_LOCALE,
    I18N_NAMESPACES,
    SUPPORTED_LOCALES,
} from './i18n/config.js';
import { getLocalesPath } from './pathResolver.js';
import { ProjectsModule } from './projects/projects.module.js';
import { TrayAvailabilityModule } from './services/tray-availability.module.js';
import { GitModule } from './tool-integration/integrations/git/git.module.js';
import { GitLfsModule } from './tool-integration/integrations/git-lfs/git-lfs.module.js';
import { ToolIntegrationModule } from './tool-integration/tool-integration.module.js';

@Module({
    imports: [
        ConfigModule.forRoot<AppConfig>({
            cache: true,
            isGlobal: true,
            loadProcessEnv: false,
            load: [getCurrentAppConfig],
            validationSchema: AppConfigSchema,
        }),
        AppMigrationsModule,
        CodeEditorIntegrationModule,
        EditorCatalogModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService<AppConfig>) => ({
                directory: configService.getOrThrow('paths.configDir'),
                fileName: EDITOR_CATALOG_FILENAME,
            }),
        }),
        EditorInstallsModule,
        I18nModule.forRootAsync({
            useFactory: () =>
                ({
                    localesRoot: getLocalesPath(),
                    supportedLocales: [...SUPPORTED_LOCALES],
                    namespaces: [...I18N_NAMESPACES],
                    fallbackLocale: DEFAULT_LOCALE,
                    initialLocale: DEFAULT_LOCALE,
                    systemLocale:
                        Intl.DateTimeFormat().resolvedOptions().locale,
                }) satisfies I18nModuleOptions,
        }),
        ToolIntegrationModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService<AppConfig>) => ({
                directory: configService.getOrThrow('paths.configDir'),
                fileName: TOOL_INTEGRATIONS_FILENAME,
            }),
        }),
        GitModule,
        GitLfsModule,
        ProjectsModule,
        TrayAvailabilityModule,
    ],
    providers: [AppController, AppLifecycleService],
})
export class AppModule {}
