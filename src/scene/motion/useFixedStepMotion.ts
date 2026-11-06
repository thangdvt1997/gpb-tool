import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { FixedStepRunner, pauseFixedStep, resumeFixedStep, type FixedStepConfig, type MotionPose } from './fixedStep';

export interface FixedStepMotionOptions {
  /** Đọc tư thế mô phỏng hiện tại (sau mỗi bước). Ví dụ: (o) => { o.x = m.pos.x; o.y = m.pos.y; o.z = m.pos.z; o.yaw = m.yaw; }. */
  read: (out: MotionPose) => void;
  /** Một bước mô phỏng cố định. h luôn là 1/hz. Cờ `first` true ở bước đầu của khung (để chỉ tiêu input nhảy một lần). */
  step: (h: number, first: boolean) => void;
  /** Gọi sau khi đã nội suy: ghi `render` vào group/camera. alpha 0..1. */
  onRender?: (render: MotionPose, alpha: number, stepsThisFrame: number) => void;
  /** false: tạm dừng (menu, khóa). Mặc định true. */
  enabled?: boolean;
  config?: Partial<FixedStepConfig>;
  /** Thứ tự useFrame (mặc định 0, cùng useGtaPlayer). */
  priority?: number;
}

export interface FixedStepMotion {
  runner: FixedStepRunner;
  /** Gọi sau dịch chuyển/hồi sinh để không nội suy xuyên khoảng nhảy. */
  snap: () => void;
}

/**
 * Cắm vòng cập nhật bước cố định vào một useFrame. Tạm dừng khi tab ẩn hoặc mất focus
 * (không dồn thời gian khi quay lại), kẹp dt, giới hạn số bước mỗi khung.
 * Xem docs/design/MOTION.md để biết cách thay vòng cập nhật trong useGtaPlayer.
 */
export function useFixedStepMotion(opts: FixedStepMotionOptions): FixedStepMotion {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const runner = useMemo(() => new FixedStepRunner((o) => optsRef.current.read(o), opts.config), []); // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = opts.enabled ?? true;
  useEffect(() => {
    const stop = (): void => pauseFixedStep(runner.stepper);
    const go = (): void => {
      if (document.visibilityState === 'visible') {
        resumeFixedStep(runner.stepper);
        runner.snap();
      }
    };
    const onVis = (): void => (document.visibilityState === 'visible' ? go() : stop());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', stop);
    window.addEventListener('focus', go);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', stop);
      window.removeEventListener('focus', go);
    };
  }, [runner]);

  useEffect(() => {
    if (enabled) resumeFixedStep(runner.stepper);
    else pauseFixedStep(runner.stepper);
  }, [enabled, runner]);

  useFrame((_s, dt) => {
    const o = optsRef.current;
    let first = true;
    const n = runner.advance(dt, (h) => {
      o.step(h, first);
      first = false;
    });
    o.onRender?.(runner.render, runner.stepper.alpha, n);
  }, opts.priority ?? 0);

  return useMemo(() => ({ runner, snap: () => runner.snap() }), [runner]);
}
