'use strict';

const os = require('node:os');
const path = require('node:path');
const { syncBuiltinESMExports } = require('node:module');

const shouldOverride = process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS === '1';
const overrideHomeDir = process.env.GODOT_LAUNCHER_DOCS_HOME_DIR;

if (
    shouldOverride &&
    typeof overrideHomeDir === 'string' &&
    overrideHomeDir.length > 0
) {
    const resolvedHome = path.resolve(overrideHomeDir);
    Object.defineProperty(os, 'homedir', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: () => resolvedHome,
    });
    // Keep ESM named exports (import * as os from 'node:os') in sync with this override.
    syncBuiltinESMExports();
}
