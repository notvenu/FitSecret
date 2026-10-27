"""Cut product photos out of their backgrounds so packs can stand on the homepage shelves.

Run with the site running (dev or prod), from apps/web:
    pip install "rembg[cpu]" pillow
    python scripts/shelf-cutouts.py http://localhost:3000

On Windows, set NUMBA_CACHE_DIR to a short folder first (e.g. %TEMP%\nbc): numba's cache path can pass the 260-char limit.

Reads the shelf product images from the homepage and the shop page (every product), removes each background (rembg, isnet model), trims to the pack,
and writes public/shelf/<hash>.webp plus lib/shelf-cutouts.json (image URL -> file). Already-cut images are skipped,
so re-run it after adding products in the POS. Packs without a cutout fall back to the framed photo.
"""
import hashlib, io, json, re, sys, urllib.parse, urllib.request
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
OUT, MANIFEST = ROOT / 'public' / 'shelf', ROOT / 'lib' / 'shelf-cutouts.json'
MAX_H = 520  # px; shelves show packs at most ~200px tall, so this covers 2x screens


def get(url: str) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()


def main(site: str) -> None:
    html = ''.join(get(site.rstrip('/') + page).decode('utf8', 'replace') for page in ('/', '/shop'))
    # the shelf packs carry data-shelf-src="<original image url>"
    urls = sorted({urllib.parse.unquote(u).replace('&amp;', '&') for u in re.findall(r'data-shelf-src="([^"]+)"', html)})
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    todo = [u for u in urls if u not in manifest or not (OUT / manifest[u]).exists()]
    print(f'{len(urls)} shelf images, {len(todo)} to cut')
    OUT.mkdir(parents=True, exist_ok=True)
    session = new_session('isnet-general-use')
    for i, url in enumerate(todo, 1):
        name = hashlib.sha1(url.encode()).hexdigest()[:12] + '.webp'
        try:
            img = remove(Image.open(io.BytesIO(get(url))).convert('RGB'), session=session, post_process_mask=True)
            box = img.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
            if not box:
                print(f'  [{i}/{len(todo)}] nothing found, skipped {url}'); continue
            img = img.crop(box)
            if img.height > MAX_H:
                img = img.resize((round(img.width * MAX_H / img.height), MAX_H), Image.LANCZOS)
            img.save(OUT / name, 'WEBP', quality=82, method=6)
            manifest[url] = name
            print(f'  [{i}/{len(todo)}] {name}')
            if i % 10 == 0: save(manifest)  # long runs survive an interruption
        except Exception as e:  # one bad image shouldn't stop the batch
            print(f'  [{i}/{len(todo)}] failed {url}: {e}')
    save(manifest)
    print(f'manifest: {len(manifest)} cutouts')


def save(manifest: dict) -> None:
    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1) + '\n')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000')
