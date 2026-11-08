// @ts-ignore tsconfig không có kiểu node; vitest chạy trong node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyMpfbPose, buildRig, createPoseWork } from './MpfbAvatar';
import { BAKED_BONES, ALL_BAKED_CLIP_DEFS, BAKED_CLIP_DEFS, BAKED_MODEL_IDS, EMOTE_CLIP_DEFS, emoteClipName, BAKED_ROOT_BONE, CLIP_FOR_ANIMATION, clipRootOffsetY } from './bakedClips';
import { buildSkeletonScene, jointNames, readGlbJson } from './glbSkeleton';
import { REST_POSE, computePose, type AvatarPose } from './animation';
import { EMOTES, EMOTE_ORDER, LEAD_IN } from '../emotes/library';
import { samplePoseOf } from '../emotes/player';
import type { EmoteId, Pose } from '../emotes/types';
import { CLIP_MAP, missingClips, resolveClip } from '../scene/motion/clipMap';

// @ts-ignore process/Buffer là của node
const read = (n: string): Uint8Array => readFileSync(`${process.cwd()}/public/models/${n}`);

async function loadClips(id: string): Promise<THREE.AnimationClip[]> {
  const b = read(`anim_${id}.glb`);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const g = await new GLTFLoader().parseAsync(ab, '');
  return g.animations;
}

describe('clip đã bake', () => {
  for (const id of BAKED_MODEL_IDS) {
    it(`${id}: tên clip, độ dài và tên xương khớp`, async () => {
      const clips = await loadClips(id);
      expect(clips.map((c) => c.name).sort()).toEqual(ALL_BAKED_CLIP_DEFS.map((d) => d.name).sort());
      const joints = new Set(jointNames(readGlbJson(read(`${id}.glb`))));
      for (const def of ALL_BAKED_CLIP_DEFS) {
        const clip = clips.find((c) => c.name === def.name) as THREE.AnimationClip;
        expect(clip.duration).toBeCloseTo(def.durationSec, 4);
        const bones = new Set(clip.tracks.map((t) => t.name.split('.')[0]));
        for (const b of [...BAKED_BONES, BAKED_ROOT_BONE]) expect(bones.has(b), `${def.name} thiếu track ${b}`).toBe(true);
        for (const b of bones) expect(joints.has(b), `${b} không có trong ${id}.glb`).toBe(true);
        for (const t of clip.tracks) expect(t.times[t.times.length - 1]).toBeCloseTo(def.durationSec, 4);
      }
    });

    it(`${id}: khớp tư thế procedural (xương nhận quaternion gần như nhau)`, async () => {
      const clips = await loadClips(id);
      const json = readGlbJson(read(`${id}.glb`));
      const rigA = buildRig({ scene: buildSkeletonScene(json) } as never);
      const rigB = buildRig({ scene: buildSkeletonScene(json) } as never);
      const mixer = new THREE.AnimationMixer(rigB.root);
      const work = createPoseWork();
      const cases: Array<[string, (t: number) => AvatarPose]> = [
        ['Walk', (t) => computePose('walk', t)],
        ['Run', (t) => computePose('run', t)],
        ['Dance', (t) => computePose('dance', t)],
      ];
      for (const [name, f] of cases) {
        const clip = clips.find((c) => c.name === name) as THREE.AnimationClip;
        const action = mixer.clipAction(clip).reset().play();
        for (const frac of [0, 0.13, 0.5, 0.77]) {
          const t = frac * clip.duration;
          action.time = t;
          mixer.update(0);
          applyMpfbPose(rigA, f(t), work);
          for (const b of BAKED_BONES) {
            const qa = (rigA.root.getObjectByName(b) as THREE.Object3D).quaternion;
            const qb = (rigB.root.getObjectByName(b) as THREE.Object3D).quaternion;
            expect(Math.abs(qa.dot(qb)), `${name}@${t.toFixed(3)} ${b}`).toBeGreaterThan(0.999);
          }
        }
        action.stop();
      }
      // Root: rootY của Walk tại t=0 bằng 0, tại pha cực đại dương.
      const walk = clips.find((c) => c.name === 'Walk') as THREE.AnimationClip;
      const restY = (rigB.root.getObjectByName(BAKED_ROOT_BONE) as THREE.Object3D).position.y;
      expect(Math.abs(clipRootOffsetY(walk, restY, 0))).toBeLessThan(1e-6);
      expect(clipRootOffsetY(walk, restY, (Math.PI / 2 / 6))).toBeGreaterThan(0.005);
    });

    it(`${id}: clip emote khớp bộ phát emote procedural`, async () => {
      const clips = await loadClips(id);
      const json = readGlbJson(read(`${id}.glb`));
      const rigA = buildRig({ scene: buildSkeletonScene(json) } as never);
      const rigB = buildRig({ scene: buildSkeletonScene(json) } as never);
      const mixer = new THREE.AnimationMixer(rigB.root);
      const work = createPoseWork();
      for (const eid of Object.keys(EMOTES) as EmoteId[]) {
        const def = EMOTES[eid];
        const clip = clips.find((c) => c.name === emoteClipName(eid)) as THREE.AnimationClip;
        expect(clip, eid).toBeTruthy();
        const action = mixer.clipAction(clip).reset().play();
        for (const frac of [0.1, 0.4, 0.75]) {
          const t = frac * clip.duration;
          action.time = t;
          mixer.update(0);
          const pose: AvatarPose = { ...REST_POSE };
          samplePoseOf(pose as Pose, def, def.mode === 'loop' ? t + LEAD_IN : t, false);
          applyMpfbPose(rigA, pose, work);
          for (const b of BAKED_BONES) {
            const qa = (rigA.root.getObjectByName(b) as THREE.Object3D).quaternion;
            const qb = (rigB.root.getObjectByName(b) as THREE.Object3D).quaternion;
            expect(Math.abs(qa.dot(qb)), `${eid}@${t.toFixed(3)} ${b}`).toBeGreaterThan(0.999);
          }
        }
        action.stop();
      }
    });

    it(`${id}: clip vòng lặp khép kín`, async () => {
      const clips = await loadClips(id);
      for (const def of ALL_BAKED_CLIP_DEFS.filter((d) => d.loop)) {
        const clip = clips.find((c) => c.name === def.name) as THREE.AnimationClip;
        for (const t of clip.tracks) {
          const n = t.getValueSize();
          const a = Array.from(t.values.slice(0, n));
          const b = Array.from(t.values.slice(t.values.length - n));
          const d = t.name.endsWith('quaternion') ? 1 - Math.abs(a.reduce((s, x, i) => s + x * b[i], 0)) : Math.hypot(...a.map((x, i) => x - b[i]));
          expect(d, `${def.name} ${t.name}`).toBeLessThan(1e-4);
        }
      }
    });
  }

  it('phủ CLIP_MAP: mọi trạng thái trừ emote có clip bake thật', () => {
    const names = new Set(BAKED_CLIP_DEFS.map((d) => d.name));
    expect(missingClips(names)).toEqual(['emote']);
    for (const s of Object.keys(CLIP_MAP) as Array<keyof typeof CLIP_MAP>) {
      if (s === 'emote') continue;
      const r = resolveClip(s, names);
      expect(r.source).toBe('clip');
      expect(r.usedAlternate).toBe(false);
    }
  });

  it('mọi emote (kể cả 6 emote người dùng) đều có đúng một clip bake', () => {
    expect(EMOTE_CLIP_DEFS.map((d) => d.name).sort()).toEqual(Object.keys(EMOTES).map(emoteClipName).sort());
    for (const id of EMOTE_ORDER) expect(EMOTE_CLIP_DEFS.some((d) => d.name === `Emote_${id}`)).toBe(true);
    for (const d of EMOTE_CLIP_DEFS) expect(d.durationSec).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(EMOTE_CLIP_DEFS.find((d) => d.name === 'Emote_dance_1')?.loop).toBe(true);
    expect(EMOTE_CLIP_DEFS.find((d) => d.name === 'Emote_wave')?.loop).toBe(false);
  });

  it('animation cố định có clip tương ứng', () => {
    const names = new Set(BAKED_CLIP_DEFS.map((d) => d.name));
    for (const c of Object.values(CLIP_FOR_ANIMATION)) expect(names.has(c as string)).toBe(true);
    expect(REST_POSE.rootY).toBe(0);
  });
});
