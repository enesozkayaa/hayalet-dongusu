// =============================================================
// Hayalet Döngüsü - oyun motoru (odayı açan "ev" çalıştırır; Node testleri de)
// Her tur N saniye. Tur bitince zaman geri sarılır; herkesin geçmiş turları
// "hayalet" olarak aynen tekrar oynar. Hayaletin yolu kesilirse PARADOKS:
// hayalet donar, kaybolur ve bastığı levha, taşıdığı bayrak bırakılır.
// Düşman bayrağını kendi bayrak yerine getiren takım kazanır.
// =============================================================

const Motor = (() => {
  const H = typeof Harita !== 'undefined' ? Harita : require('./harita.js');
  const DT = 0.05;                    // 20 adım/sn
  const ITME_MENZIL = 1.8, ITME_BEKLE = 1.2, SERSEM = 1.0, CARPMA = 0.6, LUTUF = 1.0;
  const HAZIR = 3, SAR = 2.6, DUSME = 2;
  let o = null, cb = null, zaman = null;
  const r2 = v => Math.round(v * 100) / 100;
  const kis = v => (v > 0.999 ? 1 : v < 0.001 ? 0 : v);   // 0..1 arası, uçlara yapışır

  function baslat(liste, ayar, geri, secenek = {}) {
    durdur();
    cb = geri;
    const sira = [0, 0];
    o = {
      ayar: { sure: 45, tur: 5, paradoks: true, mod: 'rakip', ...ayar },
      tur: 0, faz: 'hazir', fazT: 0, t: 0,
      oyuncular: liste.map((p, no) => ({ id: p.id, ad: p.ad, takim: p.takim, no, ti: sira[p.takim]++, x: 0, z: 0, yaw: 0, h: 0, sonItme: -9, itmeIstek: false, itti: false, sersem: 0, dus: 0, bayrak: -1, cikti: false, kayit: null })),
      kayitlar: [], hayaletler: [], kopru: [0, 0], kapi: [0, 0], bayraklar: [], bitti: null,
    };
    cb.herkese({ tip: 'basla', oyuncular: o.oyuncular.map(p => ({ id: p.id, ad: p.ad, takim: p.takim, no: p.no })), ayar: o.ayar });
    turBaslat();
    if (!secenek.elle) {
      // Sekme arka plandayken tarayıcı zamanlayıcıyı yavaşlatır: geçen gerçek süre kadar adım at
      let son = Date.now(), birikim = 0;
      zaman = setInterval(() => {
        const simdi = Date.now(); birikim = Math.min(birikim + (simdi - son) / 1000, 3); son = simdi;
        while (birikim >= DT && o && !o.bitti) { birikim -= DT; adim(); }
      }, DT * 1000);
    }
  }
  function durdur() { clearInterval(zaman); zaman = null; }

  const evBayrak = t => ({ t, durum: 'ev', ...H.bayrakYeri(t), tasiyan: null });

  function turBaslat() {
    o.tur++; o.faz = 'hazir'; o.fazT = HAZIR; o.t = 0;
    o.kopru = [0, 0]; o.kapi = [0, 0];
    o.bayraklar = [evBayrak(0), evBayrak(1)];
    // Önceki turların kayıtları hayalet olur
    o.hayaletler = o.kayitlar.map((k, i) => ({ i, sahip: k.sahip, takim: k.takim, tur: k.tur, kare: k.kare, x: k.kare[0]?.[0] ?? 0, z: k.kare[0]?.[1] ?? 0, yaw: k.kare[0]?.[2] ?? 0, h: 0, durum: 0, donT: 0, gizli: false, bayrak: -1, ad: k.ad }));
    o.oyuncular.forEach(p => {
      if (p.cikti) return;
      const d = H.dogus(p.takim, p.ti * 6 + o.tur - 1);
      Object.assign(p, { x: d.x, z: d.z, yaw: d.yaw, h: 0, sersem: 0, dus: 0, bayrak: -1, itmeIstek: false, itti: false });
      p.kayit = { sahip: p.no, ad: p.ad, takim: p.takim, tur: o.tur, kare: [] };
      o.kayitlar.push(p.kayit);
      cb.kisiye(p.id, { tip: 'dogus', x: d.x, z: d.z, yaw: d.yaw });
    });
    cb.herkese({ tip: 'tur', tur: o.tur, toplam: o.ayar.tur, hayaletler: o.hayaletler.map(g => ({ i: g.i, sahip: g.sahip, takim: g.takim, tur: g.tur })) });
  }

  function adim() {
    if (!o || o.bitti) return;
    if (o.faz === 'hazir') {
      o.fazT -= DT;
      if (o.fazT <= 0) { o.faz = 'oyun'; cb.herkese({ tip: 'faz', faz: 'oyun' }); }
      return yay();
    }
    if (o.faz === 'sar') {
      o.fazT -= DT;
      if (o.fazT <= 0) { if (o.tur >= o.ayar.tur) return bitir(-1, 'Tur bitti, kimse bayrağı getiremedi.'); turBaslat(); }
      return yay();
    }
    o.t++;
    hayaletAdim();
    oyuncuAdim();
    bayrakAdim();
    if (o.bitti) return;
    levhaAdim();
    kaydet();
    if (o.t * DT >= o.ayar.sure) { o.faz = 'sar'; o.fazT = SAR; cb.herkese({ tip: 'faz', faz: 'sar' }); }
    yay();
  }

  // ---------- Hayaletler ----------
  function hayaletAdim() {
    const sn = o.t * DT;
    for (const g of o.hayaletler) {
      if (g.durum === 2) continue;
      if (g.durum === 1) { g.donT -= DT; if (g.donT <= 0) { g.durum = 2; } continue; }
      const k = g.kare[Math.min(o.t - 1, g.kare.length - 1)];
      if (!k) continue;
      g.x = k[0]; g.z = k[1]; g.yaw = k[2]; g.h = k[3];
      g.gizli = k[5] === 1;            // kayıttaki sahibi o sırada suya düşmüştü
      if (g.gizli) { if (g.bayrak >= 0) bayrakBirak(g); continue; }
      if (k[4]) itmeYap(g, `${g.ad} (hayalet)`);
      if (!o.ayar.paradoks) continue;
      if (H.duser(g.x, g.z, o.kopru)) { paradoks(g, 'köprü kalkıktı, suya düştü'); continue; }
      const dk = 1 - g.takim;
      if (H.kapiIcinde(g.x, g.z, dk) && o.kapi[dk] < 0.8) { paradoks(g, 'kale kapısı kapalıydı'); continue; }
      if (sn > LUTUF) {
        const p = o.oyuncular.find(p => !p.cikti && p.dus <= 0 && Math.hypot(p.x - g.x, p.z - g.z) < CARPMA);
        if (p) { paradoks(g, p.no === g.sahip ? 'kendi geçmişine çarptı' : `${p.ad} yolunu kesti`); continue; }
        const d = o.hayaletler.find(d => d !== g && d.durum === 1 && Math.hypot(d.x - g.x, d.z - g.z) < CARPMA);
        if (d) { paradoks(g, 'donmuş bir hayalete çarptı'); continue; }
      }
    }
  }
  function paradoks(g, neden) {
    if (g.durum !== 0) return;
    g.durum = 1; g.donT = 1.2;
    if (g.bayrak >= 0) bayrakBirak(g);
    cb.herkese({ tip: 'paradoks', i: g.i, neden, ad: g.ad, tur: g.tur, takim: g.takim });
  }

  // ---------- Oyuncular ----------
  function oyuncuAdim() {
    for (const p of o.oyuncular) {
      if (p.cikti) continue;
      if (p.sersem > 0) p.sersem -= DT;
      if (p.dus > 0) {
        p.dus -= DT;
        if (p.dus <= 0) { const d = H.dogus(p.takim, p.ti * 6 + o.tur - 1); Object.assign(p, { x: d.x, z: d.z, yaw: d.yaw }); cb.kisiye(p.id, { tip: 'dogus', x: d.x, z: d.z, yaw: d.yaw }); }
        continue;
      }
      if (H.duser(p.x, p.z, o.kopru)) {
        p.dus = DUSME; p.itmeIstek = false;
        if (p.bayrak >= 0) bayrakBirak(p);
        cb.kisiye(p.id, { tip: 'dustu' });
        cb.herkese({ tip: 'sicrama', x: r2(p.x), z: r2(p.z), ad: p.ad });
        continue;
      }
      if (p.itmeIstek) { p.itmeIstek = false; if (p.sersem <= 0 && o.t * DT - p.sonItme >= ITME_BEKLE) { p.sonItme = o.t * DT; p.itti = true; itmeYap(p, p.ad); } }
    }
  }

  // a: oyuncu ya da hayalet. Önündeki düşmanları iter.
  function itmeYap(a, ad) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const vurur = t => { const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz); return d < ITME_MENZIL && (d < 0.15 || (dx * fx + dz * fz) / d > 0.3) ? { dx: d < 0.15 ? fx : dx / d, dz: d < 0.15 ? fz : dz / d } : null; };
    o.oyuncular.forEach(p => {
      if (p.cikti || p.takim === a.takim || p.dus > 0) return;
      const v = vurur(p); if (!v) return;
      p.sersem = SERSEM;
      if (p.bayrak >= 0) bayrakBirak(p);
      cb.kisiye(p.id, { tip: 'itildi', dx: r2(v.dx * 3), dz: r2(v.dz * 3), ad });
    });
    if (o.ayar.paradoks) o.hayaletler.forEach(g => { if (g !== a && g.durum === 0 && !g.gizli && g.takim !== a.takim && vurur(g)) paradoks(g, `${ad} itti`); });
    cb.herkese({ tip: 'itme', x: r2(a.x), z: r2(a.z), kim: a.kare ? 'h' + a.i : 'o' + a.no });
  }

  // ---------- Bayraklar ----------
  function aktorler() {
    const L = [];
    o.oyuncular.forEach(p => { if (!p.cikti && p.dus <= 0 && p.sersem <= 0) L.push(p); });
    o.hayaletler.forEach(g => { if (g.durum === 0 && !g.gizli) L.push(g); });
    return L;
  }
  const kimAdi = a => (a.kare ? `${a.ad} (${a.tur}. tur hayaleti)` : a.ad);
  function bayrakBirak(a) {
    const f = o.bayraklar[a.bayrak];
    a.bayrak = -1;
    if (!f) return;
    f.tasiyan = null;
    if (H.nehirde(f.x, f.z)) { Object.assign(f, evBayrak(f.t)); cb.herkese({ tip: 'bayrak', olay: 'eve', t: f.t }); return; }
    f.durum = 'yerde';
    cb.herkese({ tip: 'bayrak', olay: 'dustu', t: f.t, kim: kimAdi(a) });
  }
  function bayrakAdim() {
    const L = aktorler();
    for (const f of o.bayraklar) {
      if (f.durum === 'tasiniyor') {
        const a = f.tasiyan;
        f.x = a.x; f.z = a.z;
        const ev = H.bayrakYeri(a.takim);
        if (Math.hypot(a.x - ev.x, a.z - ev.z) < 1.8) return bitir(a.takim, `${kimAdi(a)} bayrağı getirdi!`, a.kare ? 'hayalet' : 'oyuncu');
        continue;
      }
      for (const a of L) {
        if (Math.hypot(a.x - f.x, a.z - f.z) > 1.2) continue;
        if (a.takim !== f.t && a.bayrak < 0) {
          f.durum = 'tasiniyor'; f.tasiyan = a; a.bayrak = f.t;
          cb.herkese({ tip: 'bayrak', olay: 'aldi', t: f.t, kim: kimAdi(a), takim: a.takim });
          break;
        }
        if (a.takim === f.t && f.durum === 'yerde') {
          Object.assign(f, evBayrak(f.t));
          cb.herkese({ tip: 'bayrak', olay: 'kurtardi', t: f.t, kim: kimAdi(a) });
          break;
        }
      }
    }
  }

  // ---------- Levhalar, köprüler, kapılar ----------
  function levhaAdim() {
    const basanlar = [];
    o.oyuncular.forEach(p => { if (!p.cikti && p.dus <= 0) basanlar.push(p); });
    o.hayaletler.forEach(g => { if (g.durum !== 2 && !g.gizli) basanlar.push(g); });
    const basili = H.levhalar.map(l => basanlar.some(a => Math.hypot(a.x - l.x, a.z - l.z) < l.r));
    o.basili = basili;
    [0, 1].forEach(i => {
      const in_ = H.levhalar.some((l, j) => l.tur === 'kopru' && l.i === i && basili[j]);
      o.kopru[i] = kis(o.kopru[i] + (in_ ? DT / 0.8 : -DT / 1.0));
    });
    [0, 1].forEach(t => {
      const km = H.kapiMerkez(t);
      const ac = H.levhalar.some((l, j) => l.tur === 'kapi' && l.i === t && basili[j]) || basanlar.some(a => a.takim === t && Math.hypot(a.x - km.x, a.z - km.z) < 2.4);
      o.kapi[t] = kis(o.kapi[t] + (ac ? DT / 0.5 : -DT / 0.8));
    });
  }

  function kaydet() {
    o.oyuncular.forEach(p => {
      if (p.cikti || !p.kayit) return;
      p.kayit.kare.push([r2(p.x), r2(p.z), r2(p.yaw), p.h, p.itti ? 1 : 0, p.dus > 0 ? 1 : 0]);
      p.itti = false;
    });
  }

  function yay() {
    const kalan = o.faz === 'oyun' ? Math.max(0, o.ayar.sure - o.t * DT) : o.fazT;
    const op = [], hp = [];
    o.oyuncular.forEach(p => { if (!p.cikti) op.push(p.no, r2(p.x), r2(p.z), r2(p.yaw), p.h, p.sersem > 0 ? 1 : 0, p.bayrak, p.dus > 0 ? 1 : 0); });
    o.hayaletler.forEach(g => hp.push(g.i, r2(g.x), r2(g.z), r2(g.yaw), g.h, g.durum, g.gizli ? 1 : 0, g.bayrak));
    cb.herkese({
      tip: 'd', f: o.faz, tu: o.tur, s: r2(kalan), k: o.kopru.map(r2), g: o.kapi.map(r2), l: (o.basili || []).map(b => (b ? 1 : 0)),
      b: o.bayraklar.map(f => [f.durum === 'ev' ? 0 : f.durum === 'yerde' ? 1 : 2, r2(f.x), r2(f.z)]), o: op, h: hp,
    });
  }

  function bitir(kazanan, neden, kim) {
    o.bitti = { kazanan, neden, kim };
    o.faz = 'bitti';
    yay();
    cb.herkese({ tip: 'bitti', kazanan, neden, kim, tur: o.tur });
    durdur();
  }

  // ---------- Oyunculardan gelenler ----------
  function girdi(id, m) {
    if (!o) return;
    const p = o.oyuncular.find(p => p.id === id);
    if (!p || p.cikti) return;
    if (m.tip === 'k') {
      if (o.faz !== 'oyun' || p.dus > 0) return;
      const x = +m.x, z = +m.z;
      if (!isFinite(x) || !isFinite(z)) return;
      p.x = Math.max(-H.SX, Math.min(H.SX, x)); p.z = Math.max(-H.SZ, Math.min(H.SZ, z));
      p.yaw = +m.yaw || 0; p.h = m.h ? 1 : 0;
    } else if (m.tip === 'i') {
      if (o.faz === 'oyun' && p.dus <= 0) p.itmeIstek = true;
    }
  }
  function cikis(id) {
    if (!o) return;
    const p = o.oyuncular.find(p => p.id === id);
    if (!p || p.cikti) return;
    if (p.bayrak >= 0) bayrakBirak(p);
    p.cikti = true;
    cb.herkese({ tip: 'cikti', no: p.no, ad: p.ad });
    if (!o.bitti && o.ayar.mod === 'rakip') {
      const kalan = [0, 1].map(t => o.oyuncular.some(q => !q.cikti && q.takim === t));
      if (!kalan[0] || !kalan[1]) bitir(kalan[0] ? 0 : kalan[1] ? 1 : -1, 'Rakip takımda kimse kalmadı.');
    }
  }

  return { baslat, durdur, adim, girdi, cikis, get durum() { return o; }, DT };
})();
if (typeof module !== 'undefined') module.exports = Motor;
