import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstalledTools } from './installedTools.js';

const platformMocks = vi.hoisted(() => ({
    findExecutable: vi.fn(),
    getCommandVersion: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

const vscodeMocks = vi.hoisted(() => ({
    getVSCodeInstallPath: vi.fn(),
}));

vi.mock('../utils/vscode.utils.js', () => vscodeMocks);

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('./userPreferences.js', () => userPreferencesMocks);

const { findExecutable, getCommandVersion } = platformMocks;
const { getVSCodeInstallPath } = vscodeMocks;
const { getUserPreferences } = userPreferencesMocks;

describe('getInstalledTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        findExecutable.mockResolvedValue(null);
        getCommandVersion.mockResolvedValue('');
        getUserPreferences.mockResolvedValue({ vs_code_path: '' });
        getVSCodeInstallPath.mockResolvedValue(null);
    });

    it('reads the git version from the resolved executable path', async () => {
        findExecutable.mockResolvedValue('/opt/homebrew/bin/git');
        getCommandVersion.mockResolvedValue('git version 2.54.0');

        const tools = await getInstalledTools();

        expect(getCommandVersion).toHaveBeenCalledWith('/opt/homebrew/bin/git');
        expect(tools).toContainEqual({
            name: 'Git',
            version: 'git version 2.54.0',
            path: '/opt/homebrew/bin/git',
        });
    });

    it('does not read a git version when git is not found', async () => {
        const tools = await getInstalledTools();

        expect(getCommandVersion).not.toHaveBeenCalled();
        expect(tools.some((tool) => tool.name === 'Git')).toBe(false);
    });
});
