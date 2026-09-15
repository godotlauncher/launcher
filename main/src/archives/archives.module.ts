import { Module } from '@mariodebono/di';
import { ArchivesService } from './archives.service.js';

/** Provides archive operations to main-process features. */
@Module({ providers: [ArchivesService], exports: [ArchivesService] })
export class ArchivesModule {}
