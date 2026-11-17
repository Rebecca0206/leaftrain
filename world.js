/* LeafTrain 3D world: low-poly terrain chunks (built ahead of the train, disposed behind it), rails, sleepers, ballast, stations, signs. */
(function () {
  'use strict';
  var LT = window.LT, T = LT.makeTrack(), VEX = 2.5, CH = 100, STEP = 5;
  var SEA_Y = 4 * VEX;
  function hash(a, b) { var h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, z) { var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi; xf = xf * xf * (3 - 2 * xf); zf = zf * zf * (3 - 2 * zf);
    var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return (a + (b - a) * xf) * (1 - zf) + (c + (d - c) * xf) * zf - 0.5; }
  function col(hex) { var c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  var C = { sand: col('#d8b36a'), sand2: col('#c99a52'), snow: col('#f2f6fa'), snow2: col('#d6e2ee'), grass: col('#3f7a43'), grass2: col('#2f6338'), rock: col('#8a8f99'), rock2: col('#6b717c', 0), road: col('#5d626c'), city: col('#767c88'), beach: col('#cfc08c'), sea: col('#3a9ad0'),
    ballast: col('#7b7770'), rail: col('#b9bcc2'), sleeper: col('#4b3a2c'), trunk: col('#5b3d28'), pine: col('#2c6a3a'), pineS: col('#e9f1f5'), cactus: col('#4f8f4a'), wall: col('#c9b99a') };

  /* ---- tiny triangle-soup builder (flat shaded, vertex colours) ---- */
  function MB(ox, oy, oz) { this.p = []; this.c = []; this.ox = ox; this.oy = oy; this.oz = oz; }
  MB.prototype.tri = function (a, b, c, ca, cb, cc) { var P = this.p, C2 = this.c; P.push(a[0] - this.ox, a[1] - this.oy, a[2] - this.oz, b[0] - this.ox, b[1] - this.oy, b[2] - this.oz, c[0] - this.ox, c[1] - this.oy, c[2] - this.oz); cb = cb || ca; cc = cc || ca; C2.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]); };
  MB.prototype.quad = function (a, b, c, d, ca, cb, cc, cd) { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd || cc); };
  MB.prototype.box = function (cx, cy, cz, w, h, d, yaw, color, top) { /* w along local x, d along local z */
    var cs = Math.cos(yaw), sn = Math.sin(yaw), hw = w / 2, hh = h / 2, hd = d / 2, self = this, tc = top || color;
    function v(x, y, z) { return [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs]; }
    var A = v(-hw, -hh, -hd), B = v(hw, -hh, -hd), Cc = v(hw, -hh, hd), D = v(-hw, -hh, hd), E = v(-hw, hh, -hd), F = v(hw, hh, -hd), G = v(hw, hh, hd), H = v(-hw, hh, hd);
    self.quad(E, H, G, F, tc); self.quad(A, E, F, B, color); self.quad(Cc, G, H, D, color); self.quad(D, H, E, A, color); self.quad(B, F, G, Cc, color);
  };
  MB.prototype.cone = function (cx, by, cz, r, h, seg, c1, c2, jag, snowAt, snowC, seed) {
    var ring = [], i, top = [cx, by + h, cz], k = snowAt ? by + h * snowAt : 0, rr = [];
    for (i = 0; i < seg; i++) { var a = i / seg * 6.2832, j = jag ? 1 + (hash(seed || 1, i) - 0.5) * jag : 1; ring.push([cx + Math.cos(a) * r * j, by, cz + Math.sin(a) * r * j]); }
    for (i = 0; i < seg; i++) {
      var a0 = ring[i], a1 = ring[(i + 1) % seg];
      if (snowAt) { var f = 1 - snowAt, m0 = [cx + (a0[0] - cx) * f, k, cz + (a0[2] - cz) * f], m1 = [cx + (a1[0] - cx) * f, k, cz + (a1[2] - cz) * f];
        this.quad(a0, m0, m1, a1, c1, c1, c1, c1); this.tri(m0, top, m1, snowC, snowC, snowC); }
      else this.tri(a0, top, a1, c1, c2, c1);
    }
  };
  MB.prototype.geometry = function () { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); return g; };

  var VMAT = new THREE.MeshLambertMaterial({ vertexColors: true });
  function biomeMixAt(s) { return [LT.biomeAt(T, s - 150), LT.biomeAt(T, s), LT.biomeAt(T, s + 150)]; }
  var BW = [0.25, 0.5, 0.25];

  /* ground height above the track top (metres) and colour at a point; f = distance from the track bed */
  function shape(biome, f, side, wx, wz, alt) {
    var t = Math.min(1, f / 40), h, c, n = vnoise(wx * 0.012, wz * 0.012), n2 = vnoise(wx * 0.05, wz * 0.05);
    switch (biome) {
      case 'desert': h = 0.01 * f + n * 14 * t + n2 * 1.5 * t; c = mixc(C.sand, C.sand2, n2 + 0.5); break;
      case 'snow': h = 0.03 * f + n * 12 * t; c = mixc(C.snow, C.snow2, n2 + 0.5); break;
      case 'forest': h = 0.05 * f + n * 30 * t + n2 * 3 * t; c = mixc(C.grass, C.grass2, n + 0.5); break;
      case 'mountains': h = (side > 0 ? 0.6 * f : -0.45 * f) + n * 60 * t + n2 * 6 * t; c = alt > 170 ? mixc(C.snow2, C.snow, n2 + 0.5) : mixc(C.rock, C.rock2 || C.rock, n + 0.5); if (alt > 120 && alt <= 170) c = mixc(C.rock, C.snow2, (alt - 120) / 50); break;
      case 'coast': h = side < 0 ? -0.7 * f : 0.08 * f + n * 16 * t; c = side < 0 ? mixc(C.beach, C.sea, Math.min(1, f / 60)) : mixc(C.beach, C.grass, Math.min(1, f / 80)); break;
      default: h = 0.002 * f; c = f < 14 ? C.road : mixc(C.city, C.road, n2 + 0.5);
    }
    return [h, c];
  }
  var COLS = [-420, -200, -90, -35, -12, -4.2, 4.2, 12, 35, 90, 200, 420];
  /* terrain y at an offset from the centre line (used by decorations, too) */
  function groundAt(s, off) {
    var o = LT.pathAt(T, s), yt = LT.elevAt(T, s) * VEX, wx = o.x + Math.cos(o.h) * off, wz = o.z + Math.sin(o.h) * off, f = Math.max(0, Math.abs(off) - 4.2), side = off >= 0 ? 1 : -1, y = 0, B = biomeMixAt(s), k;
    for (k = 0; k < 3; k++) y += shape(B[k], f, side, wx, wz, LT.elevAt(T, s))[0] * BW[k];
    if (Math.abs(off) <= 4.2) return yt - 0.45;
    var fade = Math.max(0, Math.min(1, (Math.abs(off) - 200) / 220)); y = y * (1 - fade) + (-40) * fade;
    var lim = Math.min(y, 0); if (y < 0 && B[1] === 'coast' && side < 0) y = Math.max(y, SEA_Y - yt - 3);
    return yt - 0.45 - 0.01 * Math.min(f, 30) + y;
  }

  function frame(s) { /* world position, forward and left unit vectors at unwrapped distance s */
    var a = LT.pathAt(T, s - 0.75), b = LT.pathAt(T, s + 0.75), ya = LT.elevAt(T, s - 0.75) * VEX, yb = LT.elevAt(T, s + 0.75) * VEX, c = LT.pathAt(T, s);
    var f = new THREE.Vector3(b.x - a.x, yb - ya, b.z - a.z).normalize(), up = new THREE.Vector3(0, 1, 0), l = new THREE.Vector3().crossVectors(up, f).normalize();
    return { p: new THREE.Vector3(c.x, LT.elevAt(T, s) * VEX, c.z), f: f, l: l, h: c.h };
  }

  var texCache = {}, signGeo = new THREE.CircleGeometry(0.9, 16), boardGeo = new THREE.PlaneGeometry(14, 3.4);
  function canvasTex(key, w, h, draw) { if (texCache[key]) return texCache[key]; var cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); var t = new THREE.CanvasTexture(cv); texCache[key] = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }); return texCache[key]; }
  function signMat(n) { return canvasTex('lim' + n, 128, 128, function (x, w, h) { x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.strokeStyle = '#d3202a'; x.lineWidth = 14; x.beginPath(); x.arc(64, 64, 54, 0, 7); x.stroke(); x.fillStyle = '#111'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 68); }); }
  function stationMat(S) { return canvasTex('st' + S.id, 512, 128, function (x, w, h) { x.fillStyle = S.kind === 'base' ? '#33422d' : '#1d4a28'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f3d98b'; x.lineWidth = 6; x.strokeRect(5, 5, w - 10, h - 10); x.fillStyle = '#fff'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.fillText(S.name, w / 2, 62); x.font = '28px sans-serif'; x.fillStyle = '#f3d98b'; x.fillText(S.kind === 'base' ? 'ARMY BASE' : 'TOWN · mechanic · fuel · bar', w / 2, 106); }); }

  function buildStation(b, group, lapBase, S) {
    var s0 = lapBase + S.s, k, f0 = frame(s0), fe = frame(s0 + T.platform), PLC = col('#b9b4a8'), ROOF = S.kind === 'base' ? col('#4a5a3f') : col('#a8453a');
    for (k = 0; k < 15; k++) { /* platform slab on the right, 10 m pieces following the grade */
      var fa = frame(s0 + k * 10), fb = frame(s0 + k * 10 + 10), da = fa.l.clone().multiplyScalar(-4.0), db = fb.l.clone().multiplyScalar(-4.0), wa = fa.l.clone().multiplyScalar(-8.6), wb = fb.l.clone().multiplyScalar(-8.6), hh = new THREE.Vector3(0, 0.95, 0);
      var A = fa.p.clone().add(da).add(hh).toArray(), B = fb.p.clone().add(db).add(hh).toArray(), Cc = fb.p.clone().add(wb).add(hh).toArray(), D = fa.p.clone().add(wa).add(hh).toArray();
      b.quad(A, B, Cc, D, PLC); var A2 = fa.p.clone().add(da).toArray(), B2 = fb.p.clone().add(db).toArray(); b.quad(A2, B2, B, A, col('#8f8a7c'));
      if (k % 3 === 0) { var pp = fa.p.clone().add(fa.l.clone().multiplyScalar(-7.5)); b.box(pp.x, pp.y + 3.4, pp.z, 0.25, 4.6, 0.25, 0, col('#555')); }
    }
    /* canopy roof along the platform */
    for (k = 0; k < 3; k++) { var m = frame(s0 + 20 + k * 50).p.clone().add(frame(s0 + 20 + k * 50).l.clone().multiplyScalar(-6.3)); b.box(m.x, m.y + 5.9, m.z, 5.5, 0.3, 40, -frame(s0 + 20 + k * 50).h, ROOF); }
    /* building behind the platform */
    var mid = frame(s0 + 75), bp = mid.p.clone().add(mid.l.clone().multiplyScalar(-18)); var bh = -mid.h;
    if (S.kind === 'base') {
      b.box(bp.x, bp.y + 4, bp.z, 14, 8, 60, bh, col('#6f7a62'), col('#58634d')); var tw = mid.p.clone().add(mid.l.clone().multiplyScalar(-34)); b.box(tw.x, tw.y + 9, tw.z, 5, 18, 5, bh, col('#8a8f84')); b.box(tw.x, tw.y + 19.5, tw.z, 7, 3, 7, bh, col('#3d4a36'));
      b.box(tw.x + 6, tw.y + 22, tw.z, 0.3, 8, 0.3, 0, col('#ddd')); b.box(tw.x + 8, tw.y + 24.5, tw.z, 4, 2.4, 0.15, 0, col('#d3202a'));
    } else {
      b.box(bp.x, bp.y + 3.5, bp.z, 12, 7, 30, bh, PLC, col('#7c3d34'));
      for (k = 0; k < 7; k++) { var hp = frame(s0 + 10 + k * 25).p.clone().add(frame(s0 + 10 + k * 25).l.clone().multiplyScalar(-38 - hash(S.id, k) * 30)); var hc = [col('#d9c7a0'), col('#c98f6a'), col('#b7c4a0'), col('#cdb0a0')][k % 4]; b.box(hp.x, hp.y + 3, hp.z, 9, 6, 9, bh, hc, col('#9c4a3c')); }
    }
    /* stop markers + name board */
    [0, T.platform].forEach(function (d, i) { var fr = frame(s0 + d), q = fr.p.clone().add(fr.l.clone().multiplyScalar(-3.2)); b.box(q.x, q.y + 1.4, q.z, 0.3, 2.6, 0.3, 0, i ? col('#d3202a') : col('#37a24b')); b.box(q.x, q.y + 2.9, q.z, 1.6, 0.8, 0.2, -fr.h, i ? col('#d3202a') : col('#37a24b')); });
    var bm = new THREE.Mesh(boardGeo, stationMat(S)), nb = frame(s0 + 75); bm.position.copy(nb.p).add(nb.l.clone().multiplyScalar(-12)).add(new THREE.Vector3(0, 11.5, 0)); bm.rotation.y = -nb.h + Math.PI / 2; bm.rotation.y = Math.atan2(nb.l.x, nb.l.z) ; bm.lookAt(bm.position.clone().add(nb.l)); group.add(bm); group.userData.extra.push(bm);
  }

  function buildChunk(c) {
    var s0 = c * CH, o0 = LT.pathAt(T, s0), oy = LT.elevAt(T, s0) * VEX, b = new MB(o0.x, oy, o0.z), rows = [], i, j, k, group = new THREE.Group(), ss = ((s0 % T.L) + T.L) % T.L;
    group.userData.extra = []; var lapBase = s0 - ss;
    for (i = 0; i <= 20; i++) { var s = s0 + i * STEP, f = frame(s); rows.push({ s: s, p: f.p, l: f.l, h: f.h, alt: LT.elevAt(T, s) }); }
    /* terrain strip */
    var grid = [];
    for (i = 0; i <= 20; i++) { var r = rows[i], B = biomeMixAt(r.s), line = [];
      for (j = 0; j < COLS.length; j++) { var off = COLS[j], f2 = Math.max(0, Math.abs(off) - 4.2), side = off >= 0 ? 1 : -1, wx = r.p.x + Math.cos(r.h) * off, wz = r.p.z + Math.sin(r.h) * off, y = 0, cc = [0, 0, 0], q;
        for (k = 0; k < 3; k++) { q = shape(B[k], f2, side, wx, wz, r.alt); y += q[0] * BW[k]; cc[0] += q[1][0] * BW[k]; cc[1] += q[1][1] * BW[k]; cc[2] += q[1][2] * BW[k]; }
        var yy;
        if (Math.abs(off) <= 4.2) yy = r.p.y - 0.45; else { var fade = Math.max(0, Math.min(1, (Math.abs(off) - 200) / 220)); y = y * (1 - fade) - 40 * fade; if (B[1] === 'coast' && side < 0) y = Math.max(y, SEA_Y - r.p.y - 3); yy = r.p.y - 0.45 - 0.01 * Math.min(f2, 30) + y; }
        if (B[1] === 'mountains' && r.p.y / VEX > 170 && Math.abs(off) > 4.2) cc = mixc(cc, C.snow, 0.5);
        line.push({ p: [wx, yy, wz], c: cc }); }
      grid.push(line); }
    for (i = 0; i < 20; i++) for (j = 0; j < COLS.length - 1; j++) { if (j === 5) continue; var a = grid[i][j], bb = grid[i][j + 1], cd = grid[i + 1][j + 1], d = grid[i + 1][j]; b.quad(a.p, d.p, cd.p, bb.p, a.c, d.c, cd.c, bb.c); }
    /* ballast bed + rails */
    for (i = 0; i < 20; i++) { var r0 = rows[i], r1 = rows[i + 1];
      function at(r, off, dy) { return [r.p.x + r.l.x * -off, r.p.y + dy, r.p.z + r.l.z * -off]; }
      b.quad(at(r0, -2.0, -0.12), at(r0, 2.0, -0.12), at(r1, 2.0, -0.12), at(r1, -2.0, -0.12), C.ballast);
      b.quad(at(r0, 2.0, -0.12), at(r0, 3.2, -0.45), at(r1, 3.2, -0.45), at(r1, 2.0, -0.12), col('#615e58'));
      b.quad(at(r1, -2.0, -0.12), at(r1, -3.2, -0.45), at(r0, -3.2, -0.45), at(r0, -2.0, -0.12), col('#615e58'));
      [-0.72, 0.72].forEach(function (rx) { var w = 0.07; /* rail: top and both sides */
        b.quad(at(r0, rx - w, 0.2), at(r0, rx + w, 0.2), at(r1, rx + w, 0.2), at(r1, rx - w, 0.2), C.rail);
        b.quad(at(r0, rx + w, 0.2), at(r0, rx + w, -0.05), at(r1, rx + w, -0.05), at(r1, rx + w, 0.2), col('#8c8f95'));
        b.quad(at(r1, rx - w, 0.2), at(r1, rx - w, -0.05), at(r0, rx - w, -0.05), at(r0, rx - w, 0.2), col('#8c8f95')); }); }
    var mesh = new THREE.Mesh(new THREE.BufferGeometry(), VMAT); group.add(mesh);
    /* sleepers: one InstancedMesh per chunk */
    var nSl = Math.floor(CH / 1.8), sl = new THREE.InstancedMesh(SLEEPER_GEO, SLEEPER_MAT, nSl), mt = new THREE.Matrix4(), bx = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), basis = new THREE.Matrix4();
    for (i = 0; i < nSl; i++) { var fr = frame(s0 + i * 1.8 + 0.5), z = fr.f, x = fr.l; var yv = new THREE.Vector3().crossVectors(z, x).normalize();
      basis.makeBasis(x, yv, z); basis.setPosition(fr.p.x - o0.x, fr.p.y - oy - 0.2, fr.p.z - o0.z); sl.setMatrixAt(i, basis); }
    sl.instanceMatrix.needsUpdate = true; group.add(sl);
    /* decorations */
    var rn = LT.rng(c * 7919 + 17), bm = LT.biomeAt(T, s0 + 50), n, off, q2, sd;
    function place(sOff, offs) { var sx = s0 + sOff, o = LT.pathAt(T, sx); return [o.x + Math.cos(o.h) * offs, groundAt(sx, offs), o.z + Math.sin(o.h) * offs]; }
    for (n = 0; n < 2; n++) { var pf = frame(s0 + n * 50 + 10), side2 = n ? 1 : -1; var pq = pf.p.clone().add(pf.l.clone().multiplyScalar(5.4 * side2)); b.box(pq.x, pq.y + 3.2, pq.z, 0.2, 6.4, 0.2, 0, C.trunk); b.box(pq.x, pq.y + 6, pq.z, 2.2, 0.15, 0.15, -pf.h, C.trunk); }
    var nTrees = { forest: 16, snow: 7, mountains: 5, coast: 3, desert: 5, city: 0 }[bm];
    for (n = 0; n < nTrees; n++) { sd = rn() < 0.5 ? 1 : -1; off = sd * (9 + rn() * 70); var pt = place(rn() * CH, off), hgt = 5 + rn() * 5;
      if (bm === 'desert') { b.box(pt[0], pt[1] + 1.8, pt[2], 0.7, 3.6, 0.7, 0, C.cactus); b.box(pt[0] + 0.7, pt[1] + 2.4, pt[2], 0.9, 0.5, 0.5, 0, C.cactus); b.box(pt[0] + 1.1, pt[1] + 3.0, pt[2], 0.4, 1.4, 0.5, 0, C.cactus); }
      else if (bm === 'coast') { b.box(pt[0], pt[1] + 3, pt[2], 0.4, 6, 0.4, 0, C.trunk); b.cone(pt[0], pt[1] + 6, pt[2], 2.6, 1.0, 5, C.cactus, C.cactus); }
      else { var snowy = bm === 'snow' || bm === 'mountains' && pt[1] / VEX > 150; b.box(pt[0], pt[1] + 0.8, pt[2], 0.6, 1.6, 0.6, 0, C.trunk); b.cone(pt[0], pt[1] + 1.4, pt[2], 2.4, hgt, 6, C.pine, C.pine, 0.3, snowy ? 0.45 : 0, C.pineS, c * 31 + n); } }
    if (bm === 'desert' || bm === 'mountains' || bm === 'snow') for (n = 0; n < 4; n++) { sd = rn() < 0.5 ? 1 : -1; var pr = place(rn() * CH, sd * (10 + rn() * 80)); b.cone(pr[0], pr[1] - 0.3, pr[2], 1.5 + rn() * 3, 1.5 + rn() * 3, 5, bm === 'desert' ? C.sand2 : C.rock, C.rock, 0.5); }
    if (bm === 'city') for (n = 0; n < 9; n++) { sd = n % 2 ? 1 : -1; var pc = place((n >> 1) * 22 + rn() * 8, sd * (14 + rn() * 70)), hh = 8 + rn() * rn() * 70; b.box(pc[0], pc[1] + hh / 2, pc[2], 9 + rn() * 9, hh, 9 + rn() * 9, 0, mixc(col('#8f98a8'), col('#c3b5a5'), rn()), col('#6e7686')); }
    if (bm === 'mountains' || bm === 'snow') { var np = bm === 'mountains' ? 2 : 1; for (n = 0; n < np; n++) { sd = (c + n) % 2 ? 1 : -1; var hp = (bm === 'mountains' ? 220 + rn() * 520 : 70 + rn() * 90), rad = hp * (0.5 + rn() * 0.2), po = sd * (rad + 70 + rn() * 220), pk = place(rn() * CH, po); b.cone(pk[0], pk[1] - 30, pk[2], rad, hp, 7, C.rock, C.rock, 0.4, 0.42, C.snow, c * 13 + n); } }
    if (bm === 'coast') for (n = 0; n < 2; n++) { var pb = place(rn() * CH, -(120 + rn() * 250)); b.box(pb[0], SEA_Y + 0.6, pb[2], 5, 1.4, 14, rn() * 3, col('#c24b3a')); b.box(pb[0], SEA_Y + 6, pb[2], 0.2, 9, 0.2, 0, col('#fff')); b.quad([pb[0], SEA_Y + 10, pb[2]], [pb[0], SEA_Y + 2.5, pb[2]], [pb[0] + 4, SEA_Y + 2.5, pb[2]], [pb[0], SEA_Y + 10, pb[2]], col('#fff')); }
    /* stations that start in this chunk */
    T.stations.forEach(function (S) { var u = lapBase + S.s; if (u >= s0 && u < s0 + CH) buildStation(b, group, lapBase, S); });
    /* border posts: a striped barrier gate and a small booth beside the line */
    T.checkpoints.forEach(function (cp) { var u = lapBase + cp.s + 40; if (cp.s === 0) u = lapBase + 40; if (u >= s0 && u < s0 + CH) { var fr = frame(u), l = fr.l, q = fr.p.clone().add(l.clone().multiplyScalar(-6)), q2 = fr.p.clone().add(l.clone().multiplyScalar(6));
      b.box(q.x, q.y + 3, q.z, 0.6, 6, 0.6, 0, col('#f4f4f4')); b.box(q2.x, q2.y + 3, q2.z, 0.6, 6, 0.6, 0, col('#f4f4f4')); var m = fr.p.clone().add(new THREE.Vector3(0, 6.1, 0)); b.box(m.x, m.y, m.z, 13, 0.9, 0.5, -fr.h, col('#d3202a'));
      for (var k2 = 0; k2 < 5; k2++) { var pm = fr.p.clone().add(l.clone().multiplyScalar(-5 + k2 * 2.5)).add(new THREE.Vector3(0, 6.1, 0)); b.box(pm.x, pm.y, pm.z, 1.2, 0.95, 0.55, -fr.h, k2 % 2 ? col('#f4f4f4') : col('#d3202a')); }
      var bo = fr.p.clone().add(l.clone().multiplyScalar(-12)); b.box(bo.x, bo.y + 2, bo.z, 4, 4, 4, -fr.h, col('#c9b99a'), col('#7c3d34')); } });
    /* speed-limit signs 250 m before each curve */
    T.curves.forEach(function (cv) { var u = lapBase + cv.s - 250; if (u >= s0 && u < s0 + CH) { var fr = frame(u), q = fr.p.clone().add(fr.l.clone().multiplyScalar(-4.6)); b.box(q.x, q.y + 1.3, q.z, 0.15, 2.6, 0.15, 0, col('#777')); var m = new THREE.Mesh(signGeo, signMat(cv.sign)); m.position.set(q.x, q.y + 3.1, q.z); m.lookAt(q.x + fr.f.x * -10 + 0, q.y + 3.1 + fr.f.y * -10, q.z + fr.f.z * -10); group.add(m); group.userData.extra.push(m); } });
    mesh.geometry.dispose(); mesh.geometry = b.geometry(); group.position.set(o0.x, oy, o0.z); return { group: group, mesh: mesh, sleepers: sl };
  }
  var SLEEPER_GEO = new THREE.BoxGeometry(2.6, 0.16, 0.3), SLEEPER_MAT = new THREE.MeshLambertMaterial({ color: 0x4b3a2c });

  var chunks = {};
  function updateChunks(scene, s, budget) {
    var c0 = Math.floor(s / CH) - 2, c1 = c0 + 13, c, n = 0, key;
    for (c = c0; c <= c1; c++) if (!chunks[c] && n < budget) { chunks[c] = buildChunk(c); scene.add(chunks[c].group); n++; }
    for (key in chunks) { var ci = +key; if (ci < c0 - 1 || ci > c1 + 2) { var ch = chunks[key]; scene.remove(ch.group); ch.mesh.geometry.dispose(); ch.sleepers.dispose(); delete chunks[key]; } }
    return n;
  }
  function chunkCount() { return Object.keys(chunks).length; }
  window.LTWorld = { T: T, VEX: VEX, SEA_Y: SEA_Y, frame: frame, updateChunks: updateChunks, chunkCount: chunkCount, groundAt: groundAt, MB: MB, VMAT: VMAT, col: col };
})();
