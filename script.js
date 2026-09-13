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
const overlayLogo = overlay.querySelector('.nav-logo');

function setMenu(open){
  // the reveal grows from the centre of the logo (clip-path doesn't affect layout,
  // so the overlay's own logo has a valid rect even while the menu is closed)
  const r = overlayLogo.getBoundingClientRect();
  overlay.style.setProperty('--ox', (r.left + r.width / 2).toFixed(1) + 'px');
  overlay.style.setProperty('--oy', (r.top + r.height / 2).toFixed(1) + 'px');
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
const HINT_DEFAULT = { text: hintText.textContent, offset: hintText.getAttribute('startOffset') };
function setHint(text, offset){
  hint.classList.add('is-swapping');
  setTimeout(() => {
    hintText.textContent = text;
    hintText.setAttribute('startOffset', offset);
    if (text === HINT_DEFAULT.text) hintText.setAttribute('textLength', '88'); else hintText.removeAttribute('textLength');
    hint.classList.remove('is-swapping');
  }, 200);
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

  if (t < dizzyUntil && !reduceMotion){
    renderDizzy(t);
    requestAnimationFrame(frame);
    return;
  }
  if (lastDizzyEnd < dizzyStart && dizzyUntil){ lastDizzyEnd = t; hideStars(); setHint(HINT_DEFAULT.text, HINT_DEFAULT.offset); }

  const up = Math.max(0, -cy), down = Math.max(0, cy);
  if (!reduceMotion){
    // Flat, hand-drawn feel: the head only nudges a few pixels and tilts a couple of degrees,
    // hinged at the chin so the jaw stays on the neck. Tilt leans toward the cursor and a
    // little more toward the corners (Robb Owen-style x*y rotation).
    // Head only (cut at the jaw); the neck is static. Pivot at the chin, so the jaw corners move
    // almost purely vertically — a vertical nudge never shows at the neck lines. Sideways travel is
    // kept sub-pixel so the jaw never slides across them.
    const headX = cx * 0.6;
    const headY = cy < 0 ? cy * 1 : cy * 3;
    const tilt = -cx * 0.7;
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
