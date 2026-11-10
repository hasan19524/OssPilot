import json
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1920, 1080
BG = (11, 15, 20)
TEAL = (47, 227, 200)
GREY = (156, 163, 175)
WHITE = (229, 231, 235)
DIM = (107, 114, 128)
PANEL = (17, 22, 28)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\consola.ttf",
    r"C:\Windows\Fonts\Consola.ttf",
    r"C:\Windows\Fonts\cour.ttf",
]

TMP = os.path.join(os.environ["LOCALAPPDATA"], "Temp", "opencode")


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


GLYPH_MAP = {
    "│": "|",
    "┃": "|",
    "┆": "|",
    "┊": "|",
    "─": "-",
    "━": "-",
    "═": "=",
    "╌": "-",
    "┄": "-",
    "┈": "-",
    "█": "#",
    "▓": "#",
    "▒": "#",
    "░": ".",
    "┌": "+",
    "┐": "+",
    "└": "+",
    "┘": "+",
    "┼": "+",
    "┬": "+",
    "┴": "+",
    "├": "+",
    "┤": "+",
    "•": "*",
    "▸": ">",
    "▹": ">",
    "◆": "*",
    "●": "*",
    "…": "...",
    "→": "->",
    "✓": "[ok]",
    "✗": "[x]",
    "★": "*",
    "×": "x",
    "—": "-",
    "–": "-",
    "\r": "",
}


# Characters that only appear as double-encoded mojibake (stars, emoji and
# smart quotes from GitHub issue titles). Dropped rather than rendered.
DROP = set("â˜…Â€™œ–—†‘’“”¨Ã¤")


def sanitize(text):
    """Render only ASCII (plus the mapped glyphs): the font we typeset with
    draws ASCII predictably, and GitHub titles are arbitrary text."""
    out = []
    for ch in text:
        if ch in GLYPH_MAP:
            out.append(GLYPH_MAP[ch])
        elif 0x20 <= ord(ch) <= 0x7E:
            out.append(ch)
    return "".join(out)


def wrap(term_lines, max_lines=34, max_cols=100):
    out = [sanitize(line)[:max_cols] for line in term_lines]
    while out and not out[0].strip():
        out.pop(0)
    while out and not out[-1].strip():
        out.pop()
    if len(out) <= max_lines:
        return out
    keep = out[: max_lines - 1]
    keep.append(f"... ({len(out) - max_lines + 1} more lines)")
    return keep


def put_line(draw, x, y, text, font, color):
    draw.text((x, y), text, font=font, fill=color)
    return y


def render_terminal_screen(
    label, lines, path, font, brand="osspilot", title="Plain terminal"
):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    d = ImageDraw.Draw(img)

    # top bar with the window title
    d.rectangle([(0, 0), (WIDTH, 34)], fill=(24, 29, 35))
    d.text((16, 6), f"  {title}", font=load_font(20), fill=GREY)

    # traffic-light dots (terminal chrome), right side
    for i, col in enumerate([(245, 89, 89), (245, 200, 89), (89, 245, 145)]):
        cx = WIDTH - 30 - i * 28
        d.ellipse([cx - 8, 9, cx + 8, 25], fill=col)

    # inner panel, like a terminal window with margin
    d.rectangle([(70, 90), (WIDTH - 70, HEIGHT - 70)], fill=PANEL)
    d.rectangle([(70, 90), (WIDTH - 70, HEIGHT - 70)], outline=(38, 45, 54), width=2)

    # titlebar inside the panel
    d.rectangle([(70, 90), (WIDTH - 70, 130)], fill=(20, 26, 32))
    d.text((96, 97), label, font=load_font(22), fill=GREY)

    y = 150
    header = load_font(26)
    body = load_font(24)
    for line in lines:
        if not line.strip():
            y += 8
            continue
        d.text((104, y), line, font=body, fill=WHITE)
        y += 34

    d.text((104, y + 24), f"$ {brand} ", font=header, fill=TEAL)

    img.save(path)
    return path


def render_card(title, sub, small, path):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    d = ImageDraw.Draw(img)
    accents = [
        (0.19, "#2FE3C8"),
        (0.4, "#7DD3FC"),
        (0.62, "#A78BFA"),
        (0.84, "#F472B6"),
    ]
    for x_frac, colour in accents:
        cx = int(WIDTH * x_frac)
        d.line(
            [(cx, 0), (cx + 120, 150), (cx, 300), (cx - 120, 150)], fill=colour, width=3
        )

    title_font = load_font(84 if len(title) < 24 else 64)
    tw = d.textlength(title, font=title_font)
    d.text(((WIDTH - tw) / 2, 360), title, font=title_font, fill=TEAL)

    if sub:
        sub_font = load_font(46)
        sw = d.textlength(sub, font=sub_font)
        d.text(((WIDTH - sw) / 2, 560), sub, font=sub_font, fill=WHITE)
    if small:
        s_font = load_font(34)
        items = small.split("   ")
        y = 680
        for item in items:
            iw = d.textlength(item, font=s_font)
            d.text(((WIDTH - iw) / 2, y), item, font=s_font, fill=GREY)
            y += 58
    d.text(
        (96, HEIGHT - 96),
        "github.com/hasan19524/OssPilot",
        font=load_font(30),
        fill=DIM,
    )
    img.save(path)
    return path


def render_stagechain(chain, path):
    return render_terminal_screen(
        "Contribution record (SQLite) - live stages from a real run",
        chain,
        path,
        None,
        brand="osspilot status",
        title="Windows PowerShell",
    )


def build_scenes(content):
    scenes = []

    def scene(kind, dur, **kw):
        kw["kind"] = kind
        kw["dur"] = dur
        scenes.append(kw)

    scene(
        "screen", 6.0, label="osspilot > /discover typescript", text=content["discover"]
    )
    scene(
        "card",
        6.0,
        title="Meet OSSPilot",
        sub="Your AI-powered, local-first open-source contribution agent",
    )
    scene(
        "screen",
        2.9,
        label="osspilot > /research octocat/Hello-World#1",
        text=content["research"],
    )
    scene(
        "screen",
        3.0,
        label="osspilot > find beginner-friendly issues in this repository",
        text=content["issues"],
    )
    scene(
        "screen",
        3.0,
        label="osspilot > explain this repository",
        text=content["explain"],
    )
    scene("screen", 1.0, label="osspilot - welcome", text=content["welcome"])
    scene(
        "card",
        8.0,
        title="Built with TypeScript, Bun, OpenTUI and SQLite",
        sub="Octokit   OpenCode   BharatCode   Multi-LLM",
        small="Explainable repository intelligence with an extensible AI-provider architecture",
    )
    scene(
        "screen",
        4.9,
        label="osspilot > /contribute octocat/Hello-World#1",
        text=content["contribute"],
    )
    scene(
        "chain",
        5.0,
        chain=[
            "DISCOVER              Contribution created",
            "ISSUE_ANALYSIS        Issue fetched",
            "WORKSPACE_CREATION    Worktree: contrib-1794307574761-5119792f",
            "AGENT_INVESTIGATION   Investigation started  (OpenCode, real provider call)",
            "CONTRIBUTION_PLAN     Investigation complete",
            "USER_APPROVAL_PLAN    Awaiting plan approval",
            "",
            "you: n      ->  decision recorded: Plan not approved",
            "result: stage PAUSED - no commit, no push, no PR",
        ],
    )
    scene("screen", 3.9, label="osspilot > /status", text=content["status"])
    scene("screen", 3.0, label="osspilot > /diff", text=content["diff"])
    scene(
        "card",
        3.0,
        title="OSSPilot",
        sub="Discover. Understand. Contribute.",
        small="",
    )
    return scenes


def main():
    content_path = (
        sys.argv[1] if len(sys.argv) > 1 else os.path.join(TMP, "video_content.json")
    )
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(TMP, "video_frames")
    os.makedirs(out_dir, exist_ok=True)

    with open(content_path, encoding="utf-8-sig") as fh:
        content = json.load(fh)

    body = load_font(24)

    total = 0.0
    for index, sc in enumerate(build_scenes(content)):
        path = os.path.join(out_dir, f"scene_{index:02d}.png")
        if sc["kind"] == "screen":
            render_terminal_screen(
                sc["label"], wrap(sc["text"].split("\n")), path, body
            )
        elif sc["kind"] == "chain":
            render_stagechain(sc["chain"], path)
        else:
            render_card(sc["title"], sc.get("sub", ""), sc.get("small", ""), path)
        frame_count = int(round(sc["dur"] * 30))
        for frame in range(frame_count):
            target = os.path.join(out_dir, f"seg{index:02d}_{frame:05d}.png")
            os.link(path, target)
        total += sc["dur"]
        print(f"scene {index:02d}  {sc['dur']:5.1f}s  {frame_count:4d} frames  {path}")

    with open(os.path.join(out_dir, "total.txt"), "w") as fh:
        fh.write(f"{total:.3f}\n")
    print(f"total {total:.1f}s -> {out_dir}")


if __name__ == "__main__":
    main()
