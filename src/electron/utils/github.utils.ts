import logger from 'electron-log';

import { createAssetSummary, sortReleases } from './releases.utils.js';

/**
 * Fetches a list of releases from the GitHub repository for Godot Engine.
 *
 * @param type - The type of releases to fetch. Can be 'RELEASES' for official releases or 'BUILDS' for build releases.
 * @param fromPage - The page number to start fetching from. Defaults to 1.
 * @param perPage - The number of releases to fetch per page. Defaults to 100.
 * @returns A promise that resolves to an array of ReleaseSummary objects.
 * @throws Will throw an error if the fetch operation fails.
 */
export async function getReleases(
    type: 'RELEASES' | 'BUILDS',
    since: Date = new Date(),
    minVersion: number = 3.0,
    fromPage: number = 1,
    perPage: number = 100,
): Promise<PublishedReleases> {
    let allReleases: ReleaseSummary[] = [];

    let repo: 'godot' | 'godot-builds' = 'godot';

    switch (type) {
        case 'RELEASES':
            repo = 'godot';
            break;
        case 'BUILDS':
            repo = 'godot-builds';
            break;
    }

    let latestPublishedDate = new Date(0);

    const LOOP_LIMIT = 100;
    let iterations = 0;

    while (iterations++ < LOOP_LIMIT) {
        const url = `https://api.github.com/repos/godotengine/${repo}/releases?page=${fromPage++}&per_page=${perPage}`;
        logger.debug(`Fetching releases from ${url}`);
        const releases = await fetch(url);

        if (releases.status !== 200) {
            logger.error('Failed to fetch releases');
            let message: string = '';
            try {
                message = await releases.text();
                logger.error(message);
            } catch {
                logger.error('Failed to read response');
            }

            throw new Error(
                `Failed to fetch releases: ${releases.status}; ${message}`,
            );
        }

        const json = (await releases.json()) as Release[];

        // get a list of release versions and the available artifact name and url
        const releasesList: ReleaseSummary[] = json
            .filter((release) => {
                if (release == null) {
                    return false;
                }

                // check if name is empty string or whitespace, fall back to tag name
                // if no tag name, skip the release
                if (
                    !release.name ||
                    release.name === '' ||
                    /^\s*$/.test(release.name!)
                ) {
                    if (
                        release.tag_name != null &&
                        release.tag_name !== '' &&
                        !/^\s*$/.test(release.tag_name)
                    ) {
                        release.name = release.tag_name;
                    } else {
                        return false;
                    }
                }
                const valid =
                    release != null &&
                    release.name != null &&
                    release.draft === false;

                // if the release is not valid or the release date is before the specified date, skip it
                if (
                    !valid ||
                    (valid && new Date(release.published_at || 0) <= since)
                ) {
                    return false;
                }

                // extract version number from release name
                // extract the first float from the left of the string

                // should match version number from release name
                const version = parseFloat(
                    release.name!.match(/(\d+\.\d+)/)![0],
                );
                if (version >= minVersion) {
                    return true;
                } else {
                    return false;
                }
            })
            .map((release: Release) => {
                return {
                    tag: release.tag_name,
                    version: release.tag_name,
                    version_number: parseFloat(
                        release.name!.match(/(\d+\.\d+)/)![0],
                    ),
                    name: release.name!,
                    published_at: release.published_at,
                    draft: release.draft,
                    prerelease: release.prerelease,
                    assets: release.assets?.map(createAssetSummary),
                };
            });

        allReleases = allReleases.concat(releasesList);

        if (json.length < perPage || releasesList.length === 0) {
            break;
        }
    }
    if (allReleases.length > 0) {
        latestPublishedDate = new Date(
            allReleases[0].published_at || Date.now(),
        );
    } else {
        latestPublishedDate = since;
    }
    allReleases.sort(sortReleases);

    return { releases: allReleases, lastPublishDate: latestPublishedDate };
}
