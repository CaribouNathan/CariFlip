// Sons synthétisés à la volée (Web Audio) : aucun fichier à charger, fonctionne hors ligne.
import { store } from './storage.js';

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// iOS n'autorise le son qu'après un geste : on « réveille » le contexte au premier toucher.
window.addEventListener('pointerdown', () => { if (store.sound) ac(); }, { once: true });

function tone(freq, { dur = 0.08, type = 'sine', gain = 0.12, at = 0, slide = 0 } = {}) {
  if (!store.sound) return;
  const a = ac(); if (!a) return;
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

// Vibration : Android uniquement (Safari iOS ne l'expose pas).
export function haptic(ms = 8) {
  if (store.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* ignoré */ } }
}
