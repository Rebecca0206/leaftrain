# LeafTrain (leafactivity.com/leaftrain/)

A free 3D freight-train game. Static files only: served by `server.py` like `/ai/` (`static_path_allowed` allows `/leaftrain/`, and `/leaftrain` redirects to `/leaftrain/`).

| File | What it does |
|---|---|
| `engine.js` | Track (grade profile, curves, loop), physics, fuel, slosh, contracts and lock rules, upgrades, save/load. No DOM: tested in Node. |
| `spades.js` | The town bar's one-hand Spades (you + AI partner vs 2 AI), scoring and payout. Game money only. No DOM. |
| `world.js` | Low-poly 3D chunks: terrain, ballast, rails, instanced sleepers, peaks, trees, buildings, stations, signs. Chunks are built ahead of the train and disposed behind it. |
| `train.js` | Locomotive, optional fuel tender, cargo cars, tank wagons. Each vehicle sits on two bogies on the track spline; instanced spinning wheels; couplers. |
| `game.js` | Loop, chase/cab cameras, controls, HUD, WebAudio rail clack, contracts board, mechanic, fuel, bar, save. |
| `three.min.js` | three.js r149 (MIT, see `THREE-LICENSE.txt`), vendored so there is no CDN. |

Tests: `node --test tests/leaftrain.test.mjs`, `python3 -m pytest tests/test_leaftrain.py`, and the headless-browser run in `tests/leaftrain-browser.mjs`.

Play money only. No real money, no purchases. The bar is marked 13+ and hidden in Kids mode (`?kids=1` or the menu).

## Trade, riders, crew (added)
- **Markets**: every town has its own buy/sell prices by biome (buy low, sell high, limited by car and tank-wagon capacity) plus goods-for-goods barter at town rates. Goods add weight.
- **Contraband (13+)**: liquor, unregistered weapons and generic contraband crates pay more but border posts may inspect (fine = 30% of pay, cargo may be seized). Behind a 13+ tap, hidden in Kids mode.
- **Passenger wagons**: buy up to 4, upgrade comfort for higher fares; legit riders between towns only; wagons and riders add weight.
- **Crew on wages** (per minute, saved): engineer (fuel), mechanic (less wear, repairs, fewer breakdowns), conductor (fares), guards (less seizure/theft), cook (happiness, fares). Unpaid crews quit.
- **Wear and breakdowns**: engine, brakes and wheels wear with use; worn parts perform worse and can break down; the mechanic's service restores them.
- **Spades**: payout scales with the bid you made (a 13 bid pays 3x), but the multipliers keep expected value below even. Play money only.
- The `window.__lt` test hook exists only with `?test=1`.
