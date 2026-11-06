/**
 * Kho tài nguyên đếm tham chiếu (TASK 04 mục 8). Nhiều nhân vật cùng bộ đồ dùng chung một geometry vỏ;
 * chỉ dispose khi không còn ai giữ. Thuần, không phụ thuộc three: giá trị chỉ cần có dispose().
 */
export interface Disposable {
  dispose(): void;
}

export class RefPool<V extends Disposable> {
  private readonly entries = new Map<string, { value: V; refs: number }>();

  /** Lấy tài nguyên theo khoá (tạo nếu chưa có) và tăng đếm. */
  acquire(key: string, factory: () => V): V {
    const found = this.entries.get(key);
    if (found) {
      found.refs++;
      return found.value;
    }
    const value = factory();
    this.entries.set(key, { value, refs: 1 });
    return value;
  }

  /** Giảm đếm; về 0 thì dispose và xoá. Trả true nếu đã dispose. Gọi thừa không làm gì. */
  release(key: string): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    e.refs--;
    if (e.refs > 0) return false;
    this.entries.delete(key);
    e.value.dispose();
    return true;
  }

  refs(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Băm FNV-1a 32 bit trên mảng số (dùng làm khoá nội dung cho geometry vỏ). */
export function hashArray(arr: ArrayLike<number>, quant = 1): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < arr.length; i++) {
    const x = Math.round(arr[i] * quant) | 0;
    h ^= x & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (x >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (x >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (x >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + '.' + arr.length.toString(36);
}
