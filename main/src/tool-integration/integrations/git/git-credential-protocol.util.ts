import { TextDecoder } from 'node:util';

const PROTOCOL_MAGIC = Buffer.from('GLAP', 'ascii');
const PROTOCOL_VERSION = 1;
const BOUND_REQUEST_VERSION = 2;
const REQUEST_LENGTH = 49;
const BOUND_PROTOCOL_BYTES = 8;
const BOUND_HOST_BYTES = 255;
const BOUND_PATH_BYTES = 2_048;
const BOUND_REQUEST_LENGTH =
    REQUEST_LENGTH +
    1 +
    BOUND_PROTOCOL_BYTES +
    1 +
    BOUND_HOST_BYTES +
    2 +
    BOUND_PATH_BYTES;
const RESPONSE_HEADER_LENGTH = 8;
const SESSION_REF_LENGTH = 43;
const MAX_CREDENTIAL_BYTES = 8_192;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export type GitCredentialKind = 'username' | 'password';

export type GitCredentialTarget = {
    protocol: string;
    host: string;
    path: string;
};

export type GitCredentialProtocolRequest = {
    kind: GitCredentialKind;
    sessionRef: string;
    target: GitCredentialTarget | null;
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
 * Creates one fixed destination-bound credential request frame.
 *
 * @param sessionRef - Opaque 43-character session reference.
 * @param kind - Credential field requested by Git.
 * @param target - Structured Git credential destination.
 * @returns The complete fixed-size destination-bound request frame.
 */
export function createBoundGitCredentialRequest(
    sessionRef: string,
    kind: GitCredentialKind,
    target: GitCredentialTarget,
): Buffer {
    if (!isSessionRef(sessionRef)) {
        throw new Error('Git credential session reference is invalid');
    }
    const protocol = encodeTargetField(target.protocol, BOUND_PROTOCOL_BYTES);
    const host = encodeTargetField(target.host, BOUND_HOST_BYTES);
    const targetPath = encodeTargetField(target.path, BOUND_PATH_BYTES);
    const frame = Buffer.alloc(BOUND_REQUEST_LENGTH);
    PROTOCOL_MAGIC.copy(frame);
    frame[4] = BOUND_REQUEST_VERSION;
    frame[5] = kind === 'username' ? 1 : 2;
    frame.write(sessionRef, 6, SESSION_REF_LENGTH, 'ascii');
    frame[49] = protocol.length;
    protocol.copy(frame, 50);
    frame[58] = host.length;
    host.copy(frame, 59);
    frame.writeUInt16BE(targetPath.length, 314);
    targetPath.copy(frame, 316);
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
    if (frame.length === BOUND_REQUEST_LENGTH) {
        return parseBoundGitCredentialRequest(frame);
    }
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
              target: null,
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

/** Returns the maximum accepted complete credential request frame length. */
export function getGitCredentialRequestLimit(): number {
    return BOUND_REQUEST_LENGTH;
}

/**
 * Resolves the exact frame length for one request protocol version.
 *
 * @param version - Request version read from the fixed protocol prefix.
 * @returns Required frame length, or null for an unsupported version.
 */
export function getGitCredentialRequestLengthForVersion(
    version: number,
): number | null {
    if (version === PROTOCOL_VERSION) {
        return REQUEST_LENGTH;
    }
    return version === BOUND_REQUEST_VERSION ? BOUND_REQUEST_LENGTH : null;
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
 * Parses one fixed destination-bound request frame.
 *
 * @param frame - Complete untrusted request bytes.
 * @returns Validated destination-bound request, or null.
 */
function parseBoundGitCredentialRequest(
    frame: Buffer,
): GitCredentialProtocolRequest | null {
    if (
        !frame.subarray(0, 4).equals(PROTOCOL_MAGIC) ||
        frame[4] !== BOUND_REQUEST_VERSION ||
        (frame[5] !== 1 && frame[5] !== 2)
    ) {
        return null;
    }
    const sessionRef = frame.subarray(6, 49).toString('ascii');
    const protocol = decodeTargetField(
        frame,
        frame[49] ?? 0,
        50,
        BOUND_PROTOCOL_BYTES,
    );
    const host = decodeTargetField(frame, frame[58] ?? 0, 59, BOUND_HOST_BYTES);
    const targetPath = decodeTargetField(
        frame,
        frame.readUInt16BE(314),
        316,
        BOUND_PATH_BYTES,
    );
    return isSessionRef(sessionRef) && protocol && host && targetPath
        ? {
              kind: frame[5] === 1 ? 'username' : 'password',
              sessionRef,
              target: { protocol, host, path: targetPath },
          }
        : null;
}

/**
 * Encodes one bounded credential-target field.
 *
 * @param value - Structured target value.
 * @param maximumBytes - Fixed frame slot size.
 * @returns Validated UTF-8 bytes.
 */
function encodeTargetField(value: string, maximumBytes: number): Buffer {
    const encoded = Buffer.from(value);
    if (
        encoded.length === 0 ||
        encoded.length > maximumBytes ||
        hasControlCharacter(value)
    ) {
        throw new Error('Git credential target is invalid');
    }
    return encoded;
}

/**
 * Decodes one bounded credential-target field and verifies zero padding.
 *
 * @param frame - Complete destination-bound request.
 * @param length - Declared UTF-8 field length.
 * @param offset - Fixed field slot offset.
 * @param maximumBytes - Fixed field slot size.
 * @returns Validated field text, or null.
 */
function decodeTargetField(
    frame: Buffer,
    length: number,
    offset: number,
    maximumBytes: number,
): string | null {
    if (
        length < 1 ||
        length > maximumBytes ||
        frame
            .subarray(offset + length, offset + maximumBytes)
            .some((byte) => byte !== 0)
    ) {
        return null;
    }
    let value: string;
    try {
        value = utf8Decoder.decode(frame.subarray(offset, offset + length));
    } catch {
        return null;
    }
    return hasControlCharacter(value) ? null : value;
}

/**
 * Returns whether text contains a control character unsafe for Git framing.
 *
 * @param value - Untrusted credential protocol text.
 * @returns Whether the text contains a control character.
 */
function hasControlCharacter(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
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
