export const SAMPLE_RATE = 44_100;

const FULL_SCALE = 32_767;
const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

export const SOUND_NAMES = ["tap", "validation", "success", "transition"] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

type Note = {
  readonly startMs: number;
  readonly durationMs: number;
  readonly fromHz: number;
  readonly toHz: number;
  readonly gain: number;
};

type Sound = {
  readonly ceilingMs: number;
  readonly notes: readonly Note[];
};

const ATTACK_MS = 4;

const note = (startMs: number, durationMs: number, hz: number, gain: number): Note => ({
  startMs,
  durationMs,
  fromHz: hz,
  toHz: hz,
  gain,
});

export const SOUNDS: Readonly<Record<SoundName, Sound>> = {
  tap: {
    ceilingMs: 80,
    notes: [note(0, 45, 1_320, 0.35)],
  },
  validation: {
    ceilingMs: 250,
    notes: [note(0, 90, 880, 0.35), note(80, 140, 1_320, 0.35)],
  },
  success: {
    ceilingMs: 600,
    notes: [
      note(0, 160, 784, 0.3),
      note(90, 160, 988, 0.3),
      note(180, 160, 1_175, 0.3),
      note(270, 300, 1_568, 0.3),
    ],
  },
  transition: {
    ceilingMs: 250,
    notes: [{ startMs: 0, durationMs: 180, fromHz: 520, toHz: 880, gain: 0.3 }],
  },
};

const samplesIn = (ms: number) => Math.round((ms / 1000) * SAMPLE_RATE);

const envelope = (elapsed: number, length: number) => {
  const attack = samplesIn(ATTACK_MS);
  const rise = Math.min(1, elapsed / attack);
  const fall = (1 - elapsed / length) ** 2;
  return rise * fall;
};

const voice = (target: Note, index: number) => {
  const start = samplesIn(target.startMs);
  const length = samplesIn(target.durationMs);
  const elapsed = index - start;
  if (elapsed < 0 || elapsed >= length) return 0;
  const progress = elapsed / length;
  const seconds = elapsed / SAMPLE_RATE;
  const sweep = target.toHz - target.fromHz;
  const phase = 2 * Math.PI * (target.fromHz * seconds + (sweep * seconds * progress) / 2);
  return target.gain * envelope(elapsed, length) * Math.sin(phase);
};

const synthesize = (sound: Sound) => {
  const total = Math.max(...sound.notes.map((part) => samplesIn(part.startMs + part.durationMs)));
  return Array.from({ length: total }, (_, index) => {
    const mixed = sound.notes.reduce((sum, part) => sum + voice(part, index), 0);
    return Math.round(Math.max(-1, Math.min(1, mixed)) * FULL_SCALE);
  });
};

const writeAscii = (target: DataView, offset: number, text: string) => {
  Array.from(text).forEach((character, index) =>
    target.setUint8(offset + index, character.charCodeAt(0)),
  );
};

const encodeWav = (samples: readonly number[]) => {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const header = new DataView(bytes.buffer);
  writeAscii(header, 0, "RIFF");
  header.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(header, 8, "WAVE");
  writeAscii(header, 12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, SAMPLE_RATE, true);
  header.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  header.setUint16(32, BYTES_PER_SAMPLE, true);
  header.setUint16(34, 16, true);
  writeAscii(header, 36, "data");
  header.setUint32(40, dataBytes, true);
  samples.forEach((sample, index) =>
    header.setInt16(HEADER_BYTES + index * BYTES_PER_SAMPLE, sample, true),
  );
  return bytes;
};

export const renderSound = (name: SoundName) => encodeWav(synthesize(SOUNDS[name]));
