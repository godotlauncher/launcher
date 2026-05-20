import { type DynamicModule, Module } from '@mariodebono/di';
import { ConfigModule } from '@mariodebono/di-config';
import { type AppConfig, AppConfigSchema } from './config/index.js';
import { ElectronApp } from './electron-app.js';

@Module({
    providers: [ElectronApp],
})
// biome-ignore lint/complexity/noStaticOnlyClass: DI modules use static forRoot entrypoints
export class AppModule {
    static forRoot(appConfig: AppConfig): DynamicModule {
        return {
            module: AppModule,
            imports: [
                ConfigModule.forRoot<AppConfig>({
                    cache: true,
                    isGlobal: true,
                    loadProcessEnv: false,
                    load: [() => appConfig],
                    validationSchema: AppConfigSchema,
                }),
            ],
        };
    }
}
