/* LeafTrain engine (leafactivity.com/leaftrain/): track, physics, contracts, save. No DOM here, so Node can test it. */
(function (root) {
  'use strict';
  var FUEL_K = 20, ENERGY = 35.8e6, FUEL_KG = 0.85, G = 9.81, CRR = 0.003, RHO = 1.2, EFF = 0.85, A_SIGN = 1.1, PLATFORM = 150, SAVE_KEY = 'leaftrain.v1';

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ---------- Biomes ---------- */
  var BIOMES = {
    desert: { name: 'Desert', mu: 0.33, curve: [700, 1500, 1400, 2600], sky: ['#f6c27a', '#fde7b0'], ground: '#d9a85c', far: '#c98f55' },
    snow: { name: 'Snowfields', mu: 0.18, curve: [260, 520, 1000, 1700], sky: ['#9db8d6', '#e4eef7'], ground: '#eef3f8', far: '#9fb4cc' },
    forest: { name: 'Forest', mu: 0.28, curve: [300, 650, 900, 1500], sky: ['#78b5d8', '#cfe9d5'], ground: '#3f7a43', far: '#4f7f6a' },
    mountains: { name: 'Himalaya Pass', mu: 0.24, curve: [110, 170, 650, 1100], sky: ['#5b86b8', '#cfe0f1'], ground: '#8a8f99', far: '#7d8aa3' },
    coast: { name: 'Coast', mu: 0.30, curve: [400, 900, 1000, 1700], sky: ['#59b6e6', '#d8f1fb'], ground: '#cfc08c', far: '#6aa6c6' },
    city: { name: 'City', mu: 0.32, curve: [260, 520, 1100, 1800], sky: ['#8aa3c4', '#dbe3ee'], ground: '#6e7480', far: '#8892a6' }
  };

  /* Grade profile: [length m, grade %, biome, optional station]. Every number here is real physics input. */
  var SEGS = [
    [500, 0, 'desert'], [600, 2, 'desert'], [400, 0, 'desert', ['Sandhaven', 'town']], [700, -2, 'desert'], [500, 1.5, 'desert'], [500, -1.5, 'desert'],
    [600, 0.5, 'desert', ['Fort Mirage', 'base']], [700, -0.5, 'desert'],
    [600, 3, 'snow'], [500, -2, 'snow'], [700, 4, 'snow'], [400, 0, 'snow', ['Frostpine', 'town']], [600, -3, 'snow'], [700, 3.5, 'snow'], [500, -1, 'snow', ['Echo Outpost', 'base']], [500, -3.5, 'snow'],
    [500, 2, 'forest'], [600, -3, 'forest'], [500, 3, 'forest'], [500, -2, 'forest'], [600, 3, 'forest'], [600, -3, 'forest'], [700, 1, 'forest', ['Mossbridge', 'town']],
    [500, 3, 'mountains'], [1200, 6, 'mountains'], [500, 1.5, 'mountains', ['Kharo Basecamp', 'town']], [1200, 7, 'mountains'], [300, 2, 'mountains'], [1000, 8.5, 'mountains'], [300, 2, 'mountains'],
    [900, 9.5, 'mountains'], [400, 1, 'mountains'], [600, 5, 'mountains'], [500, 0, 'mountains', ['Sky Pass Fortress', 'base']],
    [1500, -6, 'mountains'], [1200, -7, 'mountains'], [500, -2, 'mountains', ['Dzong Valley', 'town']], [1500, -6, 'mountains'], [900, -4, 'mountains'], [900, -3.5, 'mountains'],
    [600, -2, 'coast'], [500, -1, 'coast', ['Port Azure', 'town']], [700, -2.5, 'coast'], [600, 0.5, 'coast'], [600, -1, 'coast'],
    [500, 0, 'city', ['Metro Central', 'town']], [600, 1, 'city'], [600, -1, 'city'], [700, 0.5, 'city', ['Capital Armory', 'base']], [600, -0.5, 'city']
  ];

  var _track = null;
  function makeTrack() {
    if (_track) return _track;
    var STEP = 5, L = 0, i, j;
    SEGS.forEach(function (s) { L += s[0]; });
    var n = Math.round(L / STEP), gr = new Float64Array(n), biomeIdx = [], stations = [], pos = 0;
    var names = Object.keys(BIOMES);
    SEGS.forEach(function (s, k) {
      var a = Math.round(pos / STEP), b = Math.round((pos + s[0]) / STEP);
      for (i = a; i < b && i < n; i++) gr[i] = s[1] / 100;
      biomeIdx.push([pos, pos + s[0], s[2]]);
      if (s[3]) { var mid = pos + s[0] / 2; stations.push({ id: stations.length, name: s[3][0], kind: s[3][1], s: Math.round((mid - PLATFORM / 2) / 5) * 5, biome: s[2] }); }
      pos += s[0];
    });
    /* smooth the grade with a ~150 m window (circular) so grade changes ease in */
    var W = 15, sm = new Float64Array(n);
    for (i = 0; i < n; i++) { var t = 0; for (j = -W; j <= W; j++) t += gr[(i + j + n) % n]; sm[i] = t / (2 * W + 1); }
    var net = 0; for (i = 0; i < n; i++) net += sm[i] * STEP;
    var fix = -net / L; for (i = 0; i < n; i++) sm[i] += fix; /* close the loop: net elevation change is exactly zero */
    var el = new Float64Array(n + 1); el[0] = 0;
    for (i = 0; i < n; i++) el[i + 1] = el[i] + sm[i] * STEP;
    var mn = Infinity; for (i = 0; i <= n; i++) if (el[i] < mn) mn = el[i];
    for (i = 0; i <= n; i++) el[i] = el[i] - mn + 5;
    var T = { L: L, STEP: STEP, n: n, el: el, gr: sm, stations: stations, segs: biomeIdx, platform: PLATFORM, curves: [] };
    /* curves (seeded, so the world is the same for everyone) */
    var r = rng(20261116), p = 400;
    while (p < L - 300) {
      var bi = biomeAt0(T, p), B = BIOMES[bi], tight = B.curve;
      var gap = bi === 'mountains' ? 350 + r() * 450 : 700 + r() * 1100;
      var len = 160 + r() * 160, R, dir;
      if (bi === 'mountains') { R = tight[0] + r() * (tight[1] - tight[0]); len = R * (0.9 + 0.8 * r()); } else R = (r() < 0.55 ? tight[0] + r() * (tight[1] - tight[0]) : tight[2] + r() * (tight[3] - tight[2]));
      dir = (T.curves.length % 2) ? 1 : -1;
      var st = p, en = p + len, bad = false;
      stations.forEach(function (S) { if (st < S.s + PLATFORM + 450 && en > S.s - 700) bad = true; });
      if (!bad) { var vl = Math.sqrt(A_SIGN * R); T.curves.push({ s: st, e: en, R: Math.round(R), dir: dir, v: vl, sign: Math.max(10, Math.floor(vl * 3.6 / 5) * 5) }); p = en + gap; } else p += 100;
    }
    T.checkpoints = []; /* border posts where biomes change: contraband may be inspected here */
    biomeIdx.forEach(function (b, k) { if (k > 0 && biomeIdx[k - 1][2] !== b[2]) T.checkpoints.push({ id: T.checkpoints.length, s: b[0], name: 'Border post: ' + BIOMES[b[2]].name }); });
    T.checkpoints.push({ id: T.checkpoints.length, s: 0, name: 'Border post: ' + BIOMES[biomeIdx[0][2]].name });
    _track = T; return T;
  }
  function biomeAt0(T, s) { s = ((s % T.L) + T.L) % T.L; for (var i = 0; i < T.segs.length; i++) if (s < T.segs[i][1]) return T.segs[i][2]; return T.segs[T.segs.length - 1][2]; }
  function wrap(T, s) { return ((s % T.L) + T.L) % T.L; }
  function elevAt(T, s) { s = wrap(T, s); var f = s / T.STEP, i = Math.floor(f), t = f - i; return T.el[i] * (1 - t) + T.el[i + 1] * t; }
  function gradeAt(T, s) { s = wrap(T, s); var i = Math.floor(s / T.STEP) % T.n; return T.gr[i]; }
  function biomeAt(T, s) { return biomeAt0(T, s); }
  function curveAt(T, s) { s = wrap(T, s); for (var i = 0; i < T.curves.length; i++) { var c = T.curves[i]; if (s >= c.s && s <= c.e) return c; } return null; }
  /* next curve whose start is within `ahead` metres in front of s */
  function nextCurve(T, s, ahead) { s = wrap(T, s); var best = null, bd = 1e9; T.curves.forEach(function (c) { var d = c.s - s; if (d < 0) d += T.L; if (c.e >= s && c.s <= s) d = 0; if (d < bd) { bd = d; best = c; } }); return best && bd <= ahead ? { curve: best, dist: bd } : null; }
  /* 3D centre line: heading comes from the same curves the physics uses (smoothed over ~60 m). It is an open spiral, so laps never jump. */
  function ensurePath(T, idx) {
    var i, j;
    if (!T.px) {
      var raw = new Float64Array(T.n), kc = new Float64Array(T.n);
      T.curves.forEach(function (c) { for (var q = Math.ceil(c.s / T.STEP); q <= Math.floor(c.e / T.STEP) && q < T.n; q++) raw[q] = c.dir / c.R; });
      for (i = 0; i < T.n; i++) { var t = 0; for (j = -6; j <= 6; j++) t += raw[(i + j + T.n) % T.n]; kc[i] = t / 13; }
      T.kc = kc; T.px = [0]; T.pz = [0]; T.ph = [0];
    }
    while (T.px.length <= idx) {
      var k = T.px.length - 1, h = T.ph[k], h2 = h + T.kc[k % T.n] * T.STEP, mid = (h + h2) / 2;
      T.ph.push(h2); T.px.push(T.px[k] + Math.sin(mid) * T.STEP); T.pz.push(T.pz[k] - Math.cos(mid) * T.STEP);
    }
  }
  /* position and heading at unwrapped distance s >= 0 */
  function pathAt(T, s) {
    if (s < 0) s = 0; var f = s / T.STEP, i = Math.floor(f), t = f - i; ensurePath(T, i + 2);
    return { x: T.px[i] * (1 - t) + T.px[i + 1] * t, z: T.pz[i] * (1 - t) + T.pz[i + 1] * t, h: T.ph[i] * (1 - t) + T.ph[i + 1] * t };
  }
  function stationOf(T, s) { s = wrap(T, s); for (var i = 0; i < T.stations.length; i++) { var S = T.stations[i]; if (s >= S.s + 5 && s <= S.s + T.platform) return S; } return null; }
  function distTo(T, from, to) { var d = wrap(T, to) - wrap(T, from); return d < 0 ? d + T.L : d; }

  /* ---------- Upgrades & train spec ---------- */
  var ENGINE = [[900, 160, 22, 70], [1400, 230, 25, 82], [2000, 320, 28, 94], [2800, 430, 31, 106], [3800, 560, 34, 118], [5000, 700, 37, 130], [6500, 850, 40, 142]]; /* kW, kN, max m/s, loco t */
  var BRAKE = [60, 85, 115, 150, 190, 240]; /* kN per vehicle */
  var UP = {
    engine: { name: 'Engine', max: ENGINE.length - 1, cost: [1500, 3500, 7500, 15000, 30000, 60000] },
    brakes: { name: 'Brakes', max: BRAKE.length - 1, cost: [800, 2200, 5000, 11000, 24000] },
    wheels: { name: 'Wheels & traction', max: 5, cost: [1200, 3000, 6500, 13000, 26000] },
    cap: { name: 'Heavy-duty cars', max: 5, cost: [1000, 2800, 6000, 12500, 25000] },
    cars: { name: 'Cargo cars', max: 6, min: 1, cost: [0, 2000, 4000, 8000, 14000, 22000] }, /* cost to go to the next number of cars: cost[cars] */
    tankers: { name: 'Gas & tank wagons', max: 4, cost: [2500, 5000, 9000, 16000] },
    tankLvl: { name: 'Tank wagon size', max: 4, cost: [1500, 3500, 8000, 16000] },
    tender: { name: 'Fuel tender', max: 1, cost: [3500] },
    coaches: { name: 'Passenger wagons', max: 4, cost: [3000, 6000, 10000, 16000] },
    comfort: { name: 'Passenger comfort', max: 4, cost: [2000, 4500, 9000, 16000] }
  };
  function newUpg() { return { engine: 0, brakes: 0, wheels: 0, cap: 0, cars: 1, tankers: 0, tankLvl: 0, tender: 0, coaches: 0, comfort: 0 }; }
  function spec(u) {
    var E = ENGINE[u.engine], capPer = 40 + 20 * u.cap, carMass = (20 + 0.25 * capPer) * 1000, tk = u.tankers | 0, tl = u.tankLvl | 0, td = u.tender | 0, pc = u.coaches | 0, cf = u.comfort | 0;
    var tankCap = 30 + 15 * tl, tankMass = (18 + 0.2 * tankCap) * 1000, nVeh = u.cars + tk + td + pc + 1, coachMass = (28 + 1.5 * cf) * 1000;
    return {
      u: u, power: E[0] * 1000, fmax: E[1] * 1000, vmax: E[2], locoMass: E[3] * 1000, cars: u.cars, capPer: capPer, capacity: capPer * u.cars,
      tankers: tk, coaches: pc, comfort: cf, seats: 40 * pc, coachMass: coachMass, tankCap: tankCap, tankCapTotal: tankCap * tk, tankMass: tankMass, tender: td,
      fuelCap: 300 + 100 * u.engine + 700 * td, carMass: carMass, emptyMass: E[3] * 1000 + carMass * u.cars + tankMass * tk + 14000 * td + coachMass * pc, nVeh: nVeh, brakePerVeh: BRAKE[u.brakes] * 1000,
      heatCap: nVeh * (0.25 + 0.2 * u.brakes) * 1e6, coolBase: nVeh * (500 + 100 * u.brakes),
      muMul: 1 + 0.06 * u.wheels, drivenFrac: 0.1 * u.wheels, critRatio: 1.32 + 0.04 * u.wheels,
      cdA: 9 + 1.5 * (u.cars + tk + pc), length: 22 + 19 * (u.cars + tk + pc) + 12 * td
    };
  }
  function totalMass(sp, cargoT, fuelL) { return sp.emptyMass + cargoT * 1000 + (fuelL || 0) * FUEL_KG; }
  function drivenMass(sp, cargoT, fuelL) { return sp.locoMass + sp.drivenFrac * (totalMass(sp, cargoT, fuelL) - sp.locoMass); }
  /* tractive effort the train can actually put on the rails at a crawl (engine or wheel grip, whichever is lower) */
  function tractive(sp, cargoT, mu, fuelL) { return Math.min(sp.fmax, mu * sp.muMul * drivenMass(sp, cargoT, fuelL) * G); }

  /* ---------- Cargo & contracts ---------- */
  var CARGO = {
    water: { name: 'Water', icon: '💧', rate: 6, w: [20, 120], liquid: true }, food: { name: 'Food', icon: '🍞', rate: 8, w: [15, 90] },
    fuel: { name: 'Fuel', icon: '⛽', rate: 9, w: [25, 140], liquid: true }, gas: { name: 'Gas (LPG)', icon: '🔥', rate: 11, w: [15, 100], liquid: true }, medical: { name: 'Medical supplies', icon: '🩺', rate: 22, w: [5, 25] },
    weapons: { name: 'Weapons crates', icon: '📦', rate: 16, w: [20, 90] }, tanks: { name: 'Tanks', icon: '🛡️', rate: 12, w: [60, 200] },
    aircraft: { name: 'Aircraft', icon: '✈️', rate: 14, w: [50, 220] },
    liquor: { name: 'Liquor barrels (untaxed)', icon: '🥃', rate: 26, w: [10, 70], contraband: true }, arms: { name: 'Unregistered weapons', icon: '📦', rate: 38, w: [10, 60], contraband: true }, crates: { name: 'Contraband crates', icon: '🎁', rate: 32, w: [10, 80], contraband: true }, nukes: { name: 'Nukes (sealed crates)', icon: '☢️', rate: 30, w: [40, 160] }
  };
  var CARGO_IDS = Object.keys(CARGO), LEGAL_IDS = CARGO_IDS.filter(function (k) { return !CARGO[k].contraband; }), CONTRA_IDS = CARGO_IDS.filter(function (k) { return CARGO[k].contraband; });
  /* liquids and gas ride only in tank wagons; everything else rides in cargo cars */
  function capFor(sp, cid) { return CARGO[cid].liquid ? sp.tankCapTotal : sp.capacity; }

  /* Route facts used by the lock rules: steepest 300 m average grade, climb, slowest mu, tightest curve. */
  function routeInfo(T, from, to) {
    var a = wrap(T, from), d = distTo(T, from, to), maxG = -1, climb = 0, mu = 1, vmin = 99, prev = elevAt(T, a), steps = Math.floor(d / 25), k;
    for (k = 0; k <= steps; k++) {
      var s = a + k * 25, e = elevAt(T, s); if (e > prev) climb += e - prev; prev = e;
      var g = (elevAt(T, s + 300) - elevAt(T, s)) / 300; if (g > maxG) maxG = g;
      var B = BIOMES[biomeAt(T, s)]; if (B.mu < mu) mu = B.mu;
    }
    T.curves.forEach(function (c) { var cs = distTo(T, a, c.s); if (cs <= d && c.v < vmin) vmin = c.v; });
    return { dist: d, maxGrade: Math.max(0, maxG), climb: climb, mu: mu, vCurve: vmin };
  }
  var _ri = {};
  function routeCached(T, i, j) { var k = i + '>' + j; return _ri[k] || (_ri[k] = routeInfo(T, T.stations[i].s, T.stations[j].s)); }

  /* Why a contract is locked for this train ([] means it can be taken). */
  function lockReasons(T, sp, c) {
    var out = [], ri = routeCached(T, c.from, c.to);
    var cf = capFor(sp, c.cargo), liq = CARGO[c.cargo].liquid;
    if (c.weight > cf) out.push({ k: 'cap', need: c.weight, have: cf, text: liq ? 'Needs ' + c.weight + ' t of tank wagon capacity (you have ' + cf + ' t). Buy tank wagons or a bigger tank size.' : 'Needs ' + c.weight + ' t of car capacity (you have ' + cf + ' t). Add cars or heavy-duty cars.' });
    var m = totalMass(sp, c.weight, sp.fuelCap), need = m * G * (ri.maxGrade + CRR) * 1.0;
    var have = tractive(sp, c.weight, ri.mu, sp.fuelCap);
    if (have < need) out.push({ k: 'te', need: need, have: have, text: 'Needs ' + Math.ceil(need / 1000) + ' kN tractive effort to climb (you have ' + Math.floor(have / 1000) + ' kN). Upgrade engine or wheels.' });
    var pw = sp.power * EFF; if (need > 0 && pw / need < 4) out.push({ k: 'pw', need: need * 4 / EFF, have: sp.power, text: 'Needs ' + Math.ceil(need * 4 / EFF / 1000) + ' kW engine power to keep climbing (you have ' + Math.floor(sp.power / 1000) + ' kW).' });
    return out;
  }
  function makeBoard(T, from, seed, sp) {
    var r = rng(seed), list = [], N = T.stations.length, used = {};
    for (var n = 0; n < 6; n++) {
      var cid, wt;
      if (n < 3) { var opts = LEGAL_IDS.filter(function (id) { return CARGO[id].w[0] <= capFor(sp, id) * 0.95; }); cid = opts[Math.floor(r() * opts.length)]; var hi = Math.min(CARGO[cid].w[1], capFor(sp, cid)); wt = CARGO[cid].w[0] + r() * (hi - CARGO[cid].w[0]); }
      else { cid = LEGAL_IDS[Math.floor(r() * LEGAL_IDS.length)]; wt = CARGO[cid].w[0] + r() * (CARGO[cid].w[1] - CARGO[cid].w[0]); }
      wt = Math.max(CARGO[cid].w[0], Math.round(wt / 5) * 5);
      var k = 1 + Math.floor(r() * r() * 3), to = (from + k) % N, key = cid + to; if (used[key]) { to = (from + 1) % N; }
      used[cid + to] = 1;
      list.push(makeContract(T, from, to, cid, wt, seed * 100 + n));
    }
    return list;
  }
  /* 13+ jobs: two contraband contracts per station. They pay well, and border posts may inspect. */
  function makeContraband(T, from, seed, sp) {
    var r = rng(seed * 977 + 31), out = [], N = T.stations.length;
    for (var n = 0; n < 2; n++) {
      var cid = CONTRA_IDS[Math.floor(r() * CONTRA_IDS.length)], cf = Math.max(CARGO[cid].w[0], Math.min(CARGO[cid].w[1], sp.capacity)), wt = Math.round((CARGO[cid].w[0] + r() * (cf - CARGO[cid].w[0])) / 5) * 5;
      var to = (from + 1 + Math.floor(r() * 3)) % N, c = makeContract(T, from, to, cid, Math.max(CARGO[cid].w[0], wt), seed * 1000 + 500 + n); c.contraband = true; out.push(c);
    }
    return out;
  }
  function makeContract(T, from, to, cid, wt, id) {
    var ri = routeCached(T, from, to), C = CARGO[cid];
    var pay = Math.round(wt * (ri.dist / 1000) * C.rate * (1 + ri.climb / 900) / 10) * 10;
    var dl = Math.round((ri.dist / 11 + ri.climb * 0.9 + 60) * (wt > 100 ? 1.15 : 1) / 5) * 5;
    return { id: id, from: from, to: to, cargo: cid, weight: wt, pay: pay, deadline: dl, dist: Math.round(ri.dist), climb: Math.round(ri.climb), maxGrade: ri.maxGrade };
  }

  /* ---------- Physics ---------- */
  var ZERO_WEAR = { engine: 0, brakes: 0, wheels: 0 };
  function newState(T, stationId, sp) {
    var S = T.stations[stationId || 0];
    return { s: T.L + S.s + 60, v: 0, throttle: 0, brake: 0, dir: 1, park: true, temp: 20, slip: false, skid: false, derailed: false, warn: false, cargo: 0, fade: 0, t: 0, lastG: 0, lastLimit: 0, accel: 0, fuel: sp ? sp.fuelCap : 400, aLag: 0, slosh: 0, out: false };
  }
  function trainGrade(T, sp, s) { return (gradeAt(T, s) + gradeAt(T, s - sp.length / 2) + gradeAt(T, s - sp.length)) / 3; }
  function step(st, sp, T, dt) {
    if (st.derailed) { st.v = 0; return st; }
    var m = totalMass(sp, st.cargo, st.fuel), v = st.v, sgn = v > 0 ? 1 : v < 0 ? -1 : 0;
    var grade = trainGrade(T, sp, st.s), th = Math.atan(grade), sinT = Math.sin(th), cosT = Math.cos(th);
    var B = BIOMES[biomeAt(T, st.s)], wr = st.wear || ZERO_WEAR, ft = st.fault && st.fault.t > 0 ? st.fault.kind : '';
    if (st.fault && st.fault.t > 0) { st.fault.t -= dt; if (st.fault.t <= 0) st.fault = null; }
    var mu = B.mu * sp.muMul * (1 - 0.12 * wr.wheels) * (ft === 'wheels' ? 0.6 : 1);
    /* drive */
    var av = Math.abs(v), fAvail = Math.min(sp.fmax, sp.power * EFF / Math.max(av, 1)) * (1 - 0.25 * wr.engine) * (ft === 'engine' ? 0 : 1), vcap = st.dir > 0 ? sp.vmax : 8;
    var gov = (v * st.dir >= 0) ? Math.max(0, Math.min(1, (vcap - av) / 1.5)) : 1;
    var Fd = st.dir * st.throttle * fAvail * gov;
    st.out = st.fuel <= 0; if (st.out) Fd = 0; /* no fuel, no traction */
    var Fadh = mu * drivenMass(sp, st.cargo, st.fuel) * G * cosT; st.slip = false;
    if (Math.abs(Fd) > Fadh) { st.slip = true; Fd = Math.sign(Fd) * Fadh * 0.75; }
    var Fg = -m * G * sinT, rollMag = CRR * m * G * cosT, airMag = 0.5 * RHO * sp.cdA * v * v;
    /* brakes: shoe force fades when hot, and can never exceed wheel grip (then wheels skid) */
    var park = st.park && av < 2 ? 1 : 0, bin = Math.max(st.brake, park);
    st.fade = Math.min(0.65, Math.max(0, (st.temp - 320) / 600));
    var cap = sp.brakePerVeh * sp.nVeh * (1 - st.fade) * (1 - 0.3 * wr.brakes) * (ft === 'brakes' ? 0.4 : 1), grip = 0.9 * mu * m * G * cosT;
    st.skid = false; var Fb = bin * cap; if (Fb > grip) { Fb = grip * 0.85; st.skid = true; }
    /* liquid slosh: the load lags the train, so hard braking shoves it forward and hard accelerating drags it back */
    var liqT = st.liquid || 0, Fsl = 0;
    if (liqT > 0) Fsl = -liqT * 1000 * 0.35 * (st.accel - st.aLag);
    var Fother = Fd + Fg + Fsl, vNew;
    if (av < 1e-3) {
      var hold = Fb + rollMag * 1.3;
      if (Math.abs(Fother) <= hold) vNew = 0; else vNew = (Fother - Math.sign(Fother) * hold) / (m * 1.06) * dt;
    } else {
      var Fnet = Fother - sgn * (Fb + rollMag + airMag); vNew = v + Fnet / (m * 1.06) * dt;
      if (vNew * v < 0) vNew = (Math.abs(Fother) <= Fb + rollMag * 1.3) ? 0 : vNew;
    }
    st.accel = (vNew - v) / dt; st.v = vNew;
    st.aLag += (st.accel - st.aLag) * Math.min(1, dt / 1.8);
    var share = liqT * 1000 / m; st.slosh = liqT > 0 ? Math.min(1, 0.25 * Math.min(1, share * 3) + Math.abs(st.accel - st.aLag) / 2.5) : 0;
    /* fuel burn: engine work at the wheels / engine efficiency, plus idling */
    var pwW = Math.max(0, Fd * st.v); st.burn = (0.03 * sp.power + pwW / 0.38) / ENERGY * FUEL_K * (st.fuelMul || 1);
    st.fuel = Math.max(0, st.fuel - st.burn * dt);
    st.s += (v + vNew) / 2 * dt;
    /* brake heat */
    var pw = Fb * Math.abs(v), cool = sp.coolBase + sp.nVeh * 40 * Math.abs(v);
    st.temp += (pw / sp.heatCap - cool * (st.temp - 20) / sp.heatCap) * dt; if (st.temp < 20) st.temp = 20;
    /* curve: speed sign, warning, derail */
    var c = curveAt(T, st.s); st.warn = false; st.lastLimit = c ? c.v : 0; st.lastG = grade;
    if (c) {
      var ratio = Math.abs(st.v) / c.v; st.warn = ratio > 1.0;
      var crit = sp.critRatio * (1 - 0.35 * Math.min(0.5, liqT * 1000 / m) * (0.4 + 0.6 * st.slosh));
      if (ratio > crit) { st.derailed = true; st.v = 0; st.derailCurve = c; }
    }
    st.t += dt;
    return st;
  }
  /* stopping distance if brakes are held fully from speed v on a given grade (for the HUD hint and tests) */
  function stopDistance(sp, cargoT, v, grade, mu, fade, fuelL) {
    var m = totalMass(sp, cargoT, fuelL), th = Math.atan(grade), F = Math.min(sp.brakePerVeh * sp.nVeh * (1 - (fade || 0)), 0.85 * mu * sp.muMul * m * G * Math.cos(th)) + CRR * m * G;
    var a = (F + m * G * Math.sin(th)) / (m * 1.06); if (a <= 0.01) return Infinity; return v * v / (2 * a);
  }

  /* ---------- Delivery ---------- */
  function checkDelivery(st, T, game) {
    var c = game.contract; if (!c || st.derailed) return null;
    var S = stationOf(T, st.s); if (!S || S.id !== c.to || Math.abs(st.v) > 0.3) return null;
    var late = Math.max(0, game.clock - (c.t0 || 0) - c.deadline), pay = c.pay;
    if (late > 0) pay = Math.round(pay * Math.max(0.4, 1 - 0.6 * late / c.deadline) / 10) * 10;
    return { pay: pay, late: late, base: c.pay };
  }
  function repairCost(sp) { return 300 + 120 * (sp.cars + sp.tankers + sp.coaches) + 150 * sp.u.engine; }

  /* ---------- Game state, upgrades, save ---------- */
  function newGame(T) {
    var u = newUpg(), sp = spec(u), g = { v: 1, money: 500, fuel: sp.fuelCap, upg: u, hold: {}, crew: newCrew(), wear: { engine: 0, brakes: 0, wheels: 0 }, wageAcc: 0, pax: null, trips: null, contra: null,  contract: null, clock: 0, stationId: 0, seed: 7, boardSeed: 1, board: null, s: 0, stats: { delivered: 0, earned: 0, derails: 0, late: 0, played: 0 } };
    g.board = makeBoard(T, 0, g.boardSeed, sp); g.contra = makeContraband(T, 0, g.boardSeed, sp); g.trips = makeTrips(T, 0, g.boardSeed, sp); g.s = T.L + T.stations[0].s + 60; return g;
  }
  function canBuy(game, key) {
    var U = UP[key], lv = key === 'cars' ? game.upg.cars : game.upg[key];
    if (key === 'cars') { if (lv >= U.max) return { ok: false, cost: 0, why: 'Max' }; var c = U.cost[lv]; return { ok: game.money >= c, cost: c, why: game.money >= c ? '' : 'Need $' + (c - game.money) + ' more' }; }
    if (lv >= U.max) return { ok: false, cost: 0, why: 'Max' };
    var cost = U.cost[lv]; return { ok: game.money >= cost, cost: cost, why: game.money >= cost ? '' : 'Need $' + (cost - game.money) + ' more' };
  }
  function buy(game, key) {
    var q = canBuy(game, key); if (!q.ok) return false;
    if ((game.contract && game.contract.loaded) || game.pax) return false; /* no garage visits with cargo or riders aboard */
    game.money -= q.cost; game.upg[key] += 1; return true;
  }

  /* ---------- Markets: each town has its own buy and sell prices; you can also barter goods for goods ---------- */
  var GOODS = {
    food: { name: 'Food', icon: '🌾', base: 40, cheap: ['forest', 'coast'], dear: ['desert', 'mountains', 'snow'] },
    water: { name: 'Water', icon: '💧', base: 18, liquid: true, cheap: ['snow', 'mountains'], dear: ['desert', 'city'] },
    fuel: { name: 'Fuel', icon: '⛽', base: 55, liquid: true, cheap: ['desert', 'coast'], dear: ['mountains', 'snow', 'forest'] },
    gas: { name: 'Gas (LPG)', icon: '🔥', base: 60, liquid: true, cheap: ['desert'], dear: ['city', 'mountains', 'snow'] },
    medical: { name: 'Medical supplies', icon: '🩺', base: 220, cheap: ['city'], dear: ['mountains', 'snow', 'desert'] },
    timber: { name: 'Timber', icon: '🪵', base: 35, cheap: ['forest'], dear: ['desert', 'city', 'coast'] },
    steel: { name: 'Steel', icon: '🔩', base: 80, cheap: ['city'], dear: ['forest', 'coast', 'mountains'] }
  };
  var GOOD_IDS = Object.keys(GOODS), SPREAD = 0.1;
  function marketPrices(T, id) {
    var S = T.stations[id]; if (!S || S.kind !== 'town') return null; var out = {}, r = rng(id * 104729 + 7);
    GOOD_IDS.forEach(function (g) { var G = GOODS[g], f = G.cheap.indexOf(S.biome) >= 0 ? 0.7 : G.dear.indexOf(S.biome) >= 0 ? 1.4 : 1.0, mid = G.base * f * (0.92 + 0.16 * r());
      out[g] = { mid: Math.round(mid * 100) / 100, buy: Math.round(mid * (1 + SPREAD) * 100) / 100, sell: Math.round(mid * (1 - SPREAD) * 100) / 100 }; });
    return out;
  }
  function holdTons(game) { var sol = 0, liq = 0, h = game.hold || {}; GOOD_IDS.forEach(function (g) { var t = h[g] || 0; if (GOODS[g].liquid) liq += t; else sol += t; }); return { solid: sol, liquid: liq }; }
  /* free room for solid goods (cars) or liquids (tank wagons), after the contract cargo and what you already hold */
  function freeRoom(sp, game, liquid) {
    var t = holdTons(game), c = game.contract && game.contract.loaded ? game.contract : null, cl = c ? !!CARGO[c.cargo].liquid : false;
    return liquid ? sp.tankCapTotal - t.liquid - (c && cl ? c.weight : 0) : sp.capacity - t.solid - (c && !cl ? c.weight : 0);
  }
  function marketBuy(game, sp, T, id, good, tons) {
    var P = marketPrices(T, id); if (!P || !GOODS[good]) return { ok: false, why: 'No market here' }; tons = Math.floor(tons);
    if (tons < 1) return { ok: false, why: 'Nothing to buy' }; var room = freeRoom(sp, game, !!GOODS[good].liquid);
    if (tons > room) return { ok: false, why: GOODS[good].liquid ? 'Not enough tank wagon room (' + Math.max(0, Math.floor(room)) + ' t free)' : 'Not enough car room (' + Math.max(0, Math.floor(room)) + ' t free)' };
    var cost = Math.round(P[good].buy * tons * 100) / 100; if (cost > game.money) return { ok: false, why: 'Not enough money' };
    game.money = Math.round((game.money - cost) * 100) / 100; game.hold = game.hold || {}; game.hold[good] = (game.hold[good] || 0) + tons; return { ok: true, cost: cost, tons: tons };
  }
  function marketSell(game, T, id, good, tons) {
    var P = marketPrices(T, id); if (!P || !GOODS[good]) return { ok: false, why: 'No market here' }; tons = Math.floor(tons); var have = (game.hold || {})[good] || 0;
    if (tons < 1 || tons > have) return { ok: false, why: 'You do not carry that much' };
    var gain = Math.round(P[good].sell * tons * 100) / 100; game.money = Math.round((game.money + gain) * 100) / 100; game.hold[good] = have - tons; if (!game.hold[good]) delete game.hold[good]; return { ok: true, gain: gain, tons: tons };
  }
  /* barter: tons of `give` for tons of `get` at this town's rates (what they would pay for yours, over what they would charge for theirs) */
  function barterRate(T, id, give, get) { var P = marketPrices(T, id); if (!P || !P[give] || !P[get] || give === get) return 0; return P[give].sell / P[get].buy; }
  function barter(game, sp, T, id, give, get, tons) {
    tons = Math.floor(tons); var have = (game.hold || {})[give] || 0, rate = barterRate(T, id, give, get); if (!rate) return { ok: false, why: 'No barter here' };
    if (tons < 1 || tons > have) return { ok: false, why: 'You do not carry that much' }; var out = Math.floor(tons * rate); if (out < 1) return { ok: false, why: 'Too little to trade' };
    var h = game.hold, sameKind = !!GOODS[give].liquid === !!GOODS[get].liquid, room = freeRoom(sp, game, !!GOODS[get].liquid) + (sameKind ? tons : 0);
    if (out > room) return { ok: false, why: 'Not enough room for ' + out + ' t' };
    h[give] = have - tons; if (!h[give]) delete h[give]; h[get] = (h[get] || 0) + out; return { ok: true, got: out, rate: rate };
  }

  /* ---------- Crew on wages ---------- */
  var CREW = { engineer: { name: 'Engineer', wage: 40, text: 'Burns 15% less fuel' }, mechanic: { name: 'Train mechanic', wage: 30, text: 'Half the wear, fewer breakdowns, repairs wear as you go' },
    conductor: { name: 'Conductor', wage: 25, text: '+25% passenger fares' }, cook: { name: 'Cook', wage: 15, text: 'Happier passengers pay more' }, guard: { name: 'Guard', wage: 20, max: 2, text: 'Less seizure and theft (each guard)' } };
  function newCrew() { return { engineer: 0, mechanic: 0, conductor: 0, cook: 0, guards: 0 }; }
  function crewKey(role) { return role === 'guard' ? 'guards' : role; }
  function crewCount(game, role) { return (game.crew || {})[crewKey(role)] | 0; }
  function hireCost(role) { return CREW[role].wage * 10; }
  function hire(game, role) { var C = CREW[role]; if (!C) return { ok: false, why: 'Unknown role' }; var max = C.max || 1; if (crewCount(game, role) >= max) return { ok: false, why: 'Already hired' };
    var fee = hireCost(role); if (game.money < fee) return { ok: false, why: 'Need $' + Math.ceil(fee - game.money) + ' more' }; game.money -= fee; game.crew[crewKey(role)] = crewCount(game, role) + 1; return { ok: true, cost: fee }; }
  function fire(game, role) { if (!crewCount(game, role)) return false; game.crew[crewKey(role)]--; return true; }
  function wagesPerMin(game) { var t = 0; Object.keys(CREW).forEach(function (r) { t += CREW[r].wage * crewCount(game, r); }); return t; }
  /* wages come out of your money by the minute; with nothing left to pay them, the crew walks off */
  function payWages(game, dt) {
    var rate = wagesPerMin(game); if (!rate) return { quit: [] }; game.wageAcc = (game.wageAcc || 0) + rate / 60 * dt; var due = Math.floor(game.wageAcc);
    if (due < 1) return { quit: [] }; game.wageAcc -= due; if (game.money >= due) { game.money -= due; return { paid: due, quit: [] }; }
    game.money = 0; var q = []; Object.keys(CREW).forEach(function (r) { if (crewCount(game, r)) q.push(CREW[r].name); }); game.crew = newCrew(); return { quit: q };
  }
  function crewFx(game) { var g = crewCount(game, 'guard'); return { fuel: crewCount(game, 'engineer') ? 0.85 : 1, wearRate: crewCount(game, 'mechanic') ? 0.5 : 1, repair: crewCount(game, 'mechanic') ? 0.0004 : 0, hazard: crewCount(game, 'mechanic') ? 0.4 : 1,
    pax: crewCount(game, 'conductor') ? 1.25 : 1, happy: crewCount(game, 'cook') ? 0.2 : 0, seize: 1 - 0.3 * g, theft: 1 - 0.35 * g }; }

  /* ---------- Wear and breakdowns ---------- */
  /* Wear builds with use. High wear costs power, brake force and grip, and can cause a breakdown (a timed fault). Returns the fault kind if one happens. */
  function wearStep(game, st, fx, dt, rand) {
    var w = game.wear = game.wear || { engine: 0, brakes: 0, wheels: 0 }, k = fx.wearRate, av = Math.abs(st.v);
    w.engine += st.throttle * dt / 4000 * k; w.brakes += Math.min(1, st.brake) * Math.min(av, 25) / 25 * dt / 2500 * k; w.wheels += (av * dt / 1.2e6 + (st.slip ? dt / 1500 : 0)) * k;
    ['engine', 'brakes', 'wheels'].forEach(function (c) { w[c] = Math.max(0, Math.min(1, w[c] - fx.repair * dt)); });
    if (st.fault && st.fault.t > 0) return null;
    var kinds = ['engine', 'brakes', 'wheels'], i, r = (rand || Math.random)();
    for (i = 0; i < 3; i++) { var h = 0.004 * w[kinds[i]] * w[kinds[i]] * fx.hazard; if (r < h * dt) { st.fault = { kind: kinds[i], t: 25 }; return kinds[i]; } r -= h * dt; }
    return null;
  }
  function wearTotal(game) { var w = game.wear || {}; return (w.engine || 0) + (w.brakes || 0) + (w.wheels || 0); }
  function serviceCost(game) { return Math.round(600 * wearTotal(game) / 10) * 10; }
  function service(game, st) { var c = Math.min(game.money, serviceCost(game)); game.money -= c; game.wear = { engine: 0, brakes: 0, wheels: 0 }; if (st) st.fault = null; return c; }

  /* ---------- Contraband checkpoints and theft (13+) ---------- */
  /* Deterministic roll per game, post and lap. Guards cut seizure. A fine is 30% of the pay; seizure loses the cargo and the contract. */
  function inspection(game, fx, cpId, lap) {
    var c = game.contract; if (!c || !c.loaded || !CARGO[c.cargo].contraband) return { inspected: false };
    var r = rng((game.seed || 1) * 131 + cpId * 17 + lap * 7919 + ((c.id | 0) % 100003)), r1 = r(), r2 = r();
    if (r1 >= 0.45) return { inspected: false }; var fine = Math.round(c.pay * 0.3 / 10) * 10, seized = r2 < 0.6 * fx.seize;
    return { inspected: true, fine: fine, seized: seized };
  }
  function theft(game, fx, rand) {
    var t = holdTons(game); if (t.solid + t.liquid <= 0) return null; var r = (rand || Math.random)();
    if (r >= 0.15 * fx.theft) return null; var lost = {}; GOOD_IDS.forEach(function (g) { var n = Math.floor(((game.hold || {})[g] || 0) * 0.2); if (n > 0) { game.hold[g] -= n; if (!game.hold[g]) delete game.hold[g]; lost[g] = n; } }); return lost;
  }

  /* ---------- Passengers (legit riders between towns) ---------- */
  function makeTrips(T, from, seed, sp) {
    var S = T.stations[from]; if (!S || S.kind !== 'town') return []; var r = rng(seed * 7 + 99), towns = T.stations.filter(function (x) { return x.kind === 'town' && x.id !== from; }), out = [];
    for (var n = 0; n < 3 && towns.length; n++) {
      var order = towns.map(function (x) { return { x: x, d: distTo(T, S.s, x.s) }; }).sort(function (a, b) { return a.d - b.d; }), pick = order[Math.min(order.length - 1, Math.floor(r() * r() * order.length))].x, ri = routeCached(T, from, pick.id);
      var dl = Math.round((ri.dist / 11 + ri.climb * 0.9 + 60) / 5) * 5; out.push({ id: seed * 10 + n, from: from, to: pick.id, waiting: 20 + Math.floor(r() * 60), dist: Math.round(ri.dist), climb: Math.round(ri.climb), deadline: dl });
    }
    return out;
  }
  function paxHappiness(sp, fx, late) { return Math.max(0, Math.min(1, 0.5 + 0.08 * sp.comfort + fx.happy - (late ? 0.2 : 0))); }
  function paxFare(sp, fx, riders, distM, late) { var h = paxHappiness(sp, fx, late); return Math.round(riders * (distM / 1000) * 1.5 * (1 + 0.25 * sp.comfort) * (0.7 + 0.6 * h) * fx.pax); }
  function boardTrip(game, sp, trip) { if (game.pax || sp.seats < 1) return null; var n = Math.min(trip.waiting, sp.seats); game.pax = { from: trip.from, to: trip.to, riders: n, dist: trip.dist, climb: trip.climb, deadline: trip.deadline, t0: game.clock }; return game.pax; }
  function paxTons(game) { return game.pax ? game.pax.riders * 0.08 : 0; }
  function checkPaxDelivery(st, T, game, sp, fx) {
    var p = game.pax; if (!p || st.derailed) return null; var S = stationOf(T, st.s); if (!S || S.id !== p.to || Math.abs(st.v) > 0.3) return null;
    var late = (game.clock - p.t0) > p.deadline; return { pay: paxFare(sp, fx, p.riders, p.dist, late), late: late, riders: p.riders, happy: paxHappiness(sp, fx, late) };
  }

  /* Fuel: price per litre varies by town; towns sell fuel, bases do not. */
  function fuelPrice(T, id) { return Math.round(60 * (0.8 + 0.5 * rng(id * 7919 + 13)())) / 100; }
  function refuel(game, sp, T, stationId) {
    var S = T.stations[stationId]; if (!S || S.kind !== 'town') return { ok: false, why: 'Only towns sell fuel' };
    var need = Math.max(0, sp.fuelCap - game.fuel), p = fuelPrice(T, stationId), afford = Math.floor(game.money / p), L = Math.min(need, afford);
    if (L < 1) return { ok: false, why: need < 1 ? 'Tank is full' : 'Not enough money' };
    game.money = Math.round((game.money - L * p) * 100) / 100; game.fuel += L; return { ok: true, liters: L, cost: L * p };
  }
  /* Out of fuel anywhere: a fuel truck brings a little, costs what you have (up to $400). */
  function rescueFuel(game, sp) { var cost = Math.min(400, Math.floor(game.money)); game.money -= cost; var L = Math.min(sp.fuelCap, 80 + cost / 5); game.fuel = Math.min(sp.fuelCap, game.fuel + L); return { liters: L, cost: cost }; }
  /* How far the train can cruise at v m/s on flat track with this much fuel (used by the HUD and tests). */
  function cruiseRange(sp, cargoT, fuelL, v) {
    var m = totalMass(sp, cargoT, fuelL), F = CRR * m * G + 0.5 * RHO * sp.cdA * v * v, rate = (0.03 * sp.power + F * v / 0.38) / ENERGY * FUEL_K;
    return fuelL / rate * v;
  }
  function serialize(game) { return JSON.stringify(game); }
  function validNum(x, lo, hi) { return typeof x === 'number' && isFinite(x) && x >= lo && x <= hi; }
  function deserialize(T, text) {
    try {
      var o = JSON.parse(text); if (!o || o.v !== 1) return null; var u = o.upg;
      if (!u || !validNum(u.engine, 0, UP.engine.max) || !validNum(u.brakes, 0, UP.brakes.max) || !validNum(u.wheels, 0, UP.wheels.max) || !validNum(u.cap, 0, UP.cap.max) || !validNum(u.cars, 1, UP.cars.max)) return null;
      u.tankers = u.tankers | 0; u.tankLvl = u.tankLvl | 0; u.tender = u.tender | 0;
      if (!validNum(u.tankers, 0, UP.tankers.max) || !validNum(u.tankLvl, 0, UP.tankLvl.max) || !validNum(u.tender, 0, 1)) return null;
      if (!validNum(o.money, 0, 1e12) || !validNum(o.s, 0, 1e9) || !validNum(o.clock, 0, 1e9) || !o.stats) return null;
      u.engine |= 0; u.brakes |= 0; u.wheels |= 0; u.cap |= 0; u.cars |= 0;
      u.coaches = u.coaches | 0; u.comfort = u.comfort | 0; if (!validNum(u.coaches, 0, UP.coaches.max) || !validNum(u.comfort, 0, UP.comfort.max)) return null;
      var spx = spec(u); if (!validNum(o.fuel, 0, 1e6)) o.fuel = spx.fuelCap; o.fuel = Math.min(o.fuel, spx.fuelCap);
      var cr = o.crew || {}; o.crew = { engineer: cr.engineer ? 1 : 0, mechanic: cr.mechanic ? 1 : 0, conductor: cr.conductor ? 1 : 0, cook: cr.cook ? 1 : 0, guards: Math.max(0, Math.min(2, cr.guards | 0)) };
      var wr = o.wear || {}; o.wear = { engine: validNum(wr.engine, 0, 1) ? wr.engine : 0, brakes: validNum(wr.brakes, 0, 1) ? wr.brakes : 0, wheels: validNum(wr.wheels, 0, 1) ? wr.wheels : 0 }; if (!validNum(o.wageAcc, 0, 1e6)) o.wageAcc = 0;
      var hd = {}; GOOD_IDS.forEach(function (g) { var t = o.hold && o.hold[g]; if (validNum(t, 1, 100000)) hd[g] = Math.floor(t); }); o.hold = hd;
      if (o.pax && !(T.stations[o.pax.to] && validNum(o.pax.riders, 1, 1000) && validNum(o.pax.dist, 0, 1e7))) o.pax = null; if (!o.pax) o.pax = null;
      if (o.contract) { var c = o.contract; if (!CARGO[c.cargo] || !T.stations[c.from] || !T.stations[c.to] || !validNum(c.weight, 1, 5000)) o.contract = null; }
      if (!Array.isArray(o.contra)) o.contra = makeContraband(T, o.stationId || 0, o.boardSeed || 1, spec(u)); if (!Array.isArray(o.trips)) o.trips = makeTrips(T, o.stationId || 0, o.boardSeed || 1, spec(u));
      if (!Array.isArray(o.board) || !o.board.length) o.board = makeBoard(T, o.stationId || 0, o.boardSeed || 1, spec(u));
      return o;
    } catch (e) { return null; }
  }
  function load(T, storage) { try { var t = storage.getItem(SAVE_KEY); return t ? deserialize(T, t) : null; } catch (e) { return null; } }
  function save(game, storage) { try { storage.setItem(SAVE_KEY, serialize(game)); return true; } catch (e) { return false; } }

  root.LT = { GOODS: GOODS, GOOD_IDS: GOOD_IDS, CREW: CREW, LEGAL_IDS: LEGAL_IDS, CONTRA_IDS: CONTRA_IDS, marketPrices: marketPrices, holdTons: holdTons, freeRoom: freeRoom, marketBuy: marketBuy, marketSell: marketSell, barterRate: barterRate, barter: barter,
    newCrew: newCrew, crewCount: crewCount, hire: hire, hireCost: hireCost, fire: fire, wagesPerMin: wagesPerMin, payWages: payWages, crewFx: crewFx, wearStep: wearStep, wearTotal: wearTotal, serviceCost: serviceCost, service: service,
    inspection: inspection, theft: theft, makeContraband: makeContraband, makeTrips: makeTrips, paxHappiness: paxHappiness, paxFare: paxFare, boardTrip: boardTrip, paxTons: paxTons, checkPaxDelivery: checkPaxDelivery, FUEL_K: FUEL_K, FUEL_KG: FUEL_KG, capFor: capFor, fuelPrice: fuelPrice, refuel: refuel, rescueFuel: rescueFuel, cruiseRange: cruiseRange, G: G, CRR: CRR, PLATFORM: PLATFORM, BIOMES: BIOMES, ENGINE: ENGINE, BRAKE: BRAKE, UP: UP, CARGO: CARGO, CARGO_IDS: CARGO_IDS, SAVE_KEY: SAVE_KEY,
    makeTrack: makeTrack, elevAt: elevAt, gradeAt: gradeAt, biomeAt: biomeAt, curveAt: curveAt, nextCurve: nextCurve, pathAt: pathAt, stationOf: stationOf, distTo: distTo, wrap: wrap,
    newUpg: newUpg, spec: spec, totalMass: totalMass, drivenMass: drivenMass, tractive: tractive, routeInfo: routeCached, lockReasons: lockReasons, makeBoard: makeBoard, makeContract: makeContract,
    newState: newState, step: step, stopDistance: stopDistance, checkDelivery: checkDelivery, repairCost: repairCost, trainGrade: trainGrade,
    newGame: newGame, canBuy: canBuy, buy: buy, serialize: serialize, deserialize: deserialize, load: load, save: save, rng: rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LT;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
