// Gắn cầu nối lease ghế (seatLease.ts) vào vòng đời React; mount trong ChatPanel nên chỉ chạy khi bật ?world=1.
// Hiện thông báo (ví dụ "Ghế đã có người") thành dải trạng thái nhỏ, đồng thời báo qua aria-live.
import { useEffect, useRef, useState } from 'react';
import { announce } from '../a11y';
import { attachSeatLease } from './seatLease';
import type { WorldApi } from './useWorld';

export function SeatLeaseBridge({ world }: { world: Pick<WorldApi, 'client' | 'state'> }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // client.current chỉ có sau effect của useWorld: render lại khi state đổi thì mới thấy.
  const client = world.client.current;

  useEffect(() => {
    if (!client) return undefined;
    const off = attachSeatLease(client, {
      notify: (m) => {
        announce(m, 'assertive');
        setMsg(m);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setMsg(''), 3000);
      },
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [client]);

  if (!msg) return null;
  return (
    <div role="status" style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(160,40,40,.9)', color: '#fff', font: '13px system-ui, sans-serif' }}>
      {msg}
    </div>
  );
}
