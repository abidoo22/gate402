"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Clock,
  KeyRound,
  Lock,
  Pause,
  Play,
  ShieldCheck,
  Terminal,
  Unlock,
  UserX,
  Zap,
} from "lucide-react";

type RouterMode = "free" | "locked" | "paid";
type EndpointId = "safety" | "dex" | "preflight";

interface Point {
  x: number;
  y: number;
}

interface PolyPath {
  points: Point[];
  segLengths: number[];
  totalLength: number;
}

interface BitTrain {
  id: number;
  lane: "ai" | "anon";
  t: number; // 0..1 from caller to vault
  speed: number;
  bits: string[];
  flipTimer: number;
  isBurst?: boolean;
}

interface EgressPacket {
  id: number;
  endpoint: EndpointId;
  t: number; // 0..1 from vault to endpoint
  speed: number;
  label: string;
  trailingBits: string;
  tone: "emerald" | "gold";
  isBurst?: boolean;
}

interface BounceWave {
  id: number;
  t: number; // 0..1 returning from vault to anon caller
  speed: number;
  label: string;
}

interface VaultPulse {
  age: number; // 0..1
  tone: "emerald" | "gold" | "reject";
}

interface LayoutAnchors {
  width: number;
  height: number;
  horizontal: boolean;
  callerAi: Point;
  callerAnon: Point;
  vaultCenter: Point;
  vaultIntake: Point;
  vaultEgress: Point;
  vaultRadius: number;
  endpoints: Record<EndpointId, Point>;
}

const ENDPOINTS: Array<{
  id: EndpointId;
  name: string;
  path: string;
  token: string;
  freePayload: string;
  paidPayload: string;
}> = [
  {
    id: "safety",
    name: "Safety Audit",
    path: "/v1/bsc/safety-audit",
    token: "OK 100",
    freePayload: '200 OK · {"score":100,"verdict":"SAFE","quota":"49/50"}',
    paidPayload: '200 OK · {"score":100,"settled":"0.005 USDT","x402":true}',
  },
  {
    id: "dex",
    name: "DEX Intel",
    path: "/v1/bsc/dex-intel",
    token: "DEX OK",
    freePayload: '200 OK · {"pair":"WBNB/USDT","liq":"$42.8M","tax":"0%"}',
    paidPayload: '200 OK · {"pair":"WBNB/USDT","settled":"0.005 USDT"}',
  },
  {
    id: "preflight",
    name: "Tx Preflight",
    path: "/v1/bsc/tx-preflight",
    token: "SIM OK",
    freePayload: '200 OK · {"sim":"PASS","honeypot":false,"gas":"48k"}',
    paidPayload: '200 OK · {"sim":"PASS","settled":"0.005 USDT"}',
  },
];

const BOLT_ANGLES = [30, 90, 150, 210, 270, 330] as const;

const BINARY_FRAMES: Record<RouterMode, string[]> = {
  free: [
    "01100001 01100010 01101001 01100100",
    "01101111 00101110 01100001 01101001",
    "01000101 01001001 01010000 00110001",
    "01110000 01100001 01110011 01110011",
  ],
  locked: [
    "10110100 00110100 00110000 00110010",
    "01100001 01101110 01101111 01101110",
    "11001010 01011001 00110100 00110010",
    "01011000 00101101 01010000 01000001",
  ],
  paid: [
    "01111000 00110100 00110000 00110010",
    "01010101 01010011 01000100 01010100",
    "00110000 00101110 00110000 00110101",
    "01110000 01100101 01110010 01101101",
  ],
};

function randomBit(): string {
  return Math.random() > 0.48 ? "1" : "0";
}

function makeBits(len: number): string[] {
  return Array.from({ length: len }, () => randomBit());
}

/**
 * Builds an architectural 45°-chamfered PCB conduit polyline between two points
 * so data flows along engineered traces instead of generic Bezier curves.
 */
function buildConduitPath(start: Point, end: Point, horizontal: boolean): PolyPath {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let points: Point[];

  if (horizontal) {
    if (Math.abs(dy) < 4) {
      points = [start, end];
    } else {
      const midX = start.x + dx * 0.5;
      const chamfer = Math.min(Math.abs(dy) * 0.65, Math.abs(dx) * 0.28, 28);
      const sx = dx >= 0 ? 1 : -1;
      points = [
        start,
        { x: midX - sx * chamfer, y: start.y },
        { x: midX + sx * chamfer, y: end.y },
        end,
      ];
    }
  } else {
    if (Math.abs(dx) < 4) {
      points = [start, end];
    } else {
      const midY = start.y + dy * 0.5;
      const chamfer = Math.min(Math.abs(dx) * 0.65, Math.abs(dy) * 0.28, 22);
      const sy = dy >= 0 ? 1 : -1;
      points = [
        start,
        { x: start.x, y: midY - sy * chamfer },
        { x: end.x, y: midY + sy * chamfer },
        end,
      ];
    }
  }

  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLengths.push(len);
    totalLength += len;
  }

  return { points, segLengths, totalLength: Math.max(totalLength, 1) };
}

function samplePath(path: PolyPath, t: number): { x: number; y: number; angle: number } {
  const clamped = Math.max(0, Math.min(1, t));
  let targetDist = clamped * path.totalLength;
  for (let i = 0; i < path.segLengths.length; i++) {
    const segLen = path.segLengths[i];
    if (targetDist <= segLen || i === path.segLengths.length - 1) {
      const ratio = segLen > 0 ? Math.max(0, Math.min(1, targetDist / segLen)) : 0;
      const p0 = path.points[i];
      const p1 = path.points[i + 1];
      return {
        x: p0.x + (p1.x - p0.x) * ratio,
        y: p0.y + (p1.y - p0.y) * ratio,
        angle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
      };
    }
    targetDist -= segLen;
  }
  const last = path.points[path.points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

function strokePolyline(ctx: CanvasRenderingContext2D, path: PolyPath) {
  ctx.beginPath();
  ctx.moveTo(path.points[0].x, path.points[0].y);
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(path.points[i].x, path.points[i].y);
  }
  ctx.stroke();
}

function formatUtcReset(now: Date): {
  countdown: string;
  utcTime: string;
  dayProgress: number;
  secondAngle: number;
} {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const s = now.getUTCSeconds();
  const ms = now.getUTCMilliseconds();

  const elapsedSec = h * 3600 + m * 60 + s;
  const remaining = Math.max(0, 86400 - elapsedSec);
  const rh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const rm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const rs = String(remaining % 60).padStart(2, "0");

  const uh = String(h).padStart(2, "0");
  const um = String(m).padStart(2, "0");
  const us = String(s).padStart(2, "0");

  return {
    countdown: `${rh}:${rm}:${rs}`,
    utcTime: `${uh}:${um}:${us}`,
    dayProgress: elapsedSec / 86400,
    secondAngle: ((s + ms / 1000) / 60) * 360,
  };
}

export function LiveProtocolRouter() {
  const [mode, setMode] = useState<RouterMode>("free");
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointId>("safety");
  const [paused, setPaused] = useState(false);
  const [dialClicks, setDialClicks] = useState(0);
  const [wireFrameIdx, setWireFrameIdx] = useState(0);
  const [clockState, setClockState] = useState<{
    countdown: string;
    utcTime: string;
    dayProgress: number;
    secondAngle: number;
  }>({
    countdown: "--:--:--",
    utcTime: "--:--:--",
    dayProgress: 0.42,
    secondAngle: 0,
  });

  // DOM refs for precision canvas anchor alignment
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const callerAiRef = useRef<HTMLButtonElement | null>(null);
  const callerAnonRef = useRef<HTMLButtonElement | null>(null);
  const vaultRef = useRef<HTMLButtonElement | null>(null);
  const epSafetyRef = useRef<HTMLButtonElement | null>(null);
  const epDexRef = useRef<HTMLButtonElement | null>(null);
  const epPreflightRef = useRef<HTMLButtonElement | null>(null);

  // Refs synced to the canvas animation loop
  const modeRef = useRef<RouterMode>("free");
  const endpointRef = useRef<EndpointId>("safety");
  const pausedRef = useRef<boolean>(false);
  const hiddenRef = useRef<boolean>(false);
  const anchorsRef = useRef<LayoutAnchors | null>(null);
  const injectQueueRef = useRef<number>(0);
  const flushParticlesRef = useRef<boolean>(false);
  const drawSnapshotRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    modeRef.current = mode;
    flushParticlesRef.current = true;
    drawSnapshotRef.current?.();
  }, [mode]);

  useEffect(() => {
    endpointRef.current = selectedEndpoint;
    flushParticlesRef.current = true;
    drawSnapshotRef.current?.();
  }, [selectedEndpoint]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Honor prefers-reduced-motion on mount
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setPaused(true);
      pausedRef.current = true;
    }
    const onChange = (e: MediaQueryListEvent) => {
      setPaused(e.matches);
      pausedRef.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Client-only UTC Chronometer + rolling binary wire ticker (prevents SSR hydration mismatch)
  useEffect(() => {
    setClockState(formatUtcReset(new Date()));
    const clockTimer = window.setInterval(() => {
      if (pausedRef.current || hiddenRef.current) return;
      setClockState(formatUtcReset(new Date()));
    }, 250);

    const wireTimer = window.setInterval(() => {
      if (pausedRef.current || hiddenRef.current) return;
      setWireFrameIdx((i) => (i + 1) % 4);
    }, 900);

    return () => {
      window.clearInterval(clockTimer);
      window.clearInterval(wireTimer);
    };
  }, []);

  // Measure node positions relative to stage container
  const measureAnchors = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const aiEl = callerAiRef.current;
    const anonEl = callerAnonRef.current;
    const vaultEl = vaultRef.current;
    const sEl = epSafetyRef.current;
    const dEl = epDexRef.current;
    const pEl = epPreflightRef.current;
    if (!stage || !canvas || !aiEl || !anonEl || !vaultEl || !sEl || !dEl || !pEl) return;

    const sr = stage.getBoundingClientRect();
    const horizontal = sr.width >= 540;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.round(sr.width * dpr));
    canvas.height = Math.max(1, Math.round(sr.height * dpr));

    const rel = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - sr.left,
        right: r.right - sr.left,
        top: r.top - sr.top,
        bottom: r.bottom - sr.top,
        cx: r.left - sr.left + r.width / 2,
        cy: r.top - sr.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    };

    const ai = rel(aiEl);
    const anon = rel(anonEl);
    const v = rel(vaultEl);
    const s = rel(sEl);
    const d = rel(dEl);
    const p = rel(pEl);

    const vaultRadius = Math.min(v.w, v.h) / 2;

    anchorsRef.current = horizontal
      ? {
          width: sr.width,
          height: sr.height,
          horizontal: true,
          callerAi: { x: ai.right, y: ai.cy },
          callerAnon: { x: anon.right, y: anon.cy },
          vaultCenter: { x: v.cx, y: v.cy },
          vaultIntake: { x: v.left + 4, y: v.cy },
          vaultEgress: { x: v.right - 4, y: v.cy },
          vaultRadius,
          endpoints: {
            safety: { x: s.left, y: s.cy },
            dex: { x: d.left, y: d.cy },
            preflight: { x: p.left, y: p.cy },
          },
        }
      : {
          width: sr.width,
          height: sr.height,
          horizontal: false,
          callerAi: { x: ai.cx, y: ai.bottom },
          callerAnon: { x: anon.cx, y: anon.bottom },
          vaultCenter: { x: v.cx, y: v.cy },
          vaultIntake: { x: v.cx, y: v.top + 4 },
          vaultEgress: { x: v.cx, y: v.bottom - 4 },
          vaultRadius,
          endpoints: {
            safety: { x: s.cx, y: s.top },
            dex: { x: d.cx, y: d.top },
            preflight: { x: p.cx, y: p.top },
          },
        };

    drawSnapshotRef.current?.();
  }, []);

  // Main Canvas 2D Binary Stream & Decryption Engine + Efficient Background Pausing
  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!root || !stage || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let disposed = false;
    let rafId = 0;
    let lastTs = performance.now();
    let spawnAcc = 0;
    let nextId = 1;

    const ingressTrains: BitTrain[] = [
      { id: nextId++, lane: "ai", t: 0.22, speed: 0.42, bits: makeBits(6), flipTimer: 0 },
      { id: nextId++, lane: "ai", t: 0.68, speed: 0.42, bits: makeBits(6), flipTimer: 0.1 },
    ];
    const egressPackets: EgressPacket[] = [
      {
        id: nextId++,
        endpoint: "safety",
        t: 0.48,
        speed: 0.46,
        label: "OK 100",
        trailingBits: "0110",
        tone: "emerald",
      },
    ];
    const bounceWaves: BounceWave[] = [];
    const vaultPulses: VaultPulse[] = [];

    const drawFrame = (isStaticSnapshot = false) => {
      const a = anchorsRef.current;
      if (!a) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, a.width, a.height);

      const curMode = modeRef.current;
      const curEp = endpointRef.current;
      const isFree = curMode === "free";
      const isLocked = curMode === "locked";
      const isPaid = curMode === "paid";

      const pathAi = buildConduitPath(a.callerAi, a.vaultIntake, a.horizontal);
      const pathAnon = buildConduitPath(a.callerAnon, a.vaultIntake, a.horizontal);
      const epPaths: Record<EndpointId, PolyPath> = {
        safety: buildConduitPath(a.vaultEgress, a.endpoints.safety, a.horizontal),
        dex: buildConduitPath(a.vaultEgress, a.endpoints.dex, a.horizontal),
        preflight: buildConduitPath(a.vaultEgress, a.endpoints.preflight, a.horizontal),
      };

      // 1. Draw recessed PCB trace trenches + active trace highlights
      const drawTrace = (path: PolyPath, active: boolean, color: string, dimAlpha = 0.14) => {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Outer recessed channel
        ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
        ctx.lineWidth = 4.5;
        strokePolyline(ctx, path);

        // Inner conductive trace
        ctx.strokeStyle = active ? color : `rgba(148, 163, 184, ${dimAlpha})`;
        ctx.lineWidth = active ? 1.6 : 1;
        strokePolyline(ctx, path);

        // Terminal solder pads
        const start = path.points[0];
        const end = path.points[path.points.length - 1];
        for (const pt of [start, end]) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, active ? 3 : 2.2, 0, Math.PI * 2);
          ctx.fillStyle = active ? color : "rgba(148, 163, 184, 0.25)";
          ctx.fill();
        }
      };

      const emeraldStroke = "rgba(16, 185, 129, 0.42)";
      const goldStroke = "rgba(245, 158, 11, 0.46)";
      const goldDimStroke = "rgba(245, 158, 11, 0.22)";

      drawTrace(pathAi, isFree, emeraldStroke, 0.12);
      drawTrace(pathAnon, isLocked || isPaid, goldStroke, 0.12);

      for (const ep of ENDPOINTS) {
        const isPrimary = ep.id === curEp;
        const activeEgress = !isLocked;
        const stroke = isFree
          ? isPrimary
            ? emeraldStroke
            : "rgba(16, 185, 129, 0.22)"
          : isPaid
            ? isPrimary
              ? goldStroke
              : goldDimStroke
            : "rgba(148, 163, 184, 0.11)";
        drawTrace(epPaths[ep.id], activeEgress && isPrimary, stroke, isLocked ? 0.1 : 0.18);
      }

      // 2. Subtle Vault Radial Decryption / Shield Impact Waves
      for (const pulse of vaultPulses) {
        const radius = a.vaultRadius * (0.94 + pulse.age * 0.34);
        const alpha = (1 - pulse.age) * 0.42;
        ctx.beginPath();
        if (pulse.tone === "reject") {
          // Shield arc facing ingress side
          const startAng = a.horizontal ? Math.PI * 0.62 : Math.PI * 1.12;
          const endAng = a.horizontal ? Math.PI * 1.38 : Math.PI * 1.88;
          ctx.arc(a.vaultCenter.x, a.vaultCenter.y, radius, startAng, endAng);
          ctx.strokeStyle = `rgba(245, 158, 11, ${alpha * 1.4})`;
          ctx.lineWidth = 2.6;
        } else {
          ctx.arc(a.vaultCenter.x, a.vaultCenter.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle =
            pulse.tone === "emerald"
              ? `rgba(16, 185, 129, ${alpha})`
              : `rgba(251, 191, 36, ${alpha})`;
          ctx.lineWidth = 1.8;
        }
        ctx.stroke();
      }

      // Helper to render crisp binary 0/1 bit-trains on Ingress with clean edge clearance
      const drawBitTrain = (train: BitTrain, path: PolyPath, bright: boolean, isGold: boolean) => {
        ctx.font = train.isBurst
          ? '700 11px "JetBrains Mono", ui-monospace, monospace'
          : '600 10px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const spacing = 11 / path.totalLength;
        for (let i = 0; i < train.bits.length; i++) {
          const bt = train.t - i * spacing;
          // Keep glyphs strictly clear of card borders and vault coupler
          if (bt < 0.09 || bt > 0.91) continue;
          const pt = samplePath(path, bt);
          const edgeAlpha =
            bt < 0.16 ? (bt - 0.09) / 0.07 : bt > 0.84 ? (0.91 - bt) / 0.07 : 1;
          const fade = (1 - i / train.bits.length) * (bright ? 1 : 0.25) * edgeAlpha;

          // Tiny dark pill backing so 0/1 bits read crisply over the trace
          if (bright && i < 4) {
            ctx.fillStyle = `rgba(4, 7, 13, ${0.85 * edgeAlpha})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5.8, 0, Math.PI * 2);
            ctx.fill();
          }

          if (i === 0 && bright) {
            ctx.fillStyle = isGold
              ? train.isBurst
                ? `rgba(254, 240, 138, ${edgeAlpha})`
                : `rgba(252, 211, 77, ${edgeAlpha})`
              : train.isBurst
                ? `rgba(167, 243, 208, ${edgeAlpha})`
                : `rgba(110, 231, 183, ${edgeAlpha})`;
          } else {
            ctx.fillStyle = isGold
              ? `rgba(245, 158, 11, ${Math.max(0.05, fade * 0.9)})`
              : `rgba(16, 185, 129, ${Math.max(0.05, fade * 0.9)})`;
          }
          ctx.fillText(train.bits[i], pt.x, pt.y);
        }
      };

      // Helper to render Egress packets transitioning from binary -> decrypted capsule cleanly inside channel
      const drawEgressPacket = (pkt: EgressPacket, path: PolyPath) => {
        const pt = samplePath(path, pkt.t);
        const isGold = pkt.tone === "gold";
        const isDecrypted = pkt.t >= 0.24 && pkt.t <= 0.78;

        // Trailing binary tail fading out as it leaves the vault
        if (pkt.t < 0.62) {
          ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tailFade = Math.max(0, 1 - pkt.t / 0.62);
          for (let i = 0; i < pkt.trailingBits.length; i++) {
            const bt = pkt.t - (i + 1) * (9.5 / path.totalLength);
            if (bt < 0.08 || bt > 0.9) continue;
            const bpt = samplePath(path, bt);
            ctx.fillStyle = isGold
              ? `rgba(245, 158, 11, ${tailFade * (0.75 - i * 0.15)})`
              : `rgba(16, 185, 129, ${tailFade * (0.75 - i * 0.15)})`;
            ctx.fillText(pkt.trailingBits[i], bpt.x, bpt.y);
          }
        }

        if (!isDecrypted) {
          // Compact luminous pulse emerging from vault or absorbing into endpoint port
          if (pkt.t < 0.06 || pkt.t > 0.94) return;
          const alpha = pkt.t < 0.24 ? 0.95 : Math.max(0, (0.94 - pkt.t) / 0.16);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pkt.isBurst ? 4.4 : 3.4, 0, Math.PI * 2);
          ctx.fillStyle = isGold
            ? `rgba(252, 211, 77, ${alpha})`
            : `rgba(110, 231, 183, ${alpha})`;
          ctx.fill();
        } else {
          // Decrypted luminous micro-capsule centered cleanly in open conduit span
          const pillAlpha =
            pkt.t < 0.3
              ? (pkt.t - 0.24) / 0.06
              : pkt.t > 0.7
                ? (0.78 - pkt.t) / 0.08
                : 1;
          const text = pkt.label;
          ctx.font = '700 8px "JetBrains Mono", ui-monospace, monospace';
          const tw = ctx.measureText(text).width;
          const pw = tw + 9;
          const ph = 14;
          const rx = pt.x - pw / 2;
          const ry = pt.y - ph / 2;

          ctx.fillStyle = isGold
            ? `rgba(28, 19, 6, ${0.95 * pillAlpha})`
            : `rgba(5, 24, 18, ${0.95 * pillAlpha})`;
          ctx.strokeStyle = isGold
            ? pkt.isBurst
              ? `rgba(253, 224, 71, ${pillAlpha})`
              : `rgba(251, 191, 36, ${0.85 * pillAlpha})`
            : pkt.isBurst
              ? `rgba(167, 243, 208, ${pillAlpha})`
              : `rgba(52, 211, 153, ${0.85 * pillAlpha})`;
          ctx.lineWidth = pkt.isBurst ? 1.35 : 1;

          ctx.beginPath();
          ctx.roundRect(rx, ry, pw, ph, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isGold
            ? `rgba(253, 230, 138, ${pillAlpha})`
            : `rgba(167, 243, 208, ${pillAlpha})`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, pt.x, pt.y + 0.5);
        }
      };

      // Static reduced-motion / paused schematic snapshot
      if (isStaticSnapshot && pausedRef.current) {
        if (isFree) {
          drawBitTrain(
            { id: 0, lane: "ai", t: 0.72, speed: 0, bits: ["0", "1", "1", "0", "1", "0"], flipTimer: 0 },
            pathAi,
            true,
            false
          );
          const epMeta = ENDPOINTS.find((e) => e.id === curEp) ?? ENDPOINTS[0];
          drawEgressPacket(
            {
              id: 0,
              endpoint: curEp,
              t: 0.56,
              speed: 0,
              label: epMeta.token,
              trailingBits: "0110",
              tone: "emerald",
            },
            epPaths[curEp]
          );
        } else if (isLocked) {
          drawBitTrain(
            { id: 0, lane: "anon", t: 0.76, speed: 0, bits: ["1", "0", "1", "1", "0", "0"], flipTimer: 0 },
            pathAnon,
            true,
            true
          );
          const pt = samplePath(pathAnon, 0.36);
          ctx.fillStyle = "rgba(28, 15, 6, 0.95)";
          ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(pt.x - 18, pt.y - 8, 36, 16, 4);
          ctx.fill();
          ctx.stroke();
          ctx.font = '700 8.5px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = "#fde68a";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("402 ↩", pt.x, pt.y + 0.5);
        } else {
          drawBitTrain(
            { id: 0, lane: "anon", t: 0.72, speed: 0, bits: ["0", "1", "0", "0", "1", "0"], flipTimer: 0 },
            pathAnon,
            true,
            true
          );
          const epMeta = ENDPOINTS.find((e) => e.id === curEp) ?? ENDPOINTS[0];
          drawEgressPacket(
            {
              id: 0,
              endpoint: curEp,
              t: 0.56,
              speed: 0,
              label: epMeta.token,
              trailingBits: "0100",
              tone: "gold",
            },
            epPaths[curEp]
          );
        }
        ctx.restore();
        return;
      }

      // 3. Draw live ingress binary bit-trains
      for (const train of ingressTrains) {
        const path = train.lane === "ai" ? pathAi : pathAnon;
        const isPrimaryLane = (isFree && train.lane === "ai") || (!isFree && train.lane === "anon");
        drawBitTrain(train, path, isPrimaryLane, train.lane === "anon");
      }

      // 4. Draw live egress decrypted packets (only when unlocked)
      if (!isLocked) {
        for (const pkt of egressPackets) {
          drawEgressPacket(pkt, epPaths[pkt.endpoint]);
        }
      }

      // 5. Draw HTTP 402 deflected challenge waves returning to Anon Client
      for (const wave of bounceWaves) {
        const pt = samplePath(pathAnon, 1 - wave.t);
        const alpha = Math.max(0.15, 1 - wave.t * 0.65);
        ctx.fillStyle = `rgba(30, 16, 6, ${alpha * 0.96})`;
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(pt.x - 20, pt.y - 8, 40, 16, 4);
        ctx.fill();
        ctx.stroke();

        ctx.font = '700 8.5px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(wave.label, pt.x, pt.y + 0.5);
      }

      ctx.restore();
    };

    drawSnapshotRef.current = () => drawFrame(true);

    const tick = (now: number) => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(tick);

      if (pausedRef.current || hiddenRef.current || !anchorsRef.current) {
        lastTs = now;
        return;
      }

      const dt = Math.min((now - lastTs) / 1000, 0.05);
      lastTs = now;

      const curMode = modeRef.current;
      const curEp = endpointRef.current;
      const activeLane: "ai" | "anon" = curMode === "free" ? "ai" : "anon";

      // Clear stale in-flight particles immediately when mode or selected endpoint changes
      if (flushParticlesRef.current) {
        flushParticlesRef.current = false;
        ingressTrains.length = 0;
        egressPackets.length = 0;
        bounceWaves.length = 0;
        ingressTrains.push({
          id: nextId++,
          lane: activeLane,
          t: 0.14,
          speed: 0.48,
          bits: makeBits(6),
          flipTimer: 0,
        });
        if (curMode !== "locked") {
          const epMeta = ENDPOINTS.find((e) => e.id === curEp) ?? ENDPOINTS[0];
          egressPackets.push({
            id: nextId++,
            endpoint: curEp,
            t: 0.28,
            speed: 0.44,
            label: epMeta.token,
            trailingBits: makeBits(4).join(""),
            tone: curMode === "free" ? "emerald" : "gold",
          });
        }
      }

      // Handle manual packet injection from clicking Safe dial or "Inject Packet"
      if (injectQueueRef.current > 0) {
        injectQueueRef.current -= 1;
        ingressTrains.push({
          id: nextId++,
          lane: activeLane,
          t: 0.02,
          speed: 0.64,
          bits: makeBits(7),
          flipTimer: 0,
          isBurst: true,
        });
      }

      // Ambient steady binary flow
      spawnAcc += dt;
      if (spawnAcc >= 0.82) {
        spawnAcc = 0;
        if (ingressTrains.length < 7) {
          ingressTrains.push({
            id: nextId++,
            lane: activeLane,
            t: 0,
            speed: 0.4 + Math.random() * 0.08,
            bits: makeBits(6),
            flipTimer: 0,
          });
        }
      }

      // Advance ingress bit-trains
      for (let i = ingressTrains.length - 1; i >= 0; i--) {
        const tr = ingressTrains[i];
        tr.t += tr.speed * dt;
        tr.flipTimer += dt;
        if (tr.flipTimer >= 0.16) {
          tr.flipTimer = 0;
          const idx = Math.floor(Math.random() * tr.bits.length);
          tr.bits[idx] = tr.bits[idx] === "0" ? "1" : "0";
        }

        if (tr.t >= 1.02) {
          const isPrimary = tr.lane === activeLane;
          ingressTrains.splice(i, 1);

          if (!isPrimary) continue;

          if (curMode === "locked") {
            // Deflect at the closed vault safe bolts and return HTTP 402 wave
            if (vaultPulses.length < 3) {
              vaultPulses.push({ age: 0, tone: "reject" });
            }
            if (bounceWaves.length < 3) {
              bounceWaves.push({ id: nextId++, t: 0.04, speed: 0.56, label: "402 ↩" });
            }
          } else {
            // Decrypt across vault boundary and dispatch to selected endpoint (or occasional secondary)
            const tone: "emerald" | "gold" = curMode === "free" ? "emerald" : "gold";
            if (vaultPulses.length < 3) {
              vaultPulses.push({ age: 0, tone });
            }
            const targetId: EndpointId =
              tr.isBurst || Math.random() < 0.72
                ? curEp
                : ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)].id;
            const epMeta = ENDPOINTS.find((e) => e.id === targetId) ?? ENDPOINTS[0];

            if (egressPackets.length < 6) {
              egressPackets.push({
                id: nextId++,
                endpoint: targetId,
                t: 0.02,
                speed: tr.isBurst ? 0.62 : 0.46,
                label: curMode === "paid" && tr.isBurst ? "x402 OK" : epMeta.token,
                trailingBits: makeBits(4).join(""),
                tone,
                isBurst: tr.isBurst,
              });
            }
          }
        }
      }

      // Advance egress decrypted packets
      for (let i = egressPackets.length - 1; i >= 0; i--) {
        egressPackets[i].t += egressPackets[i].speed * dt;
        if (egressPackets[i].t >= 1.03) {
          egressPackets.splice(i, 1);
        }
      }

      // Advance HTTP 402 bounce waves
      for (let i = bounceWaves.length - 1; i >= 0; i--) {
        bounceWaves[i].t += bounceWaves[i].speed * dt;
        if (bounceWaves[i].t >= 1.02) {
          bounceWaves.splice(i, 1);
        }
      }

      // Advance subtle vault ripples
      for (let i = vaultPulses.length - 1; i >= 0; i--) {
        vaultPulses[i].age += dt * 1.15;
        if (vaultPulses[i].age >= 1) {
          vaultPulses.splice(i, 1);
        }
      }

      drawFrame(false);
    };

    // Measure initial anchors & track responsive layout changes
    measureAnchors();
    const ro = new ResizeObserver(() => measureAnchors());
    ro.observe(stage);

    // Pause canvas rendering cleanly when scrolled off-screen:
    // Use contentvisibilityautostatechange directly on the content-visibility:auto element,
    // with IntersectionObserver fallback for older browsers.
    const onCvChange = (ev: Event) => {
      const skipped = Boolean((ev as Event & { skipped?: boolean }).skipped);
      hiddenRef.current = skipped;
    };
    const supportsContentVisibility = "contentVisibility" in document.documentElement.style;
    let io: IntersectionObserver | null = null;

    if (supportsContentVisibility) {
      root.addEventListener("contentvisibilityautostatechange", onCvChange);
    } else {
      io = new IntersectionObserver(
        (entries) => {
          hiddenRef.current = !entries[0]?.isIntersecting;
        },
        { rootMargin: "200px" }
      );
      io.observe(root);
    }

    rafId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      root.removeEventListener("contentvisibilityautostatechange", onCvChange);
      io?.disconnect();
    };
  }, [measureAnchors]);

  const handleInjectPacket = () => {
    injectQueueRef.current = Math.min(injectQueueRef.current + 1, 3);
    setDialClicks((c) => c + 1);
    if (paused) {
      setPaused(false);
      pausedRef.current = false;
    }
  };

  const activeEndpoint = ENDPOINTS.find((e) => e.id === selectedEndpoint) ?? ENDPOINTS[0];
  const isFree = mode === "free";
  const isLocked = mode === "locked";
  const isPaid = mode === "paid";

  // Mechanical Safe Bolt & Dial kinematics
  const boltShift = isLocked ? 12.5 : 0; // extends outward into bezel sockets when locked
  const baseDialDeg = isFree ? 0 : isLocked ? 135 : -90;
  const dialDeg = baseDialDeg + dialClicks * 30;

  // UTC Chronometer progress ring (r = 102 -> circumference = 640.88)
  const chronoCircumference = 2 * Math.PI * 102;
  const chronoOffset = chronoCircumference * (1 - clockState.dayProgress);

  const wireBinary = BINARY_FRAMES[mode][wireFrameIdx];
  const wireDecoded = isLocked
    ? "402 · X-Payment-Required: 0.005 USDT (BSC)"
    : isFree
      ? activeEndpoint.freePayload
      : activeEndpoint.paidPayload;

  return (
    <div
      ref={rootRef}
      className="vault-stage-container relative rounded-2xl border border-slate-800/90 bg-[#050912]/95 shadow-2xl overflow-hidden"
    >
      {/* Subtle top hardware specular rim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-amber-400/35"
      />

      {/* Ambient mode-reactive radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background: isFree
            ? "radial-gradient(circle at 50% 48%, rgba(16,185,129,0.14), transparent 58%)"
            : isLocked
              ? "radial-gradient(circle at 50% 48%, rgba(245,158,11,0.17), transparent 58%)"
              : "radial-gradient(circle at 50% 48%, rgba(251,191,36,0.15), rgba(16,185,129,0.06) 40%, transparent 62%)",
        }}
      />

      {/* ====================================================================
          HEADER: Title + 3-State Protocol Mode Selector + Pause/Play Control
         ==================================================================== */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#070c18]/90 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              isFree
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                : "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]"
            }`}
            aria-hidden="true"
          />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            Live Protocol Router
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            role="tablist"
            aria-label="Protocol routing mode"
            className="inline-flex items-center rounded-lg border border-slate-800 bg-[#04070e] p-0.5 gap-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isFree}
              onClick={() => setMode("free")}
              className={`px-2 py-1 rounded-md text-[10.5px] font-mono font-semibold transition-colors cursor-pointer ${
                isFree
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              .ai Free
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isLocked}
              onClick={() => setMode("locked")}
              className={`px-2 py-1 rounded-md text-[10.5px] font-mono font-semibold transition-colors cursor-pointer ${
                isLocked
                  ? "bg-amber-500/20 text-amber-300 border border-amber-400/45"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              402 Lock
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isPaid}
              onClick={() => setMode("paid")}
              className={`px-2 py-1 rounded-md text-[10.5px] font-mono font-semibold transition-colors cursor-pointer ${
                isPaid
                  ? "bg-amber-400/20 text-amber-200 border border-amber-300/45"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              x402 Paid
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play protocol animation" : "Pause protocol animation"}
            title={paused ? "Play animation" : "Pause animation"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-[#04070e] text-slate-400 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
          >
            {paused ? (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* ====================================================================
          STAGE: Ingress Callers -> Mechanical Vault-Chronometer -> BSC APIs
         ==================================================================== */}
      <div
        ref={stageRef}
        className="relative px-3.5 py-5 sm:px-4 sm:py-6"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(148,163,184,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.035) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {/* Crisp HiDPI Canvas 2D Binary Conduit Layer */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/* Responsive 3-Stage Layout (Vertical on mobile, Horizontal 3-column on sm+) */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-[120px_1fr_148px] items-center gap-y-8 sm:gap-y-0 sm:gap-x-3">
          {/* LEFT COLUMN: Ingress Callers */}
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-2.5 sm:gap-5">
            <button
              ref={callerAiRef}
              type="button"
              onClick={() => setMode("free")}
              className={`group text-left rounded-xl border p-2.5 transition-all cursor-pointer ${
                isFree
                  ? "border-emerald-400/50 bg-[#071514]/95 shadow-[0_0_24px_-8px_rgba(16,185,129,0.45)]"
                  : "border-slate-800/90 bg-[#080d18]/90 opacity-65 hover:opacity-100 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-white">
                  <KeyRound
                    className={`h-3 w-3 shrink-0 ${isFree ? "text-emerald-400" : "text-slate-500"}`}
                    aria-hidden="true"
                  />
                  abido.ai
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isFree ? "bg-emerald-400" : "bg-slate-600"
                  }`}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 font-mono text-[9.5px] text-emerald-300/90 leading-tight">
                Agent ID Pass
              </p>
              <p className="mt-0.5 font-mono text-[9px] text-slate-400">EIP-191 · 0101→</p>
            </button>

            <button
              ref={callerAnonRef}
              type="button"
              onClick={() => setMode(isLocked ? "paid" : "locked")}
              className={`group text-left rounded-xl border p-2.5 transition-all cursor-pointer ${
                isLocked || isPaid
                  ? "border-amber-400/50 bg-[#151007]/95 shadow-[0_0_24px_-8px_rgba(245,158,11,0.45)]"
                  : "border-slate-800/90 bg-[#080d18]/90 opacity-65 hover:opacity-100 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-white">
                  <UserX
                    className={`h-3 w-3 shrink-0 ${
                      isLocked || isPaid ? "text-amber-400" : "text-slate-500"
                    }`}
                    aria-hidden="true"
                  />
                  Anon Client
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLocked || isPaid ? "bg-amber-400" : "bg-slate-600"
                  }`}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 font-mono text-[9.5px] text-amber-300/90 leading-tight">
                {isPaid ? "X-PAYMENT · USDT" : "No .ai Handle"}
              </p>
              <p className="mt-0.5 font-mono text-[9px] text-slate-400">
                {isPaid ? "x402 v2 · 0101→" : "Unverified · 1011→"}
              </p>
            </button>
          </div>

          {/* CENTER: Mechanical Bank Safe + 60-Tick Live UTC Chronometer */}
          <div className="flex flex-col items-center justify-center">
            <button
              ref={vaultRef}
              type="button"
              onClick={handleInjectPacket}
              aria-label="Gate402 Vault Safe and UTC Quota Clock — click to inject an encrypted binary packet"
              title="Click Vault Safe to fire an encrypted packet burst"
              className="group relative flex h-[164px] w-[164px] sm:h-[174px] sm:w-[174px] items-center justify-center rounded-full focus-visible:outline-emerald-400 cursor-pointer"
            >
              <svg
                viewBox="0 0 240 240"
                className="h-full w-full drop-shadow-[0_14px_28px_rgba(0,0,0,0.75)]"
                aria-hidden="true"
              >
                <defs>
                  {/* Brushed Obsidian-Steel Outer Chronometer Housing */}
                  <linearGradient id="vaultHousing" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#26334a" />
                    <stop offset="45%" stopColor="#0d1422" />
                    <stop offset="100%" stopColor="#1b2538" />
                  </linearGradient>

                  {/* Specular Chamfer Rim */}
                  <linearGradient id="vaultRim" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop
                      offset="0%"
                      stopColor={isFree ? "rgba(52,211,153,0.65)" : "rgba(251,191,36,0.7)"}
                    />
                    <stop offset="50%" stopColor="rgba(148,163,184,0.22)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.28)" />
                  </linearGradient>

                  {/* Heavy Machined Bank Safe Door */}
                  <radialGradient id="safeDoorMetal" cx="35%" cy="30%" r="72%">
                    <stop offset="0%" stopColor="#223047" />
                    <stop offset="52%" stopColor="#0f1727" />
                    <stop offset="100%" stopColor="#060a12" />
                  </radialGradient>

                  {/* Machined Steel Locking Bolt Finish */}
                  <linearGradient id="steelBolt" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#64748b" />
                    <stop offset="45%" stopColor="#e2e8f0" />
                    <stop offset="100%" stopColor="#475569" />
                  </linearGradient>

                  {/* Knurled Combination Dial Metallic Finish */}
                  <radialGradient id="tumblerDial" cx="38%" cy="32%" r="68%">
                    <stop offset="0%" stopColor="#1e293b" />
                    <stop offset="65%" stopColor="#0a101c" />
                    <stop offset="100%" stopColor="#03060c" />
                  </radialGradient>
                </defs>

                {/* Outer Machined Bezel */}
                <circle
                  cx="120"
                  cy="120"
                  r="114"
                  fill="url(#vaultHousing)"
                  stroke="url(#vaultRim)"
                  strokeWidth="1.5"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="109"
                  fill="#050912"
                  stroke="rgba(148,163,184,0.16)"
                  strokeWidth="0.9"
                />

                {/* 60-Tick Live UTC Chronometer Ring */}
                <g>
                  {Array.from({ length: 60 }).map((_, i) => {
                    const isMajor = i % 5 === 0;
                    const angle = i * 6;
                    return (
                      <line
                        key={i}
                        x1="120"
                        y1={isMajor ? 14 : 16.5}
                        x2="120"
                        y2={isMajor ? 24 : 22}
                        transform={`rotate(${angle} 120 120)`}
                        stroke={
                          isMajor
                            ? isFree
                              ? "rgba(52, 211, 153, 0.8)"
                              : "rgba(251, 191, 36, 0.85)"
                            : "rgba(148, 163, 184, 0.36)"
                        }
                        strokeWidth={isMajor ? 1.5 : 0.85}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>

                {/* Live UTC 24h Quota Epoch Progress Arc */}
                <circle
                  cx="120"
                  cy="120"
                  r="102"
                  fill="none"
                  stroke="rgba(148,163,184,0.12)"
                  strokeWidth="2"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="102"
                  fill="none"
                  stroke={isFree ? "#10b981" : "#f59e0b"}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeDasharray={chronoCircumference}
                  strokeDashoffset={chronoOffset}
                  transform="rotate(-90 120 120)"
                  opacity="0.72"
                />

                {/* Sweeping Live UTC Chronometer Second Pip */}
                <g transform={`rotate(${clockState.secondAngle} 120 120)`}>
                  <line
                    x1="120"
                    y1="12"
                    x2="120"
                    y2="25"
                    stroke={isFree ? "#6ee7b7" : "#fde047"}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="120" cy="18" r="2.6" fill={isFree ? "#a7f3d0" : "#fef08a"} />
                </g>

                {/* Armored Intake (Left) & Egress (Right) Data Couplers */}
                <rect
                  x="2"
                  y="111"
                  width="12"
                  height="18"
                  rx="3"
                  fill="#0f172a"
                  stroke={isFree ? "rgba(16,185,129,0.7)" : "rgba(245,158,11,0.75)"}
                  strokeWidth="1.2"
                />
                <rect
                  x="226"
                  y="111"
                  width="12"
                  height="18"
                  rx="3"
                  fill="#0f172a"
                  stroke={
                    isLocked
                      ? "rgba(148,163,184,0.3)"
                      : isFree
                        ? "rgba(16,185,129,0.7)"
                        : "rgba(245,158,11,0.75)"
                  }
                  strokeWidth="1.2"
                />

                {/* Recessed Steel Vault Bolt Trench */}
                <circle
                  cx="120"
                  cy="120"
                  r="90"
                  fill="#03060c"
                  stroke="rgba(148,163,184,0.2)"
                  strokeWidth="1"
                />

                {/* 6 Outer Locking Sockets + Articulated Mechanical Steel Bolts */}
                {BOLT_ANGLES.map((deg) => (
                  <g key={deg} transform={`rotate(${deg} 120 120)`}>
                    {/* Socket cutout in bezel */}
                    <rect
                      x="113"
                      y="25.5"
                      width="14"
                      height="9"
                      rx="2"
                      fill="#020409"
                      stroke={isLocked ? "rgba(251,191,36,0.75)" : "rgba(148,163,184,0.2)"}
                      strokeWidth="0.9"
                    />
                    {/* Articulated Steel Locking Bolt (moves outward when 402 Locked) */}
                    <g
                      className="vault-bolt"
                      style={{
                        transform: `translateY(${-boltShift}px)`,
                      }}
                    >
                      <rect
                        x="114.5"
                        y="39"
                        width="11"
                        height="22"
                        rx="2.5"
                        fill="url(#steelBolt)"
                        stroke="rgba(15,23,42,0.9)"
                        strokeWidth="0.9"
                      />
                      {/* Status engagement stripe on each bolt */}
                      <rect
                        x="115.5"
                        y="42.5"
                        width="9"
                        height="2.6"
                        rx="1"
                        fill={isLocked ? "#f59e0b" : isFree ? "#10b981" : "#fbbf24"}
                      />
                    </g>
                  </g>
                ))}

                {/* Heavy Circular Bank Safe Door */}
                <circle
                  cx="120"
                  cy="120"
                  r="74"
                  fill="url(#safeDoorMetal)"
                  stroke={isLocked ? "rgba(245,158,11,0.55)" : "rgba(16,185,129,0.45)"}
                  strokeWidth="1.6"
                />
                {/* Machined Lathe Concentric Grooves */}
                <circle
                  cx="120"
                  cy="120"
                  r="66"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="0.9"
                  strokeDasharray="18 6"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="56"
                  fill="none"
                  stroke="rgba(148,163,184,0.14)"
                  strokeWidth="0.9"
                />

                {/* Rotating Knurled Combination Tumbler Dial + 3-Spoke Vault Handle */}
                <g
                  className="vault-dial"
                  style={{
                    transformOrigin: "120px 120px",
                    transform: `rotate(${dialDeg}deg)`,
                  }}
                >
                  {/* 3-Spoke Heavy Vault Wheel Handles */}
                  {[0, 120, 240].map((spoke) => (
                    <g key={spoke} transform={`rotate(${spoke} 120 120)`}>
                      <rect
                        x="117"
                        y="67"
                        width="6"
                        height="24"
                        rx="2.5"
                        fill="#334155"
                        stroke="rgba(226,232,240,0.3)"
                        strokeWidth="0.8"
                      />
                      <circle
                        cx="120"
                        cy="68"
                        r="4.2"
                        fill="#475569"
                        stroke="rgba(226,232,240,0.45)"
                        strokeWidth="0.9"
                      />
                    </g>
                  ))}

                  {/* Tumbler Dial Ring */}
                  <circle
                    cx="120"
                    cy="120"
                    r="44"
                    fill="url(#tumblerDial)"
                    stroke={isFree ? "rgba(16,185,129,0.55)" : "rgba(245,158,11,0.6)"}
                    strokeWidth="1.4"
                  />

                  {/* 24 Knurled Dial Notches */}
                  {Array.from({ length: 24 }).map((_, i) => (
                    <line
                      key={i}
                      x1="120"
                      y1="78"
                      x2="120"
                      y2={i % 6 === 0 ? "84.5" : "81.5"}
                      transform={`rotate(${i * 15} 120 120)`}
                      stroke={
                        i === 0
                          ? isFree
                            ? "#34d399"
                            : "#fbbf24"
                          : "rgba(148,163,184,0.4)"
                      }
                      strokeWidth={i === 0 ? "2" : "0.9"}
                      strokeLinecap="round"
                    />
                  ))}
                </g>

                {/* Central Cryptographic Aperture Lens (stays upright for readability) */}
                <circle
                  cx="120"
                  cy="120"
                  r="31"
                  fill="#040810"
                  stroke={
                    isFree
                      ? "rgba(52,211,153,0.55)"
                      : isLocked
                        ? "rgba(245,158,11,0.75)"
                        : "rgba(251,191,36,0.65)"
                  }
                  strokeWidth="1.4"
                />

                {/* Status Code + Sub-Label inside Aperture */}
                <text
                  x="120"
                  y="115"
                  textAnchor="middle"
                  fill={isFree ? "#6ee7b7" : "#fde68a"}
                  fontSize="12.5"
                  fontWeight="700"
                  fontFamily='"JetBrains Mono", ui-monospace, monospace'
                >
                  {isLocked ? "402" : "200 OK"}
                </text>
                <text
                  x="120"
                  y="129"
                  textAnchor="middle"
                  fill={isFree ? "rgba(167,243,208,0.85)" : "rgba(253,230,138,0.85)"}
                  fontSize="7.4"
                  fontWeight="600"
                  letterSpacing="1.2"
                  fontFamily='"JetBrains Mono", ui-monospace, monospace'
                >
                  {isLocked ? "LOCKED" : isFree ? "UNLOCKED" : "SETTLED"}
                </text>
                <text
                  x="120"
                  y="141"
                  textAnchor="middle"
                  fill="rgba(148,163,184,0.72)"
                  fontSize="6.4"
                  fontFamily='"JetBrains Mono", ui-monospace, monospace'
                >
                  {clockState.utcTime}Z
                </text>
              </svg>

              {/* Micro-badge beneath Safe on desktop (kept off vertical egress path on mobile) */}
              <span className="pointer-events-none hidden sm:inline-flex absolute -bottom-3.5 items-center gap-1 rounded-full border border-slate-700/90 bg-[#050912]/95 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-300 shadow">
                {isLocked ? (
                  <>
                    <Lock className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
                    6 Bolts Engaged
                  </>
                ) : (
                  <>
                    <Unlock
                      className={`h-2.5 w-2.5 ${isFree ? "text-emerald-400" : "text-amber-300"}`}
                      aria-hidden="true"
                    />
                    Vault Decryption Open
                  </>
                )}
              </span>
            </button>
          </div>

          {/* RIGHT COLUMN: 3 Live BSC Mainnet API Endpoints */}
          <div className="grid grid-cols-1 gap-2 sm:gap-2.5">
            {ENDPOINTS.map((ep) => {
              const isSelected = ep.id === selectedEndpoint;
              const isReachable = !isLocked;
              const Icon =
                ep.id === "safety" ? ShieldCheck : ep.id === "dex" ? Activity : Terminal;
              return (
                <button
                  key={ep.id}
                  ref={
                    ep.id === "safety"
                      ? epSafetyRef
                      : ep.id === "dex"
                        ? epDexRef
                        : epPreflightRef
                  }
                  type="button"
                  onClick={() => {
                    setSelectedEndpoint(ep.id);
                    injectQueueRef.current = Math.min(injectQueueRef.current + 1, 3);
                  }}
                  className={`text-left rounded-xl border px-2 py-2 transition-all cursor-pointer ${
                    !isReachable
                      ? "border-slate-800/90 bg-[#070b14] opacity-70 hover:opacity-95"
                      : isSelected
                        ? isFree
                          ? "border-emerald-400/55 bg-[#071514] shadow-[0_0_20px_-8px_rgba(16,185,129,0.5)]"
                          : "border-amber-400/55 bg-[#151007] shadow-[0_0_20px_-8px_rgba(245,158,11,0.5)]"
                        : "border-slate-800/90 bg-[#080d18] hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-white min-w-0">
                      <Icon
                        className={`h-3 w-3 shrink-0 ${
                          !isReachable
                            ? "text-slate-500"
                            : isFree
                              ? "text-emerald-400"
                              : "text-amber-400"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{ep.name}</span>
                    </span>
                    <span
                      className={`shrink-0 font-mono text-[8.5px] font-semibold px-1 py-0.5 rounded ${
                        !isReachable
                          ? "bg-slate-800 text-slate-400"
                          : isFree
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {isLocked ? "402" : "200"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[8.5px] text-slate-400 truncate">
                    {ep.path}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ====================================================================
          FOOTER: Structured Binary -> Decrypted Wire Inspector + UTC Clock
         ==================================================================== */}
      <div className="relative z-10 border-t border-slate-800/85 bg-[#04070e]/95 px-3.5 py-2.5 space-y-2">
        {/* Structured Hardware Wire Decoder Block (zero awkward wraps or clipping) */}
        <div className="rounded-lg border border-slate-800/80 bg-[#03060c] px-2.5 py-2 space-y-1.5 font-mono text-[10px] leading-snug">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 rounded bg-slate-800/90 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-slate-300">
                In
              </span>
              <span className="text-slate-400 text-[9.5px] tracking-tight break-all">
                {wireBinary}
              </span>
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase ${
                isLocked
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : isFree
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-400/15 text-amber-200 border border-amber-400/35"
              }`}
            >
              {isLocked ? "✕ 402 Blocked" : isFree ? "→ Safe Decrypt →" : "→ x402 Settled →"}
            </span>
          </div>

          <div className="flex items-start gap-1.5 border-t border-slate-800/60 pt-1.5">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${
                isLocked
                  ? "bg-amber-500/15 text-amber-300"
                  : isFree
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-400/15 text-amber-200"
              }`}
            >
              Out
            </span>
            <span
              className={`font-semibold text-[10px] break-all ${
                isLocked ? "text-amber-300" : isFree ? "text-emerald-300" : "text-amber-200"
              }`}
            >
              {wireDecoded}
            </span>
          </div>
        </div>

        {/* Action & Live UTC Quota Reset Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10.5px] font-mono">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInjectPacket}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
                isFree
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              }`}
            >
              <Zap className="h-3 w-3" aria-hidden="true" />
              Inject Packet
            </button>
            <span className="inline-flex sm:hidden items-center gap-1 text-[9.5px] text-slate-300">
              {isLocked ? (
                <>
                  <Lock className="h-3 w-3 text-amber-400" aria-hidden="true" />
                  6 Bolts Engaged
                </>
              ) : (
                <>
                  <Unlock
                    className={`h-3 w-3 ${isFree ? "text-emerald-400" : "text-amber-300"}`}
                    aria-hidden="true"
                  />
                  Vault Open
                </>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-400" aria-hidden="true" />
              UTC Reset:{" "}
              <strong className="text-slate-200 tabular-nums">{clockState.countdown}</strong>
            </span>
            <span className="hidden sm:inline text-slate-700">|</span>
            <span>
              Fee:{" "}
              <strong className={isFree ? "text-emerald-300" : "text-amber-300"}>
                {isFree ? "$0.00 (.ai Pass)" : "$0.005 USDT"}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
