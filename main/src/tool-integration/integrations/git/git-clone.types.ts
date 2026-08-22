export type GitCloneRequest = {
    canonicalUrl: string;
    destinationPath: string;
    supportDirectory: string;
    signal: AbortSignal;
    onProgress: (percent: number) => void;
} & (
    | {
          source: 'public';
          approvedAddresses: string[];
      }
    | {
          source: 'connected';
          credential: {
              username: string;
              password: string;
          };
      }
);

export type GitCloneResult =
    | { ok: true }
    | {
          ok: false;
          reason:
              | 'git-unavailable'
              | 'public-clone-incompatible'
              | 'clone-failed'
              | 'cancelled';
      };
