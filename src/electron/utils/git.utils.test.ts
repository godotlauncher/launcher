import { exec } from 'child_process';
import { describe, expect, it, vi } from 'vitest';
import { gitConfig, gitConfigGetUser, gitExists } from './git.utils';

const execMock = vi.mocked(exec);

describe('git.utils', () => {
    it('should check if git exists', async () => {
        const result = await gitExists();
        expect(result).toBe(true);
    });

    it('should get git config', async () => {
        const result = await gitConfig();
        expect(result).not.toBe('');
    });

    it('should get git user', async () => {
        const result = await gitConfigGetUser();
        expect(result).not.toBeNull();
    });
});
