import { useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { createCityWorld, type CityWorld } from './cityWorld';
import type { TimeOfDay } from './timeOfDay';

export interface CityViewProps {
  /** Khung giờ của cảnh ngoài: sáng sớm, trưa, chiều, đêm. Mặc định 'noon'. */
  timeOfDay?: TimeOfDay;
  /** Bật hoặc tắt cảnh ngoài. Tắt thì mọi tài nguyên được giải phóng. Mặc định true. */
  enabled?: boolean;
}

/**
 * Cảnh thành phố ngoài cửa kính Đông-Nam. Đặt nhóm này trong scene với hệ toạ độ cục bộ:
 * gốc nằm trên sàn dưới góc kính bên ngoài, trục -Z hướng ra ngoài.
 * Ví dụ: <group position={[x, y, z]} rotation={[0, -3 * Math.PI / 4, 0]}><CityView timeOfDay="noon" /></group>
 */
export function CityView({ timeOfDay = 'noon', enabled = true }: CityViewProps) {
  if (!enabled) return null;
  return <CityScene timeOfDay={timeOfDay} />;
}

function CityScene({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  // Tạo một lần cho mỗi lần gắn. Đổi khung giờ qua setTimeOfDay, không dựng lại.
  const [world] = useState<CityWorld>(() => createCityWorld(timeOfDay));

  useEffect(() => {
    world.setTimeOfDay(timeOfDay);
  }, [world, timeOfDay]);

  useEffect(() => {
    return () => world.dispose();
  }, [world]);

  useFrame((state) => {
    world.update(state.clock.elapsedTime);
  });

  return <primitive object={world.group} />;
}
