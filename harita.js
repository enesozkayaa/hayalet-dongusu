// =============================================================
// Hayalet Döngüsü - harita (hem ev/motor hem çizim hem de Node testleri kullanır)
// Zemin düz (y = 0). Takım 0 kırmızı (güney, z < 0), takım 1 mavi (kuzey, z > 0).
// Ortada nehir, üstünde iki asma köprü. Köprü sadece bir levhaya basılırken iner.
// Kale kapısı: kendi takımın geçer; düşman ancak kapı açıkken geçer.
// Kapıyı dışarıdaki levhaya basan biri ya da kapıya yaklaşan kale sahibi açar.
// =============================================================

const Harita = (() => {
  const SX = 30, SZ = 44;            // oyun alanı: x ∈ [-SX, SX], z ∈ [-SZ, SZ]
  const NEHIR = 3;                   // nehir: |z| < NEHIR
  const KOPRU_YARI = 2;              // köprü genişliği 4 m
  const KOPRULER = [-10, 10];        // köprülerin x konumları
  const KALE_ON = 22, KALE_ARKA = 38, KALE_YARI = 10, DUVAR = 0.6, KAPI_YARI = 2;
  const isaret = t => (t === 0 ? -1 : 1);

  const kutular = [];                // duvarlar: { x1, x2, z1, z2, kapi?: takım }
  const daireler = [];               // kuleler, kayalar, ağaçlar: { x, z, r, tur }
  const kutu = (x1, x2, z1, z2, ek = {}) => kutular.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), z1: Math.min(z1, z2), z2: Math.max(z1, z2), ...ek });

  // Dış sınırlar
  kutu(-SX - 2, SX + 2, -SZ - 2, -SZ); kutu(-SX - 2, SX + 2, SZ, SZ + 2);
  kutu(-SX - 2, -SX, -SZ, SZ); kutu(SX, SX + 2, -SZ, SZ);

  // Kaleler
  [0, 1].forEach(t => {
    const s = isaret(t), on = s * KALE_ON, arka = s * KALE_ARKA, Y = KALE_YARI;
    kutu(-Y - DUVAR, Y + DUVAR, arka - DUVAR, arka + DUVAR);                 // arka duvar
    kutu(-Y - DUVAR, -Y + DUVAR, on, arka); kutu(Y - DUVAR, Y + DUVAR, on, arka);   // yan duvarlar
    kutu(-Y - DUVAR, -KAPI_YARI, on - DUVAR, on + DUVAR);                    // ön duvar (kapının iki yanı)
    kutu(KAPI_YARI, Y + DUVAR, on - DUVAR, on + DUVAR);
    kutu(-KAPI_YARI, KAPI_YARI, on - DUVAR, on + DUVAR, { kapi: t });        // kale kapısı
    [[-Y, on], [Y, on], [-Y, arka], [Y, arka]].forEach(([x, z]) => daireler.push({ x, z, r: 1.7, tur: 'kule' }));
    // Kapının iki yanında küçük kuleler
    [-KAPI_YARI - 0.9, KAPI_YARI + 0.9].forEach(x => daireler.push({ x, z: on, r: 0.9, tur: 'kapiKule' }));
  });

  // Kale ile nehir arasındaki kayalar ve ağaçlar (180° dönük simetrik)
  const susler = [
    [0, 11, 1.4, 'kaya'], [-19, 15, 1.3, 'kaya'], [22, 13, 1.1, 'kaya'], [-4, 16.5, 0.8, 'kaya'],
    [-25, 7, 0.7, 'agac'], [25, 18, 0.7, 'agac'], [-14, 9, 0.7, 'agac'], [14, 26, 0.7, 'agac'],
    [-17, 30, 0.7, 'agac'], [-24, 26, 0.7, 'agac'], [21, 34, 0.7, 'agac'], [-14, 40, 0.7, 'agac'],
  ];
  susler.forEach(([x, z, r, tur]) => { daireler.push({ x, z: -z, r, tur }); daireler.push({ x: -x, z, r, tur }); });

  // Basma levhaları
  const levhalar = [];
  KOPRULER.forEach((bx, i) => [-7, 7].forEach(z => levhalar.push({ x: bx + Math.sign(bx) * 8, z, r: 1.1, tur: 'kopru', i })));
  [0, 1].forEach(t => levhalar.push({ x: t === 0 ? 8 : -8, z: isaret(t) * (KALE_ON - 4.5), r: 1.1, tur: 'kapi', i: t }));

  // Mancınıklar: kale avlusunda, kapının yanında. Yanına gelip (2,2 m) ateşlenir.
  const MANCINIKLAR = [0, 1].map(t => ({ t, x: t === 0 ? -6 : 6, z: isaret(t) * 26.5 }));
  MANCINIKLAR.forEach(m => daireler.push({ x: m.x, z: m.z, r: 0.9, tur: 'mancinik' }));
  const MANCINIK_MENZIL = [8, 48];

  // Sal: iki köprünün ortasında (x = 0) nehri karşıdan karşıya gidip gelir. Konumu tur zamanına bağlı.
  const SAL = { yariX: 1.5, yariZ: 1.15, genlik: NEHIR - 1.15 + 0.05, periyot: 10 };
  const salZ = t => SAL.genlik * Math.max(-1, Math.min(1, 1.35 * Math.sin(t * Math.PI * 2 / SAL.periyot)));
  const salUstunde = (x, z, t, pay = 0) => Math.abs(x) < SAL.yariX + pay && Math.abs(z - salZ(t)) < SAL.yariZ + pay;

  // Tuzak kapaklar: kale avlusunda, kapı ile bayrak arasında. Düşman basınca açılır.
  const KAPAKLAR = [];
  [0, 1].forEach(t => [[-1.5, 25.5], [1.5, 25.5], [0, 27.4]].forEach(([x, z]) => KAPAKLAR.push({ t, x, z: isaret(t) * z, yari: 0.8 })));
  const kapakUstunde = (k, x, z) => Math.abs(x - k.x) < k.yari && Math.abs(z - k.z) < k.yari;

  // Gizli tüneller: haritanın iki kenarında, nehrin altından karşı kıyıya
  const TUNELLER = [];
  [-1, 1].forEach(yan => [-1, 1].forEach(s => TUNELLER.push({ x: yan * 27.6, z: s * 12, r: 0.95, hedef: { x: yan * 25.6, z: -s * 12 } })));

  // Hazine sandığı çıkabilecek yerler (180° simetrik çiftler)
  const SANDIK_YERLERI = [[-15, -17], [24, -24], [-6, -8], [20, -4], [-24, -6], [9, -14], [-17, -24], [16, -33]];
  const sandikYerleri = []; SANDIK_YERLERI.forEach(([x, z]) => { sandikYerleri.push({ x, z }); sandikYerleri.push({ x: -x, z: -z }); });

  // Barikat: oyuncunun önüne konan 2,2 m'lik tahta engel. Sadece düşmanı durdurur.
  const BARIKAT = { yariU: 1.1, yariK: 0.25 };
  function barikatYakin(b, x, z) {   // noktanın barikata göre yerel koordinatı
    const fx = Math.sin(b.a), fz = Math.cos(b.a), rx = Math.cos(b.a), rz = -Math.sin(b.a), dx = x - b.x, dz = z - b.z;
    return { u: dx * rx + dz * rz, k: dx * fx + dz * fz, rx, rz, fx, fz };
  }
  const barikatIcinde = (b, x, z, pay = 0) => { const l = barikatYakin(b, x, z); return Math.abs(l.u) < BARIKAT.yariU + pay && Math.abs(l.k) < BARIKAT.yariK + pay; };

  const kapiMerkez = t => ({ x: 0, z: isaret(t) * KALE_ON });
  const bayrakYeri = t => ({ x: 0, z: isaret(t) * 29.5 });
  // Doğma yerleri: kalenin arkasında 8 x 3 yer. slot = oyuncunun takımdaki sırası * 6 + tur
  function dogus(t, slot) {
    slot = ((slot % 24) + 24) % 24;
    const sut = slot % 8, sira = Math.floor(slot / 8), s = isaret(t);
    return { x: (-7.7 + sut * 2.2) * s, z: s * (35.5 - sira * 1.5), yaw: t === 0 ? 0 : Math.PI };
  }

  const nehirde = (x, z) => Math.abs(z) < NEHIR;
  const kopruUstunde = (x, i) => Math.abs(x - KOPRULER[i]) < KOPRU_YARI;
  // kopru: [0..1, 0..1] (1 = tamamen inik). İnik köprünün ve salın üstü dışında nehre basan düşer.
  // t: turun kaçıncı saniyesi (sal için). salPay: gecikmeye karşı sal biraz daha büyük sayılır.
  function duser(x, z, kopru, t = null, salPay = 0) {
    if (!nehirde(x, z)) return false;
    if (t !== null && salUstunde(x, z, t, salPay)) return false;
    for (let i = 0; i < KOPRULER.length; i++) if (kopru[i] >= 0.9 && kopruUstunde(x, i)) return false;
    return true;
  }
  const kapiIcinde = (x, z, t, pay = 0) => Math.abs(x) < KAPI_YARI + pay && Math.abs(z - isaret(t) * KALE_ON) < DUVAR + pay;
  // Düşman için kapı geçilebilir mi
  const kapiGecer = (t, takim, kapi) => t === takim || kapi[t] >= 0.8;

  // Çember (x, z, r) duvarlardan itilir. takim/kapi verilirse kapalı düşman kapısı da duvar sayılır.
  function it(x, z, r, takim = -1, kapi = [1, 1], barikatlar = null) {
    for (let tekrar = 0; tekrar < 3; tekrar++) {
      for (const k of kutular) {
        if (k.kapi !== undefined && kapiGecer(k.kapi, takim, kapi)) continue;
        const px = Math.max(k.x1, Math.min(x, k.x2)), pz = Math.max(k.z1, Math.min(z, k.z2));
        let dx = x - px, dz = z - pz; const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-6) { x = px + dx / d * r; z = pz + dz / d * r; continue; }
        // merkez kutunun içinde: en yakın kenardan çıkar
        const a = [x - k.x1 + r, k.x2 - x + r, z - k.z1 + r, k.z2 - z + r], m = Math.min(...a);
        if (m === a[0]) x = k.x1 - r; else if (m === a[1]) x = k.x2 + r; else if (m === a[2]) z = k.z1 - r; else z = k.z2 + r;
      }
      for (const c of daireler) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-6) { x = c.x + dx / d * m; z = c.z + dz / d * m; }
      }
      if (barikatlar) for (const b of barikatlar) {
        if (b.takim === takim) continue;   // kendi takımının barikatından geçersin
        const l = barikatYakin(b, x, z);
        const cu = Math.max(-BARIKAT.yariU, Math.min(BARIKAT.yariU, l.u)), ck = Math.max(-BARIKAT.yariK, Math.min(BARIKAT.yariK, l.k));
        const du = l.u - cu, dk = l.k - ck, d = Math.hypot(du, dk);
        if (d >= r) continue;
        let yu, yk;
        if (d < 1e-6) { yu = l.u; yk = l.k >= 0 ? BARIKAT.yariK + r : -BARIKAT.yariK - r; }   // içindeyse ön/arka yüzden çıkar
        else { yu = cu + du / d * r; yk = ck + dk / d * r; }
        x = b.x + yu * l.rx + yk * l.fx; z = b.z + yu * l.rz + yk * l.fz;
      }
    }
    return { x, z };
  }
  // Bir nokta duvarın/kulenin içinde mi (kamera için). pay: duvara bu kadar yaklaşınca da "içeride" say.
  function dolu(x, z, pay = 0, y = 0) {
    for (const k of kutular) if (x > k.x1 - pay && x < k.x2 + pay && z > k.z1 - pay && z < k.z2 + pay) return true;
    for (const c of daireler) if (c.tur !== 'agac' && !(c.tur === 'kaya' && y > c.r * 1.1) && Math.hypot(x - c.x, z - c.z) < c.r + pay) return true;
    return false;
  }

  return {
    SX, SZ, NEHIR, KOPRU_YARI, KOPRULER, KALE_ON, KALE_ARKA, KALE_YARI, DUVAR, KAPI_YARI,
    kutular, daireler, levhalar, isaret, kapiMerkez, bayrakYeri, dogus,
    nehirde, duser, kapiIcinde, kapiGecer, it, dolu,
    MANCINIKLAR, MANCINIK_MENZIL, SAL, salZ, salUstunde, KAPAKLAR, kapakUstunde, TUNELLER, sandikYerleri, BARIKAT, barikatIcinde,
  };
})();
if (typeof module !== 'undefined') module.exports = Harita;
