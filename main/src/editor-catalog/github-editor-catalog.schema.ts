import { z } from 'zod';

const githubReleaseSchema = z.object({
    id: z.number().int(),
    name: z.string().nullable(),
    tag_name: z.string(),
    published_at: z.string().nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    assets: z.array(
        z.object({
            id: z.number().int(),
            name: z.string(),
            browser_download_url: z.url(),
            digest: z.string().nullable().optional(),
            size: z.number().int().nonnegative().optional(),
        }),
    ),
});

/** Validates one page returned by the GitHub release API. */
export const githubReleasePageSchema = z.array(githubReleaseSchema);

export type GithubReleaseResponse = z.infer<typeof githubReleaseSchema>;
