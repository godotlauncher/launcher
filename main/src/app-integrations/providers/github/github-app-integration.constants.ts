export const LOCAL_BROKER_ORIGIN = 'http://127.0.0.1:8787';
export const PRODUCTION_BROKER_ORIGIN = 'https://auth.godotlauncher.org';
export const BROKER_REQUEST_TIMEOUT_MS = 10_000;
export const BROKER_RESPONSE_MAX_BYTES = 64 * 1024;

export const COMPLETION_PATH_PREFIX = '/oauth/github/callback/';
export const COMPLETION_TICKET_PATTERN = /^[A-Za-z0-9_-]{38,8192}$/u;
export const LOCAL_BROKER_COMPLETION_URL = `${LOCAL_BROKER_ORIGIN}/v1/oauth/github/complete`;
export const PRODUCTION_BROKER_COMPLETION_URL = `${PRODUCTION_BROKER_ORIGIN}/v1/oauth/github/complete`;

export const GITHUB_USER_URL = 'https://api.github.com/user';
export const GITHUB_INSTALLATIONS_URL =
    'https://api.github.com/user/installations';
export const GITHUB_REQUEST_TIMEOUT_MS = 10_000;
export const GITHUB_INSTALLATIONS_PER_PAGE = 100;
export const MAX_INSTALLATION_PAGES = 10;
export const GITHUB_USER_RESPONSE_MAX_BYTES = 64 * 1024;
export const GITHUB_INSTALLATION_PAGE_MAX_BYTES = 1024 * 1024;
export const GITHUB_REPOSITORIES_PER_PAGE = 50;
export const GITHUB_REPOSITORY_PAGE_MAX_BYTES = 2 * 1024 * 1024;
export const GITHUB_REPOSITORY_RESPONSE_MAX_BYTES = 256 * 1024;
export const GITHUB_MAX_RENAME_REDIRECTS = 3;
