import { Module } from '@mariodebono/di';
import { ConfigModule } from '@mariodebono/di-config';
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
    DEFAULT_LOCALE,
    I18N_NAMESPACES,
    SUPPORTED_LOCALES,
} from './i18n/config.js';
import { getLocalesPath } from './pathResolver.js';

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
    providers: [AppController, AppLifecycleService],
})
export class AppModule {}
