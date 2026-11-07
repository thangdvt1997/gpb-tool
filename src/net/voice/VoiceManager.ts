// Thoại WebRTC mesh P2P cho nhóm nhỏ (TASK 25b). Tín hiệu đi qua WebSocket world (voice.signal); âm thanh đi P2P hoặc qua TURN.
// Mic chỉ được xin khi người dùng bấm nút (enable() gọi từ cử chỉ). Âm lượng từng peer theo khoảng cách/phòng,
// qua Web Audio: MediaStreamSource -> lowpass -> gain -> bus 'voice' của SpatialAudioManager.
import type { IceCredentials } from '../iceServers';
import type { ServerMessage } from '../protocol';
import {
  CONNECT_TIMEOUT_MS,
  MAX_PEERS,
  compactSdp,
  dist,
  nextPeerState,
  pickPeers,
  retryDelayMs,
  shouldInitiate,
  voiceGain,
  type Candidate,
  type PeerEvent,
  type PeerState,
  type SelfInfo,
} from './logic';

export interface VoiceDeps {
  selfId(): string | null;
  send(msg: Record<string, unknown>): boolean;
  subscribe(fn: (m: ServerMessage) => void): () => void;
  self(): SelfInfo;
  others(): Candidate[];
  getBus(): { ctx: AudioContext; node: GainNode } | null;
  fetchIce(): Promise<IceCredentials | null>;
  getUserMedia(): Promise<MediaStream>;
}

export type VoiceStatus = 'off' | 'starting' | 'on';
export type VoiceError = 'unsupported' | 'mic_denied' | 'no_turn' | 'no_audio';

interface Peer {
  id: string;
  callId: string;
  pc: RTCPeerConnection;
  state: PeerState;
  initiator: boolean;
  startedAt: number;
  pendingIce: RTCIceCandidateInit[];
  remoteSet: boolean;
  gain?: GainNode;
  lowpass?: BiquadFilterNode;
  src?: MediaStreamAudioSourceNode;
  sink?: HTMLAudioElement;
}

const TICK_MS = 250;
const GATHER_WAIT_MS = 2500;
/** Người nhận không trả lời offer (chưa bật mic): bỏ sớm để thử lại. Tính cả thời gian gom ICE. */
const OFFER_WAIT_MS = 8000;
const newCallId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export class VoiceManager {
  private status: VoiceStatus = 'off';
  private error: VoiceError | null = null;
  private stream: MediaStream | null = null;
  private ice: IceCredentials | null = null;
  private peers = new Map<string, Peer>();
  private failures = new Map<string, { n: number; until: number }>();
  /** Mã lỗi gần nhất server trả cho tin tín hiệu của mình (too_far, rate_limited...). */
  lastSignalError: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offSignal: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private snapshot = { status: 'off' as VoiceStatus, error: null as VoiceError | null, peers: [] as { id: string; state: PeerState }[] };

  constructor(private readonly deps: VoiceDeps, private readonly now: () => number = Date.now) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  getSnapshot() {
    return this.snapshot;
  }
  private publish(): void {
    const peers = [...this.peers.values()].map((p) => ({ id: p.id, state: p.state }));
    const s = this.snapshot;
    const same = s.status === this.status && s.error === this.error && s.peers.length === peers.length && s.peers.every((p, i) => p.id === peers[i]!.id && p.state === peers[i]!.state);
    if (same) return;
    this.snapshot = { status: this.status, error: this.error, peers };
    this.listeners.forEach((f) => f());
  }

  /** Bật thoại. PHẢI gọi từ thao tác người dùng (xin quyền mic). Trả true khi thành công. */
  async enable(): Promise<boolean> {
    if (this.status !== 'off') return this.status === 'on';
    if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices) return this.fail('unsupported');
    this.status = 'starting';
    this.error = null;
    this.publish();
    const ice = await this.deps.fetchIce();
    if (!ice) return this.fail('no_turn');
    let stream: MediaStream;
    try {
      stream = await this.deps.getUserMedia();
    } catch {
      return this.fail('mic_denied');
    }
    if (this.status !== 'starting') {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.ice = ice;
    this.stream = stream;
    this.status = 'on';
    this.offSignal = this.deps.subscribe((m) => {
      if (m.type === 'voice.signal') void this.onSignal(m);
      else if (m.type === 'leave') this.closePeer(m.id, false);
      else if (m.type === 'error' && m.callId) this.lastSignalError = m.code;
    });
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.publish();
    this.tick();
    return true;
  }

  private fail(e: VoiceError): false {
    this.status = 'off';
    this.error = e;
    this.publish();
    return false;
  }

  /** Tắt thoại: dừng mic, báo bye cho mọi peer, đóng kết nối. */
  disable(): void {
    if (this.status === 'off') return;
    for (const id of [...this.peers.keys()]) this.closePeer(id, true);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.offSignal?.();
    this.offSignal = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.failures.clear();
    this.status = 'off';
    this.publish();
  }

  // ----- vòng tick: chọn peer, nối/ngắt, cập nhật âm lượng -----

  private tick(): void {
    if (this.status !== 'on') return;
    const selfId = this.deps.selfId();
    if (!selfId) return;
    const t = this.now();
    const self = this.deps.self();
    const others = this.deps.others();
    const byId = new Map(others.map((o) => [o.id, o]));
    const wanted = pickPeers(self, others, new Set(this.peers.keys()), MAX_PEERS);
    const wantedSet = new Set(wanted);

    for (const id of [...this.peers.keys()]) {
      const p = this.peers.get(id)!;
      if (!wantedSet.has(id)) this.closePeer(id, true);
      else if (p.state === 'failed') this.closePeer(id, true, true);
      else if (p.state !== 'connected' && t - p.startedAt > (p.state === 'offering' && p.initiator ? OFFER_WAIT_MS : CONNECT_TIMEOUT_MS)) {
        this.transition(p, 'timeout');
        this.closePeer(id, true, true);
      }
    }
    for (const id of wanted) {
      if (this.peers.has(id) || !shouldInitiate(selfId, id)) continue;
      const f = this.failures.get(id);
      if (f && t < f.until) continue;
      void this.startCall(id);
    }
    // Âm lượng theo khoảng cách/phòng.
    const bus = this.deps.getBus();
    for (const p of this.peers.values()) {
      const o = byId.get(p.id);
      if (!p.gain || !o || !bus) continue;
      const g = voiceGain(dist(self, o), self.room, o.room);
      const now = bus.ctx.currentTime;
      p.gain.gain.setTargetAtTime(g.gain, now, 0.08);
      p.lowpass?.frequency.setTargetAtTime(g.cutoffHz, now, 0.08);
    }
    this.publish();
  }

  // ----- kết nối -----

  private makePeer(id: string, callId: string, initiator: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice?.iceServers ?? [] });
    const peer: Peer = { id, callId, pc, state: 'idle', initiator, startedAt: this.now(), pendingIce: [], remoteSet: false };
    for (const track of this.stream?.getAudioTracks() ?? []) pc.addTrack(track, this.stream!);
    pc.ontrack = (ev) => this.attachRemote(peer, ev.streams[0] ?? new MediaStream([ev.track]));
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') this.transition(peer, 'ice_connected');
      else if (s === 'disconnected') this.transition(peer, 'ice_disconnected');
      else if (s === 'failed') this.transition(peer, 'ice_failed');
    };
    this.peers.set(id, peer);
    return peer;
  }

  private transition(p: Peer, e: PeerEvent): void {
    p.state = nextPeerState(p.state, e);
    this.publish();
  }

  /** Chờ gom xong ICE (không trickle, mỗi lần gọi chỉ 1 offer + 1 answer) hoặc hết GATHER_WAIT_MS. */
  private gathered(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', onChange);
        clearTimeout(to);
        resolve();
      };
      const onChange = () => pc.iceGatheringState === 'complete' && done();
      const to = setTimeout(done, GATHER_WAIT_MS);
      pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  private async startCall(id: string): Promise<void> {
    const peer = this.makePeer(id, newCallId(), true);
    try {
      await this.refreshIce();
      this.transition(peer, 'local_offer');
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await this.gathered(peer.pc);
      if (this.peers.get(id) !== peer) return;
      this.deps.send({ type: 'voice.signal', kind: 'offer', to: id, callId: peer.callId, sdp: compactSdp(peer.pc.localDescription!.sdp) });
    } catch {
      this.markFailed(peer);
    }
  }

  private async refreshIce(): Promise<void> {
    if (this.ice && this.now() < this.ice.refreshAt) return;
    const fresh = await this.deps.fetchIce();
    if (fresh) this.ice = fresh;
  }

  private async onSignal(m: Extract<ServerMessage, { type: 'voice.signal' }>): Promise<void> {
    if (this.status !== 'on') return;
    const cur = this.peers.get(m.from);
    if (m.kind === 'bye') {
      if (cur && cur.callId === m.callId) this.closePeer(m.from, false);
      return;
    }
    if (m.kind === 'offer') {
      if (typeof m.sdp !== 'string') return;
      // Chỉ nhận offer từ người ta là bên gọi theo quy ước, và còn chỗ trong mesh.
      const selfId = this.deps.selfId();
      if (!selfId || shouldInitiate(selfId, m.from)) return;
      if (!cur && this.peers.size >= MAX_PEERS) return;
      if (cur) this.closePeer(m.from, false);
      const peer = this.makePeer(m.from, m.callId, false);
      try {
        await this.refreshIce();
        this.transition(peer, 'remote_offer');
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        peer.remoteSet = true;
        await this.flushIce(peer);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await this.gathered(peer.pc);
        if (this.peers.get(m.from) !== peer) return;
        this.deps.send({ type: 'voice.signal', kind: 'answer', to: m.from, callId: peer.callId, sdp: compactSdp(peer.pc.localDescription!.sdp) });
      } catch {
        this.markFailed(peer);
      }
      return;
    }
    if (!cur || cur.callId !== m.callId) return;
    try {
      if (m.kind === 'answer' && typeof m.sdp === 'string' && cur.initiator && cur.state === 'offering') {
        await cur.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
        cur.remoteSet = true;
        this.transition(cur, 'answer');
        await this.flushIce(cur);
      } else if (m.kind === 'ice' && typeof m.candidate === 'string') {
        const init: RTCIceCandidateInit = { candidate: m.candidate, sdpMid: m.sdpMid ?? null, sdpMLineIndex: m.sdpMLineIndex ?? null };
        if (cur.remoteSet) await cur.pc.addIceCandidate(init);
        else if (cur.pendingIce.length < 32) cur.pendingIce.push(init);
      }
    } catch {
      this.markFailed(cur);
    }
  }

  private async flushIce(p: Peer): Promise<void> {
    const list = p.pendingIce.splice(0);
    for (const c of list) await p.pc.addIceCandidate(c).catch(() => undefined);
  }

  private markFailed(p: Peer): void {
    this.transition(p, 'ice_failed');
  }

  /** Nối luồng nhận vào bus thoại qua Web Audio. Gain khởi đầu 0, tick sẽ đặt theo khoảng cách. */
  private attachRemote(p: Peer, stream: MediaStream): void {
    const bus = this.deps.getBus();
    // Chromium chỉ cấp dữ liệu cho MediaStreamSource khi luồng WebRTC đang được một phần tử media giữ; phần tử này tắt tiếng.
    const sink = new Audio();
    sink.muted = true;
    sink.srcObject = stream;
    void sink.play().catch(() => undefined);
    p.sink = sink;
    if (!bus) {
      this.error = 'no_audio';
      this.publish();
      return;
    }
    const src = bus.ctx.createMediaStreamSource(stream);
    const lowpass = bus.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 20000;
    const gain = bus.ctx.createGain();
    gain.gain.value = 0;
    src.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(bus.node);
    Object.assign(p, { src, lowpass, gain });
  }

  private closePeer(id: string, sendBye: boolean, failed = false): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (sendBye) this.deps.send({ type: 'voice.signal', kind: 'bye', to: id, callId: p.callId });
    try {
      p.src?.disconnect();
      p.lowpass?.disconnect();
      p.gain?.disconnect();
      if (p.sink) {
        p.sink.srcObject = null;
      }
      p.pc.close();
    } catch {
      // đã đóng
    }
    const prev = this.failures.get(id);
    if (failed) {
      const n = (prev?.n ?? 0) + 1;
      this.failures.set(id, { n, until: this.now() + retryDelayMs(n) });
    } else if (p.state === 'connected') {
      this.failures.delete(id);
    }
    this.publish();
  }

  // ----- hỗ trợ kiểm thử (window.__gpbVoice) -----

  /** Tổng hợp getStats mọi peer: connectionState, bytes nhận. */
  async debugStats(): Promise<{ id: string; state: PeerState; connectionState: string; bytesReceived: number; packetsReceived: number; audioTracks: number }[]> {
    const out = [];
    for (const p of this.peers.values()) {
      let bytes = 0;
      let packets = 0;
      const report = await p.pc.getStats();
      report.forEach((s: { type: string; kind?: string; bytesReceived?: number; packetsReceived?: number }) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') {
          bytes += s.bytesReceived ?? 0;
          packets += s.packetsReceived ?? 0;
        }
      });
      out.push({ id: p.id, state: p.state, connectionState: p.pc.connectionState, bytesReceived: bytes, packetsReceived: packets, audioTracks: p.pc.getReceivers().filter((r) => r.track.kind === 'audio').length });
    }
    return out;
  }
  debugGains(): Record<string, number> {
    return Object.fromEntries([...this.peers.values()].map((p) => [p.id, p.gain?.gain.value ?? -1]));
  }
}
