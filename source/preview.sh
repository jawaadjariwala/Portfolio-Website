#!/bin/bash
# Cheap visual + functional check for the portfolio.
#
#   source/preview.sh [state] [width] [crop]
#     state : home | menu | scrolled        (default home)
#     width : viewport width in px          (default 1440)
#     crop  : x,y,w,h region to zoom into   (default: whole viewport)
#
# Prints a text probe (layout numbers, rig health, JS errors) and writes ONE
# downscaled image to /tmp/preview.png. Read that single file instead of
# multiple full-size screenshots — image tokens scale with area, so a 560px-wide
# preview costs a fraction of a 1440px one.
#
# Prefer the text probe alone whenever the question is measurable (positions,
# overlap, transforms); only read the image when it needs a human eye.

set -e
cd "$(dirname "$0")/.."
STATE="${1:-home}"; W="${2:-1440}"; CROP="${3:-}"
OUT=/tmp/preview.png
TMP=$(mktemp -d)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

case "$STATE" in
  menu)     ACTION="document.getElementById('menuBtn').click();" ;;
  scrolled) ACTION="document.documentElement.style.scrollBehavior='auto'; window.scrollTo({top:1600,behavior:'instant'});" ;;
  *)        ACTION="" ;;
esac

python3 - "$TMP" "$ACTION" <<'EOF'
import sys
tmp, action = sys.argv[1], sys.argv[2]
html = open('index.html').read().replace('<head>', '<head><base href="http://localhost:8743/">', 1)
probe = """<script>
const T=(s)=>getComputedStyle(document.querySelector(s)).transform;
function pump(n){ let t=performance.now(); for(let i=0;i<n;i++){ t+=16; frame(t); } }
setTimeout(()=>{
  let err='none'; window.onerror=(m)=>{err=m};
  // finish every intro animation/transition (headless does not advance them on its own)
  document.getAnimations().forEach(a=>{a.currentTime=6000;a.pause();});
  document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in-view'));
  const before=(()=>{const r=document.querySelector('.hero h1').getBoundingClientRect();return Math.round(r.left)+','+Math.round(r.width);})();
  __ACTION__
  document.getAnimations().forEach(a=>{a.currentTime=6000;a.pause();});
  const after=(()=>{const r=document.querySelector('.hero h1').getBoundingClientRect();return Math.round(r.left)+','+Math.round(r.width);})();
  // portrait rig health: head must respond to the cursor and go dizzy
  hasPointer=true; tx=-1; ty=-1; lastPointerAt=performance.now()+1e9; pump(160);
  const track=T('#head');
  dizzyStart=performance.now(); dizzyUntil=dizzyStart+3000; pump(30);
  const stars=[...document.querySelectorAll('.star')].filter(s=>parseFloat(s.style.opacity||0)>0.05).length;
  dizzyUntil=0; pump(5);
  const nav=document.getElementById('nav').getBoundingClientRect();
  const port=document.getElementById('portraitStage').getBoundingClientRect();
  const d=document.documentElement;
  document.title=[
    'shift='+(before!==after),
    'navBottom='+Math.round(nav.bottom)+' portraitTop='+Math.round(port.top)+' overlap='+(port.top<nav.bottom),
    'hScroll='+(d.scrollWidth>d.clientWidth),
    'track='+track, 'stars='+stars, 'err='+err
  ].join(' | ');
},700);
</script>"""
open(f'{tmp}/p.html','w').write(html.replace('</body>', probe.replace('__ACTION__', action)+'</body>'))
EOF

echo "── $STATE @ ${W}px ──"
"$CHROME" --headless=new --window-size="$W",900 --virtual-time-budget=9000 \
  --dump-dom "file://$TMP/p.html" 2>/dev/null | grep -o "<title>[^<]*" | sed 's/<title>//' | tr '|' '\n' | sed 's/^ */  /'

"$CHROME" --headless=new --hide-scrollbars --window-size="$W",900 --virtual-time-budget=9000 \
  --screenshot="$TMP/shot.png" "file://$TMP/p.html" >/dev/null 2>&1

python3 - "$TMP" "$OUT" "$CROP" <<'EOF'
import sys
from PIL import Image
tmp, out, crop = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(f'{tmp}/shot.png').convert('RGB')
if crop:
    x, y, w, h = (int(v) for v in crop.split(','))
    im = im.crop((x, y, x + w, y + h))
im.thumbnail((560, 560), Image.LANCZOS)   # small on purpose: image tokens scale with area
im.save(out, optimize=True)
print(f'  image: {out} ({im.width}x{im.height})')
EOF
rm -rf "$TMP"
