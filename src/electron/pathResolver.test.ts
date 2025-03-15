import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { getUIPath, getAssetPath, getPreloadPath } from './pathResolver';

vi.mock('electron', () => ({
    app: {
        getAppPath: vi.fn(() => '/app/path'),
    },
}));

describe('Path Resolver', () => {
    it('should get UI path', () => {
        const uiPath = getUIPath();

        expect(uiPath).toBe(path.join('/app/path', '/dist-react/index.html'));
    });

    it('should get asset path for dev', () => {
        vi.stubEnv('NODE_ENV', 'development');

        const assetPath = getAssetPath();
        expect(assetPath).toBe(path.join('/app/path', 'src/assets'));
    });

    it('should get asset path for prod', () => {
        vi.stubEnv('NODE_ENV', 'production');

        const assetPath = getAssetPath();
        expect(assetPath).toBe(path.join('/app', 'src/assets'));
    });

    it('should get preload path for dev', () => {
        vi.stubEnv('NODE_ENV', 'development');

        const preloadPath = getPreloadPath();
        expect(preloadPath).toBe(path.join('/app/path', 'dist-electron/preload.cjs'));
    });

    it('should get preload path for prod', () => {
        vi.stubEnv('NODE_ENV', 'production');

        const preloadPath = getPreloadPath();
        expect(preloadPath).toBe(path.join('/app', 'dist-electron/preload.cjs'));
    });

});