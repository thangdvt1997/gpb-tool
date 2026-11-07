import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHELL_SHADER_MARKER, baseGeometryOf, claimBody, isShellShaderSource, releaseBody } from './outfitGuard';
import { createShellMaterial } from './threeShell';

describe('bảo vệ mesh thân: một bộ dựng vỏ mỗi thân', () => {
  it('bộ thứ hai bị từ chối; geometry gốc được nhớ và trả lại', () => {
    const orig = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(orig);
    const a = {};
    const b = {};
    expect(claimBody(mesh, a)).toBe(true);
    const derived = new THREE.BufferGeometry();
    mesh.geometry = derived; // bộ A thay bằng geometry da
    expect(claimBody(mesh, b)).toBe(false); // bộ B không được đụng vào
    expect(baseGeometryOf(mesh)).toBe(orig); // dù geometry hiện tại đã bị thay
    releaseBody(mesh, b); // B không có quyền nhả
    expect(mesh.geometry).toBe(derived);
    releaseBody(mesh, a);
    expect(mesh.geometry).toBe(orig);
    expect(claimBody(mesh, b)).toBe(true); // nhả xong thì bộ khác nhận được
  });

  it('nhận lại cùng token khi dựng lại không mất geometry gốc', () => {
    const orig = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(orig);
    const a = {};
    claimBody(mesh, a);
    mesh.geometry = new THREE.BufferGeometry();
    releaseBody(mesh, a);
    claimBody(mesh, a);
    expect(baseGeometryOf(mesh)).toBe(orig);
  });

  it('nhận ra shader của vỏ để kích hoạt chế độ dự phòng', () => {
    const m = createShellMaterial(0);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <morphtarget_vertex>',
      fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>',
    };
    (m.onBeforeCompile as (s: unknown) => void)(shader);
    expect(shader.fragmentShader).toContain(SHELL_SHADER_MARKER);
    expect(isShellShaderSource(shader.fragmentShader)).toBe(true);
    expect(isShellShaderSource('void main(){}')).toBe(false);
    expect(isShellShaderSource(null)).toBe(false);
  });

  it('WardrobeRoom không còn gắn MpfbOutfitOn chồng lên MpfbAvatar (đã có MpfbOutfit bên trong)', async () => {
    const fs = (globalThis as unknown as { process: { getBuiltinModule(n: string): { readFileSync(p: string, e: string): string } ; cwd(): string } }).process;
    const src = fs.getBuiltinModule('fs').readFileSync(`${fs.cwd()}/src/wardrobe/WardrobeRoom.tsx`, 'utf8');
    expect(src).not.toMatch(/<MpfbOutfitOn/);
  });
});
