import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const orchestratorPath = require.resolve('../electron/services/jobOrchestrator.cjs');
const derivedStorePath = require.resolve('../electron/services/derivedStore.cjs');

function loadWithFakeStore(fakeStore) {
  delete require.cache[orchestratorPath];
  require.cache[derivedStorePath] = {
    id: derivedStorePath,
    filename: derivedStorePath,
    loaded: true,
    exports: fakeStore
  };
  return require('../electron/services/jobOrchestrator.cjs');
}

afterEach(() => {
  delete require.cache[orchestratorPath];
  delete require.cache[derivedStorePath];
});

describe('JobOrchestrator', () => {
  it('runs queued jobs by priority and supports cancel + retry semantics', async () => {
    const jobs = new Map();
    const fakeStore = {
      getJob: (jobId) => jobs.get(jobId) || null,
      listJobs: () => [...jobs.values()].sort((left, right) => {
        if (left.priority !== right.priority) return right.priority - left.priority;
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }),
      upsertJob: (job) => {
        jobs.set(job.id, job);
        return job;
      },
      markRunningJobsInterrupted: () => []
    };

    const { JobOrchestrator } = loadWithFakeStore(fakeStore);
    const executed = [];
    const orchestrator = new JobOrchestrator({
      handlers: {
        analyze: async ({ checkpoint }) => {
          executed.push('analyze');
          checkpoint({ step: 'half' });
        },
        scan: async ({ isCancelled }) => {
          executed.push(isCancelled() ? 'scan-cancelled' : 'scan');
        }
      }
    });

    const scanJob = orchestrator.enqueue({ kind: 'scan' });
    orchestrator.enqueue({ kind: 'analyze' });
    orchestrator.cancel(scanJob.id);
    await orchestrator.process();

    expect(executed[0]).toBe('scan-cancelled');
    expect(executed[1]).toBe('analyze');
    expect(jobs.get(scanJob.id).status).toBe('interrupted');

    orchestrator.retry(scanJob.id);
    await orchestrator.process();

    expect(jobs.get(scanJob.id).status).toBe('done');
    expect(executed).toContain('scan');
  });
});
