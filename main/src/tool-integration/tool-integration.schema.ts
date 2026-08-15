import { z } from 'zod';
import { TOOL_INTEGRATION_SCHEMA_VERSION } from './tool-integration.constants.js';
import type {
    StoredToolState,
    ToolIntegrationStoreFile,
    ToolSettings,
} from './tool-integration.types.js';

const ToolSettingsSchema = z.object({
    enabled: z.boolean(),
    executablePathOverride: z.string().trim().min(1).nullable(),
    executableArgsOverride: z.array(z.string()).nullable(),
});

const ToolInstallationSchema = z.object({
    executablePath: z.string().trim().min(1),
    executableArgs: z.array(z.string()),
    version: z.string().nullable(),
    source: z.enum(['detected', 'override']),
});

const StoredToolInstallationSchema = z.object({
    installation: ToolInstallationSchema.nullable(),
    checkedAt: z.number().int().nonnegative(),
    settingsKey: z.string(),
});

const StoredToolStateSchema = z.object({
    settings: ToolSettingsSchema,
    installations: z.record(
        z.string().min(1),
        z.record(z.string().min(1), StoredToolInstallationSchema),
    ),
});

export const ToolIntegrationStoreFileSchema = z.object({
    schemaVersion: z.literal(TOOL_INTEGRATION_SCHEMA_VERSION),
    tools: z.record(z.string().min(1), StoredToolStateSchema),
});

/**
 * Creates the empty first-version tool integration store.
 *
 * @returns An empty valid store file.
 */
export function createEmptyToolIntegrationStore(): ToolIntegrationStoreFile {
    return {
        schemaVersion: TOOL_INTEGRATION_SCHEMA_VERSION,
        tools: {},
    };
}

/**
 * Creates the default persisted state for one tool.
 *
 * @returns Default settings and no installation snapshots.
 */
export function createDefaultStoredToolState(): StoredToolState {
    return {
        settings: createDefaultToolSettings(),
        installations: {},
    };
}

/**
 * Creates default runtime settings for one registered tool.
 *
 * @returns Enabled settings without execution overrides.
 */
export function createDefaultToolSettings(): ToolSettings {
    return {
        enabled: true,
        executablePathOverride: null,
        executableArgsOverride: null,
    };
}

/**
 * Normalizes a partial settings value into the stored runtime shape.
 *
 * @param settings - Partial settings to normalize.
 * @returns Complete normalized tool settings.
 */
export function normalizeToolSettings(
    settings: Partial<ToolSettings>,
): ToolSettings {
    const executablePath = settings.executablePathOverride?.trim() || null;
    const executableArgs = Array.isArray(settings.executableArgsOverride)
        ? settings.executableArgsOverride.filter(
              (argument): argument is string => typeof argument === 'string',
          )
        : [];

    return ToolSettingsSchema.parse({
        enabled: settings.enabled ?? true,
        executablePathOverride: executablePath,
        executableArgsOverride:
            executableArgs.length > 0 ? executableArgs : null,
    });
}

/**
 * Validates and deterministically orders a complete store value.
 *
 * @param value - Untrusted store value to normalize.
 * @returns Valid normalized tool integration data.
 */
export function normalizeToolIntegrationStore(
    value: unknown,
): ToolIntegrationStoreFile {
    const parsed = ToolIntegrationStoreFileSchema.parse(value);
    const tools = Object.fromEntries(
        Object.entries(parsed.tools)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([toolId, state]) => [
                toolId,
                {
                    settings: normalizeToolSettings(state.settings),
                    installations: sortInstallations(state.installations),
                },
            ]),
    );

    return ToolIntegrationStoreFileSchema.parse({
        schemaVersion: TOOL_INTEGRATION_SCHEMA_VERSION,
        tools,
    });
}

/**
 * Sorts platform and architecture keys for stable serialized output.
 *
 * @param installations - Stored installation snapshots to sort.
 * @returns Deterministically ordered installation snapshots.
 */
function sortInstallations(
    installations: StoredToolState['installations'],
): StoredToolState['installations'] {
    return Object.fromEntries(
        Object.entries(installations)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([platform, architectures]) => [
                platform,
                Object.fromEntries(
                    Object.entries(architectures).sort(([left], [right]) =>
                        left.localeCompare(right),
                    ),
                ),
            ]),
    );
}
