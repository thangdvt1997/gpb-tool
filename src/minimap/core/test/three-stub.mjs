// Bản giả tối thiểu của 'three' cho test (xem ts-hooks.mjs). Chỉ đủ để module cấp cao nhất của
// src/scene/entry/placement.ts khởi tạo được; test không dùng kết quả của các lớp này.
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  applyMatrix4() {
    return this;
  }
}
export class Matrix4 {
  compose() {
    return this;
  }
}
export class Quaternion {
  setFromAxisAngle() {
    return this;
  }
}
