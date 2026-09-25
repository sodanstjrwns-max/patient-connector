#!/bin/bash
# split/*.jpg → final/*.jpg (폭<900이면 Real-ESRGAN x4, 최대 폭 2000, JPG q90)
cd "$(dirname "$0")/.."
RE=tools/realesrgan-ncnn-vulkan
for d in cases/*/; do
  mkdir -p "$d/final"
  for f in "$d"split/*.jpg; do
    [ -e "$f" ] || continue
    out="$d/final/$(basename "$f")"; [ -s "$out" ] && continue
    w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}')
    if [ "$w" -lt 900 ]; then
      $RE -i "$f" -o /tmp/up.png -n realesrgan-x4plus -s 4 -m tools/models >/dev/null 2>&1 && src=/tmp/up.png || src="$f"
    else src="$f"; fi
    python3 - "$src" "$out" <<'PY'
import sys; from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB')
if im.width>2000: im=im.resize((2000,int(im.height*2000/im.width)), Image.LANCZOS)
im.save(sys.argv[2], quality=90, subsampling=0)
PY
    echo "$out $w→$(sips -g pixelWidth "$out" | awk '/pixelWidth/{print $2}')"
  done
done
echo UPSCALE_DONE
