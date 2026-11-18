// Tests for detection and radio physics: node tests/test.js
const fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const E = require('../js/detection.js'),
  P = require('../js/physics.js');
// app.js must parse
new Function(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'));
const findWalls = E.findWalls;
function raster(w, h) {
  const d = new Uint8Array(w * h);
  d.rect = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d[y * w + x] = 1;
  };
  return d;
}

// a) filled walls: outer wall 8px, inner wall 4px with a door gap, 1px dimension line, text noise
let w = 300,
  h = 200,
  d = raster(w, h);
d.rect(20, 20, 280, 28);
d.rect(20, 172, 280, 180);
d.rect(20, 20, 28, 180);
d.rect(272, 20, 280, 180);
d.rect(148, 28, 152, 90);
d.rect(148, 110, 152, 172); // inner wall with door
d.rect(20, 190, 280, 191); // dimension line, 1px
for (let i = 0; i < 10; i++) d.rect(60 + i * 6, 60, 63 + i * 6, 64); // "text"
let r = findWalls(d, w, h, 2);
let H = r.filter((g) => g.o === 'h'),
  V = r.filter((g) => g.o === 'v');
assert.strictEqual(H.length, 2, '2 horizontal outer walls, no dimension line: ' + JSON.stringify(H));
assert.strictEqual(V.length, 4, '2 outer + 2 inner vertical pieces: ' + JSON.stringify(V));
H.forEach((g) => assert.strictEqual(g.p1 - g.p0 + 1, 8));
assert.ok(
  V.some((g) => g.p0 === 148 && g.p1 === 151 && g.a <= 28 && g.b === 89),
  'upper inner wall with door gap'
);

// b) double-line walls (CAD style): two 1px strokes, 7px apart
d = raster(w, h);
d.rect(20, 20, 280, 21);
d.rect(20, 28, 280, 29); // top
d.rect(20, 20, 21, 180);
d.rect(28, 20, 29, 180); // left
r = findWalls(d, w, h, 2);
H = r.filter((g) => g.o === 'h');
V = r.filter((g) => g.o === 'v');
assert.strictEqual(H.length, 1, 'top double line -> 1 wall: ' + JSON.stringify(H));
assert.strictEqual(H[0].p1 - H[0].p0 + 1, 9, 'thickness = distance between the lines');
assert.strictEqual(V.length, 1, 'left double line -> 1 wall');

// c) stairs: many parallel strokes must not become one huge wall
d = raster(w, h);
for (let i = 0; i < 12; i++) d.rect(100, 40 + i * 5, 160, 41 + i * 5);
r = findWalls(d, w, h, 2);
r.forEach((g) =>
  assert.ok(g.p1 - g.p0 + 1 <= Math.round(300 * 0.025) + 2, 'no huge wall: ' + JSON.stringify(g))
);
console.log('OK: syntax + findWalls (filled, double line, stairs)');

// pickWidth: overall dimension from OCR words
const pickWidth = E.pickWidth;
const box = { x0: 100, y0: 100, x1: 500, y1: 300 };
const W = (t, x, y, c = 90) => ({ t, c, x0: x, y0: y, x1: x + 40, y1: y + 12 });
// metres with comma: partial + overall dimension above, room area inside, title block far below
let hit = pickWidth(
  [W('4,20', 150, 70), W('8,29', 350, 70), W('12,49', 280, 50), W('24,50', 250, 200), W('2024', 300, 420)],
  box
);
assert.strictEqual(hit.v, 12.49, 'overall dimension in m: ' + JSON.stringify(hit));
// centimetres, comma lost by OCR
hit = pickWidth([W('420', 150, 310), W('1249', 280, 330)], box);
assert.strictEqual(hit.v, 12.49);
assert.strictEqual(hit.u, 'cm');
// millimetres
hit = pickWidth([W('4200', 150, 70), W('12490', 280, 50)], box);
assert.strictEqual(hit.v, 12.49);
assert.strictEqual(hit.u, 'mm');
// low confidence and nothing plausible
assert.strictEqual(pickWidth([W('12,49', 280, 50, 20), W('0,5', 200, 60)], box), null);
console.log('OK: pickWidth (m, cm, mm, filters)');

// footprint: floor area, balcony, outline
const F = E;
{
  // L-shaped house on a 260x180 raster, 4px walls, 10px door in the outer wall, balcony on the right with a 1px railing
  const w = 260,
    h = 180,
    wall = new Uint8Array(w * h),
    dark = new Uint8Array(w * h);
  const rect = (m, x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  };
  // L: top 20..200 x 20..80, bottom left 20..100 x 80..160
  [
    [20, 20, 200, 24],
    [196, 20, 200, 84],
    [100, 80, 200, 84],
    [96, 80, 100, 160],
    [20, 156, 100, 160],
    [20, 20, 24, 160]
  ].forEach((r) => {
    rect(wall, ...r);
    rect(dark, ...r);
  });
  // door: gap in the bottom wall
  for (let y = 156; y < 160; y++)
    for (let x = 50; x < 60; x++) {
      wall[y * w + x] = 0;
      dark[y * w + x] = 0;
    }
  // balcony right of the outer wall x=200, y 30..70, 30 px deep: 1px railing
  rect(dark, 200, 30, 230, 31);
  rect(dark, 229, 30, 230, 70);
  rect(dark, 200, 69, 230, 70);
  // free-standing dimension line at the top
  rect(dark, 20, 8, 200, 9);
  const pxm = 10; // 10 px = 1 m
  const r = F.footprint(wall, dark, w, h, 8, pxm, true);
  assert.ok(r, 'floor area found');
  const poly = F.traceOutline(r.fp, w, h);
  assert.strictEqual(poly.length, 6, 'L shape has 6 corners: ' + JSON.stringify(poly));
  assert.deepStrictEqual(poly[0], [20, 20]);
  assert.ok(Math.abs(r.area - (180 * 64 + 80 * 76)) < 200, 'area ~ L: ' + r.area);
  assert.strictEqual(r.outs.length, 1, 'one balcony detected');
  const bp = F.traceOutline(r.outs[0], w, h);
  assert.ok(bp.length === 4, 'balcony is rectangular: ' + JSON.stringify(bp));
  // without balcony detection
  assert.strictEqual(F.footprint(wall, dark, w, h, 8, pxm, false).outs.length, 0);
  // simplify removes small steps
  const stair = [
    [0, 0],
    [10, 0],
    [10, 10],
    [9, 10],
    [9, 11],
    [8, 11],
    [8, 12],
    [0, 12]
  ];
  assert.ok(F.simplify(stair, 1.5).length < stair.length);
}
console.log('OK: footprint (L shape, door closed, balcony, outline)');

// radio physics: formulas against textbook values, MAC simulation against known effects
{
  const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= e, msg + ': ' + a + ' statt ' + b);
  near(P.fspl(1, 2.4e9), 40.05, 0.05, 'FSPL 1 m @ 2.4 GHz'); // textbook ≈ 40.05 dB
  near(P.fspl(10, 5.5e9), 67.25, 0.05, 'FSPL 10 m @ 5.5 GHz');
  near(P.multiWall(40, 3, 10, 12), 40 + 30 + 12, 1e-9, 'Multi-Wall');
  near(P.linkBudget(20, 3, 80, 0), -57, 1e-9, 'Link-Budget');
  near(P.noiseDbm(20, 0), -101, 0.1, 'kT·B at 20 MHz'); // -174 + 73
  near(P.noiseDbm(80, 7), -87.97, 0.05, 'noise 80 MHz, NF 7');
  near(P.sinrDb(-60, -90, []), 30, 1e-9, 'SINR without interferers = SNR');
  near(P.sinrDb(-60, -90, [-60]), 0, 0.01, 'equal interferer -> ~0 dB');
  near(P.shannonMbps(20, 30, 1), 20 * Math.log2(1001), 1e-6, 'Shannon');
  assert.strictEqual(P.shannonMbps(20, 40, 2, 0, P.PHYMAX[20] * 2), 286.8, 'capped at the Wi-Fi 6 top rate');
  // MAC: one station alone is efficient, two equal ones share fairly, collisions grow with the count
  const one = P.macSim([{ rate: 600, sat: true }], { seed: 3 })[0];
  assert.ok(one.thr > 450 && one.thr < 600, 'single station efficiency: ' + one.thr);
  const two = P.macSim(
    [
      { rate: 600, sat: true },
      { rate: 600, sat: true }
    ],
    { seed: 3 }
  );
  assert.ok(
    Math.abs(two[0].thr - two[1].thr) < 0.2 * two[0].thr,
    'fair share: ' + two.map((x) => x.thr.toFixed(0))
  );
  assert.ok(two[0].thr + two[1].thr < one.thr, 'sharing costs extra (backoff/collisions)');
  const many = P.macSim(
    Array.from({ length: 10 }, () => ({ rate: 600, sat: true })),
    { seed: 3 }
  );
  assert.ok(many[0].coll > two[0].coll, 'more stations -> more collisions');
  // performance anomaly: a slow station slows down the fast one
  const anom = P.macSim(
    [
      { rate: 600, sat: true },
      { rate: 6.5, sat: true }
    ],
    { seed: 3 }
  );
  assert.ok(anom[0].thr < 0.75 * two[0].thr, 'slow neighbour slows down: ' + anom[0].thr.toFixed(0));
  // light background traffic takes little airtime
  const bg = P.macSim(
    [
      { rate: 600, sat: true },
      { rate: 600, demand: 2 }
    ],
    { seed: 3 }
  );
  assert.ok(
    bg[0].thr > 0.9 * one.thr && Math.abs(bg[1].thr - 2) < 1,
    'background 2 Mbit/s: ' + bg.map((x) => x.thr.toFixed(1))
  );
}
console.log('OK: radio physics (FSPL, multi-wall, link budget, noise, SINR, Shannon, CSMA/CA)');

// dimension chains and glass facades
{
  const box = { x0: 100, y0: 100, x1: 500, y1: 300 };
  const W = (t, x, y, c = 90) => ({ t, c, x0: x, y0: y, x1: x + 30, y1: y + 12 });
  const chain = E.pickWidth(
    [W('4,08', 110, 70), W('2,09', 190, 70), W('6,59', 260, 70), W('2,35', 380, 70), W('2,18', 450, 70)],
    box
  );
  assert.strictEqual(chain.v, 17.29, 'chain sum: ' + JSON.stringify(chain));
  assert.ok(chain.chain);
  const single = E.pickWidth([W('4,20', 150, 70), W('8,29', 350, 70), W('12,49', 280, 40)], box);
  assert.strictEqual(single.v, 12.49, 'overall dimension still wins over a shorter chain');
  // two thick walls with a thin grey line between them (facade) and a free-floating dimension line
  const w = 200,
    h = 120,
    soft = new Uint8Array(w * h);
  const rect = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) soft[y * w + x] = 1;
  };
  rect(20, 20, 24, 100);
  rect(176, 20, 180, 100); // thick walls (also present in soft)
  rect(24, 20, 176, 22); // facade line
  rect(30, 8, 170, 9); // dimension line, ends in free space
  const gs = E.findWalls(soft, w, h, 3);
  const glass = E.glassWalls(gs, soft, w, h, 4, 6);
  assert.strictEqual(glass.length, 1, 'one glass wall: ' + JSON.stringify(glass));
  assert.ok(glass[0].p0 >= 19 && glass[0].p1 <= 22, 'it is the facade, not the dimension line');
}
console.log('OK: dimension chains, glass facades');
