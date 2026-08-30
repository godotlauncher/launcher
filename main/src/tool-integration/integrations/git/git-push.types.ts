export type GitPushFailureReason =
    | 'git-unavailable'
    | 'local-repository-changed'
    | 'origin-failed'
    | 'authentication-failed'
    | 'network-unavailable'
    | 'remote-not-empty'
    | 'push-failed'
    | 'verification-failed';

export type GitPushRequest = {
    projectPath: string;
    canonicalUrl: string;
    requiresGitLfsUpload: boolean;
    requiresEmptyRemote: boolean;
    credential: {
        username: string;
        password: string;
    };
    signal: AbortSignal;
};

export type GitRemoteEmptyCheckRequest = Pick<
    GitPushRequest,
    'canonicalUrl' | 'credential' | 'signal'
>;

export type GitRemoteEmptyCheckResult =
    | { ok: true; empty: boolean }
    | { ok: false; reason: GitPushFailureReason };

export type GitPushResult =
    | { ok: true; canonicalUrl: string }
    | { ok: false; reason: GitPushFailureReason };
