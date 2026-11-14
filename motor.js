// =============================================================
// Hayalet Döngüsü - oyun motoru (odayı açan "ev" çalıştırır; Node testleri de)
// Her tur N saniye. Tur bitince zaman geri sarılır; herkesin geçmiş turları
// "hayalet" olarak aynen tekrar oynar (yürüyüş, itme, balta, barikat, mancınık).
// Hayaletin yolu kesilirse PARADOKS: hayalet donar, kaybolur; bastığı levha,
// taşıdığı bayrak bırakılır. Düşman bayrağını kendi bayrak yerine getiren kazanır.
// =============================================================

const Motor = (() => {
  const H = typeof Harita !== 'undefined' ? Harita : require('./harita.js');
  const DT = 0.05;                    // 20 adım/sn
  const ITME_MENZIL = 1.8, ITME_BEKLE = 1.2, SERSEM = 1.0, CARPMA = 0.6, LUTUF = 1.0;
  const HAZIR = 3, SAR = 2.6, DUSME = 2, ZINDAN = 3;
  const BALTA_BEKLE = 4, BALTA_HIZ = 16, BALTA_MENZIL = 14, BARIKAT_HAK = 2, MANCINIK_BEKLE = 5, TAS_SURE = 1.5, TAS_ALAN = 3.2;
  const KOPRU_KIRIK = 6, SANDIK_ARA = 9, SANDIK_EN_FAZLA = 3;
  const GUCLER = { hiz: 6, kalkan: 8, gorunmez: 6, dur: 4, cekic: 60 };
  const GUC_KOD = { hiz: 1, kalkan: 2, gorunmez: 3, dur: 4, cekic: 5 };
  let o = null, cb = null, zaman = null, rastgele = Math.random;
  const r2 = v => Math.round(v * 100) / 100;
  const kis = v => (v > 0.999 ? 1 : v < 0.001 ? 0 : v);   // 0..1 arası, uçlara yapışır

  function baslat(liste, ayar, geri, secenek = {}) {
    durdur();
    cb = geri;
    if (secenek.rastgele) rastgele = secenek.rastgele;
    const sira = [0, 0];
    o = {
      ayar: { sure: 45, tur: 5, paradoks: true, mod: 'rakip', ...ayar },
      tur: 0, faz: 'hazir', fazT: 0, t: 0, id: 1,
      oyuncular: liste.map((p, no) => ({ id: p.id, ad: p.ad, takim: p.takim, no, ti: sira[p.takim]++, x: 0, z: 0, yaw: 0, h: 0, sonItme: -9, sonBalta: -9, sonBarikat: -9, itmeIstek: false, itti: false, eylem: 0, sersem: 0, dus: 0, bayrak: -1, cikti: false, kayit: null, guc: null, barikatHak: BARIKAT_HAK })),
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
  const sn = () => o.t * DT;
  const gizliMi = a => (a.kare ? a.gizli : a.h === 3 || a.dus > 0 || a.cikti);   // tünelde / suda / zindanda

  function turBaslat() {
    o.tur++; o.faz = 'hazir'; o.fazT = HAZIR; o.t = 0;
    Object.assign(o, {
      kopru: [0, 0], kapi: [0, 0], kopruKirik: [0, 0], donma: [0, 0], mancinikBekle: [0, 0],
      barikatlar: [], baltalar: [], taslar: [], sandiklar: [], sandikT: 4, kapaklar: H.KAPAKLAR.map(() => 0),
    });
    o.bayraklar = [evBayrak(0), evBayrak(1)];
    // Önceki turların kayıtları hayalet olur
    o.hayaletler = o.kayitlar.map((k, i) => ({ i, sahip: k.sahip, takim: k.takim, tur: k.tur, kare: k.kare, x: k.kare[0]?.[0] ?? 0, z: k.kare[0]?.[1] ?? 0, yaw: k.kare[0]?.[2] ?? 0, h: 0, durum: 0, donT: 0, gizli: false, bayrak: -1, ad: k.ad, ofs: 0 }));
    o.oyuncular.forEach(p => {
      if (p.cikti) return;
      const d = H.dogus(p.takim, p.ti * 6 + o.tur - 1);
      Object.assign(p, { x: d.x, z: d.z, yaw: d.yaw, h: 0, sersem: 0, dus: 0, bayrak: -1, itmeIstek: false, itti: false, eylem: 0, guc: null, barikatHak: BARIKAT_HAK, sonBalta: -9, sonItme: -9 });
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
    [0, 1].forEach(t => { o.donma[t] = Math.max(0, o.donma[t] - DT); o.kopruKirik[t] = Math.max(0, o.kopruKirik[t] - DT); o.mancinikBekle[t] = Math.max(0, o.mancinikBekle[t] - DT); });
    hayaletAdim();
    oyuncuAdim();
    baltaAdim();
    tasAdim();
    kapakAdim();
    sandikAdim();
    bayrakAdim();
    if (o.bitti) return;
    levhaAdim();
    kaydet();
    if (sn() >= o.ayar.sure) { o.faz = 'sar'; o.fazT = SAR; cb.herkese({ tip: 'faz', faz: 'sar' }); }
    yay();
  }

  // ---------- Hayaletler ----------
  function hayaletAdim() {
    for (const g of o.hayaletler) {
      if (g.durum === 2) continue;
      if (g.durum === 1) { g.donT -= DT; if (g.donT <= 0) g.durum = 2; continue; }
      if (o.donma[g.takim] > 0) { g.ofs++; continue; }   // ⏸️ zaman durdurucu: hayalet bekler, sonra geriden gelir
      const idx = Math.max(0, Math.min(o.t - 1 - g.ofs, g.kare.length - 1));
      const k = g.kare[idx];
      if (!k) continue;
      g.x = k[0]; g.z = k[1]; g.yaw = k[2]; g.h = k[3];
      g.gizli = k[5] === 1 || k[3] === 3;   // kayıttaki sahibi o sırada suya/zindana düşmüştü ya da tüneldeydi
      if (g.gizli) { if (g.bayrak >= 0) bayrakBirak(g); continue; }
      const ad = `${g.ad} (hayalet)`;
      if (k[4]) itmeYap(g, ad);
      const e = k[6];
      if (e) {
        if (e.a === 'b') baltaAt(g, ad);
        else if (e.a === 'r') barikatKoy(g);
        else if (e.a === 'm') tasAt(g, e.tx, e.tz, ad);
      }
      if (!o.ayar.paradoks) continue;
      if (H.duser(g.x, g.z, o.kopru, sn(), 0.15)) { paradoks(g, 'köprü kalkıktı, suya düştü'); continue; }
      const dk = 1 - g.takim;
      if (H.kapiIcinde(g.x, g.z, dk) && o.kapi[dk] < 0.8) { paradoks(g, 'kale kapısı kapalıydı'); continue; }
      if (o.barikatlar.some(b => b.takim !== g.takim && H.barikatIcinde(b, g.x, g.z, 0.2))) { paradoks(g, 'barikata çarptı'); continue; }
      if (sn() > LUTUF) {
        const p = o.oyuncular.find(p => !gizliMi(p) && Math.hypot(p.x - g.x, p.z - g.z) < CARPMA);
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
      if (p.guc) { p.guc.kalan -= DT; if (p.guc.kalan <= 0) p.guc = null; }
      if (p.dus > 0) {
        p.dus -= DT;
        if (p.dus <= 0) { const d = H.dogus(p.takim, p.ti * 6 + o.tur - 1); Object.assign(p, { x: d.x, z: d.z, yaw: d.yaw }); cb.kisiye(p.id, { tip: 'dogus', x: d.x, z: d.z, yaw: d.yaw }); }
        continue;
      }
      if (p.h === 3) continue;   // tünelde
      if (H.duser(p.x, p.z, o.kopru, sn(), 0.5)) {
        p.dus = DUSME; p.itmeIstek = false;
        if (p.bayrak >= 0) bayrakBirak(p);
        cb.kisiye(p.id, { tip: 'dustu', nereye: 'su' });
        cb.herkese({ tip: 'sicrama', x: r2(p.x), z: r2(p.z), ad: p.ad });
        continue;
      }
      if (p.itmeIstek) { p.itmeIstek = false; if (p.sersem <= 0 && sn() - p.sonItme >= ITME_BEKLE) { p.sonItme = sn(); p.itti = true; itmeYap(p, p.ad); } }
    }
  }
  const kalkanli = p => !p.kare && p.guc?.tur === 'kalkan';
  // Oyuncuyu sersemlet ve it (bayrağı düşer). Kalkanı varsa bir şey olmaz.
  function vur(p, dx, dz, guc, sersem, ad) {
    if (kalkanli(p)) { cb.herkese({ tip: 'kalkan', no: p.no }); return false; }
    p.sersem = Math.max(p.sersem, sersem);
    if (p.bayrak >= 0) bayrakBirak(p);
    cb.kisiye(p.id, { tip: 'itildi', dx: r2(dx * guc), dz: r2(dz * guc), ad });
    return true;
  }

  // a: oyuncu ya da hayalet. Önündeki düşmanları iter. Dev çekiçle etrafındaki herkesi uçurur.
  function itmeYap(a, ad) {
    const cekic = !a.kare && a.guc?.tur === 'cekic';
    if (cekic) a.guc = null;
    const menzil = cekic ? 3.6 : ITME_MENZIL;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const vurur = t => {
      const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
      if (d >= menzil) return null;
      if (d < 0.15) return { dx: fx, dz: fz };
      if (!cekic && (dx * fx + dz * fz) / d <= 0.3) return null;
      return { dx: dx / d, dz: dz / d };
    };
    o.oyuncular.forEach(p => {
      if (p.takim === a.takim || gizliMi(p)) return;
      const v = vurur(p); if (v) vur(p, v.dx, v.dz, cekic ? 6 : 3, cekic ? 2 : SERSEM, ad);
    });
    if (o.ayar.paradoks) o.hayaletler.forEach(g => { if (g !== a && g.durum === 0 && !g.gizli && g.takim !== a.takim && vurur(g)) paradoks(g, `${ad} ${cekic ? 'çekiçle ' : ''}itti`); });
    cb.herkese({ tip: 'itme', x: r2(a.x), z: r2(a.z), kim: a.kare ? 'h' + a.i : 'o' + a.no, cekic });
  }

  // ---------- Balta ----------
  function baltaAt(a, ad) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    o.baltalar.push({ id: o.id++, x: a.x + fx * 0.6, z: a.z + fz * 0.6, dx: fx, dz: fz, yaw: a.yaw, takim: a.takim, kalan: BALTA_MENZIL, ad });
    cb.herkese({ tip: 'firlat', x: r2(a.x), z: r2(a.z), kim: a.kare ? 'h' + a.i : 'o' + a.no, ne: 'balta' });
  }
  function baltaAdim() {
    o.baltalar = o.baltalar.filter(b => {
      for (let s = 0; s < 2; s++) {
        const adimBoy = BALTA_HIZ * DT / 2;
        b.x += b.dx * adimBoy; b.z += b.dz * adimBoy; b.kalan -= adimBoy;
        if (b.kalan <= 0) return false;
        if (H.dolu(b.x, b.z, 0, 0.6)) { cb.herkese({ tip: 'vurus', x: r2(b.x), z: r2(b.z), ne: 'duvar' }); return false; }
        const bk = o.barikatlar.find(k => k.takim !== b.takim && H.barikatIcinde(k, b.x, b.z, 0.1));
        if (bk) { bk.hp--; if (bk.hp <= 0) o.barikatlar = o.barikatlar.filter(k => k !== bk); cb.herkese({ tip: 'vurus', x: r2(b.x), z: r2(b.z), ne: 'barikat' }); return false; }
        const p = o.oyuncular.find(p => p.takim !== b.takim && !gizliMi(p) && Math.hypot(p.x - b.x, p.z - b.z) < 0.65);
        if (p) { vur(p, b.dx, b.dz, 1.5, 1.5, b.ad); cb.herkese({ tip: 'vurus', x: r2(b.x), z: r2(b.z), ne: 'oyuncu', ad: p.ad, kim: b.ad }); return false; }
        const g = o.hayaletler.find(g => g.takim !== b.takim && g.durum === 0 && !g.gizli && Math.hypot(g.x - b.x, g.z - b.z) < 0.65);
        if (g && o.ayar.paradoks) { paradoks(g, `${b.ad} baltayla vurdu`); cb.herkese({ tip: 'vurus', x: r2(b.x), z: r2(b.z), ne: 'hayalet' }); return false; }
      }
      return true;
    });
  }

  // ---------- Barikat ----------
  function barikatKoy(a) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), x = a.x + fx * 1.3, z = a.z + fz * 1.3;
    const ok = [-1, 0, 1].every(u => { const px = x + Math.cos(a.yaw) * u, pz = z - Math.sin(a.yaw) * u; return !H.dolu(px, pz, 0.2) && !H.nehirde(px, pz); });
    if (!ok) return false;
    if (H.levhalar.some(l => Math.hypot(l.x - x, l.z - z) < l.r + 1.2)) return false;
    if ([0, 1].some(t => H.kapiIcinde(x, z, t, 1.2))) return false;
    if (H.TUNELLER.some(t => Math.hypot(t.x - x, t.z - z) < 2) || H.KAPAKLAR.some(k => Math.hypot(k.x - x, k.z - z) < 1.4)) return false;
    if (o.barikatlar.some(b => Math.hypot(b.x - x, b.z - z) < 1.4)) return false;
    if (o.barikatlar.length >= 16) o.barikatlar.shift();
    o.barikatlar.push({ id: o.id++, x: r2(x), z: r2(z), a: a.yaw, takim: a.takim, hp: 2 });
    cb.herkese({ tip: 'barikat', x: r2(x), z: r2(z) });
    return true;
  }

  // ---------- Mancınık ----------
  function mancinikYakin(a) { const m = H.MANCINIKLAR[a.takim]; return Math.hypot(a.x - m.x, a.z - m.z) < 2.4 ? m : null; }
  function tasAt(a, tx, tz, ad) {
    const m = mancinikYakin(a);
    if (!m || o.mancinikBekle[a.takim] > 0 || !isFinite(tx) || !isFinite(tz)) return false;
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return false;
    const [en, ust] = H.MANCINIK_MENZIL, dd = Math.max(en, Math.min(ust, d));
    tx = m.x + dx / d * dd; tz = m.z + dz / d * dd;
    o.taslar.push({ id: o.id++, x0: m.x, z0: m.z, tx: r2(tx), tz: r2(tz), t: 0, takim: a.takim, ad });
    o.mancinikBekle[a.takim] = MANCINIK_BEKLE;
    cb.herkese({ tip: 'firlat', ne: 'tas', t: a.takim, x: m.x, z: m.z });
    return true;
  }
  function tasAdim() {
    o.taslar = o.taslar.filter(s => {
      s.t += DT;
      if (s.t < TAS_SURE) return true;
      patla(s);
      return false;
    });
  }
  function patla(s) {
    const { tx: x, tz: z } = s;
    o.oyuncular.forEach(p => {
      if (p.takim === s.takim || gizliMi(p)) return;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (d < TAS_ALAN) vur(p, d > 0.05 ? dx / d : 1, d > 0.05 ? dz / d : 0, 4, 1.6, `${s.ad} (mancınık)`);
    });
    if (o.ayar.paradoks) o.hayaletler.forEach(g => { if (g.takim !== s.takim && g.durum === 0 && !g.gizli && Math.hypot(g.x - x, g.z - z) < TAS_ALAN) paradoks(g, `${s.ad} mancınıkla vurdu`); });
    o.barikatlar = o.barikatlar.filter(b => b.takim === s.takim || Math.hypot(b.x - x, b.z - z) > TAS_ALAN + 0.5);
    let kirik = -1;
    H.KOPRULER.forEach((bx, i) => { if (Math.abs(x - bx) < H.KOPRU_YARI + 1.5 && Math.abs(z) < H.NEHIR + 1.5) { o.kopruKirik[i] = KOPRU_KIRIK; kirik = i; } });
    cb.herkese({ tip: 'patlama', x, z, su: H.nehirde(x, z), kopru: kirik, ad: s.ad });
  }

  // ---------- Tuzak kapaklar ----------
  function kapakAdim() {
    H.KAPAKLAR.forEach((k, i) => {
      if (o.kapaklar[i] > 0) o.kapaklar[i] = Math.max(0, o.kapaklar[i] - DT);
      let tetik = false;
      o.oyuncular.forEach(p => {
        if (p.takim === k.t || gizliMi(p) || !H.kapakUstunde(k, p.x, p.z)) return;
        tetik = true;
        p.dus = ZINDAN; p.itmeIstek = false;
        if (p.bayrak >= 0) { const f = o.bayraklar[p.bayrak]; p.bayrak = -1; Object.assign(f, evBayrak(f.t)); cb.herkese({ tip: 'bayrak', olay: 'eve', t: f.t, neden: 'zindan' }); }
        cb.kisiye(p.id, { tip: 'dustu', nereye: 'zindan' });
        cb.herkese({ tip: 'kapak', i, ad: p.ad });
      });
      if (o.ayar.paradoks) o.hayaletler.forEach(g => {
        if (g.takim === k.t || g.durum !== 0 || g.gizli || !H.kapakUstunde(k, g.x, g.z)) return;
        tetik = true; paradoks(g, 'tuzak kapağa düştü');
      });
      if (tetik) o.kapaklar[i] = Math.max(o.kapaklar[i], 1.2);
    });
  }

  // ---------- Hazine sandıkları ----------
  function sandikAdim() {
    o.sandikT -= DT;
    if (o.sandikT <= 0) {
      o.sandikT = SANDIK_ARA;
      if (o.sandiklar.length < SANDIK_EN_FAZLA) {
        const bos = H.sandikYerleri.filter(y => !o.sandiklar.some(s => Math.hypot(s.x - y.x, s.z - y.z) < 3) && !o.oyuncular.some(p => !p.cikti && Math.hypot(p.x - y.x, p.z - y.z) < 3));
        if (bos.length) { const y = bos[Math.floor(rastgele() * bos.length)]; o.sandiklar.push({ id: o.id++, x: y.x, z: y.z }); cb.herkese({ tip: 'sandikCikti', x: y.x, z: y.z }); }
      }
    }
    o.sandiklar = o.sandiklar.filter(s => {
      const p = o.oyuncular.find(p => !gizliMi(p) && p.sersem <= 0 && Math.hypot(p.x - s.x, p.z - s.z) < 1.15);
      if (!p) return true;
      gucVer(p);
      return false;
    });
  }
  function gucVer(p, tur) {
    const adlar = Object.keys(GUCLER);
    tur = tur || adlar[Math.floor(rastgele() * adlar.length)];
    p.guc = { tur, kalan: GUCLER[tur] };
    if (tur === 'dur') o.donma[1 - p.takim] = GUCLER.dur;
    cb.kisiye(p.id, { tip: 'gucAl', tur, sure: GUCLER[tur] });
    cb.herkese({ tip: 'guc', ad: p.ad, tur, takim: p.takim, no: p.no });
  }

  // ---------- Bayraklar ----------
  function aktorler() {
    const L = [];
    o.oyuncular.forEach(p => { if (!gizliMi(p) && p.sersem <= 0) L.push(p); });
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
    o.oyuncular.forEach(p => { if (!gizliMi(p)) basanlar.push(p); });
    o.hayaletler.forEach(g => { if (g.durum !== 2 && !g.gizli) basanlar.push(g); });
    const basili = H.levhalar.map(l => basanlar.some(a => Math.hypot(a.x - l.x, a.z - l.z) < l.r));
    o.basili = basili;
    [0, 1].forEach(i => {
      const in_ = o.kopruKirik[i] <= 0 && H.levhalar.some((l, j) => l.tur === 'kopru' && l.i === i && basili[j]);
      o.kopru[i] = kis(o.kopru[i] + (in_ ? DT / 0.8 : -DT / (o.kopruKirik[i] > 0 ? 0.3 : 1.0)));
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
      p.kayit.kare.push([r2(p.x), r2(p.z), r2(p.yaw), p.h, p.itti ? 1 : 0, p.dus > 0 ? 1 : 0, p.eylem || 0]);
      p.itti = false; p.eylem = 0;
    });
  }

  function yay() {
    const kalan = o.faz === 'oyun' ? Math.max(0, o.ayar.sure - sn()) : o.fazT;
    const op = [], hp = [], bk = [], bl = [], ts = [], sd = [];
    o.oyuncular.forEach(p => { if (!p.cikti) op.push(p.no, r2(p.x), r2(p.z), r2(p.yaw), p.h, p.sersem > 0 ? 1 : 0, p.bayrak, p.dus > 0 ? 1 : 0, p.guc ? GUC_KOD[p.guc.tur] : 0); });
    o.hayaletler.forEach(g => hp.push(g.i, r2(g.x), r2(g.z), r2(g.yaw), g.h, g.durum, g.gizli ? 1 : 0, g.bayrak));
    o.barikatlar.forEach(b => bk.push(b.id, b.x, b.z, r2(b.a), b.takim, b.hp));
    o.baltalar.forEach(b => bl.push(b.id, r2(b.x), r2(b.z), r2(b.yaw)));
    o.taslar.forEach(s => ts.push(s.id, s.x0, s.z0, s.tx, s.tz, r2(s.t / TAS_SURE)));
    o.sandiklar.forEach(s => sd.push(s.id, s.x, s.z));
    cb.herkese({
      tip: 'd', f: o.faz, tu: o.tur, s: r2(kalan), ts: o.faz === 'oyun' ? r2(sn()) : 0,
      k: o.kopru.map(r2), kk: o.kopruKirik.map(r2), g: o.kapi.map(r2), l: (o.basili || []).map(b => (b ? 1 : 0)),
      b: o.bayraklar.map(f => [f.durum === 'ev' ? 0 : f.durum === 'yerde' ? 1 : 2, r2(f.x), r2(f.z)]), o: op, h: hp,
      bk, bl, tas: ts, sd, kp: o.kapaklar.map(v => (v > 0 ? 1 : 0)), mb: o.mancinikBekle.map(r2), dn: o.donma.map(r2),
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
    const oynuyor = o.faz === 'oyun' && p.dus <= 0 && p.h !== 3;
    if (m.tip === 'k') {
      if (o.faz !== 'oyun' || p.dus > 0) return;
      const x = +m.x, z = +m.z;
      if (!isFinite(x) || !isFinite(z)) return;
      p.x = Math.max(-H.SX, Math.min(H.SX, x)); p.z = Math.max(-H.SZ, Math.min(H.SZ, z));
      p.yaw = +m.yaw || 0; p.h = [0, 1, 2, 3].includes(m.h) ? m.h : 0;
      if (p.h === 3 && p.bayrak >= 0) bayrakBirak(p);   // bayrakla tünele girilmez
    } else if (m.tip === 'i') {
      if (oynuyor) p.itmeIstek = true;
    } else if (m.tip === 'balta') {
      if (!oynuyor || p.sersem > 0 || sn() - p.sonBalta < BALTA_BEKLE) return;
      if (typeof m.yaw === 'number' && isFinite(m.yaw)) p.yaw = m.yaw;
      p.sonBalta = sn(); baltaAt(p, p.ad); p.eylem = { a: 'b' };
    } else if (m.tip === 'barikat') {
      if (!oynuyor || p.sersem > 0 || p.barikatHak <= 0 || sn() - p.sonBarikat < 0.8) return;
      if (typeof m.yaw === 'number' && isFinite(m.yaw)) p.yaw = m.yaw;
      if (barikatKoy(p)) { p.barikatHak--; p.sonBarikat = sn(); p.eylem = { a: 'r' }; cb.kisiye(p.id, { tip: 'hak', barikat: p.barikatHak }); }
      else cb.kisiye(p.id, { tip: 'uyari', metin: 'Buraya barikat konmaz' });
    } else if (m.tip === 'mancinik') {
      if (!oynuyor || p.sersem > 0) return;
      const tx = +m.tx, tz = +m.tz;
      if (tasAt(p, tx, tz, p.ad)) p.eylem = { a: 'm', tx: r2(tx), tz: r2(tz) };
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

  return { baslat, durdur, adim, girdi, cikis, gucVer: (no, tur) => o && gucVer(o.oyuncular[no], tur), get durum() { return o; }, DT, GUCLER };
})();
if (typeof module !== 'undefined') module.exports = Motor;
