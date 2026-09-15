import type { TemplateJob } from '@shared/contracts';

/** Keeps only the latest operation for each row, hiding successful or cancelled state.
 * @param jobs - Session operations in submission order.
 */
export function getTemplateRowJobs(
    jobs: TemplateJob[],
): Map<string, TemplateJob> {
    const latest = new Map<string, TemplateJob>();
    for (const job of jobs) {
        for (const id of job.setIds?.length ? job.setIds : [`job-${job.id}`])
            latest.set(id, job);
    }
    return new Map(
        [...latest].filter(
            ([, job]) => !['complete', 'cancelled'].includes(job.stage),
        ),
    );
}
