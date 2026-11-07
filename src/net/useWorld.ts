// Hook nối WorldClient + RemoteStore + chat vào React. Một hook cho cả cây; truyền kết quả xuống
// RemotePlayers, ChatPanel, ConnectionBanner qua prop `world`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatChannel, ChatMessage, LeaseView, ServerMessage } from './protocol';
import { pushServerReposition } from '../scene/controls/serverReposition';
import { RemoteStore } from './remoteState';
import { WorldClient, type ConnState } from './worldClient';

export type ChatStatus = 'pending' | 'sent' | 'failed';
export interface ChatItem extends ChatMessage {
  /** Có với tin của mình: id phía client để khớp ack. */
  clientMsgId?: string;
  status: ChatStatus;
  error?: string;
}

const MAX_CHAT = 200;

export function defaultWorldUrl(): string {
  if (typeof location === 'undefined') return 'ws://127.0.0.1:3011/api/world/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/world/ws`;
}

export interface UseWorldOptions {
  url?: string;
  /** false: không kết nối (ví dụ chưa đăng nhập). */
  enabled?: boolean;
}

export function useWorld({ url, enabled = true }: UseWorldOptions = {}) {
  const [state, setState] = useState<ConnState>('idle');
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [leases, setLeases] = useState<Record<string, LeaseView>>({});
  const [role, setRole] = useState<string>('guest');
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const remote = useMemo(() => new RemoteStore(), []);
  const clientRef = useRef<WorldClient | null>(null);
  // Bus tin server ổn định qua các lần tạo lại client: cho tính năng ngoài hook (ví dụ hành động xã hội) nghe.
  const tapRef = useRef(new Set<(m: ServerMessage) => void>());

  useEffect(() => {
    if (!enabled) return undefined;
    const client = new WorldClient({
      url: url ?? defaultWorldUrl(),
      storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    });
    clientRef.current = client;
    const offState = client.onState(setState);
    const offMsg = client.onMessage((m: ServerMessage) => {
      for (const fn of [...tapRef.current]) fn(m);
      switch (m.type) {
        case 'snapshot':
          remote.syncClock(m.serverTime, Date.now());
          remote.reset(m.players.filter((p) => p.id !== m.self.id));
          setPlayers(remote.ids());
          setLeases(Object.fromEntries(m.leases.map((l) => [l.resource, l])));
          setRole(m.role);
          // Nối lại phiên: server trả vị trí đã lưu thì nhân vật theo đó.
          if (m.resumed?.ok && m.resumed.spawn) pushServerReposition(m.resumed.spawn);
          break;
        case 'ack':
          // Server sửa vị trí của mình: nhân vật và camera phải theo (useCameraSafety lấy ở khung kế tiếp).
          if (m.corrected) pushServerReposition(m.accepted);
          break;
        case 'poses':
          remote.syncClock(m.serverTime, Date.now());
          for (const p of m.poses) if (p.id !== client.selfId) remote.push(p);
          setPlayers((prev) => {
            const ids = remote.ids();
            return ids.length === prev.length && ids.every((id, i) => id === prev[i]) ? prev : ids;
          });
          break;
        case 'leave':
          remote.remove(m.id);
          setPlayers(remote.ids());
          break;
        case 'lease':
          setLeases((prev) => ({ ...prev, [m.resource]: m }));
          break;
        case 'role':
          setRole(m.role);
          break;
        case 'muted':
          setMuted(m.on);
          break;
        case 'chat':
          // Hiển thị như chữ thuần; React tự escape. Khớp tin của mình theo id server.
          setChat((prev) => (prev.some((c) => c.id === m.id) ? prev : [...prev, { ...m, status: 'sent' as const }].slice(-MAX_CHAT)));
          break;
        case 'chat.ack':
          setChat((prev) => prev.map((c) => (c.clientMsgId === m.clientMsgId ? { ...c, id: m.id, at: m.at, status: 'sent' as const } : c)));
          break;
        case 'chat.history':
          setChat((prev) => {
            const have = new Set(prev.map((c) => c.id));
            const older = m.messages.filter((x) => !have.has(x.id)).map((x) => ({ ...x, status: 'sent' as const }));
            return [...older, ...prev].slice(-MAX_CHAT);
          });
          break;
        case 'chat.block':
          if (m.ok && m.blocked) setBlocked(m.blocked);
          break;
        case 'error':
          if (m.clientMsgId) {
            setChat((prev) => prev.map((c) => (c.clientMsgId === m.clientMsgId ? { ...c, status: 'failed' as const, error: m.code } : c)));
          }
          break;
        default:
          break;
      }
    });
    client.connect();
    return () => {
      offState();
      offMsg();
      client.dispose();
      clientRef.current = null;
    };
  }, [url, enabled, remote]);

  const sendChat = useCallback((text: string, channel: ChatChannel) => {
    const c = clientRef.current;
    if (!c) return;
    const clean = text.trim();
    if (!clean) return;
    const clientMsgId = c.sendChat(clean, channel);
    // Hiện ngay ở trạng thái pending; ack của server đổi sang sent, error đổi sang failed.
    setChat((prev) =>
      [...prev, { id: `local:${clientMsgId}`, clientMsgId, channel, from: { id: c.selfId ?? '', name: '' }, text: clean, at: Date.now(), status: 'pending' as const }].slice(-MAX_CHAT),
    );
  }, []);

  const block = useCallback((target: string, on: boolean) => {
    clientRef.current?.send({ type: 'chat.block', target, on });
  }, []);

  const loadHistory = useCallback(() => {
    clientRef.current?.send({ type: 'chat.history', limit: 30 });
  }, []);

  const subscribe = useCallback((fn: (m: ServerMessage) => void) => {
    tapRef.current.add(fn);
    return () => {
      tapRef.current.delete(fn);
    };
  }, []);

  return {
    state,
    client: clientRef,
    subscribe,
    remote,
    players,
    leases,
    role,
    muted,
    blocked,
    chat,
    sendChat,
    block,
    loadHistory,
    retry: () => clientRef.current?.retry(),
  };
}

export type WorldApi = ReturnType<typeof useWorld>;
