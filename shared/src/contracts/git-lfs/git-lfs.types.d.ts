export type GitLfsTrackingPolicy = 'godot-documentation-defaults';

export type GitLfsTrackingGroupId =
    | 'models'
    | 'images'
    | 'audio'
    | 'fontsAndIcons'
    | 'godot';

export type GitLfsTrackingPolicyDescriptor = {
    id: GitLfsTrackingPolicy;
    groups: Array<{
        id: GitLfsTrackingGroupId;
        patterns: string[];
    }>;
};
