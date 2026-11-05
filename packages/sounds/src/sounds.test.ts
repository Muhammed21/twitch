import { describe, expect, it } from "vitest";

import { SAMPLE_RATE, SOUND_NAMES, SOUNDS, renderSound, type SoundName } from "./sounds.ts";

const FULL_SCALE = 32_767;
const HEADER_BYTES = 44;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));
const samplesOf = (bytes: Uint8Array) =>
  Array.from({ length: (bytes.byteLength - HEADER_BYTES) / 2 }, (_, index) =>
    view(bytes).getInt16(HEADER_BYTES + index * 2, true),
  );
const durationMs = (bytes: Uint8Array) => (samplesOf(bytes).length / SAMPLE_RATE) * 1000;
const windowOf = (bytes: Uint8Array, fromMs: number, toMs: number) =>
  samplesOf(bytes).slice(
    Math.round((fromMs / 1000) * SAMPLE_RATE),
    Math.round((toMs / 1000) * SAMPLE_RATE),
  );
const peakBetween = (bytes: Uint8Array, fromMs: number, toMs: number) =>
  Math.max(...windowOf(bytes, fromMs, toMs).map(Math.abs));
const pitchBetween = (bytes: Uint8Array, fromMs: number, toMs: number) => {
  const window = windowOf(bytes, fromMs, toMs);
  const rising = window.filter(
    (sample, index) => index > 0 && (window[index - 1] ?? 0) < 0 && sample >= 0,
  );
  return rising.length / ((toMs - fromMs) / 1000);
};

describe("sons du parcours, synthétisés sans aléa (plan onboarding-paywall, PR 13)", () => {
  it("expose exactement les quatre sons du plan", () => {
    expect(SOUND_NAMES).toEqual(["tap", "validation", "success", "transition"]);
  });

  it.each(SOUND_NAMES)("%s : deux rendus donnent les mêmes octets", (name: SoundName) => {
    expect(renderSound(name)).toEqual(renderSound(name));
  });

  it.each(SOUND_NAMES)(
    "%s : l'en-tête annonce un WAV PCM 16 bits mono à 44,1 kHz",
    (name: SoundName) => {
      const bytes = renderSound(name);
      const header = view(bytes);

      expect(ascii(bytes, 0, 4)).toBe("RIFF");
      expect(header.getUint32(4, true)).toBe(bytes.byteLength - 8);
      expect(ascii(bytes, 8, 4)).toBe("WAVE");
      expect(ascii(bytes, 12, 4)).toBe("fmt ");
      expect(header.getUint32(16, true)).toBe(16);
      expect(header.getUint16(20, true)).toBe(1);
      expect(header.getUint16(22, true)).toBe(1);
      expect(header.getUint32(24, true)).toBe(SAMPLE_RATE);
      expect(header.getUint32(28, true)).toBe(SAMPLE_RATE * 2);
      expect(header.getUint16(32, true)).toBe(2);
      expect(header.getUint16(34, true)).toBe(16);
      expect(ascii(bytes, 36, 4)).toBe("data");
      expect(header.getUint32(40, true)).toBe(bytes.byteLength - HEADER_BYTES);
    },
  );

  it("la fréquence d'échantillonnage est 44,1 kHz", () => {
    expect(SAMPLE_RATE).toBe(44_100);
  });

  it.each([
    ["tap", 80],
    ["validation", 250],
    ["success", 600],
    ["transition", 250],
  ] as const)("%s dure moins de %d ms", (name, ceilingMs) => {
    expect(SOUNDS[name].ceilingMs).toBe(ceilingMs);
    expect(durationMs(renderSound(name))).toBeLessThanOrEqual(ceilingMs);
  });

  it.each(SOUND_NAMES)(
    "%s : aucun échantillon ne dépasse la pleine échelle, et le son s'entend",
    (name: SoundName) => {
      const peak = Math.max(...samplesOf(renderSound(name)).map(Math.abs));

      expect(peak).toBeLessThanOrEqual(FULL_SCALE);
      expect(peak).toBeGreaterThan(FULL_SCALE * 0.1);
    },
  );

  it.each(SOUND_NAMES)("%s commence et finit dans le silence, sans clic", (name: SoundName) => {
    const samples = samplesOf(renderSound(name));

    expect(Math.abs(samples[0] ?? Number.NaN)).toBeLessThanOrEqual(1);
    expect(Math.abs(samples.at(-1) ?? Number.NaN)).toBeLessThanOrEqual(FULL_SCALE * 0.01);
  });

  it.each(SOUND_NAMES)(
    "%s garde de la marge sous la pleine échelle, sans écrêtage",
    (name: SoundName) => {
      const peak = Math.max(...samplesOf(renderSound(name)).map(Math.abs));

      expect(peak).toBeLessThan(FULL_SCALE * 0.95);
    },
  );

  it.each(SOUND_NAMES)(
    "%s monte en quelques millisecondes au lieu de démarrer à plein volume",
    (name: SoundName) => {
      const samples = renderSound(name);

      expect(peakBetween(samples, 0, 1)).toBeLessThan(peakBetween(samples, 5, 15) * 0.5);
    },
  );

  it.each([
    ["tap", 0, 30, 1_320],
    ["validation", 0, 60, 880],
    ["validation", 100, 200, 1_320],
    ["success", 0, 80, 784],
    ["success", 440, 540, 1_568],
  ] as const)("%s sonne à la bonne hauteur entre %d et %d ms (%d Hz)", (name, fromMs, toMs, hz) => {
    expect(pitchBetween(renderSound(name), fromMs, toMs)).toBeCloseTo(hz, -2);
  });

  it("transition glisse vers l'aigu, de 520 Hz vers 880 Hz", () => {
    const samples = renderSound("transition");

    expect(pitchBetween(samples, 0, 30)).toBeCloseTo(570, -2);
    expect(pitchBetween(samples, 140, 175)).toBeCloseTo(840, -2);
  });

  it("chaque son a sa propre empreinte", () => {
    const prints = SOUND_NAMES.map((name) => renderSound(name).join(","));

    expect(new Set(prints).size).toBe(SOUND_NAMES.length);
  });
});
