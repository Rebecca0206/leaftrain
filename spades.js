/* LeafTrain bar: one-hand Spades (you + AI partner vs 2 AI). Play money only. No DOM; Node can test it. */
(function (root) {
  'use strict';
  var SUITS = ['S', 'H', 'D', 'C'], NAMES = { S: '♠', H: '♥', D: '♦', C: '♣' };
  var MAX_BET = 2000;
  /* Win profit as a multiple of the bet depends on the bid your side made (you + partner). Big bids that you make pay big.
     Measured against the AI table, every row keeps the average result at or below even (see tests). A win without making your bid pays 0.2x. */
  var MULT = { 0: 0.35, 1: 0.35, 2: 0.35, 3: 0.35, 4: 0.35, 5: 0.35, 6: 0.35, 7: 0.35, 8: 0.55, 9: 0.8, 10: 0.9, 11: 1.3, 12: 1.8, 13: 3.0 };
  function winMultiplier(teamBid, made) { if (!made) return 0.2; return MULT[Math.max(0, Math.min(13, teamBid | 0))]; }

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function sortHand(h) { return h.sort(function (a, b) { return SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || b.r - a.r; }); }
  function deal(seed) {
    var d = [], r = rng(seed), i, j, t;
    SUITS.forEach(function (s) { for (var k = 2; k <= 14; k++) d.push({ s: s, r: k }); });
    for (i = d.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = d[i]; d[i] = d[j]; d[j] = t; }
    return [0, 1, 2, 3].map(function (p) { return sortHand(d.slice(p * 13, p * 13 + 13)); });
  }
  function label(c) { return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r] || c.r) + NAMES[c.s]; }
  function same(a, b) { return a.s === b.s && a.r === b.r; }
  /* cards you may play: follow suit if you can; spades cannot lead until broken (unless you hold only spades) */
  function legal(hand, trick, broken) {
    if (trick.length) { var led = trick[0].card.s, f = hand.filter(function (c) { return c.s === led; }); return f.length ? f : hand.slice(); }
    if (broken) return hand.slice();
    var ns = hand.filter(function (c) { return c.s !== 'S'; }); return ns.length ? ns : hand.slice();
  }
  /* trick = [{seat, card}] in play order; highest spade wins, otherwise highest of the led suit */
  function trickWinner(trick) {
    var best = trick[0];
    trick.forEach(function (p) {
      var c = p.card, b = best.card;
      if (c.s === b.s ? c.r > b.r : (c.s === 'S' && b.s !== 'S')) best = p;
    });
    return best.seat;
  }
  function aiBid(hand) {
    var n = 0, cnt = { S: 0, H: 0, D: 0, C: 0 };
    hand.forEach(function (c) { cnt[c.s]++; });
    hand.forEach(function (c) {
      if (c.s === 'S') { if (c.r >= 13) n += 1; else if (c.r === 12 && cnt.S >= 3) n += 0.8; else if (cnt.S >= 5 && c.r >= 8) n += 0.5; else if (cnt.S >= 4) n += 0.3; }
      else { if (c.r === 14) n += 1; else if (c.r === 13 && cnt[c.s] >= 2) n += 0.6; }
    });
    SUITS.forEach(function (s) { if (s !== 'S' && cnt[s] <= 1 && cnt.S >= 3) n += 0.5; });
    return Math.max(1, Math.min(8, Math.round(n)));
  }
  function team(s) { return s % 2; }
  function aiPlay(hand, trick, broken, seat) {
    var L = legal(hand, trick, broken), lo = function (a, b) { return a.r - b.r; };
    if (!trick.length) {
      var aces = L.filter(function (c) { return c.s !== 'S' && c.r >= 13; }).sort(function (a, b) { return b.r - a.r; });
      if (aces.length) return aces[0];
      var ns = L.filter(function (c) { return c.s !== 'S'; }); if (ns.length) return ns.sort(lo)[0];
      return L.sort(lo)[0];
    }
    var win = trickWinner(trick), wc = trick.filter(function (p) { return p.seat === win; })[0].card, last = trick.length === 3;
    if (team(win) === team(seat) && (last || wc.r >= 13 || wc.s === 'S')) { return L.slice().sort(lo)[0]; } /* partner is winning: do not waste a good card */
    var beat = L.filter(function (c) { return c.s === wc.s ? c.r > wc.r : (c.s === 'S' && wc.s !== 'S'); }).sort(lo);
    if (beat.length) return beat[last ? 0 : Math.min(beat.length - 1, 0)];
    return L.slice().sort(function (a, b) { return (a.s === 'S') - (b.s === 'S') || a.r - b.r; })[0]; /* cannot win: throw the cheapest non-spade */
  }
  function newGame(seed, bet) {
    var hands = deal(seed), g = { seed: seed, bet: bet || 0, hands: hands, bids: [null, null, null, null], trick: [], leader: 1, turn: 1, won: [0, 0, 0, 0], broken: false, played: 0, phase: 'bid', last: null };
    for (var p = 1; p < 4; p++) g.bids[p] = aiBid(hands[p]);
    return g;
  }
  function setBid(g, bid) { bid = Math.max(0, Math.min(13, bid | 0)); g.bids[0] = bid; g.phase = 'play'; g.turn = g.leader; return g; }
  function play(g, seat, card) {
    if (g.phase !== 'play' || g.turn !== seat) return { ok: false, why: 'Not your turn' };
    var h = g.hands[seat], idx = -1; h.forEach(function (c, i) { if (same(c, card)) idx = i; });
    if (idx < 0) return { ok: false, why: 'You do not hold that card' };
    var L = legal(h, g.trick, g.broken);
    if (!L.some(function (c) { return same(c, card); })) return { ok: false, why: g.trick.length ? 'Follow suit' : 'Spades are not broken yet' };
    h.splice(idx, 1); g.trick.push({ seat: seat, card: card }); if (card.s === 'S') g.broken = true;
    if (g.trick.length === 4) {
      var w = trickWinner(g.trick); g.won[w]++; g.last = { trick: g.trick, winner: w }; g.trick = []; g.leader = w; g.turn = w; g.played++;
      if (g.played === 13) g.phase = 'done';
    } else g.turn = (seat + 1) % 4;
    return { ok: true, winner: g.last && g.trick.length === 0 ? g.last.winner : null };
  }
  function aiStep(g) { if (g.phase !== 'play' || g.turn === 0) return null; var c = aiPlay(g.hands[g.turn], g.trick, g.broken, g.turn); return play(g, g.turn, c); }
  function score(g) {
    function t(a, b) { var bid = g.bids[a] + g.bids[b], tr = g.won[a] + g.won[b], pts = tr >= bid ? bid * 10 + (tr - bid) : -bid * 10; return { bid: bid, tricks: tr, score: pts }; }
    return [t(0, 2), t(1, 3)];
  }
  function result(g) { var s = score(g); return s[0].score > s[1].score ? 'win' : s[0].score < s[1].score ? 'lose' : 'push'; }
  /* money change for the player: a win pays bet x winMultiplier(bid, made); a loss costs the bet; a tie gives it back */
  function payout(bet, res, teamBid, made) { return res === 'win' ? Math.round(bet * winMultiplier(teamBid == null ? 6 : teamBid, made == null ? true : made)) : res === 'lose' ? -bet : 0; }
  function teamInfo(g) { var s = score(g)[0]; return { bid: s.bid, made: s.tricks >= s.bid }; }
  function maxBet(money) { return Math.max(0, Math.min(MAX_BET, Math.floor(money))); }

  root.Spades = { SUITS: SUITS, NAMES: NAMES, MULT: MULT, winMultiplier: winMultiplier, teamInfo: teamInfo, MAX_BET: MAX_BET, deal: deal, legal: legal, trickWinner: trickWinner, aiBid: aiBid, aiPlay: aiPlay, newGame: newGame, setBid: setBid, play: play, aiStep: aiStep, score: score, result: result, payout: payout, maxBet: maxBet, label: label, same: same };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Spades;
})(typeof window !== 'undefined' ? window : globalThis);
