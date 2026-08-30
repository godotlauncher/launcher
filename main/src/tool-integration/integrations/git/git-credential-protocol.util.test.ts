import { describe, expect, it } from 'vitest';
import {
    createBoundGitCredentialRequest,
    createGitCredentialRequest,
    createGitCredentialResponse,
    parseGitCredentialRequest,
    parseGitCredentialResponse,
} from './git-credential-protocol.util.js';

const sessionRef = 'A'.repeat(43);

describe('Git credential protocol', () => {
    it('round trips fixed username and password requests', () => {
        for (const kind of ['username', 'password'] as const) {
            const frame = createGitCredentialRequest(sessionRef, kind);

            expect(frame).toHaveLength(49);
            expect(frame.subarray(0, 4).toString('ascii')).toBe('GLAP');
            expect(parseGitCredentialRequest(frame)).toEqual({
                kind,
                sessionRef,
                target: null,
            });
        }
    });

    it('round trips a fixed destination-bound request', () => {
        const frame = createBoundGitCredentialRequest(sessionRef, 'password', {
            protocol: 'https',
            host: 'github.com',
            path: 'godotlauncher/my-game.git',
        });

        expect(frame).toHaveLength(2_364);
        expect(parseGitCredentialRequest(frame)).toEqual({
            kind: 'password',
            sessionRef,
            target: {
                protocol: 'https',
                host: 'github.com',
                path: 'godotlauncher/my-game.git',
            },
        });
    });

    it.each([
        { protocol: '', host: 'github.com', path: 'owner/repository.git' },
        { protocol: 'https', host: '', path: 'owner/repository.git' },
        { protocol: 'https', host: 'github.com', path: '' },
        {
            protocol: 'https',
            host: 'github.com',
            path: 'owner/repository.git\nextra',
        },
    ])('rejects an invalid destination-bound target', (target) => {
        expect(() =>
            createBoundGitCredentialRequest(sessionRef, 'username', target),
        ).toThrow('Git credential target is invalid');
    });

    it('rejects malformed destination-bound padding', () => {
        const frame = createBoundGitCredentialRequest(sessionRef, 'username', {
            protocol: 'https',
            host: 'github.com',
            path: 'owner/repository.git',
        });
        frame[57] = 1;

        expect(parseGitCredentialRequest(frame)).toBeNull();
    });

    it.each([
        Buffer.alloc(48),
        Buffer.concat([
            Buffer.from('NOPE'),
            createGitCredentialRequest(sessionRef, 'username').subarray(4),
        ]),
        Buffer.from(createGitCredentialRequest(sessionRef, 'username')).fill(
            2,
            4,
            5,
        ),
        Buffer.from(createGitCredentialRequest(sessionRef, 'username')).fill(
            3,
            5,
            6,
        ),
        Buffer.from(createGitCredentialRequest(sessionRef, 'username')).fill(
            43,
            6,
            7,
        ),
    ])('rejects a malformed request frame', (frame) => {
        expect(parseGitCredentialRequest(frame)).toBeNull();
    });

    it('round trips a bounded UTF-8 response', () => {
        const frame = createGitCredentialResponse('tøken');

        expect(frame.subarray(0, 4).toString('ascii')).toBe('GLAP');
        expect(frame[4]).toBe(1);
        expect(frame[5]).toBe(0);
        expect(frame.readUInt16BE(6)).toBe(Buffer.byteLength('tøken'));
        expect(parseGitCredentialResponse(frame)).toBe('tøken');
    });

    it.each([
        createGitCredentialResponse(null),
        Buffer.from('NOPE\x01\x00\x00\x01x', 'binary'),
        Buffer.from('GLAP\x02\x00\x00\x01x', 'binary'),
        Buffer.from('GLAP\x01\x00\x00\x02x', 'binary'),
        Buffer.from('GLAP\x01\x00\x00\x01\xff', 'binary'),
    ])('rejects a malformed response frame', (frame) => {
        expect(() => parseGitCredentialResponse(frame)).toThrow(
            'Git credential response is invalid',
        );
    });

    it('rejects oversized and control-character credentials', () => {
        expect(() => createGitCredentialResponse('x'.repeat(8_193))).toThrow(
            'Git credential is invalid',
        );
        expect(() => createGitCredentialResponse('line\nbreak')).toThrow(
            'Git credential is invalid',
        );
    });
});
