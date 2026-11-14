// =============================================================
// Hayalet Döngüsü - 3D dünya: çayır, nehir, asma köprüler, iki kale,
// basma levhaları, bayraklar ve küçük efektler.
// =============================================================

const Sahne = (() => {
  const H = Harita;
  let renderer, scene, camera;
  const kopruKanat = [[], []];     // her köprü: iki kanat (pivot grupları)
  const kapilar = [];              // kale kapısı demir parmaklıkları
  const levhaMesh = [];            // basma levhaları
  const bayraklar = [];            // { grup, bez }
  const efektler = [];
  let su = null, zaman = 0;

  function kur(kanvas) {
    renderer = new THREE.WebGLRenderer({ canvas: kanvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fd4f0);
    scene.fog = new THREE.Fog(0x9fd4f0, 60, 140);
    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
    camera.position.set(0, 40, -60); camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xdff2ff, 0x5a7a3a, 0.75));
    const gunes = new THREE.DirectionalLight(0xfff1d6, 1.15);
    gunes.position.set(25, 45, 15); gunes.castShadow = true;
    const sc = gunes.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.far = 140;
    gunes.shadow.mapSize.set(2048, 2048); gunes.shadow.bias = -0.0005;
    scene.add(gunes);

    zemin(); nehir(); kopruler(); kaleler(); susler(); levhalar(); bayrakKur(); cit();
    boyutla();
    addEventListener('resize', boyutla);
  }
  function boyutla() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const mat = (c, ek = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...ek });
  function kutuMesh(w, h, d, malz, x, y, z, golge = true) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), malz);
    k.position.set(x, y, z); k.castShadow = golge; k.receiveShadow = true; scene.add(k); return k;
  }

  // ---------- Zemin ----------
  function zemin() {
    const cimen = mat(0x6fae4f);
    // Nehrin iki yanı ayrı (arada nehir yatağı)
    [-1, 1].forEach(s => {
      const uz = 70, g = new THREE.Mesh(new THREE.PlaneGeometry(160, uz), cimen);
      g.rotation.x = -Math.PI / 2; g.position.set(0, 0, s * (H.NEHIR + uz / 2)); g.receiveShadow = true; scene.add(g);
      // nehir kıyısı (toprak duvar)
      kutuMesh(160, 1.4, 0.4, mat(0x7a5a36), 0, -0.7, s * (H.NEHIR + 0.2), false);
      // kale avlusu taş zemin
      const av = new THREE.Mesh(new THREE.PlaneGeometry(H.KALE_YARI * 2, H.KALE_ARKA - H.KALE_ON), mat(0xb8ab92));
      av.rotation.x = -Math.PI / 2; av.position.set(0, 0.01, s * (H.KALE_ON + H.KALE_ARKA) / 2); av.receiveShadow = true; scene.add(av);
      // kapıdan köprülere giden toprak yollar
      [-1, 1].forEach(k => {
        const x1 = 0, z1 = s * H.KALE_ON, x2 = H.KOPRULER[k < 0 ? 0 : 1], z2 = s * H.NEHIR;
        const L = Math.hypot(x2 - x1, z2 - z1), yol = new THREE.Mesh(new THREE.PlaneGeometry(3, L), mat(0xc2a06a));
        yol.rotation.x = -Math.PI / 2;
        const yg = new THREE.Group(); yg.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2); yg.rotation.y = Math.atan2(x2 - x1, z2 - z1); yg.add(yol); scene.add(yg);
        yol.receiveShadow = true; scene.add(yol);
      });
    });
  }
  function nehir() {
    const yatak = new THREE.Mesh(new THREE.PlaneGeometry(160, H.NEHIR * 2), mat(0x3a5a4a));
    yatak.rotation.x = -Math.PI / 2; yatak.position.y = -1.4; scene.add(yatak);
    su = new THREE.Mesh(new THREE.PlaneGeometry(160, H.NEHIR * 2, 80, 4), new THREE.MeshStandardMaterial({ color: 0x3a8fd0, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 }));
    su.rotation.x = -Math.PI / 2; su.position.y = -0.6; scene.add(su);
    su.userData.taban = Float32Array.from(su.geometry.attributes.position.array);
    // köpük çizgileri
    for (let i = 0; i < 26; i++) {
      const k = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + Math.random() * 2, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
      k.rotation.x = -Math.PI / 2; k.position.set(-80 + Math.random() * 160, -0.57, (Math.random() * 2 - 1) * (H.NEHIR - 0.5));
      k.userData.kopuk = 2 + Math.random() * 2; scene.add(k); efektler.push({ kalici: true, mesh: k, kopuk: true });
    }
  }
  function kopruler() {
    const tahta = mat(0x9a6a3a), koyu = mat(0x5a3a1e);
    H.KOPRULER.forEach((bx, i) => {
      [-1, 1].forEach(s => {
        const pivot = new THREE.Group(); pivot.position.set(bx, 0.05, s * H.NEHIR); scene.add(pivot);
        const kanat = new THREE.Group(); pivot.add(kanat);
        const L = H.NEHIR;
        const zemin = new THREE.Mesh(new THREE.BoxGeometry(H.KOPRU_YARI * 2, 0.18, L), tahta);
        zemin.position.set(0, 0, -s * L / 2); zemin.castShadow = true; zemin.receiveShadow = true; kanat.add(zemin);
        for (let j = 0; j < 6; j++) { const c = new THREE.Mesh(new THREE.BoxGeometry(H.KOPRU_YARI * 2 + 0.05, 0.2, 0.06), koyu); c.position.set(0, 0.01, -s * (0.25 + j * L / 6)); kanat.add(c); }
        [-1, 1].forEach(k => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, L), koyu); p.position.set(k * H.KOPRU_YARI, 0.3, -s * L / 2); p.castShadow = true; kanat.add(p); });
        pivot.userData.s = s;
        kopruKanat[i].push(pivot);
        // kıyıdaki direkler ve zincir makarası
        [-1, 1].forEach(k => kutuMesh(0.4, 2.6, 0.4, koyu, bx + k * (H.KOPRU_YARI + 0.3), 1.3, s * (H.NEHIR + 0.4)));
        kutuMesh(H.KOPRU_YARI * 2 + 1, 0.3, 0.3, koyu, bx, 2.5, s * (H.NEHIR + 0.4));
      });
    });
  }
  function kaleler() {
    const tas = mat(0x9c958a), tasKoyu = mat(0x7d776d);
    H.kutular.forEach(k => {
      if (k.x1 < -H.SX - 0.5 || k.x2 > H.SX + 0.5 || k.z1 < -H.SZ - 0.5 || k.z2 > H.SZ + 0.5) return;   // dış sınır (çitle çizilir)
      const w = k.x2 - k.x1, d = k.z2 - k.z1, cx = (k.x1 + k.x2) / 2, cz = (k.z1 + k.z2) / 2;
      if (k.kapi !== undefined) {
        // kapı kemeri ve parmaklık
        kutuMesh(w + 0.4, 1.2, d + 0.2, tas, cx, 3.6, cz);
        const parm = new THREE.Group(); parm.position.set(cx, 0, cz); scene.add(parm);
        const demir = mat(0x3a3a40, { metalness: 0.7, roughness: 0.4 });
        for (let x = -1.8; x <= 1.81; x += 0.45) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.1, 0.1), demir); c.position.set(x, 1.55, 0); c.castShadow = true; parm.add(c); }
        for (let y = 0.4; y < 3.1; y += 0.65) { const c = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.08, 0.08), demir); c.position.set(0, y, 0); parm.add(c); }
        parm.userData.takim = k.kapi; kapilar[k.kapi] = parm;
        return;
      }
      const yuk = 4;
      kutuMesh(w, yuk, d, tas, cx, yuk / 2, cz);
      // mazgallar
      const uzun = w > d, n = Math.floor((uzun ? w : d) / 1.2);
      for (let j = 0; j < n; j += 2) {
        const t = -((uzun ? w : d) / 2) + 0.6 + j * 1.2;
        kutuMesh(uzun ? 0.6 : w + 0.1, 0.55, uzun ? d + 0.1 : 0.6, tasKoyu, cx + (uzun ? t : 0), yuk + 0.27, cz + (uzun ? 0 : t));
      }
    });
    H.daireler.forEach(c => {
      if (c.tur !== 'kule' && c.tur !== 'kapiKule') return;
      const yuk = c.tur === 'kule' ? 6.5 : 5;
      const k = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r * 1.08, yuk, 14), tas);
      k.position.set(c.x, yuk / 2, c.z); k.castShadow = true; k.receiveShadow = true; scene.add(k);
      const t = c.z < 0 ? 0 : 1;
      const cat = new THREE.Mesh(new THREE.ConeGeometry(c.r * 1.25, c.r * 1.6, 14), mat(Cuce.TAKIM[t]));
      cat.position.set(c.x, yuk + c.r * 0.8, c.z); cat.castShadow = true; scene.add(cat);
      if (c.tur === 'kule') {   // tepede küçük flama
        const dir = kutuMesh(0.06, 1.2, 0.06, mat(0x5a3a1e), c.x, yuk + c.r * 1.6 + 0.5, c.z, false);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ color: Cuce.TAKIM[t], side: THREE.DoubleSide }));
        fl.position.set(c.x + 0.45, yuk + c.r * 1.6 + 0.85, c.z); scene.add(fl); dir.visible = true;
      }
    });
    // duvardaki takım sancakları (kapının iki yanı, dışa bakan)
    [0, 1].forEach(t => {
      const s = H.isaret(t);
      [-5, 5].forEach(x => {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshStandardMaterial({ color: Cuce.TAKIM[t], side: THREE.DoubleSide }));
        b.position.set(x, 2.6, s * (H.KALE_ON - H.DUVAR - 0.03)); b.rotation.y = t === 0 ? Math.PI : 0; scene.add(b);
      });
    });
  }
  function susler() {
    const kaya = mat(0x8a8a86), govde = mat(0x6a4a2a), yaprak = mat(0x2f7a3a);
    H.daireler.forEach(c => {
      if (c.tur === 'kaya') {
        const k = new THREE.Mesh(new THREE.DodecahedronGeometry(c.r, 0), kaya);
        k.position.set(c.x, c.r * 0.55, c.z); k.rotation.set(Math.random(), Math.random(), Math.random()); k.scale.y = 0.75; k.castShadow = true; k.receiveShadow = true; scene.add(k);
      } else if (c.tur === 'agac') agac(c.x, c.z, govde, yaprak);
    });
    // alanın dışında orman
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, x = Math.cos(a) * (40 + Math.random() * 30), z = Math.sin(a) * (55 + Math.random() * 25);
      if (Math.abs(x) < H.SX + 3 && Math.abs(z) < H.SZ + 3) continue;
      if (Math.abs(z) < H.NEHIR + 1) continue;
      agac(x, z, govde, yaprak, false);
    }
  }
  function agac(x, z, govde, yaprak, golge = true) {
    const b = 0.8 + Math.random() * 0.6;
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * b, 0.25 * b, 1.4 * b, 6), govde); g.position.set(x, 0.7 * b, z); g.castShadow = golge; scene.add(g);
    [0, 1, 2].forEach(j => { const y = new THREE.Mesh(new THREE.ConeGeometry((1.5 - j * 0.35) * b, 1.7 * b, 8), yaprak); y.position.set(x, (1.6 + j * 0.9) * b, z); y.castShadow = golge; scene.add(y); });
  }
  function cit() {
    const tahta = mat(0x7a5a36);
    const kenar = (x1, z1, x2, z2) => {
      const L = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(L / 2.5);
      for (let i = 0; i <= n; i++) { const t = i / n; kutuMesh(0.15, 1, 0.15, tahta, x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t, false); }
      const r = kutuMesh(L, 0.1, 0.08, tahta, (x1 + x2) / 2, 0.75, (z1 + z2) / 2, false); r.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    };
    const X = H.SX, Z = H.SZ;
    kenar(-X, -Z, X, -Z); kenar(-X, Z, X, Z);
    kenar(-X, -Z, -X, -H.NEHIR); kenar(-X, H.NEHIR, -X, Z); kenar(X, -Z, X, -H.NEHIR); kenar(X, H.NEHIR, X, Z);
  }

  // ---------- Levhalar ----------
  function etiket(metin, boy = 1.2) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'); x.font = '84px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(metin, 128, 70);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, transparent: true }));
    s.scale.set(boy * 2, boy, 1); return s;
  }
  function levhalar() {
    H.levhalar.forEach((l, j) => {
      const g = new THREE.Group(); g.position.set(l.x, 0, l.z); scene.add(g);
      const taban = new THREE.Mesh(new THREE.CylinderGeometry(l.r + 0.15, l.r + 0.25, 0.1, 24), mat(0x6a6a66)); taban.position.y = 0.05; taban.receiveShadow = true; g.add(taban);
      const renk = l.tur === 'kopru' ? 0xc89a4a : Cuce.TAKIM[1 - l.i];
      const ust = new THREE.Mesh(new THREE.CylinderGeometry(l.r, l.r, 0.14, 24), mat(renk, { emissive: 0xffd23f, emissiveIntensity: 0 })); ust.position.y = 0.14; ust.castShadow = true; ust.receiveShadow = true; g.add(ust);
      const e = etiket(l.tur === 'kopru' ? '🌉' : '🚪', 1.1); e.position.y = 2.2; g.add(e);
      levhaMesh[j] = { ust, e };
    });
  }

  // ---------- Bayraklar ----------
  function bayrakKur() {
    [0, 1].forEach(t => {
      const yer = H.bayrakYeri(t);
      const kaide = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 16), mat(0x8a8478)); kaide.position.set(yer.x, 0.17, yer.z); kaide.receiveShadow = true; kaide.castShadow = true; scene.add(kaide);
      const halka = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 32), new THREE.MeshBasicMaterial({ color: Cuce.TAKIM[t], transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      halka.rotation.x = -Math.PI / 2; halka.position.set(yer.x, 0.03, yer.z); scene.add(halka);
      const grup = new THREE.Group(); scene.add(grup);
      const dir = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), mat(0x5a3a1e)); dir.position.y = 1.1; dir.castShadow = true; grup.add(dir);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0xffc63a, { metalness: 0.6 })); top.position.y = 2.22; grup.add(top);
      const bez = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 10, 1), new THREE.MeshStandardMaterial({ color: Cuce.TAKIM[t], side: THREE.DoubleSide, roughness: 0.7 }));
      bez.position.set(0.57, 1.8, 0); bez.castShadow = true; grup.add(bez);
      bez.userData.taban = Float32Array.from(bez.geometry.attributes.position.array);
      grup.position.set(yer.x, 0.35, yer.z);
      bayraklar[t] = { grup, bez };
    });
  }
  // durum: 0 ev, 1 yerde, 2 taşınıyor
  function bayrakAyarla(t, durum, x, z) {
    const b = bayraklar[t]; if (!b) return;
    const y = durum === 0 ? 0.35 : durum === 1 ? 0 : 0.9;
    b.grup.position.set(x, y, z);
    b.grup.scale.setScalar(durum === 2 ? 0.7 : 1);
  }

  // ---------- Durum (her paket) ----------
  function durum(d) {
    if (!d) return;
    d.k?.forEach((v, i) => kopruKanat[i].forEach(p => { p.userData.hedef = (1 - v) * 1.3; }));
    d.g?.forEach((v, t) => { if (kapilar[t]) kapilar[t].userData.hedef = v * 3.0; });
    d.l?.forEach((b, j) => { const m = levhaMesh[j]; if (m) m.basili = b; });
    d.b?.forEach(([du, x, z], t) => bayrakAyarla(t, du, x, z));
  }

  // ---------- Efektler ----------
  function halka(x, z, renk, sure = 0.6, buyu = 3) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 24), new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.15, z); scene.add(m);
    efektler.push({ mesh: m, t: 0, sure, buyu });
  }
  function sicrama(x, z) {
    halka(x, z, 0xffffff, 0.8, 4); halka(x, z, 0x9ad8ff, 1.1, 6);
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true }));
      d.position.set(x, -0.5, z); scene.add(d);
      const a = Math.random() * Math.PI * 2;
      efektler.push({ mesh: d, t: 0, sure: 0.9, hiz: new THREE.Vector3(Math.cos(a) * 2, 4 + Math.random() * 2, Math.sin(a) * 2) });
    }
  }
  function paradoksEfekt(x, z) {
    halka(x, z, 0xff3a2a, 0.9, 5);
    for (let i = 0; i < 18; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3a2a : 0xffffff, transparent: true }));
      d.position.set(x, 0.6, z); scene.add(d);
      const a = Math.random() * Math.PI * 2;
      efektler.push({ mesh: d, t: 0, sure: 1.1, hiz: new THREE.Vector3(Math.cos(a) * 3, 2 + Math.random() * 3, Math.sin(a) * 3) });
    }
  }
  function itmeEfekt(x, z) { halka(x, z, 0xffe08a, 0.4, 3); }

  function ciz(dt) {
    zaman += dt;
    // su dalgası
    if (su) {
      const p = su.geometry.attributes.position, b = su.userData.taban;
      for (let i = 0; i < p.count; i++) p.array[i * 3 + 2] = Math.sin(b[i * 3] * 0.5 + zaman * 2) * 0.06 + Math.cos(b[i * 3 + 1] * 1.3 + zaman * 1.5) * 0.04;
      p.needsUpdate = true;
    }
    // köprüler ve kapılar yumuşakça hedefe
    kopruKanat.forEach(L => L.forEach(p => { const h = p.userData.hedef ?? 1.3, s = p.userData.s; p.userData.a = (p.userData.a ?? 1.3) + (h - (p.userData.a ?? 1.3)) * Math.min(1, dt * 10); p.rotation.x = s * p.userData.a; }));
    kapilar.forEach(k => { if (!k) return; const h = k.userData.hedef ?? 0; k.position.y += (h - k.position.y) * Math.min(1, dt * 10); });
    levhaMesh.forEach(m => { const h = m.basili ? 0.06 : 0.14; m.ust.position.y += (h - m.ust.position.y) * Math.min(1, dt * 15); m.ust.material.emissiveIntensity = m.basili ? 0.5 : 0; m.e.position.y = 2.2 + Math.sin(zaman * 2) * 0.12; });
    // bayrak dalgalanması
    bayraklar.forEach(b => {
      const p = b.bez.geometry.attributes.position, t = b.bez.userData.taban;
      for (let i = 0; i < p.count; i++) { const x = t[i * 3] + 0.55; p.array[i * 3 + 2] = Math.sin(x * 5 - zaman * 7) * 0.08 * x; }
      p.needsUpdate = true;
    });
    for (let i = efektler.length - 1; i >= 0; i--) {
      const e = efektler[i];
      if (e.kopuk) { e.mesh.position.x += dt * e.mesh.userData.kopuk; if (e.mesh.position.x > 80) e.mesh.position.x = -80; continue; }
      e.t += dt; const k = e.t / e.sure;
      if (e.hiz) { e.hiz.y -= 12 * dt; e.mesh.position.addScaledVector(e.hiz, dt); }
      if (e.buyu) e.mesh.scale.setScalar(1 + k * e.buyu);
      e.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); efektler.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }

  return {
    kur, ciz, durum, sicrama, paradoksEfekt, itmeEfekt, etiket,
    get scene() { return scene; }, get camera() { return camera; },
  };
})();
