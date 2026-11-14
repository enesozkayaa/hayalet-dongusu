// =============================================================
// Hayalet Döngüsü - cüce karakteri (Three.js şekillerinden)
// Boy ~1 m. Takım rengi tunik, boynuzlu miğfer, kocaman sakal.
// Hayalet sürümü yarı saydam ve parlak; paradoksta kırmızıya döner.
// =============================================================

const Cuce = (() => {
  const TAKIM = [0xd8402a, 0x2f6fd8];
  const TAKIM_ACIK = [0xff9a80, 0x8ab8ff];
  const SAKAL = [0xe8e0d0, 0xb5651d, 0x8a4b20, 0xd8a040, 0x5a3a20, 0xb0b0b0, 0xe07a2a, 0x3a2a20];
  const TEN = [0xf1c39b, 0xe0a87c, 0xc68a5e, 0xf5d0b0];
  const geo = {
    bacak: new THREE.BoxGeometry(0.15, 0.3, 0.17),
    cizme: new THREE.BoxGeometry(0.17, 0.1, 0.24),
    govde: new THREE.CylinderGeometry(0.21, 0.28, 0.42, 10),
    kemer: new THREE.CylinderGeometry(0.285, 0.285, 0.07, 10),
    toka: new THREE.BoxGeometry(0.1, 0.08, 0.04),
    kol: new THREE.CylinderGeometry(0.065, 0.06, 0.3, 6),
    el: new THREE.SphereGeometry(0.075, 8, 6),
    bas: new THREE.SphereGeometry(0.2, 14, 10),
    burun: new THREE.SphereGeometry(0.065, 8, 6),
    goz: new THREE.SphereGeometry(0.025, 6, 4),
    sakal: new THREE.ConeGeometry(0.2, 0.42, 10),
    bigik: new THREE.CapsuleGeometry(0.035, 0.12, 3, 6),
    migfer: new THREE.SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    serit: new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14),
    boynuz: new THREE.ConeGeometry(0.045, 0.2, 6),
  };

  function yap({ takim = 0, tohum = 0, hayalet = false } = {}) {
    const g = new THREE.Group();
    const mats = [];
    const m = (renk, ek = {}) => {
      const mt = hayalet
        ? new THREE.MeshStandardMaterial({ color: TAKIM_ACIK[takim], emissive: TAKIM[takim], emissiveIntensity: 0.55, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.5 })
        : new THREE.MeshStandardMaterial({ color: renk, roughness: 0.8, ...ek });
      mats.push(mt);
      return mt;
    };
    const ekle = (geo_, mat, x, y, z, ust = g) => { const k = new THREE.Mesh(geo_, mat); k.position.set(x, y, z); k.castShadow = !hayalet; ust.add(k); return k; };
    const ten = TEN[tohum % TEN.length], sakal = SAKAL[(tohum * 3 + 1) % SAKAL.length];
    const tunik = m(TAKIM[takim]), deri = m(0x5a3a1e), tenM = m(ten), sakalM = m(sakal), metal = m(0xa8acb4, { metalness: 0.6, roughness: 0.35 });
    // Bacaklar (kalçadan döner)
    const bacak = s => { const p = new THREE.Group(); p.position.set(s * 0.1, 0.34, 0); g.add(p); ekle(geo.bacak, m(0x4a3a2a), 0, -0.15, 0, p); ekle(geo.cizme, deri, 0, -0.29, 0.03, p); return p; };
    const bacakL = bacak(1), bacakR = bacak(-1);
    ekle(geo.govde, tunik, 0, 0.55, 0);
    ekle(geo.kemer, deri, 0, 0.42, 0);
    ekle(geo.toka, m(0xffc63a, { metalness: 0.5 }), 0, 0.42, 0.28);
    // Kollar (omuzdan döner)
    const kol = s => { const p = new THREE.Group(); p.position.set(s * 0.27, 0.72, 0); g.add(p); const k = ekle(geo.kol, tunik, 0, -0.14, 0, p); k.rotation.z = s * 0.12; ekle(geo.el, tenM, s * 0.02, -0.3, 0, p); return p; };
    const kolL = kol(1), kolR = kol(-1);
    // Baş
    const bas = new THREE.Group(); bas.position.set(0, 0.93, 0); g.add(bas);
    ekle(geo.bas, tenM, 0, 0, 0, bas);
    ekle(geo.burun, m(0xe08a70), 0, -0.02, 0.2, bas);
    const gozM = m(0x111111);
    ekle(geo.goz, gozM, 0.075, 0.04, 0.18, bas); ekle(geo.goz, gozM, -0.075, 0.04, 0.18, bas);
    const sk = ekle(geo.sakal, sakalM, 0, -0.2, 0.12, bas); sk.rotation.x = Math.PI - 0.25;
    [1, -1].forEach(s => { const b = ekle(geo.bigik, sakalM, s * 0.08, -0.07, 0.19, bas); b.rotation.z = s * 1.2; });
    ekle(geo.migfer, metal, 0, 0.03, 0, bas);
    ekle(geo.serit, m(0x7a5a2a), 0, 0.04, 0, bas);
    [1, -1].forEach(s => { const b = ekle(geo.boynuz, m(0xf0e6cf), s * 0.22, 0.13, 0, bas); b.rotation.z = -s * 0.9; });
    g.userData = { bacakL, bacakR, kolL, kolR, bas, mats, hayalet, takim, faz: Math.random() * 6, itme: 0, renk: null };
    return g;
  }

  // hareket: 0 duruyor, 1 yürüyor. sersem: başı döner. itme: 0..1 (yumruk ileri)
  function canlandir(g, dt, hareket, { sersem = false, tasiyor = false } = {}) {
    const u = g.userData;
    u.faz += dt * (hareket ? 11 : 2);
    const s = Math.sin(u.faz);
    if (hareket) {
      u.bacakL.rotation.x = s * 0.7; u.bacakR.rotation.x = -s * 0.7;
      u.kolL.rotation.x = -s * 0.6; u.kolR.rotation.x = s * 0.6;
    } else {
      u.bacakL.rotation.x *= 0.8; u.bacakR.rotation.x *= 0.8;
      u.kolL.rotation.x = Math.sin(u.faz) * 0.05; u.kolR.rotation.x = -Math.sin(u.faz) * 0.05;
    }
    if (tasiyor) u.kolL.rotation.x = -2.6;   // bayrağı havaya kaldırır
    if (u.itme > 0) {
      u.itme = Math.max(0, u.itme - dt * 3);
      const v = Math.sin(u.itme * Math.PI);
      u.kolR.rotation.x = -1.5 * v - 0.2; if (!tasiyor) u.kolL.rotation.x = -1.5 * v - 0.2;
    }
    u.bas.rotation.y = sersem ? Math.sin(u.faz * 4) * 0.6 : u.bas.rotation.y * 0.8;
    u.bas.position.y = 0.93 + (hareket ? Math.abs(s) * 0.03 : 0);
  }
  function it(g) { g.userData.itme = 1; }
  // Hayalet rengini değiştir (paradoks: kırmızı titreme)
  function boya(g, durum, zaman) {
    const u = g.userData;
    if (!u.hayalet) return;
    const anahtar = durum === 1 ? 'kirmizi' : 'normal';
    u.mats.forEach(mt => {
      if (durum === 1) { mt.color.setHex(0xff3a2a); mt.emissive.setHex(0xff0000); mt.opacity = 0.25 + 0.35 * Math.abs(Math.sin(zaman * 25)); }
      else if (u.renk !== anahtar) { mt.color.setHex(TAKIM_ACIK[u.takim]); mt.emissive.setHex(TAKIM[u.takim]); mt.opacity = 0.5; }
    });
    u.renk = anahtar;
  }
  return { yap, canlandir, it, boya, TAKIM, TAKIM_ACIK };
})();
