document.documentElement.classList.add('js');
requestAnimationFrame(() => document.body.classList.add('intro-ready'));

// The tagline is sized so it spans exactly the width of the name line above it.
function fitTagline(){
  const name = document.getElementById('nameLine'), tag = document.getElementById('tagLine');
  if (!name || !tag) return;
  tag.style.fontSize = '';
  const ratio = name.getBoundingClientRect().width / tag.getBoundingClientRect().width;
  tag.style.fontSize = (parseFloat(getComputedStyle(tag).fontSize) * ratio).toFixed(2) + 'px';
}
document.fonts.ready.then(fitTagline);
window.addEventListener('resize', fitTagline);

// ---------- Menu ----------
const menuBtn = document.getElementById('menuBtn');
const menuClose = document.getElementById('menuClose');
const overlay = document.getElementById('menuOverlay');

function setMenu(open){
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  menuBtn.setAttribute('aria-expanded', String(open));
  document.documentElement.style.overflow = open ? 'hidden' : '';
}

menuBtn.addEventListener('click', () => setMenu(true));
menuClose.addEventListener('click', () => setMenu(false));
overlay.querySelectorAll('.menu-item').forEach(a => {
  a.addEventListener('click', () => setMenu(false));
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) setMenu(false); });

// ---------- Header scrim: fade content into the header once the page moves ----------
let scrimOn = false;
function syncScrim(){
  const on = window.scrollY > 24;
  if (on !== scrimOn){ scrimOn = on; document.body.classList.toggle('scrolled', on); }
}
// ---------- Section themes: the palette follows whichever section holds the viewport's middle ----------
const themedSections = [...document.querySelectorAll('section[data-theme]')];
let currentTheme = '';
function syncTheme(){
  const mid = window.innerHeight * 0.5;
  let name = themedSections.length ? themedSections[0].dataset.theme : '';
  for (const sec of themedSections){
    if (sec.getBoundingClientRect().top <= mid) name = sec.dataset.theme;
  }
  if (name !== currentTheme){ currentTheme = name; document.documentElement.dataset.theme = name; }
}
// ---------- Timeline rail: drawn from 0 to 1 as the timeline crosses the viewport ----------
const timeline = document.querySelector('.timeline');
// (reduceMotion is declared further down, after this block has already run once)
const railReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function syncTimeline(){
  if (!timeline) return;
  if (railReduced){ timeline.style.setProperty('--tl-progress', '1'); return; }
  const r = timeline.getBoundingClientRect(), vh = window.innerHeight;
  // starts when the rail's top reaches 80% down the screen, done when its bottom reaches 55%
  const p = (vh * 0.8 - r.top) / (r.height + vh * 0.25);
  timeline.style.setProperty('--tl-progress', clamp(p, 0, 1).toFixed(3));
}
function onScroll(){ syncScrim(); syncTheme(); syncTimeline(); }
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', syncTheme);
onScroll();

// ---------- Scroll reveal ----------
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i % 5, 4) * 70}ms`;
  io.observe(el);
});

// ---------- Portrait rig: static body; head, brows, eyes and mouth move together ----------
const stage = document.getElementById('portraitStage');
const head = document.getElementById('head');
const browLeft = document.getElementById('browLeft');
const browRight = document.getElementById('browRight');
const mouth = document.getElementById('mouth');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Native (source-pixel) sizes of the feature crops, so travel can be expressed in % of each crop.
const BROW_H = 67, MOUTH_H = 49;
// Tilting a phone is coarser than moving a cursor, so the head travels a little
// further there. Kept under 1 degree of tilt, the envelope verified as seam-safe.
const HEAD_GAIN = window.matchMedia('(hover: none), (pointer: coarse)').matches ? 1.35 : 1;

let tx = 0, ty = 0;        // target pointer position, -1..1
let cx = 0, cy = 0;        // current (lerped)
let lastPointerAt = 0;
let hasPointer = false;

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function onPointer(clientX, clientY){
  const r = stage.getBoundingClientRect();
  const px = r.left + r.width / 2;
  const py = r.top + r.height * 0.42;
  // Full deflection a quarter-viewport away from the portrait, so the gaze commits early.
  tx = clamp((clientX - px) / (window.innerWidth * 0.3), -1, 1);
  ty = clamp((clientY - py) / (window.innerHeight * 0.35), -1, 1);
  lastPointerAt = performance.now();
  hasPointer = true;
  noteQuadrant(clientX - px, clientY - py);
}

// ---------- Dizzy easter egg: circle the cursor around the portrait a few times ----------
const starsBack = [...document.querySelectorAll('#starsBack .star')];
const starsFront = [...document.querySelectorAll('#starsFront .star')];
let dizzyStart = 0, dizzyUntil = 0, lastDizzyEnd = -1e9, lastQuad = -1, quadChanges = [];
const DIZZY_MS = 3000;

function noteQuadrant(dx, dy){
  if (isTouch) return;          // taps are not a circling gesture; phones use shake
  const q = (dx < 0 ? 0 : 1) + (dy < 0 ? 0 : 2);
  if (q === lastQuad) return;
  lastQuad = q;
  const now = performance.now();
  quadChanges = quadChanges.filter(t0 => now - t0 < 2400);
  quadChanges.push(now);
  if (quadChanges.length >= 7 && now > dizzyUntil && now > lastDizzyEnd + 6000){
    dizzyStart = now; dizzyUntil = now + DIZZY_MS; quadChanges = [];
    setHint('be gentle !', '58%');
  }
}

function renderDizzy(now){
  const e = (now - dizzyStart) / 1000;
  const env = e < 2.4 ? Math.min(1, e / 0.25) : Math.max(0, (3 - e) / 0.6);   // ease in, hold, ease out
  // gentle wobble: mostly a nod with a small tilt, so the jaw corners stay on the neck lines
  const wob = Math.sin(e * Math.PI * 2 * 0.9) * 1.1 * env;
  const bob = (1.5 + Math.sin(e * Math.PI * 2 * 0.9 + 1) * 1.5) * env;
  head.style.transform = `translate(${(Math.sin(e * 4) * 0.5 * env).toFixed(2)}px, ${bob.toFixed(2)}px) rotate(${wob.toFixed(2)}deg)`;
  // confused: one brow down and knitted, the other up; the smile relaxes into a shallow, slightly
  // lopsided frown (pinned at the moustache end, so the left corner dips a touch more)
  browLeft.style.transform  = `translateY(${(3 / BROW_H * 100 * env).toFixed(2)}%) rotate(${(5 * env).toFixed(2)}deg)`;
  browRight.style.transform = `translateY(${(-6 / BROW_H * 100 * env).toFixed(2)}%) rotate(${(-3 * env).toFixed(2)}deg)`;
  mouth.style.transform = `translateY(${(2 / MOUTH_H * 100 * env).toFixed(2)}%) scale(${(1 - 0.06 * env).toFixed(3)}, ${(1 - 1.65 * env).toFixed(3)})`;
  // eyes roll
  stage.style.setProperty('--ex', (Math.cos(e * 5) * 0.9 * env).toFixed(3));
  stage.style.setProperty('--ey', (Math.sin(e * 5) * 0.6 * env).toFixed(3));
  // three stars on an ellipse around the crown; behind the head at the back of the orbit
  for (let i = 0; i < 3; i++){
    const a = e * 1.5 + i * Math.PI * 2 / 3;
    const x = 49 + 27 * Math.cos(a), y = 18 + 7 * Math.sin(a);
    const front = Math.sin(a) > 0;
    const s = (0.65 + 0.4 * (Math.sin(a) + 1) / 2) * env;
    const tf = `translate(-50%, -50%) rotate(${(e * 90 + i * 40).toFixed(0)}deg) scale(${s.toFixed(3)})`;
    [starsBack[i], starsFront[i]].forEach((el, k) => {
      const show = (k === 1) === front;
      el.style.opacity = show ? env.toFixed(3) : '0';
      el.style.left = x + '%'; el.style.top = y + '%'; el.style.transform = tf;
    });
  }
}
function hideStars(){ [...starsBack, ...starsFront].forEach(el => { el.style.opacity = '0'; }); }

// The curved hint swaps to "be gentle!" while dizzy, then back.
const hint = document.querySelector('.portrait-hint');
const hintText = document.querySelector('.portrait-hint textPath');
const HINT_DEFAULT = { text: hintText.textContent, offset: hintText.getAttribute('startOffset'), len: '88' };
// Whichever line the hint returns to once a reaction finishes. On a phone this
// advances from "tap, then tilt me" to the shake bait once he has been tilted.
let restHint = HINT_DEFAULT;

function writeHint(h){
  hintText.textContent = h.text;
  hintText.setAttribute('startOffset', h.offset);
  if (h.len) hintText.setAttribute('textLength', h.len); else hintText.removeAttribute('textLength');
}
function setHint(text, offset, len){
  hint.classList.add('is-swapping');
  setTimeout(() => {
    writeHint({ text: text, offset: offset, len: len || (text === HINT_DEFAULT.text ? '88' : null) });
    hint.classList.remove('is-swapping');
  }, 200);
}

// ---------- Phones: tilt to look around, shake to confuse ----------
// Feeds the same tx/ty the mouse does, so the rig itself is unchanged.
const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
const needsMotionPerm = typeof DeviceOrientationEvent !== 'undefined'
  && typeof DeviceOrientationEvent.requestPermission === 'function';

const HINT_TAP   = { text: needsMotionPerm ? 'tap, then tilt me' : 'tilt me around', offset: '16%' };
const HINT_TILT  = { text: 'don\u2019t shake too hard please', offset: '8%' };
const HINT_SHAKE = { text: 'ugh\u2026 why !', offset: '26%' };
const HINT_RETRY  = { text: 'tap again to allow me', offset: '12%' };
const HINT_BLOCKED = { text: 'motion is off in settings', offset: '10%' };

let tiltBase = null, tiltLive = false, tiltAnnounced = false;

function onTilt(e){
  if (e.beta == null && e.gamma == null) return;
  // Re-map the axes when the phone is held in landscape.
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let lr = e.gamma || 0, fb = e.beta || 0;
  if (angle === 90){ const t = lr; lr = fb; fb = -t; }
  else if (angle === 270 || angle === -90){ const t = lr; lr = -fb; fb = t; }
  // People hold a phone at roughly 45 degrees, so the first reading is neutral.
  if (!tiltBase){ tiltBase = { lr: lr, fb: fb }; return; }
  const dlr = lr - tiltBase.lr, dfb = fb - tiltBase.fb;
  tx = clamp(dlr / 12, -1, 1);          // ~12 deg of tilt is full deflection
  ty = clamp(dfb / 12, -1, 1);
  lastPointerAt = performance.now();
  hasPointer = true;
  if (!tiltAnnounced && (Math.abs(dlr) > 8 || Math.abs(dfb) > 8)){
    tiltAnnounced = true;
    restHint = HINT_TILT;
    setHint(HINT_TILT.text, HINT_TILT.offset);
  }
}

let lastMag = null, shakeHits = [];
function onShake(e){
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
  const now = performance.now();
  if (lastMag !== null && Math.abs(mag - lastMag) > 12){
    shakeHits = shakeHits.filter(t0 => now - t0 < 900);
    shakeHits.push(now);
    if (shakeHits.length >= 4 && now > dizzyUntil && now > lastDizzyEnd + 4000){
      shakeHits = [];
      dizzyStart = now; dizzyUntil = now + DIZZY_MS;
      setHint(HINT_SHAKE.text, HINT_SHAKE.offset);
    }
  }
  lastMag = mag;
}

function enableMotion(){
  if (tiltLive) return;
  tiltLive = true;
  window.addEventListener('deviceorientation', onTilt, { passive: true });
  window.addEventListener('devicemotion', onShake, { passive: true });
}

if (isTouch){
  restHint = HINT_TAP;
  writeHint(HINT_TAP);
  if (needsMotionPerm){
    // iOS gates orientation AND motion separately, and only from a real gesture.
    stage.classList.add('is-tappable');
    let denials = 0;
    // iOS shows its dialog only once per page load, so a cancel has to leave a
    // way back: retry on the next tap, then say to reload if that is refused too.
    stage.addEventListener('click', function grant(){
      if (tiltLive) return;
      const askedAt = performance.now();
      Promise.resolve(DeviceOrientationEvent.requestPermission())
        .then(res => {
          if (res !== 'granted') return null;
          return (typeof DeviceMotionEvent !== 'undefined'
            && typeof DeviceMotionEvent.requestPermission === 'function')
            ? DeviceMotionEvent.requestPermission().catch(() => 'denied')
            : 'granted';
        })
        .then(motionRes => {
          if (motionRes === null){
            // A dialog a human dismissed takes time; an instant refusal means iOS
            // never showed one (permission already denied for the site, or Motion
            // & Orientation Access is off in Safari's settings).
            if (performance.now() - askedAt < 350){
              restHint = HINT_BLOCKED;
              const help = document.getElementById('motionHelp');
              if (help) help.hidden = false;
            } else {
              denials++;
              restHint = HINT_RETRY;
              if (denials >= 2){
                restHint = HINT_BLOCKED;
                const help2 = document.getElementById('motionHelp');
                if (help2) help2.hidden = false;
              }
            }
            setHint(restHint.text, restHint.offset);
            return;
          }
          enableMotion();
          restHint = HINT_TAP;                   // until an actual tilt swaps it
          setHint(HINT_TAP.text, HINT_TAP.offset);
          stage.classList.remove('is-tappable');
          stage.removeEventListener('click', grant);
        })
        .catch(() => {});                        // unsupported: idle wander continues
    });
  } else {
    enableMotion();                              // Android over HTTPS needs no prompt
  }
}

// ---------- Cursor: the outline rides the real pointer; the fill chases it ----------
const cursorEl = document.getElementById('cursor');
const cursorOK = !!cursorEl && !reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let curX = -100, curY = -100, fillX = -100, fillY = -100, curScale = 1, overLink = false;
if (cursorOK){
  document.documentElement.classList.add('has-cursor');
  const lineSvg = cursorEl.querySelector('.cursor-line'), fillSvg = cursorEl.querySelector('.cursor-fill');
  window.addEventListener('mousemove', e => {
    curX = e.clientX; curY = e.clientY;
    overLink = !!(e.target && e.target.closest && e.target.closest('a, button, [role="button"], .is-tappable'));
    // the outline moves with zero lag, straight from the event
    lineSvg.style.transform = `translate(${curX}px, ${curY}px) scale(${curScale.toFixed(3)})`;
    cursorEl.classList.add('is-on');
  }, { passive: true });
  document.addEventListener('mouseleave', () => cursorEl.classList.remove('is-on'));
  document.addEventListener('mouseenter', () => cursorEl.classList.add('is-on'));
  window.__cursorTick = function(){
    // resting offset is the print device (3px down-right); over a link it snaps into register
    const ox = overLink ? 0 : 3, oy = overLink ? 0 : 3;
    fillX += (curX + ox - fillX) * 0.3;
    fillY += (curY + oy - fillY) * 0.3;
    // "overflows a bit": cap how far the fill may trail so it never detaches
    const dx = fillX - curX, dy = fillY - curY, d = Math.hypot(dx, dy), cap = 26;
    if (d > cap){ fillX = curX + dx / d * cap; fillY = curY + dy / d * cap; }
    curScale += ((overLink ? 1.18 : 1) - curScale) * 0.2;
    fillSvg.style.transform = `translate(${fillX.toFixed(2)}px, ${fillY.toFixed(2)}px) scale(${curScale.toFixed(3)})`;
    lineSvg.style.transform = `translate(${curX}px, ${curY}px) scale(${curScale.toFixed(3)})`;
  };
}

window.addEventListener('mousemove', e => onPointer(e.clientX, e.clientY), { passive: true });
window.addEventListener('touchmove', e => {
  if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

// When idle (or on touch devices), the eyes wander gently so the portrait still feels alive.
function idleTarget(t){
  const s = t / 1000;
  return {
    x: Math.sin(s * 0.55) * 0.55 + Math.sin(s * 1.3) * 0.15,
    y: Math.sin(s * 0.8 + 1.2) * 0.25,
  };
}

function frame(t){
  const idle = !hasPointer || (t - lastPointerAt > 3500);
  let gx = tx, gy = ty;
  if (idle){
    const it = idleTarget(t);
    gx = it.x; gy = it.y;
  }
  const ease = idle ? 0.03 : 0.09;
  cx += (gx - cx) * ease;
  cy += (gy - cy) * ease;
  if (window.__cursorTick) window.__cursorTick();

  if (t < dizzyUntil && !reduceMotion){
    renderDizzy(t);
    requestAnimationFrame(frame);
    return;
  }
  if (lastDizzyEnd < dizzyStart && dizzyUntil){ lastDizzyEnd = t; hideStars(); setHint(restHint.text, restHint.offset, restHint.len); }

  const up = Math.max(0, -cy), down = Math.max(0, cy);
  if (!reduceMotion){
    // Flat, hand-drawn feel: the head only nudges a few pixels and tilts a couple of degrees,
    // hinged at the chin so the jaw stays on the neck. Tilt leans toward the cursor and a
    // little more toward the corners (Robb Owen-style x*y rotation).
    // Head only (cut at the jaw); the neck is static. Pivot at the chin, so the jaw corners move
    // almost purely vertically — a vertical nudge never shows at the neck lines. Sideways travel is
    // kept sub-pixel so the jaw never slides across them.
    const headX = cx * 0.6 * HEAD_GAIN;
    const headY = (cy < 0 ? cy * 1 : cy * 3) * HEAD_GAIN;
    const tilt = -cx * 0.7 * HEAD_GAIN;
    head.style.transform = `translate(${headX.toFixed(2)}px, ${headY.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg)`;

    // Brows only ever move UP (away from the glasses).
    const browY = -up * 5 / BROW_H * 100;                       // % of crop height
    browLeft.style.transform  = `translateY(${browY.toFixed(2)}%)`;
    browRight.style.transform = `translateY(${browY.toFixed(2)}%)`;

    // Mouth: pinned at its right end where it meets the moustache; the smile deepens looking up
    // and relaxes flat looking down.
    const mouthSX = 1 + up * 0.05;
    const mouthSY = 1 + up * 0.15 - down * 0.3;
    const mouthY = down * 1.5 / MOUTH_H * 100;
    mouth.style.transform = `translateY(${mouthY.toFixed(2)}%) scale(${mouthSX.toFixed(3)}, ${mouthSY.toFixed(3)})`;
  }
  // Eyes do most of the looking; upward travel is capped so the iris stays under the lid.
  stage.style.setProperty('--ex', clamp(cx, -1, 1).toFixed(3));
  stage.style.setProperty('--ey', (cy < 0 ? cy * 0.5 : cy).toFixed(3));

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
