const SFX_STATE = {
  enabled: true,
  volume: 0.45,
};

let audioContext = null;
let masterGain = null;
let lastClickAt = 0;

function clampVolume(value) {
  if (!Number.isFinite(value)) {
    return 0.45;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextCtor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = SFX_STATE.volume;
    masterGain.connect(audioContext.destination);
  }

  return audioContext;
}

function setMasterVolume(volume) {
  if (!masterGain) {
    return;
  }
  const nextVolume = clampVolume(volume);
  const now = audioContext?.currentTime || 0;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setTargetAtTime(nextVolume, now, 0.01);
}

async function resumeAudioContext(context) {
  if (!context || context.state !== "suspended") {
    return;
  }
  try {
    await context.resume();
  } catch {
    // Ignore autoplay policy errors; next user interaction will try again.
  }
}

function scheduleTone({
  frequency = 440,
  endFrequency = null,
  type = "sine",
  delay = 0,
  duration = 0.12,
  gain = 0.3,
}) {
  if (!SFX_STATE.enabled) {
    return;
  }
  const context = getAudioContext();
  if (!context || !masterGain) {
    return;
  }
  void resumeAudioContext(context);

  const start = context.currentTime + delay;
  const stop = start + duration;

  const oscillator = context.createOscillator();
  const noteGain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(40, Number(frequency) || 440), start);
  if (Number.isFinite(endFrequency) && endFrequency > 0) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, stop);
  }

  noteGain.gain.setValueAtTime(0.0001, start);
  noteGain.gain.linearRampToValueAtTime(Math.max(0.01, gain), start + Math.min(0.02, duration * 0.3));
  noteGain.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.connect(noteGain);
  noteGain.connect(masterGain);
  oscillator.start(start);
  oscillator.stop(stop + 0.01);
}

export function configureSfx({ enabled, volume } = {}) {
  if (typeof enabled === "boolean") {
    SFX_STATE.enabled = enabled;
  }
  if (typeof volume === "number") {
    SFX_STATE.volume = clampVolume(volume);
    setMasterVolume(SFX_STATE.volume);
  }
}

export function primeSfxOnInteraction() {
  if (typeof document === "undefined") {
    return () => {};
  }

  const unlock = () => {
    const context = getAudioContext();
    void resumeAudioContext(context);
  };

  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);

  return () => {
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
  };
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  const node = target.closest(
    "button, a, summary, select, [role='button'], input[type='button'], input[type='submit'], input[type='checkbox'], input[type='radio']",
  );
  if (!node) {
    return false;
  }
  if (node.matches(":disabled") || node.getAttribute("aria-disabled") === "true") {
    return false;
  }
  return true;
}

export function installGlobalClickSfx() {
  if (typeof document === "undefined") {
    return () => {};
  }

  const onPointerDown = (event) => {
    if (!SFX_STATE.enabled || !isInteractiveTarget(event.target)) {
      return;
    }
    const now = Date.now();
    if (now - lastClickAt < 55) {
      return;
    }
    lastClickAt = now;
    playSfx("click");
  };

  document.addEventListener("pointerdown", onPointerDown, true);

  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
  };
}

export function playSfx(kind = "click") {
  if (!SFX_STATE.enabled) {
    return;
  }

  switch (kind) {
    case "success":
      scheduleTone({ frequency: 520, endFrequency: 700, type: "triangle", duration: 0.12, gain: 0.25 });
      scheduleTone({ frequency: 740, endFrequency: 980, type: "sine", delay: 0.08, duration: 0.14, gain: 0.22 });
      break;
    case "error":
      scheduleTone({ frequency: 280, endFrequency: 210, type: "sawtooth", duration: 0.14, gain: 0.26 });
      scheduleTone({ frequency: 180, endFrequency: 140, type: "square", delay: 0.08, duration: 0.14, gain: 0.2 });
      break;
    case "notify":
      scheduleTone({ frequency: 610, endFrequency: 760, type: "sine", duration: 0.11, gain: 0.2 });
      scheduleTone({ frequency: 760, endFrequency: 900, type: "triangle", delay: 0.07, duration: 0.1, gain: 0.18 });
      break;
    case "click":
    default:
      // Match MB Bank click profile: short sine tick around 420 Hz.
      scheduleTone({ frequency: 420, endFrequency: null, type: "sine", duration: 0.05, gain: 0.06 });
      break;
  }
}
