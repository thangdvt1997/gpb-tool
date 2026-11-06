import { useEffect, useState } from 'react';

export type ServiceStatus = 'ok' | 'warn' | 'down';

export interface Service {
  id: string;
  name: string;
  status: ServiceStatus;
  updatedAt: string;
  owner: string;
}

export const statusColor: Record<ServiceStatus, string> = {
  ok: '#2fbf71',
  warn: '#f2b632',
  down: '#e5484d',
};

export const STATUS_TEXT: Record<ServiceStatus, string> = {
  ok: 'Bình thường',
  warn: 'Cảnh báo',
  down: 'Gián đoạn',
};

/**
 * Đọc trạng thái dịch vụ từ services/it qua gateway (/api/it/services).
 */
export function useServices(refreshMs = 30000) {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/it/services')
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<Service[]>;
        })
        .then((data) => {
          if (!alive) return;
          setServices(data);
          setError(null);
          setLoaded(true);
        })
        .catch((e: Error) => {
          if (!alive) return;
          setError(e.message);
          setLoaded(true);
        });
    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refreshMs]);

  return { services, error, loaded };
}
