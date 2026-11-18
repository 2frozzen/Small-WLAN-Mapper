// Floor plan detection: walls, building width from dimensions, outline and outdoor areas.
// Runs in the browser (window.WP) and in Node (require).
(function (root) {
  // dark: Uint8Array w*h, 1 = dark pixel. Returns wall pieces in raster coordinates:
  // {o:'h'|'v', a..b = extent along the wall, p0..p1 = thickness across it}
  // Only horizontal and vertical walls; diagonal ones are drawn by hand in edit mode.
  // noPair: keep parallel thin lines apart (used when looking for single glass lines)
  function findWalls(dark, w, h, minT, noPair) {
    var big = Math.max(w, h),
      minLen = Math.max(6, Math.round(big * 0.03)),
      gap = Math.max(3, Math.round(big * 0.025));
    function runs(horiz) {
      var out = [],
        L = horiz ? w : h,
        P = horiz ? h : w;
      for (var p = 0; p < P; p++) {
        var s = -1;
        for (var a = 0; a <= L; a++) {
          var d = a < L && dark[horiz ? p * w + a : a * w + p];
          if (d && s < 0) s = a;
          else if (!d && s >= 0) {
            if (a - s >= minLen) out.push({ a: s, b: a - 1, p0: p, p1: p });
            s = -1;
          }
        }
      }
      return out;
    }
    function ovl(g, r, f) {
      var o = Math.min(g.b, r.b) - Math.max(g.a, r.a) + 1;
      return o >= f * Math.min(g.b - g.a + 1, r.b - r.a + 1);
    }
    // Stack runs of neighbouring rows into one thick piece. The final length is what most rows agree
    // on, so a single 1 px line continuing the wall (a dimension extension line) does not lengthen it.
    function stack(rs) {
      var out = [],
        act = [];
      rs.forEach(function (r) {
        var hit = null;
        for (var i = act.length - 1; i >= 0; i--) {
          var g = act[i];
          if (r.p0 - g.p1 > 1) {
            act.splice(i, 1);
            continue;
          }
          if (!hit && g.p1 < r.p0 && ovl(g, r, 0.5)) hit = g;
        }
        if (hit) {
          hit.a = Math.min(hit.a, r.a);
          hit.b = Math.max(hit.b, r.b);
          hit.p1 = r.p0;
          hit.as.push(r.a);
          hit.bs.push(r.b);
        } else {
          r.as = [r.a];
          r.bs = [r.b];
          out.push(r);
          act.push(r);
        }
      });
      out.forEach(function (g) {
        var n = g.as.length;
        if (n < 2) return;
        g.a = g.as.sort(function (x, y) {
          return x - y;
        })[n >> 1];
        g.b = g.bs.sort(function (x, y) {
          return y - x;
        })[n >> 1];
      });
      return out;
    }
    // A wall drawn as a double line: merge two thin parallel strokes into one wall
    function pair(gs) {
      gs.sort(function (x, y) {
        return x.p0 - y.p0;
      });
      var out = [];
      for (var i = 0; i < gs.length; i++) {
        var g = gs[i];
        if (g.dead) continue;
        for (var j = i + 1; j < gs.length; j++) {
          var r = gs[j];
          if (r.p0 - g.p1 > gap) break;
          if (r.dead) continue;
          // do not chain whole staircases or hatching into one huge wall
          if (Math.max(g.p1, r.p1) - g.p0 + 1 <= gap + 2 && ovl(g, r, 0.6)) {
            g.a = Math.min(g.a, r.a);
            g.b = Math.max(g.b, r.b);
            g.p1 = Math.max(g.p1, r.p1);
            r.dead = true;
          }
        }
        out.push(g);
      }
      return out;
    }
    var res = [];
    [
      ['h', true],
      ['v', false]
    ].forEach(function (o) {
      var st = stack(runs(o[1]));
      (noPair ? st : pair(st)).forEach(function (g) {
        if (g.p1 - g.p0 + 1 >= minT) {
          g.o = o[0];
          res.push(g);
        }
      });
    });
    return res;
  }

  // Building width from OCR words above or below the walls. Candidates are the largest single value
  // (an overall dimension) and the sum of each dimension chain (several values on one line spanning
  // at least half the building). The largest wins. Only horizontal text is used; OCR misses rotated text.
  // words: [{t,c,x0,y0,x1,y1}], box: bounding box of the walls, same coordinates.
  function pickWidth(words, box) {
    var cand = [],
      bh = box.y1 - box.y0,
      bw = box.x1 - box.x0;
    words.forEach(function (wd) {
      var t = String(wd.t)
        .replace(/[^0-9,.]/g, '')
        .replace(/[.,]+$/, '');
      if (!t || wd.c < 40) return;
      var dist = wd.y1 <= box.y0 ? box.y0 - wd.y1 : wd.y0 >= box.y1 ? wd.y0 - box.y1 : -1;
      // inside the building (room areas) or far away (title block)
      if (dist < 0 || dist > 0.3 * bh || wd.x1 <= box.x0 || wd.x0 >= box.x1) return;
      var m = t.match(/^(\d{1,3})[,.](\d{1,3})$/),
        c = { t: wd.t, x0: wd.x0, x1: wd.x1, y: (wd.y0 + wd.y1) / 2, hgt: wd.y1 - wd.y0 };
      if (m) {
        c.v = parseFloat(m[1] + '.' + m[2]);
        c.u = 'm';
        cand.push(c);
      } else if (/^\d{2,6}$/.test(t)) {
        c.v = +t;
        c.u = '';
        cand.push(c);
      }
    });
    // integers are centimetres unless the drawing is clearly dimensioned in millimetres
    var mm = cand.some(function (c) {
      return !c.u && c.v > 10000;
    });
    cand.forEach(function (c) {
      if (!c.u) {
        c.v /= mm ? 1000 : 100;
        c.u = mm ? 'mm' : 'cm';
      }
    });
    var parts = cand.filter(function (c) {
        return c.v >= 0.3 && c.v <= 100;
      }),
      best = null,
      chains = [];
    parts.forEach(function (c) {
      if (c.v >= 3 && (!best || c.v > best.v)) best = { v: c.v, t: c.t, u: c.u };
    });
    var rows = [];
    parts
      .slice()
      .sort(function (a, b) {
        return a.y - b.y;
      })
      .forEach(function (c) {
        var r = rows.filter(function (r) {
          return Math.abs(r.y - c.y) < 0.8 * Math.max(r.hgt, c.hgt);
        })[0];
        if (r) r.items.push(c);
        else rows.push({ y: c.y, hgt: c.hgt, items: [c] });
      });
    rows.forEach(function (r) {
      if (r.items.length < 2) return;
      var x0 = Math.min.apply(
          null,
          r.items.map(function (c) {
            return c.x0;
          })
        ),
        x1 = Math.max.apply(
          null,
          r.items.map(function (c) {
            return c.x1;
          })
        );
      if (x1 - x0 < 0.5 * bw) return;
      var s =
        Math.round(
          r.items.reduce(function (a, c) {
            return a + c.v;
          }, 0) * 100
        ) / 100;
      if (s < 3 || s > 100) return;
      chains.push(s);
      if (!best || s > best.v + 0.01)
        best = {
          v: s,
          u: r.items[0].u,
          chain: true,
          t: r.items
            .sort(function (a, b) {
              return a.x0 - b.x0;
            })
            .map(function (c) {
              return c.t;
            })
            .join(' + ')
        };
    });
    if (best) best.chains = chains;
    return best;
  }

  // Glass facades and window strips are often drawn as thin grey lines. A long thin line counts as a
  // (glass) wall when both of its ends meet a thick wall; dimension lines end in free space and are skipped.
  // gs: thick wall pieces, soft: lighter dark mask, tol: search radius around the ends in px,
  // maxT: thickest line still taken as glass (keeps coloured room fills out).
  function glassWalls(gs, soft, w, h, tol, maxT) {
    var thick = new Uint8Array(w * h),
      out = [];
    gs.forEach(function (g) {
      for (var p = g.p0; p <= g.p1; p++)
        for (var a = g.a; a <= g.b; a++) thick[g.o === 'h' ? p * w + a : a * w + p] = 1;
    });
    function near(x, y) {
      for (var dy = -tol; dy <= tol; dy++)
        for (var dx = -tol; dx <= tol; dx++) {
          var X = x + dx,
            Y = y + dy;
          if (X >= 0 && Y >= 0 && X < w && Y < h && thick[Y * w + X]) return true;
        }
      return false;
    }
    // join pieces of one line that are split by small gaps (tick marks, anti-aliasing)
    var segs = findWalls(soft, w, h, 1, true).sort(function (x, y) {
        return x.o < y.o ? -1 : x.o > y.o ? 1 : x.p0 - y.p0 || x.a - y.a;
      }),
      lines = [];
    segs.forEach(function (s) {
      var L = lines.filter(function (l) {
        return (
          l.o === s.o &&
          Math.abs(l.p0 - s.p0) <= 1 &&
          Math.abs(l.p1 - s.p1) <= 1 &&
          s.a - l.b <= tol &&
          s.a >= l.a
        );
      })[0];
      if (L) {
        L.b = Math.max(L.b, s.b);
        L.p0 = Math.min(L.p0, s.p0);
        L.p1 = Math.max(L.p1, s.p1);
      } else lines.push({ o: s.o, a: s.a, b: s.b, p0: s.p0, p1: s.p1 });
    });
    lines.forEach(function (s) {
      if (maxT && s.p1 - s.p0 + 1 > maxT) return;
      var pm = (s.p0 + s.p1) >> 1,
        cov = 0;
      for (var a = s.a; a <= s.b; a++) if (thick[s.o === 'h' ? pm * w + a : a * w + pm]) cov++;
      if (cov > 0.5 * (s.b - s.a + 1)) return; // already covered by a thick wall
      var e1 = s.o === 'h' ? near(s.a, pm) : near(pm, s.a),
        e2 = s.o === 'h' ? near(s.b, pm) : near(pm, s.b);
      if (e1 && e2) out.push(s);
    });
    return out;
  }

  // Closes window openings: every wall is extended along its own line by up to maxGap px, and any
  // drawing line inside that band (window panes, short piers between windows) counts as wall.
  // Balcony railings stand off the wall line and are not picked up. soft: dark mask with a lighter
  // threshold, so grey window lines count too. Returns the added pixels and how many walls grew.
  // box (optional): bounding box of the thick walls; windows lie inside it, dimension chains outside
  function bridgeGaps(gs, soft, w, h, maxGap, box) {
    var add = new Uint8Array(w * h),
      n = 0;
    gs.forEach(function (g) {
      var lo = box ? (g.o === 'h' ? box.x0 : box.y0) : 0,
        hi = box ? (g.o === 'h' ? box.x1 : box.y1) : (g.o === 'h' ? w : h) - 1;
      var a0 = Math.max(lo, g.a - maxGap),
        a1 = Math.min(hi, g.b + maxGap),
        hit = 0;
      for (var p = g.p0; p <= g.p1; p++)
        for (var a = a0; a <= a1; a++) {
          if (a >= g.a && a <= g.b) continue;
          var i = g.o === 'h' ? p * w + a : a * w + p;
          if (soft[i] && !add[i]) {
            add[i] = 1;
            hit++;
          }
        }
      if (hit) n++;
    });
    return { mask: add, count: n };
  }

  // Outline and outdoor areas from the raster (no DOM, so it can be tested). Masks: Uint8Array w*h, 1 = set.
  // Dilation with a square kernel (radius r) using prefix sums per row/column
  function boxAny(m, w, h, r) {
    if (r <= 0) return m.slice();
    var t = new Uint8Array(w * h),
      o = new Uint8Array(w * h),
      ps = new Int32Array(Math.max(w, h) + 1),
      x,
      y,
      a,
      b;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) ps[x + 1] = ps[x] + m[y * w + x];
      for (x = 0; x < w; x++) {
        a = x - r < 0 ? 0 : x - r;
        b = x + r + 1 > w ? w : x + r + 1;
        t[y * w + x] = ps[b] - ps[a] > 0 ? 1 : 0;
      }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) ps[y + 1] = ps[y] + t[y * w + x];
      for (y = 0; y < h; y++) {
        a = y - r < 0 ? 0 : y - r;
        b = y + r + 1 > h ? h : y + r + 1;
        o[y * w + x] = ps[b] - ps[a] > 0 ? 1 : 0;
      }
    }
    return o;
  }
  // Flood fill from the image border through all unblocked cells
  function outsideOf(block, w, h) {
    var out = new Uint8Array(w * h),
      st = [],
      i,
      x;
    function push(j) {
      if (!block[j] && !out[j]) {
        out[j] = 1;
        st.push(j);
      }
    }
    for (x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (var y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }
    while (st.length) {
      i = st.pop();
      x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < w * (h - 1)) push(i + w);
    }
    return out;
  }
  // Interior: everything the border cannot reach once openings up to 2r (doors) are closed
  function interiorOf(walls, w, h, r) {
    var out = boxAny(outsideOf(boxAny(walls, w, h, r), w, h), w, h, r),
      inn = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) inn[i] = out[i] ? 0 : 1;
    return inn;
  }
  // Connected areas (4-neighbourhood) with size, bounding box and whether they touch touchMask
  function components(m, w, h, touchMask) {
    var lab = new Int32Array(w * h).fill(-1),
      comps = [],
      st = [];
    for (var s = 0; s < w * h; s++) {
      if (!m[s] || lab[s] >= 0) continue;
      var c = { n: 0, x0: w, y0: h, x1: -1, y1: -1, touch: false },
        id = comps.length;
      comps.push(c);
      lab[s] = id;
      st.push(s);
      while (st.length) {
        var i = st.pop(),
          x = i % w,
          y = (i - x) / w;
        c.n++;
        if (x < c.x0) c.x0 = x;
        if (x > c.x1) c.x1 = x;
        if (y < c.y0) c.y0 = y;
        if (y > c.y1) c.y1 = y;
        if (touchMask && touchMask[i]) c.touch = true;
        if (x > 0 && m[i - 1] && lab[i - 1] < 0) {
          lab[i - 1] = id;
          st.push(i - 1);
        }
        if (x < w - 1 && m[i + 1] && lab[i + 1] < 0) {
          lab[i + 1] = id;
          st.push(i + 1);
        }
        if (y > 0 && m[i - w] && lab[i - w] < 0) {
          lab[i - w] = id;
          st.push(i - w);
        }
        if (y < h - 1 && m[i + w] && lab[i + w] < 0) {
          lab[i + w] = id;
          st.push(i + w);
        }
      }
    }
    return { lab: lab, comps: comps };
  }
  function only(lab, id, n) {
    var m = new Uint8Array(n);
    for (var i = 0; i < n; i++) m[i] = lab[i] === id ? 1 : 0;
    return m;
  }
  // Outer boundary of the area containing the first set cell, clockwise; corners on the vertex grid
  function traceOutline(m, w, h) {
    var s = -1;
    for (var i = 0; i < w * h; i++)
      if (m[i]) {
        s = i;
        break;
      }
    if (s < 0) return [];
    var x = s % w,
      y = (s - x) / w,
      sx = x,
      sy = y,
      d = 0,
      pts = [[x, y]],
      DX = [1, 0, -1, 0],
      DY = [0, 1, 0, -1],
      guard = 0;
    function at(cx, cy) {
      return cx >= 0 && cy >= 0 && cx < w && cy < h && m[cy * w + cx] === 1;
    }
    do {
      x += DX[d];
      y += DY[d];
      var fl, fr;
      if (d === 0) {
        fl = at(x, y - 1);
        fr = at(x, y);
      } else if (d === 1) {
        fl = at(x, y);
        fr = at(x - 1, y);
      } else if (d === 2) {
        fl = at(x - 1, y);
        fr = at(x - 1, y - 1);
      } else {
        fl = at(x - 1, y - 1);
        fr = at(x, y - 1);
      }
      var nd = fl ? (d + 3) % 4 : fr ? d : (d + 1) % 4;
      if (nd !== d) {
        pts.push([x, y]);
        d = nd;
      }
    } while (!(x === sx && y === sy && d === 0) && ++guard < 4 * w * h);
    if (pts.length > 1 && pts[pts.length - 1][0] === sx && pts[pts.length - 1][1] === sy) pts.pop();
    return pts;
  }
  // Polygon vereinfachen (Douglas-Peucker, geschlossen): Treppchen unter eps Zellen verschwinden
  function simplify(pts, eps) {
    if (pts.length < 5) return pts;
    function dp(a, b, out) {
      var A = pts[a],
        B = pts[b % pts.length],
        dx = B[0] - A[0],
        dy = B[1] - A[1],
        L = Math.sqrt(dx * dx + dy * dy) || 1,
        md = -1,
        mi = -1;
      for (var i = a + 1; i < b; i++) {
        var P = pts[i],
          dd = Math.abs(dy * (P[0] - A[0]) - dx * (P[1] - A[1])) / L;
        if (dd > md) {
          md = dd;
          mi = i;
        }
      }
      if (md > eps) {
        dp(a, mi, out);
        dp(mi, b, out);
      } else out.push(A);
    }
    var far = 0,
      fd = -1;
    pts.forEach(function (p, i) {
      var dd = (p[0] - pts[0][0]) * (p[0] - pts[0][0]) + (p[1] - pts[0][1]) * (p[1] - pts[0][1]);
      if (dd > fd) {
        fd = dd;
        far = i;
      }
    });
    var out = [];
    dp(0, far, out);
    dp(far, pts.length, out);
    return out;
  }
  // Result: fp = building (every area enclosed by thick walls, at least 2 m²), parts = those areas
  // largest first, outs = balconies/terraces: enclosed by any lines, outside the building, attached
  // to it, at least 2 m² and 0.9 m deep.
  function footprint(wallM, dark, w, h, rClose, pxm, balc) {
    // opening (erode, then dilate) removes strips narrower than ~1.1 m, e.g. the gap between an
    // outer wall and a dimension chain that the closing filled in; rooms and corridors are wider
    var inner = interiorOf(wallM, w, h, rClose),
      rO = Math.max(1, Math.round(0.55 * pxm)),
      inv = new Uint8Array(w * h),
      i0;
    for (i0 = 0; i0 < w * h; i0++) inv[i0] = inner[i0] ? 0 : 1;
    var grown = boxAny(inv, w, h, rO),
      eroded = new Uint8Array(w * h);
    for (i0 = 0; i0 < w * h; i0++) eroded[i0] = grown[i0] ? 0 : 1;
    var opened = boxAny(eroded, w, h, rO);
    for (i0 = 0; i0 < w * h; i0++) opened[i0] = opened[i0] && inner[i0] ? 1 : 0;
    var cp = components(opened, w, h),
      ids = [];
    cp.comps.forEach(function (c, i) {
      if (c.n >= 2 * pxm * pxm) ids.push(i);
    });
    if (!ids.length) return null;
    ids.sort(function (a, b) {
      return cp.comps[b].n - cp.comps[a].n;
    });
    var keep = {},
      area = 0,
      B = { x0: w, y0: h, x1: -1, y1: -1 },
      fp = new Uint8Array(w * h),
      outs = [];
    ids.forEach(function (i) {
      var c = cp.comps[i];
      keep[i] = 1;
      area += c.n;
      B.x0 = Math.min(B.x0, c.x0);
      B.y0 = Math.min(B.y0, c.y0);
      B.x1 = Math.max(B.x1, c.x1);
      B.y1 = Math.max(B.y1, c.y1);
    });
    for (var k = 0; k < w * h; k++) if (keep[cp.lab[k]]) fp[k] = 1;
    var parts = ids.map(function (i) {
      return only(cp.lab, i, w * h);
    });
    if (balc) {
      var encl = interiorOf(dark, w, h, Math.max(1, Math.round(0.1 * pxm))),
        cand = new Uint8Array(w * h);
      for (var i = 0; i < w * h; i++) cand[i] = encl[i] && !fp[i] ? 1 : 0;
      var cc = components(cand, w, h, boxAny(fp, w, h, 2)),
        maxDim = Math.max(B.x1 - B.x0, B.y1 - B.y0) + 1;
      cc.comps.forEach(function (c, id) {
        var bw = c.x1 - c.x0 + 1,
          bh = c.y1 - c.y0 + 1;
        if (
          !c.touch ||
          c.n < 2 * pxm * pxm ||
          Math.min(bw, bh) < 0.9 * pxm ||
          Math.max(bw, bh) > 0.95 * maxDim
        )
          return;
        outs.push(only(cc.lab, id, w * h));
      });
    }
    return { fp: fp, area: area, box: B, parts: parts, outs: outs };
  }

  var api = {
    findWalls: findWalls,
    pickWidth: pickWidth,
    bridgeGaps: bridgeGaps,
    glassWalls: glassWalls,
    boxAny: boxAny,
    outsideOf: outsideOf,
    interiorOf: interiorOf,
    components: components,
    traceOutline: traceOutline,
    simplify: simplify,
    footprint: footprint
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WP = Object.assign(root.WP || {}, api);
})(this);
