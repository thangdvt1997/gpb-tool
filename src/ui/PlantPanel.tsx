import { useEffect, useState } from 'react';
import type { Role } from '../content/types';
import { getPlantLog } from '../plants/api';
import { PlantToolbar } from '../plants/PlantToolbar';
import { carePlantAndSync, usePlants } from '../plants/usePlants';
import {
  ACTION_LABEL,
  CARE_ROLES,
  PLANT_LIMITS,
  STAGE_LABEL,
  STATUS_LABEL,
  TOOL_ACTION,
  TOOL_LABEL,
  clamp,
  countOf,
} from '../plants/types';
import type { PlantLogEntry, PlantTool } from '../plants/types';
import type { Notice } from './api';
import '../plants/plants.css';

interface PlantPanelProps {
  plantId: string;
  role: Role;
  currentTool: PlantTool | null;
  onToolChange: (tool: PlantTool | null) => void;
  onClose: () => void;
}

interface LogState {
  plantId: string;
  entries: PlantLogEntry[];
  error: string | null;
}

const LOG_SIZE = 10;

/** Mới nhất trước, tối đa LOG_SIZE dòng. */
function recentFirst(entries: PlantLogEntry[]): PlantLogEntry[] {
  return [...entries].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).slice(0, LOG_SIZE);
}

function formatTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString('vi-VN');
}

export function PlantPanel({ plantId, role, currentTool, onToolChange, onClose }: PlantPanelProps) {
  const { plants, loaded, error } = usePlants();
  const plant = plants.find((p) => p.id === plantId);
  const updatedAt = plant?.updatedAt;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [logTick, setLogTick] = useState(0);
  const [log, setLog] = useState<LogState | null>(null);

  // Đổi sang cây khác thì bỏ thông báo cũ.
  useEffect(() => {
    setNotice(null);
  }, [plantId]);

  // Nhật ký tải lại khi đổi cây, khi cây đổi dữ liệu (kể cả người khác chăm), và sau khi mình chăm.
  useEffect(() => {
    let alive = true;
    getPlantLog(plantId).then((r) => {
      if (!alive) return;
      if (r.ok) setLog({ plantId, entries: Array.isArray(r.data) ? recentFirst(r.data) : [], error: null });
      else setLog({ plantId, entries: [], error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [plantId, updatedAt, logTick]);

  const canCare = CARE_ROLES.includes(role);
  const logOfPlant = log && log.plantId === plantId ? log : null;

  const care = async () => {
    if (!plant || !currentTool || !canCare || busy) return;
    setBusy(true);
    setNotice(null);
    const r = await carePlantAndSync(plant.id, TOOL_ACTION[currentTool]);
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: 'ok', text: r.data.message || 'Đã chăm sóc cây.' });
      setLogTick((t) => t + 1);
    } else {
      // 409: đang hồi chiêu hoặc không có việc cần làm. Máy chủ không gửi lời thì dùng câu mặc định.
      const text =
        r.status === 409 && r.error.startsWith('Lỗi') ? 'Cây đang hồi chiêu hoặc chưa cần việc này.' : r.error;
      setNotice({ kind: 'err', text });
    }
  };

  return (
    <aside className="panel plant-panel" role="dialog" aria-labelledby="plant-panel-title">
      <header className="panel-head">
        <h2 id="plant-panel-title">{plant ? plant.name : 'Cây trong văn phòng'}</h2>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Đóng panel cây">
          ✕
        </button>
      </header>

      {!plant ? (
        <p className="muted">
          {!loaded
            ? 'Đang tải…'
            : error
              ? `Không tải được trạng thái cây (${error}). Thử lại sau.`
              : 'Không tìm thấy cây này.'}
        </p>
      ) : (
        <>
          <p className="muted small">
            {plant.species} · {STAGE_LABEL[plant.stage]} · {countOf(plant.ageDays)} ngày tuổi
          </p>
          <p>
            <span className={`plant-status plant-status--${plant.status}`}>{STATUS_LABEL[plant.status]}</span>
          </p>

          <ul className="plant-meters">
            <Meter label="Sức khỏe" value={plant.health} max={100} unit="/100" bad={plant.health < 30} />
            <Meter label="Nước" value={plant.water} max={100} unit="/100" bad={plant.water < 30} />
            <Meter label="Sâu" value={plant.pests} max={PLANT_LIMITS.maxPests} unit=" con" bad={plant.pests > 0} />
            <Meter label="Hoa" value={plant.flowers} max={PLANT_LIMITS.maxFlowers} unit=" bông" />
            <Meter label="Lá" value={plant.leaves} max={PLANT_LIMITS.maxLeaves} unit=" lá" />
          </ul>

          <h3 className="small">Cần chú ý</h3>
          {plant.needs && plant.needs.length > 0 ? (
            <ul className="kv">
              {plant.needs.map((need, i) => (
                <li key={i}>{need}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Hiện không có việc cần làm.</p>
          )}

          <h3 className="small">Chăm sóc</h3>
          <PlantToolbar inline tool={currentTool} onToolChange={onToolChange} />
          <p className="muted small">
            {currentTool
              ? `Đang dùng: ${TOOL_LABEL[currentTool]}. Nút Chăm sóc áp dụng cho cây này.`
              : 'Chọn một dụng cụ để chăm cây.'}
          </p>
          <button className="btn" type="button" onClick={care} disabled={!currentTool || !canCare || busy}>
            {busy ? 'Đang chăm sóc…' : 'Chăm sóc'}
          </button>
          {!canCare && <p className="denied small">Vai trò hiện tại không được chăm cây.</p>}
          <div role="status" aria-live="polite">
            {notice && <p className={notice.kind === 'ok' ? 'muted small' : 'denied small'}>{notice.text}</p>}
          </div>

          <h3 className="small">Nhật ký gần đây</h3>
          {!logOfPlant ? (
            <p className="muted small">Đang tải nhật ký…</p>
          ) : logOfPlant.error ? (
            <p className="denied small">Không tải được nhật ký ({logOfPlant.error}).</p>
          ) : logOfPlant.entries.length === 0 ? (
            <p className="muted small">Chưa có ai chăm cây này.</p>
          ) : (
            <ul className="kv plant-log">
              {logOfPlant.entries.map((e, i) => (
                <li key={i}>
                  <strong>{e.userName}</strong> {ACTION_LABEL[e.action] ?? e.action}{' '}
                  <span className="muted small">{formatTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}

interface MeterProps {
  label: string;
  value: number;
  max: number;
  /** Đơn vị hiển thị sau số, ví dụ "/100" hoặc " con". */
  unit: string;
  bad?: boolean;
}

/** Thanh tiến độ có nhãn chữ. Thanh chỉ đầy tới max, chữ hiển thị số thật. */
function Meter({ label, value, max, unit, bad = false }: MeterProps) {
  const real = countOf(value);
  const shown = clamp(real, 0, max);
  const pct = max > 0 ? (shown / max) * 100 : 0;
  const text = `${real}${unit}`;
  return (
    <li className="plant-meter">
      <div className="plant-meter-head">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div
        className={bad ? 'plant-bar plant-bar--bad' : 'plant-bar'}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={shown}
        aria-valuetext={text}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
