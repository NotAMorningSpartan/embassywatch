let audioCtx: AudioContext | null = null;
let userInteracted = false;

// Track user interaction for autoplay policy
if (typeof window !== "undefined") {
  const handler = () => {
    userInteracted = true;
    window.removeEventListener("click", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("click", handler);
  window.addEventListener("keydown", handler);
}

function getCtx(): AudioContext | null {
  if (!userInteracted) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, volume: number = 0.05): void {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playInfoSound(): void {
  playTone(800, 0.1, 0.03);
}

export function playWarningSound(): void {
  playTone(600, 0.12, 0.05);
  setTimeout(() => playTone(600, 0.12, 0.05), 150);
}

export function playCriticalSound(): void {
  playTone(440, 0.15, 0.07);
  setTimeout(() => playTone(550, 0.15, 0.07), 180);
}

export function playThreatIncreaseSound(): void {
  playTone(400, 0.1, 0.06);
  setTimeout(() => playTone(500, 0.1, 0.06), 120);
  setTimeout(() => playTone(600, 0.15, 0.06), 240);
}

export function playThreatDecreaseSound(): void {
  playTone(600, 0.1, 0.06);
  setTimeout(() => playTone(500, 0.1, 0.06), 120);
  setTimeout(() => playTone(400, 0.15, 0.06), 240);
}

export function playSoundForEvent(severity?: string, type?: string, newLevel?: string, previousLevel?: string): void {
  if (type === "THREAT_CHANGE") {
    const LEVELS: Record<string, number> = { LOW: 1, GUARDED: 2, ELEVATED: 3, HIGH: 4, SEVERE: 5 };
    const newVal = LEVELS[newLevel ?? ""] ?? 0;
    const prevVal = LEVELS[previousLevel ?? ""] ?? 0;
    if (newVal > prevVal) {
      playThreatIncreaseSound();
    } else {
      playThreatDecreaseSound();
    }
    return;
  }

  switch (severity) {
    case "CRITICAL":
      playCriticalSound();
      break;
    case "WARNING":
      playWarningSound();
      break;
    default:
      playInfoSound();
  }
}
