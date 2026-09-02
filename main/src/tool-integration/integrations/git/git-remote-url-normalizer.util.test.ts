import { describe, expect, it } from 'vitest';
import {
    normalizeGitRemoteUrl,
    toGitHubRepositoryWebUrl,
} from './git-remote-url-normalizer.util.js';

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

describe('toGitHubRepositoryWebUrl', () => {
    it.each([
        [
            'https://GitHub.com/Owner/Repository.git',
            'https://github.com/Owner/Repository',
        ],
        [
            'git@github.com:Owner/Repository.git',
            'https://github.com/Owner/Repository',
        ],
        [
            'ssh://git@github.com/Owner/Repository.git',
            'https://github.com/Owner/Repository',
        ],
    ])('derives standard GitHub repository pages', (value, expected) => {
        expect(toGitHubRepositoryWebUrl(value)).toBe(expected);
    });

    it.each([
        'https://token@github.com/owner/repository.git',
        'https://github.example.com/owner/repository.git',
        'https://github.com/owner/nested/repository.git',
        'https://github.com/owner/repository.git?token=secret',
        'git@example.com:owner/repository.git',
        'ssh://other@github.com/owner/repository.git',
        'ssh://git@github.com:2222/owner/repository.git',
        'git@github.com:owner/repository%2fgit',
    ])('rejects unsafe or unsupported GitHub remotes', (value) => {
        expect(toGitHubRepositoryWebUrl(value)).toBeNull();
    });
});
