#!/usr/bin/env python3
"""Cuts a screen recording into the demo film: crop, speed ramps, TTS voice, synthesized music bed,
word-timed captions and speed disclosures, all through ffmpeg. Usage: edit.py [source.mp4]"""
import json, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FILM = os.path.join(ROOT, "film")
WORK = os.path.join(FILM, "work")
os.makedirs(WORK, exist_ok=True)
S = json.load(open(os.path.join(FILM, "script.json")))
SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else S["source"])
C = S["crop"]
W, H, FPS, SR = 1920, 1080, 30, 48000
PAPER, INK, AMBER = (242, 239, 230), (11, 11, 12), (232, 163, 61)
SITE = json.load(open(os.path.join(ROOT, "submission-facts.json")))
SITE_URL = SITE["site"].replace("https://", "")
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"
MONO = "/System/Library/Fonts/Menlo.ttc"


def run(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def probe(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))


# ---- 1. video segments -------------------------------------------------------
segs = []
t = 0.0
for seg in S["segments"]:
    out_len = (seg["end"] - seg["start"]) / seg["speed"]
    segs.append({**seg, "out_start": t, "out_len": out_len})
    t += out_len
END_START = t
TOTAL = t + S["endCardSeconds"]

vf = (f"crop={C['w']}:{C['h']}:{C['x']}:{C['y']},setpts=(PTS-STARTPTS)/{{speed}},fps={FPS},split[a][b];"
      f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=40:5,eq=brightness=-0.04[bg];"
      f"[b]scale=-2:{H}[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p")
parts = []
for i, seg in enumerate(segs):
    path = os.path.join(WORK, f"seg{i}.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-ss", str(seg["start"]), "-t", str(seg["end"] - seg["start"]), "-i", SRC,
         "-vf", vf.format(speed=seg["speed"]), "-an", "-c:v", "libx264", "-crf", "17", "-preset", "medium", path])
    parts.append(path)
    print("segment", seg["id"], f"{seg['out_len']:.1f}s")

# ---- 2. end card ---------------------------------------------------------------
crosshair = json.load(open(os.path.join(ROOT, "designs", "crosshair.json")))["rows"][0]


def draw_mark(d, x, y, cell, ink=INK, accent=AMBER):
    for r, row in enumerate(crosshair):
        for c, ch in enumerate(row):
            if ch == "#":
                col = accent if r in (7, 8) and c in (7, 8) else ink
                d.rectangle([x + c * cell, y + r * cell, x + (c + 1) * cell - 1, y + (r + 1) * cell - 1], fill=col)


f = lambda size, path=FONT, idx=0: ImageFont.truetype(path, size, index=idx)
card = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(card)
d.rectangle([60, 60, W - 61, H - 61], outline=INK, width=3)
draw_mark(d, 200, 300, 28)
d.text((720, 330), "Reticle", font=f(150, FONT, 1), fill=INK)
d.text((724, 520), "Images that are circuits.", font=f(54), fill=INK)
d.text((724, 640), SITE_URL, font=f(46, MONO), fill=(138, 90, 11))
d.text((724, 704), "github.com/winsznx/reticle", font=f(34, MONO), fill=INK)
d.text((724, 880), "Contracts are TapeOut upgradeable beacons, unaudited.", font=f(30), fill=(74, 73, 68))
card_png = os.path.join(WORK, "endcard.png")
card.save(card_png)
end_mp4 = os.path.join(WORK, "end.mp4")
run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", str(S["endCardSeconds"]), "-i", card_png,
     "-vf", "fade=in:0:15,format=yuv420p", "-c:v", "libx264", "-crf", "17", end_mp4])
parts.append(end_mp4)

listfile = os.path.join(WORK, "concat.txt")
open(listfile, "w").write("".join(f"file '{p}'\n" for p in parts))
base_mp4 = os.path.join(WORK, "base.mp4")
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c", "copy", base_mp4])

# ---- 3. voice ------------------------------------------------------------------
vdir = os.path.join(WORK, "voice")
os.makedirs(vdir, exist_ok=True)
voice = np.zeros(int(TOTAL * SR) + SR * 2, dtype=np.float32)
timed = []
for i, line in enumerate(S["lines"]):
    seg = next((s for s in segs if s["id"] == line["segment"]), None)
    start = (seg["out_start"] if seg else END_START) + line["offset"]
    aiff, wav = os.path.join(vdir, f"l{i}.aiff"), os.path.join(vdir, f"l{i}.wav")
    run(["say", "-v", "Samantha", "-r", "150", "-o", aiff, line["text"]])
    run(["ffmpeg", "-v", "error", "-y", "-i", aiff, "-ar", str(SR), "-ac", "1", wav])
    with wave.open(wav) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    a = int(start * SR)
    voice[a:a + len(x)] += x
    timed.append((start, len(x) / SR, line["text"]))
    seg_end = (seg["out_start"] + seg["out_len"]) if seg else TOTAL
    assert start + len(x) / SR <= seg_end + 0.01, f"line {i} runs past its segment"
vpath = os.path.join(WORK, "voice_raw.wav")
with wave.open(vpath, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(voice, -1, 1) * 32767).astype(np.int16).tobytes())

# ---- 4. music bed (synthesized, no third-party material) --------------------
chords = [[110.0, 164.81, 220.0, 261.63, 329.63, 493.88], [87.31, 130.81, 174.61, 220.0, 261.63, 329.63],
          [130.81, 196.0, 246.94, 329.63, 392.0, 587.33], [98.0, 146.83, 196.0, 246.94, 293.66, 392.0]]
n = int((TOTAL + 2) * SR)
tt = np.arange(n) / SR
music = np.zeros((2, n), dtype=np.float32)
CH = 8.0
for k in range(int(np.ceil((TOTAL + 2) / CH)) + 1):
    notes = chords[k % 4]
    env = np.zeros(n)
    s0, s1 = k * CH - 1.5, (k + 1) * CH + 1.5
    m = (tt >= s0) & (tt < s1)
    env[m] = np.sin(np.pi * (tt[m] - s0) / (s1 - s0)) ** 2
    for j, fr in enumerate(notes):
        for ch, det in ((0, 0.25), (1, -0.25)):
            ph = 2 * np.pi * (fr + det) * tt + 0.7 * np.sin(2 * np.pi * (0.07 + 0.01 * j) * tt)
            tone = np.sin(ph) + 0.25 * np.sin(2 * ph)
            music[ch] += (env * tone * (0.9 if fr < 140 else 0.45 / (1 + j * 0.15))).astype(np.float32)
music *= 0.05 / np.abs(music).max() * 6
mpath = os.path.join(WORK, "music_raw.wav")
with wave.open(mpath, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(music.T, -1, 1) * 32767).astype(np.int16).tobytes())

audio = os.path.join(WORK, "mix.wav")
fc = (f"[0:a]loudnorm=I=-16:TP=-1.5:LRA=7,aformat=channel_layouts=stereo,asplit=2[vo][sc];"
      f"[1:a]lowpass=f=2200,aecho=0.8:0.7:420:0.3,volume=1.0,afade=t=in:d=3,afade=t=out:st={TOTAL - 5:.2f}:d=5[mu];"
      f"[mu][sc]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=600:makeup=1[duck];"
      f"[vo][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,atrim=0:{TOTAL:.2f}[out]")
run(["ffmpeg", "-v", "error", "-y", "-i", vpath, "-i", mpath, "-filter_complex", fc, "-map", "[out]", "-ar", str(SR), audio])

# ---- 5. captions and disclosures ---------------------------------------------
cap_font, pill_font = f(44), f(24, MONO)


def pill(text):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    tw = dd.textlength(text, font=pill_font)
    x0, y0 = 40, 36
    dd.rectangle([x0, y0, x0 + tw + 56, y0 + 44], fill=(11, 11, 12, 210))
    dd.rectangle([x0 + 14, y0 + 17, x0 + 24, y0 + 27], fill=AMBER + (255,))
    dd.text((x0 + 40, y0 + 8), text, font=pill_font, fill=(242, 239, 230, 255))
    return im


def caption(text):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    words, lines_, cur = text.split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if dd.textlength(trial, font=cap_font) > 1500 and cur:
            lines_.append(cur); cur = wd
        else:
            cur = trial
    lines_.append(cur)
    lh = 58
    bh = lh * len(lines_) + 28
    bw = max(dd.textlength(l, font=cap_font) for l in lines_) + 64
    x0, y0 = (W - bw) / 2, H - 70 - bh
    dd.rectangle([x0, y0, x0 + bw, y0 + bh], fill=(11, 11, 12, 218))
    for i, l in enumerate(lines_):
        dd.text((W / 2, y0 + 14 + i * lh), l, font=cap_font, fill=(242, 239, 230, 255), anchor="ma")
    return im


overlays = []  # (png, t0, t1)
for i, seg in enumerate(segs):
    label = "Real mainnet session" + (f" · {seg['speed']:g}× speed" if seg["speed"] != 1 else "")
    p = os.path.join(WORK, f"pill{i}.png"); pill(label).save(p)
    overlays.append((p, seg["out_start"], seg["out_start"] + seg["out_len"]))
ci = 0
for start, dur, text in timed:
    sentences = [s.strip() for s in text.replace("? ", "?|").replace(". ", ".|").split("|") if s.strip()]
    chunks = []
    for s_ in sentences:
        ws = s_.split()
        step = 7 if len(ws) > 9 else len(ws)
        for a in range(0, len(ws), step):
            chunks.append(" ".join(ws[a:a + step]))
    total_chars = sum(len(c) for c in chunks)
    cur = start
    for c in chunks:
        span = dur * len(c) / total_chars
        p = os.path.join(WORK, f"cap{ci}.png"); caption(c).save(p); ci += 1
        overlays.append((p, cur, cur + span))
        cur += span

inputs = ["-i", base_mp4]
for p, _, _ in overlays:
    inputs += ["-i", p]
chain, last = [], "[0:v]"
for k, (_, a, b) in enumerate(overlays, start=1):
    out = f"[v{k}]"
    chain.append(f"{last}[{k}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'{out}")
    last = out
final = os.path.join(FILM, "reticle-demo.mp4")
run(["ffmpeg", "-v", "error", "-y"] + inputs + ["-i", audio, "-filter_complex", ";".join(chain), "-map", last, "-map", f"{len(overlays) + 1}:a",
     "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", str(SR),
     "-movflags", "+faststart", "-t", f"{TOTAL:.2f}", final])
print("wrote", final, f"{probe(final):.1f}s")

json.dump({"total": TOTAL, "segments": [{k: v for k, v in s.items()} for s in segs], "voice": [{"start": a, "dur": b, "text": c} for a, b, c in timed]},
          open(os.path.join(FILM, "edit-timeline.json"), "w"), indent=2)
