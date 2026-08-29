export type GitPushFailureReason =
    | 'git-unavailable'
    | 'local-repository-changed'
    | 'origin-failed'
    | 'authentication-failed'
    | 'network-unavailable'
    | 'push-failed'
    | 'verification-failed';

export type GitPushRequest = {
    projectPath: string;
    canonicalUrl: string;
    credential: {
        username: string;
        password: string;
    };
    signal: AbortSignal;
};

export type GitPushResult =
    | { ok: true; canonicalUrl: string }
    | { ok: false; reason: GitPushFailureReason };
