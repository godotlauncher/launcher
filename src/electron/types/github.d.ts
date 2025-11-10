export interface ReleaseAsset {
    id: number;
    name: string;
    content_type: string;
    size: number;
    state: 'uploaded' | 'open';
    url: string;
    node_id: string;
    download_count: number;
    label: string | null;
    uploader: User | null;
    browser_download_url: string;
    created_at: string;
    updated_at: string;
}

export interface ReactionRollup {
    url: string;
    total_count: number;
    '+1': number;
    '-1': number;
    laugh: number;
    confused: number;
    heart: number;
    hooray: number;
    eyes: number;
    rocket: number;
}

export interface User {
    avatar_url: string;
    events_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    gravatar_id: string | null;
    html_url: string;
    id: number;
    node_id: string;
    login: string;
    organizations_url: string;
    received_events_url: string;
    repos_url: string;
    site_admin: boolean;
    starred_url: string;
    subscriptions_url: string;
    type: 'User';
    url: string;
    starred_at: string | null;
    user_view_type: string;
}

export interface Release {
    assets_url: string;
    upload_url: string;
    tarball_url: string | null;
    zipball_url: string | null;
    created_at: string;
    published_at: string | null;
    draft: boolean;
    id: number;
    node_id: string;
    author: User;
    html_url: string;
    name: string | null;
    prerelease: boolean;
    tag_name: string;
    target_commitish: string;
    assets: ReleaseAsset[];
    url: string;
    body_html?: string;
    body_text?: string;
    mentions_count?: number;
    discussion_url?: string;
    reactions: ReactionRollup;
}
