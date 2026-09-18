import type { TemplateJob } from '@shared/contracts';

/** Keeps the latest shared operation for each row, hiding project-owned and finished work.
 * @param jobs - Session operations in submission order.
 */
export function getTemplateRowJobs(
    jobs: TemplateJob[],
): Map<string, TemplateJob> {
    const latest = new Map<string, TemplateJob>();
    for (const job of jobs) {
        if (job.projectPath) continue;
        for (const id of job.setIds?.length ? job.setIds : [`job-${job.id}`])
            latest.set(id, job);
    }
    return new Map(
        [...latest].filter(
            ([, job]) => !['complete', 'cancelled'].includes(job.stage),
        ),
    );
}
