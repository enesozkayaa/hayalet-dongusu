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

  const HIZ = 5, TASIMA = 0.85, YARICAP = 0.35, ITME_BEKLE = 1200;
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
    $('ayarOzet').textContent = `${a.tur} tur × ${a.sure} sn · Paradoks ${a.paradoks ? 'açık' : 'kapalı'}`;
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
    Ag.sesGuncelle?.();
  }
  function oyunKur(m) {
    oyunTemizle();
    const ben = m.oyuncular.find(p => p.id === benimId);
    oyun = {
      oyuncular: m.oyuncular, ayar: m.ayar, benimNo: ben ? ben.no : -1, takim: ben ? ben.takim : 0,
      x: 0, z: 0, yaw: 0, pitch: 0.35, faz: 'hazir', tur: 0, snap: null, snapZaman: 0,
      sersem: 0, dus: false, dusY: 0, itilme: null, sonGonder: 0, sonIt: 0, tasiyor: false, hayaletler: [], bitti: false, kopruOnce: [0, 0],
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
      case 'dustu': if (oyun) { oyun.dus = true; oyun.dusY = 0; buyukYazi('💦 Suya düştün!', '2 saniye sonra kalende doğacaksın', 1800); } break;
      case 'sicrama': if (oyun) { Sahne.sicrama(m.x, m.z); Ses.sicrama(yakinlik(m.x, m.z)); akis(`💦 ${kacis(m.ad)} suya düştü`); } break;
      case 'bayrak': if (oyun) bayrakOlayi(m); break;
      case 'cikti': if (oyun) { akis(`🚪 ${kacis(m.ad)} oyundan çıktı`); const v = varliklar.get('o' + m.no); if (v) { Sahne.scene.remove(v.g); varliklar.delete('o' + m.no); } } break;
      case 'bitti': if (oyun) oyunBitti(m); break;
    }
  }
  function turGeldi(m) {
    oyun.tur = m.tur; oyun.faz = 'hazir';
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
    $('turYazi').textContent = `TUR ${m.tur} / ${m.toplam}`;
    buyukYazi(`TUR ${m.tur} / ${m.toplam}`, m.tur === 1 ? 'Bu turda ne yaparsan sonraki turlarda hayaletin aynısını yapacak' : `${benim} hayaletin geçen turlardaki gibi hareket edecek. Yollarını kesme!`, 2600);
    oyun.geriSay = 3;
  }
  function fazGeldi(f) {
    oyun.faz = f;
    if (f === 'oyun') { buyukYazi('BAŞLA!', '', 900); Ses.basla(); }
    if (f === 'sar') { $('geriSar').classList.remove('gizli'); Ses.geriSar(); if (document.pointerLockElement) { /* fare kilitli kalsın */ } }
  }
  function durumGeldi(d) {
    oyun.snap = d; oyun.snapZaman = performance.now();
    if (d.f !== oyun.faz && d.f !== 'bitti') oyun.faz = d.f;
    Sahne.durum(d);
    // köprü sesi
    d.k.forEach((v, i) => {
      const once = oyun.kopruOnce[i];
      if ((once < 0.5) !== (v < 0.5)) Ses.kopru(yakinlik(H.KOPRULER[i], 0) * 0.8 + 0.2);
      oyun.kopruOnce[i] = v;
    });
    for (let j = 0; j < d.o.length; j += 8) {
      const no = d.o[j], v = varliklar.get('o' + no);
      if (no === oyun.benimNo) { oyun.tasiyor = d.o[j + 6] >= 0; continue; }
      if (!v) continue;
      if (Math.hypot(d.o[j + 1] - v.hx, d.o[j + 2] - v.hz) > 6) { v.x = d.o[j + 1]; v.z = d.o[j + 2]; }
      Object.assign(v, { hx: d.o[j + 1], hz: d.o[j + 2], hyaw: d.o[j + 3], h: d.o[j + 4], sersem: d.o[j + 5], bayrak: d.o[j + 6], dus: d.o[j + 7] });
    }
    for (let j = 0; j < d.h.length; j += 8) {
      const v = varliklar.get('h' + d.h[j]); if (!v) continue;
      if (v.ilk || Math.hypot(d.h[j + 1] - v.hx, d.h[j + 2] - v.hz) > 6) { v.x = d.h[j + 1]; v.z = d.h[j + 2]; v.yaw = d.h[j + 3]; v.ilk = false; }
      Object.assign(v, { hx: d.h[j + 1], hz: d.h[j + 2], hyaw: d.h[j + 3], h: d.h[j + 4], durum: d.h[j + 5], gizli: d.h[j + 6], bayrak: d.h[j + 7] });
    }
    hudGuncelle();
  }
  function bayrakOlayi(m) {
    const benim = m.t === oyun.takim;   // benim takımımın bayrağı mı
    const ad = `${TAKIM_EMOJI[m.t]} ${TAKIM_AD[m.t]} bayrak`;
    if (m.olay === 'aldi') { akis(`🚩 ${kacis(m.kim)} ${ad}ı kaptı!`, benim ? 'kotu' : 'iyi'); benim ? Ses.kotuHaber() : Ses.bayrak(); }
    if (m.olay === 'dustu') akis(`🚩 ${ad} yere düştü (${kacis(m.kim)})`);
    if (m.olay === 'eve') akis(`🚩 ${ad} suya düştü, kaleye döndü`);
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
    setTimeout(() => {
      if (!oyun) return;
      $('sonucBaslik').textContent = baslik;
      $('sonucNeden').innerHTML = `${kacis(m.neden)}<br><small>${m.tur}. turda bitti.${!birlikte && m.kazanan !== -1 ? (iyi ? ' Tebrikler!' : ' Bir dahakine!') : ''}</small>`;
      $('tekrarBtn').classList.toggle('gizli', !yonetici());
      $('sonucBekle').classList.toggle('gizli', yonetici());
      if (document.pointerLockElement) document.exitPointerLock();
      ekranGoster('sonuc');
    }, 2600);
  }
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
    if (e.code === 'KeyM') $('harita').classList.toggle('buyuk');
    if (e.code === 'KeyK') mikDegistir();
  });
  addEventListener('keyup', e => tuslar.delete(e.code));
  addEventListener('blur', () => tuslar.clear());
  document.addEventListener('pointerlockchange', () => {
    const kilitli = document.pointerLockElement === kanvas;
    $('ipucu').textContent = kilitli ? 'ESC: fareyi bırak · WASD yürü · Sol tık / F: it · M harita · K mikrofon' : '🖱️ Ekrana tıkla: fareyle etrafa bak.';
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
  $('harita').onclick = () => $('harita').classList.toggle('buyuk');
  $('sesBtn').onclick = () => { const a = Ses.degistir(); $('sesBtn').textContent = a ? '🔊' : '🔇'; };
  $('mikBtn').onclick = mikDegistir;

  function itme() {
    if (!oyun || oyun.faz !== 'oyun' || oyun.dus || oyun.sersem > 0) return;
    const simdi = performance.now();
    if (simdi - oyun.sonIt < ITME_BEKLE) return;
    oyun.sonIt = simdi;
    const v = varliklar.get('o' + oyun.benimNo); if (v) Cuce.it(v.g);
    eveGonder({ tip: 'i' });
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

  function hareket(dt) {
    const o = oyun, d = o.snap;
    o.sersem = Math.max(0, o.sersem - dt);
    if (o.dus) { o.dusY = Math.min(1.6, o.dusY + dt * 2.5); return; }
    const kapi = d ? d.g : [0, 0];
    if (o.itilme) {
      const k = Math.min(dt, o.itilme.t) / 0.25;
      const p = H.it(o.x + o.itilme.dx * k, o.z + o.itilme.dz * k, YARICAP, o.takim, kapi);
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
    if (o.yuruyor) {
      if (l > 1) { ix /= l; iz /= l; }
      const hiz = HIZ * (o.tasiyor ? TASIMA : 1);
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), rx = -Math.cos(o.yaw), rz = Math.sin(o.yaw);
      const vx = (fx * iz + rx * ix) * hiz, vz = (fz * iz + rz * ix) * hiz;
      const p = H.it(o.x + vx * dt, o.z + vz * dt, YARICAP, o.takim, kapi);
      o.x = Math.max(-H.SX + 0.4, Math.min(H.SX - 0.4, p.x)); o.z = Math.max(-H.SZ + 0.4, Math.min(H.SZ - 0.4, p.z));
      o.yon = Math.atan2(vx, vz);   // karakter yürüdüğü yöne döner
    }
    const simdi = performance.now();
    if (o.faz === 'oyun' && simdi - o.sonGonder > 50) {
      o.sonGonder = simdi;
      eveGonder({ tip: 'k', x: Math.round(o.x * 100) / 100, z: Math.round(o.z * 100) / 100, yaw: Math.round((o.yon ?? o.yaw) * 100) / 100, h: o.yuruyor ? 1 : 0 });
    }
  }

  function karakterler(dt) {
    const zaman = performance.now() / 1000;
    varliklar.forEach((v, k) => {
      const g = v.g;
      if (k === 'o' + oyun.benimNo) {
        g.position.set(oyun.x, -oyun.dusY, oyun.z);
        if (oyun.yon !== undefined) g.rotation.y += aciFark(g.rotation.y, oyun.yon) * Math.min(1, dt * 14);
        g.visible = oyun.dusY < 1.5 && !oyun.kameraYakin;
        Cuce.canlandir(g, dt, oyun.yuruyor && oyun.faz === 'oyun', { sersem: oyun.sersem > 0, tasiyor: oyun.tasiyor });
        v.x = oyun.x; v.z = oyun.z;
        return;
      }
      v.x += (v.hx - v.x) * Math.min(1, dt * 12); v.z += (v.hz - v.z) * Math.min(1, dt * 12);
      v.yaw += aciFark(v.yaw, v.hyaw) * Math.min(1, dt * 12);
      g.position.set(v.x, v.dus ? -1.2 : 0, v.z); g.rotation.y = v.yaw;
      if (v.oyuncu) { g.visible = !v.dus; Cuce.canlandir(g, dt, !!v.h, { sersem: !!v.sersem, tasiyor: v.bayrak >= 0 }); return; }
      g.visible = v.durum !== 2 && !v.gizli;
      if (v.durum === 1) { g.position.y = Math.sin(zaman * 40) * 0.04; g.scale.setScalar(Math.max(0.2, (g.scale.x || 1) - dt * 0.4)); }
      else g.scale.setScalar(1);
      Cuce.boya(g, v.durum, zaman);
      Cuce.canlandir(g, dt, v.durum === 0 && !!v.h, { tasiyor: v.bayrak >= 0 });
    });
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
    o.kameraYakin = serbest < 1.1;   // kamera kafanın içine girmesin: kendi gövdeni gizle
    k.lookAt(tx - dx * 2, ty + 0.3, tz - dz * 2);
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
      if (v.dus) return;
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
    if (oyun) {
      hareket(dt); karakterler(dt); kamera(dt); haritaCiz();
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
