"""Renders a walkthrough plan (from `render.mjs --export-plan=…`) frame by frame.

Same layouts as Walkthrough.tsx, drawn with PIL + OpenCV instead of headless
Chrome, which crashes or stalls on low-memory machines. Mixes the narration
over quiet music and muxes with AVFoundation (mux.swift), then writes a
sub-30 MB share copy if needed.

    python3 render_frames.py plan.json
"""
import functools, json, math, os, shutil, subprocess, sys, wave

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

plan = json.load(open(sys.argv[1]))
RUN, LAYOUT = plan["run"], plan["layout"]
W, H = (1920, 1080) if LAYOUT == "wide" else (1080, 1920)
FPS, SW, SH = 30, 1280, 800
SCALE = min(W / SW, H / SH)
OX, OY = int((W - SW * SCALE) / 2), int((H - SH * SCALE) / 2)
HERE = os.path.dirname(os.path.abspath(__file__))

DEEP, ACCENT, INK, SOFT, PAPER, AMBER = (8, 70, 58), (14, 107, 84), (22, 36, 29), (81, 99, 90), (244, 247, 243), (162, 102, 13)
MINT_TXT, CARD_TXT, LINE = (138, 210, 184), (216, 236, 228), (220, 228, 221)
FONT = "/System/Library/Fonts/Avenir Next.ttc"
WEIGHT = {"regular": 7, "medium": 5, "demi": 2, "bold": 0, "heavy": 8}


@functools.lru_cache(None)
def F(size, w="regular"):
    return ImageFont.truetype(FONT, int(size), index=WEIGHT[w])


def ease(x):
    x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3


def rise(f, at):  # same curve as Walkthrough.tsx: 14 frames, ease-out
    return ease((f - at) / 14)


def wrap(text, font, width):
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if font.getlength(trial) <= width or not cur:
            cur = trial
        else:
            lines.append(cur); cur = word
    return lines + ([cur] if cur else [])


def S(v):  # stage units → output pixels
    return v * SCALE


def blend(base, top, a):
    return top if a >= 1 else Image.blend(base, top, max(0.0, a))


def pill(d, x, y, label, fill, size=18):
    f = F(size, "bold"); w = f.getlength(label) + 32
    d.rounded_rectangle((x, y, x + w, y + size + 20), (size + 20) // 2, fill=fill)
    d.text((x + 16, y + 10 + size / 2), label, font=f, fill="white", anchor="lm")
    return w


def pills(d, x, y, who, rate, size=18):
    w = pill(d, x, y, who, AMBER if who == "Teacher" else ACCENT, size)
    if rate and rate > 1.05:
        label = f"×{round(rate) if rate >= 10 else ('%.1f' % rate).rstrip('0').rstrip('.')} speed"
        pill(d, x + w + 10, y, label, (11, 23, 18), size - 2)


def caption_box(d, cx, bottom, text, size, maxw, fill=DEEP, color="white"):
    f = F(size, "medium"); lines = wrap(text, f, maxw - 2 * size)
    lh = size * 1.35; h = lh * len(lines) + size * 1.1
    w = max(f.getlength(l) for l in lines) + 2 * size
    d.rounded_rectangle((cx - w / 2, bottom - h, cx + w / 2, bottom), size * 0.6, fill=fill)
    for i, l in enumerate(lines):
        d.text((cx, bottom - h + size * 0.55 + lh * i + lh / 2), l, font=f, fill=color, anchor="mm")
    return h


class Reader:
    """Sequential frame reader that follows a (from, rate) schedule; sped-up cuts skip frames."""

    def __init__(self, file, start):
        self.cap = cv2.VideoCapture(os.path.join(RUN, file))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        self.cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
        self.pos, self.last = start, None

    def at(self, t):
        while self.last is None or self.pos < t - 0.5 / self.fps:
            ok, fr = self.cap.read()
            if not ok: break
            self.last, self.pos = fr, self.pos + 1 / self.fps
        return Image.fromarray(cv2.cvtColor(self.last, cv2.COLOR_BGR2RGB)) if self.last is not None else Image.new("RGB", (SW, SH), "white")


# ------------------------------------------------------------------ segments

def card(seg, f):
    im = Image.new("RGB", (W, H), DEEP); d = ImageDraw.Draw(im)
    tall = LAYOUT == "tall"
    x = 80 if tall else OX + S(120); y = 320 if tall else OY + S(110); k = 1 if tall else SCALE
    tsize, lsize = (76, 34) if tall else (64 * k, 28 * k)
    a = rise(f, 4)
    if a > 0: d.text((x, y), seg["eyebrow"].upper(), font=F(22 * k, "bold"), fill=tuple(int(c * a + DEEP[i] * (1 - a)) for i, c in enumerate(MINT_TXT)))
    y += 22 * k + 22 * k
    tf = F(tsize, "heavy"); a = rise(f, 10)
    for line in wrap(seg["title"], tf, (W - 2 * x)):
        if a > 0: d.text((x, y + (1 - a) * 18), line, font=tf, fill=tuple(int(255 * a + DEEP[i] * (1 - a)) for i in range(3)))
        y += tsize * 1.08
    y += 40 * k
    lf = F(lsize, "medium")
    for i, line in enumerate(seg.get("lines") or []):
        a = rise(f, 26 + i * 12)
        if a <= 0: continue
        col = tuple(int(CARD_TXT[j] * a + DEEP[j] * (1 - a)) for j in range(3))
        dx = (1 - a) * 20
        ay = y + lsize * 0.62
        d.line((x + dx, ay, x + dx + lsize * 0.7, ay), fill=MINT_TXT, width=max(2, int(lsize / 9)))
        d.polygon([(x + dx + lsize * 0.75, ay), (x + dx + lsize * 0.5, ay - lsize * 0.22), (x + dx + lsize * 0.5, ay + lsize * 0.22)], fill=MINT_TXT)
        for j, part in enumerate(wrap(line, lf, W - 2 * x - lsize * 1.4)):
            d.text((x + dx + lsize * 1.3, y + j * lsize * 1.35), part, font=lf, fill=col)
        y += lsize * 1.35 * len(wrap(line, lf, W - 2 * x - lsize * 1.4)) + 18 * k
    return im


ARCH = [("Teacher console", "Create class · join code · release once", "web"),
        ("Classroom orchestrator", "Opens each student's next stage the moment they finish", "pilot-flow"),
        ("Lotus diagnostic", "Adaptive · stops at 15 min or once the starting point is found", "stop rule"),
        ("Lesson author", "Writes the lesson from the student's own answers", "per student"),
        ("Maths verifier", "Algebra engine re-checks every equation before a student sees it", "code"),
        ("Practice + exit", "Animated practice · one fresh question, no hints", "server-marked")]


def architecture(seg, f):
    st = Image.new("RGB", (SW, SH), PAPER); d = ImageDraw.Draw(st)
    d.text((90, 70), "HOW IT FITS TOGETHER", font=F(20, "bold"), fill=ACCENT)
    head = "One button for the teacher. Everything else runs on the server."
    size = 40
    while F(size, "heavy").getlength(head) > SW - 180: size -= 1
    d.text((90, 104), head, font=F(size, "heavy"), fill=INK)
    bw, bh = 340, 150
    pos = lambda i: (90 + (i % 3) * (bw + 45), 250 + (i // 3) * (bh + 90))
    for i in range(1, len(ARCH)):
        p = rise(f, 18 + i * 14)
        if p <= 0: continue
        (ax, ay), (bx, by) = pos(i - 1), pos(i)
        if ay == by:
            x1, y1, x2 = ax + bw, ay + bh / 2, bx - 8
            d.line((x1, y1, x1 + (x2 - x1) * p, y1), fill=ACCENT, width=3)
            if p > .95: d.polygon([(x2 + 6, y1), (x2 - 6, y1 - 7), (x2 - 6, y1 + 7)], fill=ACCENT)
        else:  # row change: curve from the bottom of the last box to the top of the next
            x1, y1, x2, y2 = ax + bw / 2, ay + bh, bx + bw / 2, by - 8
            pts = []
            for k in range(41):
                u = k / 40 * p
                c1, c2 = (x1, y1 + 50), (x2, y2 - 50)
                x = (1 - u) ** 3 * x1 + 3 * (1 - u) ** 2 * u * c1[0] + 3 * (1 - u) * u ** 2 * c2[0] + u ** 3 * x2
                y = (1 - u) ** 3 * y1 + 3 * (1 - u) ** 2 * u * c1[1] + 3 * (1 - u) * u ** 2 * c2[1] + u ** 3 * y2
                pts.append((x, y))
            d.line(pts, fill=ACCENT, width=3)
            if p > .95: d.polygon([(x2, y2 + 6), (x2 - 7, y2 - 6), (x2 + 7, y2 - 6)], fill=ACCENT)
    for i, (title, body, tag) in enumerate(ARCH):
        p = rise(f, 10 + i * 14)
        if p <= 0: continue
        x, y = pos(i); y += (1 - p) * 16
        col = AMBER if i == 4 else ACCENT
        d.rounded_rectangle((x + 4, y + 10, x + bw + 4, y + bh + 10), 18, fill=(228, 233, 229))
        d.rounded_rectangle((x, y, x + bw, y + bh), 18, fill="white", outline=LINE)
        d.rounded_rectangle((x, y, x + bw, y + 10), 6, fill=col); d.rectangle((x, y + 5, x + bw, y + 10), fill="white")
        tag_w = F(14, "bold").getlength(tag)
        ts = 24
        while F(ts, "heavy").getlength(title) > bw - 44 - tag_w - 12: ts -= 1  # keep the title clear of its tag
        d.text((x + 22, y + 24 + (24 - ts) / 2), title, font=F(ts, "heavy"), fill=INK)
        d.text((x + bw - 22, y + 30), tag, font=F(14, "bold"), fill=col, anchor="ra")
        for j, line in enumerate(wrap(body, F(18, "medium"), bw - 44)):
            d.text((x + 22, y + 66 + j * 25), line, font=F(18, "medium"), fill=SOFT)
    if rise(f, 110) > 0:
        d.text((90, SH - 84), "Class report: built only from stored evidence. Practice never counts as progress; only the independent exit does.",
               font=F(19, "medium"), fill=SOFT)
    return on_stage(st)


def on_stage(st):
    im = Image.new("RGB", (W, H), PAPER)
    im.paste(st.resize((int(SW * SCALE), int(SH * SCALE)), Image.LANCZOS), (OX, OY))
    return im


def tall_frame(stage_img, f, caption, who, rate):
    im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
    im.paste(stage_img.resize((int(SW * SCALE), int(SH * SCALE)), Image.LANCZOS), (OX, OY))
    a = rise(f, 4)
    if a > 0:
        d.text((60, 230), "Cogna.", font=F(30, "heavy"), fill=ACCENT)
        tf = F(54, "heavy")
        for i, line in enumerate(wrap(caption, tf, W - 120)):
            d.text((60, 290 + i * 60), line, font=tf, fill=INK)
        pills(d, 60, 1330, who, rate, 26)
    return im


def masked(st, rects):
    """Paints over dev-only overlays (stage px), using the page colour just above each patch."""
    if not rects: return st
    st = st.copy(); d = ImageDraw.Draw(st)
    for x0, y0, x1, y1 in rects:
        d.rectangle((x0, y0, x1, y1), fill=st.getpixel((min(SW - 1, max(0, (x0 + x1) // 2)), max(0, y0 - 4))))
    return st


def clip(seg, f, readers):
    r = readers.setdefault(id(seg), Reader(seg["file"], seg["from"]))
    st = masked(r.at(seg["from"] + f / FPS * seg["rate"]), plan.get("masks"))
    if LAYOUT == "tall":
        return tall_frame(st, f, seg["caption"], seg["who"], seg["rate"])
    im = on_stage(st); d = ImageDraw.Draw(im)
    if rise(f, 4) > 0: pills(d, OX + S(22), OY + S(22), seg["who"], seg["rate"], S(18))
    if rise(f, 6) > 0:
        h = caption_box(d, W / 2, OY + S(SH - 26), seg["caption"], S(25), S(1080))
        if seg.get("note") and rise(f, 30) > 0:
            caption_box(d, W / 2, OY + S(SH - 26) - h - S(10), seg["note"], S(17), S(1000), fill=(255, 255, 255), color=SOFT)
    return im


def multi(seg, f, readers):
    r = readers.setdefault(id(seg), Reader(seg["composite"], 0))
    st = r.at(f / FPS).copy(); d = ImageDraw.Draw(st)
    d.text((30, 60), "Three students, three devices.", font=F(40, "heavy"), fill=INK)
    t = seg["tile"]
    for i, sc in enumerate(seg["screens"]):
        x = t["side"] + i * (t["w"] + t["gap"])
        d.rectangle((x, t["top"], x + t["w"], t["top"] + t["h"]), outline=LINE, width=1)
        pills(d, x, t["top"] + t["h"] + 16, sc["who"], sc["rate"])
    caption_box(d, SW / 2, SH - 40, seg["caption"], 25, 1080)
    return on_stage(st)


@functools.lru_cache(None)
def still_image(file, width=None):
    img = Image.open(os.path.join(RUN, file)).convert("RGB")
    return img if width is None else img.resize((width, int(img.height * width / img.width)), Image.LANCZOS)


def still(seg, f):
    img = still_image(seg["file"]); total = seg["seconds"] * FPS
    if LAYOUT == "tall":
        im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
        sc = W / img.width
        im.paste(img.resize((W, int(img.height * sc)), Image.LANCZOS), (0, 520))
        d.rectangle((0, 0, W, 520), fill=PAPER)
        d.text((60, 230), "Cogna.", font=F(30, "heavy"), fill=ACCENT)
        for i, line in enumerate(wrap(seg["caption"], F(54, "heavy"), W - 120)):
            d.text((60, 290 + i * 60), line, font=F(54, "heavy"), fill=INK)
        return im
    w = int(SW * SCALE); big = still_image(seg["file"], w); full_h = big.height
    travel = max(0, full_h - int(SH * SCALE))
    u = max(0.0, min(1.0, (f - total * .15) / (total * .7)))
    u = u * u * (3 - 2 * u)
    y = int(travel * u)
    im = Image.new("RGB", (W, H), PAPER)
    im.paste(big.crop((0, y, w, y + int(SH * SCALE))), (OX, OY))
    d = ImageDraw.Draw(im)
    pills(d, OX + S(22), OY + S(22), seg["who"], None, S(18))
    caption_box(d, W / 2, OY + S(SH - 26), seg["caption"], S(25), S(1080))
    return im


# ------------------------------------------------------------------ render

segs = plan["segments"]
starts = np.cumsum([0] + [round(s["seconds"] * FPS) for s in segs])
total = int(starts[-1])
work = os.path.join(RUN, f"py-{LAYOUT}"); os.makedirs(work, exist_ok=True)
vw = cv2.VideoWriter(os.path.join(work, "silent.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
readers = {}
if os.environ.get("PREVIEW"):  # one mid-segment frame per segment, for checking layouts quickly
    for i, seg in enumerate(segs):
        n = int(starts[i + 1] - starts[i]); f = int(n * .7); k = seg["kind"]
        rd = {}
        if k in ("clip", "multi"):
            seg2 = dict(seg); rd = {}
        im = (card(seg, f) if k == "card" else architecture(seg, f) if k == "architecture" else
              multi(seg, f, rd) if k == "multi" else still(seg, f) if k == "still" else clip(seg, f, rd))
        im.save(os.path.join(work, f"preview-{i:02d}-{k}.jpg"), quality=85)
    sys.exit(0)
for i, seg in enumerate(segs):
    n = int(starts[i + 1] - starts[i])
    for f in range(n):
        k = seg["kind"]
        im = (card(seg, f) if k == "card" else architecture(seg, f) if k == "architecture" else
              multi(seg, f, readers) if k == "multi" else still(seg, f) if k == "still" else clip(seg, f, readers))
        fade = min(f / 10, (n - f) / 10, 1.0)
        if fade < 1: im = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), im, max(0.0, fade))
        vw.write(cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR))
    print(f"\rsegment {i + 1}/{len(segs)}", end="", flush=True)
vw.release()
print()

# ------------------------------------------------------------------ audio
SR = 48000


def read_wav(path):
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
        x = x.reshape(-1, w.getnchannels()).mean(axis=1); sr = w.getframerate()
    if sr != SR:
        x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x).astype(np.float32)
    return x


length = int(total / FPS * SR) + SR
voice = np.zeros(length, np.float32)
for i, seg in enumerate(segs):
    if not seg.get("voice"): continue
    v = read_wav(os.path.join(RUN, seg["voice"]))
    a = int((starts[i] / FPS + seg.get("voiceLead", 0.45)) * SR)
    voice[a:a + len(v)] += v[:max(0, length - a)]
# The app's own sounds (read-aloud, lesson narration), placed where they played in the recording.
for i, seg in enumerate(segs):
    for snd in seg.get("sounds", []):
        v = read_wav(os.path.join(RUN, snd["file"])) * snd.get("gain", 1.0)
        a = int((starts[i] / FPS + snd["at"]) * SR)
        if a < length: voice[a:a + len(v)] += v[:max(0, length - a)]
mix = voice * (0.9 / max(1e-6, np.abs(voice).max()))
if plan.get("music") and os.path.exists(plan["music"]):
    m = read_wav(plan["music"]); m = np.tile(m, length // len(m) + 1)[:length]
    act = np.convolve((np.abs(voice) > .005).astype(np.float32), np.ones(SR // 4) / (SR // 4), mode="same")
    m = m / max(1e-6, np.abs(m).max()) * 0.16 * (1 - 0.55 * np.clip(act * 4, 0, 1))
    env = np.clip(np.arange(length) / SR, 0, 1) * np.clip((length / SR - np.arange(length) / SR - 1) / 1.5, 0, 1)
    mix = mix + m * env
mix = mix / max(1.0, np.abs(mix).max() / .95)
with wave.open(os.path.join(work, "mix.wav"), "w") as w:
    w.setparams((1, 2, SR, len(mix), "NONE", "not compressed"))
    w.writeframes((mix * 32767).astype("<i2").tobytes())

out = os.path.join(work, plan["name"])
subprocess.run(["swift", os.path.join(HERE, "mux.swift"), os.path.join(work, "silent.mp4"), os.path.join(work, "mix.wav"), out], check=True)
if plan.get("deliver"):
    os.makedirs(plan["deliver"], exist_ok=True)
    shutil.copy(out, os.path.join(plan["deliver"], plan["name"]))
    if os.path.getsize(out) > 29_000_000:
        share = os.path.join(plan["deliver"], plan["name"].replace(".mp4", "-share.mp4"))
        subprocess.run(["swift", os.path.join(HERE, "export_small.swift"), out, share, "1300000"], check=True)
print("wrote", out)
