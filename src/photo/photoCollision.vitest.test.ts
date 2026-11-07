import { describe, expect, it } from 'vitest';
import { EMOTES, EMOTE_ORDER } from '../emotes/library';
import {
  cancelEmote, getEmoteState, holdEmotePose, notifyMovement, releaseHeldPose, sampleEmotePose, playEmote,
} from '../emotes/player';
import type { Pose } from '../emotes/types';
import { BANNER, BANNER_SPOTS } from '../scene/officePropsLayout';
import { toWorldX, toWorldZ } from '../scene/layout';
import { escapeBlockers, isInsideCameraBlocker, slideCamera } from './photoCollision';
import { heldPoseOf, isPhotoPose, photoPoseOptions } from './photoPose';

const wall = { minX: 0, maxX: 2, minZ: 0, maxZ: 4 }; // tủ cao 2 x 4 m
const small = { minX: 5, maxX: 5.3, minZ: 5, maxZ: 5.3 }; // chậu cây nhỏ

describe('slideCamera', () => {
  it('đi tự do ở nơi trống', () => {
    const to = { x: 10, y: 1.5, z: 10 };
    expect(slideCamera({ x: 9, y: 1.5, z: 9 }, to, [wall])).toEqual(to);
  });
  it('không đi vào vật cản lớn, dừng tại chỗ khi đâm thẳng', () => {
    const from = { x: 3, y: 1.5, z: 2 };
    const r = slideCamera(from, { x: 1, y: 1.5, z: 2 }, [wall]);
    expect(isInsideCameraBlocker(r, [wall])).toBe(false);
    expect(r).toEqual(from);
  });
  it('trượt dọc mặt vật cản khi đi chéo', () => {
    const r = slideCamera({ x: 2.3, y: 1.5, z: 1 }, { x: 2.1, y: 1.5, z: 1.5 }, [wall]);
    expect(r.z).toBe(1.5); // z vẫn tiến
    expect(r.x).toBe(2.3); // x bị chặn
  });
  it('bỏ qua props nhỏ', () => {
    const to = { x: 5.15, y: 1.5, z: 5.15 };
    expect(slideCamera({ x: 4, y: 1.5, z: 5.15 }, to, [small])).toEqual(to);
  });
  it('bay trên đỉnh vật cản thì không bị chặn', () => {
    const to = { x: 1, y: 3.4, z: 2 };
    expect(slideCamera({ x: 3, y: 3.4, z: 2 }, to, [wall])).toEqual(to);
  });
  it('lỡ nằm trong vật cản vẫn đi ra được; escapeBlockers đẩy ra mép', () => {
    const e = escapeBlockers({ x: 0.5, y: 1.5, z: 2 }, [wall]);
    expect(isInsideCameraBlocker(e, [wall])).toBe(false);
    expect(escapeBlockers({ x: 9, y: 1.5, z: 9 }, [wall])).toEqual({ x: 9, y: 1.5, z: 9 });
    const out = slideCamera({ x: 0.5, y: 1.5, z: 2 }, { x: 0.2, y: 1.5, z: 2 }, [wall]);
    expect(out.x).toBe(0.2);
  });
  it('không xuyên băng rôn', () => {
    const b = BANNER_SPOTS[0]!;
    const x = toWorldX(b.x);
    const z = toWorldZ(b.y);
    const y = BANNER.bottom + BANNER.height / 2;
    const from = { x, y, z: z - 1 };
    const r = slideCamera(from, { x, y, z: z + 1 }, []);
    expect(r.z).toBeLessThan(z);
    // Bay thấp dưới băng rôn thì qua được.
    const low = slideCamera({ x, y: 1.2, z: z - 1 }, { x, y: 1.2, z: z + 1 }, []);
    expect(low.z).toBe(z + 1);
  });
});

describe('chọn pose chụp ảnh', () => {
  it('danh sách lấy từ EMOTE_ORDER, có nhãn', () => {
    const o = photoPoseOptions();
    expect(o.map((x) => x.id)).toEqual([...EMOTE_ORDER]);
    for (const x of o) expect(x.label).toBe(EMOTES[x.id].label);
    expect(isPhotoPose('wave')).toBe(true);
    expect(isPhotoPose('hit')).toBe(false);
    expect(isPhotoPose('')).toBe(false);
  });
  it('khung đứng yên có thật cho mọi emote', () => {
    for (const id of EMOTE_ORDER) expect(Object.keys(heldPoseOf(id)).length).toBeGreaterThan(0);
  });
  it('holdEmotePose giữ khung tĩnh, không hết giờ, không bị notifyMovement hủy; release trả về rảnh', () => {
    cancelEmote();
    holdEmotePose('wave', 0);
    const out = {} as Pose;
    expect(sampleEmotePose(out, 60_000)).toBe(true);
    expect(out.armRZ).toBe(EMOTES.wave.frames[EMOTES.wave.reducedFrame]!.pose.armRZ ?? 0);
    notifyMovement();
    expect(getEmoteState().phase).toBe('playing');
    expect(releaseHeldPose()).toBe(true);
    expect(getEmoteState().phase).toBe('idle');
    expect(releaseHeldPose()).toBe(false);
  });
  it('release không đụng emote đang chạy bình thường; emote nội bộ bị từ chối', () => {
    cancelEmote();
    playEmote('dance_1', 0);
    expect(releaseHeldPose()).toBe(false);
    expect(getEmoteState().id).toBe('dance_1');
    cancelEmote();
    holdEmotePose('hit');
    expect(getEmoteState().phase).toBe('idle');
  });
});
