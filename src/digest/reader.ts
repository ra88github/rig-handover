import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus, StatusCounts } from './types.js';

// Plan morning-digest § 1. Reads runs/<night>.jsonl into one row per job, sorted by job.

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isRunStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

// Parse input at the edge: a line counts only if it has the RunLine shape.
function isRunLine(v: unknown): v is RunLine {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.at === 'string' &&
    typeof o.job === 'string' &&
    o.job !== '' &&
    isRunStatus(o.status) &&
    (typeof o.owner === 'string' || o.owner === null) &&
    (!('error' in o) || typeof o.error === 'string')
  );
}

function parseLine(line: string): RunLine | null {
  try {
    const v: unknown = JSON.parse(line);
    return isRunLine(v) ? v : null;
  } catch {
    return null;
  }
}

function isNotFound(e: unknown): boolean {
  return e instanceof Error && 'code' in e && e.code === 'ENOENT';
}

// Plain code-unit comparison, not locale-dependent: the page and the JSON share one order.
function byJob(a: DigestRow, b: DigestRow): number {
  return a.job < b.job ? -1 : a.job > b.job ? 1 : 0;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return { night, found: false };

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if (isNotFound(e)) return { night, found: false };
    throw e;
  }

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byName = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    let row = byName.get(line.job);
    if (row === undefined) {
      row = {
        job: line.job,
        owner: line.owner,
        runs: 0,
        retries: 0,
        lastStatus: line.status,
        lastError: null,
        firstAt: line.at,
        lastAt: line.at,
      };
      byName.set(line.job, row);
    }
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    row.owner = line.owner;
    row.lastAt = line.at;
    if (line.error !== undefined) row.lastError = line.error;
  }

  return { night, found: true, rows: [...byName.values()].sort(byJob), badLines, counts };
};
