import './checkin.css';
import type { TodayBoard } from './types';
import { formatTime } from './time';

export interface CheckinBoardProps {
  board: TodayBoard | null;
  detail: boolean;
}

function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : day;
}

/** Bảng ghi danh hôm nay: tổng số, theo phòng ban, và (nếu detail) danh sách tên kèm giờ. */
export function CheckinBoard({ board, detail }: CheckinBoardProps) {
  if (!board) {
    return (
      <section className="ui-panel ci-board" aria-label="Bảng ghi danh hôm nay">
        <p className="ui-empty" role="status">
          Đang tải bảng ghi danh…
        </p>
      </section>
    );
  }

  const depts = [...board.byDepartment].sort((a, b) => b.count - a.count || a.department.localeCompare(b.department, 'vi'));
  const max = depts.reduce((m, d) => Math.max(m, d.count), 0);
  const items = detail && board.items ? [...board.items].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) : null;

  return (
    <section className="ui-panel ci-board" aria-label="Bảng ghi danh hôm nay">
      <h3 className="ui-subhead">Ghi danh hôm nay, {formatDay(board.day)}</h3>
      <p className="ci-board-total">
        <span className="ui-figure">{board.count}</span> người đã ghi danh
      </p>

      {board.count === 0 ? (
        <p className="ui-empty">Chưa có ai ghi danh hôm nay.</p>
      ) : (
        <ul className="ci-dept-list" aria-label="Theo phòng ban">
          {depts.map((d) => (
            <li key={d.department} className="ci-dept">
              <span className="ui-list-item-title">{d.department || 'Chưa rõ phòng ban'}</span>
              <span className="ci-dept-count">{d.count}</span>
              <span className="ci-bar" aria-hidden="true">
                <span className="ci-bar-fill" style={{ width: `${max > 0 ? Math.round((d.count / max) * 100) : 0}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {items && (
        <>
          <h3 className="ui-subhead">Danh sách theo giờ</h3>
          {items.length === 0 ? (
            <p className="ui-empty">Chưa có bản ghi.</p>
          ) : (
            <ol className="ui-list ci-items">
              {items.map((it) => (
                <li key={it.userId} className="ui-list-item">
                  <time className="ui-list-item-figure" dateTime={it.at}>
                    {formatTime(it.at)}
                  </time>
                  <span className="ui-list-item-main">
                    <span className="ui-list-item-title">{it.name}</span>
                    <span className="ui-list-item-meta">{it.department}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <p className="ui-hint">Giờ theo UTC+7.</p>
    </section>
  );
}
