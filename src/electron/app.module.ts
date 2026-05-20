import { Module } from '@mariodebono/di';
import { ElectronApp } from './electron-app.js';

@Module({
    providers: [ElectronApp],
})
export class AppModule {}
