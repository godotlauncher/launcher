import { z } from 'zod';

export const GitHubAuthAttemptSchema = z.object({
    attemptId: z.string().regex(/^[0-9a-f]{64}$/u),
    attemptToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    browserUrl: z
        .url()
        .max(2048)
        .refine((value) => {
            const url = new URL(value);
            return (
                url.protocol === 'https:' &&
                url.hostname === 'github.com' &&
                url.username === '' &&
                url.password === '' &&
                url.hash === ''
            );
        }),
    expiresAt: z.number().int().positive(),
});

export const GitHubTokenBundleSchema = z.object({
    accessToken: z.string().min(1).max(4096),
    expiresIn: z.number().int().positive().nullable(),
    refreshToken: z.string().min(1).max(4096).nullable(),
    refreshTokenExpiresIn: z.number().int().positive().nullable(),
    scope: z.string().max(4096),
    tokenType: z.string().min(1).max(64),
});

export const GitHubOAuthRedemptionSchema = GitHubTokenBundleSchema.extend({
    installationUrl: z.url().max(2048).nullable(),
});

export const GitHubSetupRedemptionSchema = z.object({
    installationId: z.string().regex(/^[1-9][0-9]{0,19}$/u),
});

export const GitHubUserIdentitySchema = z.object({
    id: z.number().int().positive(),
    login: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1).max(255).nullable(),
});

export const GitHubInstallationPageSchema = z.object({
    installations: z
        .array(
            z.object({
                id: z.number().int().positive(),
                account: z.object({
                    login: z
                        .string()
                        .regex(
                            /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u,
                        ),
                    type: z.enum(['Organization', 'User']),
                }),
                html_url: z
                    .url()
                    .max(2048)
                    .refine((value) => {
                        const url = new URL(value);
                        return (
                            url.protocol === 'https:' &&
                            url.hostname === 'github.com' &&
                            url.username === '' &&
                            url.password === '' &&
                            url.search === '' &&
                            url.hash === ''
                        );
                    }),
                suspended_at: z.iso.datetime().nullable(),
            }),
        )
        .max(100),
});

const GitHubRepositoryNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
        (value) =>
            !value.includes('/') &&
            [...value].every((character) => {
                const codePoint = character.codePointAt(0) ?? 0;
                return codePoint > 31 && codePoint !== 127;
            }),
    );

export const GitHubRepositorySchema = z
    .object({
        id: z.number().int().safe().positive(),
        owner: z.object({
            login: z
                .string()
                .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u),
        }),
        name: GitHubRepositoryNameSchema,
        full_name: z.string().min(3).max(511),
        visibility: z.enum(['public', 'private', 'internal']),
        clone_url: z.url().max(2048),
        disabled: z.boolean(),
        archived: z.boolean(),
        permissions: z.object({ pull: z.boolean() }),
    })
    .superRefine((repository, context) => {
        if (
            repository.full_name !==
            `${repository.owner.login}/${repository.name}`
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Repository full name does not match its owner',
            });
        }
        const cloneUrl = new URL(repository.clone_url);
        if (
            cloneUrl.protocol !== 'https:' ||
            cloneUrl.hostname !== 'github.com' ||
            cloneUrl.port !== '' ||
            cloneUrl.username !== '' ||
            cloneUrl.password !== '' ||
            cloneUrl.pathname !==
                `/${repository.owner.login}/${repository.name}.git` ||
            cloneUrl.search !== '' ||
            cloneUrl.hash !== ''
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Repository clone URL is invalid',
            });
        }
    });

export const GitHubRepositoryPageSchema = z.object({
    repositories: z.array(GitHubRepositorySchema).max(50),
});

export const GitHubStoredCredentialSchema = GitHubTokenBundleSchema.extend({
    version: z.literal(1),
    createdAt: z.iso.datetime(),
});

export const GitHubBrokerErrorSchema = z.object({
    error: z.object({
        code: z.string().max(128),
        message: z.string().max(512),
    }),
});
