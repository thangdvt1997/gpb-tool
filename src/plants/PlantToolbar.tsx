import type { ReactNode } from 'react';
import { PLANT_TOOLS, TOOL_LABEL } from './types';
import type { PlantTool } from './types';
import './plants.css';

interface PlantToolbarProps {
  tool: PlantTool | null;
  onToolChange: (tool: PlantTool | null) => void;
  /** true: nằm trong panel. false (mặc định): thanh cố định ở đáy màn hình. */
  inline?: boolean;
}

/** Biểu tượng vẽ bằng SVG, không dùng emoji. */
const ICONS: Record<PlantTool, ReactNode> = {
  can: (
    <>
      <path d="M4 10h11v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
      <path d="M15 13h2.5l3-4" />
      <path d="M7 10V7" />
    </>
  ),
  pest: (
    <>
      <ellipse cx="12" cy="13" rx="4.5" ry="5.5" />
      <path d="M12 7.5V5M7.6 10 5 8.5M16.4 10 19 8.5M7.5 14H4M16.5 14H20M8 18.5 5.5 20.5M16 18.5l2.5 2" />
    </>
  ),
  'scissors-flower': (
    <>
      <circle cx="12" cy="7" r="2.5" />
      <circle cx="8.5" cy="11" r="2.5" />
      <circle cx="15.5" cy="11" r="2.5" />
      <path d="M12 13.5V21" />
      <path d="M12 17c-2 0-3.5-1-4-2.5" />
    </>
  ),
  shears: (
    <>
      <circle cx="7" cy="17" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
      <path d="M8.8 15.2 16 4.5M15.2 15.2 8 4.5" />
    </>
  ),
  fertilizer: (
    <>
      <path d="M12 3.5c-3 4-5.5 7-5.5 10a5.5 5.5 0 0 0 11 0c0-3-2.5-6-5.5-10z" />
      <path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
};

/**
 * Thanh chọn dụng cụ. Chọn một dụng cụ rồi bấm vào cây để chăm.
 * Bấm lại dụng cụ đang chọn, hoặc "Bỏ dụng cụ", để trở về xem bình thường.
 */
export function PlantToolbar({ tool, onToolChange, inline = false }: PlantToolbarProps) {
  return (
    <div className={inline ? 'plant-toolbar' : 'plant-toolbar plant-toolbar--docked'} role="group" aria-label="Dụng cụ chăm cây">
      {PLANT_TOOLS.map((t) => {
        const pressed = tool === t;
        return (
          <button
            key={t}
            type="button"
            className="plant-tool"
            aria-pressed={pressed}
            aria-label={TOOL_LABEL[t]}
            onClick={() => onToolChange(pressed ? null : t)}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ICONS[t]}
            </svg>
            <span>{TOOL_LABEL[t]}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="plant-tool plant-tool--clear"
        onClick={() => onToolChange(null)}
        disabled={tool === null}
      >
        Bỏ dụng cụ
      </button>
    </div>
  );
}
