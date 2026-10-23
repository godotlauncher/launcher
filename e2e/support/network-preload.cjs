const fs = require('node:fs');
const path = require('node:path');

const nativeFetch = globalThis.fetch;
const state = { requests: [], unexpectedRequests: [] };
globalThis.__launcherTestNetwork = state;

/** Maps committed release summaries to the GitHub API response shape.
 * @param repository - Repository whose fixture releases should be returned.
 */
function readReleases(repository) {
    const filename =
        repository === 'godot' ? 'releases.json' : 'prereleases.json';
    const fixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../fixtures', filename), 'utf8'),
    );
    return fixture.releases.map((release, index) => ({
        id: index + 1,
        name: release.name,
        tag_name: release.tag ?? release.version,
        published_at: release.published_at,
        draft: release.draft ?? false,
        prerelease: release.prerelease,
        assets: release.assets.map((asset, assetIndex) => ({
            id: index * 1000 + assetIndex + 1,
            name: asset.name,
            browser_download_url: asset.download_url,
            ...(asset.digest ? { digest: asset.digest } : {}),
        })),
    }));
}

/** Blocks external requests which have no fixture response.
 * @param url - Destination URL, excluding credentials and query parameters.
 */
function unexpectedRequest(url) {
    const message = `Unexpected network request: ${url.origin}${url.pathname}. Add a test mock.`;
    state.unexpectedRequests.push(message);
    fs.appendFileSync(
        process.env.GODOT_LAUNCHER_E2E_NETWORK_LOG,
        `${message}\n`,
    );
    return new Error(message);
}

// Loaded with Electron --require, before application imports and migrations.
globalThis.fetch = async (input, init) => {
    const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
    );
    const method = (init?.method ?? input.method ?? 'GET').toUpperCase();
    const route = /^\/repos\/godotengine\/(godot|godot-builds)\/releases$/.exec(
        url.pathname,
    );
    if (url.origin === 'https://api.github.com' && method === 'GET' && route) {
        const page = Number(url.searchParams.get('page') ?? 1);
        const perPage = Number(url.searchParams.get('per_page') ?? 30);
        if (
            Number.isInteger(page) &&
            page > 0 &&
            Number.isInteger(perPage) &&
            perPage > 0 &&
            perPage <= 100
        ) {
            state.requests.push(url.href);
            return Response.json(
                readReleases(route[1]).slice(
                    (page - 1) * perPage,
                    page * perPage,
                ),
            );
        }
    }
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        return nativeFetch(input, { ...init, redirect: 'error' });
    }
    throw unexpectedRequest(url);
};

// Chromium requests use a different transport from Node fetch. Prevent GitHub
// navigation and downloads there as well, including redirect destinations.
const { app, session } = require('electron');
const guardedSessions = new WeakSet();

/** Installs the guard in every Chromium session, including the updater's.
 * @param target - Electron session whose GitHub traffic must be mocked.
 */
function guardSession(target) {
    if (guardedSessions.has(target)) return;
    guardedSessions.add(target);
    target.webRequest.onBeforeRequest(
        {
            urls: [
                '*://github.com/*',
                '*://*.github.com/*',
                '*://githubusercontent.com/*',
                '*://*.githubusercontent.com/*',
                '*://githubassets.com/*',
                '*://*.githubassets.com/*',
            ],
        },
        (details, callback) => {
            unexpectedRequest(new URL(details.url));
            callback({ cancel: true });
        },
    );
}
app.on('session-created', guardSession);
app.whenReady().then(() => guardSession(session.defaultSession));
