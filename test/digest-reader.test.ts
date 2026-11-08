import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';
import type { DigestRow, Night } from '../src/digest/types.js';

type Found = Extract<Night, { found: true }>;

function found(n: Night): Found {
  if (!n.found) throw new Error(`night ${n.night} not found`);
  return n;
}

function row(n: Found, job: string): DigestRow {
  const r = n.rows.find((x) => x.job === job);
  if (r === undefined) throw new Error(`no row for ${job}`);
  return r;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const n = found(readNight('runs', '2026-10-28'));

  it('has 5 jobs sorted by job and 1 bad line', () => {
    expect(n.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(n.badLines).toBe(1);
    expect(n.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps the last error after a later ok', () => {
    expect(row(n, 'fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
  });

  it('reports a failed job and a null owner', () => {
    expect(row(n, 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row(n, 'digest/render').owner).toBeNull();
  });

  it('keeps the offset in first and last time', () => {
    const r = row(n, 'lane/sync');
    expect(r.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(r.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('a night with no file is not found', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', found: false });
  });

  it('an empty file is found with no rows', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      found: true,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('valid JSON with the wrong shape counts as a bad line', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+01:00","job":"a/job","status":"ok","owner":"rook"}',
      '{"at":"2026-01-03T02:00:00+01:00","job":"","status":"ok","owner":"rook"}',
      '{"at":"2026-01-03T03:00:00+01:00","job":"a/job","status":"done","owner":"rook"}',
      '{"at":"2026-01-03T04:00:00+01:00","job":"a/job","status":"ok"}',
      '[1,2,3]',
      '',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    const n = found(readNight(dir, '2026-01-03'));
    expect(n.badLines).toBe(4);
    expect(n.rows.map((r) => r.job)).toEqual(['a/job']);
    expect(n.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('an invalid night is not found', () => {
    expect(readNight('runs', '../2026-10-28')).toEqual({ night: '../2026-10-28', found: false });
    expect(readNight('runs', '2026-10-28.jsonl')).toEqual({ night: '2026-10-28.jsonl', found: false });
  });
});
