import type { TemplateJob } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { getTemplateRowJobs } from './template-jobs.model';

describe('template row operations', () => {
    it('keeps project operations out of shared rows, including errors and completed work', () => {
        const shared: TemplateJob = {
            id: 'shared',
            setIds: ['4.4.stable'],
            stage: 'error',
        };
        for (const stage of ['downloading', 'error', 'complete'] as const) {
            const project: TemplateJob = {
                id: 'local',
                setIds: ['4.4.stable'],
                projectPath: 'project',
                kind: 'update',
                stage,
            };
            expect(getTemplateRowJobs([project]).size).toBe(0);
            expect(
                getTemplateRowJobs([shared, project]).get('4.4.stable'),
            ).toEqual(shared);
        }
    });
    it('clears an earlier error after a later operation succeeds on the same set', () => {
        expect(
            getTemplateRowJobs([
                { id: 'old', setIds: ['4.6.stable'], stage: 'error' },
                { id: 'new', setIds: ['4.6.stable'], stage: 'complete' },
            ]).size,
        ).toBe(0);
    });
    it('keeps independent queued flavours and hides cancelled placeholders', () => {
        const jobs: TemplateJob[] = [
            { id: 'active', setIds: ['4.6.stable'], stage: 'downloading' },
            { id: 'queued', setIds: ['4.6.stable.mono'], stage: 'queued' },
            { id: 'cancelled', setIds: ['4.5.stable'], stage: 'cancelled' },
        ];
        expect([...getTemplateRowJobs(jobs).keys()]).toEqual([
            '4.6.stable',
            '4.6.stable.mono',
        ]);
    });
    it('gives an archive import a temporary row before its version is identified', () => {
        const job: TemplateJob = {
            id: 'archive',
            kind: 'import',
            stage: 'preparing',
        };
        expect(getTemplateRowJobs([job]).get('job-archive')).toEqual(job);
    });
});
