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

const CurrentStoredToolInstallationSchema = z.object({
    installation: ToolInstallationSchema.nullable(),
    checkedAt: z.number().int().nonnegative(),
    settingsFingerprint: z.string(),
});

const LegacyStoredToolInstallationSchema = z
    .object({
        installation: ToolInstallationSchema.nullable(),
        checkedAt: z.number().int().nonnegative(),
        settingsKey: z.string(),
    })
    .transform(({ settingsKey, ...snapshot }) => ({
        ...snapshot,
        settingsFingerprint: normalizeLegacySettingsFingerprint(settingsKey),
    }));

const StoredToolInstallationSchema = z.union([
    CurrentStoredToolInstallationSchema,
    LegacyStoredToolInstallationSchema,
]);

const ToolConfigurationSchema = z.record(z.string().min(1), z.json());

const StoredToolStateV1Schema = z.object({
    settings: ToolSettingsSchema,
    installations: z.record(
        z.string().min(1),
        z.record(z.string().min(1), StoredToolInstallationSchema),
    ),
});

const StoredToolStateSchema = StoredToolStateV1Schema.extend({
    configuration: ToolConfigurationSchema,
});

export const ToolIntegrationStoreFileSchema = z.object({
    schemaVersion: z.literal(TOOL_INTEGRATION_SCHEMA_VERSION),
    tools: z.record(z.string().min(1), StoredToolStateSchema),
});

const LegacyToolIntegrationStoreFileSchema = z
    .object({
        schemaVersion: z.literal(1),
        tools: z.record(z.string().min(1), StoredToolStateV1Schema),
    })
    .transform((legacy) => ({
        schemaVersion: TOOL_INTEGRATION_SCHEMA_VERSION,
        tools: Object.fromEntries(
            Object.entries(legacy.tools).map(([toolId, state]) => [
                toolId,
                { ...state, configuration: {} },
            ]),
        ),
    }));

const CompatibleToolIntegrationStoreFileSchema = z.union([
    ToolIntegrationStoreFileSchema,
    LegacyToolIntegrationStoreFileSchema,
]);

/**
 * Creates an empty store at the current tool integration schema version.
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
        configuration: {},
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
    const parsed = CompatibleToolIntegrationStoreFileSchema.parse(value);
    const tools = Object.fromEntries(
        Object.entries(parsed.tools)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([toolId, state]) => [
                toolId,
                {
                    settings: normalizeToolSettings(state.settings),
                    configuration: state.configuration,
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

/**
 * Converts the first development fingerprint format to the named format.
 *
 * @param settingsKey - Legacy serialized path and argument tuple.
 * @returns A named settings fingerprint, or the original value if unknown.
 */
function normalizeLegacySettingsFingerprint(settingsKey: string): string {
    try {
        const parsed: unknown = JSON.parse(settingsKey);
        if (Array.isArray(parsed) && parsed.length === 2) {
            return JSON.stringify({
                executablePathOverride: parsed[0],
                executableArgsOverride: parsed[1],
            });
        }
    } catch {
        return settingsKey;
    }
    return settingsKey;
}
