"""Pre-composites several student screens into one stage-sized (1280×800) video.

Called by render.mjs for each "multi" scene: Remotion stalls when several
OffthreadVideos share a frame, and its bundled ffmpeg lacks overlay filters,
so the compositing happens here and ffmpeg only re-encodes to H.264.

stdin JSON: {"dir", "out", "seconds", "fps", "tile": {w,h,top,side,gap},
             "screens": [{"file", "from", "rate"}], "ffmpeg", "ffmpeg_lib"}
"""
import json, os, subprocess, sys

import cv2
import numpy as np

job = json.load(sys.stdin)
W, H, BG = 1280, 800, (243, 247, 244)  # BGR of #f4f7f3
fps, seconds, t = job["fps"], job["seconds"], job["tile"]
caps = [cv2.VideoCapture(os.path.join(job["dir"], s["file"])) for s in job["screens"]]
src_fps = [c.get(cv2.CAP_PROP_FPS) or 30 for c in caps]
for c, s in zip(caps, job["screens"]):
    c.set(cv2.CAP_PROP_POS_MSEC, s["from"] * 1000)
pos = [s["from"] for s in job["screens"]]  # current source time of each capture
last = [None] * len(caps)

tmp = os.path.join(job["dir"], job["out"] + ".tmp.mp4")
vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
for n in range(int(round(seconds * fps))):
    canvas = np.full((H, W, 3), BG, np.uint8)
    for i, (c, s) in enumerate(zip(caps, job["screens"])):
        want = s["from"] + (n / fps) * s["rate"]
        # Read forward until the capture reaches the wanted source time (sped-up clips skip frames).
        while pos[i] < want - 0.5 / src_fps[i] or last[i] is None:
            ok, frame = c.read()
            if not ok:
                break
            last[i], pos[i] = frame, pos[i] + 1 / src_fps[i]
        if last[i] is not None:
            x = t["side"] + i * (t["w"] + t["gap"])
            canvas[t["top"]:t["top"] + t["h"], x:x + t["w"]] = cv2.resize(last[i], (t["w"], t["h"]), interpolation=cv2.INTER_AREA)
    vw.write(canvas)
vw.release()

env = dict(os.environ, DYLD_LIBRARY_PATH=job["ffmpeg_lib"], LD_LIBRARY_PATH=job["ffmpeg_lib"])
subprocess.run([job["ffmpeg"], "-y", "-loglevel", "error", "-i", tmp, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-g", "30", "-pix_fmt", "yuv420p", os.path.join(job["dir"], job["out"])], env=env, check=True)
os.remove(tmp)
