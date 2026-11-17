/* LeafTrain game loop, camera, controls, HUD, sounds, contracts, town (mechanic, fuel, bar with Spades), save. leafactivity.com */
(function () {
  'use strict';
  var LT = window.LT, SP = window.Spades, W = window.LTWorld, T = W.T, VEX = W.VEX, KM = 3.6;
  function $(id) { return document.getElementById(id); }
  var store = (function () { try { localStorage.setItem('lt.t', '1'); localStorage.removeItem('lt.t'); return localStorage; } catch (e) { var m = {}; return { getItem: function (k) { return m[k] || null; }, setItem: function (k, v) { m[k] = String(v); } }; } })();
  var kids = /[?&]kids=1/.test(location.search) || store.getItem('leaftrain.kids') === '1';
  var muted = store.getItem('leaftrain.mute') === '1';
  var game = LT.load(T, store) || LT.newGame(T), sp = LT.spec(game.upg), st = LT.newState(T, game.stationId, sp);
  st.s = Math.max(game.s, T.L); st.park = true; st.fuel = game.fuel;
  function syncCargo() { var c = game.contract, h = LT.holdTons(game); st.cargo = (c && c.loaded ? c.weight : 0) + h.solid + h.liquid + LT.paxTons(game); st.liquid = (c && c.loaded && LT.CARGO[c.cargo].liquid ? c.weight : 0) + h.liquid; }
  if (kids && game.contract && LT.CARGO[game.contract.cargo].contraband) { game.contract = null; syncCargo(); }
  syncCargo();

  /* ---------- 3D setup ---------- */
  var canvas = $('c'), renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance' }); } catch (e) { $('nogl').style.display = 'block'; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2600);
  scene.fog = new THREE.Fog(0xcfe0f1, 120, 1000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 0.85)); var sun = new THREE.DirectionalLight(0xfff2d8, 0.75); sun.position.set(-0.5, 1, 0.4); scene.add(sun);
  var groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a8f99 })); scene.add(groundPlane);
  var water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a9ad0 })); water.position.y = W.SEA_Y; scene.add(water);
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 120, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })); beam.visible = false; scene.add(beam);
  var snowPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
  (function () { var a = new Float32Array(240 * 3), i; for (i = 0; i < 240; i++) { a[i * 3] = (Math.random() - 0.5) * 120; a[i * 3 + 1] = Math.random() * 50; a[i * 3 + 2] = (Math.random() - 0.5) * 120; } snowPts.geometry.setAttribute('position', new THREE.BufferAttribute(a, 3)); snowPts.frustumCulled = false; snowPts.visible = false; scene.add(snowPts); })();
  var smoke = []; (function () { var sm = new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.5, depthWrite: false }); var g = new THREE.IcosahedronGeometry(0.6, 0); for (var i = 0; i < 14; i++) { var m = new THREE.Mesh(g, sm.clone()); m.visible = false; scene.add(m); smoke.push({ m: m, t: 99 }); } })();
  var train = new LTTrain.Train(scene);
  function resize() { var w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 72 : 58; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', function () { setTimeout(resize, 150); }); resize();

  /* ---------- sound (WebAudio, procedural) ---------- */
  var ac = null, hum = null, humG = null, nbuf = null, clackAcc = 0, clackFlip = 0;
  function audioInit() { if (ac || muted) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); nbuf = ac.createBuffer(1, 2205, 22050); var d = nbuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 38; var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; humG = ac.createGain(); humG.gain.value = 0; hum.connect(lp); lp.connect(humG); humG.connect(ac.destination); hum.start(); } catch (e) { ac = null; } }
  function clack(vol, pitch) { if (!ac || muted) return; var s = ac.createBufferSource(); s.buffer = nbuf; s.playbackRate.value = pitch; var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 * pitch; f.Q.value = 0.9; var g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(ac.destination); s.start(); }
  function sound(dt, sdist) {
    if (!ac || muted) { if (humG) humG.gain.value = 0; return; }
    var v = Math.abs(st.v); humG.gain.value = Math.min(0.06, 0.012 + 0.05 * st.throttle * (st.out ? 0 : 1)); hum.frequency.value = 34 + 22 * st.throttle + v * 0.5;
    clackAcc += Math.abs(sdist); /* one double-clack every 12 m of travel: faster train, faster rhythm */
    if (clackAcc > 12 && v > 0.5) { clackAcc = 0; var vol = Math.min(0.22, 0.05 + v * 0.008); clack(vol, 0.9 + (clackFlip ^= 1) * 0.25); setTimeout(function () { clack(vol * 0.8, 1.15 - clackFlip * 0.2); }, 90); }
  }

  /* ---------- input ---------- */
  var warp = 1, brakeHeld = false, keys = {}, throttleSet = 0, view = 'chase', sheet = null, lastSave = 0;
  function toast(msg, ms) { var t = $('toast'); t.innerHTML = msg; t.style.display = 'block'; clearTimeout(toast._h); toast._h = setTimeout(function () { t.style.display = 'none'; }, ms || 2600); }
  function setThrottle(x) { throttleSet = Math.max(0, Math.min(1, Math.round(x * 20) / 20)); }
  var lever = $('lever'), dragging = false;
  function levWrite(e) { var r = lever.getBoundingClientRect(); setThrottle(1 - (e.clientY - r.top - 12) / (r.height - 24)); }
  lever.addEventListener('pointerdown', function (e) { dragging = true; lever.setPointerCapture(e.pointerId); levWrite(e); audioInit(); e.preventDefault(); });
  lever.addEventListener('pointermove', function (e) { if (dragging) levWrite(e); });
  ['pointerup', 'pointercancel'].forEach(function (n) { lever.addEventListener(n, function () { dragging = false; }); });
  function hold(btn, fn) { var h = null; function go(e) { audioInit(); fn(); clearInterval(h); h = setInterval(fn, 160); e.preventDefault(); } function stop() { clearInterval(h); } btn.addEventListener('pointerdown', go); ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { btn.addEventListener(n, stop); }); }
  hold($('bUp'), function () { setThrottle(throttleSet + 0.1); }); hold($('bDn'), function () { setThrottle(throttleSet - 0.1); });
  var bb = $('bBrake'); bb.addEventListener('pointerdown', function (e) { brakeHeld = true; audioInit(); e.preventDefault(); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { bb.addEventListener(n, function () { brakeHeld = false; }); });
  $('bPark').onclick = function () { st.park = !st.park; };
  $('bDir').onclick = function () { if (Math.abs(st.v) > 0.5 || throttleSet > 0) { toast('Stop and set throttle to 0 to change direction'); return; } st.dir = -st.dir; };
  $('bView').onclick = toggleView; function toggleView() { view = view === 'chase' ? 'cab' : 'chase'; $('cab').style.display = view === 'cab' ? 'block' : 'none'; }
  $('bWarp').onclick = function () { warp = warp === 1 ? 2 : warp === 2 ? 4 : 1; this.textContent = warp + '×'; };
  $('bSnd').onclick = function () { muted = !muted; store.setItem('leaftrain.mute', muted ? '1' : '0'); this.textContent = muted ? '🔇' : '🔊'; if (!muted) audioInit(); };
  $('bSnd').textContent = muted ? '🔇' : '🔊';
  $('bMenu').onclick = function () { openSheet('menu'); }; $('chip').onclick = function () { openSheet('contracts'); }; $('bTown').onclick = function () { openSheet(curStation() ? 'town' : 'contracts'); };
  window.addEventListener('keydown', function (e) { var k = e.key; keys[k] = true; if (k === 'c' || k === 'C') toggleView(); if (k === 'p' || k === 'P') st.park = !st.park; if (k === 'm' || k === 'M') $('bSnd').onclick(); if (k === ' ') { brakeHeld = true; e.preventDefault(); } if (k === 'r' || k === 'R') $('bDir').onclick(); if (k === 'Escape') closeSheet(); audioInit(); });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; if (e.key === ' ') brakeHeld = false; });

  /* ---------- game helpers ---------- */
  function curStation() { return Math.abs(st.v) < 0.5 ? LT.stationOf(T, st.s) : null; }
  function save() { game.s = st.s; game.fuel = st.fuel; LT.save(game, store); lastSave = performance.now(); }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function dist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }
  function mmss(t) { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function refreshBoard(S) { game.stationId = S.id; if (!game.board || game.boardFrom !== S.id) { game.boardSeed++; game.board = LT.makeBoard(T, S.id, game.boardSeed, sp); game.contra = LT.makeContraband(T, S.id, game.boardSeed, sp); game.trips = LT.makeTrips(T, S.id, game.boardSeed, sp); game.boardFrom = S.id; } }

  /* ---------- sheets ---------- */
  var tab = 'contracts';
  function openSheet(name, t) { sheet = name; if (t) tab = t; renderSheet(); $('sheet').style.display = 'block'; }
  function closeSheet() { sheet = null; $('sheet').style.display = 'none'; save(); }
  $('sheet').addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (!b || b.disabled) return; act(b.dataset.a, b.dataset.v); });
  function row(a, b) { return '<div class="r"><div>' + a + '</div><div>' + (b || '') + '</div></div>'; }
  function renderSheet() {
    var h = '', S = curStation(), el = $('sheet');
    if (sheet === 'menu') {
      h = '<h2>☰ LeafTrain <span class="mut">· leafactivity.com</span></h2><div class="card">' + row('Stats', '') + '<div class="mut">Deliveries ' + game.stats.delivered + ' · earned ' + money(game.stats.earned) + ' · derails ' + game.stats.derails + '</div></div>' +
        '<div class="card"><b>Controls</b><div class="mut">Throttle: lever, ▲▼ or W/S, arrows. Brake: hold the red button or Space. P park, R forward/reverse, C camera, M sound. Stop with the front of the loco inside the platform to deliver.</div></div>' +
        '<div class="card"><b>Kid-safe</b><div class="mut">No gore. Nukes are sealed crates. A derail only costs a repair bill. Kids mode hides the 13+ bar.</div><div class="r" style="margin-top:6px"><span>Kids mode: <b>' + (kids ? 'ON' : 'off') + '</b></span><button data-a="kids">' + (kids ? 'Turn off' : 'Turn on') + '</button></div></div>' +
        '<div class="card"><div class="r"><span>Delete saved game</span><button data-a="reset">Reset…</button></div></div><button class="go" data-a="close" style="width:100%;height:56px">Back to the train</button>';
    } else if (sheet === 'derail') {
      var cost = LT.repairCost(sp);
      h = '<h2>⚠️ Derailed!</h2><div class="card">The train went through a curve too fast. Nobody was hurt. The cargo was safe, but the contract is cancelled.<div class="lock">Repair bill: ' + money(Math.min(cost, game.money)) + (game.money < cost ? ' (all you have)' : '') + '. Tip: obey the speed-limit signs, brake before curves, and watch your speed going downhill.</div></div><button class="go card" data-a="rerail" style="width:100%;height:60px;background:#2f6b3a">🔧 Pay and tow to the station</button>';
    } else {
      var tabs = [['contracts', '📋 Contracts']]; if (S && S.kind === 'town') { tabs.push(['pax', '🚃 Riders'], ['market', '🛒 Market'], ['mech', '🔧 Mechanic'], ['crew', '👥 Crew'], ['fuel', '⛽ Fuel']); if (!kids) tabs.push(['bar', '🍺 Bar 13+']); }
      if (!S) tab = 'contracts'; else if (S.kind !== 'town' && tab !== 'contracts') tab = 'contracts'; if (kids && tab === 'bar') tab = 'contracts';
      h = '<div class="r"><h2>' + (S ? (S.kind === 'town' ? '🏘️ ' : '🎖️ ') + S.name : '📋 On the line') + '</h2><button data-a="close">✕ Close</button></div>';
      if (S) h += '<div class="tabs">' + tabs.map(function (t) { return '<button data-a="tab" data-v="' + t[0] + '"' + (tab === t[0] ? ' class="sel"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>';
      h += tab === 'contracts' ? contractsHtml(S) : tab === 'mech' ? mechHtml() : tab === 'fuel' ? fuelHtml(S) : tab === 'pax' ? paxHtml(S) : tab === 'market' ? marketHtml(S) : tab === 'crew' ? crewHtml() : barHtml();
    }
    el.innerHTML = h;
  }
  function contractsHtml(S) {
    var h = '', c = game.contract;
    if (c) { var D = T.stations[c.to], left = c.deadline - (game.clock - c.t0); h += '<div class="card"><b>Active: ' + LT.CARGO[c.cargo].icon + ' ' + LT.CARGO[c.cargo].name + ' ' + c.weight + ' t → ' + D.name + '</b>' + row('Pay ' + money(c.pay) + ' · ' + dist(c.dist) + ' · climb ' + c.climb + ' m', '<span class="' + (left < 0 ? 'lock' : 'ok') + '">' + (left >= 0 ? mmss(left) + ' left' : 'late ' + mmss(-left)) + '</span>') + '<div class="mut">Stop the loco inside the ' + D.name + ' platform to deliver. Late pay drops up to 60%.</div>' + (S ? '<button data-a="abandon" style="margin-top:6px">Abandon (fee ' + money(Math.round(c.pay * 0.1)) + ')</button>' : '') + '</div>'; }
    if (!S) return h + '<div class="card mut">Contracts are handed out when you are stopped in a station platform.</div>';
    refreshBoard(S);
    h += '<div class="mut">Your train: ' + sp.capacity + ' t cars · ' + sp.tankCapTotal + ' t tank wagons · ' + Math.round(sp.fmax / 1000) + ' kN · ' + Math.round(sp.power / 1000) + ' kW</div>';
    game.board.forEach(function (k, i) { var lk = LT.lockReasons(T, sp, k), C = LT.CARGO[k.cargo], D = T.stations[k.to];
      h += '<div class="card"><div class="r"><b>' + C.icon + ' ' + C.name + ' · ' + k.weight + ' t' + (C.liquid ? ' (tank wagon)' : '') + '</b><b class="ok">' + money(k.pay) + '</b></div>' + row('→ ' + (D.kind === 'base' ? '🎖️ ' : '🏘️ ') + D.name, dist(k.dist) + ' · climb ' + k.climb + ' m · steepest ' + (k.maxGrade * 100).toFixed(1) + '% · ' + mmss(k.deadline))
        + (lk.length ? lk.map(function (r) { return '<div class="lock">🔒 ' + r.text + '</div>'; }).join('') : '') + '<button class="go" data-a="accept" data-v="' + i + '" style="width:100%;margin-top:6px"' + (lk.length || c ? ' disabled' : '') + '>' + (c ? 'Finish your contract first' : lk.length ? 'Locked' : 'Accept') + '</button></div>'; });
    if (!kids) {
      if (!bar.ok13) h += '<div class="card"><b>13+ jobs</b> <span class="badge">13+</span><div class="mut">Some shippers pay a lot for cargo that border posts do not like.</div><button data-a="ok13" data-v="contra" style="margin-top:6px">I am 13 or older: show 13+ jobs</button></div>';
      else (game.contra || []).forEach(function (k, i) { var lk = LT.lockReasons(T, sp, k), C = LT.CARGO[k.cargo], D = T.stations[k.to];
        h += '<div class="card" style="border:1px solid #d3202a"><div class="r"><b>' + C.icon + ' ' + C.name + ' · ' + k.weight + ' t <span class="badge">13+</span></b><b class="ok">' + money(k.pay) + '</b></div>' + row('→ ' + D.name, dist(k.dist) + ' · ' + mmss(k.deadline)) +
          '<div class="lock">⚠ Border posts on the way may inspect: fine ' + money(Math.round(k.pay * 0.3 / 10) * 10) + ', and your cargo can be seized. Guards help.</div>' + (lk.length ? lk.map(function (r) { return '<div class="lock">🔒 ' + r.text + '</div>'; }).join('') : '') +
          '<button class="go" data-a="accept" data-v="c' + i + '" style="width:100%;margin-top:6px"' + (lk.length || c ? ' disabled' : '') + '>' + (c ? 'Finish your contract first' : lk.length ? 'Locked' : 'Accept (13+)') + '</button></div>'; });
    }
    return h;
  }
  function paxHtml(S) {
    var h = '<div class="card"><b>🚃 Passenger wagons</b><div class="mut">Riders going to other towns. ' + sp.coaches + ' wagon(s), ' + sp.seats + ' seats, comfort ' + sp.comfort + '. Better comfort, a conductor and a cook raise fares. Each rider adds weight (80 kg) and each wagon is heavy.</div></div>';
    if (game.pax) { var p = game.pax, left = p.deadline - (game.clock - p.t0); h += '<div class="card"><b>On board: ' + p.riders + ' riders → ' + T.stations[p.to].name + '</b>' + row('Fare ~' + money(LT.paxFare(sp, LT.crewFx(game), p.riders, p.dist, left < 0)), left >= 0 ? mmss(left) + ' left' : 'late') + '<div class="mut">Stop in the ' + T.stations[p.to].name + ' platform. Happiness ' + Math.round(100 * LT.paxHappiness(sp, LT.crewFx(game), left < 0)) + '%.</div></div>'; }
    if (!sp.coaches) return h + '<div class="card mut">Buy a passenger wagon at the 🔧 Mechanic first.</div>';
    refreshBoard(S);
    (game.trips || []).forEach(function (t, i) { var n = Math.min(t.waiting, sp.seats), fare = LT.paxFare(sp, LT.crewFx(game), n, t.dist, false), D = T.stations[t.to];
      h += '<div class="card"><div class="r"><b>🏘️ ' + D.name + '</b><b class="ok">~' + money(fare) + '</b></div>' + row(t.waiting + ' waiting · you can take ' + n, dist(t.dist) + ' · ' + mmss(t.deadline)) + '<button class="go" data-a="board" data-v="' + i + '" style="width:100%;margin-top:6px"' + (game.pax ? ' disabled' : '') + '>' + (game.pax ? 'Riders already aboard' : 'Board ' + n + ' riders') + '</button></div>'; });
    return h;
  }
  function marketHtml(S) {
    var P = LT.marketPrices(T, S.id), hold = LT.holdTons(game), h = '<div class="card"><b>🛒 ' + S.name + ' market</b><div class="mut">Prices differ in every town: buy where it is cheap, sell where it is dear. Room: ' + Math.max(0, Math.floor(LT.freeRoom(sp, game, false))) + ' t in cars, ' + Math.max(0, Math.floor(LT.freeRoom(sp, game, true))) + ' t in tank wagons. Liquids (water, fuel, gas) need tank wagons.</div></div>';
    LT.GOOD_IDS.forEach(function (g) { var G = LT.GOODS[g], p = P[g], have = game.hold[g] || 0;
      h += '<div class="card"><div class="r"><b>' + G.icon + ' ' + G.name + (G.liquid ? ' (tank)' : '') + '</b><span class="mut">you carry ' + have + ' t</span></div>' + row('Buy $' + p.buy.toFixed(2) + ' /t', 'Sell $' + p.sell.toFixed(2) + ' /t') +
        '<div class="chips" style="margin-top:6px"><button data-a="mbuy" data-v="' + g + ':1">Buy 1</button><button data-a="mbuy" data-v="' + g + ':10">Buy 10</button><button data-a="mbuy" data-v="' + g + ':max">Buy max</button><button data-a="msell" data-v="' + g + ':all"' + (have ? '' : ' disabled') + '>Sell all</button></div></div>'; });
    var give = LT.GOOD_IDS.filter(function (g) { return game.hold[g]; });
    h += '<div class="card"><b>🤝 Barter</b><div class="mut">Trade goods for goods at this town\'s rates (no money).</div>';
    if (!give.length) h += '<div class="mut">Buy something first.</div>';
    give.forEach(function (g) { h += '<div class="r" style="margin-top:6px"><span>' + LT.GOODS[g].icon + ' ' + game.hold[g] + ' t ' + LT.GOODS[g].name + ' →</span></div><div class="chips">' + LT.GOOD_IDS.filter(function (x) { return x !== g; }).map(function (x) { return '<button data-a="barter" data-v="' + g + ':' + x + '">' + LT.GOODS[x].icon + ' ×' + LT.barterRate(T, S.id, g, x).toFixed(2) + '</button>'; }).join('') + '</div>'; });
    return h + '</div>';
  }
  function crewHtml() {
    var h = '<div class="card"><b>👥 Crew hall</b><div class="mut">Wages are paid by the minute (now ' + money(LT.wagesPerMin(game)) + '/min). If you cannot pay, the crew walks off. Signing fee is 10 minutes of wages.</div></div>';
    Object.keys(LT.CREW).forEach(function (r) { var C = LT.CREW[r], n = LT.crewCount(game, r), max = C.max || 1;
      h += '<div class="card"><div class="r"><b>' + C.name + ' <span class="mut">' + n + '/' + max + '</span></b><b>' + money(C.wage) + '/min</b></div><div class="mut">' + C.text + '</div><div class="chips" style="margin-top:6px"><button class="go" data-a="hire" data-v="' + r + '"' + (n >= max || game.money < LT.hireCost(r) ? ' disabled' : '') + '>Hire (' + money(LT.hireCost(r)) + ')</button><button data-a="fire" data-v="' + r + '"' + (n ? '' : ' disabled') + '>Let go</button></div></div>'; });
    return h;
  }
  function upDesc(key) { var u = game.upg, nx; switch (key) {
    case 'engine': nx = Math.min(LT.ENGINE.length - 1, u.engine + 1); return LT.ENGINE[u.engine][0] + ' → ' + LT.ENGINE[nx][0] + ' kW · ' + LT.ENGINE[u.engine][1] + ' → ' + LT.ENGINE[nx][1] + ' kN · fuel tank ' + (300 + 100 * u.engine) + ' → ' + (300 + 100 * nx) + ' L';
    case 'brakes': nx = Math.min(5, u.brakes + 1); return 'Brake force ' + LT.BRAKE[u.brakes] + ' → ' + LT.BRAKE[nx] + ' kN per car · cooler brakes';
    case 'wheels': return 'Grip ×' + (1 + 0.06 * u.wheels).toFixed(2) + ' → ×' + (1 + 0.06 * Math.min(5, u.wheels + 1)).toFixed(2) + ' · powered axles · safer in curves';
    case 'cap': return 'Car capacity ' + (40 + 20 * u.cap) + ' → ' + (40 + 20 * Math.min(5, u.cap + 1)) + ' t each (heavier cars)';
    case 'cars': return u.cars + ' → ' + Math.min(6, u.cars + 1) + ' cargo cars (' + (u.cars * sp.capPer) + ' t now)';
    case 'tankers': return u.tankers + ' → ' + Math.min(4, u.tankers + 1) + ' tank wagons for fuel, gas and water (' + sp.tankCapTotal + ' t now)';
    case 'tankLvl': return 'Tank wagon ' + (30 + 15 * u.tankLvl) + ' → ' + (30 + 15 * Math.min(4, u.tankLvl + 1)) + ' t each';
    case 'coaches': return u.coaches + ' → ' + Math.min(4, u.coaches + 1) + ' passenger wagons (' + sp.seats + ' seats now, each adds ~' + Math.round(sp.coachMass / 1000) + ' t)';
    case 'comfort': return 'Comfort ' + u.comfort + ' → ' + Math.min(4, u.comfort + 1) + ': +25% fare per level';
    case 'tender': return u.tender ? 'Fuel tender fitted: +700 L, goes ' + Math.round(LT.cruiseRange(sp, 0, sp.fuelCap, 20) / 1000) + ' km' : 'Extra fuel tender: +700 L of fuel, +14 t';
  } return ''; }
  function mechHtml() {
    var w = game.wear, h = '<div class="card"><b>🔧 Train mechanic</b><div class="mut">Upgrades are fitted here, in towns, with no contract cargo or riders aboard. Parts wear with use: engine ' + Math.round(w.engine * 100) + '%, brakes ' + Math.round(w.brakes * 100) + '%, wheels ' + Math.round(w.wheels * 100) + '%. Worn parts lose power, braking and grip and can break down.</div><button class="go" data-a="service" style="width:100%;margin-top:6px"' + (LT.wearTotal(game) < 0.01 ? ' disabled' : '') + '>Service the train (' + money(LT.serviceCost(game)) + ')</button></div>';
    ['engine', 'brakes', 'wheels', 'cap', 'cars', 'tankers', 'tankLvl', 'tender', 'coaches', 'comfort'].forEach(function (k) { var U = LT.UP[k], lv = game.upg[k], q = LT.canBuy(game, k), maxed = lv >= U.max;
      h += '<div class="card"><div class="r"><b>' + U.name + ' <span class="mut">' + (k === 'cars' ? lv + ' cars' : 'Lv ' + lv + '/' + U.max) + '</span></b>' + (maxed ? '<b class="ok">MAX</b>' : '<b>' + money(q.cost) + '</b>') + '</div><div class="mut">' + upDesc(k) + '</div>' +
        '<button class="go" data-a="buy" data-v="' + k + '" style="width:100%;margin-top:6px"' + (maxed || !q.ok || (game.contract && game.contract.loaded) || game.pax ? ' disabled' : '') + '>' + (maxed ? 'Maxed' : game.contract || game.pax ? 'Finish your contract and riders first' : q.ok ? 'Buy' : q.why) + '</button></div>'; });
    var mu = 0.28; h += '<div class="card"><b>Your train</b><div class="mut">Empty ' + Math.round(sp.emptyMass / 1000) + ' t · grip limit ' + Math.round(LT.tractive(sp, 0, mu, sp.fuelCap) / 1000) + ' kN · fuel range ' + Math.round(LT.cruiseRange(sp, 0, sp.fuelCap, 20) / 1000) + ' km at 72 km/h</div></div>';
    return h;
  }
  function fuelHtml(S) { var p = LT.fuelPrice(T, S.id), need = sp.fuelCap - st.fuel;
    return '<div class="card"><b>⛽ Fuel pump</b>' + row('Price', '$' + p.toFixed(2) + ' / L') + row('Tank', Math.round(st.fuel) + ' / ' + sp.fuelCap + ' L') + '<div class="mut">Range at 72 km/h: about ' + Math.round(LT.cruiseRange(sp, st.cargo, st.fuel, 20) / 1000) + ' km' + (sp.tender ? ' (tender fitted)' : ' · a fuel tender adds 700 L') + '</div><button class="go" data-a="refuel" style="width:100%;margin-top:8px;height:56px"' + (need < 1 ? ' disabled' : '') + '>' + (need < 1 ? 'Tank is full' : 'Fill up (' + money(need * p) + ')') + '</button></div>'; }

  /* ---------- Spades bar ---------- */
  var bar = { g: null, bet: 100, ok13: false, msg: '' };
  function cardBtn(c, dis) { return '<button data-a="card" data-v="' + c.s + c.r + '" class="' + (c.s === 'H' || c.s === 'D' ? 'red' : '') + '"' + (dis ? ' disabled' : '') + '>' + SP.label(c) + '</button>'; }
  function barHtml() {
    if (kids) return '<div class="card">The bar is closed in Kids mode.</div>';
    var h = '<div class="card"><b>🍺 The Rusty Spade <span class="badge">13+</span></b><div class="mut">Game money only. No real money, no purchases. Spades: you and your partner (across) against two AI players. One hand, 13 tricks. Bid how many tricks your side will take (add yours to your partner\'s). Spades are trump and cannot lead until broken. Win = higher score. A win pays your bet × a multiplier that grows with the bid your side makes (bid 6-7: ×0.35, 8: ×0.55, 9: ×0.8, 10: ×0.9, 11: ×1.3, 12: ×1.8, 13: ×3). A loss costs the bet, a tie gives it back. The house wins on average: this is for fun. Table limit ' + money(SP.MAX_BET) + '.</div></div>';
    if (!bar.ok13) return h + '<button class="go card" data-a="ok13" style="width:100%;height:56px;background:#2f6b3a">I am 13 or older. Sit down.</button><div class="mut">If you are under 13, go back and try the mechanic or the fuel pump.</div>';
    var g = bar.g;
    if (!g) { var mx = SP.maxBet(game.money); bar.bet = Math.min(bar.bet, mx);
      return h + '<div class="card">' + row('Your money', money(game.money)) + '<div class="mut" style="margin:6px 0">Bet: <b>' + money(bar.bet) + '</b></div><div class="chips">' + [50, 100, 250, 500, 1000, 2000].map(function (n) { return '<button data-a="bet" data-v="' + n + '"' + (n > mx ? ' disabled' : '') + '>' + n + '</button>'; }).join('') + '<button data-a="bet" data-v="' + mx + '">Max</button></div>' + (bar.msg ? '<div style="margin:8px 0;font-weight:800">' + bar.msg + '</div>' : '') +
        '<button class="go" data-a="deal" style="width:100%;margin-top:8px;height:56px"' + (mx < 10 || bar.bet < 10 ? ' disabled' : '') + '>Deal a hand (bet ' + money(bar.bet) + ')</button></div>'; }
    h += '<div class="card"><div class="mut">Bet ' + money(g.bet) + ' · bids: partner ' + (g.bids[2] == null ? '?' : g.bids[2]) + ', left ' + g.bids[1] + ', right ' + g.bids[3] + ' · spades ' + (g.broken ? 'broken' : 'not broken') + ' · tricks: you+partner ' + (g.won[0] + g.won[2]) + ', them ' + (g.won[1] + g.won[3]) + '</div>';
    if (g.phase === 'bid') { var pb = SP.aiBid(g.hands[2]); if (g.bids[2] == null) g.bids[2] = pb;
      h += '<div style="margin:8px 0"><b>Your bid: ' + (g.myBid == null ? SP.aiBid(g.hands[0]) : g.myBid) + '</b> <span class="mut">(partner bid ' + g.bids[2] + ') · if your side makes ' + ((g.myBid || 0) + g.bids[2]) + ' and wins: +' + money(g.bet * SP.winMultiplier((g.myBid || 0) + g.bids[2], true)) + '</span></div><div class="chips"><button data-a="bidm">−</button><button data-a="bidp">+</button><button class="go" data-a="bidok" style="min-width:140px">Bid & play</button></div><div class="hand">' + g.hands[0].map(function (c) { return cardBtn(c, true); }).join('') + '</div></div>'; return h; }
    var tr = g.trick, by = {}; tr.forEach(function (p) { by[p.seat] = SP.label(p.card); });
    var lastT = g.last && !tr.length ? g.last.trick.reduce(function (o, p) { o[p.seat] = SP.label(p.card); return o; }, {}) : null; var src = tr.length ? by : (lastT || {});
    h += '<div class="table"><div></div><div>Partner<br><b>' + (src[2] || '·') + '</b></div><div></div><div>Left<br><b>' + (src[1] || '·') + '</b></div><div></div><div>Right<br><b>' + (src[3] || '·') + '</b></div><div></div><div>You<br><b>' + (src[0] || '·') + '</b></div><div></div></div>';
    if (g.phase === 'done') { var sc = SP.score(g), res = SP.result(g); h += '<div style="font-weight:800;font-size:17px">' + bar.msg + '</div><div class="mut">You+partner: bid ' + sc[0].bid + ', took ' + sc[0].tricks + ' → ' + sc[0].score + ' pts · Them: bid ' + sc[1].bid + ', took ' + sc[1].tricks + ' → ' + sc[1].score + ' pts</div><button class="go" data-a="again" style="width:100%;margin-top:8px;height:56px">Back to the table</button></div>'; return h; }
    var L = g.turn === 0 ? SP.legal(g.hands[0], g.trick, g.broken) : [];
    h += '<div class="mut">' + (g.turn === 0 ? 'Your turn' + (g.trick.length ? ' · follow ' + SP.NAMES[g.trick[0].card.s] + ' if you can' : ' · you lead') : 'AI is thinking…') + '</div><div class="hand">' + g.hands[0].map(function (c) { return cardBtn(c, g.turn !== 0 || !L.some(function (x) { return SP.same(x, c); })); }).join('') + '</div></div>';
    return h;
  }
  function barAI() { var g = bar.g; if (!g || g.phase !== 'play' || g.turn === 0) { if (g && g.phase === 'done') finishHand(); renderSheet(); return; }
    renderSheet(); setTimeout(function () { if (bar.g !== g) return; if (g.trick.length === 0 && g.last) g.last = g.last; SP.aiStep(g); if (g.phase === 'done') finishHand(); renderSheet(); if (g.phase === 'play' && g.turn !== 0) barAI(); }, 650); }
  function finishHand() { var g = bar.g; if (g.settled) return; g.settled = true; var res = SP.result(g), ti = SP.teamInfo(g), p = SP.payout(g.bet, res, ti.bid, ti.made);
    game.money += g.bet + p; bar.msg = res === 'win' ? '🎉 You win! +' + money(p) : res === 'lose' ? 'You lose ' + money(g.bet) + '. Better luck next hand.' : 'Tie. Your bet comes back.'; save(); }

  function act(a, v) {
    var S = curStation();
    if (a === 'close') return closeSheet();
    if (a === 'tab') { tab = v; return renderSheet(); }
    if (a === 'kids') { kids = !kids; store.setItem('leaftrain.kids', kids ? '1' : '0'); bar.g = null; if (kids && game.contract && LT.CARGO[game.contract.cargo].contraband) { game.contract = null; syncCargo(); toast('13+ job cancelled for Kids mode'); } return renderSheet(); }
    if (a === 'reset') { if (!act._r) { act._r = 1; toast('Tap Reset again to delete your saved game'); setTimeout(function () { act._r = 0; }, 3000); return; } try { store.removeItem && store.removeItem(LT.SAVE_KEY); } catch (e) {} location.reload(); return; }
    if (a === 'rerail') { var cost = Math.min(LT.repairCost(sp), game.money); game.money -= cost; var back = game.contract ? game.contract.from : game.stationId; game.contract = null; game.pax = null; syncCargo(); var Sx = T.stations[back]; st.derailed = false; st.v = 0; st.s = (Math.floor(st.s / T.L)) * T.L + Sx.s + 60; if (st.s < T.L) st.s += T.L; st.park = true; st.fuel = Math.max(st.fuel, 40); throttleSet = 0; closeSheet(); return toast('Towed and repaired: ' + money(cost)); }
    if (a === 'abandon') { var c = game.contract; var fee = Math.min(game.money, Math.round(c.pay * 0.1)); game.money -= fee; game.contract = null; syncCargo(); return renderSheet(); }
    if (!S && a !== 'card') return;
    if (a === 'accept') { var isC = String(v)[0] === 'c', list = isC ? game.contra : game.board, k = list[isC ? +String(v).slice(1) : +v]; if (!k || game.contract || LT.lockReasons(T, sp, k).length || (k.contraband && (kids || !bar.ok13))) return; game.contract = Object.assign({}, k, { loaded: true, t0: game.clock }); list.splice(list.indexOf(k), 1); syncCargo(); closeSheet(); return toast('Loaded ' + LT.CARGO[k.cargo].icon + ' ' + k.weight + ' t. Deliver to ' + T.stations[k.to].name + '!'); }
    if (a === 'buy') { if (S.kind !== 'town') return; if (LT.buy(game, v)) { sp = LT.spec(game.upg); st.fuel = Math.min(st.fuel, sp.fuelCap); train.key = ''; game.board = null; refreshBoard(S); save(); } return renderSheet(); }
    if (a === 'refuel') { var r = LT.refuel(game, sp, T, S.id); if (r.ok) { st.fuel = game.fuel; save(); toast('Fuelled ' + Math.round(r.liters) + ' L for ' + money(r.cost)); } else toast(r.why); return renderSheet(); }
    if (a === 'board') { var tr = game.trips[+v]; if (tr && LT.boardTrip(game, sp, tr)) { game.trips.splice(+v, 1); syncCargo(); save(); toast('Boarded ' + game.pax.riders + ' riders for ' + T.stations[game.pax.to].name); } return renderSheet(); }
    if (a === 'mbuy' || a === 'msell') { var pr = String(v).split(':'), good = pr[0], amt = pr[1], r2;
      if (a === 'mbuy') { var n = amt === 'max' ? Math.floor(Math.min(LT.freeRoom(sp, game, !!LT.GOODS[good].liquid), game.money / LT.marketPrices(T, S.id)[good].buy)) : +amt; r2 = LT.marketBuy(game, sp, T, S.id, good, n); }
      else r2 = LT.marketSell(game, T, S.id, good, game.hold[good] || 0);
      if (!r2.ok) toast(r2.why); else toast((a === 'mbuy' ? 'Bought ' : 'Sold ') + r2.tons + ' t ' + LT.GOODS[good].name + ' ' + (a === 'mbuy' ? '(-' + money(r2.cost) + ')' : '(+' + money(r2.gain) + ')'));
      syncCargo(); save(); return renderSheet(); }
    if (a === 'barter') { var gg = String(v).split(':'), have = game.hold[gg[0]] || 0, b2 = LT.barter(game, sp, T, S.id, gg[0], gg[1], have); if (!b2.ok) toast(b2.why); else toast('Traded ' + have + ' t ' + LT.GOODS[gg[0]].name + ' for ' + b2.got + ' t ' + LT.GOODS[gg[1]].name); syncCargo(); save(); return renderSheet(); }
    if (a === 'hire') { var hr = LT.hire(game, v); if (!hr.ok) toast(hr.why); save(); return renderSheet(); }
    if (a === 'fire') { LT.fire(game, v); save(); return renderSheet(); }
    if (a === 'service') { var sc = LT.service(game, st); toast('Serviced: ' + money(sc)); save(); return renderSheet(); }
    if (a === 'ok13') { bar.ok13 = true; return renderSheet(); }
    if (a === 'bet') { bar.bet = Math.min(+v, SP.maxBet(game.money)); return renderSheet(); }
    if (a === 'deal') { var mx = SP.maxBet(game.money), bet = Math.min(bar.bet, mx); if (bet < 10) return; game.money -= bet; save(); bar.msg = ''; bar.g = SP.newGame((Date.now() & 0xfffffff) + game.stats.delivered, bet); bar.g.myBid = SP.aiBid(bar.g.hands[0]); return renderSheet(); }
    if (a === 'bidm') { bar.g.myBid = Math.max(0, bar.g.myBid - 1); return renderSheet(); }
    if (a === 'bidp') { bar.g.myBid = Math.min(13, bar.g.myBid + 1); return renderSheet(); }
    if (a === 'bidok') { SP.setBid(bar.g, bar.g.myBid); return barAI(); }
    if (a === 'card') { var g = bar.g; if (!g) return; var card = g.hands[0].filter(function (c) { return c.s + c.r === v; })[0]; var res = SP.play(g, 0, card); if (!res.ok) return toast(res.why); if (g.phase === 'done') finishHand(); return barAI(); }
    if (a === 'again') { bar.g = null; return renderSheet(); }
  }

  /* ---------- per-frame ---------- */
  var tick = 0, prevS = st.s, camP = null, shake = 0, dTrain = 0;
  function biomeColors() { var b = LT.BIOMES[LT.biomeAt(T, st.s)]; if (biomeColors.cur !== b) { biomeColors.cur = b; $('sky').style.background = 'linear-gradient(' + b.sky[0] + ',' + b.sky[1] + ')'; scene.fog.color.set(b.sky[1]); groundPlane.material.color.set(b.far); } snowPts.visible = LT.biomeAt(T, st.s) === 'snow' || (LT.biomeAt(T, st.s) === 'mountains' && LT.elevAt(T, st.s) > 160); }
  function simulate(dt) {
    var steps = 0;
    simulate.acc = (simulate.acc || 0) + dt * warp;
    while (simulate.acc >= 0.05 && steps < 40) { simulate.acc -= 0.05; steps++;
      var tgt = brakeHeld ? 1 : 0; st.brake += (tgt - st.brake) * Math.min(1, 0.05 * (tgt ? 4 : 8));
      st.throttle = st.brake > 0.05 ? 0 : throttleSet; if (st.brake > 0.05 && st.v !== 0) st.park = false;
      if (st.throttle > 0 && st.park) st.park = false;
      var fx = LT.crewFx(game); st.fuelMul = fx.fuel; st.wear = game.wear; var before = st.s; LT.step(st, sp, T, 0.05);
      var bk = LT.wearStep(game, st, fx, 0.05); if (bk) { toast('⚠️ ' + ({ engine: 'ENGINE BREAKDOWN', brakes: 'BRAKE TROUBLE', wheels: 'WHEEL TROUBLE' })[bk] + '! Slow down; a mechanic fixes it'); }
      var wg = LT.payWages(game, 0.05); if (wg.quit.length) toast('Your crew walked off: no money for wages'); dTrain += st.s - before; game.clock += 0.05; game.stats.played += 0.05;
      if (st.derailed) break;
    }
    return steps;
  }
  function gameLogic() {
    game.fuel = st.fuel;
    if (st.derailed && sheet !== 'derail') { game.stats.derails++; openSheet('derail'); return; }
    var S = curStation();
    if (S) { if (game.boardFrom !== S.id) { refreshBoard(S); toast('Arrived at ' + S.name + '. Tap 🏘️ for contracts' + (S.kind === 'town' ? ', mechanic, fuel and bar' : '')); } }
    var fx = LT.crewFx(game), pd = LT.checkPaxDelivery(st, T, game, sp, fx);
    if (pd) { game.money += pd.pay; game.stats.earned += pd.pay; game.pax = null; syncCargo(); save(); toast('🚃 ' + pd.riders + ' riders arrived<br>+' + money(pd.pay) + ' · happiness ' + Math.round(pd.happy * 100) + '%', 3600); }
    /* border posts: contraband may be inspected */
    var cw = LT.wrap(T, st.s), pw = LT.wrap(T, gameLogic.prev == null ? st.s : gameLogic.prev); gameLogic.prev = st.s;
    if (game.contract && game.contract.loaded && LT.CARGO[game.contract.cargo].contraband && st.v > 0) T.checkpoints.forEach(function (cp) { var hit = cp.s === 0 ? (pw > T.L - 300 && cw < 300 && pw > cw) : (pw < cp.s + 40 && cw >= cp.s + 40 && cw - pw < 300); if (!hit) return;
      var ins = LT.inspection(game, fx, cp.id, Math.floor(st.s / T.L)); if (!ins.inspected) return toast('🛂 ' + cp.name + ': waved through');
      var fine = Math.min(game.money, ins.fine); game.money -= fine; if (ins.seized) { game.contract = null; syncCargo(); toast('🛂 ' + cp.name + ': INSPECTED. Cargo seized and fined ' + money(fine), 4200); } else toast('🛂 ' + cp.name + ': inspected, fined ' + money(fine) + '. They let you go on.', 4200); save(); });
    if (S && !gameLogic.sawStop) { gameLogic.sawStop = true; var lost = LT.theft(game, fx); if (lost) { syncCargo(); toast('🦹 Thieves took some of your trade goods: ' + Object.keys(lost).map(function (g) { return lost[g] + ' t ' + LT.GOODS[g].name; }).join(', '), 4200); } } else if (!S) gameLogic.sawStop = false;
    var d = LT.checkDelivery(st, T, game);
    if (d) { var c = game.contract; game.money += d.pay; game.stats.delivered++; game.stats.earned += d.pay; if (d.late > 0) game.stats.late++; game.contract = null; syncCargo(); refreshBoard(T.stations[c.to]); game.boardFrom = -1; refreshBoard(T.stations[c.to]); save(); toast('✅ Delivered at ' + T.stations[c.to].name + '<br>+' + money(d.pay) + (d.late > 0 ? ' <span class="mut">(late)</span>' : ' on time!'), 3600); }
  }
  function hud() {
    var kmh = Math.abs(st.v) * KM; $('vKmh').textContent = Math.round(kmh) + (st.v < -0.3 ? ' ◀' : ''); $('vGrade').textContent = (LT.trainGrade(T, sp, st.s) * 100).toFixed(1); $('vAlt').textContent = Math.round(LT.elevAt(T, st.s));
    $('fuelBar').style.width = Math.round(100 * st.fuel / sp.fuelCap) + '%'; $('fuelBar').style.background = st.fuel < sp.fuelCap * 0.15 ? '#ff6a5a' : '#8be28c'; $('tempBar').style.width = Math.min(100, Math.round((st.temp - 20) / 6)) + '%';
    $('money').textContent = money(game.money);
    var c = game.contract; $('chip').textContent = (c ? LT.CARGO[c.cargo].icon + ' ' + c.weight + ' t → ' + T.stations[c.to].name + ' · ' + mmss(c.deadline - (game.clock - c.t0)) : '📋 Contracts') + (game.pax ? ' · 🚃 ' + game.pax.riders : '');
    var nc = LT.nextCurve(T, st.s, 600), lim = $('limit'); if (nc) { lim.style.display = 'flex'; $('limNum').textContent = nc.curve.sign; $('limDist').textContent = nc.dist < 1 ? 'IN CURVE' : Math.round(nc.dist) + ' m'; lim.style.background = kmh > nc.curve.sign * 1.0 && nc.dist < 350 ? 'rgba(200,30,40,.85)' : 'rgba(10,24,16,.72)'; } else lim.style.display = 'none';
    var al = []; if (st.derailed) al.push('DERAILED'); else { if (st.out) al.push('OUT OF FUEL'); if (st.slip) al.push('WHEEL SLIP'); if (st.skid) al.push('WHEELS LOCKING'); if (st.fade > 0.1) al.push('BRAKES HOT'); if (st.warn) al.push('TOO FAST FOR THE CURVE!'); if (st.v < -0.5 && st.dir > 0) al.push('ROLLING BACK'); else if (st.dir < 0 && st.v < -0.5 && !st.out) { } if (st.slosh > 0.6) al.push('LOAD SLOSHING'); if (st.fault) al.push(({ engine: 'ENGINE FAULT', brakes: 'BRAKE FAULT', wheels: 'WHEEL FAULT' })[st.fault.kind] + ' ' + Math.ceil(st.fault.t) + 's'); }
    var ae = $('alert'); ae.style.display = al.length ? 'block' : 'none'; ae.textContent = al.join(' · ');
    var hint = ''; if (c) { var D = T.stations[c.to], dd = LT.distTo(T, st.s, D.s); if (dd > T.L - 60) dd = dd - T.L; var inP = LT.stationOf(T, st.s); if (dd > 0) hint = 'Stop at ' + D.name + ' in ' + dist(dd) + ' · brake distance ~' + dist(LT.stopDistance(sp, st.cargo, Math.abs(st.v), LT.trainGrade(T, sp, st.s), 0.28, st.fade, st.fuel)); else if (inP && inP.id === D.id) hint = 'In the platform. Stop to deliver.'; else hint = 'Passed ' + D.name + '. Reverse back to the platform.'; }
    else if (S0()) hint = 'Stopped at ' + S0().name + '. Tap 🏘️'; else hint = 'Fuel ' + Math.round(st.fuel) + ' L · range ~' + Math.round(LT.cruiseRange(sp, st.cargo, st.fuel, 20) / 1000) + ' km';
    $('hint').textContent = hint;
    var knob = lever.querySelector('.knob'), fill = lever.querySelector('.fill'), h = lever.clientHeight - 16; knob.style.bottom = (throttleSet * (lever.clientHeight - 30)) + 'px'; knob.textContent = Math.round(throttleSet * 100) + '%'; fill.style.height = Math.round(throttleSet * h) + 'px';
    $('bBrake').classList.toggle('on', brakeHeld); $('bPark').style.background = st.park ? 'rgba(190,35,40,.9)' : ''; $('bDir').textContent = st.dir > 0 ? '▶ FWD' : '◀ REV';
    $('bTown').style.outline = curStation() ? '3px solid #f3d98b' : '';
  }
  function S0() { return Math.abs(st.v) < 0.5 ? LT.stationOf(T, st.s) : null; }

  var last = performance.now(), lookT = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame); var dt = Math.min(0.1, (now - last) / 1000); last = now; tick++;
    /* keyboard throttle */
    if (keys.w || keys.W || keys.ArrowUp) setThrottleSmooth(0.5 * dt); if (keys.s || keys.S || keys.ArrowDown) setThrottleSmooth(-0.5 * dt);
    var s0 = st.s; dTrain = 0;
    if (!sheet) { simulate(dt); gameLogic(); }
    var vis = st.s;
    W.updateChunks(scene, vis, tick < 3 ? 99 : 2);
    train.rebuild(sp, game.contract); train.update(vis, dTrain, st.derailed, false);
    /* cameras */
    var F, tgt, look;
    if (view === 'cab') { F = W.frame(vis - 9); tgt = F.p.clone().add(new THREE.Vector3(0, 3.7, 0)); var A = W.frame(vis + 60); look = A.p.clone().add(new THREE.Vector3(0, 1.0, 0)); camP = tgt; }
    else { var back = Math.min(26 + 0.45 * (14 + 16 * (sp.cars + sp.tankers + sp.tender)), 80); F = W.frame(vis - back); tgt = F.p.clone().add(new THREE.Vector3(0, 7.5 + back * 0.08, 0)).add(F.l.clone().multiplyScalar(3.5)); var B2 = W.frame(vis + 14); look = B2.p.clone().add(new THREE.Vector3(0, 1.5, 0)); if (!camP) camP = tgt.clone(); camP.lerp(tgt, 1 - Math.exp(-8 * dt)); }
    shake = st.slip || st.warn ? 0.12 : Math.min(0.06, Math.abs(st.v) * 0.002); camera.position.copy(camP).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0)); camera.lookAt(look);
    groundPlane.position.set(camera.position.x, camera.position.y - 70 - 0.1 * Math.abs(camera.position.y), camera.position.z);
    var bm = LT.biomeAt(T, vis); water.visible = bm === 'coast' || LT.biomeAt(T, vis + 400) === 'coast'; water.position.x = camera.position.x; water.position.z = camera.position.z;
    if (tick % 30 === 0) biomeColors(); snowPts.position.set(camera.position.x, camera.position.y - 20, camera.position.z);
    if (snowPts.visible) { var pa = snowPts.geometry.attributes.position, i; for (i = 0; i < 240; i++) { var y = pa.array[i * 3 + 1] - 6 * dt; if (y < 0) y += 50; pa.array[i * 3 + 1] = y; } pa.needsUpdate = true; }
    /* destination beam */
    var c = game.contract; if (c && !sheet) { var D = T.stations[c.to], base = Math.floor(vis / T.L) * T.L, ds = base + D.s + 75; if (ds < vis - 200) ds += T.L; var BF = W.frame(ds); beam.visible = true; beam.position.copy(BF.p).add(new THREE.Vector3(0, 60, 0)).add(BF.l.clone().multiplyScalar(-12)); } else beam.visible = false;
    /* smoke from the exhaust */
    var lf = W.frame(vis - 3); smoke.forEach(function (p, i) { p.t += dt; if (p.t > 1.8) { if (st.throttle > 0.05 && !st.out && Math.random() < 0.3 && !st.derailed && view === 'chase') { p.t = 0; p.m.position.copy(lf.p).add(new THREE.Vector3(0, 4.3, 0)); p.v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, 0); p.m.visible = true; } else p.m.visible = false; } else { p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(1 + p.t * 1.6); p.m.material.opacity = 0.5 * (1 - p.t / 1.8) * (0.4 + st.throttle); } });
    sound(dt, dTrain);
    renderer.render(scene, camera);
    if (tick % 4 === 0) { hud(); if (sheet && sheet !== 'menu' && tick % 60 === 0 && !(bar.g && sheet === 'town')) renderSheet(); }
    if (now - lastSave > 5000) save();
  }
  function setThrottleSmooth(d) { throttleSet = Math.max(0, Math.min(1, throttleSet + d)); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  if (/[?&]test=1/.test(location.search)) window.__lt = { st: st, game: game, T: T, LT: LT, world: W, get sp() { return sp; }, setThrottle: setThrottle, chunks: W.chunkCount, openSheet: openSheet, act: act, get view() { return view; }, toggleView: toggleView, stepTest: function (n) { for (var i = 0; i < n; i++) { LT.step(st, sp, T, 0.05); } } };
  hud(); biomeColors(); requestAnimationFrame(frame);
  if (!store.getItem('leaftrain.seen')) { store.setItem('leaftrain.seen', '1'); toast('Welcome to LeafTrain 🚂<br><span class="mut">Raise the throttle, take a contract at a station, and stop in the platform.</span>', 5000); }
})();
