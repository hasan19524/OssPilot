#!/usr/bin/env python3
"""Typographic intro video for OSSPilot.

No application footage by design: this intro is points and music only
(see OSSPilot_30s_Intro plan). Renders 30.0s @ 30fps, 1920x1080.

Usage: python scripts/build_intro_frames.py [out_dir]
"""

import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FPS = 30
DURATION = 30.0
BG = (11, 15, 20)
TEAL = (47, 227, 200)
WHITE = (229, 231, 235)
GREY = (156, 163, 175)
DIM = (107, 114, 128)
BLUE = (125, 211, 252)
VIOLET = (167, 139, 250)
PINK = (244, 114, 182)
FONT_PATH = r"C:\Windows\Fonts\consola.ttf"

# (start, end, kind, payload)
SCENES = [
    (
        0.0,
        3.0,
        "title",
        {"title": "OSSPILOT", "sub": "open-source contribution agent", "accent": TEAL},
    ),
    (
        3.0,
        7.5,
        "line",
        {
            "lines": [
                "Open source is full of opportunities.",
                "Almost all of them are hard to reach.",
            ],
            "accent": WHITE,
        },
    ),
    (
        7.5,
        12.0,
        "line",
        {
            "lines": [
                "Find the issue that fits you",
                "from real repository intelligence.",
            ],
            "accent": TEAL,
        },
    ),
    (
        12.0,
        16.5,
        "line",
        {
            "lines": [
                "Understand an unfamiliar codebase",
                "before writing a single line.",
            ],
            "accent": BLUE,
        },
    ),
    (
        16.5,
        21.0,
        "line",
        {
            "lines": [
                "Contribute on the maintainer's terms,",
                "with your work in an isolated worktree.",
            ],
            "accent": VIOLET,
        },
    ),
    (
        21.0,
        25.0,
        "list",
        {
            "title": "OSSPILOT",
            "items": [
                "Local-first. Your terminal. Your credentials.",
                "GitHub intelligence you can verify.",
                "Nothing ships without your approval.",
            ],
            "accent": TEAL,
        },
    ),
    (
        25.0,
        30.0,
        "outro",
        {
            "title": "OSSPilot",
            "sub": "Discover.  Understand.  Contribute.",
            "url": "github.com/hasan19524/OssPilot",
            "accent": TEAL,
        },
    ),
]

FADE = 0.45


def font(size):
    return ImageFont.truetype(FONT_PATH, size)


def centered(draw, text, y, fnt, fill):
    w = draw.textlength(text, font=fnt)
    draw.text(((W - w) / 2, y), text, font=fnt, fill=fill)


def base_image():
    img = Image.new("RGB", (W, H), BG)
    return img


def draw_geometry(draw, t, accent):
    """Slow diagonal accent lines that drift — the only motion besides text."""
    for i in range(4):
        colour = [accent, BLUE, VIOLET, PINK][i]
        phase = (t * 0.08 + i * 0.25) % 1.0
        x = -200 + phase * (W + 500)
        draw.line([(x, 0), (x - 260, H)], fill=colour, width=2)


def vignette_image():
    """Precomputed radial vignette mask (cinematic falloff toward the edges)."""
    import math

    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    cx, cy = W / 2, H / 2
    max_r = math.hypot(cx, cy)
    for i in range(0, 256, 4):
        r = max_r * (i / 255.0)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255 - i)
    return mask


VIGNETTE = None
LETTERBOX = 96


def apply_cinematic(img):
    global VIGNETTE
    if VIGNETTE is None:
        VIGNETTE = vignette_image()
    bar = Image.new("RGB", (W, LETTERBOX), (0, 0, 0))
    img.paste(bar, (0, 0))
    img.paste(bar, (0, H - LETTERBOX))
    black = Image.new("RGB", (W, H), (0, 0, 0))
    darkened = Image.composite(img, black, VIGNETTE)
    return Image.blend(img, darkened, 0.45)


def render_scene(kind, payload, accent, t_local, scene_len):
    img = base_image()
    d = ImageDraw.Draw(img, "RGBA")
    draw_geometry(d, t_local, accent)

    # text rises subtly during the scene, then settles
    lift = int(10 * max(0.0, 1.0 - t_local / 2.2))

    # Letterbox the text block inward so nothing collides with the bars.
    shift = 0
    if kind == "title":
        centered(d, payload["title"], 430 + lift, font(180), accent)
        centered(d, payload["sub"], 660 + lift, font(52), GREY)
        d.rectangle([W / 2 - 140, 760 + lift, W / 2 + 140, 764 + lift], fill=accent)

    elif kind == "line":
        y = 400 + lift
        d.rectangle([W / 2 - 120, y, W / 2 + 120, y + 3], fill=accent)
        y += 60
        for i, text in enumerate(payload["lines"]):
            fnt = font(64) if i == 0 else font(46)
            colour = WHITE if i == 0 else GREY
            centered(d, text, y, fnt, colour)
            y += 110 if i == 0 else 90

    elif kind == "list":
        centered(d, payload["title"], 150 + lift, font(72), accent)
        d.rectangle([W / 2 - 120, 270 + lift, W / 2 + 120, 273 + lift], fill=accent)
        y = 360 + lift
        for item in payload["items"]:
            d.text((300, y), ">", font=font(48), fill=accent)
            d.text((380, y), item, font=font(52), fill=WHITE)
            y += 150

    elif kind == "outro":
        centered(d, payload["title"], 400 + lift, font(150), accent)
        centered(d, payload["sub"], 610 + lift, font(54), WHITE)
        centered(d, payload["url"], 720 + lift, font(36), GREY)
        d.rectangle([W / 2 - 160, 780 + lift, W / 2 + 160, 784 + lift], fill=accent)

    return apply_cinematic(img)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(".", "work")
    os.makedirs(out_dir, exist_ok=True)

    # Pre-render one image per scene (local motion is baked in at t=0).
    scenes = [
        render_scene(s[2], s[3], s[3]["accent"], 0.0, s[1] - s[0]) for s in SCENES
    ]

    total = int(DURATION * FPS)
    for index in range(total):
        t = index / FPS
        current = None
        for i, (start, end, _kind, _payload) in enumerate(SCENES):
            if start <= t < end:
                current = i
                break
        if current is None:
            current = len(SCENES) - 1

        img = scenes[current].copy()
        start, end = SCENES[current][0], SCENES[current][1]
        alpha = 1.0
        if t - start < FADE:
            alpha = (t - start) / FADE if current > 0 else 1.0
        elif end - t < FADE and current < len(SCENES) - 1:
            alpha = (end - t) / FADE
        if alpha < 1.0:
            alpha = max(0.0, min(1.0, alpha))
            black = Image.new("RGB", (W, H), BG)
            img = Image.blend(black, img, alpha)

        img.save(os.path.join(out_dir, f"frame_{index:05d}.png"))

    print(f"wrote {total} frames to {out_dir}")


if __name__ == "__main__":
    main()
