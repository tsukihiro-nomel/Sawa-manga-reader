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

  it('keeps scan jobs queued while the reader is active', async () => {
    const jobs = new Map();
    const fakeStore = {
      getJob: (jobId) => jobs.get(jobId) || null,
      listJobs: () => [...jobs.values()],
      upsertJob: (job) => {
        jobs.set(job.id, job);
        return job;
      },
      markRunningJobsInterrupted: () => []
    };
    const { JobOrchestrator } = loadWithFakeStore(fakeStore);
    const executed = [];
    const orchestrator = new JobOrchestrator({
      handlers: { scan: async () => executed.push('scan') }
    });

    orchestrator.setReaderActive(true);
    const job = orchestrator.enqueue({ kind: 'scan' });
    await orchestrator.process();

    expect(executed).toEqual([]);
    expect(jobs.get(job.id).status).toBe('queued');

    orchestrator.setReaderActive(false);
    await orchestrator.process();
    expect(executed).toEqual(['scan']);
  });

  it('waits for a short interaction quiet period before watcher scans', async () => {
    const jobs = new Map();
    const fakeStore = {
      getJob: (jobId) => jobs.get(jobId) || null,
      listJobs: () => [...jobs.values()],
      upsertJob: (job) => {
        jobs.set(job.id, job);
        return job;
      },
      markRunningJobsInterrupted: () => []
    };
    const { JobOrchestrator } = loadWithFakeStore(fakeStore);
    const executed = [];
    const orchestrator = new JobOrchestrator({
      profile: 'balanced',
      handlers: { scan: async () => executed.push('scan') }
    });

    orchestrator.markInteraction();
    orchestrator.enqueue({ kind: 'scan', payload: { source: 'watcher' } });
    await orchestrator.process();
    expect(executed).toEqual([]);

    orchestrator.lastInteractionAt -= 2_000;
    await orchestrator.process();
    expect(executed).toEqual(['scan']);
  });

  it('records an archive worker cancellation as interrupted instead of failed', async () => {
    const jobs = new Map();
    const fakeStore = {
      getJob: (jobId) => jobs.get(jobId) || null,
      listJobs: () => [...jobs.values()],
      upsertJob: (job) => {
        jobs.set(job.id, job);
        return job;
      },
      markRunningJobsInterrupted: () => []
    };
    const { JobInterruptedError, JobOrchestrator } = loadWithFakeStore(fakeStore);
    const orchestrator = new JobOrchestrator({
      handlers: {
        export: async () => {
          const workerResult = { ok: false, cancelled: true, error: 'Export annule.' };
          if (workerResult.cancelled) throw new JobInterruptedError(workerResult.error);
        }
      }
    });

    const job = orchestrator.enqueue({ kind: 'export' });
    await orchestrator.process();

    expect(jobs.get(job.id)).toMatchObject({
      status: 'interrupted',
      lastError: 'Export annule.'
    });
  });

  it('emits only the modified job for 500 checkpoints without listing full history', async () => {
    const jobs = new Map(Array.from({ length: 200 }, (_, index) => {
      const id = `terminal-${index}`;
      return [id, {
        id,
        kind: 'scan',
        priority: 1,
        lane: 'scanAnalyze',
        status: 'done',
        payload: {},
        progress: {},
        createdAt: new Date(index).toISOString(),
        updatedAt: new Date(index).toISOString(),
        endedAt: new Date(index).toISOString()
      }];
    }));
    let listCalls = 0;
    let pruneCalls = 0;
    const fakeStore = {
      getJob: (jobId) => jobs.get(jobId) || null,
      listJobs: () => {
        listCalls += 1;
        return [...jobs.values()];
      },
      upsertJob: (job) => {
        jobs.set(job.id, job);
        return job;
      },
      pruneTerminalJobs: () => {
        pruneCalls += 1;
        return [];
      },
      markRunningJobsInterrupted: () => []
    };
    const { JobOrchestrator } = loadWithFakeStore(fakeStore);
    const events = [];
    const orchestrator = new JobOrchestrator({
      handlers: {
        analyze: async ({ checkpoint }) => {
          for (let index = 0; index < 500; index += 1) checkpoint({ index });
        }
      },
      onStateChanged: (event) => events.push(event)
    });
    orchestrator.schedule = () => {};

    const job = orchestrator.enqueue({ id: 'delta-job', kind: 'analyze' });
    await orchestrator.process();

    expect(job.id).toBe('delta-job');
    expect(listCalls).toBe(1);
    expect(pruneCalls).toBe(1);
    expect(events.length).toBeGreaterThanOrEqual(503);
    expect(events.every((event) => !Object.prototype.hasOwnProperty.call(event, 'jobs'))).toBe(true);
    expect(events.filter((event) => event.job).every((event) => event.job.id === 'delta-job')).toBe(true);
    expect(Math.max(...events.map((event) => JSON.stringify(event).length))).toBeLessThan(2_000);
  });
});
