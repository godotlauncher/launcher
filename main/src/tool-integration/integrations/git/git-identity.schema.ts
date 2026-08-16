import { z } from 'zod';

export const GitIdentitySchema = z.object({
    name: z.string().trim().min(1),
    email: z.string().trim().min(1),
});

export const ProjectGitIdentityPresetSchema = GitIdentitySchema.extend({
    useForNewRepositories: z.boolean(),
});
