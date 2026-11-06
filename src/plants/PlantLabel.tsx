import { Html } from '@react-three/drei';
import { STATUS_LABEL } from './types';
import type { Plant } from './types';

interface PlantLabelProps {
  plant: Plant;
  /** Độ cao của nhãn trong hệ tọa độ của cây (trước hệ số tuổi). */
  y: number;
  visible: boolean;
}

/**
 * Nhãn tên và trạng thái. Chỉ tạo DOM khi visible (đang rê chuột hoặc đang chọn),
 * nên không tốn chi phí khi không cần.
 */
export function PlantLabel({ plant, y, visible }: PlantLabelProps) {
  if (!visible) return null;
  return (
    <Html position={[0, y, 0]} center>
      <div className="label">
        {plant.name} · {STATUS_LABEL[plant.status]}
      </div>
    </Html>
  );
}
