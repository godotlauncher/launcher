export const TOOL_INTEGRATION_TAG = Symbol('tool-integration');
export const TOOL_INTEGRATION_MODULE_OPTIONS = Symbol(
    'tool-integration-module-options',
);

export const TOOL_INTEGRATION_SCHEMA_VERSION = 2 as const;

export const TOOL_POSITIVE_REFRESH_INTERVAL_MS = 30 * 1000;
export const TOOL_NEGATIVE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const TOOL_DEFAULT_EXECUTION_TIMEOUT_MS = 15 * 1000;
export const TOOL_MAX_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
