#!/usr/bin/env python3
"""Rebuild game/assets/env from CC0 Poly Haven sources.

usage: python3 build_env_assets.py [download_dir]
Needs Pillow + numpy. Sources are downloaded once into download_dir
(default /tmp/ph); outputs are written next to this script.
"""
import json, os, sys, urllib.request, collections
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ph'
OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(SRC, exist_ok=True)

op = urllib.request.build_opener()
op.addheaders = [('User-Agent', 'Mozilla/5.0 env-asset-build')]
urllib.request.install_opener(op)
_files = {}


def fetch(asset, key, res, fmt='jpg', hdri=False):
    if asset not in _files:
        _files[asset] = json.load(urllib.request.urlopen('https://api.polyhaven.com/files/' + asset))
    files = _files[asset]
    e = files['hdri'][res][fmt] if hdri else files[key][res].get(fmt) or files[key][res]['jpg']
    path = os.path.join(SRC, os.path.basename(e['url']))
    if not os.path.exists(path):
        urllib.request.urlretrieve(e['url'], path)
    return path


def read_hdr(path):
    data = open(path, 'rb').read()
    i = 0
    while True:
        j = data.index(b'\n', i); line = data[i:j]; i = j + 1
        if line == b'':
            break
    j = data.index(b'\n', i); dims = data[i:j].split(); i = j + 1
    H, W = int(dims[1]), int(dims[3])
    img = np.zeros((H, W, 4), np.uint8); buf = memoryview(data)
    for y in range(H):
        if buf[i] == 2 and buf[i + 1] == 2:
            i += 4
            for c in range(4):
                x = 0
                while x < W:
                    n = buf[i]; i += 1
                    if n > 128:
                        n -= 128; img[y, x:x + n, c] = buf[i]; i += 1
                    else:
                        img[y, x:x + n, c] = np.frombuffer(buf[i:i + n], np.uint8); i += n
                    x += n
        else:
            img[y] = np.frombuffer(buf[i:i + W * 4], np.uint8).reshape(W, 4); i += W * 4
    e = img[..., 3].astype(np.int32)
    f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float32) * f[..., None]


def srgb(x):
    x = np.clip(x, 0, 1)
    return (np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055) * 255 + 0.5).astype(np.uint8)


def save_jpg(src, name, size, q=85):
    im = Image.open(src).convert('RGB')
    if im.size[0] != size:
        im = im.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(OUT, name), quality=q, optimize=True, progressive=True)


def largest_component(mask):
    """Mask of the largest 4-connected component (quarter-res labelling)."""
    s = 4
    m = mask[::s, ::s]
    H, W = m.shape; lab = np.zeros((H, W), np.int32); best, bestn, n = 0, 0, 0
    for y in range(H):
        for x in range(W):
            if m[y, x] and not lab[y, x]:
                n += 1; q = collections.deque([(y, x)]); lab[y, x] = n; cnt = 0
                while q:
                    cy, cx = q.popleft(); cnt += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
                if cnt > bestn:
                    best, bestn = n, cnt
    keep = Image.fromarray(((lab == best) * 255).astype(np.uint8)).resize(mask.shape[::-1], Image.NEAREST)
    keep = keep.filter(ImageFilter.MaxFilter(9))
    return np.array(keep) > 0


def cutout(diff, alpha, box, isolate=True):
    rgb = Image.open(diff).convert('RGB').crop(box)
    a = np.array(Image.open(alpha).convert('L').crop(box)).astype(np.float32)
    if isolate:
        a = a * largest_component(a > 100)
    return Image.merge('RGBA', (*rgb.split(), Image.fromarray(a.astype(np.uint8))))


def bleed(im):
    """Fill RGB under transparent pixels with nearby colour: no dark mip fringes."""
    a = np.array(im.split()[3]).astype(np.float32) / 255
    rgb = np.array(im.convert('RGB')).astype(np.float32)
    out = rgb.copy()
    filled = a > 0.5
    for r in (2, 4, 8, 16, 32, 64):
        bw = np.array(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
        bc = np.stack([np.array(Image.fromarray((rgb[..., c] * a).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))) for c in range(3)], -1).astype(np.float32)
        col = bc / np.maximum(bw[..., None], 1e-4)
        sel = (~filled) & (bw > 0.01)
        out[sel] = col[sel]; filled |= sel
    if (a > 0.5).any():
        out[~filled] = rgb[a > 0.5].mean(0)
    return Image.merge('RGBA', (*Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).split(), im.split()[3]))


BG_SCALE = 8.0   # background jpg stores linear/8 in sRGB; the game multiplies back via backgroundIntensity


def build_background():
    """4k LDR dome. The photo's hillside of green shrubs rises above the
    horizon and would float over the flat game floor, so everything below
    ~+15 deg is faded into the measured mist colour: distant trunks then
    emerge from fog exactly like the in-game fog does."""
    h = read_hdr(fetch('misty_pines', None, '4k', 'hdr', hdri=True))
    H, W = h.shape[:2]
    el = (0.5 - (np.arange(H) + 0.5) / H) * 180.0
    # mist = bright pixels between trunks in the misty valley, 2..12 deg up
    rows = (el > 2) & (el < 12)
    band = h[rows][:, int(W * 0.44):int(W * 0.58)].reshape(-1, 3)
    lum = band @ np.array([0.2126, 0.7152, 0.0722])
    mist = band[lum > np.percentile(lum, 70)].mean(0)
    t = np.clip((el - 5.0) / (16.0 - 5.0), 0, 1)
    t = (t * t * (3 - 2 * t))[:, None, None]
    out = h * t + mist[None, None, :] * (1 - t)
    Image.fromarray(srgb(out / BG_SCALE)).save(os.path.join(OUT, 'misty_pines_bg.jpg'), quality=84, optimize=True, progressive=True)
    print('mist linear rgb', mist.round(4).tolist())


def main():
    # HDRI: 1k RGBE for lighting, 4k LDR (linear/8, sRGB) for the background dome
    with open(fetch('misty_pines', None, '1k', 'hdr', hdri=True), 'rb') as f, open(os.path.join(OUT, 'misty_pines_1k.hdr'), 'wb') as g:
        g.write(f.read())
    build_background()

    # tileable PBR sets
    for asset, prefix, res in [('pine_bark', 'bark', 1024), ('forest_leaves_04', 'floor_a', 2048), ('forrest_ground_01', 'floor_b', 1024)]:
        save_jpg(fetch(asset, 'Diffuse', '2k'), prefix + '_diff.jpg', res, 86)
        save_jpg(fetch(asset, 'nor_gl', '2k'), prefix + '_nor.jpg', min(res, 1024), 90)
        save_jpg(fetch(asset, 'arm', '2k'), prefix + '_arm.jpg', min(res, 1024), 85)
    save_jpg(fetch('dry_branches_medium_01', 'Diffuse', '1k'), 'deadwood_diff.jpg', 512, 85)

    # pine twig spray card (1024², RGBA): twigs from pine_tree_01 on a drawn branch
    twig = cutout(fetch('pine_tree_01', 'twig_diff', '2k'), fetch('pine_tree_01', 'twig_alpha', '2k', 'png'), (70, 110, 434, 914))
    card = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    rnd = np.random.default_rng(7)
    d = ImageDraw.Draw(card)
    pts = [(24 + t * 960, 512 + 40 * np.sin(t * 2.4) - 30 * t) for t in np.linspace(0, 1, 24)]
    for k in range(len(pts) - 1):
        d.line([pts[k], pts[k + 1]], fill=(58, 46, 36, 255), width=int(16 - 11 * k / len(pts)))
    for k, t in enumerate(np.linspace(0.10, 0.95, 18)):
        x, y = pts[min(int(t * 23), 23)]
        side = 1 if k % 2 else -1
        ang = side * (35 + rnd.uniform(0, 35)) - 90       # twig points along the branch, fanned out
        sc = 0.34 + 0.24 * t + rnd.uniform(-0.05, 0.05)
        tw = twig.resize((int(twig.width * sc), int(twig.height * sc)), Image.LANCZOS)
        L = tw.height * 0.45                              # stem is at the bottom edge of the twig
        tw = tw.rotate(ang, expand=True, resample=Image.BICUBIC)
        a = np.radians(ang + 90)
        card.alpha_composite(tw, (int(x - tw.width / 2 + np.cos(a) * L), int(y - tw.height / 2 - np.sin(a) * L)))
    tip = twig.resize((int(twig.width * 0.55), int(twig.height * 0.55)), Image.LANCZOS).rotate(-90, expand=True, resample=Image.BICUBIC)
    card.alpha_composite(tip, (1024 - tip.width, int(pts[-1][1] - tip.height / 2)))
    bleed(card).save(os.path.join(OUT, 'pine_spray.webp'), quality=88, method=6)

    # fern frond card (256×1024): stem at the bottom
    fern = cutout(fetch('fern_02', 'Diffuse', '2k'), fetch('fern_02', 'Alpha', '2k', 'png'), (620, 40, 950, 1600))
    frond = Image.new('RGBA', (256, 1024), (0, 0, 0, 0))
    f2 = fern.resize((int(fern.width * 1024 / fern.height), 1024), Image.LANCZOS)
    frond.alpha_composite(f2, ((256 - f2.width) // 2, 0))
    bleed(frond).save(os.path.join(OUT, 'fern_frond.webp'), quality=88, method=6)

    # grass tuft atlas (1024×512, 2×2 cells): top row dry, bottom row green
    gd, gdry, ga = fetch('grass_medium_01', 'Diffuse', '2k'), fetch('grass_medium_01', 'dry_diff', '2k'), fetch('grass_medium_01', 'Alpha', '2k', 'png')
    atlas = Image.new('RGBA', (1024, 512), (0, 0, 0, 0))
    boxes = [(430, 1540, 970, 1830), (1230, 1550, 1700, 1776)]
    for row, diff in enumerate([gdry, gd]):
        for col, box in enumerate(boxes):
            t = cutout(diff, ga, box)
            s = min(500 / t.width, 250 / t.height)
            t = t.resize((int(t.width * s), int(t.height * s)), Image.LANCZOS)
            atlas.alpha_composite(t, (col * 512 + (512 - t.width) // 2, row * 256 + 256 - t.height - 2))
    bleed(atlas).save(os.path.join(OUT, 'grass_tufts.webp'), quality=88, method=6)


if __name__ == '__main__':
    main()
    tot = 0
    for f in sorted(os.listdir(OUT)):
        sz = os.path.getsize(os.path.join(OUT, f)); tot += sz
        print(f'{f:28s} {sz / 1024:8.0f} KB')
    print('total', round(tot / 1048576, 2), 'MB')
