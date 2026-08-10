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
import { EDITOR_CATALOG_FILENAME } from './constants.js';
import { EditorCatalogModule } from './editor-catalog/editor-catalog.module.js';
import {
    DEFAULT_LOCALE,
    I18N_NAMESPACES,
    SUPPORTED_LOCALES,
} from './i18n/config.js';
import { getLocalesPath } from './pathResolver.js';
import { TrayAvailabilityService } from './services/tray-availability.service.js';

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
    ],
    providers: [AppController, AppLifecycleService, TrayAvailabilityService],
})
export class AppModule {}
