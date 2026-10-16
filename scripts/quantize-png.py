"""Optional size pass for exported art: converts RGBA PNGs to 256-colour palette PNGs (with alpha).
Run by scripts/export-art.mjs when Python 3 + Pillow are available; skipped otherwise."""
import sys
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert('RGBA')
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(path, optimize=True)
