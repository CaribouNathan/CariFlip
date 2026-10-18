// Sons synthétisés à la volée (Web Audio) : aucun fichier à charger, fonctionne hors ligne.
import { store } from './storage.js';

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // « suspended » au départ, « interrupted » sur iOS après un appel ou un passage en arrière-plan.
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

// Déverrouillage iOS : Safari ne laisse démarrer l'audio que pendant un geste de l'utilisateur.
// À chaque geste, tant que le contexte ne tourne pas, on le relance et on joue un tampon muet
// (pas seulement au premier toucher : iOS peut le re-suspendre à tout moment).
function unlock() {
  if (!store.sound) return;
  const a = ac();
  if (!a || a.state === 'running') return;
  try {
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(a.destination);
    src.start(0);
  } catch { /* ignoré */ }
}
['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, unlock, { capture: true, passive: true }));

function tone(freq, { dur = 0.08, type = 'sine', gain = 0.12, at = 0, slide = 0 } = {}) {
  if (!store.sound) return;
  const a = ac(); if (!a || a.state !== 'running') return; // pas de rafale différée au déverrouillage
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
export const sfx = {
  step(n) { tone(440 * Math.pow(2, scale[n % scale.length] / 12), { dur: 0.05, type: 'triangle', gain: 0.06 }); },
  back() { tone(300, { dur: 0.04, type: 'triangle', gain: 0.04 }); },
  flip() { tone(520, { dur: 0.12, type: 'sine', gain: 0.07, slide: 1.6 }); },
  clear(k = 1) { [0, 4, 7, 12].slice(0, 2 + Math.min(k, 2)).forEach((s, i) => tone(523 * Math.pow(2, s / 12), { dur: 0.18, type: 'triangle', gain: 0.08, at: i * 0.06 })); },
  win() { [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), { dur: 0.25, type: 'triangle', gain: 0.09, at: i * 0.08 })); },
  fail() { tone(220, { dur: 0.22, type: 'sawtooth', gain: 0.05, slide: 0.7 }); },
  push() { tone(140, { dur: 0.08, type: 'square', gain: 0.03 }); },
  over() { [0, -3, -7].forEach((s, i) => tone(330 * Math.pow(2, s / 12), { dur: 0.3, type: 'sawtooth', gain: 0.05, at: i * 0.15 })); },
};

// ---------- Vibrations ----------
// Android : API Vibration. iPhone : Safari n'a pas cette API, mais depuis iOS 18 basculer un
// interrupteur natif (<input type="checkbox" switch>) produit un retour haptique ; on en clique
// un, invisible. Sans effet sur les iOS plus anciens.
const hasSwitch = typeof document !== 'undefined' && 'switch' in document.createElement('input');
export const IS_IOS = typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const hapticsAvailable = () => !!navigator.vibrate || (IS_IOS && hasSwitch);

let iosSwitch = null;
let lastIos = 0;
function iosTap() {
  const now = performance.now();
  if (now - lastIos < 45) return; // iOS ignore des taps trop rapprochés
  lastIos = now;
  if (!iosSwitch) {
    iosSwitch = document.createElement('label');
    iosSwitch.setAttribute('aria-hidden', 'true');
    iosSwitch.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    iosSwitch.appendChild(input);
    document.body.appendChild(iosSwitch);
  }
  iosSwitch.click();
}

export function haptic(ms = 8) {
  if (!store.haptics) return;
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* ignoré */ } return; }
  if (IS_IOS && hasSwitch) iosTap();
}

// ---------- Mode silencieux (iPhone) ----------
// Par défaut, Safari coupe les sons web quand l'iPhone est en mode silencieux (session « ambient »).
// Avec la session « playback » (Audio Session API, iOS 16.4+), le jeu sonne quand même,
// mais met en pause la musique des autres apps quand il joue un son.
export const silentOverrideAvailable = () => typeof navigator !== 'undefined' && !!navigator.audioSession;
export function applyAudioSession() {
  if (!silentOverrideAvailable()) return;
  try { navigator.audioSession.type = store.sound && store.soundInSilent ? 'playback' : 'ambient'; } catch { /* ignoré */ }
}
applyAudioSession();
