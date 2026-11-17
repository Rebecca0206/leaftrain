/* LeafTrain rolling stock: every vehicle sits on two bogies placed on the track spline, so cars bend through curves and pitch on grades.
   Wheels are one InstancedMesh and spin with distance; couplers stretch between cars. */
(function () {
  'use strict';
  var LT = window.LT, W = window.LTWorld, THREE_ = window.THREE;
  function part(list, geo, color, m) { var g = geo.toNonIndexed(); if (m) g.applyMatrix4(m); var n = g.attributes.position.count, c = new Float32Array(n * 3), k; var cc = new THREE.Color(color); for (k = 0; k < n; k++) { c[k * 3] = cc.r; c[k * 3 + 1] = cc.g; c[k * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); list.push(g); }
  function merge(list) { var P = [], Cn = [], Nn = []; list.forEach(function (g) { g.computeVertexNormals(); P.push.apply(P, g.attributes.position.array); Cn.push.apply(Cn, g.attributes.color.array); Nn.push.apply(Nn, g.attributes.normal.array); g.dispose(); }); var o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(Cn, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); return o; }
  function M(x, y, z, ry) { var m = new THREE.Matrix4().makeTranslation(x, y, z); if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry)); return m; }
  function box(l, _u, w, h, d, x, y, z, c) { part(l, new THREE.BoxGeometry(w, h, d), c, M(x, y, z)); }
  function tube(l, r, len, x, y, z, c, seg) { part(l, new THREE.CylinderGeometry(r, r, len, seg || 10).rotateX(Math.PI / 2), c, M(x, y, z)); }
  var MAT = new THREE.MeshLambertMaterial({ vertexColors: true }), CPL_MAT = new THREE.MeshLambertMaterial({ color: 0x222222 });
  var CPL_GEO = new THREE.BoxGeometry(0.22, 0.22, 1).translate(0, 0, 0.5);
  var WHEEL_R = 0.55, MAXW = 200;
  var wheelGeo = (function () { var l = []; part(l, new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.14, 10).rotateZ(Math.PI / 2), 0x2a2d33); part(l, new THREE.BoxGeometry(0.16, 0.9, 0.12), 0xc9ccd2); part(l, new THREE.BoxGeometry(0.16, 0.12, 0.9), 0xc9ccd2); return merge(l); })();
  var CARGO_COL = { water: 0x2b8bd6, fuel: 0xe07a1f, gas: 0xe8e6dc };

  function loco() { var l = []; box(l, 0, 2.7, 2.2, 7, 0, 1.9, -3, 0x2f6b3a); box(l, 0, 2.3, 1.4, 5.5, 0, 1.45, 4.2, 0x2f6b3a); /* cab at the back, hood in front (+Z) */
    box(l, 0, 2.75, 0.25, 7.2, 0, 1.2, -3, 0xf3d98b); box(l, 0, 2.9, 0.3, 4.6, 0, 3.15, -3, 0x234f2c); box(l, 0, 1.0, 0.7, 1.0, 0, 2.95, 5, 0x333333);
    box(l, 0, 2.4, 0.5, 0.3, 0, 2.3, 7.0, 0xfff2b0); box(l, 0, 2.6, 0.4, 2.2, 0, 0.5, 0, 0x3a3d44);
    return { geo: merge(l), len: 14, bog: [3.2, 10.8] }; }
  function tender() { var l = []; box(l, 0, 2.6, 1.2, 8, 0, 1.2, 0, 0x2b2f36); tube(l, 1.0, 7.6, 0, 2.0, 0, 0xc23a2b, 10); box(l, 0, 2.6, 0.3, 8.4, 0, 0.5, 0, 0x3a3d44); return { geo: merge(l), len: 9, bog: [2.0, 7.0] }; }
  function car(loads) { var l = []; box(l, 0, 2.8, 0.35, 15, 0, 1.1, 0, 0x545861); box(l, 0, 0.18, 0.9, 15, 1.31, 1.65, 0, 0x7a6044); box(l, 0, 0.18, 0.9, 15, -1.31, 1.65, 0, 0x7a6044); box(l, 0, 2.8, 0.9, 0.18, 0, 1.65, 7.4, 0x7a6044); box(l, 0, 2.8, 0.9, 0.18, 0, 1.65, -7.4, 0x7a6044); return { geo: merge(l), len: 15, bog: [2.8, 12.2] }; }
  function tanker() { var l = []; box(l, 0, 2.4, 0.3, 12, 0, 1.0, 0, 0x2f3238); return { body: merge(l), len: 14, bog: [2.8, 11.2] }; }
  function tankBarrel(color) { var l = []; tube(l, 1.3, 11.5, 0, 2.45, 0, color, 10); box(l, 0, 0.5, 0.35, 0.5, 0, 3.8, 0, 0x444444); return merge(l); }
  /* loads for open cars: one merged mesh per cargo kind */
  function loadGeo(kind) { var l = [], i;
    if (kind === 'food') for (i = 0; i < 3; i++) { box(l, 0, 2.3, 1.1, 3.8, 0, 2.3, -4.5 + i * 4.5, 0x58a64a); }
    else if (kind === 'medical') for (i = 0; i < 2; i++) { box(l, 0, 2.4, 1.6, 4, 0, 2.5, -3.5 + i * 7, 0xf4f4f4); box(l, 0, 2.45, 0.2, 1.4, 1.22, 2.5, -3.5 + i * 7, 0xd3202a); box(l, 0, 2.45, 0.2, 1.4, -1.22, 2.5, -3.5 + i * 7, 0xd3202a); }
    else if (kind === 'weapons') for (i = 0; i < 3; i++) box(l, 0, 2.3, 1.2, 3.6, 0, 2.35, -4.6 + i * 4.6, 0x5d6b3d);
    else if (kind === 'tanks') for (i = 0; i < 2; i++) { var z = -3.8 + i * 7.6; box(l, 0, 2.2, 0.9, 5.2, 0, 2.2, z, 0x6a7a45); box(l, 0, 1.4, 0.8, 2.2, 0, 3.0, z + 0.2, 0x5b6b3a); tube(l, 0.14, 3.0, 0, 3.05, z + 2.7, 0x3d4a2c, 6); }
    else if (kind === 'aircraft') { tube(l, 0.7, 11, 0, 2.7, 0, 0xb9c3cf, 8); box(l, 0, 11, 0.12, 1.6, 0, 2.7, 0.4, 0x8d98a6); box(l, 0, 3.6, 0.12, 1.1, 0, 2.8, -4.8, 0x8d98a6); box(l, 0, 0.12, 1.6, 1.1, 0, 3.5, -4.8, 0x8d98a6); }
    else if (kind === 'nukes') for (i = 0; i < 2; i++) { var zz = -3.6 + i * 7.2; box(l, 0, 2.5, 1.7, 4.4, 0, 2.55, zz, 0xe8c11a); box(l, 0, 2.55, 0.2, 4.5, 0, 2.55, zz, 0x222222); box(l, 0, 2.55, 1.74, 0.5, 0, 2.55, zz - 1.2, 0x222222); box(l, 0, 2.55, 1.74, 0.5, 0, 2.55, zz + 1.2, 0x222222); }
    else { for (i = 0; i < 4; i++) box(l, 0, 2.3, 1.1, 3, 0, 2.3, -5.2 + i * 3.4, 0x8b6b43); }
    return merge(l); }
  var LOADS = {}; ['food', 'medical', 'weapons', 'tanks', 'aircraft', 'nukes', 'general'].forEach(function (k) { LOADS[k] = loadGeo(k); });
  var BARRELS = {}; Object.keys(CARGO_COL).concat(['empty']).forEach(function (k) { BARRELS[k] = tankBarrel(CARGO_COL[k] || 0x9aa3ad); });
  function coach() { var l = [], i; box(l, 0, 2.8, 2.6, 15, 0, 1.9, 0, 0xe9e4d2); box(l, 0, 2.85, 0.5, 15.1, 0, 1.3, 0, 0x2f6b3a); box(l, 0, 2.7, 0.3, 15, 0, 3.35, 0, 0x2f6b3a);
    for (i = 0; i < 6; i++) { box(l, 0, 2.86, 0.8, 1.5, 0, 2.2, -5.7 + i * 2.28, 0x6fa8d6); } box(l, 0, 2.6, 0.4, 2.2, 0, 0.5, 0, 0x3a3d44);
    return { geo: merge(l), len: 15, bog: [2.8, 12.2] }; }
  var BODIES = { coach: coach(), loco: loco(), tender: tender(), car: car(), tanker: tanker() };

  function Train(scene) { this.scene = scene; this.veh = []; this.group = new THREE.Group(); scene.add(this.group); this.ang = 0; this.cplr = []; this.wheels = new THREE.InstancedMesh(wheelGeo, MAT, MAXW); this.wheels.frustumCulled = false; this.wheels.count = 0; this.group.add(this.wheels); this.key = ''; this.derail = 0; }
  Train.prototype.rebuild = function (sp, contract) {
    var self = this, cargo = contract && contract.loaded ? contract.cargo : null, liquid = cargo && LT.CARGO[cargo].liquid;
    var key = [sp.cars, sp.tankers, sp.tender, sp.coaches, cargo].join('|'); if (key === this.key) return; this.key = key;
    this.veh.forEach(function (v) { self.group.remove(v.obj); }); this.cplr.forEach(function (c) { self.group.remove(c); }); this.veh = []; this.cplr = [];
    function add(kind, extra) { var B = BODIES[kind], obj = new THREE.Group(), body = new THREE.Mesh(B.geo || B.body, MAT); obj.add(body); var v = { kind: kind, len: B.len, bog: B.bog, obj: obj, load: null };
      if (kind === 'car') { var lg = LOADS[cargo && !liquid ? (LOADS[cargo] ? cargo : 'general') : 'general']; v.load = new THREE.Mesh(lg, MAT); v.load.visible = false; obj.add(v.load); }
      if (kind === 'tanker') { v.load = new THREE.Mesh(BARRELS[cargo && liquid ? cargo : 'empty'], MAT); obj.add(v.load); }
      self.group.add(obj); self.veh.push(v); }
    add('loco'); if (sp.tender) add('tender'); var i; for (i = 0; i < sp.cars; i++) add('car'); for (i = 0; i < sp.tankers; i++) add('tanker'); for (i = 0; i < sp.coaches; i++) add('coach');
    for (i = 0; i < this.veh.length - 1; i++) { var c = new THREE.Mesh(CPL_GEO, CPL_MAT); this.group.add(c); this.cplr.push(c); }
    /* show the load on as many cars as the weight needs */
    if (cargo) { var wt = contract.weight, per = liquid ? sp.tankCap : sp.capPer, need = Math.max(1, Math.ceil(wt / per)); this.veh.forEach(function (v) { if (v.kind === (liquid ? 'tanker' : 'car') && v.load) { v.load.visible = need-- > 0; } }); }
    else this.veh.forEach(function (v) { if (v.kind === 'car' && v.load) v.load.visible = false; });
    this.nw = this.veh.length * 4;
  };
  var _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
  /* place everything: s = front of the locomotive (unwrapped metres) */
  Train.prototype.update = function (s, dAng, derailed, hideLoco) {
    var self = this, pos = s, wi = 0, GAP = 1.2, k; this.ang += dAng / WHEEL_R;
    this.veh.forEach(function (v, idx) {
      var front = pos, rear = pos - v.len, fb = front - v.bog[0], rb = front - v.bog[1], A = W.frame(fb), B = W.frame(rb), up = new THREE.Vector3(0, 1, 0);
      /* body: between the two bogie points */
      var mid = A.p.clone().add(B.p).multiplyScalar(0.5), dir = A.p.clone().sub(B.p).normalize();
      v.obj.position.copy(mid); v.obj.lookAt(mid.clone().add(dir)); /* +Z forward */
      if (derailed) { v.obj.rotateZ(0.35 * (1 + (idx % 2) * 0.3)); v.obj.position.y -= 0.2; }
      v.obj.visible = !(hideLoco && idx === 0);
      v._front = W.frame(front); v._rear = W.frame(rear);
      /* bogies + wheels: 2 axles x 2 wheels each */
      [A, B].forEach(function (F) { var basis = new THREE.Matrix4(), z = F.f, x = F.l, y = new THREE.Vector3().crossVectors(z, x).normalize(); basis.makeBasis(x, y, z); basis.setPosition(F.p);
        [-1.1, 1.1].forEach(function (ax) { [-0.72, 0.72].forEach(function (sd) { if (wi >= MAXW) return; _m.copy(basis); _m.multiply(_r.makeTranslation(sd, 0.2 + WHEEL_R, ax)); _m.multiply(_r.makeRotationX(self.ang)); self.wheels.setMatrixAt(wi++, _m); }); }); });
      pos = rear - GAP;
    });
    this.wheels.count = wi; this.wheels.instanceMatrix.needsUpdate = true;
    for (k = 0; k < this.cplr.length; k++) { var a = this.veh[k], b = this.veh[k + 1], pa = a._rear, pb = b._front, c = this.cplr[k]; _p.copy(pa.p).add(_q.set(0, 1.0, 0)); _q.copy(pb.p).add(new THREE.Vector3(0, 1.0, 0)); c.position.copy(_p); c.lookAt(_q); c.scale.set(1, 1, Math.max(0.3, _p.distanceTo(_q))); }
  };
  window.LTTrain = { Train: Train, WHEEL_R: WHEEL_R };
})();
