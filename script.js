document.documentElement.classList.add('js');

// ---------- Nav ----------
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggle.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

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
