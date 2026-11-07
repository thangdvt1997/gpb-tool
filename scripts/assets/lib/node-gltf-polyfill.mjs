// Polyfill tối thiểu để three GLTFExporter chạy trong Node (không có FileReader; Blob có sẵn từ Node 18).
// GLTFExporter chỉ dùng FileReader.readAsArrayBuffer / readAsDataURL trên Blob.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onload = null;
      this.onerror = null;
    }
    #finish(p) {
      p.then((r) => {
        this.result = r;
        const ev = { target: this };
        this.onload?.(ev);
        this.onloadend?.(ev);
      }).catch((e) => {
        this.error = e;
        this.onerror?.({ target: this });
      });
    }
    readAsArrayBuffer(blob) {
      this.#finish(blob.arrayBuffer());
    }
    readAsDataURL(blob) {
      this.#finish(blob.arrayBuffer().then((ab) => `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(ab).toString('base64')}`));
    }
  };
}

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** Xuất Object3D thành GLB (Buffer). options.animations: mảng AnimationClip. */
export function exportGlb(scene, options = {}) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      scene,
      (res) => resolve(Buffer.from(res)),
      (err) => reject(err),
      { binary: true, onlyVisible: false, ...options },
    );
  });
}
