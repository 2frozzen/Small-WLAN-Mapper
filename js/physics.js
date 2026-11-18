// Radio physics: propagation, noise, SINR, Shannon capacity and medium access (CSMA/CA).
// Runs in the browser (window.WP) and in Node (require).
(function (root) {
  // Textbook radio physics (no DOM, so it can be tested)
  var C0 = 299792458;
  // Free-space path loss (dB): 20·log10(d) + 20·log10(f) + 20·log10(4π/c), d in m, f in Hz
  function fspl(dM, fHz) {
    return 20 * Math.log10(dM) + 20 * Math.log10(fHz) + 20 * Math.log10((4 * Math.PI) / C0);
  }
  // Multi-wall model: L = L0 + 10·n·log10(d) + Σ kᵢ·Lᵢ (L0 = FSPL at 1 m)
  function multiWall(L0, n, dM, wallSum) {
    return L0 + 10 * n * Math.log10(dM < 1 ? 1 : dM) + wallSum;
  }
  // link budget: P_RX = P_TX + G_TX - L + G_RX (dBm, dBi, dB)
  function linkBudget(pTx, gTx, L, gRx) {
    return pTx + gTx - L + gRx;
  }
  // Thermal noise N: -174 dBm/Hz + 10·log10(B) + receiver noise figure
  function noiseDbm(bwMHz, nf) {
    return -174 + 10 * Math.log10(bwMHz * 1e6) + nf;
  }
  // SINR = P_RX / (N + Σ P_Interferenz), Rechnung linear in mW, Ergebnis in dB
  function sinrDb(prx, nDbm, intf) {
    var s = Math.pow(10, nDbm / 10);
    for (var i = 0; i < intf.length; i++) s += Math.pow(10, intf[i] / 10);
    return prx - 10 * Math.log10(s);
  }
  // Shannon-Hartley: C = B·log2(1+SINR) per spatial stream (Mbit/s for B in MHz).
  // gap = distance of real modulation to the Shannon limit (dB), cap = top rate of the standard
  function shannonMbps(bwMHz, sinr, nss, gap, cap) {
    var c = bwMHz * Math.log2(1 + Math.pow(10, (sinr - (gap || 0)) / 10)) * nss;
    return cap ? Math.min(c, cap) : c;
  }
  // Wi-Fi 6 top rate (MCS 11, 0.8 µs GI) per stream and channel width in Mbit/s
  var PHYMAX = { 20: 143.4, 40: 286.8, 80: 600.5, 160: 1201 };
  // Seeded random numbers so results do not jump on redraw
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Medienzugriff CSMA/CA (802.11 DCF), ereignisgesteuert:
  // Every station with data picks T_backoff = random(0..CW)·T_slot; the lowest counter sends first, the others freeze.
  // Two sending at once collide and both double CW (up to 1023); a frame is dropped after 7 failed attempts.
  // st: [{rate: PHY rate Mbit/s, demand: Mbit/s, sat: always has data}], result per station:
  // thr (payload Mbit/s), delay (ms until a successful transmission), coll (share of collisions)
  function macSim(st, opt) {
    var SLOT = 9,
      DIFS = 34,
      ACK = 50,
      PRE = 40,
      CWMIN = 15,
      CWMAX = 1023,
      RETRY = 7;
    var rnd = rng((opt && opt.seed) || 1),
      T = (opt && opt.T) || 2e5,
      t = 0;
    function bits(r) {
      return Math.min(64 * 1500 * 8, r * 2500);
    } // A-MPDU: at most 64 packets or 2.5 ms airtime
    function expo(m) {
      return -Math.log(1 - rnd()) * m;
    }
    var S = st.map(function (s) {
      var dem = Math.max(s.demand || 0, 1e-6);
      // queue in bits; 1500-byte packets arrive at random (Poisson) according to demand
      return {
        rate: Math.max(s.rate, 1),
        sat: !!s.sat,
        q: s.sat ? Infinity : 0,
        b: -1,
        cw: CWMIN,
        ret: 0,
        bits: 0,
        succ: 0,
        coll: 0,
        att: 0,
        acc: 0,
        start: -1,
        sent: 0,
        next: s.sat ? Infinity : expo(12000 / dem),
        dem: dem
      };
    });
    while (t < T) {
      var i,
        s,
        C = [],
        nt = Infinity;
      for (i = 0; i < S.length; i++) {
        s = S[i];
        while (s.next <= t) {
          s.q += 12000;
          s.next += expo(12000 / s.dem);
        }
        if (s.q > 0) C.push(s);
        else if (s.next < nt) nt = s.next;
      }
      if (!C.length) {
        if (!isFinite(nt)) break;
        t = nt;
        continue;
      }
      var m = Infinity;
      for (i = 0; i < C.length; i++) {
        s = C[i];
        if (s.b < 0) {
          s.b = Math.floor(rnd() * (s.cw + 1));
          if (s.start < 0) s.start = t;
        }
        if (s.b < m) m = s.b;
      }
      t += DIFS + m * SLOT;
      var tx = [],
        dur = 0;
      for (i = 0; i < C.length; i++) {
        s = C[i];
        s.b -= m;
        if (s.b === 0) {
          tx.push(s);
          s.att++;
          s.sent = Math.min(s.q, bits(s.rate));
          var d = PRE + s.sent / s.rate;
          if (d > dur) dur = d;
        }
      }
      t += dur + ACK;
      if (tx.length === 1) {
        s = tx[0];
        s.bits += s.sent;
        s.succ++;
        s.acc += t - s.start;
        s.start = -1;
        s.q -= s.sent;
        s.cw = CWMIN;
        s.ret = 0;
        s.b = -1;
      } else {
        for (i = 0; i < tx.length; i++) {
          s = tx[i];
          s.coll++;
          s.ret++;
          s.b = -1;
          if (s.ret > RETRY) {
            s.q -= s.sent;
            s.ret = 0;
            s.cw = CWMIN;
            s.start = -1;
          } else s.cw = Math.min(2 * s.cw + 1, CWMAX);
        }
      }
    }
    return S.map(function (s) {
      return {
        thr: s.bits / Math.max(t, 1),
        delay: s.succ ? s.acc / s.succ / 1000 : null,
        coll: s.att ? s.coll / s.att : 0
      };
    });
  }

  var api = {
    fspl: fspl,
    multiWall: multiWall,
    linkBudget: linkBudget,
    noiseDbm: noiseDbm,
    sinrDb: sinrDb,
    shannonMbps: shannonMbps,
    PHYMAX: PHYMAX,
    rng: rng,
    macSim: macSim
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WP = Object.assign(root.WP || {}, api);
})(this);
