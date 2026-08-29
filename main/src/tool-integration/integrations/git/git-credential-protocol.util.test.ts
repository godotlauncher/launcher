import { describe, expect, it } from 'vitest';
import {
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
            });
        }
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
