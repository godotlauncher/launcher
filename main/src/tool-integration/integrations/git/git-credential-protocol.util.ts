import { TextDecoder } from 'node:util';

const PROTOCOL_MAGIC = Buffer.from('GLAP', 'ascii');
const PROTOCOL_VERSION = 1;
const REQUEST_LENGTH = 49;
const RESPONSE_HEADER_LENGTH = 8;
const SESSION_REF_LENGTH = 43;
const MAX_CREDENTIAL_BYTES = 8_192;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export type GitCredentialKind = 'username' | 'password';

export type GitCredentialProtocolRequest = {
    kind: GitCredentialKind;
    sessionRef: string;
};

/**
 * Creates one fixed credential request frame.
 *
 * @param sessionRef - Opaque 43-character session reference.
 * @param kind - Credential field requested by Git.
 * @returns The complete 49-byte request frame.
 */
export function createGitCredentialRequest(
    sessionRef: string,
    kind: GitCredentialKind,
): Buffer {
    if (!isSessionRef(sessionRef)) {
        throw new Error('Git credential session reference is invalid');
    }
    const frame = Buffer.alloc(REQUEST_LENGTH);
    PROTOCOL_MAGIC.copy(frame);
    frame[4] = PROTOCOL_VERSION;
    frame[5] = kind === 'username' ? 1 : 2;
    frame.write(sessionRef, 6, SESSION_REF_LENGTH, 'ascii');
    return frame;
}

/**
 * Parses one complete credential request frame.
 *
 * @param frame - Untrusted request bytes from a loopback client.
 * @returns The validated request, or null.
 */
export function parseGitCredentialRequest(
    frame: Buffer,
): GitCredentialProtocolRequest | null {
    if (
        frame.length !== REQUEST_LENGTH ||
        !frame.subarray(0, 4).equals(PROTOCOL_MAGIC) ||
        frame[4] !== PROTOCOL_VERSION ||
        (frame[5] !== 1 && frame[5] !== 2)
    ) {
        return null;
    }
    const sessionRef = frame.subarray(6).toString('ascii');
    return isSessionRef(sessionRef)
        ? {
              kind: frame[5] === 1 ? 'username' : 'password',
              sessionRef,
          }
        : null;
}

/**
 * Creates a successful or rejecting credential response frame.
 *
 * @param credential - Credential text, or null for rejection.
 * @returns The complete response frame.
 */
export function createGitCredentialResponse(credential: string | null): Buffer {
    const body =
        credential === null ? Buffer.alloc(0) : Buffer.from(credential);
    if (credential !== null && !isValidCredential(credential, body.length)) {
        body.fill(0);
        throw new Error('Git credential is invalid');
    }
    const frame = Buffer.alloc(RESPONSE_HEADER_LENGTH + body.length);
    PROTOCOL_MAGIC.copy(frame);
    frame[4] = PROTOCOL_VERSION;
    frame[5] = credential === null ? 1 : 0;
    frame.writeUInt16BE(body.length, 6);
    body.copy(frame, RESPONSE_HEADER_LENGTH);
    body.fill(0);
    return frame;
}

/**
 * Parses one complete successful credential response frame.
 *
 * @param frame - Untrusted response bytes from the loopback server.
 * @returns The validated credential.
 */
export function parseGitCredentialResponse(frame: Buffer): string {
    if (
        frame.length < RESPONSE_HEADER_LENGTH ||
        frame.length > RESPONSE_HEADER_LENGTH + MAX_CREDENTIAL_BYTES ||
        !frame.subarray(0, 4).equals(PROTOCOL_MAGIC) ||
        frame[4] !== PROTOCOL_VERSION ||
        frame[5] !== 0
    ) {
        throw new Error('Git credential response is invalid');
    }
    const bodyLength = frame.readUInt16BE(6);
    if (
        bodyLength === 0 ||
        bodyLength > MAX_CREDENTIAL_BYTES ||
        frame.length !== RESPONSE_HEADER_LENGTH + bodyLength
    ) {
        throw new Error('Git credential response is invalid');
    }
    let credential: string;
    try {
        credential = utf8Decoder.decode(frame.subarray(RESPONSE_HEADER_LENGTH));
    } catch {
        throw new Error('Git credential response is invalid');
    }
    if (!isValidCredential(credential, bodyLength)) {
        throw new Error('Git credential response is invalid');
    }
    return credential;
}

/** Returns the exact credential request frame length. */
export function getGitCredentialRequestLength(): number {
    return REQUEST_LENGTH;
}

/** Returns the maximum complete credential response frame length. */
export function getGitCredentialResponseLimit(): number {
    return RESPONSE_HEADER_LENGTH + MAX_CREDENTIAL_BYTES;
}

/**
 * Returns whether a session reference matches the fixed wire format.
 *
 * @param value - Untrusted session reference.
 * @returns Whether the value matches the fixed wire format.
 */
function isSessionRef(value: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/u.test(value);
}

/**
 * Returns whether credential text is safe for the wire format and Git output.
 *
 * @param value - Credential text to validate.
 * @param byteLength - UTF-8 byte length of the credential.
 * @returns Whether the credential can be returned safely.
 */
function isValidCredential(value: string, byteLength: number): boolean {
    return (
        value.length > 0 &&
        value.length <= 4_096 &&
        byteLength > 0 &&
        byteLength <= MAX_CREDENTIAL_BYTES &&
        ![...value].some((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint <= 31 || codePoint === 127;
        })
    );
}
