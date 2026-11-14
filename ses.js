// =============================================================
// Hayalet Döngüsü - oyun sesleri (dosya yok, tarayıcı kendisi üretir). Sesli sohbet ayrı (ag.js).
// =============================================================

const Ses = (() => {
  let acik = true;
  try { acik = localStorage.getItem('hd.ses') !== '0'; } catch (e) { }
  const al = () => (typeof Ag !== 'undefined' ? Ag.ctxAl() : null);
  function ton(frek, sure, tip = 'sine', ses = 0.15, gecikme = 0, kayma = 0) {
    const c = al(); if (!c || !acik) return;
    const t = c.currentTime + gecikme;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tip; o.frequency.setValueAtTime(frek, t);
    if (kayma) o.frequency.exponentialRampToValueAtTime(Math.max(30, frek + kayma), t + sure);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(ses, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + sure + 0.02);
  }
  function gurultu(sure, ses = 0.5, filtre = 1200, tip = 'lowpass', gecikme = 0) {
    const c = al(); if (!c || !acik || ses < 0.01) return;
    const n = Math.floor(c.sampleRate * sure), buf = c.createBuffer(1, n, c.sampleRate), v = buf.getChannelData(0);
    for (let i = 0; i < n; i++) v[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = tip; f.frequency.value = filtre; g.gain.value = ses;
    s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + gecikme);
  }
  // s: 0..1 yakınlık
  return {
    get acik() { return acik; },
    degistir() { acik = !acik; try { localStorage.setItem('hd.ses', acik ? '1' : '0'); } catch (e) { } return acik; },
    baslat() { al(); },
    itme(s = 1) { gurultu(0.15, 0.6 * s, 500); ton(110, 0.12, 'triangle', 0.18 * s, 0, -40); },
    sicrama(s = 1) { gurultu(0.7, 0.7 * s, 2200, 'lowpass'); gurultu(0.35, 0.4 * s, 600, 'bandpass', 0.05); },
    paradoks(s = 1) { ton(900, 0.5, 'sawtooth', 0.07 * s, 0, -700); ton(450, 0.5, 'square', 0.05 * s, 0.05, 300); gurultu(0.3, 0.25 * s, 3000, 'highpass', 0.1); },
    bayrak() { [523, 784, 1046].forEach((f, i) => ton(f, 0.18, 'square', 0.06, i * 0.09)); },
    kotuHaber() { ton(330, 0.25, 'sawtooth', 0.08, 0, -120); ton(220, 0.3, 'sawtooth', 0.07, 0.15, -80); },
    geriSar() { ton(1400, 1.6, 'sawtooth', 0.05, 0, -1300); ton(700, 1.6, 'triangle', 0.06, 0.1, -600); gurultu(1.6, 0.12, 1800, 'bandpass'); },
    tik() { ton(880, 0.08, 'square', 0.06); },
    basla() { ton(392, 0.18, 'square', 0.08); ton(587, 0.35, 'square', 0.08, 0.16); },
    kopru() { gurultu(0.5, 0.25, 300); ton(70, 0.4, 'sawtooth', 0.04, 0, 20); },
    bildirim() { ton(880, 0.12, 'sine', 0.12); ton(1320, 0.18, 'sine', 0.1, 0.12); },
    kazandi() { [392, 523, 659, 784, 1046].forEach((f, i) => ton(f, 0.25, 'triangle', 0.13, i * 0.12)); },
    kaybetti() { [392, 330, 262, 196].forEach((f, i) => ton(f, 0.3, 'triangle', 0.12, i * 0.16)); },
  };
})();
