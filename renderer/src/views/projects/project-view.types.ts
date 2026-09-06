import type { UserPreferences } from '@shared/contracts';

/** Available presentations of the same project collection. */
export type ProjectViewMode = NonNullable<
    UserPreferences['projects_view_mode']
>;
