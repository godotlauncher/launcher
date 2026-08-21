export type GitHubLoopbackDescriptor = {
    host: '127.0.0.1' | '::1';
    port: number;
    nonce: string;
};

export type GitHubAuthAttempt = {
    attemptId: string;
    attemptToken: string;
    browserUrl: string;
    expiresAt: number;
};

export type GitHubAuthIntent = 'connect' | 'reauthorise';

export type GitHubTokenBundle = {
    accessToken: string;
    expiresIn: number | null;
    refreshToken: string | null;
    refreshTokenExpiresIn: number | null;
    scope: string;
    tokenType: string;
};

export type GitHubOAuthRedemption = GitHubTokenBundle & {
    installationUrl: string | null;
};

export type GitHubSetupRedemption = {
    installationId: string;
};

export type GitHubStoredCredential = GitHubTokenBundle & {
    version: 1;
    createdAt: string;
};

export type GitHubUserIdentity = {
    id: number;
    login: string;
    name: string | null;
};

export type GitHubInstallation = {
    id: number;
    account: {
        login: string;
        type: 'Organization' | 'User';
    };
    html_url: string;
    suspended_at: string | null;
};

export type GitHubLoopbackCompletion = {
    ticket: string;
    respond: (completed: boolean) => void;
};

export type GitHubLoopbackListener = {
    descriptor: GitHubLoopbackDescriptor;
    waitForCompletion: () => Promise<GitHubLoopbackCompletion>;
    close: () => Promise<void>;
};
