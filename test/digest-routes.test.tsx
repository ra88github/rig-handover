import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

type Line = { at: string; job: string; status: 'ok' | 'retry' | 'fail'; owner: string | null; error?: string };
type Body = { night: string; rows: DigestRow[]; badLines: number; counts: Record<string, number> };

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-10-25';

// Written out of job order on purpose: the page and the JSON must sort by job.
const normalLines: Line[] = [
  { at: '2026-10-28T01:00:00+01:00', job: 'zeta-export', status: 'ok', owner: 'ops' },
  { at: '2026-10-28T01:05:00+01:00', job: 'beta-sync', status: 'retry', owner: 'ana', error: 'timeout 1' },
  { at: '2026-10-28T01:10:00+01:00', job: 'beta-sync', status: 'retry', owner: 'ana', error: 'timeout 2' },
  { at: '2026-10-28T01:15:00+01:00', job: 'beta-sync', status: 'retry', owner: 'ana', error: 'timeout 3' },
  { at: '2026-10-28T01:20:00+01:00', job: 'beta-sync', status: 'ok', owner: 'ana' },
  { at: '2026-10-28T02:00:00+01:00', job: 'alpha-backup', status: 'ok', owner: 'ops' },
  { at: '2026-10-28T02:30:00+01:00', job: 'alpha-backup', status: 'fail', owner: 'ops', error: 'disk full' },
  { at: '2026-10-28T03:00:00+01:00', job: 'mid-orphan', status: 'ok', owner: null },
];
const expectedJobs = ['alpha-backup', 'beta-sync', 'mid-orphan', 'zeta-export'];

let tmp: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  const jsonl = (lines: Line[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  writeFileSync(join(tmp, `${NORMAL}.jsonl`), jsonl(normalLines));
  writeFileSync(join(tmp, `${EMPTY}.jsonl`), '');
  const good = JSON.stringify({ at: '2026-10-26T01:00:00+01:00', job: 'only-job', status: 'ok', owner: 'ops' });
  writeFileSync(join(tmp, `${BAD}.jsonl`), `${good}\n{"at":"2026-10-26T02:00:00+01:00","job":"tru\n`);
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: tmp });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const page = (night: string) => app.request(`/digest/${night}`);
const api = (night: string) => app.request(`/api/digest/${night}`);

function jobOrder(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .filter((j) => j.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((j) => j.job);
}

describe('digest page', () => {
  it('200 for a normal night with one table and every job', async () => {
    const res = await page(NORMAL);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(jobOrder(html, expectedJobs)).toEqual(expectedJobs);
  });

  it('marks 3+ retries and a last status of fail with warn', async () => {
    const html = await (await page(NORMAL)).text();
    expect(html).toContain('warn');
    expect(html).toContain('disk full');
  });

  it('renders a null owner as an em dash', async () => {
    const html = await (await page(NORMAL)).text();
    expect(html).toContain('—');
  });

  it('404 for a night with no file', async () => {
    expect((await page(MISSING)).status).toBe(404);
  });

  it('404 for an invalid night', async () => {
    expect((await page('not-a-date')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await page(EMPTY);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line and reports it', async () => {
    const res = await page(BAD);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('only-job');
  });
});

describe('digest JSON', () => {
  it('200 for a normal night with the agreed shape', async () => {
    const res = await api(NORMAL);
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(expectedJobs);
    const beta = body.rows.find((r) => r.job === 'beta-sync');
    expect(beta).toMatchObject({ owner: 'ana', runs: 4, retries: 3, lastStatus: 'ok' });
    expect(beta?.firstAt).toBe('2026-10-28T01:05:00+01:00');
    expect(beta?.lastAt).toBe('2026-10-28T01:20:00+01:00');
    expect(body.rows.find((r) => r.job === 'alpha-backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'disk full',
    });
    expect(body.rows.find((r) => r.job === 'mid-orphan')).toMatchObject({ owner: null, lastError: null });
  });

  it('404 JSON for a night with no file', async () => {
    const res = await api(MISSING);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string; night?: string };
    expect(body.night).toBe(MISSING);
    expect(typeof body.error).toBe('string');
  });

  it('404 JSON for an invalid night', async () => {
    const res = await api('not-a-date');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ night: 'not-a-date' });
  });

  it('empty night has no rows', async () => {
    const res = await api(EMPTY);
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('bad-line night still returns its rows and counts the bad line', async () => {
    const res = await api(BAD);
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['only-job']);
  });
});

describe('page and JSON agree (ADR 0001)', () => {
  it.each([NORMAL, BAD])('lists the same jobs in the same order for %s', async (night) => {
    const body = (await (await api(night)).json()) as Body;
    const jobs = body.rows.map((r) => r.job);
    const html = await (await page(night)).text();
    expect(jobOrder(html, [...jobs].reverse())).toEqual(jobs);
  });
});
