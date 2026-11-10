#!/usr/bin/env python3
"""Soundtrack for the OSSPilot 30s intro.

One piece, one beat grid: pads, bass, hats and ticks are all generated from the
same 100 BPM clock counted from frame zero, so nothing drifts. No samples, no
downloads — pure synthesis with numpy.

Usage: python scripts/build_intro_audio.py [out.wav]
"""

import os
import sys
import wave

import numpy as np

SR = 44100
DURATION = 30.0
BPM = 100.0
BEAT = 60.0 / BPM  # 0.6s

# A minor - F - C - G, one bar each (4 beats), 12.5 bars total.
CHORDS = [
    [110.00, 164.81, 261.63],  # Am
    [87.31, 174.61, 261.63],  # F
    [130.81, 164.81, 196.00],  # C
    [98.00, 123.47, 293.66],  # G
]


def env(n, attack, release):
    """Simple AD envelope over n samples."""
    a = max(1, int(n * attack))
    r = max(1, int(n * release))
    e = np.ones(n)
    e[:a] = np.linspace(0.0, 1.0, a) ** 2
    e[-r:] = np.linspace(1.0, 0.0, r) ** 2
    return e


def add_pad(buf, t0, freqs, length):
    i0 = int(t0 * SR)
    n = int(length * SR)
    if i0 + n > len(buf):
        n = len(buf) - i0
    if n <= 0:
        return
    t = np.arange(n) / SR
    e = env(n, 0.35, 0.55)
    left = np.zeros(n)
    right = np.zeros(n)
    for k, f in enumerate(freqs):
        for octave, gain in ((1.0, 1.0), (2.0, 0.35)):
            phase = 2 * np.pi * f * octave * t + k * 0.7
            left += np.sin(phase) * gain
            right += np.sin(phase * 1.002 + 0.4) * gain  # slight detune for width
    left *= e / (len(freqs) * 1.35 * 2)
    right *= e / (len(freqs) * 1.35 * 2)
    buf[i0 : i0 + n, 0] += left
    buf[i0 : i0 + n, 1] += right


def add_bass(buf, t0, freq, length):
    i0 = int(t0 * SR)
    n = int(length * SR)
    if i0 + n > len(buf):
        n = len(buf) - i0
    if n <= 0:
        return
    t = np.arange(n) / SR
    e = env(n, 0.02, 0.30)
    wave_ = np.sin(2 * np.pi * freq * t) * 0.5 + np.sin(2 * np.pi * freq * 2 * t) * 0.12
    buf[i0 : i0 + n, 0] += wave_ * e * 0.32
    buf[i0 : i0 + n, 1] += wave_ * e * 0.32


def add_hat(buf, t0, level=0.05):
    i0 = int(t0 * SR)
    n = int(0.08 * SR)
    if i0 + n > len(buf):
        return
    rng = np.random.default_rng(int(t0 * 1000))
    noise = rng.standard_normal(n)
    e = env(n, 0.01, 0.9) ** 3
    buf[i0 : i0 + n, 0] += noise * e * level
    buf[i0 : i0 + n, 1] += noise * e * level * 0.9


def add_tick(buf, t0, level=0.03):
    i0 = int(t0 * SR)
    n = int(0.05 * SR)
    if i0 + n > len(buf):
        return
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 1400 * t) * np.exp(-t * 90)
    buf[i0 : i0 + n, 0] += tone * level
    buf[i0 : i0 + n, 1] += tone * level


def add_swell(buf, t0, length):
    """Sub-bass riser for the hook."""
    i0 = int(t0 * SR)
    n = int(length * SR)
    if i0 + n > len(buf):
        n = len(buf) - i0
    if n <= 0:
        return
    t = np.arange(n) / SR
    f = 38 + 22 * (t / length)
    e = (t / length) ** 2
    tone = np.sin(2 * np.pi * f * t) * e
    buf[i0 : i0 + n, 0] += tone * 0.30
    buf[i0 : i0 + n, 1] += tone * 0.30


def add_impact(buf, t0):
    """Low final hit under the outro."""
    i0 = int(t0 * SR)
    n = int(1.8 * SR)
    if i0 + n > len(buf):
        n = len(buf) - i0
    if n <= 0:
        return
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 55 * t) * np.exp(-t * 2.2)
    body += np.sin(2 * np.pi * 110 * t) * np.exp(-t * 3.2) * 0.5
    buf[i0 : i0 + n, 0] += body * 0.35
    buf[i0 : i0 + n, 1] += body * 0.35


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "work/intro.wav"
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)

    total = int(DURATION * SR)
    buf = np.zeros((total, 2))

    beats = int(DURATION / BEAT)
    for bar in range(beats // 4 + 1):
        chord = CHORDS[bar % len(CHORDS)]
        bar_start = bar * 4 * BEAT
        if bar_start >= DURATION:
            break
        add_pad(buf, bar_start, chord, min(4 * BEAT, DURATION - bar_start))
        for b in range(4):
            t = bar_start + b * BEAT
            if t >= DURATION:
                break
            if b in (0, 2):
                add_bass(buf, t, chord[0] / 2, BEAT * 0.9)
            add_tick(buf, t)
            if b % 2 == 1:
                add_hat(buf, t + BEAT / 2, 0.040)

    add_swell(buf, 0.0, 3.0)
    add_impact(buf, 25.0)

    # Space: three delayed taps of the whole mix, quietly.
    space = np.zeros_like(buf)
    for delay, gain in ((0.19, 0.22), (0.37, 0.14), (0.61, 0.08)):
        shift = int(delay * SR)
        if shift < len(buf):
            space[shift:] += buf[:-shift] * gain
    buf = buf + space * 0.5

    # Master: fade in/out, then gentle limiter and normalisation to -14 dBFS.
    fade_in = int(0.8 * SR)
    fade_out = int(1.6 * SR)
    buf[:fade_in] *= np.linspace(0, 1, fade_in)[:, None] ** 2
    buf[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 2
    peak = np.max(np.abs(buf))
    if peak > 0:
        buf = buf / peak
    buf = np.tanh(buf * 1.15) / np.tanh(1.15)  # soft saturation
    buf = buf * 0.5

    pcm = (buf * 32767).astype(np.int16)
    with wave.open(out, "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {out}  ({DURATION:.1f}s, {SR} Hz stereo, 16-bit PCM)")


if __name__ == "__main__":
    main()
