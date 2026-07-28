import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  JOB_HISTORY_TTL_MS,
  MAX_TERMINAL_JOBS,
  selectTerminalJobIdsToPrune
} = require('../electron/services/derivedStore.cjs');

describe('derived job history retention', () => {
  it('keeps active jobs and bounds recent terminal history by age and count', () => {
    const now = Date.now();
    const recentTerminal = Array.from({ length: MAX_TERMINAL_JOBS + 5 }, (_, index) => ({
      id: `recent-${index}`,
      status: index % 2 ? 'done' : 'failed',
      endedAt: new Date(now - index * 1_000).toISOString()
    }));
    const expired = {
      id: 'expired',
      status: 'interrupted',
      endedAt: new Date(now - JOB_HISTORY_TTL_MS - 1).toISOString()
    };
    const active = [
      { id: 'running-old', status: 'running', updatedAt: expired.endedAt },
      { id: 'queued-old', status: 'queued', updatedAt: expired.endedAt }
    ];

    const removed = selectTerminalJobIdsToPrune(
      [...recentTerminal, expired, ...active],
      { now, maxTerminalJobs: MAX_TERMINAL_JOBS, maxAgeMs: JOB_HISTORY_TTL_MS }
    );

    expect(removed).toContain('expired');
    expect(removed).not.toContain('running-old');
    expect(removed).not.toContain('queued-old');
    expect(recentTerminal.filter((job) => !removed.includes(job.id))).toHaveLength(MAX_TERMINAL_JOBS);
  });
});
