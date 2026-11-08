// Plan morning-digest § 1. The contract the reader (#2) implements and § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of `runs/<night>.jsonl`. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/**
 * One job's night. `firstAt` / `lastAt` are `at` strings exactly as in the log (offset kept,
 * never converted to UTC). `owner` is the owner on the job's last line. `retries` counts its
 * `retry` lines. `lastError` is the error of the job's latest line that had one, else `null`.
 */
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

/** Lines per status, counted over every line that parsed. */
export type StatusCounts = Record<RunStatus, number>;

/**
 * `found: false`: no file for this night (the page returns 404).
 * `found: true` with no rows: the file exists but nothing ran (the page says so).
 * `rows` are sorted by job. `badLines` counts lines that didn't parse; they never throw.
 */
export type Night =
  | { night: string; found: false }
  | { night: string; found: true; rows: DigestRow[]; badLines: number; counts: StatusCounts };

/** `night` is `YYYY-MM-DD`; reads `<runsDir>/<night>.jsonl`. Anything else is `found: false`. */
export type ReadNight = (runsDir: string, night: string) => Night;
