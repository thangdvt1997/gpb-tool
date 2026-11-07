// Khung chat chữ. Nội dung luôn render như văn bản (React tự escape, không dùng innerHTML).
// Gõ trong ô nhập không kích hoạt phím di chuyển: chặn nổi bọt của keydown/keyup.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatChannel } from './protocol';
import { MemberPanel } from './MemberPanel';
import { SeatLeaseBridge } from './SeatLeaseBridge';
import { WorldDebugHook } from './WorldDebug';
import type { WorldApi } from './useWorld';

const MAX_CHARS = 250; // khớp CHAT.maxChars của server

export function ChatPanel({ world }: { world: Pick<WorldApi, 'chat' | 'sendChat' | 'block' | 'blocked' | 'state' | 'muted' | 'role' | 'loadHistory' | 'client' | 'remote' | 'players' | 'leases'> }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<ChatChannel>('room');
  const listRef = useRef<HTMLUListElement | null>(null);
  const canSend = world.role !== 'guest' && !world.muted;
  const online = world.state === 'connected';

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [world.chat.length]);

  const stop = (e: KeyboardEvent) => e.stopPropagation();

  function submit() {
    if (!text.trim() || !canSend) return;
    world.sendChat(text, channel);
    setText('');
  }

  return (
    <>
    <section aria-label="Trò chuyện" style={{ width: 300, background: 'rgba(20,20,24,.82)', color: '#fff', borderRadius: 8, padding: 8, font: '13px system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button type="button" aria-pressed={channel === 'room'} onClick={() => setChannel('room')}>Cả phòng</button>
        <button type="button" aria-pressed={channel === 'near'} onClick={() => setChannel('near')}>Người ở gần</button>
        <button type="button" onClick={world.loadHistory} disabled={!online} style={{ marginLeft: 'auto' }}>Tin cũ</button>
      </div>
      <ul ref={listRef} style={{ listStyle: 'none', margin: 0, padding: 0, height: 160, overflowY: 'auto' }}>
        {world.chat.map((m) => (
          <li key={m.id} style={{ opacity: m.status === 'pending' ? 0.6 : 1, marginBottom: 2 }}>
            <strong>{m.from.name || 'Bạn'}</strong>
            {m.channel === 'near' ? ' (gần)' : ''}: <span>{m.text}</span>
            {m.status === 'pending' ? ' (đang gửi)' : ''}
            {m.status === 'failed' ? <em style={{ color: '#ff8a80' }}> (lỗi: {m.error})</em> : null}
            {m.from.id && !m.clientMsgId ? (
              <button type="button" aria-label={`${world.blocked.includes(m.from.id) ? 'Bỏ chặn' : 'Chặn'} ${m.from.name}`} onClick={() => world.block(m.from.id, !world.blocked.includes(m.from.id))} style={{ marginLeft: 6, fontSize: 11 }}>
                {world.blocked.includes(m.from.id) ? 'Bỏ chặn' : 'Chặn'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input
          value={text}
          maxLength={MAX_CHARS}
          disabled={!canSend}
          placeholder={world.muted ? 'Bạn đang bị tắt tiếng' : canSend ? 'Nhập tin nhắn' : 'Khách chỉ xem chat'}
          aria-label="Nội dung tin nhắn"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            stop(e);
            if (e.key === 'Enter') submit();
          }}
          onKeyUp={stop}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={submit} disabled={!canSend || !text.trim()}>Gửi</button>
      </div>
      {!online ? <div style={{ marginTop: 4, fontSize: 12 }}>Ngoại tuyến: tin sẽ được giữ và gửi lại khi có mạng.</div> : null}
    </section>
    <SeatLeaseBridge world={world} />
    <MemberPanel world={world} />
    <WorldDebugHook world={world} />
    </>
  );
}
