import { describe, expect, it } from 'vitest';
import { normalizeGitRemoteUrl } from './git-remote-url-normalizer.util.js';

describe('normalizeGitRemoteUrl', () => {
    it.each([
        [
            'https://GitHub.com:443/GodotLauncher/Launcher.git/',
            'https://github.com/GodotLauncher/Launcher',
        ],
        [
            'https://github.com/GodotLauncher/Launcher',
            'https://github.com/GodotLauncher/Launcher',
        ],
    ])('normalises anonymous HTTPS Git roots', (value, expected) => {
        expect(normalizeGitRemoteUrl(value)).toBe(expected);
    });

    it('preserves case-sensitive repository paths', () => {
        expect(
            normalizeGitRemoteUrl('https://example.com/Owner/Repo.git'),
        ).not.toBe(normalizeGitRemoteUrl('https://example.com/owner/repo.git'));
    });

    it.each([
        'git@github.com:owner/repository.git',
        'http://github.com/owner/repository.git',
        'https://token@github.com/owner/repository.git',
        'https://github.com/owner/repository.git?token=secret',
        'https://github.com/',
    ])('rejects unsupported or credential-bearing remotes', (value) => {
        expect(normalizeGitRemoteUrl(value)).toBeNull();
    });
});
