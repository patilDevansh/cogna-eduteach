"""Writes the lesson's sound effects as small WAV files in sfx/.

The recipes copy prototypes/school-pilot-student-trail/anim/sfx.js (sine and
triangle tones, filtered noise), so the Rive lesson sounds like the rest of
Cogna. Nothing is sampled, so there is nothing to license.

Run from anywhere:  python3 -I prototypes/rive-trig-unit-circle/tools/make-sfx.py
"""

import os
import wave

import numpy as np

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sfx")
rng = np.random.default_rng(7)


def envelope(n, gain, attack=0.008):
    """Exponential attack to `gain`, then exponential decay to silence."""
    t = np.arange(n) / RATE
    dur = n / RATE
    a = max(attack, 1e-4)
    env = np.where(
        t < a,
        0.0001 * (gain / 0.0001) ** (t / a),
        gain * (0.0001 / gain) ** ((t - a) / max(dur - a, 1e-4)),
    )
    return env


def tone(f0, f1, dur, kind="sine", gain=0.2, at=0.0):
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    # exponential glide from f0 to f1
    f = f0 * (f1 / f0) ** (t / dur) if f1 and f1 != f0 else np.full(n, f0)
    phase = 2 * np.pi * np.cumsum(f) / RATE
    if kind == "triangle":
        wave_ = 2 / np.pi * np.arcsin(np.sin(phase))
    else:
        wave_ = np.sin(phase)
    return at, wave_ * envelope(n, gain)


def one_pole(x, cutoff, kind):
    """Cheap filter with a cutoff that can sweep (array) over time."""
    y = np.zeros_like(x)
    lo = 0.0
    c = np.broadcast_to(cutoff, x.shape)
    for i in range(len(x)):
        alpha = 1 - np.exp(-2 * np.pi * c[i] / RATE)
        lo += alpha * (x[i] - lo)
        y[i] = lo if kind == "lowpass" else x[i] - lo
    return y


def noise(dur, kind, f0, f1, gain=0.2, at=0.0):
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    cutoff = f0 * (f1 / f0) ** (t / dur) if f1 != f0 else np.full(n, float(f0))
    x = rng.uniform(-1, 1, n)
    if kind == "bandpass":
        y = one_pole(one_pole(x, cutoff * 1.4, "lowpass"), cutoff * 0.7, "highpass") * 2.2
    else:
        y = one_pole(x, cutoff, kind)
    return at, y * envelope(n, gain, 0.01)


def mix(parts, tail=0.05, master=0.7):
    end = max(at + len(w) / RATE for at, w in parts) + tail
    out = np.zeros(int(end * RATE))
    for at, w in parts:
        s = int(at * RATE)
        out[s : s + len(w)] += w
    out *= master
    peak = np.max(np.abs(out))
    if peak > 0.98:
        out *= 0.98 / peak
    return out


def save(name, samples):
    os.makedirs(OUT, exist_ok=True)
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    print("wrote", name, f"{len(samples) / RATE:.2f}s")


# a piece clicking into place
save("snap", mix([noise(0.05, "lowpass", 2200, 900, 0.35), tone(190, 85, 0.14, "sine", 0.45)]))
# picking the dot up
save("pickup", mix([tone(420, 640, 0.08, "sine", 0.14)]))
# putting it down
save("drop", mix([tone(330, 220, 0.09, "sine", 0.14)]))
# a new step appears
save("pop", mix([tone(700, 1150, 0.07, "sine", 0.14)]))
# the task is done
save("chime", mix([tone(f, f, 0.55, "sine", 0.12, i * 0.085) for i, f in enumerate([1046.5, 1318.5, 1568, 2093])]))
# a challenge answer found
save("sparkle", mix([tone(f, f, 0.24, "sine", 0.08, i * 0.045) for i, f in enumerate([1568, 2093, 2637, 3136])]))
# the dot sets off on a spin
save("whoosh", mix([noise(0.32, "bandpass", 350, 1600, 0.12)]))
# a light tick as the dot passes a special angle
save("tick", mix([tone(880, 900, 0.05, "triangle", 0.12)], tail=0.02))
