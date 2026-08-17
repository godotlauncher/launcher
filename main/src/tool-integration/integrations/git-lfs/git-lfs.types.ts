import type { GitLfsTrackingPolicy } from '@shared/contracts';

export type GitLfsConfigurationResult =
    | {
          status: 'configured';
          trackingPolicy: GitLfsTrackingPolicy;
      }
    | { status: 'unavailable' }
    | {
          status: 'failed';
          stage: 'install' | 'track' | 'verify';
      };
