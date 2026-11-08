import type { DigestRow } from '../digest/types.js';

const dash = '—';

export function DigestPage(props: { night: string; rows: DigestRow[]; badLines: number }) {
  const { night, rows, badLines } = props;
  return (
    <>
      <h1>digest · {night}</h1>
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                {r.retries >= 3 ? (
                  <td class="warn"><strong>{r.retries}</strong></td>
                ) : (
                  <td>{r.retries}</td>
                )}
                {r.lastStatus === 'fail' ? (
                  <td class="warn"><strong>{r.lastStatus}</strong></td>
                ) : (
                  <td>{r.lastStatus}</td>
                )}
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {badLines > 0 ? <p class="mute">bad lines: {badLines}</p> : null}
    </>
  );
}
