"""Build compact Formula E circuit silhouettes from archived circuit maps."""

from __future__ import annotations

import csv
import html
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "fedb-circuits.csv"
ASSET_DIR = ROOT / "frontend" / "assets" / "circuits"
WORK_DIR = ROOT / "tmp" / "pdfs" / "formula-e-circuits"
USER_AGENT = "Racelytic Formula E circuit asset builder/1.0"
SIMPLIFICATION_RATIO = 0.008

COMMONS_MAPS = {
    "beijing": "Beijing Formula E Circuit.png",
    "buenos-aires": "Puerto Madero Formula E Circuit.png",
    "long-beach": "Long Beach Formula E Circuit.png",
    "montreal": "Montreal Layout 2016.png",
    "moscow": "Moscow Street Circuit.png",
    "punta-del-este": "Punta del Este Formula E Circuit.png",
    "putrajaya": "Putrajaya Formula E Circuit.png",
    "zurich": "Zurich E Prix Layout.png",
}


def download(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size:
        return
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=45) as response, target.open("wb") as output:
                shutil.copyfileobj(response, output)
            return
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 3:
                raise
            time.sleep(2 ** attempt)


def source_for(row: dict[str, str]) -> tuple[str, str]:
    if row.get("layoutUrl"):
        return row["layoutUrl"], ".pdf"
    filename = COMMONS_MAPS[row["id"]]
    encoded = urllib.parse.quote(filename.replace(" ", "_"))
    return f"https://commons.wikimedia.org/wiki/Special:Redirect/file/{encoded}", ".png"


def render_source(source: Path, target: Path) -> None:
    if source.suffix.lower() != ".pdf":
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
        return
    renderer = shutil.which("pdftoppm")
    if not renderer:
        raise RuntimeError("pdftoppm is required to render official circuit-map PDFs")
    prefix = target.with_suffix("")
    subprocess.run([renderer, "-f", "1", "-singlefile", "-png", "-r", "150", str(source), str(prefix)], check=True)


def component_candidate(mask: np.ndarray) -> tuple[float, np.ndarray] | None:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    image_area = mask.shape[0] * mask.shape[1]
    best = None
    for label in range(1, count):
        x, y, width, height, area = stats[label]
        if area < max(80, image_area * 0.00008) or width < mask.shape[1] * 0.16 or height < mask.shape[0] * 0.045:
            continue
        box_area = width * height
        if box_area > image_area * 0.94:
            continue
        score = box_area + area * 2
        candidate = (score, labels == label)
        if best is None or score > best[0]:
            best = candidate
    return best


def track_mask(image: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    hue = hsv[:, :, 0]
    masks = [
        (saturation > 105) & (value > 45),
        (saturation > 65) & (value > 35),
        (gray < 80) & (np.max(rgb, axis=2) - np.min(rgb, axis=2) < 55),
    ]
    masks.extend((saturation > 70) & (value > 35) & (hue >= start) & (hue < start + 15)
                 for start in range(0, 180, 15))
    candidates = [candidate for mask in masks if (candidate := component_candidate(mask))]
    if not candidates:
        raise RuntimeError("no circuit-like connected component found")
    component = max(candidates, key=lambda item: item[0])[1].astype(np.uint8) * 255
    return cv2.morphologyEx(component, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))


def contour_svg(circuit_id: str, name: str, source_url: str, mask: np.ndarray) -> str:
    contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = [contour for contour in contours if abs(cv2.contourArea(contour)) >= 8]
    contour = max(contours, key=lambda item: cv2.arcLength(item, True))
    points = contour.reshape(-1, 2)
    minimum = points.min(axis=0).astype(float)
    maximum = points.max(axis=0).astype(float)
    extent = np.maximum(maximum - minimum, 1)
    scale = 420 / max(extent)
    offset = (np.array([500.0, 500.0]) - extent * scale) / 2 - minimum * scale
    # PDF circuit strokes contain tiny edge steps, marshal-post symbols and
    # anti-aliasing artifacts. A stronger RDP pass removes those bumps while
    # retaining the actual turns, then quadratic midpoint curves round the
    # remaining polygon joins without changing the overall silhouette.
    epsilon = max(1.2, cv2.arcLength(contour, True) * SIMPLIFICATION_RATIO)
    simplified = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
    transformed = simplified * scale + offset
    midpoints = (transformed + np.roll(transformed, -1, axis=0)) / 2
    commands = [f"M{midpoints[-1, 0]:.1f} {midpoints[-1, 1]:.1f}"]
    commands.extend(
        f"Q{point[0]:.1f} {point[1]:.1f} {midpoint[0]:.1f} {midpoint[1]:.1f}"
        for point, midpoint in zip(transformed, midpoints)
    )
    source = html.escape(source_url, quote=True)
    title = html.escape(f"{name} Formula E circuit outline")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500" role="img" aria-labelledby="title-{circuit_id}">\n'
            f'  <title id="title-{circuit_id}">{title}</title>\n'
            f'  <!-- Simplified from {source} -->\n'
            f'  <path d="{" ".join(commands)} Z" fill="none" stroke="#111318" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>\n'
            '</svg>\n')


def build_preview(items: list[tuple[str, np.ndarray]]) -> None:
    tile = 220
    columns = 6
    rows = (len(items) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile, rows * tile), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (name, mask) in enumerate(items):
        ys, xs = np.where(mask > 0)
        crop = Image.fromarray(mask[min(ys):max(ys) + 1, min(xs):max(xs) + 1]).convert("L")
        crop.thumbnail((tile - 24, tile - 42))
        x = index % columns * tile + (tile - crop.width) // 2
        y = index // columns * tile + 8
        sheet.paste(Image.new("RGB", crop.size, "#111318"), (x, y), crop)
        draw.text((index % columns * tile + 8, index // columns * tile + tile - 25), name, fill="black")
    sheet.save(WORK_DIR / "contact-sheet.png")


def main() -> int:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    previews = []
    with DATA_FILE.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        circuit_id = row["id"]
        url, suffix = source_for(row)
        source = WORK_DIR / f"{circuit_id}{suffix}"
        rendered = WORK_DIR / f"{circuit_id}.png"
        try:
            download(url, source)
            render_source(source, rendered)
            image = cv2.imread(str(rendered), cv2.IMREAD_COLOR)
            if image is None:
                raise RuntimeError("rendered image could not be read")
            mask = track_mask(image)
            target = ASSET_DIR / f"fe-{circuit_id}.svg"
            target.write_text(contour_svg(circuit_id, row["name"], url, mask), encoding="utf-8", newline="\n")
            previews.append((circuit_id, mask))
            print(f"built {target.relative_to(ROOT)}")
        except Exception as error:
            print(f"failed {circuit_id}: {error}", file=sys.stderr)
    build_preview(previews)
    if len(previews) != len(rows):
        raise RuntimeError(f"built {len(previews)} of {len(rows)} circuit SVGs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
