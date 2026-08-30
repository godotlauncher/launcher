import { describe, expect, it } from 'vitest';
import {
    getGitCredentialHelperInputLimit,
    parseGitCredentialHelperOperation,
    parseGitCredentialHelperTarget,
} from './git-credential-helper.util.js';

describe('Git credential helper utilities', () => {
    it.each(['get', 'store', 'erase'] as const)(
        'accepts the %s operation',
        (operation) => {
            expect(parseGitCredentialHelperOperation(operation)).toBe(
                operation,
            );
        },
    );

    it.each([undefined, '', 'fill', 'GET'])(
        'rejects an unsupported operation',
        (operation) => {
            expect(parseGitCredentialHelperOperation(operation)).toBeNull();
        },
    );

    it('parses an exact destination and ignores unrelated attributes', () => {
        expect(
            parseGitCredentialHelperTarget(
                Buffer.from(
                    'protocol=https\nhost=github.com\npath=godotlauncher/my-game.git\nwwwauth[]=Basic realm="GitHub"\n\n',
                ),
            ),
        ).toEqual({
            protocol: 'https',
            host: 'github.com',
            path: 'godotlauncher/my-game.git',
        });
    });

    it.each([
        '',
        'host=github.com\npath=owner/repository.git\n',
        'protocol=https\npath=owner/repository.git\n',
        'protocol=https\nhost=github.com\n',
        'protocol=https\nprotocol=http\nhost=github.com\npath=owner/repository.git\n',
        'protocol=https\nhost=github.com\nhost=example.com\npath=owner/repository.git\n',
        'protocol=https\nhost=github.com\npath=owner/repository.git\r\n',
        'protocol=https\nhost=github.com\nmalformed\npath=owner/repository.git\n',
    ])('rejects malformed or incomplete input', (input) => {
        expect(parseGitCredentialHelperTarget(Buffer.from(input))).toBeNull();
    });

    it('rejects oversized input', () => {
        expect(
            parseGitCredentialHelperTarget(
                Buffer.alloc(getGitCredentialHelperInputLimit() + 1, 'x'),
            ),
        ).toBeNull();
    });
});
