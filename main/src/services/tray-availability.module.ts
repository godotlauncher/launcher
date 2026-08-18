import { Module } from '@mariodebono/di';
import { TrayAvailabilityService } from './tray-availability.service.js';

/** Provides the process-wide system tray availability service. */
@Module({
    providers: [TrayAvailabilityService],
    exports: [TrayAvailabilityService],
})
export class TrayAvailabilityModule {}
