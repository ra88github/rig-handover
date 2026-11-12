# rig

The lane's resident service: keeps a heartbeat, serves the status board, reads the night's run
log. Hono + JSX, rendered on the server, Node 22+.

Read first: `docs/vision.md`, `docs/styleguide.md`. Decisions: `docs/adr/`.

## Commands

- `pnpm dev` / `pnpm start`: serves on `PORT` (8787). Needs `.env` (copy `.env.example`).
- `pnpm test`: vitest. `pnpm typecheck`: tsc.

## How work moves here

1. A feature starts as a plan: `plan.md` at the root (one at a time). Finished plans live in
   `docs/plans/done/`.
2. The plan is split into GitHub issues: skill `plan-to-issues` (`.agents/skills/`). A human
   reviews the split before anything is published. GitHub issues out of reach: files in
   `docs/issues/` (ADR 0004).
3. Issues are worked by workers, one issue per worker, each on its own branch or worktree.
   Pick the model per issue: the strongest for logic, a cheaper one for views and tests.
4. A worker closes its issue with a closing comment, exactly this shape:

   ```
   done: <what changed, one line>
   worker: <harness> · <model> · <effort>
   commit: <sha or "none">
   evidence:
   - <one "Done when" item, as the issue words it>: <what shows it holds>
   ```

   One evidence line per "Done when" item, in the issue's order. What shows it is captured from
   the build at `commit`, not written from memory: the command you ran and the output line that
   shows the result (for a page or a JSON route, the curl command and the lines that matter). If
   nothing you can run shows it, write `missing tool: <what would show it>`.

   `commit` is your own commit when it builds alone. When the "Done when" needs work from the
   issues yours was blocked by, `commit` is the merge that brings that work in, and the issue
   closes only after that merge.

5. An issue is closed only when its "Done when" holds and every evidence line shows it. A
   `missing tool` line keeps the issue open until the tool exists or a human accepts it without
   one. If it can't hold yet, leave it open and say what it waits on.

## Skills

Shared skills live in `.agents/skills/`, one folder each, `SKILL.md` inside. That folder is the
one source for every harness on the team. If yours loads skills from somewhere else, point it
here (a link or a config entry). Don't copy: copies drift.

## Rules

- Never commit `.env`, tokens or previews.
- Don't touch `runs/`: those are real nights, read-only fixtures.
- No client JS (ADR 0001).
