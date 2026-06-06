const {
  getJob,
  listJobs,
  upsertJob,
  markRunningJobsInterrupted
} = require('./derivedStore.cjs');

const JOB_PRIORITY = {
  scan: 100,
  analyze: 90,
  'source-import': 85,
  export: 80,
  ocr: 70,
  hash: 60,
  upscale: 50,
  'deep-scan': 95
};

const JOB_LANE = {
  scan: 'scanAnalyze',
  analyze: 'scanAnalyze',
  'deep-scan': 'scanAnalyze',
  'source-import': 'network',
  export: 'export',
  ocr: 'heavy',
  hash: 'heavy',
  upscale: 'heavy'
};

const IDEMPOTENT_JOBS = new Set(['scan', 'analyze', 'deep-scan', 'source-import', 'ocr', 'hash', 'upscale']);

function nowIso() {
  return new Date().toISOString();
}

function makeJobId(kind) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProfile(profile) {
  return ['interactive', 'balanced', 'idle-only'].includes(String(profile || '').trim())
    ? String(profile).trim()
    : 'balanced';
}

function formatJobKind(kind) {
  switch (kind) {
    case 'scan':
      return 'scan';
    case 'deep-scan':
      return 'scan profond';
    case 'analyze':
      return 'analyse';
    case 'export':
      return 'export';
    case 'source-import':
      return 'import source';
    case 'ocr':
      return 'OCR';
    case 'hash':
      return 'hachage';
    case 'upscale':
      return 'upscale';
    default:
      return String(kind || 'job');
  }
}

class JobOrchestrator {
  constructor(options = {}) {
    this.handlers = options.handlers || {};
    this.onStateChanged = typeof options.onStateChanged === 'function' ? options.onStateChanged : null;
    this.shouldBlockJob = typeof options.shouldBlockJob === 'function' ? options.shouldBlockJob : null;
    this.readerActive = false;
    this.lastInteractionAt = 0;
    this.profile = normalizeProfile(options.profile);
    this.processing = false;
    this._scheduled = null;
  }

  bootstrap() {
    const interrupted = markRunningJobsInterrupted();
    interrupted
      .filter((job) => job.requeueable && IDEMPOTENT_JOBS.has(job.kind))
      .forEach((job) => {
        upsertJob({
          ...job,
          status: 'queued',
          updatedAt: nowIso(),
          endedAt: null,
          startedAt: null,
          lastError: null
        });
      });
    this.schedule();
    return interrupted;
  }

  setProfile(profile) {
    this.profile = normalizeProfile(profile);
    this.schedule();
  }

  markInteraction() {
    this.lastInteractionAt = Date.now();
    this.schedule();
  }

  setReaderActive(active) {
    this.readerActive = Boolean(active);
    this.schedule();
  }

  enqueue(input = {}) {
    const kind = String(input.kind || '').trim();
    if (!kind) throw new Error('Job kind is required');
    const createdAt = nowIso();
    const job = upsertJob({
      id: String(input.id || makeJobId(kind)),
      kind,
      priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : (JOB_PRIORITY[kind] || 0),
      lane: String(input.lane || JOB_LANE[kind] || 'scanAnalyze'),
      status: 'queued',
      payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
      progress: input.progress && typeof input.progress === 'object' ? input.progress : {},
      attempt: Number.isFinite(Number(input.attempt)) ? Number(input.attempt) : 0,
      requeueable: input.requeueable === undefined ? IDEMPOTENT_JOBS.has(kind) : Boolean(input.requeueable),
      createdAt,
      updatedAt: createdAt,
      startedAt: null,
      endedAt: null,
      lastError: null
    });
    this.notify();
    this.schedule();
    return job;
  }

  cancel(jobId) {
    const job = getJob(jobId);
    if (!job) return null;
    const next = upsertJob({
      ...job,
      status: 'cancel_requested',
      updatedAt: nowIso()
    });
    this.notify();
    return next;
  }

  retry(jobId) {
    const job = getJob(jobId);
    if (!job) return null;
    const next = upsertJob({
      ...job,
      status: 'queued',
      updatedAt: nowIso(),
      startedAt: null,
      endedAt: null,
      lastError: null
    });
    this.notify();
    this.schedule();
    return next;
  }

  list() {
    return listJobs();
  }

  getSyncStatus() {
    const jobs = this.list();
    const running = jobs.filter((job) => job.status === 'running');
    const queued = jobs.filter((job) => job.status === 'queued' || job.status === 'cancel_requested');
    const attention = jobs.filter((job) => job.status === 'failed' || job.status === 'interrupted');

    if (attention.length > 0) {
      return {
        state: 'attention-needed',
        label: 'attention',
        detail: `${attention.length} job${attention.length > 1 ? 's' : ''} a revoir`,
        runningCount: running.length,
        queuedCount: queued.length,
        attentionCount: attention.length,
        profile: this.profile
      };
    }

    if (running.length > 0 || queued.length > 0) {
      return {
        state: 'updating',
        label: 'mise a jour',
        detail: running.length > 0
          ? `${formatJobKind(running[0].kind)} en cours`
          : `${queued.length} job${queued.length > 1 ? 's' : ''} en attente`,
        runningCount: running.length,
        queuedCount: queued.length,
        attentionCount: 0,
        profile: this.profile
      };
    }

    return {
      state: 'up-to-date',
      label: 'a jour',
      detail: 'Donnees derivees synchronisees',
      runningCount: 0,
      queuedCount: 0,
      attentionCount: 0,
      profile: this.profile
    };
  }

  schedule() {
    if (this._scheduled) return;
    this._scheduled = setTimeout(() => {
      this._scheduled = null;
      this.process().catch(() => {});
    }, 0);
  }

  laneAvailable(job, runningJobs = []) {
    if (job.lane === 'export') return runningJobs.length === 0;
    if (job.lane === 'scanAnalyze') return !runningJobs.some((entry) => entry.lane === 'scanAnalyze' || entry.lane === 'export');
    if (job.lane === 'network') {
      return !runningJobs.some((entry) => entry.lane === 'scanAnalyze' || entry.lane === 'export' || entry.lane === 'network');
    }
    if (job.lane === 'heavy') return !runningJobs.some((entry) => entry.lane === 'heavy' || entry.lane === 'export');
    return runningJobs.length === 0;
  }

  blockedByProfile(job) {
    if (job.lane !== 'heavy') return false;
    if (this.profile === 'interactive') {
      return this.readerActive || (Date.now() - this.lastInteractionAt) < 60000;
    }
    if (this.profile === 'balanced') {
      return this.readerActive || (Date.now() - this.lastInteractionAt) < 15000;
    }
    if (this.profile === 'idle-only') {
      return true;
    }
    return false;
  }

  pickNextJob() {
    const jobs = this.list();
    const runningJobs = jobs.filter((job) => job.status === 'running');
    const queuedJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'cancel_requested');

    for (const job of queuedJobs) {
      if (!this.laneAvailable(job, runningJobs)) continue;
      if (this.blockedByProfile(job)) continue;
      if (this.shouldBlockJob?.(job)) continue;
      return job;
    }

    return null;
  }

  async process() {
    if (this.processing) return;
    this.processing = true;
    try {
      let nextJob = this.pickNextJob();
      while (nextJob) {
        await this.runJob(nextJob);
        nextJob = this.pickNextJob();
      }
    } finally {
      this.processing = false;
      this.notify();
    }
  }

  async runJob(job) {
    const handler = this.handlers[job.kind];
    if (typeof handler !== 'function') {
      upsertJob({
        ...job,
        status: 'failed',
        updatedAt: nowIso(),
        endedAt: nowIso(),
        lastError: `No handler registered for ${job.kind}`
      });
      this.notify();
      return;
    }

    const cancelledBeforeStart = (getJob(job.id) || job).status === 'cancel_requested';
    const startedJob = upsertJob({
      ...job,
      status: 'running',
      attempt: Number(job.attempt || 0) + 1,
      updatedAt: nowIso(),
      startedAt: nowIso(),
      endedAt: null,
      lastError: null
    });
    this.notify();

    const checkpoint = (progress = {}) => {
      const latest = getJob(startedJob.id) || startedJob;
      upsertJob({
        ...latest,
        progress: {
          ...(latest.progress || {}),
          ...progress
        },
        updatedAt: nowIso()
      });
      this.notify();
      return cancelledBeforeStart || latest.status === 'cancel_requested';
    };

    try {
      await handler({
        job: startedJob,
        checkpoint,
        isCancelled: () => cancelledBeforeStart || (getJob(startedJob.id)?.status === 'cancel_requested')
      });

      const completed = getJob(startedJob.id) || startedJob;
      const cancelled = cancelledBeforeStart || completed.status === 'cancel_requested';
      upsertJob({
        ...completed,
        status: cancelled ? 'interrupted' : 'done',
        updatedAt: nowIso(),
        endedAt: nowIso(),
        lastError: cancelled ? (cancelledBeforeStart ? 'Cancelled before start' : 'Cancelled by user') : null
      });
    } catch (error) {
      const failed = getJob(startedJob.id) || startedJob;
      upsertJob({
        ...failed,
        status: 'failed',
        updatedAt: nowIso(),
        endedAt: nowIso(),
        lastError: error?.message || 'Job failed'
      });
    }

    this.notify();
  }

  notify() {
    if (this.onStateChanged) {
      this.onStateChanged({
        jobs: this.list(),
        syncStatus: this.getSyncStatus()
      });
    }
  }
}

module.exports = {
  JOB_PRIORITY,
  JOB_LANE,
  IDEMPOTENT_JOBS,
  JobOrchestrator
};
