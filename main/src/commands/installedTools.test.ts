import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstalledTools } from './installedTools.js';

const platformMocks = vi.hoisted(() => ({
    findExecutable: vi.fn(),
    getCommandVersion: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

const { findExecutable, getCommandVersion } = platformMocks;

describe('getInstalledTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        findExecutable.mockResolvedValue(null);
        getCommandVersion.mockResolvedValue('');
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
