// =============================================================
// Hayalet Döngüsü - oyuncunun tarafı: ekranlar, bekleme odası, girdi,
// kamera, karakterlerin çizimi, harita ve mesajlar.
// Kendi konumunu oyuncu hesaplar ve eve yollar; kurallar motorda (ev).
// =============================================================

const Oyun = (() => {
  const $ = id => document.getElementById(id);
  const H = Harita;
  const kanvas = $('sahne');
  Sahne.kur(kanvas);
  const dokun = matchMedia('(pointer: coarse)').matches;
  if (dokun) document.body.classList.add('dokun');

  const HIZ = 5, TASIMA = 0.85, YARICAP = 0.35, ITME_BEKLE = 1200, BALTA_BEKLE = 4000, ATILMA_BEKLE = 3000, ATILMA_SURE = 0.22, ATILMA_HIZ = 15, TUNEL_SURE = 2.5;
  const GUC_KOD = ['', 'hiz', 'kalkan', 'gorunmez', 'dur', 'cekic'];
  const GUC_EMOJI = { hiz: '👟', kalkan: '🛡️', gorunmez: '👻', dur: '⏸️', cekic: '🔨' };
  const GUC_AD = { hiz: 'Hız çizmesi', kalkan: 'Kalkan', gorunmez: 'Görünmezlik pelerini', dur: 'Zaman durdurucu', cekic: 'Dev çekiç' };
  const GUC_ACIKLAMA = { hiz: '6 sn çok hızlı koşarsın', kalkan: '8 sn itilmezsin, balta ve taş işlemez', gorunmez: '6 sn rakipler seni göremez', dur: 'Rakip hayaletler 4 sn donar, sonra geriden gelir', cekic: 'Bir sonraki itmen etrafındaki herkesi uçurur' };
  const TAKIM_AD = ['Kırmızı', 'Mavi'], TAKIM_EMOJI = ['🔴', '🔵'];
  let mod = null;                     // 'tek' | 'ev' | 'misafir'
  let benimId = null;
  let lobi = { takim: {}, ayar: { mod: 'rakip', sure: 45, tur: 5, paradoks: true } };
  let oyun = null;
  const tuslar = new Set();
  const varliklar = new Map();        // 'o3' / 'h5' → { g, x, z, yaw, hx, hz, hyaw, h, ... }
  const kacis = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Giriş ----------
  try { $('adim').value = localStorage.getItem('hd.ad') || ''; } catch (e) { }
  function adAl() {
    const ad = $('adim').value.trim().slice(0, 14);
    if (!ad) { $('girisDurum').textContent = 'Önce adını yaz.'; $('adim').focus(); return null; }
    try { localStorage.setItem('hd.ad', ad); } catch (e) { }
    Ses.baslat();
    return ad;
  }
  $('odaKurBtn').onclick = () => { const ad = adAl(); if (!ad) return; mod = 'ev'; $('girisDurum').textContent = 'Oda açılıyor…'; Ag.odaAc(ad); };
  $('katilBtn').onclick = () => {
    const ad = adAl(); if (!ad) return;
    const kod = $('odaKoduGir').value.trim().toUpperCase();
    if (kod.length < 5) { $('girisDurum').textContent = 'Oda kodunu yaz (5 harf).'; return; }
    mod = 'misafir'; $('girisDurum').textContent = 'Bağlanılıyor…'; Ag.katil(kod, ad);
  };
  $('odaKoduGir').addEventListener('keydown', e => { if (e.key === 'Enter') $('katilBtn').click(); });
  $('tekBtn').onclick = () => {
    const ad = adAl(); if (!ad) return;
    mod = 'tek'; benimId = 'ben';
    lobi = { takim: { ben: 0 }, ayar: { ...lobi.ayar, mod: 'birlikte' } };
    ekranGoster('lobi'); lobiCiz();
  };
  function ekranGoster(ad) {
    ['giris', 'lobi', 'sonuc'].forEach(e => $(e).classList.toggle('gizli', e !== ad));
    $('hud').classList.toggle('gizli', ad !== 'hud');
    if (ad !== 'hud') $('geriSar').classList.add('gizli');
  }

  // ---------- Ağ olayları ----------
  Ag.kabulKurali(n => (oyun ? 'Oyun başladı; bitince tekrar dene.' : n >= 8 ? 'Oda dolu (en fazla 8 kişi).' : true));
  Ag.duyulacaklariBelirle(() => {
    if (!oyun) return new Set(Ag.oyuncular.map(o => o.id));
    return new Set(oyun.oyuncular.filter(p => p.takim === oyun.takim).map(p => p.id));
  });
  Ag.on('oda', ({ kod }) => { benimId = Ag.benimId; $('lobiKod').textContent = kod; ekranGoster('lobi'); if (mod === 'ev') lobiDuzenle(); lobiCiz(); });
  Ag.on('hata', m => { $('girisDurum').textContent = m; $('lobiDurum').textContent = m; });
  Ag.on('oyuncular', () => { if (mod === 'ev') lobiDuzenle(); else lobiCiz(); });
  Ag.on('mesaj', m => mesaj(m));
  Ag.on('evMesaj', (m, id) => {
    if (m.tip === 'takimSec') { if (!oyun && (m.t === 0 || m.t === 1)) { lobi.takim[id] = m.t; lobiYay(); } return; }
    if (oyun && !oyun.bitti) Motor.girdi(id, m);
  });
  Ag.on('koptu', o => { if (mod === 'ev' && oyun && !oyun.bitti) Motor.cikis(o.id); });
  Ag.on('evKoptu', () => { menuyeDon('Oda sahibiyle bağlantı koptu.'); });

  // ---------- Bekleme odası ----------
  const oyuncuListesi = () => (mod === 'tek' ? [{ id: 'ben', ad: $('adim').value.trim() || 'Ben' }] : Ag.oyuncular);
  const yonetici = () => mod === 'tek' || mod === 'ev';
  function lobiDuzenle() {
    const ids = new Set(Ag.oyuncular.map(o => o.id));
    Object.keys(lobi.takim).forEach(id => { if (!ids.has(id)) delete lobi.takim[id]; });
    Ag.oyuncular.forEach(o => {
      if (lobi.takim[o.id] !== undefined) return;
      const say = [0, 1].map(t => Object.values(lobi.takim).filter(x => x === t).length);
      lobi.takim[o.id] = say[1] < say[0] ? 1 : 0;
    });
    lobiYay();
  }
  function lobiYay() {
    if (mod === 'ev') Ag.yayinla({ tip: 'lobi', takim: lobi.takim, ayar: lobi.ayar });
    else lobiCiz();
  }
  function lobiCiz() {
    const birlikte = lobi.ayar.mod === 'birlikte';
    const L = oyuncuListesi();
    [0, 1].forEach(t => {
      $('liste' + t).innerHTML = L.filter(p => (birlikte ? 0 : lobi.takim[p.id] ?? 0) === t)
        .map(p => `<li>${p.id === benimId ? '⭐ ' : ''}${kacis(p.ad)}${p.ses ? ' 🎤' : ''}</li>`).join('');
      $('takim' + t + 'Btn').classList.toggle('gizli', birlikte || (lobi.takim[benimId] ?? 0) === t);
    });
    document.querySelector('.takimlar').classList.toggle('birlikte', birlikte);
    const a = lobi.ayar;
    $('ayMod').value = a.mod; $('aySure').value = String(a.sure); $('ayTur').value = String(a.tur); $('ayParadoks').value = a.paradoks ? '1' : '0';
    ['ayMod', 'aySure', 'ayTur', 'ayParadoks'].forEach(id => { $(id).disabled = !yonetici() || (mod === 'tek' && id === 'ayMod'); });
    $('ayarOzet').textContent = `${a.tur ? a.tur + ' tur' : '♾️ Sonsuz tur'} × ${a.sure} sn · Paradoks ${a.paradoks ? 'açık' : 'kapalı'}`;
    $('baslaBtn').classList.toggle('gizli', !yonetici());
    $('lobiMikBtn').classList.toggle('gizli', mod === 'tek');
    document.querySelector('.kodKutu').classList.toggle('gizli', mod === 'tek');
    $('lobiDurum').textContent = yonetici() ? (mod === 'tek' ? 'Tek başına: düşman kalesi boş. Hayaletlerinle bayrağı kaçırmaya çalış.' : 'Arkadaşların oda koduyla katılabilir.') : 'Oda sahibi oyunu başlatacak…';
  }
  [0, 1].forEach(t => {
    $('takim' + t + 'Btn').onclick = () => {
      if (mod === 'ev') { lobi.takim[benimId] = t; lobiYay(); }
      else if (mod === 'misafir') Ag.eveGonder({ tip: 'takimSec', t });
    };
  });
  ['ayMod', 'aySure', 'ayTur', 'ayParadoks'].forEach(id => $(id).addEventListener('change', () => {
    if (!yonetici()) return;
    lobi.ayar = { mod: mod === 'tek' ? 'birlikte' : $('ayMod').value, sure: +$('aySure').value, tur: +$('ayTur').value, paradoks: $('ayParadoks').value === '1' };
    lobiYay();
  }));
  $('kodKopyalaBtn').onclick = () => { navigator.clipboard?.writeText(Ag.kod).then(() => { $('lobiDurum').textContent = 'Kod kopyalandı.'; }).catch(() => {}); };
  $('lobiCikBtn').onclick = () => menuyeDon('');
  $('lobiMikBtn').onclick = mikDegistir;
  $('baslaBtn').onclick = () => {
    if (!yonetici()) return;
    const birlikte = lobi.ayar.mod === 'birlikte';
    const liste = oyuncuListesi().map(p => ({ id: p.id, ad: p.ad, takim: birlikte ? 0 : (lobi.takim[p.id] ?? 0) }));
    if (!birlikte && (!liste.some(p => p.takim === 0) || !liste.some(p => p.takim === 1))) { $('lobiDurum').textContent = 'Rakip modda iki takımda da en az bir kişi olmalı (tek kişiysen “Birlikte” modunu seç).'; return; }
    const geri = mod === 'tek'
      ? { herkese: m => mesaj(m), kisiye: (id, m) => mesaj(m) }
      : { herkese: m => Ag.yayinla(m), kisiye: (id, m) => (id === Ag.benimId ? mesaj(m) : Ag.gonderId(id, m)) };
    Motor.baslat(liste, lobi.ayar, geri);
  };
  function menuyeDon(neden) {
    Motor.durdur();
    if (mod !== 'tek') Ag.kapat();
    oyunTemizle();
    mod = null;
    ekranGoster('giris');
    $('girisDurum').textContent = neden || '';
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------- Oyun ----------
  function eveGonder(m) { if (mod === 'tek') Motor.girdi('ben', m); else Ag.eveGonder(m); }

  function adEtiketi(ad, renk, opak = 1) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 34px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(ad, 128, 32);
    x.fillStyle = renk; x.fillText(ad, 128, 32);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: opak, depthWrite: false }));
    s.scale.set(1.8, 0.45, 1); s.position.y = 1.45; return s;
  }
  function oyunTemizle() {
    varliklar.forEach(v => Sahne.scene.remove(v.g));
    varliklar.clear();
    oyun = null;
    document.body.classList.remove('tekrarda'); $('tekrarKutu').classList.add('gizli'); Sahne.nisanGoster(null); Sahne.dinamik({});
    Ag.sesGuncelle?.();
  }
  function oyunKur(m) {
    oyunTemizle();
    const ben = m.oyuncular.find(p => p.id === benimId);
    oyun = {
      oyuncular: m.oyuncular, ayar: m.ayar, benimNo: ben ? ben.no : -1, takim: ben ? ben.takim : 0,
      x: 0, z: 0, yaw: 0, pitch: 0.35, faz: 'hazir', tur: 0, snap: null, snapZaman: 0,
      sersem: 0, dus: false, dusY: 0, itilme: null, sonGonder: 0, sonIt: 0, tasiyor: false, hayaletler: [], bitti: false, kopruOnce: [0, 0],
      barikatlar: [], barikatHak: 2, sonBalta: 0, sonAtilma: 0, atilma: 0, guc: null, tunel: null, tunelBekle: 0, ts: 0, tsZaman: 0, tampon: [], tekrar: null, sarsinti: 0,
    };
    m.oyuncular.forEach(p => {
      const g = Cuce.yap({ takim: p.takim, tohum: p.no });
      if (p.no !== oyun.benimNo) g.add(adEtiketi(p.ad, p.takim === 0 ? '#ff9a80' : '#9ac0ff'));
      Sahne.scene.add(g);
      varliklar.set('o' + p.no, { g, x: 0, z: 0, yaw: 0, hx: 0, hz: 0, hyaw: 0, h: 0, takim: p.takim, ad: p.ad, oyuncu: true });
    });
    $('takimRozet').className = 't' + oyun.takim;
    $('takimRozet').textContent = `${TAKIM_EMOJI[oyun.takim]} ${TAKIM_AD[oyun.takim]} Takım`;
    $('akis').innerHTML = '';
    ekranGoster('hud');
    $('harita').classList.remove('buyuk');
    Ag.sesGuncelle?.();
    mikButon();
  }

  function mesaj(m) {
    switch (m.tip) {
      case 'lobi': lobi = { takim: m.takim, ayar: m.ayar }; lobiCiz(); break;
      case 'basla': oyunKur(m); break;
      case 'tur': if (oyun) turGeldi(m); break;
      case 'dogus': if (oyun) { Object.assign(oyun, { x: m.x, z: m.z, yaw: m.yaw, yon: m.yaw, dus: false, dusY: 0, itilme: null, sersem: 0 }); oyun.pitch = 0.35; } break;
      case 'faz': if (oyun) fazGeldi(m.faz); break;
      case 'd': if (oyun) durumGeldi(m); break;
      case 'paradoks': if (oyun) {
        const v = varliklar.get('h' + m.i);
        if (v) { Sahne.paradoksEfekt(v.x, v.z); Ses.paradoks(yakinlik(v.x, v.z)); }
        akis(`⚡ PARADOKS! ${kacis(m.ad)} · ${m.tur}. tur hayaleti: ${kacis(m.neden)}`, 'paradoks');
        break;
      }
      case 'itme': if (oyun) {
        const v = varliklar.get(m.kim);
        if (v && m.kim !== 'o' + oyun.benimNo) Cuce.it(v.g);
        Sahne.itmeEfekt(m.x, m.z); Ses.itme(yakinlik(m.x, m.z));
        break;
      }
      case 'itildi': if (oyun) { oyun.itilme = { dx: m.dx, dz: m.dz, t: 0.25 }; oyun.sersem = 1.0; akis(`✊ ${kacis(m.ad)} seni itti!`, 'kotu'); } break;
      case 'dustu': if (oyun) {
        oyun.dus = true; oyun.dusY = 0; oyun.tunel = null;
        if (m.nereye === 'zindan') { buyukYazi('🪤 Tuzağa düştün!', '3 saniye zindanda kalacaksın', 2200); Ses.kapak(); }
        else buyukYazi('💦 Suya düştün!', '2 saniye sonra kalende doğacaksın', 1800);
        break;
      }
      case 'firlat': if (oyun) {
        if (m.ne === 'tas') { Sahne.mancinikAt(m.t); Ses.mancinik(yakinlik(m.x, m.z)); }
        else { const v = varliklar.get(m.kim); if (v && m.kim !== 'o' + oyun.benimNo) Cuce.it(v.g); Ses.balta(yakinlik(m.x, m.z)); }
        break;
      }
      case 'vurus': if (oyun) {
        Sahne.vurusEfekt(m.x, m.z, m.ne === 'hayalet' ? 0xff3a2a : 0xffffff); Ses.vurus(yakinlik(m.x, m.z));
        if (m.ne === 'oyuncu') akis(`🪓 ${kacis(m.kim)} → ${kacis(m.ad)}`);
        break;
      }
      case 'patlama': if (oyun) {
        Sahne.patlama(m.x, m.z, m.su); Ses.patlama(yakinlik(m.x, m.z));
        const uz = Math.hypot(m.x - oyun.x, m.z - oyun.z); if (uz < 18) oyun.sarsinti = Math.max(oyun.sarsinti, 0.5 * (1 - uz / 18));
        if (m.kopru >= 0) akis(`💥🌉 ${kacis(m.ad)} mancınıkla köprüyü kırdı! (6 sn)`, 'kotu');
        break;
      }
      case 'barikat': if (oyun) Ses.barikat(yakinlik(m.x, m.z)); break;
      case 'kapak': if (oyun) { akis(`🪤 ${kacis(m.ad)} tuzak kapaktan zindana düştü!`); const k = H.KAPAKLAR[m.i]; if (k) Ses.kapak(yakinlik(k.x, k.z)); } break;
      case 'sandikCikti': if (oyun) { Ses.sandik(0.4); } break;
      case 'guc': if (oyun) {
        const v = varliklar.get('o' + m.no); if (v) Sahne.sandikEfekt(v.x, v.z);
        if (m.no !== oyun.benimNo) akis(`🎁 ${kacis(m.ad)}: ${GUC_EMOJI[m.tur]} ${GUC_AD[m.tur]}`, m.takim === oyun.takim ? 'iyi' : '');
        if (m.tur === 'dur') akis(`⏸️ ${m.takim === oyun.takim ? 'Rakip' : 'Takımının'} hayaletleri 4 sn dondu!`, m.takim === oyun.takim ? 'iyi' : 'kotu');
        break;
      }
      case 'gucAl': if (oyun) { oyun.guc = { tur: m.tur, bitis: performance.now() + m.sure * 1000 }; buyukYazi(`${GUC_EMOJI[m.tur]} ${GUC_AD[m.tur]}`, GUC_ACIKLAMA[m.tur], 2200); Ses.sandik(1); } break;
      case 'kalkan': if (oyun) { const v = varliklar.get('o' + m.no); if (v) Sahne.vurusEfekt(v.x, v.z, 0x8ad8ff); Ses.vurus(0.6); } break;
      case 'hak': if (oyun) { oyun.barikatHak = m.barikat; yetenekCiz(); } break;
      case 'uyari': if (oyun) akis(`⚠️ ${kacis(m.metin)}`, 'kotu'); break;
      case 'sicrama': if (oyun) { Sahne.sicrama(m.x, m.z); Ses.sicrama(yakinlik(m.x, m.z)); akis(`💦 ${kacis(m.ad)} suya düştü`); } break;
      case 'bayrak': if (oyun) bayrakOlayi(m); break;
      case 'cikti': if (oyun) { akis(`🚪 ${kacis(m.ad)} oyundan çıktı`); const v = varliklar.get('o' + m.no); if (v) { Sahne.scene.remove(v.g); varliklar.delete('o' + m.no); } } break;
      case 'bitti': if (oyun) oyunBitti(m); break;
    }
  }
  function turGeldi(m) {
    oyun.tur = m.tur; oyun.faz = 'hazir';
    Object.assign(oyun, { barikatHak: 2, guc: null, tunel: null, tunelBekle: 0, sonBalta: 0, sonAtilma: 0, atilma: 0, tampon: [] });
    yetenekCiz();
    $('geriSar').classList.add('gizli');
    // eski hayaletleri sil, yenilerini kur
    [...varliklar.keys()].filter(k => k[0] === 'h').forEach(k => { Sahne.scene.remove(varliklar.get(k).g); varliklar.delete(k); });
    oyun.hayaletler = m.hayaletler;
    m.hayaletler.forEach(h => {
      const p = oyun.oyuncular[h.sahip];
      const g = Cuce.yap({ takim: h.takim, tohum: h.sahip, hayalet: true });
      g.add(adEtiketi(`👻 ${h.sahip === oyun.benimNo ? 'Sen' : p ? p.ad : '?'} · ${h.tur}`, h.takim === 0 ? '#ffc0b0' : '#c0d8ff', 0.9));
      Sahne.scene.add(g);
      varliklar.set('h' + h.i, { g, x: 0, z: 0, yaw: 0, hx: 0, hz: 0, hyaw: 0, h: 0, takim: h.takim, durum: 0, ilk: true });
    });
    const benim = m.hayaletler.filter(h => h.sahip === oyun.benimNo).length;
    $('hayaletSay').textContent = `👻 ${benim} hayaletin var`;
    const turAd = `TUR ${m.tur} / ${m.toplam || '∞'}`;
    $('turYazi').textContent = turAd;
    buyukYazi(turAd, m.tur === 1 ? 'Bu turda ne yaparsan sonraki turlarda hayaletin aynısını yapacak' : `${benim} hayaletin geçen turlardaki gibi hareket edecek. Yollarını kesme!`, 2600);
    oyun.geriSay = 3;
  }
  function fazGeldi(f) {
    oyun.faz = f;
    if (f === 'oyun') { buyukYazi('BAŞLA!', '', 900); Ses.basla(); }
    if (f === 'sar') { $('geriSar').classList.remove('gizli'); Ses.geriSar(); if (document.pointerLockElement) { /* fare kilitli kalsın */ } }
  }
  function durumGeldi(d, tekrardan = false) {
    if (oyun.tekrar && !tekrardan) return;   // tekrar izlenirken canlı paketler yok sayılır
    if (!tekrardan && d.f === 'oyun') { oyun.tampon.push(d); if (oyun.tampon.length > 200) oyun.tampon.shift(); }
    oyun.snap = d; oyun.snapZaman = performance.now();
    oyun.ts = d.ts || 0; oyun.tsZaman = performance.now();
    oyun.barikatlar = [];
    for (let j = 0; j < (d.bk || []).length; j += 6) oyun.barikatlar.push({ x: d.bk[j + 1], z: d.bk[j + 2], a: d.bk[j + 3], takim: d.bk[j + 4] });
    Sahne.dinamik(d);
    if (d.f !== oyun.faz && d.f !== 'bitti') oyun.faz = d.f;
    Sahne.durum(d);
    // köprü sesi
    d.k.forEach((v, i) => {
      const once = oyun.kopruOnce[i];
      if ((once < 0.5) !== (v < 0.5)) Ses.kopru(yakinlik(H.KOPRULER[i], 0) * 0.8 + 0.2);
      oyun.kopruOnce[i] = v;
    });
    for (let j = 0; j < d.o.length; j += 9) {
      const no = d.o[j], v = varliklar.get('o' + no);
      if (v) v.guc = d.o[j + 8];
      if (no === oyun.benimNo && !tekrardan) { oyun.tasiyor = d.o[j + 6] >= 0; continue; }
      if (no === oyun.benimNo) { oyun.x = d.o[j + 1]; oyun.z = d.o[j + 2]; oyun.yon = d.o[j + 3]; oyun.tasiyor = d.o[j + 6] >= 0; oyun.yuruyor = d.o[j + 4] > 0; continue; }
      if (!v) continue;
      if (Math.hypot(d.o[j + 1] - v.hx, d.o[j + 2] - v.hz) > 6) { v.x = d.o[j + 1]; v.z = d.o[j + 2]; }
      Object.assign(v, { hx: d.o[j + 1], hz: d.o[j + 2], hyaw: d.o[j + 3], h: d.o[j + 4], sersem: d.o[j + 5], bayrak: d.o[j + 6], dus: d.o[j + 7] });
    }
    for (let j = 0; j < d.h.length; j += 8) {
      const v = varliklar.get('h' + d.h[j]); if (!v) continue;
      if (v.ilk || Math.hypot(d.h[j + 1] - v.hx, d.h[j + 2] - v.hz) > 6) { v.x = d.h[j + 1]; v.z = d.h[j + 2]; v.yaw = d.h[j + 3]; v.ilk = false; }
      Object.assign(v, { hx: d.h[j + 1], hz: d.h[j + 2], hyaw: d.h[j + 3], h: d.h[j + 4], durum: d.h[j + 5], gizli: d.h[j + 6], bayrak: d.h[j + 7] });
    }
    if (!tekrardan) hudGuncelle();
  }
  function bayrakOlayi(m) {
    const benim = m.t === oyun.takim;   // benim takımımın bayrağı mı
    const ad = `${TAKIM_EMOJI[m.t]} ${TAKIM_AD[m.t]} bayrak`;
    if (m.olay === 'aldi') { akis(`🚩 ${kacis(m.kim)} ${ad}ı kaptı!`, benim ? 'kotu' : 'iyi'); benim ? Ses.kotuHaber() : Ses.bayrak(); }
    if (m.olay === 'dustu') akis(`🚩 ${ad} yere düştü (${kacis(m.kim)})`);
    if (m.olay === 'eve') akis(m.neden === 'zindan' ? `🚩 ${ad} kaleye geri döndü` : `🚩 ${ad} suya düştü, kaleye döndü`);
    if (m.olay === 'kurtardi') { akis(`🛡️ ${kacis(m.kim)} ${ad}ı geri götürdü`, benim ? 'iyi' : 'kotu'); Ses.bildirim(); }
  }
  function oyunBitti(m) {
    oyun.bitti = true;
    const birlikte = oyun.ayar.mod === 'birlikte';
    let baslik, iyi;
    if (m.kazanan === -1) { baslik = birlikte ? 'OLMADI!' : 'BERABERE'; iyi = false; }
    else if (birlikte) { baslik = 'BAŞARDINIZ!'; iyi = true; }
    else { iyi = m.kazanan === oyun.takim; baslik = `${TAKIM_EMOJI[m.kazanan]} ${TAKIM_AD[m.kazanan].toLocaleUpperCase('tr')} KAZANDI`; }
    buyukYazi(baslik, kacis(m.neden), 2500);
    iyi ? Ses.kazandi() : Ses.kaybetti();
    const sonuc = () => {
      if (!oyun) return;
      oyun.tekrar = null; $('tekrarKutu').classList.add('gizli'); document.body.classList.remove('tekrarda');
      $('sonucBaslik').textContent = baslik;
      $('sonucNeden').innerHTML = `${kacis(m.neden)}<br><small>${m.tur}. turda bitti.${!birlikte && m.kazanan !== -1 ? (iyi ? ' Tebrikler!' : ' Bir dahakine!') : ''}</small>`;
      $('tekrarBtn').classList.toggle('gizli', !yonetici());
      $('sonucBekle').classList.toggle('gizli', yonetici());
      if (document.pointerLockElement) document.exitPointerLock();
      ekranGoster('sonuc');
    };
    // Kazanan varsa son 7 saniye ağır çekimde tekrar oynatılır
    const L = oyun.tampon.slice(-140);
    if (m.kazanan !== -1 && L.length > 30) {
      setTimeout(() => {
        if (!oyun) return;
        oyun.tekrar = { L, basla: performance.now(), aci: oyun.yaw + Math.PI, bitince: sonuc };
        $('tekrarKutu').classList.remove('gizli'); $('buyukYazi').classList.remove('goster'); document.body.classList.add('tekrarda');
      }, 1800);
    } else setTimeout(sonuc, 2600);
  }
  $('tekrarAtlaBtn').onclick = () => { if (oyun?.tekrar) oyun.tekrar.bitince(); };
  $('tekrarBtn').onclick = () => { oyunTemizle(); $('baslaBtn').click(); };
  $('lobiyeBtn').onclick = () => { oyunTemizle(); ekranGoster('lobi'); lobiCiz(); };
  $('cikBtn').onclick = () => { if (confirm('Oyundan çıkmak istiyor musun?')) menuyeDon(''); };

  // ---------- HUD ----------
  let yaziZaman = null;
  function buyukYazi(ust, alt = '', sure = 1500) {
    $('buyukYazi').innerHTML = ust + (alt ? `<small>${alt}</small>` : '');
    $('buyukYazi').classList.add('goster');
    clearTimeout(yaziZaman); yaziZaman = setTimeout(() => $('buyukYazi').classList.remove('goster'), sure);
  }
  function akis(html, sinif = '') {
    const d = document.createElement('div'); d.className = sinif; d.innerHTML = html;
    $('akis').prepend(d);
    while ($('akis').children.length > 6) $('akis').lastChild.remove();
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 7000);
  }
  function kalanSn() {
    const d = oyun.snap; if (!d) return 0;
    return Math.max(0, d.s - (d.f === 'oyun' ? (performance.now() - oyun.snapZaman) / 1000 : 0));
  }
  let sonTik = -1;
  function hudGuncelle() {
    const d = oyun.snap; if (!d) return;
    const s = kalanSn();
    if (d.f === 'hazir') {
      $('sureYazi').textContent = Math.ceil(s);
      const n = Math.ceil(s); if (n !== sonTik && n <= 3 && n > 0) { sonTik = n; Ses.tik(); }
    } else if (d.f === 'sar') { $('sureYazi').textContent = '⏪'; sonTik = -1; }
    else { $('sureYazi').textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; sonTik = -1; }
    $('sureYazi').classList.toggle('az', d.f === 'oyun' && s <= 5);
    const durumAd = ['evde', 'yerde!', 'kaçırılıyor!'];
    $('bayrakDurum').innerHTML = (oyun.ayar.mod === 'birlikte' ? [1] : [0, 1]).map(t => `<span class="${d.b[t][0] === 2 && t === oyun.takim ? 'tehlike' : ''}">${TAKIM_EMOJI[t]}🚩 ${durumAd[d.b[t][0]]}</span>`).join('');
  }

  // ---------- Girdi: klavye / fare ----------
  addEventListener('keydown', e => {
    if (!oyun || e.target.tagName === 'INPUT') return;
    tuslar.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); document.activeElement?.blur?.(); }
    if (e.repeat) return;
    if (e.code === 'KeyF') itme();
    if (e.code === 'KeyQ') balta();
    if (e.code === 'KeyR') barikat();
    if (e.code === 'KeyE') mancinik();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') atil();
    if (e.code === 'KeyM') $('harita').classList.toggle('buyuk');
    if (e.code === 'KeyK') mikDegistir();
  });
  addEventListener('keyup', e => tuslar.delete(e.code));
  addEventListener('blur', () => tuslar.clear());
  document.addEventListener('pointerlockchange', () => {
    const kilitli = document.pointerLockElement === kanvas;
    $('ipucu').textContent = kilitli ? 'ESC: fareyi bırak · WASD yürü · Sol tık/F it · Q balta · Shift atıl · R barikat · E mancınık · M harita' : '🖱️ Ekrana tıkla: fareyle etrafa bak.';
    $('ipucu').classList.toggle('serbest', !kilitli && !!oyun);
  });
  kanvas.addEventListener('click', () => {
    if (!oyun || dokun || document.pointerLockElement) return;
    try { const p = kanvas.requestPointerLock?.(); if (p?.catch) p.catch(() => {}); } catch (e) { /* sürükleyerek bakılır */ }
  });
  kanvas.addEventListener('mousemove', e => {
    if (!oyun || document.pointerLockElement === kanvas || !(e.buttons & 1)) return;
    oyun.yaw -= e.movementX * 0.005; oyun.pitch = Math.max(-0.15, Math.min(1.25, oyun.pitch + e.movementY * 0.004));
  });
  document.addEventListener('mousemove', e => {
    if (!oyun || document.pointerLockElement !== kanvas) return;
    oyun.yaw -= e.movementX * 0.0025; oyun.pitch = Math.max(-0.15, Math.min(1.25, oyun.pitch + e.movementY * 0.0022));
  });
  document.addEventListener('mousedown', e => { if (oyun && e.button === 0 && document.pointerLockElement === kanvas) itme(); });
  kanvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- Girdi: dokunmatik ----------
  const joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 }, bakis = { id: null, x: 0, y: 0 };
  kanvas.addEventListener('touchstart', e => {
    if (!oyun) return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && joy.id === null) {
        Object.assign(joy, { id: t.identifier, cx: t.clientX, cy: t.clientY, x: 0, y: 0 });
        const j = $('joystick'); j.style.display = 'block'; j.style.left = (t.clientX - 60) + 'px'; j.style.top = (t.clientY - 60) + 'px';
      } else if (bakis.id === null) Object.assign(bakis, { id: t.identifier, x: t.clientX, y: t.clientY });
    }
    e.preventDefault();
  }, { passive: false });
  kanvas.addEventListener('touchmove', e => {
    if (!oyun) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy; const d = Math.hypot(dx, dy), m = 50;
        if (d > m) { dx = dx / d * m; dy = dy / d * m; }
        joy.x = dx / m; joy.y = dy / m;
        $('joyTopuz').style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (t.identifier === bakis.id) {
        oyun.yaw -= (t.clientX - bakis.x) * 0.007; oyun.pitch = Math.max(-0.15, Math.min(1.25, oyun.pitch + (t.clientY - bakis.y) * 0.005));
        bakis.x = t.clientX; bakis.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const dokunmaBitti = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; $('joystick').style.display = 'none'; $('joyTopuz').style.transform = ''; }
      if (t.identifier === bakis.id) bakis.id = null;
    }
  };
  kanvas.addEventListener('touchend', dokunmaBitti); kanvas.addEventListener('touchcancel', dokunmaBitti);
  $('itBtn').onclick = () => itme();
  $('baltaBtn').onclick = () => balta();
  $('atilBtn').onclick = () => atil();
  $('barikatBtn').onclick = () => barikat();
  $('mancinikBtn').onclick = () => mancinik();
  $('harita').onclick = () => $('harita').classList.toggle('buyuk');
  $('sesBtn').onclick = () => { const a = Ses.degistir(); $('sesBtn').textContent = a ? '🔊' : '🔇'; };
  $('mikBtn').onclick = mikDegistir;

  // Eylemler kameranın baktığı yöne yapılır: önce karakteri o yöne çevirip konumu yolla
  const eylemOlur = () => oyun && oyun.faz === 'oyun' && !oyun.dus && oyun.sersem <= 0 && !oyun.tunel && !oyun.tekrar;
  function yoneDon() { oyun.yon = oyun.yaw; konumYolla(true); }
  function itme() {
    if (!eylemOlur()) return;
    const simdi = performance.now();
    if (simdi - oyun.sonIt < ITME_BEKLE) return;
    oyun.sonIt = simdi; yoneDon();
    const v = varliklar.get('o' + oyun.benimNo); if (v) Cuce.it(v.g);
    eveGonder({ tip: 'i' });
  }
  function balta() {
    if (!eylemOlur()) return;
    const simdi = performance.now();
    if (simdi - oyun.sonBalta < BALTA_BEKLE) return;
    oyun.sonBalta = simdi; yoneDon();
    const v = varliklar.get('o' + oyun.benimNo); if (v) Cuce.it(v.g);
    eveGonder({ tip: 'balta', yaw: Math.round(oyun.yaw * 100) / 100 });
  }
  function barikat() {
    if (!eylemOlur()) return;
    if (oyun.barikatHak <= 0) { akis('🧱 Bu turda barikat hakkın bitti', 'kotu'); return; }
    yoneDon();
    eveGonder({ tip: 'barikat', yaw: Math.round(oyun.yaw * 100) / 100 });
  }
  function atil() {
    if (!eylemOlur()) return;
    const simdi = performance.now();
    if (simdi - oyun.sonAtilma < ATILMA_BEKLE) return;
    oyun.sonAtilma = simdi; oyun.atilma = ATILMA_SURE;
    oyun.atilmaYon = oyun.yuruyor ? (oyun.yon ?? oyun.yaw) : oyun.yaw;
    Ses.atilma();
  }
  function mancinikYakin() { if (!oyun) return null; const m = H.MANCINIKLAR[oyun.takim]; return Math.hypot(oyun.x - m.x, oyun.z - m.z) < 2.4 ? m : null; }
  function mancinik() {
    if (!eylemOlur() || !mancinikYakin() || !oyun.nisan) return;
    if (oyun.snap && oyun.snap.mb[oyun.takim] > 0) { akis('🎯 Mancınık yeniden dolduruluyor…'); return; }
    eveGonder({ tip: 'mancinik', tx: Math.round(oyun.nisan.x * 100) / 100, tz: Math.round(oyun.nisan.z * 100) / 100 });
  }
  // Yetenek düğmelerinin bekleme göstergesi
  function yetenekCiz() {
    if (!oyun) return;
    const simdi = performance.now();
    const oran = (son, sure) => Math.max(0, 1 - (simdi - son) / sure);
    const ayarla = (id, o) => { const b = $(id); b.style.setProperty('--bekle', String(o)); b.classList.toggle('bekliyor', o > 0); };
    ayarla('itBtn', oran(oyun.sonIt, ITME_BEKLE));
    ayarla('baltaBtn', oran(oyun.sonBalta, BALTA_BEKLE));
    ayarla('atilBtn', oran(oyun.sonAtilma, ATILMA_BEKLE));
    $('barikatSay').textContent = oyun.barikatHak;
    $('barikatBtn').classList.toggle('bitti', oyun.barikatHak <= 0);
    const yakin = !!mancinikYakin();
    $('mancinikBtn').classList.toggle('gizli', !yakin);
    if (yakin) ayarla('mancinikBtn', oyun.snap ? Math.min(1, oyun.snap.mb[oyun.takim] / 5) : 0);
    // güç göstergesi
    if (oyun.guc && oyun.guc.bitis > simdi) {
      const kalan = Math.ceil((oyun.guc.bitis - simdi) / 1000);
      $('gucYazi').textContent = `${GUC_EMOJI[oyun.guc.tur]} ${GUC_AD[oyun.guc.tur]}${oyun.guc.tur === 'cekic' ? ' (sıradaki itme)' : ' ' + kalan + ' sn'}`;
      $('gucYazi').classList.remove('gizli');
    } else { if (oyun.guc) oyun.guc = null; $('gucYazi').classList.add('gizli'); }
  }
  async function mikDegistir() {
    if (mod === 'tek' || !mod) return;
    if (Ag.sesAcik) Ag.sesKapat();
    else if (!(await Ag.sesAc())) { if (oyun) akis('🎤 Mikrofona izin verilmedi', 'kotu'); else $('lobiDurum').textContent = 'Mikrofona izin verilmedi.'; }
    mikButon();
  }
  function mikButon() {
    const a = Ag.sesAcik;
    $('lobiMikBtn').textContent = a ? '🎤 Mikrofon açık' : '🎤 Mikrofon kapalı';
    $('mikBtn').classList.toggle('acik', a); $('mikBtn').classList.toggle('kapali', !a);
    $('mikBtn').classList.toggle('gizli', mod === 'tek');
  }

  // ---------- Her kare ----------
  const yakinlik = (x, z) => (oyun ? Math.max(0.05, 1 - Math.hypot(x - oyun.x, z - oyun.z) / 45) : 1);
  const aciFark = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  const turZamani = () => (oyun.snap && oyun.snap.f === 'oyun' ? oyun.ts + (performance.now() - oyun.tsZaman) / 1000 : 0);
  function konumYolla(hemen = false) {
    const o = oyun, simdi = performance.now();
    if (o.faz !== 'oyun' || (!hemen && simdi - o.sonGonder <= 50)) return;
    o.sonGonder = simdi;
    const h = o.tunel ? 3 : o.atilma > 0 ? 2 : o.yuruyor ? 1 : 0;
    eveGonder({ tip: 'k', x: Math.round(o.x * 100) / 100, z: Math.round(o.z * 100) / 100, yaw: Math.round((o.yon ?? o.yaw) * 100) / 100, h });
  }
  function hareket(dt) {
    const o = oyun, d = o.snap;
    o.sersem = Math.max(0, o.sersem - dt);
    if (o.dus) { o.dusY = Math.min(1.6, o.dusY + dt * 2.5); return; }
    const kapi = d ? d.g : [0, 0], bk = o.barikatlar;
    // Sal: üstündeysen seni de taşır
    const tz = turZamani();
    if (o.salOnce !== undefined && o.faz === 'oyun' && H.salUstunde(o.x, o.z, o.salOnce, 0.1)) o.z += H.salZ(tz) - H.salZ(o.salOnce);
    o.salOnce = tz;
    // Tünel: girişe basınca 2,5 sn yerin altında, sonra karşı kıyıda çıkarsın
    o.tunelBekle = Math.max(0, o.tunelBekle - dt);
    if (o.tunel) {
      o.tunel.kalan -= dt; o.yuruyor = false;
      if (o.tunel.kalan <= 0) { o.x = o.tunel.hedef.x; o.z = o.tunel.hedef.z; o.tunel = null; o.tunelBekle = 2.5; Ses.tunel(); konumYolla(true); }
      else { konumYolla(); return; }
    } else if (o.faz === 'oyun' && o.tunelBekle <= 0) {
      const t = H.TUNELLER.find(t => Math.hypot(o.x - t.x, o.z - t.z) < t.r);
      if (t) {
        if (o.tasiyor) { if (!o.tunelUyari) { akis('🕳️ Bayrakla tünele giremezsin', 'kotu'); o.tunelUyari = true; } }
        else { o.tunel = { kalan: TUNEL_SURE, hedef: t.hedef }; o.tunelUyari = false; buyukYazi('🕳️ Gizli tünel…', 'Karşı kıyıya çıkıyorsun', 1600); Ses.tunel(); konumYolla(true); return; }
      } else o.tunelUyari = false;
    }
    if (o.itilme) {
      const k = Math.min(dt, o.itilme.t) / 0.25;
      const p = H.it(o.x + o.itilme.dx * k, o.z + o.itilme.dz * k, YARICAP, o.takim, kapi, bk);
      o.x = p.x; o.z = p.z; o.itilme.t -= dt; if (o.itilme.t <= 0) o.itilme = null;
    }
    let ix = 0, iz = 0;
    if (o.faz === 'oyun' && o.sersem <= 0) {
      if (tuslar.has('KeyW') || tuslar.has('ArrowUp')) iz += 1;
      if (tuslar.has('KeyS') || tuslar.has('ArrowDown')) iz -= 1;
      if (tuslar.has('KeyD') || tuslar.has('ArrowRight')) ix += 1;
      if (tuslar.has('KeyA') || tuslar.has('ArrowLeft')) ix -= 1;
      if (joy.id !== null) { ix += joy.x; iz -= joy.y; }
    }
    const l = Math.hypot(ix, iz);
    o.yuruyor = l > 0.1;
    const hizli = o.guc && o.guc.tur === 'hiz' && o.guc.bitis > performance.now();
    if (o.atilma > 0 && o.faz === 'oyun') {   // 💨 atılma: kısa, çok hızlı bir sıçrayış
      o.atilma -= dt;
      const vx = Math.sin(o.atilmaYon) * ATILMA_HIZ, vz = Math.cos(o.atilmaYon) * ATILMA_HIZ;
      const p = H.it(o.x + vx * dt, o.z + vz * dt, YARICAP, o.takim, kapi, bk);
      o.x = Math.max(-H.SX + 0.4, Math.min(H.SX - 0.4, p.x)); o.z = Math.max(-H.SZ + 0.4, Math.min(H.SZ - 0.4, p.z));
      o.yon = o.atilmaYon; o.yuruyor = true;
    } else if (o.yuruyor) {
      if (l > 1) { ix /= l; iz /= l; }
      const hiz = HIZ * (o.tasiyor ? TASIMA : 1) * (hizli ? 1.5 : 1);
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), rx = -Math.cos(o.yaw), rz = Math.sin(o.yaw);
      const vx = (fx * iz + rx * ix) * hiz, vz = (fz * iz + rz * ix) * hiz;
      const p = H.it(o.x + vx * dt, o.z + vz * dt, YARICAP, o.takim, kapi, bk);
      o.x = Math.max(-H.SX + 0.4, Math.min(H.SX - 0.4, p.x)); o.z = Math.max(-H.SZ + 0.4, Math.min(H.SZ - 0.4, p.z));
      o.yon = Math.atan2(vx, vz);   // karakter yürüdüğü yöne döner
    } else if (bk.length) {   // durduğun yere barikat konduysa dışarı itil
      const p = H.it(o.x, o.z, YARICAP, o.takim, kapi, bk); o.x = p.x; o.z = p.z;
    }
    konumYolla();
  }

  function karakterler(dt) {
    const zaman = performance.now() / 1000;
    varliklar.forEach((v, k) => {
      const g = v.g;
      if (k === 'o' + oyun.benimNo) {
        g.position.set(oyun.x, -oyun.dusY, oyun.z);
        if (oyun.yon !== undefined) g.rotation.y += aciFark(g.rotation.y, oyun.yon) * Math.min(1, dt * 14);
        g.visible = oyun.dusY < 1.5 && !oyun.kameraYakin && !oyun.tunel;
        if (oyun.guc && oyun.guc.tur === 'gorunmez' && oyun.guc.bitis > performance.now()) g.visible = g.visible && Math.floor(zaman * 8) % 2 === 0;
        Cuce.canlandir(g, dt, (oyun.yuruyor && oyun.faz === 'oyun') || !!oyun.tekrar && oyun.yuruyor, { sersem: oyun.sersem > 0, tasiyor: oyun.tasiyor });
        gucSimgesi(v, oyun.tekrar ? v.guc : oyun.guc && oyun.guc.bitis > performance.now() ? GUC_KOD.indexOf(oyun.guc.tur) : 0);
        v.x = oyun.x; v.z = oyun.z;
        return;
      }
      v.x += (v.hx - v.x) * Math.min(1, dt * 12); v.z += (v.hz - v.z) * Math.min(1, dt * 12);
      v.yaw += aciFark(v.yaw, v.hyaw) * Math.min(1, dt * 12);
      g.position.set(v.x, v.dus ? -1.2 : 0, v.z); g.rotation.y = v.yaw;
      if (v.oyuncu) {
        g.visible = !v.dus && v.h !== 3;
        if (v.guc === 3) g.visible = g.visible && (v.takim === oyun.takim ? Math.floor(zaman * 8) % 2 === 0 : false);   // 👻 görünmez
        if (v.h === 2) g.scale.set(1, 0.92, 1.15); else g.scale.setScalar(1);
        Cuce.canlandir(g, dt, !!v.h, { sersem: !!v.sersem, tasiyor: v.bayrak >= 0 });
        gucSimgesi(v, v.guc === 3 && v.takim !== oyun.takim ? 0 : v.guc);
        return;
      }
      g.visible = v.durum !== 2 && !v.gizli;
      if (v.durum === 1) { g.position.y = Math.sin(zaman * 40) * 0.04; g.scale.setScalar(Math.max(0.2, (g.scale.x || 1) - dt * 0.4)); }
      else g.scale.setScalar(1);
      Cuce.boya(g, v.durum, zaman);
      Cuce.canlandir(g, dt, v.durum === 0 && !!v.h, { tasiyor: v.bayrak >= 0 });
    });
  }

  // Oyuncunun başında aktif gücün simgesi; kalkanda mavi kabarcık
  const kabarcikGeo = new THREE.SphereGeometry(0.85, 16, 12);
  function gucSimgesi(v, kod) {
    if (v.gucKod === kod) return;
    v.gucKod = kod;
    if (v.gucS) { v.g.remove(v.gucS); v.gucS = null; }
    if (v.kabarcik) { v.g.remove(v.kabarcik); v.kabarcik = null; }
    if (!kod) return;
    const tur = GUC_KOD[kod];
    v.gucS = Sahne.etiket(GUC_EMOJI[tur], 0.55); v.gucS.position.y = 1.95; v.g.add(v.gucS);
    if (tur === 'kalkan') {
      v.kabarcik = new THREE.Mesh(kabarcikGeo, new THREE.MeshStandardMaterial({ color: 0x8ad8ff, transparent: true, opacity: 0.25, emissive: 0x2a8aff, emissiveIntensity: 0.4, depthWrite: false }));
      v.kabarcik.position.y = 0.6; v.g.add(v.kabarcik);
    }
  }
  // Mancınık başındayken kameranın baktığı yer yerdeki nişan noktası olur
  function nisanHesapla() {
    const m = mancinikYakin();
    if (!m || oyun.faz !== 'oyun' || oyun.tekrar) { oyun.nisan = null; Sahne.nisanGoster(null); return; }
    // Fareyle yukarı bakınca hedef uzaklaşır, aşağı bakınca yaklaşır
    const [en, ust] = H.MANCINIK_MENZIL, oran = Math.max(0, Math.min(1, (oyun.pitch + 0.15) / 1.4));
    const dd = ust - (ust - en) * oran;
    const x = m.x + Math.sin(oyun.yaw) * dd, z = m.z + Math.cos(oyun.yaw) * dd;
    oyun.nisan = { x, z };
    Sahne.nisanGoster(x, z, !(oyun.snap && oyun.snap.mb[oyun.takim] > 0));
  }
  function tekrarKamera(dt) {
    const tk = oyun.tekrar, d = oyun.snap, k = Sahne.camera;
    let x = oyun.x, z = oyun.z;
    if (d) { const t = d.b.find(b => b[0] === 2); if (t) { x = t[1]; z = t[2]; } }
    tk.aci += dt * 0.35;
    tk.x = tk.x === undefined ? x : tk.x + (x - tk.x) * Math.min(1, dt * 4);
    tk.z = tk.z === undefined ? z : tk.z + (z - tk.z) * Math.min(1, dt * 4);
    k.position.set(tk.x + Math.sin(tk.aci) * 8, 8.5, tk.z + Math.cos(tk.aci) * 8);   // surların üstünden
    k.lookAt(tk.x, 0.8, tk.z);
  }
  function kamera(dt) {
    const k = Sahne.camera, o = oyun;
    const uzak = 5.2, tx = o.x, tz = o.z, ty = 1.1 - o.dusY;
    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    const dx = -Math.sin(o.yaw) * cp, dz = -Math.cos(o.yaw) * cp, dy = sp;
    let serbest = uzak;
    for (let t = 0.2; t <= uzak; t += 0.1) {
      const x = tx + dx * t, y = ty + dy * t, z = tz + dz * t;
      if (y < 4.7 && H.dolu(x, z, 0.25, y)) { serbest = Math.max(0.4, t - 0.15); break; }
    }
    k.position.set(tx + dx * serbest, Math.max(0.3, ty + dy * serbest), tz + dz * serbest);
    if (o.tunel) { k.position.set(tx, 0.4, tz); }
    if (o.nisan) {   // mancınık başında: surların üstünden hedefe bak
      k.position.set(tx - Math.sin(o.yaw) * 5, 7.5, tz - Math.cos(o.yaw) * 5);
      k.lookAt(o.nisan.x, 0, o.nisan.z); o.kameraYakin = false;
      return;
    }
    o.kameraYakin = serbest < 1.1;   // kamera kafanın içine girmesin: kendi gövdeni gizle
    k.lookAt(tx - dx * 2, ty + 0.3, tz - dz * 2);
    if (o.sarsinti > 0) { o.sarsinti = Math.max(0, o.sarsinti - dt); k.position.x += (Math.random() - 0.5) * o.sarsinti; k.position.y += (Math.random() - 0.5) * o.sarsinti; }
  }

  // ---------- Küçük harita ----------
  const hk = $('harita').getContext('2d');
  function haritaCiz() {
    const W = 240, Hh = 320, o = oyun, d = o.snap;
    const ters = o.takim === 1;   // kendi kalen hep altta
    const px = x => ((ters ? -x : x) + H.SX + 2) / (H.SX * 2 + 4) * W;
    const pz = z => (1 - ((ters ? -z : z) + H.SZ + 2) / (H.SZ * 2 + 4)) * Hh;
    hk.fillStyle = '#6fae4f'; hk.fillRect(0, 0, W, Hh);
    hk.fillStyle = '#3a8fd0'; hk.fillRect(0, pz(H.NEHIR), W, pz(-H.NEHIR) - pz(H.NEHIR));
    // köprüler
    H.KOPRULER.forEach((bx, i) => {
      const v = d ? d.k[i] : 0;
      hk.fillStyle = v >= 0.9 ? '#c89a4a' : '#5a3a1e';
      const x1 = px(bx - H.KOPRU_YARI), x2 = px(bx + H.KOPRU_YARI);
      if (v >= 0.9) hk.fillRect(Math.min(x1, x2), pz(H.NEHIR), Math.abs(x2 - x1), pz(-H.NEHIR) - pz(H.NEHIR));
      else { hk.fillRect(Math.min(x1, x2), pz(H.NEHIR) - 2, Math.abs(x2 - x1), 3); hk.fillRect(Math.min(x1, x2), pz(-H.NEHIR) - 1, Math.abs(x2 - x1), 3); }
    });
    // duvarlar
    H.kutular.forEach(k => {
      if (k.x1 < -H.SX - 0.5 || k.x2 > H.SX + 0.5 || k.z1 < -H.SZ - 0.5 || k.z2 > H.SZ + 0.5) return;
      hk.fillStyle = k.kapi !== undefined ? (d && d.g[k.kapi] >= 0.8 ? '#7dff8a' : '#3a3a40') : '#9c958a';
      const x1 = px(k.x1), x2 = px(k.x2), z1 = pz(k.z1), z2 = pz(k.z2);
      hk.fillRect(Math.min(x1, x2), Math.min(z1, z2), Math.max(2, Math.abs(x2 - x1)), Math.max(2, Math.abs(z2 - z1)));
    });
    // sal, tüneller, mancınıklar, kapaklar, barikatlar, sandıklar
    const sz = H.salZ(turZamani());
    hk.fillStyle = '#9a6a3a'; hk.fillRect(Math.min(px(-H.SAL.yariX), px(H.SAL.yariX)), Math.min(pz(sz - H.SAL.yariZ), pz(sz + H.SAL.yariZ)), Math.abs(px(H.SAL.yariX) - px(-H.SAL.yariX)), Math.abs(pz(sz + H.SAL.yariZ) - pz(sz - H.SAL.yariZ)));
    hk.fillStyle = '#111'; H.TUNELLER.forEach(t => { hk.beginPath(); hk.arc(px(t.x), pz(t.z), 3.5, 0, Math.PI * 2); hk.fill(); });
    H.MANCINIKLAR.forEach(m => { hk.fillStyle = m.t === 0 ? '#ff8a6a' : '#8ab0ff'; hk.fillRect(px(m.x) - 3, pz(m.z) - 3, 6, 6); });
    H.KAPAKLAR.forEach((k, i) => { hk.fillStyle = d && d.kp && d.kp[i] ? '#000' : '#7a5232'; hk.fillRect(px(k.x) - 2, pz(k.z) - 2, 4, 4); });
    o.barikatlar.forEach(b => { hk.strokeStyle = b.takim === 0 ? '#ff5a3a' : '#4a8aff'; hk.lineWidth = 2.5; hk.beginPath(); hk.moveTo(px(b.x - Math.cos(b.a) * 1.1), pz(b.z + Math.sin(b.a) * 1.1)); hk.lineTo(px(b.x + Math.cos(b.a) * 1.1), pz(b.z - Math.sin(b.a) * 1.1)); hk.stroke(); });
    if (d && d.sd) for (let j = 0; j < d.sd.length; j += 3) { hk.fillStyle = '#ffd23f'; hk.beginPath(); hk.arc(px(d.sd[j + 1]), pz(d.sd[j + 2]), 3.5, 0, Math.PI * 2); hk.fill(); hk.strokeStyle = '#7a5a00'; hk.lineWidth = 1; hk.stroke(); }
    // levhalar
    H.levhalar.forEach((l, j) => {
      hk.beginPath(); hk.arc(px(l.x), pz(l.z), 4, 0, Math.PI * 2);
      hk.fillStyle = d && d.l[j] ? '#ffd23f' : l.tur === 'kopru' ? '#c89a4a' : (l.i === 0 ? '#2f6fd8' : '#d8402a'); hk.fill();
      hk.strokeStyle = '#000a'; hk.lineWidth = 1; hk.stroke();
    });
    // bayraklar
    if (d) d.b.forEach(([du, x, z], t) => {
      if (o.ayar.mod === 'birlikte' && t === 0) return;
      hk.fillStyle = t === 0 ? '#ff5a3a' : '#4a8aff';
      const X = px(x), Z = pz(z);
      hk.fillRect(X - 1, Z - 9, 2, 10); hk.beginPath(); hk.moveTo(X + 1, Z - 9); hk.lineTo(X + 9, Z - 6); hk.lineTo(X + 1, Z - 3); hk.fill();
    });
    // hayaletler ve oyuncular
    varliklar.forEach((v, k) => {
      if (k[0] === 'h') { if (v.durum === 2 || v.gizli) return; hk.fillStyle = v.durum === 1 ? '#ff3a2a88' : (v.takim === 0 ? '#ffb0a088' : '#b0c8ff88'); hk.beginPath(); hk.arc(px(v.x), pz(v.z), 3, 0, Math.PI * 2); hk.fill(); return; }
      if (k === 'o' + o.benimNo) return;
      if (v.dus || v.h === 3 || (v.guc === 3 && v.takim !== o.takim)) return;
      hk.fillStyle = v.takim === 0 ? '#ff4a2a' : '#2f7aff'; hk.beginPath(); hk.arc(px(v.x), pz(v.z), 3.5, 0, Math.PI * 2); hk.fill();
    });
    // ben: ok
    const X = px(o.x), Z = pz(o.z), a = (ters ? Math.PI : 0) + (o.yon ?? o.yaw);
    hk.save(); hk.translate(X, Z); hk.rotate(-a + Math.PI);
    hk.fillStyle = '#fff'; hk.strokeStyle = '#000'; hk.lineWidth = 1.5;
    hk.beginPath(); hk.moveTo(0, 7); hk.lineTo(5, -5); hk.lineTo(-5, -5); hk.closePath(); hk.fill(); hk.stroke();
    hk.restore();
  }

  // ---------- Döngü ----------
  let son = performance.now(), menuAci = 0;
  function dongu(t) {
    requestAnimationFrame(dongu);
    const dt = Math.min(0.05, (t - son) / 1000); son = t;
    if (oyun && oyun.tekrar) {
      const tk = oyun.tekrar, i = Math.max(0, Math.floor((t - tk.basla) / 1000 * 20 * 0.5));   // yarı hızda
      if (i >= tk.L.length) tk.bitince();
      else { if (i !== tk.son) { tk.son = i; durumGeldi(tk.L[i], true); } if (oyun.tekrar) { Sahne.salGuncelle(tk.L[i].ts || 0); karakterler(dt * 0.5); tekrarKamera(dt); } }
    } else if (oyun) {
      hareket(dt); karakterler(dt); kamera(dt); nisanHesapla(); haritaCiz(); yetenekCiz();
      Sahne.salGuncelle(turZamani());
      if (oyun.snap) { const s = kalanSn(); if (Math.floor(s * 4) !== oyun.sonHud) { oyun.sonHud = Math.floor(s * 4); hudGuncelle(); } }
    } else {
      // menüde kale etrafında yavaş dönen kamera
      menuAci += dt * 0.06;
      const k = Sahne.camera; k.position.set(Math.sin(menuAci) * 48, 26, Math.cos(menuAci) * 48); k.lookAt(0, 0, 0);
    }
    Sahne.ciz(dt);
  }
  requestAnimationFrame(dongu);

  // Yerel test kolaylığı (sadece kendi bilgisayarında)
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.hdTest = { get oyun() { return oyun; }, mesaj, Motor };
  return {};
})();
