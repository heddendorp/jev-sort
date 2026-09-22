"""Render explanatory README animations. No API calls or credentials are used.

Install scripts/requirements-docs.txt, then run npm run docs:gifs.
Frames are drawn at 2x resolution and downsampled for readable type.
"""

from functools import lru_cache
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets"
WIDTH, HEIGHT, SCALE = 960, 600, 2
FRAME_MS = 80
BG, PANEL, CARD = "#0c1220", "#131e30", "#1b2940"
LINE, TEXT, MUTED = "#2b3a51", "#edf3ff", "#a7b6ce"
MINT, LILAC, BLUE, AMBER = "#76e3b4", "#b5a8ff", "#80c7ff", "#ffca80"
COLORS = [MINT, LILAC, BLUE, AMBER]


def find_font(candidates):
    for path in candidates:
        if Path(path).exists():
            return path
    raise RuntimeError("Install DejaVu Sans and DejaVu Sans Mono, or use the macOS system fonts.")


REGULAR = find_font([
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
])
BOLD = find_font([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
])
MONO = find_font([
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
])


@lru_cache(maxsize=64)
def font(size, face="regular"):
    return ImageFont.truetype({"regular": REGULAR, "bold": BOLD, "mono": MONO}[face], round(size * SCALE))


def rgb(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def blend(a, b, amount):
    return tuple(round(x + (y - x) * amount) for x, y in zip(rgb(a), rgb(b)))


def ease(value):
    value = min(1, max(0, value))
    return value * value * (3 - 2 * value)


class Canvas:
    def __init__(self):
        self.image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), BG)
        self.draw = ImageDraw.Draw(self.image)

    def box(self, x, y, w, h, fill=PANEL, outline=None, radius=12, stroke=1):
        self.draw.rounded_rectangle(
            tuple(round(v * SCALE) for v in (x, y, x + w, y + h)),
            radius=radius * SCALE, fill=fill, outline=outline, width=stroke * SCALE,
        )

    def text(self, x, y, value, size=16, color=TEXT, face="regular", max_width=None):
        f = font(size, face)
        width = self.draw.textlength(value, font=f) / SCALE
        if max_width is not None and width > max_width:
            raise ValueError(f"Text exceeds its column ({width:.0f} > {max_width}): {value}")
        if x + width > WIDTH - 12:
            raise ValueError(f"Text leaves the canvas: {value}")
        self.draw.text((round(x * SCALE), round(y * SCALE)), value, font=f, fill=color, anchor="lt")
        return width

    def centered(self, x, y, value, size=16, color=TEXT, face="regular"):
        width = self.draw.textlength(value, font=font(size, face)) / SCALE
        self.text(x - width / 2, y, value, size, color, face)

    def line(self, points, fill=LINE, width=1):
        self.draw.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=fill, width=width * SCALE)

    def dot(self, x, y, radius, fill):
        self.draw.ellipse(tuple(round(v * SCALE) for v in (x - radius, y - radius, x + radius, y + radius)), fill=fill)

    def finish(self):
        return self.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def header(c, section, title, subtitle):
    # Small compare-and-swap glyph, kept consistent across the illustrations.
    c.line([(38, 44), (61, 44)], MINT, 3)
    c.line([(38, 55), (61, 55)], LILAC, 3)
    c.dot(43, 44, 4, MINT)
    c.dot(56, 55, 4, LILAC)
    c.text(73, 34, "jev-sort", 28, TEXT, "bold")
    c.box(707, 33, 215, 29, fill=PANEL, outline=LINE, radius=14)
    c.centered(814, 41, section, 11, MUTED, "bold")
    c.text(38, 93, title, 31, TEXT, "bold", max_width=885)
    c.text(39, 139, subtitle, 16, MUTED, max_width=885)


TICKETS = [
    ("UI-14", "A blurry profile icon", "Cosmetic issue", BLUE),
    ("PAY-22", "Checkout is failing", "Revenue is blocked", MINT),
    ("DOC-08", "Add a guide screenshot", "Documentation request", LILAC),
    ("AUTH-31", "A user cannot sign in", "A workaround exists", AMBER),
]
SORTED_IDS = [1, 3, 0, 2]


def fuzzy_frame(t):
    c = Canvas()
    header(c, "01 / FUZZY SORTING", "A sorting rule. In your own words.",
           "Give Jev a rule and some context. Get a new array in a useful order.")

    c.box(36, 183, 434, 311, outline=LINE)
    c.text(55, 203, "THE CALL", 11, MUTED, "bold")
    code = [
        ("const sorted = await jevSort(", TEXT),
        ("  tickets,", TEXT),
        ('  "Most urgent first",', MINT),
        ("  { context }", LILAC),
        (");", TEXT),
    ]
    for i, (line, color) in enumerate(code):
        c.text(55, 233 + i * 23, line, 15, color, "mono", max_width=397)

    context_active = 1.3 <= t < 4.3
    c.box(51, 365, 404, 113, fill=BG, outline=LILAC if context_active else LINE)
    c.text(66, 380, "context", 13, LILAC, "mono")
    c.text(66, 405, "An online store. Prioritize lost revenue,", 16, TEXT, max_width=375)
    c.text(66, 430, "then blocked users, then cosmetic issues.", 16, TEXT, max_width=375)

    c.box(490, 183, 434, 311, outline=LINE)
    complete = t >= 6.2
    c.text(510, 203, "sorted" if complete else "tickets → sorted", 14, MINT if complete else TEXT, "mono")
    status = "NEW ARRAY" if complete else "COMPARING" if t >= 2.8 else "INPUT ORDER"
    c.text(798, 205, status, 10, MINT if complete else MUTED, "bold")

    for original, (code, title, note, color) in enumerate(TICKETS):
        amount = ease((t - 4.5 - original * 0.065) / 1.1)
        target = SORTED_IDS.index(original)
        position = original + (target - original) * amount
        y = 233 + position * 61
        x = 505 + math.sin(amount * math.pi) * (7 if original % 2 else -7)
        c.box(x, y, 404, 53, fill=CARD, outline=blend(LINE, color, 0.5) if t >= 2.8 else LINE, radius=8)
        c.box(x + 1, y + 9, 3, 35, fill=color, radius=1)
        c.text(x + 15, y + 10, title, 16, TEXT, "bold", max_width=269)
        c.text(x + 15, y + 33, note, 11, MUTED)
        c.text(x + 328, y + 13, code, 11, color, "mono", max_width=75)

    c.box(36, 512, 888, 39, fill=PANEL, outline=LINE, radius=8)
    c.text(51, 525, "Original array", 13, MUTED)
    c.text(164, 524, "UI-14  →  PAY-22  →  DOC-08  →  AUTH-31", 13, TEXT, "mono")
    c.text(794, 525, "UNCHANGED", 11, MINT, "bold")

    if t < 1.3:
        caption = "01  Start with the items you already have."
    elif t < 2.8:
        caption = "02  Add the priorities that make this order meaningful."
    elif t < 4.5:
        caption = "03  Jev compares independent pairs in batches."
    elif t < 6.2:
        caption = "04  The network combines those judgments into an order."
    else:
        caption = "Fresh array. Same objects. Your original order stays intact."
    c.text(38, 571, caption, 14, MINT if complete else MUTED)
    c.text(773, 573, "ILLUSTRATIVE PLAYBACK", 9, MUTED)
    return c.finish()


TRACE = json.loads((OUT / "network-trace.json").read_text())


def parallel_frame(t):
    c = Canvas()
    header(c, "02 / PARALLEL COMPARISONS", "Many comparisons. One request.",
           "Independent questions run together. Each stage builds on the previous one.")
    start, stage_seconds = 0.8, 1.68
    done = t >= start + stage_seconds * len(TRACE["stages"])
    stage_index = min(len(TRACE["stages"]) - 1, max(0, int((t - start) / stage_seconds)))
    phase = max(0, t - start - stage_index * stage_seconds)
    stage = TRACE["stages"][stage_index]
    movement = 1 if done else ease((phase - 0.94) / 0.58)
    answered = done or phase >= 0.66

    c.text(39, 191, "SORTING 8 NUMBERS", 11, MUTED, "bold")
    c.text(659, 190, 'rule: "Smallest first"', 13, MINT, "mono")

    for pair_index, pair in enumerate(stage["pairs"]):
        color = COLORS[pair_index]
        for wire, destination in [(pair["left"], pair["right"]), (pair["right"], pair["left"])]:
            destination = destination if pair["swap"] else wire
            x = 79 + (wire + (destination - wire) * movement) * 114
            arc = math.sin(movement * math.pi) if pair["swap"] else 0
            y = 248 + arc * (24 if wire == pair["left"] else -24)
            c.box(x - 26, y - 23, 52, 46, fill=CARD, outline=MINT if done else color, radius=10, stroke=2)
            c.centered(x, y - 12, str(stage["before"][wire]), 26, MINT if done else TEXT, "bold")

    c.box(36, 301, 888, 144, fill=PANEL, outline=MINT if not done and t >= start else LINE)
    c.text(54, 316, "ONE TYPESAFE REQUEST", 11, MINT, "bold")
    c.text(624, 315, "same context · independent questions", 12, MUTED)

    for i, pair in enumerate(stage["pairs"]):
        x = 51 + i * 216
        color = COLORS[i]
        c.box(x, 343, 209, 86, fill=BG, outline=color if t >= start else LINE, radius=9)
        c.text(x + 12, 357, f"{pair['a']}  vs  {pair['b']}", 19, TEXT, "mono")
        if answered:
            c.text(x + 12, 389, f"{min(pair['a'], pair['b'])} comes first", 14, color)
        else:
            c.text(x + 12, 390, "Comparing" if t >= start else "Ready", 13, MUTED)
            if t >= start:
                c.dot(x + 177, 398, 3 + math.sin(phase * 12) * 1.5, color)

    c.box(36, 465, 888, 74, fill=PANEL, outline=LINE)
    c.text(53, 479, "SORTED" if done else f"STAGE {stage_index + 1} / 6", 12, MINT if done else TEXT, "bold")
    for i in range(6):
        c.box(168 + i * 39, 480, 27, 7, fill=MINT if done or i < stage_index else LILAC if i == stage_index else LINE, radius=3)
    if done:
        message = f"{TRACE['comparisons']} comparisons in {TRACE['requests']} batched requests."
    elif t < start:
        message = "Four independent pairs are ready for the first batch."
    elif phase < 0.66:
        message = "All four questions are evaluated in parallel."
    elif phase < 0.94:
        message = "Four answers return together."
    else:
        message = "The network routes the answers into the next stage."
    c.text(53, 507, message, 16, MINT if done else MUTED)
    c.text(39, 562, "Actual network schedule · illustrative timing · numeric judgments", 13, MUTED)
    c.text(39, 583, "Larger stages can also split into several concurrent requests.", 11, MUTED)
    return c.finish()


def render(name, frame, duration, poster_time, checkpoints):
    count = math.ceil(duration * 1000 / FRAME_MS)
    # One palette across all frames avoids color flicker, including antialiased edges.
    samples = [frame(t) for t in checkpoints]
    atlas = Image.new("RGB", (WIDTH, HEIGHT * len(samples)))
    for i, sample in enumerate(samples):
        atlas.paste(sample, (0, HEIGHT * i))
    palette = atlas.quantize(colors=192, method=Image.Quantize.MEDIANCUT)
    frames = [frame(i * FRAME_MS / 1000).quantize(palette=palette, dither=Image.Dither.NONE) for i in range(count)]
    path = OUT / f"{name}.gif"
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
    frame(poster_time).save(OUT / f"{name}.png", optimize=True)
    # Decode the actual GIF for the contact sheet, so QA also catches palette/disposal bugs.
    sheet = Image.new("RGB", (WIDTH, HEIGHT * len(checkpoints)))
    with Image.open(path) as gif:
        elapsed = 0
        selected = 0
        for index in range(gif.n_frames):
            gif.seek(index)
            elapsed += gif.info.get("duration", FRAME_MS)
            while selected < len(checkpoints) and elapsed >= checkpoints[selected] * 1000:
                sheet.paste(gif.convert("RGB"), (0, HEIGHT * selected))
                selected += 1
        assert gif.info.get("loop") == 0
        assert selected == len(checkpoints)
    sheet.resize((768, 480 * len(checkpoints))).save(Path("/tmp") / f"{name}-contact.png")
    assert path.stat().st_size < 2_000_000, f"Keep README media lightweight: {path}"
    print(f"{path.relative_to(ROOT)}: {path.stat().st_size / 1024:.0f} KiB, {elapsed / 1000:.1f}s")


if __name__ == "__main__":
    render("fuzzy-sort", fuzzy_frame, 10.4, 8.0, [0, 2, 5.1, 8])
    render("parallel-sort", parallel_frame, 13.2, 12, [0.3, 1.6, 4.9, 8.3, 12])
