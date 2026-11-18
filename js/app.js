(function () {
  var fspl = WP.fspl,
    multiWall = WP.multiWall,
    linkBudget = WP.linkBudget,
    noiseDbm = WP.noiseDbm,
    sinrDb = WP.sinrDb,
    shannonMbps = WP.shannonMbps,
    PHYMAX = WP.PHYMAX,
    macSim = WP.macSim;
  var findWalls = WP.findWalls,
    pickWidth = WP.pickWidth,
    bridgeGaps = WP.bridgeGaps,
    glassWalls = WP.glassWalls,
    boxAny = WP.boxAny,
    traceOutline = WP.traceOutline,
    simplify = WP.simplify,
    footprint = WP.footprint;
  var CELL = 6,
    VX = 130,
    VY = 190,
    VW = 1660,
    VH = 1170;
  var GW = Math.ceil(VW / CELL),
    GH = Math.ceil(VH / CELL);
  var NS = 'http://www.w3.org/2000/svg';
  function $(id) {
    return document.getElementById(id);
  }

  // wall loss sliders are for 2.4 GHz, f scales them per band
  var BANDS = [
    { name: '2.4 GHz', ghz: 2.4, f: 1.0 },
    { name: '5 GHz', ghz: 5.5, f: 1.4 },
    { name: '6 GHz', ghz: 6.5, f: 1.6 }
  ];

  BANDS.forEach(function (b) {
    b.l0 = fspl(1, b.ghz * 1e9);
  });
  // non-overlapping channels; ap.ch[band] is an index into this
  var CH = [
    [1, 6, 11],
    [36, 52, 100, 116],
    [5, 21, 37, 53]
  ];
  function defCh(k) {
    return [k % 3, k % 4, k % 4];
  }

  // wall types: glass, concrete, brick, drywall, metal
  var TYPE = { g: 0, c: 1, b: 2, d: 3, m: 4 },
    NT = 5;
  var TNAME = ['Glass', 'Concrete', 'Brick', 'Drywall/wood', 'Metal/elevator'],
    LMAX = [10, 25, 30, 12, 45],
    LID = ['dG', 'dC', 'dB', 'dD', 'dM'];
  var COLOR = ['var(--glass)', 'var(--concrete)', 'var(--brick)', 'var(--dry)', 'var(--metal)'];
  var THICK = [5, 7, 10, 5, 10];
  function newCounts() {
    var a = [];
    for (var t = 0; t < NT; t++) a.push(new Uint8Array(GW * GH));
    return a;
  }

  // kind: f furniture, d device, r router, n interferer. sizes in m, demand in Mbit/s
  var ITEMS = {
    desk: { label: 'Desk', kind: 'f', w: 1.6, h: 0.8 },
    conf: { label: 'Conference table', kind: 'f', w: 3.2, h: 1.2 },
    cabinet: { label: 'Cabinet', kind: 'f', w: 1.0, h: 0.5 },
    sofa: { label: 'Sofa', kind: 'f', w: 2.0, h: 0.9 },
    pc: { label: 'PC', kind: 'd', streams: 2, bands: [0, 1], demand: 8, grx: 2 },
    laptop: { label: 'Laptop', kind: 'd', streams: 2, bands: [0, 1, 2], demand: 12, grx: 0 },
    printer: { label: 'Printer', kind: 'd', streams: 1, bands: [0], demand: 0.2, grx: -2 },
    phone: { label: 'IP phone', kind: 'd', streams: 1, bands: [0, 1], demand: 0.3, grx: -2 },
    tv: { label: 'Smart-TV', kind: 'd', streams: 2, bands: [0, 1], demand: 25, grx: 0 },
    camera: { label: 'Camera', kind: 'd', streams: 1, bands: [0], demand: 4, grx: -1 },
    router: { label: 'Router', kind: 'r' },
    // tx is EIRP; wide = hits every channel (microwave)
    neighbour: { label: 'Neighbour Wi-Fi', kind: 'n', tx: 17, bands: [0, 1] },
    microwave: { label: 'Microwave', kind: 'n', tx: 3, bands: [0], wide: true }
  };
  var ICON = {
    pc: '<rect x="-10" y="-9" width="20" height="13" rx="2"/><path d="M-4 9H4M0 4V9"/>',
    laptop: '<rect x="-8" y="-8" width="16" height="11" rx="1.5"/><path d="M-12 6H12L10 10H-10Z"/>',
    printer: '<rect x="-10" y="-2" width="20" height="10" rx="2"/><path d="M-5 -2V-9H5V-2M-5 3H5"/>',
    phone: '<rect x="-6" y="-10" width="12" height="20" rx="3"/><path d="M-3 6H3"/>',
    tv: '<rect x="-11" y="-8" width="22" height="14" rx="2"/><path d="M-5 10H5"/>',
    camera: '<rect x="-10" y="-6" width="20" height="12" rx="3"/><circle r="3.6"/>',
    neighbour: '<path d="M-10 -2A14 14 0 0 1 10 -2M-6 2A8 8 0 0 1 6 2"/><circle cy="6" r="1.6"/>',
    microwave: '<rect x="-11" y="-7" width="22" height="14" rx="2"/><path d="M5 -7V7M-7 -3H1V3H-7Z"/>'
  };
  var FURN_TOOLS = ['desk', 'conf', 'cabinet', 'sofa'];
  var DEV_TOOLS = ['pc', 'laptop', 'printer', 'phone', 'tv', 'camera'];
  var NOISE_TOOLS = ['neighbour', 'microwave'];

  var LINES = [
    { name: 'DSL 16', down: 16, up: 2.4, ping: 32 },
    { name: 'DSL 50', down: 50, up: 10, ping: 24 },
    { name: 'VDSL 100', down: 100, up: 40, ping: 17 },
    { name: 'Cable 250', down: 250, up: 25, ping: 14 },
    { name: 'Fibre 500', down: 500, up: 250, ping: 8 },
    { name: 'Fibre 1000', down: 1000, up: 500, ping: 5 }
  ];

  // example buildings
  var PLANS = [
    {
      id: 'office',
      name: 'Office building',
      label: 'Office building (6 APs)',
      widthM: 40,
      bpx: 1590,
      outline: [
        [275, 215],
        [1760, 212],
        [1745, 1340],
        [1115, 1338],
        [830, 1335],
        [310, 1335],
        [190, 1230],
        [155, 345]
      ],
      aps: [
        [255, 315],
        [978, 702],
        [1367, 772],
        [645, 820],
        [1433, 998],
        [870, 1135]
      ],
      walls: [
        [275, 215, 1760, 212, 'b'],
        [1760, 212, 1745, 1340, 'b'],
        [1745, 1340, 1115, 1338, 'b'],
        [310, 1335, 830, 1335, 'b'],
        [190, 1230, 310, 1335, 'b'],
        [155, 345, 190, 1230, 'b'],
        [275, 215, 155, 345, 'b'],
        [830, 1185, 830, 1335, 'b'],
        [1115, 1185, 1115, 1338, 'b'],
        [325, 215, 325, 465, 'b'],
        [487, 215, 487, 470, 'b'],
        [650, 215, 650, 460, 'b'],
        [810, 215, 810, 540, 'b'],
        [1125, 215, 1125, 540, 'b'],
        [968, 225, 968, 535, 'c'],
        [1337, 215, 1337, 535, 'c'],
        [1555, 215, 1555, 540, 'c'],
        [175, 464, 810, 462, 'g'],
        [810, 538, 1750, 530, 'g'],
        [170, 630, 500, 630, 'b'],
        [505, 630, 505, 1112, 'g'],
        [510, 1112, 820, 1118, 'g'],
        [190, 850, 510, 850, 'c'],
        [195, 1068, 515, 1068, 'c'],
        [517, 1115, 517, 1335, 'b'],
        [673, 1112, 673, 1335, 'b'],
        [585, 628, 810, 628, 'g'],
        [588, 628, 588, 950, 'g'],
        [590, 946, 810, 950, 'g'],
        [810, 625, 810, 950, 'b'],
        [935, 630, 1197, 630, 'b'],
        [1197, 630, 1197, 952, 'b'],
        [820, 952, 1197, 952, 'b'],
        [935, 630, 935, 790, 'b'],
        [590, 790, 1197, 790, 'b'],
        [590, 790, 590, 850, 'b'],
        [590, 850, 690, 850, 'b'],
        [690, 790, 690, 940, 'b'],
        [1050, 790, 1050, 950, 'b'],
        [1305, 628, 1745, 625, 'g'],
        [1305, 628, 1305, 955, 'g'],
        [1305, 955, 1745, 955, 'g'],
        [1300, 705, 1450, 705, 'b'],
        [1450, 705, 1450, 880, 'b'],
        [1450, 880, 1300, 880, 'b'],
        [1300, 705, 1300, 880, 'b'],
        [1395, 628, 1395, 705, 'b'],
        [1395, 880, 1395, 960, 'b'],
        [1195, 1040, 1745, 1042, 'g'],
        [820, 1038, 1195, 1038, 'b'],
        [1195, 1038, 1195, 1185, 'b'],
        [1195, 1185, 820, 1185, 'b'],
        [820, 1038, 820, 1185, 'b'],
        [935, 1040, 935, 1180, 'b'],
        [1435, 1042, 1435, 1338, 'b']
      ]
    },
    {
      id: 'openplan',
      name: 'Open-plan office',
      label: 'Open-plan office (6 APs)',
      widthM: 48,
      bpx: 1500,
      outline: [
        [200, 260],
        [1700, 260],
        [1700, 1300],
        [200, 1300]
      ],
      aps: [
        [330, 700],
        [650, 1120],
        [1100, 1150],
        [1050, 640],
        [1500, 700],
        [650, 370]
      ],
      walls: [
        [200, 260, 1700, 260, 'b'],
        [1700, 260, 1700, 1300, 'b'],
        [1700, 1300, 200, 1300, 'b'],
        [200, 1300, 200, 260, 'b'],
        // core: stairs, lift, toilets
        [760, 600, 940, 600, 'b'],
        [940, 600, 940, 960, 'b'],
        [940, 960, 760, 960, 'b'],
        [760, 960, 760, 600, 'b'],
        [760, 780, 940, 780, 'b'],
        [500, 260, 500, 470, 'g'],
        [800, 260, 800, 470, 'g'],
        [1100, 260, 1100, 470, 'g'],
        [1400, 260, 1400, 470, 'g'],
        [200, 470, 430, 470, 'g'],
        [470, 470, 730, 470, 'g'],
        [770, 470, 1030, 470, 'g'],
        [1070, 470, 1330, 470, 'g'],
        [1370, 470, 1630, 470, 'g'],
        [1670, 470, 1700, 470, 'g'],
        [1150, 820, 1300, 820, 'g'],
        [1300, 820, 1300, 950, 'g'],
        [1300, 950, 1150, 950, 'g'],
        [1150, 950, 1150, 820, 'g'],
        [480, 820, 630, 820, 'g'],
        [630, 820, 630, 950, 'g'],
        [630, 950, 480, 950, 'g'],
        [480, 950, 480, 820, 'g'],
        [420, 1080, 420, 1200, 'c'],
        [420, 1240, 420, 1300, 'c'],
        [200, 1080, 420, 1080, 'c'],
        [1480, 1080, 1480, 1200, 'c'],
        [1480, 1240, 1480, 1300, 'c'],
        [1480, 1080, 1700, 1080, 'c']
      ]
    },
    {
      id: 'house',
      name: 'House',
      label: 'House (ground floor, 3 APs)',
      widthM: 12,
      bpx: 1100,
      outline: [
        [400, 330],
        [1500, 330],
        [1500, 1170],
        [400, 1170]
      ],
      aps: [
        [890, 560],
        [620, 950],
        [1260, 830]
      ],
      walls: [
        [400, 330, 480, 330, 'b'],
        [480, 330, 680, 330, 'g'],
        [680, 330, 1500, 330, 'b'],
        [1500, 330, 1500, 1170, 'b'],
        [1500, 1170, 1050, 1170, 'b'],
        [1050, 1170, 650, 1170, 'g'],
        [650, 1170, 400, 1170, 'b'],
        [400, 1170, 400, 330, 'b'],
        [760, 330, 760, 520, 'c'],
        [760, 600, 760, 700, 'c'],
        [1020, 330, 1020, 520, 'c'],
        [1020, 600, 1020, 700, 'c'],
        [400, 700, 520, 700, 'c'],
        [900, 700, 1500, 700, 'c'],
        [620, 700, 780, 700, 'g'],
        [1020, 700, 1020, 800, 'c'],
        [1020, 880, 1020, 1170, 'c'],
        [1020, 960, 1100, 960, 'c'],
        [1160, 960, 1500, 960, 'c'],
        [1260, 960, 1260, 1170, 'c']
      ]
    },
    {
      id: 'practice',
      name: 'Medical practice',
      label: 'Medical practice (3 APs)',
      widthM: 20,
      bpx: 1200,
      outline: [
        [300, 420],
        [1500, 420],
        [1500, 1140],
        [300, 1140]
      ],
      aps: [
        [430, 780],
        [860, 780],
        [1250, 780]
      ],
      walls: [
        [300, 420, 1500, 420, 'b'],
        [1500, 420, 1500, 1140, 'b'],
        [1500, 1140, 300, 1140, 'b'],
        [300, 1140, 300, 420, 'b'],
        [300, 700, 470, 700, 'g'],
        [560, 700, 720, 700, 'g'],
        [800, 700, 980, 700, 'g'],
        [980, 700, 1060, 700, 'c'],
        [1130, 700, 1320, 700, 'c'],
        [1390, 700, 1500, 700, 'c'],
        [560, 420, 560, 700, 'c'],
        [980, 420, 980, 700, 'c'],
        [1240, 420, 1240, 700, 'c'],
        // X-ray room, thick walls
        [300, 860, 360, 860, 'c'],
        [430, 860, 560, 860, 'c'],
        [560, 860, 620, 860, 'b'],
        [690, 860, 820, 860, 'b'],
        [820, 860, 880, 860, 'c'],
        [950, 860, 1150, 860, 'c'],
        [1220, 860, 1340, 860, 'c'],
        [1400, 860, 1500, 860, 'c'],
        [560, 860, 560, 1140, 'b'],
        [820, 860, 820, 1140, 'b'],
        [1080, 860, 1080, 1140, 'c'],
        [1290, 860, 1290, 1140, 'c']
      ]
    },
    {
      id: 'school',
      name: 'School',
      label: 'School (ground floor, 6 APs)',
      widthM: 60,
      bpx: 1540,
      outline: [
        [180, 440],
        [1720, 440],
        [1720, 1120],
        [180, 1120]
      ],
      aps: [
        [410, 790],
        [780, 790],
        [1150, 790],
        [1500, 790],
        [870, 980],
        [1520, 590]
      ],
      walls: [
        [180, 440, 1720, 440, 'b'],
        [1720, 440, 1720, 1120, 'b'],
        [1720, 1120, 1100, 1120, 'b'],
        [640, 1120, 180, 1120, 'b'],
        [180, 1120, 180, 440, 'b'],
        [640, 1120, 1100, 1120, 'g'],
        [410, 440, 410, 740, 'b'],
        [640, 440, 640, 740, 'b'],
        [870, 440, 870, 740, 'b'],
        [1100, 440, 1100, 740, 'b'],
        [1330, 440, 1330, 740, 'b'],
        [410, 840, 410, 1120, 'b'],
        [640, 840, 640, 1120, 'b'],
        [1100, 840, 1100, 1120, 'b'],
        [1330, 840, 1330, 1120, 'b'],
        [180, 740, 210, 740, 'c'],
        [280, 740, 440, 740, 'c'],
        [510, 740, 670, 740, 'c'],
        [740, 740, 900, 740, 'c'],
        [970, 740, 1130, 740, 'c'],
        [1200, 740, 1360, 740, 'c'],
        [1430, 740, 1720, 740, 'c'],
        [180, 840, 210, 840, 'c'],
        [280, 840, 440, 840, 'c'],
        [510, 840, 640, 840, 'c'],
        [640, 840, 760, 840, 'g'],
        [980, 840, 1100, 840, 'g'],
        [1100, 840, 1130, 840, 'c'],
        [1200, 840, 1360, 840, 'c'],
        [1430, 840, 1720, 840, 'c']
      ]
    }
  ];

  // furniture/devices per plan: [type, x, y, rotation, mode]
  var ITEMDEFS = {};
  ITEMDEFS.office = [
    ['router', 1060, 1250],
    ['desk', 240, 400],
    ['desk', 406, 330],
    ['desk', 568, 330],
    ['desk', 730, 330],
    ['desk', 889, 330],
    ['desk', 1046, 330],
    ['desk', 1180, 330],
    ['desk', 1285, 330],
    ['desk', 1446, 330],
    ['conf', 1660, 330],
    ['conf', 700, 705],
    ['conf', 1570, 790],
    ['desk', 300, 730],
    ['desk', 300, 960],
    ['desk', 595, 1230],
    ['desk', 750, 1230],
    ['desk', 970, 1250],
    ['cabinet', 215, 1190],
    ['pc', 406, 330, 0, 'lan'],
    ['pc', 568, 330],
    ['pc', 730, 330, 0, 'lan'],
    ['pc', 889, 330],
    ['pc', 1046, 330, 0, 'lan'],
    ['pc', 1180, 330],
    ['pc', 1446, 330],
    ['laptop', 1285, 330],
    ['pc', 300, 730, 0, 'lan'],
    ['pc', 300, 960],
    ['pc', 595, 1230],
    ['pc', 750, 1230, 0, 'lan'],
    ['phone', 240, 400],
    ['phone', 970, 1250],
    ['laptop', 700, 705],
    ['laptop', 1500, 750],
    ['laptop', 1640, 750],
    ['laptop', 1500, 845],
    ['laptop', 1640, 845],
    ['tv', 1715, 790],
    ['printer', 1250, 800, 0, 'lan'],
    ['camera', 1000, 1305],
    ['camera', 1000, 585]
  ];
  ITEMDEFS.openplan = (function () {
    var a = [['router', 310, 1190]];
    [350, 650, 950, 1250, 1550].forEach(function (x) {
      a.push(['conf', x, 365]);
    });
    var r1 = [260, 420, 580, 1040, 1200, 1360, 1520],
      r2 = [540, 700, 1040, 1200, 1360];
    r1.forEach(function (x, i) {
      a.push(['desk', x, 580]);
      a.push(['pc', x, 580, 0, i % 2 === 0 ? 'lan' : 'wlan']);
    });
    r2.forEach(function (x, i) {
      a.push(['desk', x, 1040]);
      a.push(['pc', x, 1040, 0, i % 2 === 1 ? 'lan' : 'wlan']);
    });
    a.push(['cabinet', 1560, 1160], ['cabinet', 1640, 1160], ['cabinet', 1560, 1260], ['sofa', 1500, 960]);
    a.push(['laptop', 350, 365], ['laptop', 950, 365], ['laptop', 1550, 365], ['tv', 1250, 300]);
    a.push(
      ['printer', 700, 680, 0, 'lan'],
      ['printer', 1620, 900],
      ['camera', 230, 290],
      ['camera', 1000, 1280],
      ['phone', 1000, 1000]
    );
    return a;
  })();
  ITEMDEFS.house = [
    ['router', 940, 380],
    ['desk', 580, 500],
    ['sofa', 700, 1110],
    ['desk', 700, 930],
    ['desk', 1260, 430],
    ['cabinet', 1440, 640],
    ['cabinet', 1440, 1100],
    ['pc', 1260, 430, 0, 'lan'],
    ['printer', 1440, 380, 0, 'lan'],
    ['laptop', 700, 930],
    ['laptop', 1300, 830],
    ['tv', 445, 900],
    ['phone', 800, 440],
    ['camera', 500, 1140]
  ];
  ITEMDEFS.practice = [
    ['router', 480, 1090],
    ['desk', 430, 520],
    ['desk', 1110, 520],
    ['desk', 1370, 520],
    ['desk', 430, 980],
    ['desk', 690, 1000],
    ['desk', 950, 980],
    ['desk', 1190, 980],
    ['desk', 780, 520],
    ['sofa', 640, 650],
    ['sofa', 760, 650],
    ['sofa', 880, 650],
    ['cabinet', 330, 1100],
    ['cabinet', 1020, 1100],
    ['pc', 430, 520, 0, 'lan'],
    ['pc', 1110, 520, 0, 'lan'],
    ['pc', 1370, 520, 0, 'lan'],
    ['pc', 430, 980, 0, 'lan'],
    ['pc', 690, 1000, 0, 'lan'],
    ['pc', 950, 980, 0, 'lan'],
    ['pc', 1190, 980, 0, 'lan'],
    ['printer', 330, 470, 0, 'lan'],
    ['printer', 1000, 830],
    ['phone', 500, 560],
    ['tv', 770, 445],
    ['laptop', 800, 540],
    ['camera', 310, 790],
    ['camera', 1480, 780]
  ];
  ITEMDEFS.school = (function () {
    var a = [['router', 1670, 680]];
    [180, 410, 640, 870, 1100].forEach(function (x0, i) {
      a.push(['desk', x0 + 115, 480], ['pc', x0 + 115, 480, 0, 'lan']);
      [570, 650].forEach(function (y) {
        [70, 160].forEach(function (dx) {
          a.push(['desk', x0 + dx, y]);
        });
      });
      if (i % 2 === 0) a.push(['tv', x0 + 205, 600]);
    });
    [180, 410].forEach(function (x0) {
      a.push(['desk', x0 + 115, 1075], ['pc', x0 + 115, 1075, 0, 'lan']);
      [900, 980].forEach(function (y) {
        [70, 160].forEach(function (dx) {
          a.push(['desk', x0 + dx, y]);
        });
      });
    });
    a.push(
      ['conf', 1520, 560],
      ['laptop', 1450, 560],
      ['laptop', 1590, 560],
      ['printer', 1690, 500, 0, 'lan']
    );
    a.push(
      ['cabinet', 1400, 1090],
      ['cabinet', 1470, 1090],
      ['cabinet', 1540, 1090],
      ['desk', 1450, 950],
      ['desk', 1600, 950],
      ['laptop', 1450, 950]
    );
    a.push(
      ['sofa', 760, 1050],
      ['sofa', 900, 1050],
      ['tv', 870, 890],
      ['camera', 870, 1085],
      ['camera', 260, 790],
      ['camera', 1650, 790]
    );
    return a;
  })();
  PLANS.forEach(function (p) {
    p.items = ITEMDEFS[p.id] || [];
  });

  // tx/gtx in dBm/dBi, nf and gap in dB, bw in MHz per band
  var params = {
    tx: 14,
    gtx: 3,
    nf: 7,
    gap: 0,
    bw: [20, 80, 160],
    n: 2.6,
    width: 40,
    loss: [3, 12, 15, 4, 30],
    band: 0,
    view: 'sig',
    prof: 1,
    slab: 18
  };
  // good/ok thresholds in dBm
  var PROFILES = [
    { name: 'Requirement: basic (browsing, e-mail)', good: -72, ok: -80 },
    { name: 'Requirement: office (data, cloud)', good: -67, ok: -75 },
    { name: 'Requirement: voice & video', good: -65, ok: -70 }
  ];
  var VIEWS = { sig: 1, zone: 1, sinr: 1, rate: 1, count: 1 };
  var lineIdx = 2;

  var plan = null,
    nW = 0,
    S = null;
  var wx1, wy1, wx2, wy2, bx1, bx2, by1, by2, wt;
  var aps = [],
    grids = [],
    counts = [],
    dist = [],
    apEls = [];
  var saved = {};

  // storage
  var KEY = 'wifi-planner-v1',
    startPlan = 'office',
    saveTimer = null;
  (function restore() {
    var s = null;
    try {
      s = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    if (!s || s.v !== 1) return;
    if (Array.isArray(s.customs))
      s.customs.forEach(function (p) {
        if (p && p.id && Array.isArray(p.outline) && Array.isArray(p.walls) && Array.isArray(p.aps)) {
          p.custom = true;
          p.items = Array.isArray(p.items) ? p.items : [];
          PLANS.push(p);
        }
      });
    PLANS.forEach(function (p) {
      var S0 = s.saved && s.saved[p.id];
      if (S0 && Array.isArray(S0.aps) && Array.isArray(S0.items)) {
        S0.aps.forEach(function (ap, k) {
          if (!Array.isArray(ap.ch)) ap.ch = defCh(k);
        });
        S0.items = S0.items.filter(function (it) {
          return ITEMS[it.t];
        });
        if (S0.walls && !Array.isArray(S0.walls)) delete S0.walls;
        if (S0.rects && !Array.isArray(S0.rects)) delete S0.rects;
        saved[p.id] = S0;
      }
      if (s.widths && s.widths[p.id]) p.width = +s.widths[p.id];
      if (p.id === s.plan) startPlan = p.id;
    });
    if (s.params) {
      ['tx', 'gtx', 'nf', 'gap', 'n', 'slab'].forEach(function (k) {
        if (typeof s.params[k] === 'number') params[k] = s.params[k];
      });
      if (typeof s.params.gtx !== 'number') params.gtx = 0; // old saves stored EIRP in tx
      if (
        Array.isArray(s.params.bw) &&
        s.params.bw.length === 3 &&
        s.params.bw.every(function (v) {
          return PHYMAX[v];
        })
      )
        params.bw = s.params.bw.slice();
      if (Array.isArray(s.params.loss) && s.params.loss.length >= 3)
        params.loss = params.loss.map(function (d, i) {
          var v = +s.params.loss[i];
          return isNaN(v) ? d : v;
        });
      if (BANDS[s.params.band]) params.band = s.params.band;
      if (VIEWS[s.params.view]) params.view = s.params.view;
      if (PROFILES[s.params.prof]) params.prof = s.params.prof;
    }
    if (LINES[s.line]) lineIdx = s.line;
    $('pTx').value = params.tx;
    $('pN').value = params.n;
    $('pSlab').value = params.slab;
    $('pGtx').value = params.gtx;
    $('pNf').value = params.nf;
    $('pGap').value = params.gap;
    LID.forEach(function (id, i) {
      $(id).value = params.loss[i];
    });
    [].forEach.call(document.querySelectorAll('#bandSeg button'), function (b) {
      b.setAttribute('aria-checked', +b.getAttribute('data-band') === params.band ? 'true' : 'false');
    });
  })();
  function stateData() {
    var widths = {};
    PLANS.forEach(function (p) {
      if (p.width) widths[p.id] = p.width;
    });
    var customs = PLANS.filter(function (p) {
      return p.custom;
    }).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        label: p.label,
        tag: p.tag,
        widthM: p.widthM,
        bpx: p.bpx,
        outline: p.outline,
        zones: p.zones,
        aps: p.aps,
        walls: p.walls,
        items: p.items,
        bg: p.bg
      };
    });
    return {
      v: 1,
      plan: plan.id,
      line: lineIdx,
      widths: widths,
      params: {
        tx: params.tx,
        n: params.n,
        loss: params.loss,
        band: params.band,
        view: params.view,
        prof: params.prof,
        slab: params.slab,
        gtx: params.gtx,
        nf: params.nf,
        gap: params.gap,
        bw: params.bw
      },
      saved: saved,
      customs: customs
    };
  }
  function storeData(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // quota exceeded: retry without background images
      var d2 = {};
      for (var k in data) d2[k] = data[k];
      d2.customs = (data.customs || []).map(function (c) {
        var o = {};
        for (var k in c) if (k !== 'bg') o[k] = c[k];
        return o;
      });
      try {
        localStorage.setItem(KEY, JSON.stringify(d2));
      } catch (e2) {}
      return false;
    }
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      histTick();
      storeData(stateData());
    }, 300);
  }

  // undo / redo
  // a snapshot is taken 300 ms after the last change, so one drag = one step
  var hist = { plan: null, cur: null, undo: [], redo: [] };
  function snap() {
    return JSON.stringify({
      aps: S.aps,
      items: S.items,
      walls: S.walls || null,
      rects: S.rects || null,
      cnt: S.cnt,
      next: S.next
    });
  }
  function histTick() {
    var s = snap();
    if (hist.plan !== plan.id) {
      hist = { plan: plan.id, cur: s, undo: [], redo: [] };
    } else if (s !== hist.cur) {
      hist.undo.push(hist.cur);
      if (hist.undo.length > 100) hist.undo.shift();
      hist.cur = s;
      hist.redo = [];
    }
    histButtons();
  }
  function histGo(from, to) {
    clearTimeout(saveTimer);
    histTick();
    if (!from.length) return;
    to.push(hist.cur);
    hist.cur = from.pop();
    var d = JSON.parse(hist.cur);
    S.aps = d.aps;
    S.items = d.items;
    S.cnt = d.cnt;
    S.next = d.next;
    if (d.walls) S.walls = d.walls;
    else delete S.walls;
    if (d.rects) S.rects = d.rects;
    else delete S.rects;
    loadPlan(plan.id);
    histButtons();
  }
  function histButtons() {
    $('undoBtn').disabled = !hist.undo.length;
    $('redoBtn').disabled = !hist.redo.length;
  }
  $('undoBtn').addEventListener('click', function () {
    histGo(hist.undo, hist.redo);
  });
  $('redoBtn').addEventListener('click', function () {
    histGo(hist.redo, hist.undo);
  });
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      histGo(hist.undo, hist.redo);
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      histGo(hist.redo, hist.undo);
    }
  });

  // project file
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
  }
  function fileStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  $('projSave').addEventListener('click', function () {
    var d = stateData();
    d.app = 'wifi-planner';
    download(
      'WiFi project ' + fileStamp() + '.json',
      new Blob([JSON.stringify(d)], { type: 'application/json' })
    );
  });
  $('projOpen').addEventListener('click', function () {
    $('projFile').value = '';
    $('projFile').click();
  });
  $('projFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then(function (t) {
      var d = null;
      try {
        d = JSON.parse(t);
      } catch (err) {}
      if (!d || d.v !== 1 || typeof d.saved !== 'object') {
        alert('This is not a valid project file.');
        return;
      }
      if (
        !confirm(
          'Load project "' +
            f.name +
            '"? This replaces what is stored in the browser. Save the current one first if you still need it.'
        )
      )
        return;
      clearTimeout(saveTimer);
      if (!storeData(d))
        alert('The project is too large for browser storage and is loaded without background images.');
      location.reload();
    });
  });

  var THEMES = ['auto', 'light', 'dark'],
    THEME_NAME = { auto: 'Auto', light: 'Light', dark: 'Dark' },
    theme = 'auto';
  try {
    theme = localStorage.getItem(KEY + '-theme') || 'auto';
  } catch (e) {}
  function applyTheme() {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    $('themeBtn').textContent = 'Theme: ' + THEME_NAME[theme];
  }
  $('themeBtn').addEventListener('click', function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
    applyTheme();
    try {
      localStorage.setItem(KEY + '-theme', theme);
    } catch (e) {}
  });
  applyTheme();

  var items = [],
    itemEls = {},
    sel = null,
    net = { list: [], byId: {} };
  var mask = new Uint8Array(GW * GH),
    outM = new Uint8Array(GW * GH),
    inside = 1,
    outside = 0;
  var best = new Float32Array(GW * GH),
    bestAp = new Int8Array(GW * GH);
  var shareArr = [],
    clients = [];

  function inPolyArr(o, x, y) {
    var c = false;
    for (var i = 0, j = o.length - 1; i < o.length; j = i++) {
      var xi = o[i][0],
        yi = o[i][1],
        xj = o[j][0],
        yj = o[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  // 'in', 'out' (balcony etc.) or 'none'. Drawn rectangles win, then zones, then the outline.
  function cls(x, y) {
    var R = S && S.rects,
      i;
    if (R)
      for (i = R.length - 1; i >= 0; i--) {
        var r = R[i];
        if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return r.t === 'cut' ? 'none' : r.t;
      }
    var Z = plan.zones;
    if (Z)
      for (i = 0; i < Z.length; i++) if (inPolyArr(Z[i].poly, x, y)) return Z[i].t === 'in' ? 'in' : 'out';
    return inPolyArr(plan.outline, x, y) ? 'in' : 'none';
  }
  function inPoly(x, y) {
    return cls(x, y) !== 'none';
  }
  function rebuildMask() {
    inside = 0;
    outside = 0;
    for (var j = 0; j < GH; j++) {
      for (var i = 0; i < GW; i++) {
        var c = cls(VX + (i + 0.5) * CELL, VY + (j + 0.5) * CELL),
          idx = j * GW + i;
        mask[idx] = c !== 'none' ? 1 : 0;
        outM[idx] = c === 'out' ? 1 : 0;
        if (c === 'in') inside++;
        else if (c === 'out') outside++;
      }
    }
    if (!inside) inside = 1;
    drawFloor();
  }
  function drawFloor() {
    var fl = $('floor'),
      zg = $('zoneG');
    [].slice.call(fl.querySelectorAll('.fx')).forEach(function (n) {
      n.remove();
    });
    zg.innerHTML = '';
    function shape(par, cls2, pts, extra) {
      var el = document.createElementNS(NS, 'polygon');
      el.setAttribute('class', cls2);
      el.setAttribute(
        'points',
        pts
          .map(function (p) {
            return p.join(',');
          })
          .join(' ')
      );
      if (extra) el.setAttribute('style', extra);
      par.appendChild(el);
    }
    function rectPts(r) {
      return [
        [r.x1, r.y1],
        [r.x2, r.y1],
        [r.x2, r.y2],
        [r.x1, r.y2]
      ];
    }
    (plan.zones || []).forEach(function (z) {
      shape(fl, 'fx', z.poly, 'fill:var(--plan)');
      if (z.t !== 'in') shape(zg, 'zout', z.poly);
    });
    (S.rects || []).forEach(function (r) {
      shape(fl, 'fx', rectPts(r), 'fill:' + (r.t === 'cut' ? 'var(--plan-out)' : 'var(--plan)'));
      if (r.t === 'out') shape(zg, 'zout', rectPts(r));
    });
    var nz = (plan.zones || []).filter(function (z) {
        return z.t !== 'in';
      }).length,
      nr = (S.rects || []).length;
    $('zoneInfo').textContent =
      'Outline with ' +
      plan.outline.length +
      ' corners' +
      (nz ? ', ' + nz + ' detected outdoor area' + (nz === 1 ? '' : 's') : '') +
      (nr ? ', ' + nr + ' own rectangle' + (nr === 1 ? '' : 's') : '') +
      '. Outdoor areas (hatched) are counted separately.';
  }

  function cross(ax, ay, bx, by, cx, cy, dx, dy) {
    var d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    var d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    var d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    var d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
  }

  // wall counts per type between AP and every cell; only needed again when the AP moves
  function computeCounts(k) {
    var ap = aps[k],
      cs = counts[k],
      ds = dist[k],
      ax = ap.x,
      ay = ap.y;
    for (var j = 0; j < GH; j++) {
      var y = VY + (j + 0.5) * CELL;
      for (var i = 0; i < GW; i++) {
        var idx = j * GW + i;
        if (!mask[idx]) {
          for (var t0 = 0; t0 < NT; t0++) cs[t0][idx] = 0;
          ds[idx] = 1;
          continue;
        }
        var x = VX + (i + 0.5) * CELL;
        ds[idx] = Math.sqrt((x - ax) * (x - ax) + (y - ay) * (y - ay));
        var minx = ax < x ? ax : x,
          maxx = ax < x ? x : ax,
          miny = ay < y ? ay : y,
          maxy = ay < y ? y : ay;
        var c0 = 0,
          c1 = 0,
          c2 = 0,
          c3 = 0,
          c4 = 0;
        for (var w = 0; w < nW; w++) {
          if (bx2[w] < minx || bx1[w] > maxx || by2[w] < miny || by1[w] > maxy) continue;
          if (cross(ax, ay, x, y, wx1[w], wy1[w], wx2[w], wy2[w])) {
            switch (wt[w]) {
              case 0:
                c0++;
                break;
              case 1:
                c1++;
                break;
              case 2:
                c2++;
                break;
              case 3:
                c3++;
                break;
              default:
                c4++;
            }
          }
        }
        cs[0][idx] = c0;
        cs[1][idx] = c1;
        cs[2][idx] = c2;
        cs[3][idx] = c3;
        cs[4][idx] = c4;
      }
    }
  }

  // adj: dB relative to the power slider, bh: throughput factor for mesh backhaul
  var APMODELS = {
    std: { name: 'Standard AP', adj: 0, streams: 2, bands: [0, 1, 2] },
    router: { name: 'Wi-Fi router (Wi-Fi 5)', adj: -1, streams: 2, bands: [0, 1] },
    ceil6: { name: 'Ceiling AP Wi-Fi 6', adj: 2, streams: 2, bands: [0, 1] },
    ceil7: { name: 'Ceiling AP Wi-Fi 6E/7', adj: 3, streams: 4, bands: [0, 1, 2] },
    mesh: { name: 'Mesh repeater', adj: -3, streams: 2, bands: [0, 1], bh: 0.5 },
    outdoor: { name: 'Outdoor AP', adj: 5, streams: 2, bands: [0, 1] }
  };
  function apModel(ap) {
    return APMODELS[ap.model] || APMODELS.std;
  }
  function apAdj(ap, b) {
    var m = apModel(ap);
    return m.bands.indexOf(b) < 0 ? null : m.adj;
  }
  function apName(ap, k) {
    return ap.name || 'AP ' + (k + 1);
  }

  // floors
  // APs of other floors (same building name) reach through the ceilings.
  // Their walls are ignored, only ceilings and 3 m per floor.
  var foreign = [],
    fgrids = [],
    LVLS = [
      [-1, 'Basement'],
      [0, 'Ground floor'],
      [1, '1st floor'],
      [2, '2nd floor'],
      [3, '3rd floor']
    ];
  function lvlName(l) {
    var r = LVLS.filter(function (x) {
      return x[0] === l;
    })[0];
    return r ? r[1] : 'Floor ' + l;
  }
  function foreignSig(ap, adj, bd, dxy) {
    var dz = ap.dl * 3,
      d = Math.sqrt(dxy * dxy + dz * dz);
    if (d < 1) d = 1;
    return linkBudget(
      params.tx + adj,
      params.gtx,
      multiWall(bd.l0, params.n, d, ap.dl * params.slab * bd.f),
      0
    );
  }
  function apAt(k) {
    return k < aps.length ? aps[k] : foreign[k - aps.length];
  }
  function apLabel(k) {
    return k < aps.length ? apName(aps[k], k) : foreign[k - aps.length].name;
  }
  function buildForeign() {
    foreign = [];
    fgrids = [];
    var info = [],
      fG = $('fapG');
    fG.innerHTML = '';
    if (S.bld) {
      PLANS.forEach(function (p) {
        var S2 = saved[p.id];
        if (p.id === plan.id || !S2 || S2.bld !== S.bld || (S2.lvl || 0) === (S.lvl || 0)) return;
        var dl = Math.abs((S2.lvl || 0) - (S.lvl || 0)),
          n = 0;
        S2.aps.forEach(function (ap, k) {
          if (!ap.on) return;
          n++;
          foreign.push({
            x: ap.x,
            y: ap.y,
            on: true,
            ch: ap.ch,
            model: ap.model,
            foreign: true,
            dl: dl,
            name: lvlName(S2.lvl || 0) + ', ' + apName(ap, k)
          });
        });
        info.push(lvlName(S2.lvl || 0) + ' "' + p.name + '" (' + n + ' AP' + (n === 1 ? '' : 's') + ')');
      });
    }
    var mpp = params.width / plan.bpx,
      bd = BANDS[params.band];
    foreign.forEach(function (ap) {
      var g = new Float32Array(GW * GH),
        adj = apAdj(ap, params.band);
      for (var j = 0; j < GH; j++) {
        var y = VY + (j + 0.5) * CELL;
        for (var i = 0; i < GW; i++) {
          var idx = j * GW + i;
          if (!mask[idx] || adj === null) {
            g[idx] = -130;
            continue;
          }
          var x = VX + (i + 0.5) * CELL;
          g[idx] = foreignSig(
            ap,
            adj,
            bd,
            Math.sqrt((x - ap.x) * (x - ap.x) + (y - ap.y) * (y - ap.y)) * mpp
          );
        }
      }
      fgrids.push(g);
      var m = document.createElementNS(NS, 'g');
      m.setAttribute('transform', 'translate(' + ap.x + ' ' + ap.y + ')');
      m.innerHTML =
        '<title>' +
        esc(ap.name) +
        ' (other floor)</title><circle r="' +
        22 * plan.is +
        '"/><text font-size="' +
        12 * plan.is +
        '">' +
        esc(ap.name.split(', ')[0].split(' ')[0]) +
        '</text>';
      fG.appendChild(m);
    });
    $('flInfo').textContent = !S.bld
      ? 'Give several plans the same building name to stack them as floors. Their extent and scale must match.'
      : info.length
        ? 'Signal from: ' + info.join(', ') + '. Their APs are shown as dashed circles.'
        : 'No other floor with the building name "' + S.bld + '" yet.';
  }

  function derive(k) {
    var g = grids[k],
      cs = counts[k],
      ds = dist[k],
      mpp = params.width / plan.bpx,
      bd = BANDS[params.band];
    var adj = apAdj(aps[k], params.band);
    if (adj === null) {
      g.fill(-130);
      return;
    }
    var base = params.tx + params.gtx - bd.l0 + adj,
      ex = 10 * params.n; // 0 dBi probe
    var l0 = params.loss[0] * bd.f,
      l1 = params.loss[1] * bd.f,
      l2 = params.loss[2] * bd.f,
      l3 = params.loss[3] * bd.f,
      l4 = params.loss[4] * bd.f;
    for (var idx = 0; idx < GW * GH; idx++) {
      if (!mask[idx]) {
        g[idx] = -130;
        continue;
      }
      var d = ds[idx] * mpp;
      if (d < 1) d = 1;
      g[idx] =
        base -
        ex * Math.log10(d) -
        (cs[0][idx] * l0 + cs[1][idx] * l1 + cs[2][idx] * l2 + cs[3][idx] * l3 + cs[4][idx] * l4);
    }
  }

  function sigAt(ap, x, y, b) {
    var adj = apAdj(ap, b);
    if (adj === null) return -200;
    var bd = BANDS[b],
      mpp = params.width / plan.bpx;
    if (ap.foreign)
      return foreignSig(ap, adj, bd, Math.sqrt((x - ap.x) * (x - ap.x) + (y - ap.y) * (y - ap.y)) * mpp);
    var d = Math.sqrt((x - ap.x) * (x - ap.x) + (y - ap.y) * (y - ap.y)) * mpp;
    if (d < 1) d = 1;
    var minx = ap.x < x ? ap.x : x,
      maxx = ap.x < x ? x : ap.x,
      miny = ap.y < y ? ap.y : y,
      maxy = ap.y < y ? y : ap.y,
      l = 0;
    for (var w = 0; w < nW; w++) {
      if (bx2[w] < minx || bx1[w] > maxx || by2[w] < miny || by1[w] > maxy) continue;
      if (cross(ap.x, ap.y, x, y, wx1[w], wy1[w], wx2[w], wy2[w])) l += params.loss[wt[w]] * bd.f;
    }
    return linkBudget(params.tx + adj, params.gtx, multiWall(bd.l0, params.n, d, l), 0);
  }

  var STOPS = [
    [-100, 214, 69, 65, 0.7],
    [-90, 232, 120, 52, 0.8],
    [-78, 245, 200, 60, 0.84],
    [-67, 190, 221, 86, 0.86],
    [-57, 92, 198, 106, 0.88],
    [-45, 22, 150, 84, 0.9]
  ];
  var LUT = new Uint8ClampedArray(256 * 4);
  (function () {
    for (var t = 0; t < 256; t++) {
      var v = -100 + (t / 255) * 65,
        k = 0;
      while (k < STOPS.length - 2 && v > STOPS[k + 1][0]) k++;
      var a = STOPS[k],
        b = STOPS[k + 1],
        f = Math.max(0, Math.min(1, (v - a[0]) / (b[0] - a[0])));
      for (var c = 0; c < 3; c++) LUT[t * 4 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
      LUT[t * 4 + 3] = 255 * (a[4] + (b[4] - a[4]) * f);
    }
    var css = STOPS.map(function (s) {
      return (
        'rgba(' +
        s[1] +
        ',' +
        s[2] +
        ',' +
        s[3] +
        ',' +
        s[4] +
        ') ' +
        Math.round(((s[0] + 100) / 65) * 100) +
        '%'
      );
    }).join(',');
    $('bar').style.background = 'linear-gradient(90deg,' + css + ')';
  })();

  var canvas = $('heat');
  canvas.width = GW;
  canvas.height = GH;
  var ctx = canvas.getContext('2d'),
    img = ctx.createImageData(GW, GH);

  function renderShare() {
    aps.forEach(function (_, k) {
      var el = $('share' + k);
      if (!el) return;
      var c = clients[k] || 0;
      el.textContent = c + (c === 1 ? ' device' : ' devices') + ', ' + (shareArr[k] || 0) + ' %';
    });
  }

  var ZONEC = [
    [67, 56, 202],
    [217, 119, 6],
    [13, 148, 136],
    [219, 39, 119],
    [37, 99, 235],
    [101, 163, 13],
    [147, 51, 234],
    [220, 38, 38]
  ];
  var sinrArr = new Float32Array(GW * GH),
    rateArr = new Float32Array(GW * GH),
    cntArr = new Uint8Array(GW * GH);
  // interferers
  // treated like an AP with its own power; grids are cached
  function noiseSrc(b) {
    var out = [];
    items.forEach(function (it) {
      var def = ITEMS[it.t];
      if (def.kind !== 'n' || def.bands.indexOf(b) < 0) return;
      var p = { x: it.x, y: it.y },
        off = def.tx - params.tx - params.gtx;
      out.push({
        it: it,
        wide: !!def.wide,
        ch: def.wide ? -1 : it.ch ? it.ch[b] : [1, 0, 0][b],
        at: function (x, y) {
          return sigAt(p, x, y, b) + off;
        }
      });
    });
    return out;
  }
  var nsCache = { key: '', list: [] };
  function noiseGrids(b) {
    var src = noiseSrc(b);
    var key = JSON.stringify([
      b,
      params.tx,
      params.n,
      params.loss,
      params.width,
      nW,
      plan.id,
      src.map(function (s) {
        return [s.it.x, s.it.y, s.ch, s.it.t];
      })
    ]);
    if (key === nsCache.key) return nsCache.list;
    nsCache = {
      key: key,
      list: src.map(function (s) {
        var g = new Float32Array(GW * GH);
        for (var j = 0; j < GH; j++) {
          var y = VY + (j + 0.5) * CELL;
          for (var i = 0; i < GW; i++) {
            var idx = j * GW + i;
            g[idx] = mask[idx] ? s.at(VX + (i + 0.5) * CELL, y) : -200;
          }
        }
        return { wide: s.wide, ch: s.ch, g: g };
      })
    };
    return nsCache.list;
  }

  function combine() {
    var good = 0,
      ok = 0,
      bad = 0,
      oGood = 0,
      share = aps.map(function () {
        return 0;
      });
    var data = img.data,
      b = params.band,
      pf = PROFILES[params.prof],
      view = params.view,
      NSRC = noiseGrids(b);
    var noise = Math.pow(10, noiseDbm(params.bw[b], params.nf) / 10),
      nA = aps.length,
      nF = fgrids.length,
      rmax = PHYMAX[params.bw[b]] * 2;
    // k < nA: own APs, above that: APs from other floors
    var G = grids.concat(fgrids),
      on = aps
        .map(function (ap) {
          return ap.on;
        })
        .concat(
          foreign.map(function () {
            return true;
          })
        );
    var ch = aps.concat(foreign).map(function (ap) {
        return ap.ch[b];
      }),
      nT = nA + nF;
    for (var idx = 0; idx < GW * GH; idx++) {
      if (!mask[idx]) {
        data[idx * 4 + 3] = 0;
        best[idx] = -130;
        bestAp[idx] = -1;
        continue;
      }
      var bv = -200,
        bk = -1,
        cn = 0;
      for (var k = 0; k < nT; k++) {
        if (!on[k]) continue;
        var v = G[k][idx];
        if (v > bv) {
          bv = v;
          bk = k;
        }
        if (v >= pf.good) cn++;
      }
      best[idx] = bv;
      bestAp[idx] = bk;
      cntArr[idx] = cn;
      if (bk < 0) {
        data[idx * 4 + 3] = 0;
        if (!outM[idx]) bad++;
        sinrArr[idx] = 0;
        rateArr[idx] = 0;
        continue;
      }
      var intf = 0;
      for (k = 0; k < nT; k++)
        if (k !== bk && on[k] && ch[k] === ch[bk]) intf += Math.pow(10, G[k][idx] / 10);
      for (k = 0; k < NSRC.length; k++)
        if (NSRC[k].wide || NSRC[k].ch === ch[bk]) intf += Math.pow(10, NSRC[k].g[idx] / 10);
      var sinr = bv - 10 * Math.log10(noise + intf);
      sinrArr[idx] = sinr;
      rateArr[idx] = bv < -82 ? 0 : shannonMbps(params.bw[b], sinr, 2, params.gap, rmax);
      if (bk < nA) share[bk]++;
      if (outM[idx]) {
        if (bv >= pf.good) oGood++;
      } else if (bv >= pf.good) good++;
      else if (bv >= pf.ok) ok++;
      else bad++;
      var o = idx * 4;
      if (view === 'zone') {
        var zc = bk < nA ? ZONEC[bk % ZONEC.length] : [128, 134, 131];
        data[o] = zc[0];
        data[o + 1] = zc[1];
        data[o + 2] = zc[2];
        data[o + 3] = 255 * clamp(0.25 + (bv + 90) / 50, 0.25, 0.8);
        continue;
      }
      var f =
        view === 'sinr'
          ? sinr / 40
          : view === 'rate'
            ? rateArr[idx] / rmax
            : view === 'count'
              ? Math.min(cn, 3) / 3
              : (bv + 100) / 65;
      var t = Math.round(clamp(f, 0, 1) * 255);
      data[o] = LUT[t * 4];
      data[o + 1] = LUT[t * 4 + 1];
      data[o + 2] = LUT[t * 4 + 2];
      data[o + 3] = LUT[t * 4 + 3];
    }
    ctx.putImageData(img, 0, 0);
    var u = function (v) {
      return String(v);
    };
    $('lGood').textContent = 'Good (from ' + u(pf.good) + ' dBm)';
    $('lOk').textContent = 'Fair (' + u(pf.good) + ' to ' + u(pf.ok) + ' dBm)';
    $('lBad').textContent = 'Weak (below ' + u(pf.ok) + ' dBm)';
    var lab = {
      sig: ['weak -100', '-35 dBm strong'],
      sinr: ['0 dB noisy', '40 dB clean'],
      rate: [
        '0',
        '≈ ' +
          Math.round(PHYMAX[params.bw[b]] * 2).toLocaleString('en-US') +
          ' Mbit/s (2×2, ' +
          params.bw[b] +
          ' MHz)'
      ],
      count: ['no AP', '3+ APs from ' + u(pf.good) + ' dBm']
    }[view];
    $('scaleBox').style.visibility = lab ? '' : 'hidden';
    if (lab) {
      $('scLo').textContent = lab[0];
      $('scHi').textContent = lab[1];
    }
    setStat('Good', good);
    setStat('Ok', ok);
    setStat('Bad', bad);
    $('outRow').hidden = !outside;
    if (outside) {
      var po = (100 * oGood) / outside;
      $('sOut').textContent = Math.round(po) + ' %';
      $('tOut').style.width = po + '%';
    }
    shareArr = share.map(function (s) {
      return Math.round((100 * s) / inside);
    });
    renderShare();
    function setStat(name, v) {
      var p = (100 * v) / inside;
      $('s' + name).textContent = Math.round(p) + ' %';
      $('t' + name).style.width = p + '%';
    }
  }

  // devices
  var QCOL = { good: '#2f9e5a', ok: '#e0b52c', bad: '#d9553f', none: '#8b9690', lan: '#5d7fb5' };
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function fmtMb(v) {
    return v < 10
      ? v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : Math.round(v).toLocaleString('en-US');
  }
  function fmtDb(v) {
    return Math.round(v).toString() + ' dBm';
  }
  function effBand(def) {
    var b = 0;
    def.bands.forEach(function (x) {
      if (x <= params.band && x > b) b = x;
    });
    return b;
  }

  function evalNet() {
    var line = LINES[lineIdx],
      res = [],
      byId = {};
    items.forEach(function (it) {
      var def = ITEMS[it.t];
      if (def.kind !== 'd') return;
      var r = {
        it: it,
        def: def,
        type: it.mode === 'lan' ? 'lan' : 'wlan',
        ok: true,
        ap: -1,
        eff: null,
        sig: null,
        link: 0,
        real: 0,
        pingAdd: 1,
        q: 'good'
      };
      if (r.type === 'lan') {
        r.link = 1000;
        r.real = 940;
      } else {
        var eff = effBand(def),
          bs = -999,
          bk = -1,
          sig = [],
          cand = aps.concat(foreign),
          grx = def.grx || 0;
        cand.forEach(function (ap, k) {
          if (!ap.on) return;
          var v = (sig[k] = sigAt(ap, it.x, it.y, eff) + grx);
          if (v > bs) {
            bs = v;
            bk = k;
          }
        });
        r.eff = eff;
        r.sig = bs;
        r.ap = bk;
        if (bk < 0 || bs < -82) {
          r.ok = false;
          r.q = 'none';
        } else {
          var N = noiseDbm(params.bw[eff], params.nf),
            I = [],
            chB = cand[bk].ch[eff];
          cand.forEach(function (ap, k) {
            if (k !== bk && ap.on && ap.ch[eff] === chB) I.push(sig[k]);
          });
          noiseSrc(eff).forEach(function (s) {
            if (s.wide || s.ch === chB) I.push(s.at(it.x, it.y) + grx);
          });
          r.ch = CH[eff][chB];
          r.snr = bs - N;
          r.sinr = sinrDb(bs, N, I);
          r.cci = r.snr - r.sinr;
          var md = apModel(cand[bk]),
            nss = Math.min(def.streams, md.streams),
            bw = params.bw[eff];
          r.link = Math.round(shannonMbps(bw, r.sinr, nss, params.gap, PHYMAX[bw] * nss));
          r.bh = md.bh || 1;
          r.chKey = eff + '_' + chB;
          var pf = PROFILES[params.prof];
          r.q = bs >= pf.good ? 'good' : bs >= pf.ok ? 'ok' : 'bad';
        }
      }
      res.push(r);
      byId[it.id] = r;
    });

    // APs on the same channel that hear each other (>= -82 dBm) share one cell;
    // its devices share airtime, see macSim
    var cand2 = aps.concat(foreign),
      root = {};
    function cell(b, k) {
      var key = b + '_' + k;
      if (root[key] !== undefined) return root[key];
      var r0 = k;
      for (var j = 0; j < cand2.length; j++) {
        if (j === k || !cand2[j].on || cand2[j].ch[b] !== cand2[k].ch[b]) continue;
        if (sigAt(cand2[k], cand2[j].x, cand2[j].y, b) >= -82 && j < r0) r0 = j;
      }
      return (root[key] = r0); // TODO: chains A-B-C are not merged
    }
    var groups = {},
      total = 0;
    res.forEach(function (r) {
      if (!r.ok) return;
      total += r.def.demand * 0.35;
      if (r.type === 'wlan') {
        var g = r.eff + '_' + cell(r.eff, r.ap);
        (groups[g] = groups[g] || []).push(r);
      }
    });
    Object.keys(groups).forEach(function (g) {
      var L = groups[g],
        seed = 0;
      L.forEach(function (r) {
        seed = (seed * 31 + r.link * 7 + r.it.x + r.it.y) | 0;
      });
      L.forEach(function (r, i) {
        // speed test: this device saturated, the rest at normal demand
        var st = L.map(function (o, j) {
          return { rate: o.link * o.bh, demand: o.def.demand, sat: i === j };
        });
        var m = macSim(st, { seed: seed + i, T: 2e5 })[i];
        r.real = m.thr;
        r.delay = m.delay || 0;
        r.coll = m.coll;
        r.shared = L.length;
      });
    });
    res.forEach(function (r) {
      if (!r.ok) {
        r.down = 0;
        r.up = 0;
        r.ping = null;
        r.limit = '';
        return;
      }
      var cap = r.type === 'lan' ? 940 : r.real * 0.94; // ~6 % TCP/IP overhead
      var rest = total - r.def.demand * 0.35;
      var lineFree = Math.max(0.5, line.down * 0.94 - rest);
      var upFree = Math.max(0.2, line.up * 0.94 - rest * 0.15);
      r.down = Math.min(cap, lineFree);
      r.up = Math.min(cap * 0.85, upFree); // clients transmit weaker
      r.ping = line.ping + (r.type === 'lan' ? 1 : 1 + 2 * r.delay + (r.bh < 1 ? 4 : 0));
      r.limit = cap <= lineFree ? (r.type === 'wlan' ? 'wifi' : 'cable') : 'line';
    });
    return { list: res, byId: byId };
  }

  function connText(r) {
    if (r.type === 'lan') return 'Ethernet, 1 Gbit/s';
    if (!r.ok) return 'Wi-Fi, no signal';
    return (
      'Wi-Fi ' +
      BANDS[r.eff].name +
      ', ' +
      apLabel(r.ap) +
      ', channel ' +
      r.ch +
      (r.cci >= 3 ? ' (interference)' : '') +
      ', ' +
      fmtDb(r.sig) +
      ', SINR ' +
      Math.round(r.sinr) +
      ' dB, link ' +
      r.link.toLocaleString('en-US') +
      ' Mbit/s'
    );
  }

  var floorPoly = $('floorPoly'),
    wallsG = $('walls');
  var apG = $('aps'),
    list = $('aplist');
  var svgTop = $('top'),
    furnG = $('furn'),
    linksG = $('links'),
    devsG = $('devs');
  var readout = $('readout'),
    probe = $('probe');
  var HINT_IDLE = '<span>Hover over the plan to see the signal at any point.</span>';

  function place(k) {
    apEls[k].setAttribute('transform', 'translate(' + aps[k].x + ' ' + aps[k].y + ')');
  }
  function toSvg(e) {
    var pt = svgTop.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svgTop.getScreenCTM().inverse());
  }
  function moveTo(k, x, y) {
    if (!inPoly(x, y)) return;
    aps[k].x = Math.round(x);
    aps[k].y = Math.round(y);
    place(k);
    schedule(k);
  }

  function buildAps() {
    apG.innerHTML = '';
    list.innerHTML = '';
    apEls = aps.map(function (ap, k) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'ap' + (ap.on ? '' : ' off'));
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', 'Access point ' + (k + 1) + ', move with the arrow keys');
      var md = apModel(ap),
        noBand = apAdj(ap, params.band) === null;
      g.innerHTML =
        '<title>' +
        esc(apName(ap, k)) +
        ', ' +
        md.name +
        '</title><circle class="halo" r="46"/><circle class="body" r="25"/><text>' +
        (k + 1) +
        '</text>';
      if (noBand) g.classList.add('off');
      apG.appendChild(g);
      var b = params.band,
        row = document.createElement('div');
      row.className = 'aprow';
      row.innerHTML =
        '<label><input type="checkbox" ' +
        (ap.on ? 'checked' : '') +
        ' aria-label="' +
        esc(apName(ap, k)) +
        ' active"><span>' +
        esc(apName(ap, k)) +
        '</span></label>' +
        (noBand
          ? '<span class="share">no ' + BANDS[b].name + '</span>'
          : '<select class="chs" aria-label="Channel of AP ' +
            (k + 1) +
            '">' +
            CH[b]
              .map(function (c, i) {
                return (
                  '<option value="' +
                  i +
                  '"' +
                  (ap.ch[b] === i ? ' selected' : '') +
                  '>Channel ' +
                  c +
                  '</option>'
                );
              })
              .join('') +
            '</select>') +
        '<select class="mds" aria-label="Model of AP ' +
        (k + 1) +
        '">' +
        Object.keys(APMODELS)
          .map(function (id) {
            return (
              '<option value="' +
              id +
              '"' +
              ((ap.model || 'std') === id ? ' selected' : '') +
              '>' +
              APMODELS[id].name +
              '</option>'
            );
          })
          .join('') +
        '</select>' +
        '<span class="share" id="share' +
        k +
        '">0 %</span>' +
        '<button type="button" class="x ren" aria-label="AP ' +
        (k + 1) +
        ' rename" title="Rename"><svg viewBox="0 0 16 16"><path d="M11 2.5 13.5 5 6 12.5H3.5V10z"/></svg></button>' +
        '<button type="button" class="x del" aria-label="AP ' +
        (k + 1) +
        ' remove">×</button>';
      list.appendChild(row);
      row.querySelector('input').addEventListener('change', function (e) {
        ap.on = e.target.checked;
        g.classList.toggle('off', !ap.on);
        schedule();
      });
      var chs = row.querySelector('.chs');
      if (chs)
        chs.addEventListener('change', function (e) {
          ap.ch[params.band] = +e.target.value;
          scheduleNet();
        });
      row.querySelector('.mds').addEventListener('change', function (e) {
        ap.model = e.target.value;
        buildAps();
        schedule();
      });
      row.querySelector('.ren').addEventListener('click', function () {
        var n = prompt('Name for AP ' + (k + 1) + ' (e.g. "Upstairs hall"):', ap.name || '');
        if (n === null) return;
        ap.name = n.trim().slice(0, 30) || undefined;
        buildAps();
        renderShare();
        scheduleNet();
      });
      row.querySelector('.del').addEventListener('click', function () {
        removeAp(k);
      });
      var off = null;
      g.addEventListener('pointerdown', function (e) {
        var p = toSvg(e);
        off = { x: ap.x - p.x, y: ap.y - p.y };
        g.setPointerCapture(e.pointerId);
        g.classList.add('drag');
        apG.appendChild(g);
        e.preventDefault();
      });
      g.addEventListener('pointermove', function (e) {
        if (!off) return;
        var p = toSvg(e);
        moveTo(k, p.x + off.x, p.y + off.y);
      });
      function end() {
        off = null;
        g.classList.remove('drag');
      }
      g.addEventListener('pointerup', end);
      g.addEventListener('pointercancel', end);
      g.addEventListener('keydown', function (e) {
        var s = e.shiftKey ? 40 : 10,
          dx = 0,
          dy = 0;
        if (e.key === 'ArrowLeft') dx = -s;
        else if (e.key === 'ArrowRight') dx = s;
        else if (e.key === 'ArrowUp') dy = -s;
        else if (e.key === 'ArrowDown') dy = s;
        else return;
        e.preventDefault();
        moveTo(k, ap.x + dx, ap.y + dy);
      });
      return g;
    });
    aps.forEach(function (_, k) {
      place(k);
    });
  }

  // new APs go to the weakest spot
  function addAp() {
    var bi = -1,
      bv = 1e9;
    for (var idx = 0; idx < GW * GH; idx++) {
      if (mask[idx] && best[idx] < bv) {
        bv = best[idx];
        bi = idx;
      }
    }
    if (bi < 0) return;
    var k = aps.length;
    aps.push({
      x: Math.round(VX + ((bi % GW) + 0.5) * CELL),
      y: Math.round(VY + (Math.floor(bi / GW) + 0.5) * CELL),
      on: true,
      ch: defCh(k)
    });
    grids.push(new Float32Array(GW * GH));
    counts.push(newCounts());
    dist.push(new Float32Array(GW * GH));
    buildAps();
    schedule(k);
  }
  function removeAp(k) {
    [aps, grids, counts, dist].forEach(function (a) {
      a.splice(k, 1);
    });
    moved = {};
    buildAps();
    schedule();
  }
  // greedy: quietest channel given the APs before it
  function autoChannels(bArg) {
    var b = bArg === undefined ? params.band : bArg;
    aps.forEach(function (ap, k) {
      if (!ap.on) return;
      var loud = CH[b].map(function () {
        return -999;
      });
      // neighbours count too; microwaves hit all channels, so they don't matter here
      noiseSrc(b).forEach(function (s) {
        if (!s.wide) {
          var v = s.at(ap.x, ap.y);
          if (v > loud[s.ch]) loud[s.ch] = v;
        }
      });
      for (var j = 0; j < k; j++) {
        if (!aps[j].on) continue;
        var v = sigAt(aps[j], ap.x, ap.y, b),
          c = aps[j].ch[b];
        if (v > loud[c]) loud[c] = v;
      }
      var bc = 0;
      loud.forEach(function (v, c) {
        if (v < loud[bc]) bc = c;
      });
      ap.ch[b] = bc;
    });
    buildAps();
    scheduleNet();
  }
  function chConflicts() {
    var b = params.band,
      out = [];
    for (var i = 0; i < aps.length; i++)
      for (var j = i + 1; j < aps.length; j++) {
        if (!aps[i].on || !aps[j].on || aps[i].ch[b] !== aps[j].ch[b]) continue;
        var v = sigAt(aps[i], aps[j].x, aps[j].y, b);
        if (v >= -82)
          out.push(
            'AP ' + (i + 1) + ' + ' + (j + 1) + ' (channel ' + CH[b][aps[i].ch[b]] + ', ' + fmtDb(v) + ')'
          );
      }
    noiseSrc(b).forEach(function (s) {
      if (s.wide) return;
      aps.forEach(function (ap, k) {
        if (!ap.on || ap.ch[b] !== s.ch) return;
        var v = s.at(ap.x, ap.y);
        if (v >= -82)
          out.push(
            apName(ap, k) + ' + ' + itemLabel(s.it) + ' (channel ' + CH[b][s.ch] + ', ' + fmtDb(v) + ')'
          );
      });
    });
    $('chHint').textContent = out.length
      ? 'Co-channel interference on ' +
        BANDS[b].name +
        ': ' +
        out.join(', ') +
        '. "Assign channels" fixes this.'
      : 'No co-channel interference between APs on ' + BANDS[b].name + '.';
  }

  // furniture and devices
  function makeItems() {
    S.cnt = {};
    S.next = 1;
    S.items = plan.items.map(function (d) {
      S.cnt[d[0]] = (S.cnt[d[0]] || 0) + 1;
      return {
        id: 'i' + S.next++,
        t: d[0],
        x: d[1],
        y: d[2],
        rot: d[3] || 0,
        mode: d[4] || 'wlan',
        n: S.cnt[d[0]]
      };
    });
  }
  function itemLabel(it) {
    return ITEMS[it.t].label + (it.t === 'router' ? '' : ' ' + it.n);
  }
  function placeItem(it) {
    itemEls[it.id].setAttribute(
      'transform',
      'translate(' + it.x + ' ' + it.y + ')' + (it.rot ? ' rotate(' + it.rot + ')' : '')
    );
  }

  function buildItem(it) {
    var def = ITEMS[it.t],
      g = document.createElementNS(NS, 'g'),
      s = plan.is,
      html;
    g.setAttribute('class', 'item ' + def.kind);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', itemLabel(it) + ', move with the arrow keys');
    if (def.kind === 'f') {
      var w = def.w * plan.upm,
        h = def.h * plan.upm;
      html =
        '<rect class="fshape' +
        (it.t === 'cabinet' ? ' dense' : '') +
        '" x="' +
        -w / 2 +
        '" y="' +
        -h / 2 +
        '" width="' +
        w +
        '" height="' +
        h +
        '" rx="4"/>';
      if (it.t === 'sofa')
        html +=
          '<line class="fback" x1="' +
          (-w / 2 + 6) +
          '" y1="' +
          (-h / 2 + 9) +
          '" x2="' +
          (w / 2 - 6) +
          '" y2="' +
          (-h / 2 + 9) +
          '"/>';
      if (it.t === 'conf')
        html +=
          '<rect class="fshape inner" x="' +
          (-w / 2 + 8) +
          '" y="' +
          (-h / 2 + 8) +
          '" width="' +
          (w - 16) +
          '" height="' +
          (h - 16) +
          '" rx="3"/>';
      g.innerHTML = html;
      furnG.appendChild(g);
    } else if (def.kind === 'r') {
      g.innerHTML =
        '<circle class="halo" r="' +
        34 * s +
        '"/><circle class="selring" r="' +
        30 * s +
        '"/>' +
        '<g transform="scale(' +
        s +
        ')"><path class="rant" d="M-11 -8L-15 -22M11 -8L15 -22"/>' +
        '<rect class="rbody" x="-19" y="-9" width="38" height="18" rx="4"/>' +
        '<circle class="rled" cx="-10" cy="0" r="2"/><circle class="rled" cx="-3" cy="0" r="2"/><circle class="rled" cx="4" cy="0" r="2"/></g>' +
        '<text class="rtext" y="' +
        27 * s +
        '" font-size="' +
        13 * s +
        '">Router</text>';
      devsG.appendChild(g);
    } else {
      g.innerHTML =
        '<circle class="halo" r="' +
        30 * s +
        '"/><circle class="selring" r="' +
        25 * s +
        '"/>' +
        '<g transform="scale(' +
        s +
        ')"><circle class="dbg" r="17"/><g class="glyph">' +
        ICON[it.t] +
        '</g></g>';
      devsG.appendChild(g);
    }
    itemEls[it.id] = g;
    placeItem(it);

    var off = null;
    g.addEventListener('pointerdown', function (e) {
      select(it);
      var p = toSvg(e);
      off = { x: it.x - p.x, y: it.y - p.y };
      g.setPointerCapture(e.pointerId);
      g.classList.add('drag');
      g.parentNode.appendChild(g);
      e.preventDefault();
    });
    g.addEventListener('pointermove', function (e) {
      if (!off) return;
      var p = toSvg(e);
      moveItem(it, p.x + off.x, p.y + off.y);
    });
    function end() {
      off = null;
      g.classList.remove('drag');
    }
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('focus', function () {
      if (sel !== it) select(it);
    });
    g.addEventListener('keydown', function (e) {
      var s2 = e.shiftKey ? 40 : 10,
        dx = 0,
        dy = 0;
      if (e.key === 'ArrowLeft') dx = -s2;
      else if (e.key === 'ArrowRight') dx = s2;
      else if (e.key === 'ArrowUp') dy = -s2;
      else if (e.key === 'ArrowDown') dy = s2;
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeItem(it);
        return;
      } else if (e.key === 'r' || e.key === 'R') {
        rotateItem(it);
        return;
      } else return;
      e.preventDefault();
      moveItem(it, it.x + dx, it.y + dy);
    });
  }

  function buildItems() {
    furnG.innerHTML = '';
    devsG.innerHTML = '';
    linksG.innerHTML = '';
    itemEls = {};
    items.forEach(buildItem);
  }
  function moveItem(it, x, y) {
    if (!inPoly(x, y)) return;
    it.x = Math.round(x);
    it.y = Math.round(y);
    placeItem(it);
    if (ITEMS[it.t].kind === 'n') schedule();
    else scheduleNet(); // interferers change the heat map
  }
  function rotateItem(it) {
    if (ITEMS[it.t].kind !== 'f') return;
    it.rot = it.rot ? 0 : 90;
    placeItem(it);
    saveSoon();
  }
  function removeItem(it) {
    if (ITEMS[it.t].kind === 'r') return;
    items.splice(items.indexOf(it), 1);
    if (itemEls[it.id]) {
      itemEls[it.id].parentNode.removeChild(itemEls[it.id]);
      delete itemEls[it.id];
    }
    if (sel === it) {
      sel = null;
      stopTest();
    }
    updateSel();
    if (ITEMS[it.t].kind === 'n') schedule();
    else scheduleNet();
  }
  function addItem(t) {
    var o = plan.outline,
      minx = 1e9,
      maxx = -1e9,
      miny = 1e9,
      maxy = -1e9;
    o.forEach(function (p) {
      minx = Math.min(minx, p[0]);
      maxx = Math.max(maxx, p[0]);
      miny = Math.min(miny, p[1]);
      maxy = Math.max(maxy, p[1]);
    });
    var cx = (minx + maxx) / 2,
      cy = (miny + maxy) / 2,
      x = cx,
      y = cy;
    for (var tries = 0; tries < 30; tries++) {
      var tx = cx + (Math.random() - 0.5) * (maxx - minx) * 0.5,
        ty = cy + (Math.random() - 0.5) * (maxy - miny) * 0.5;
      if (inPoly(tx, ty)) {
        x = tx;
        y = ty;
        break;
      }
    }
    S.cnt[t] = (S.cnt[t] || 0) + 1;
    var it = {
      id: 'i' + S.next++,
      t: t,
      x: Math.round(x),
      y: Math.round(y),
      rot: 0,
      mode: 'wlan',
      n: S.cnt[t]
    };
    if (ITEMS[t].kind === 'n') it.ch = [1, 0, 0];
    items.push(it);
    buildItem(it);
    select(it);
    if (ITEMS[t].kind === 'n') schedule();
    else scheduleNet();
  }

  function select(it) {
    if (sel === it) return;
    if (it) showTab('dev');
    sel = it;
    stopTest();
    Object.keys(itemEls).forEach(function (id) {
      itemEls[id].classList.remove('sel');
    });
    if (it && itemEls[it.id]) itemEls[it.id].classList.add('sel');
    updateSel();
    renderList();
  }

  var modeBtns = [].slice.call(document.querySelectorAll('#modeSeg button'));
  function updateSel() {
    var bar = $('selBar');
    if (!sel) {
      bar.hidden = true;
      $('stName').textContent = 'No device selected';
      $('stConn').textContent = 'Pick a device on the plan or in the list.';
      $('stBtn').disabled = true;
      resetResults();
      renderList();
      return;
    }
    var def = ITEMS[sel.t];
    bar.hidden = false;
    $('selName').textContent = itemLabel(sel);
    $('modeSeg').hidden = def.kind !== 'd';
    var isN = def.kind === 'n' && !def.wide,
      sc = $('selCh');
    sc.hidden = !isN;
    if (isN) {
      if (!sel.ch) sel.ch = [1, 0, 0];
      var nb = def.bands.indexOf(params.band) >= 0 ? params.band : def.bands[def.bands.length - 1];
      sc.innerHTML = CH[nb]
        .map(function (c, i) {
          return (
            '<option value="' +
            i +
            '"' +
            (sel.ch[nb] === i ? ' selected' : '') +
            '>' +
            BANDS[nb].name +
            ', channel ' +
            c +
            '</option>'
          );
        })
        .join('');
      sc.dataset.b = nb;
    }
    $('selRot').hidden = def.kind !== 'f';
    $('selDel').hidden = def.kind === 'r';
    modeBtns.forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-mode') === sel.mode ? 'true' : 'false');
    });
    var isDev = def.kind === 'd';
    $('stName').textContent = isDev ? itemLabel(sel) : def.kind === 'r' ? 'Router' : 'No device selected';
    $('stBtn').disabled = !isDev;
    updateSelSub();
    if (!isDev) $('stConn').textContent = 'Pick a device on the plan or in the list.';
    resetResults();
  }
  function updateSelSub() {
    if (!sel) return;
    var def = ITEMS[sel.t],
      sub = '';
    if (def.kind === 'd') {
      var r = net.byId[sel.id];
      sub = r ? connText(r) : '';
      if (r && r.shared)
        sub +=
          ', cell shared by ' +
          r.shared +
          ' device' +
          (r.shared === 1 ? '' : 's') +
          ', collisions ' +
          Math.round(r.coll * 100) +
          ' %, channel access ' +
          (Math.round(r.delay * 10) / 10).toLocaleString('en-US') +
          ' ms';
      if (r && r.type === 'wlan' && r.eff !== params.band)
        sub += ' (device has no ' + BANDS[params.band].name + ')';
      $('stConn').textContent = sub;
    } else if (def.kind === 'n') {
      sub = def.wide ? 'disturbs all 2.4 GHz channels' : 'foreign network, disturbs APs on the same channel';
    } else if (def.kind === 'f') {
      sub =
        def.w.toLocaleString('en-US') +
        ' × ' +
        def.h.toLocaleString('en-US') +
        ' m, does not block the signal';
    } else {
      sub = 'Internet: ' + LINES[lineIdx].name + ', all access points are wired to it';
    }
    $('selSub').textContent = sub;
  }

  function line(x1, y1, x2, y2, cls, color) {
    var l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('class', cls);
    if (color) l.setAttribute('stroke', color);
    linksG.appendChild(l);
  }
  function drawLinks() {
    linksG.innerHTML = '';
    var router = null;
    items.forEach(function (it) {
      if (it.t === 'router') router = it;
    });
    if (router) {
      aps.forEach(function (ap) {
        if (ap.on) line(ap.x, ap.y, router.x, router.y, 'wire');
      });
    }
    net.list.forEach(function (r) {
      var it = r.it;
      if (r.type === 'lan') {
        if (router) line(it.x, it.y, router.x, router.y, 'cable');
      } else if (r.ok) {
        var ap = apAt(r.ap);
        line(it.x, it.y, ap.x, ap.y, 'wlink', QCOL[r.q]);
      }
    });
    net.list.forEach(function (r) {
      var g = itemEls[r.it.id];
      if (!g) return;
      var dbg = g.querySelector('.dbg');
      if (dbg) dbg.setAttribute('stroke', r.type === 'lan' ? QCOL.lan : QCOL[r.q]);
      g.classList.toggle('offline', !r.ok);
    });
  }

  function renderList() {
    var box = $('devList'),
      top = box.scrollTop,
      html = '';
    net.list.forEach(function (r) {
      var q = r.type === 'lan' ? 'lan' : r.q;
      html +=
        '<button type="button" class="devrow" data-id="' +
        r.it.id +
        '" aria-pressed="' +
        (sel === r.it) +
        '">' +
        '<i class="dot" style="background:' +
        QCOL[q] +
        '"></i>' +
        '<span class="dn">' +
        itemLabel(r.it) +
        '</span>' +
        '<span class="ds">' +
        (r.ok ? '≈ ' + fmtMb(r.down) + ' Mbit/s' : 'offline') +
        '</span>' +
        '<span class="dc">' +
        connText(r) +
        '</span></button>';
    });
    box.innerHTML = html;
    box.scrollTop = top;
    $('devCount').textContent = net.list.length;
  }

  function refreshNet() {
    net = evalNet();
    clients = aps.map(function (_, k) {
      return net.list.filter(function (r) {
        return r.type === 'wlan' && r.ok && r.ap === k;
      }).length;
    });
    renderShare();
    drawLinks();
    renderList();
    updateSelSub();
    chConflicts();
    drawSurvey();
    renderMat();
    saveSoon();
    if (!testTimer) resetResults();
  }
  var netQueued = false;
  function scheduleNet() {
    if (netQueued) return;
    netQueued = true;
    requestAnimationFrame(function () {
      netQueued = false;
      refreshNet();
    });
  }

  // speed test
  var testTimer = null;
  function stopTest() {
    if (testTimer) {
      clearInterval(testTimer);
      testTimer = null;
    }
    $('stBtn').textContent = 'Run speed test';
    $('stBar').style.width = '0%';
  }
  function resetResults() {
    $('stPing').textContent = '-';
    $('stDown').textContent = '-';
    $('stUp').textContent = '-';
    $('stBar').style.width = '0%';
    var r = sel && net.byId[sel.id];
    $('stPhase').textContent =
      !sel || ITEMS[sel.t].kind !== 'd' ? '' : r && !r.ok ? 'No signal: too weak to connect.' : 'Ready';
  }
  function ease(p) {
    return 1 - Math.pow(1 - p, 3);
  }
  function runTest() {
    if (!sel || ITEMS[sel.t].kind !== 'd') return;
    stopTest();
    var r = net.byId[sel.id];
    if (!r || !r.ok) {
      resetResults();
      return;
    }
    var line = LINES[lineIdx];
    var fin = {
      ping: r.ping * (1 + (Math.random() - 0.5) * 0.1),
      down: r.down * (0.96 + Math.random() * 0.06),
      up: r.up * (0.96 + Math.random() * 0.06)
    };
    var T1 = 900,
      T2 = 2600,
      T3 = 2000,
      t0 = performance.now();
    $('stBtn').textContent = 'Testing …';
    $('stPing').textContent = '-';
    $('stDown').textContent = '-';
    $('stUp').textContent = '-';
    testTimer = setInterval(function () {
      var t = performance.now() - t0;
      if (t < T1) {
        $('stPhase').textContent = 'Ping …';
        $('stPing').textContent = Math.round(fin.ping * (1 + (1 - t / T1) * 0.9 * Math.random()));
        $('stBar').style.width = (t / T1) * 100 + '%';
      } else if (t < T1 + T2) {
        var p = (t - T1) / T2,
          v = fin.down * ease(p) * (0.94 + Math.random() * 0.1);
        $('stPing').textContent = Math.round(fin.ping);
        $('stPhase').textContent = 'Download …';
        $('stDown').textContent = fmtMb(v);
        $('stBar').style.width = Math.min(100, (v / line.down) * 100) + '%';
      } else if (t < T1 + T2 + T3) {
        var p2 = (t - T1 - T2) / T3,
          v2 = fin.up * ease(p2) * (0.94 + Math.random() * 0.1);
        $('stDown').textContent = fmtMb(fin.down);
        $('stPhase').textContent = 'Upload …';
        $('stUp').textContent = fmtMb(v2);
        $('stBar').style.width = Math.min(100, (v2 / line.up) * 100) + '%';
      } else {
        clearInterval(testTimer);
        testTimer = null;
        $('stPing').textContent = Math.round(fin.ping);
        $('stDown').textContent = fmtMb(fin.down);
        $('stUp').textContent = fmtMb(fin.up);
        $('stBar').style.width = Math.min(100, (fin.down / line.down) * 100) + '%';
        $('stPhase').textContent =
          'Done. Limited by: ' +
          (r.limit === 'line'
            ? 'the internet connection'
            : r.limit === 'wifi'
              ? 'Wi-Fi (signal and airtime)'
              : 'the cable');
        $('stBtn').textContent = 'Test again';
      }
    }, 70);
  }
  $('stBtn').addEventListener('click', runTest);

  // walls (S.walls once edited, otherwise plan.walls)
  function curWalls() {
    return S.walls || plan.walls;
  }
  function buildWalls() {
    var W = curWalls();
    nW = W.length;
    wx1 = new Float32Array(nW);
    wy1 = new Float32Array(nW);
    wx2 = new Float32Array(nW);
    wy2 = new Float32Array(nW);
    bx1 = new Float32Array(nW);
    bx2 = new Float32Array(nW);
    by1 = new Float32Array(nW);
    by2 = new Float32Array(nW);
    wt = new Uint8Array(nW);
    wallsG.innerHTML = '';
    W.forEach(function (w, i) {
      wx1[i] = w[0];
      wy1[i] = w[1];
      wx2[i] = w[2];
      wy2[i] = w[3];
      wt[i] = TYPE[w[4]];
      bx1[i] = Math.min(w[0], w[2]);
      bx2[i] = Math.max(w[0], w[2]);
      by1[i] = Math.min(w[1], w[3]);
      by2[i] = Math.max(w[1], w[3]);
      [
        ['', COLOR[wt[i]], THICK[wt[i]]],
        ['hit', 'transparent', 24]
      ].forEach(function (s) {
        var l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', w[0]);
        l.setAttribute('y1', w[1]);
        l.setAttribute('x2', w[2]);
        l.setAttribute('y2', w[3]);
        l.setAttribute('stroke', s[1]);
        l.setAttribute('stroke-width', s[2]);
        if (s[0]) {
          l.setAttribute('class', s[0]);
          l.setAttribute('data-i', i);
        }
        wallsG.appendChild(l);
      });
    });
  }
  function wallsMut() {
    if (!S.walls)
      S.walls = plan.walls.map(function (w) {
        return w.slice();
      });
    return S.walls;
  }
  function wallsChanged() {
    buildWalls();
    aps.forEach(function (_, k) {
      moved[k] = true;
    });
    schedule();
  }

  // wall editor
  var editing = false,
    drawType = 'c',
    draw = null,
    ghost = $('ghost');
  function wallIdx(e) {
    var i = e.target.getAttribute && e.target.getAttribute('data-i');
    return editing && i !== null ? +i : -1;
  }
  wallsG.addEventListener('click', function (e) {
    var i = wallIdx(e);
    if (i < 0) return;
    var W = wallsMut();
    if (e.altKey) W.splice(i, 1);
    else W[i][4] = { g: 'd', d: 'c', c: 'b', b: 'm', m: 'g' }[W[i][4]] || 'c';
    wallsChanged();
  });
  wallsG.addEventListener('contextmenu', function (e) {
    var i = wallIdx(e);
    if (i < 0) return;
    e.preventDefault();
    wallsMut().splice(i, 1);
    wallsChanged();
  });
  // snap to wall ends so corners close
  function snapPt(x, y) {
    var bd = 14,
      r = [x, y];
    curWalls().forEach(function (w) {
      [
        [w[0], w[1]],
        [w[2], w[3]]
      ].forEach(function (p) {
        var d = Math.sqrt((p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y));
        if (d < bd) {
          bd = d;
          r = [p[0], p[1]];
        }
      });
    });
    return r;
  }
  function drawEnd(e) {
    var p = toSvg(e),
      q = snapPt(p.x, p.y);
    if (!e.shiftKey) {
      if (Math.abs(q[0] - draw.x) > Math.abs(q[1] - draw.y)) q[1] = draw.y;
      else q[0] = draw.x;
    }
    return q;
  }
  function setGhost(x2, y2) {
    ghost.setAttribute('x1', draw.x);
    ghost.setAttribute('y1', draw.y);
    ghost.setAttribute('x2', x2);
    ghost.setAttribute('y2', y2);
    ghost.setAttribute('stroke', COLOR[TYPE[drawType]]);
    ghost.setAttribute('opacity', '1');
  }
  svgTop.addEventListener('pointermove', function (e) {
    if (draw) {
      var q = drawEnd(e);
      setGhost(q[0], q[1]);
    }
  });

  // scale tool
  var meas = null;
  function measMsg(t) {
    readout.innerHTML = '<span>' + t + ' (Esc cancels)</span>';
  }
  function measStop() {
    meas = null;
    $('plan').classList.remove('measure');
    ghost.setAttribute('opacity', '0');
  }
  [].forEach.call(document.querySelectorAll('.measBtn'), function (b) {
    b.addEventListener('click', function () {
      meas = { a: null };
      $('plan').classList.add('measure');
      measMsg('Click the start of a distance you know, e.g. a dimension line or an outer wall.');
      $('plan').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
  // capture phase so nothing gets dragged
  svgTop.addEventListener(
    'pointerdown',
    function (e) {
      if (!meas) return;
      e.stopPropagation();
      e.preventDefault();
      var p = toSvg(e);
      if (!meas.a) {
        meas.a = { x: p.x, y: p.y };
        measMsg('Now click its end.');
        return;
      }
      var px = Math.sqrt((p.x - meas.a.x) * (p.x - meas.a.x) + (p.y - meas.a.y) * (p.y - meas.a.y));
      if (px < 10) return;
      var v = parseFloat(String(prompt('How long is this distance in metres?', '') || '').replace(',', '.'));
      measStop();
      if (!(v > 0)) {
        readout.innerHTML = HINT_IDLE;
        return;
      }
      var wNew = clamp(Math.round((v / px) * plan.bpx * 10) / 10, 3, 200);
      setWidthUI(wNew);
      plan.width = wNew;
      scheduleAll();
      saveSoon();
      readout.innerHTML =
        '<span>Scale set: building width is now ' + wNew.toLocaleString('en-US') + ' m.</span>';
    },
    true
  );
  svgTop.addEventListener('pointermove', function (e) {
    if (!meas || !meas.a) return;
    var p = toSvg(e);
    ghost.setAttribute('x1', meas.a.x);
    ghost.setAttribute('y1', meas.a.y);
    ghost.setAttribute('x2', p.x);
    ghost.setAttribute('y2', p.y);
    ghost.setAttribute('stroke', 'var(--accent)');
    ghost.setAttribute('opacity', '1');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && meas) {
      measStop();
      readout.innerHTML = HINT_IDLE;
    }
  });

  // area rectangles
  var zoneTool = null,
    zdraw = null,
    zGhost = $('zoneGhost'),
    zBtns = [].slice.call(document.querySelectorAll('#zoneSeg button'));
  var ZCOL = { out: '#5d7fb5', cut: '#d9553f', in: '#2f9e5a' };
  function setZoneTool(t) {
    zoneTool = t;
    zBtns.forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-z') === t ? 'true' : 'false');
    });
    $('plan').classList.toggle('zone', !!t);
    if (t) {
      if (editing) $('editWalls').click();
      if (survey) $('survOn').click();
    }
  }
  zBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-z');
      setZoneTool(zoneTool === t ? null : t);
    });
  });
  function zonesChanged() {
    rebuildMask();
    aps.forEach(function (_, k) {
      moved[k] = true;
    });
    schedule();
  }
  function zRect(e) {
    var p = toSvg(e);
    return {
      x1: Math.round(Math.min(zdraw.x, p.x)),
      y1: Math.round(Math.min(zdraw.y, p.y)),
      x2: Math.round(Math.max(zdraw.x, p.x)),
      y2: Math.round(Math.max(zdraw.y, p.y))
    };
  }
  svgTop.addEventListener(
    'pointerdown',
    function (e) {
      if (!zoneTool || meas) return;
      e.stopPropagation();
      e.preventDefault();
      var p = toSvg(e);
      zdraw = { x: p.x, y: p.y };
      try {
        svgTop.setPointerCapture(e.pointerId);
      } catch (err) {}
      zGhost.setAttribute('stroke', ZCOL[zoneTool]);
    },
    true
  );
  svgTop.addEventListener('pointermove', function (e) {
    if (!zdraw) return;
    var r = zRect(e);
    zGhost.setAttribute('x', r.x1);
    zGhost.setAttribute('y', r.y1);
    zGhost.setAttribute('width', r.x2 - r.x1);
    zGhost.setAttribute('height', r.y2 - r.y1);
    zGhost.setAttribute('opacity', '1');
  });
  svgTop.addEventListener('pointerup', function (e) {
    if (!zdraw) return;
    var r = zRect(e);
    zdraw = null;
    zGhost.setAttribute('opacity', '0');
    if (r.x2 - r.x1 < 10 || r.y2 - r.y1 < 10) return;
    r.t = zoneTool;
    (S.rects || (S.rects = [])).push(r);
    zonesChanged();
  });
  $('zoneUndo').addEventListener('click', function () {
    if (!S.rects || !S.rects.length) return;
    S.rects.pop();
    if (!S.rects.length) delete S.rects;
    zonesChanged();
  });
  $('zoneReset').addEventListener('click', function () {
    if (!S.rects) return;
    delete S.rects;
    zonesChanged();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && zoneTool) setZoneTool(null);
  });

  // measurements / calibration
  var survey = false,
    survG = $('survG');
  function survPts() {
    if (!Array.isArray(S.meas)) S.meas = [];
    return S.meas;
  }
  function modelAt(x, y, b) {
    var bv = -200;
    aps.forEach(function (ap) {
      if (ap.on) {
        var v = sigAt(ap, x, y, b);
        if (v > bv) bv = v;
      }
    });
    return bv;
  }
  function drawSurvey() {
    var P = survPts(),
      b = params.band,
      s = plan.is,
      h = '';
    P.forEach(function (p) {
      var on = p.b === b,
        d = on ? modelAt(p.x, p.y, b) - p.v : 0,
        ad = Math.abs(d);
      var col = !on ? '#8b9690' : ad <= 3 ? '#2f9e5a' : ad <= 6 ? '#e0b52c' : '#d9553f';
      h +=
        '<g class="' +
        (on ? '' : 'off') +
        '" transform="translate(' +
        p.x +
        ' ' +
        p.y +
        ')"><title>Measured ' +
        fmtDb(p.v) +
        (on ? ', model ' + fmtDb(p.v + d) : '') +
        '</title>' +
        '<rect class="sp" x="' +
        -19 * s +
        '" y="' +
        -11 * s +
        '" width="' +
        38 * s +
        '" height="' +
        22 * s +
        '" rx="' +
        5 * s +
        '" fill="' +
        col +
        '"/>' +
        '<text font-size="' +
        12 * s +
        '">' +
        Math.round(p.v) +
        '</text></g>';
    });
    survG.innerHTML = h;
    var n = P.filter(function (p) {
      return p.b === b;
    }).length;
    $('survFit').disabled = n < 3;
    $('survClr').disabled = !P.length;
  }
  $('survOn').addEventListener('change', function (e) {
    survey = e.target.checked;
    $('plan').classList.toggle('survey', survey);
    if (survey && editing) $('editWalls').click();
  });
  svgTop.addEventListener(
    'pointerdown',
    function (e) {
      if (!survey || meas) return;
      e.stopPropagation();
      e.preventDefault();
      var p = toSvg(e),
        P = survPts(),
        near = -1;
      P.forEach(function (q, i) {
        if (q.b === params.band && Math.abs(q.x - p.x) < 22 * plan.is && Math.abs(q.y - p.y) < 14 * plan.is)
          near = i;
      });
      if (near >= 0) {
        P.splice(near, 1);
        drawSurvey();
        saveSoon();
        return;
      }
      var raw = prompt(
        'Measured signal at this spot in dBm (' + BANDS[params.band].name + '), e.g. -63:',
        ''
      );
      if (raw === null) return;
      var v = parseFloat(String(raw).replace(',', '.').replace('-', '-'));
      if (v > 0) v = -v; // accept 63 for -63
      if (!(v <= -20 && v >= -100)) {
        alert('Please enter a value between -20 and -100 dBm.');
        return;
      }
      P.push({ x: Math.round(p.x), y: Math.round(p.y), b: params.band, v: v });
      drawSurvey();
      saveSoon();
    },
    true
  );
  $('survClr').addEventListener('click', function () {
    if (!confirm('Delete all measurements of this plan?')) return;
    S.meas = [];
    drawSurvey();
    saveSoon();
  });
  // brute force over power, exponent and one factor on all wall losses
  function survFit() {
    var b = params.band,
      P = survPts().filter(function (p) {
        return p.b === b;
      });
    if (P.length < 3) return;
    var keep = { tx: params.tx, n: params.n, loss: params.loss.slice() },
      MAX = LMAX;
    function rmse() {
      var s = 0;
      P.forEach(function (p) {
        var d = modelAt(p.x, p.y, b) - p.v;
        s += d * d;
      });
      return Math.sqrt(s / P.length);
    }
    var before = rmse(),
      best = { e: 1e9 };
    for (var f = 0.5; f <= 1.501; f += 0.1) {
      params.loss = keep.loss.map(function (v, i) {
        return clamp(Math.round(v * f), 0, MAX[i]);
      });
      for (var n = 20; n <= 40; n++) {
        params.n = n / 10;
        for (var tx = 5; tx <= 23; tx++) {
          params.tx = tx;
          var e = rmse();
          if (e < best.e) best = { e: e, tx: tx, n: params.n, loss: params.loss.slice() };
        }
      }
    }
    params.tx = keep.tx;
    params.n = keep.n;
    params.loss = keep.loss;
    [
      ['pTx', best.tx],
      ['pN', best.n]
    ]
      .concat(
        LID.map(function (id, i) {
          return [id, best.loss[i]];
        })
      )
      .forEach(function (a) {
        $(a[0]).value = a[1];
        $(a[0]).dispatchEvent(new Event('input'));
      });
    var r1 = function (v) {
      return (Math.round(v * 10) / 10).toLocaleString('en-US');
    };
    $('survInfo').textContent =
      'Calibrated with ' +
      P.length +
      ' measurements: mean error ' +
      r1(before) +
      ' dB → ' +
      r1(best.e) +
      ' dB. ' +
      'transmit power ' +
      best.tx +
      ' dBm, exponent ' +
      r1(best.n) +
      ', walls ' +
      best.loss.join(' / ') +
      ' dB.' +
      (best.e > 6 ? ' Large remaining error: check walls or AP positions.' : '');
  }
  $('survFit').addEventListener('click', survFit);
  svgTop.addEventListener('pointerup', function (e) {
    if (!draw) return;
    var q = drawEnd(e);
    if (Math.abs(q[0] - draw.x) + Math.abs(q[1] - draw.y) > 12) {
      wallsMut().push([Math.round(draw.x), Math.round(draw.y), Math.round(q[0]), Math.round(q[1]), drawType]);
      wallsChanged();
    }
    draw = null;
    ghost.setAttribute('opacity', '0');
  });
  svgTop.addEventListener('pointercancel', function () {
    draw = null;
    ghost.setAttribute('opacity', '0');
  });
  $('editWalls').addEventListener('change', function (e) {
    editing = e.target.checked;
    $('plan').classList.toggle('edit', editing);
    $('wallTools').hidden = !editing;
    if (editing && survey) $('survOn').click();
  });
  var wtBtns = [].slice.call(document.querySelectorAll('#wtSeg button'));
  wtBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      drawType = b.getAttribute('data-wt');
      wtBtns.forEach(function (o) {
        o.setAttribute('aria-checked', o === b ? 'true' : 'false');
      });
    });
  });
  $('resetWalls').addEventListener('click', function () {
    delete S.walls;
    wallsChanged();
  });

  // tesseract is loaded on demand; the image never leaves the browser
  var tessP = null;
  function loadTess() {
    if (!tessP)
      tessP = new Promise(function (ok, no) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
        s.onload = function () {
          ok(window.Tesseract);
        };
        s.onerror = function () {
          tessP = null;
          no(new Error('laden'));
        };
        document.head.appendChild(s);
      });
    return tessP;
  }
  async function readDims() {
    var img = bp.img;
    try {
      var T = await loadTess();
      var iw = img.naturalWidth,
        ih = img.naturalHeight,
        k = Math.min(3, 2400 / Math.max(iw, ih)); // small drawings OCR badly, scale up
      var c = document.createElement('canvas');
      c.width = Math.round(iw * k);
      c.height = Math.round(ih * k);
      var x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      var wk = await T.createWorker('eng');
      // no whitelist: "4,08 m" gets confidence 0 with one
      await wk.setParameters({ tessedit_pageseg_mode: '11' });
      var res = await wk.recognize(c);
      await wk.terminate();
      if (bp.img !== img) return;
      var f = bp.rw / c.width,
        words = (res.data.words || []).map(function (w) {
          return {
            t: w.text,
            c: w.confidence,
            x0: w.bbox.x0 * f,
            y0: w.bbox.y0 * f,
            x1: w.bbox.x1 * f,
            y1: w.bbox.y1 * f
          };
        });
      var hit = pickWidth(words, bp.box);
      if (!hit) {
        bp.dimNote = ' No overall dimension found: enter the width or use "Measure scale".';
      } else if (bp.userW) {
        bp.dimNote =
          ' Dimension read: ' + hit.v.toLocaleString('en-US') + ' m ("' + hit.t + '"), keeping your value.';
      } else {
        $('bpW').value = Math.round(hit.v * 100) / 100;
        var conflict =
          hit.chains &&
          hit.chains.length > 1 &&
          Math.max.apply(null, hit.chains) > 1.05 * Math.min.apply(null, hit.chains);
        bp.dimNote =
          ' Width ' +
          hit.v.toLocaleString('en-US') +
          ' m taken from ' +
          (hit.chain ? 'the dimension chain ' : 'the dimension ') +
          '"' +
          hit.t +
          '".' +
          (conflict
            ? ' The dimension chains disagree (' +
              hit.chains
                .map(function (v) {
                  return v.toLocaleString('en-US');
                })
                .join(' / ') +
              ' m).'
            : '');
      }
    } catch (e) {
      if (bp.img !== img) return;
      bp.dimNote = ' Text recognition unavailable (offline?), please enter the width.';
    }
    importPlan();
  }

  // import
  var bp = { img: null, name: '', planId: null };
  function bpOut() {
    $('oBpT').textContent = $('bpT').value;
    $('oBpMin').textContent = $('bpMin').value + ' px';
    $('oBpOpen').textContent = String($('bpOpen').value) + ' m';
  }
  ['bpT', 'bpMin', 'bpOpen'].forEach(function (id) {
    $(id).addEventListener('input', bpOut);
  });
  bpOut();
  ['bpT', 'bpMin', 'bpW', 'bpOpen', 'bpBalc'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if (id === 'bpW') {
        bp.userW = true;
        bp.dimNote = '';
      }
      if (bp.img) importPlan();
    });
  });
  function pickFile() {
    $('bpFile').value = '';
    $('bpFile').click();
  }
  $('bpOpen').addEventListener('click', pickFile);
  $('bpPick').addEventListener('click', pickFile);
  $('bpFile').addEventListener('change', function (e) {
    loadFile(e.target.files && e.target.files[0]);
  });
  var planBox = $('plan');
  planBox.addEventListener('dragover', function (e) {
    e.preventDefault();
    planBox.classList.add('drop');
  });
  planBox.addEventListener('dragleave', function () {
    planBox.classList.remove('drop');
  });
  planBox.addEventListener('drop', function (e) {
    e.preventDefault();
    planBox.classList.remove('drop');
    loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  function loadFile(f) {
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      $('bpInfo').textContent = 'Please choose an image (PNG or JPG).';
      return;
    }
    var rd = new FileReader();
    rd.onload = function () {
      var im = new Image();
      im.onload = function () {
        bp.img = im;
        bp.name = f.name.replace(/\.[^.]+$/, '');
        bp.planId = null;
        bp.userW = false;
        $('bpGo').disabled = false;
        var auto = $('bpAuto').checked;
        bp.dimNote = auto ? ' Reading dimensions … (text recognition loads on first use)' : '';
        importPlan();
        if (auto && bp.box) readDims();
      };
      im.onerror = function () {
        $('bpInfo').textContent = 'The image could not be read.';
      };
      im.src = rd.result;
    };
    rd.readAsDataURL(f);
  }
  $('bpGo').addEventListener('click', function () {
    importPlan();
  });

  function importPlan() {
    if (!bp.img) return;
    var iw = bp.img.naturalWidth,
      ih = bp.img.naturalHeight,
      R = Math.min(1, 600 / Math.max(iw, ih));
    var w = Math.max(1, Math.round(iw * R)),
      h = Math.max(1, Math.round(ih * R));
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var cx = c.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, w, h);
    cx.drawImage(bp.img, 0, 0, w, h);
    var px = cx.getImageData(0, 0, w, h).data,
      dark = new Uint8Array(w * h),
      soft = new Uint8Array(w * h),
      thr = +$('bpT').value,
      thrSoft = Math.min(225, thr + 95);
    for (var i = 0; i < w * h; i++) {
      var lum = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
      dark[i] = lum < thr ? 1 : 0;
      soft[i] = lum < thrSoft ? 1 : 0;
    }
    var gs = findWalls(dark, w, h, +$('bpMin').value);
    if (!gs.length) {
      bp.box = null;
      $('bpInfo').textContent = 'No walls found. Raise the threshold or lower the minimum wall thickness.';
      return;
    }
    // keep the 400 longest pieces, the ray test gets slow beyond that
    gs.sort(function (p, q) {
      return q.b - q.a - (p.b - p.a);
    });
    gs = gs.slice(0, 400);

    var minx = 1e9,
      maxx = -1e9,
      miny = 1e9,
      maxy = -1e9;
    gs.forEach(function (g) {
      var r = g.o === 'h' ? [g.a, g.b + 1, g.p0, g.p1 + 1] : [g.p0, g.p1 + 1, g.a, g.b + 1];
      minx = Math.min(minx, r[0]);
      maxx = Math.max(maxx, r[1]);
      miny = Math.min(miny, r[2]);
      maxy = Math.max(maxy, r[3]);
    });
    bp.box = { x0: minx, y0: miny, x1: maxx, y1: maxy };
    bp.rw = w;
    var M = 40,
      sc = Math.min((VW - 2 * M) / w, (VH - 2 * M) / h),
      ox = VX + (VW - w * sc) / 2,
      oy = VY + (VH - h * sc) / 2;
    function X(v) {
      return Math.round(ox + v * sc);
    }
    function Y(v) {
      return Math.round(oy + v * sc);
    }
    var widthM = clamp(+$('bpW').value || 15, 3, 100),
      cmPx = (widthM * 100) / (maxx - minx),
      cnt = { g: 0, c: 0, b: 0 };
    glassWalls(
      gs,
      soft,
      w,
      h,
      Math.max(2, Math.round((0.3 * (maxx - minx)) / widthM)),
      Math.max(3, Math.round((0.4 * (maxx - minx)) / widthM))
    ).forEach(function (g) {
      g.glass = true;
      gs.push(g);
    });
    // type from thickness: >= 20 cm brick, >= 10 cm concrete, else glass
    function mapWall(g) {
      var t = (g.p1 - g.p0 + 1) * cmPx,
        ty = g.glass ? 'g' : t >= 20 ? 'b' : t >= 10 ? 'c' : 'g',
        m = (g.p0 + g.p1 + 1) / 2;
      cnt[ty]++;
      return g.o === 'h' ? [X(g.a), Y(m), X(g.b + 1), Y(m), ty] : [X(m), Y(g.a), X(m), Y(g.b + 1), ty];
    }
    // glass only goes in once we know it's a facade (below)
    var walls = gs
      .filter(function (g) {
        return !g.glass;
      })
      .map(mapWall);
    var X1 = X(minx),
      X2 = X(maxx),
      Y1 = Y(miny),
      Y2 = Y(maxy),
      bpx = X2 - X1,
      bh = Y2 - Y1;

    // outline
    var wallM = new Uint8Array(w * h);
    gs.forEach(function (g) {
      for (var q = g.p0; q <= g.p1; q++)
        for (var a = g.a; a <= g.b; a++) wallM[g.o === 'h' ? q * w + a : a * w + q] = 1;
    });
    var pxm = (maxx - minx) / widthM,
      rC = Math.max(1, Math.round((clamp(+$('bpOpen').value || 1, 0.5, 4) / 2) * pxm));
    var bridged = bridgeGaps(gs, soft, w, h, Math.round(4 * pxm), {
      x0: minx,
      x1: maxx - 1,
      y0: miny,
      y1: maxy - 1
    });
    for (i = 0; i < w * h; i++) if (bridged.mask[i]) wallM[i] = 1;
    var FP = footprint(wallM, dark, w, h, rC, pxm, $('bpBalc').checked),
      zones = [],
      outline,
      fpNote;
    // drop notches < 30 cm
    function toView(poly) {
      return simplify(poly, Math.max(1.2, 0.3 * pxm)).map(function (q) {
        return [X(q[0]), Y(q[1])];
      });
    }
    if (FP && FP.area > 0.3 * (maxx - minx) * (maxy - miny)) {
      outline = toView(traceOutline(FP.parts[0], w, h));
      FP.parts.slice(1).forEach(function (m) {
        zones.push({ t: 'in', poly: toView(traceOutline(m, w, h)) });
      });
      FP.outs.forEach(function (m) {
        zones.push({ t: 'out', poly: toView(traceOutline(m, w, h)) });
      });
      var nOut = FP.outs.length;
      fpNote =
        ' Outline with ' +
        outline.length +
        ' corners' +
        (FP.parts.length > 1 ? ' in ' + FP.parts.length + ' parts' : '') +
        (nOut ? ', ' + nOut + ' balcony/terrace' : '') +
        ' detected' +
        (bridged.count ? ', window openings closed' : '') +
        '.';
    } else {
      FP = null;
      outline = [
        [X1, Y1],
        [X2, Y1],
        [X2, Y2],
        [X1, Y2]
      ];
      fpNote =
        ' Outline not detected reliably (open outer wall?), using a rectangle; adjust it under "Floor area".';
    }
    // facade = building on one side only;
    // lines inside are usually furniture
    if (FP)
      gs.forEach(function (g) {
        if (!g.glass) return;
        var pm = (g.p0 + g.p1) >> 1,
          mid = (g.a + g.b) >> 1,
          off = ((g.p1 - g.p0) >> 1) + 3,
          P = g.o === 'h' ? h : w;
        function inside(p) {
          return p >= 0 && p < P && !!FP.fp[g.o === 'h' ? p * w + mid : mid * w + p];
        }
        if (inside(pm - off) !== inside(pm + off)) walls.push(mapWall(g));
      });
    // L/U shapes: pull start points inside
    var core = null;
    if (FP) {
      var notFp = new Uint8Array(w * h);
      for (var q2 = 0; q2 < w * h; q2++) notFp[q2] = FP.fp[q2] ? 0 : 1;
      var grown = boxAny(notFp, w, h, Math.max(2, Math.round(0.6 * pxm)));
      core = new Uint8Array(w * h);
      for (q2 = 0; q2 < w * h; q2++) core[q2] = grown[q2] ? 0 : 1;
    }
    function nudge(pt) {
      if (!core) return pt;
      var rx = Math.round((pt[0] - ox) / sc),
        ry = Math.round((pt[1] - oy) / sc),
        bd = 1e18,
        bi = -1;
      if (rx >= 0 && ry >= 0 && rx < w && ry < h && core[ry * w + rx]) return pt;
      for (var i = 0; i < w * h; i++)
        if (core[i]) {
          var dx = (i % w) - rx,
            dy = (i - (i % w)) / w - ry,
            dd = dx * dx + dy * dy;
          if (dd < bd) {
            bd = dd;
            bi = i;
          }
        }
      return bi < 0 ? pt : [X((bi % w) + 0.5), Y(Math.floor(bi / w) + 0.5)];
    }
    // about one AP per 150 m²
    var areaM2 = FP ? FP.area / (pxm * pxm) : widthM * ((bh * widthM) / bpx);
    var n = clamp(Math.round(areaM2 / 150), 1, 6);
    var cols = clamp(Math.round(Math.sqrt((n * bpx) / bh)), 1, n),
      rows = Math.ceil(n / cols),
      apl = [];
    for (var k = 0; k < n; k++)
      apl.push(
        nudge([
          Math.round(X1 + (((k % cols) + 0.5) * bpx) / cols),
          Math.round(Y1 + ((Math.floor(k / cols) + 0.5) * bh) / rows)
        ])
      );
    // smaller JPEG so it fits into localStorage
    var B = Math.min(1, 1400 / Math.max(iw, ih)),
      bc = document.createElement('canvas');
    bc.width = Math.round(iw * B);
    bc.height = Math.round(ih * B);
    var bx = bc.getContext('2d');
    bx.fillStyle = '#fff';
    bx.fillRect(0, 0, bc.width, bc.height);
    bx.drawImage(bp.img, 0, 0, bc.width, bc.height);

    var p = {
      id: bp.planId || 'imp' + Date.now().toString(36),
      name: bp.name,
      label: bp.name + ' (import)',
      custom: true,
      widthM: widthM,
      bpx: bpx,
      outline: outline,
      zones: zones,
      aps: apl,
      walls: walls,
      items: [['router'].concat(nudge([Math.round(X1 + bpx / 2), Math.round(Y1 + bh * 0.88)]))],
      bg: {
        src: bc.toDataURL('image/jpeg', 0.72),
        x: Math.round(ox),
        y: Math.round(oy),
        w: Math.round(w * sc),
        h: Math.round(h * sc)
      }
    };
    var old = PLANS.filter(function (q) {
      return q.id === p.id;
    })[0];
    if (old) {
      PLANS[PLANS.indexOf(old)] = p;
      delete saved[p.id];
    } else {
      PLANS.push(p);
      bp.planId = p.id;
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      sel2.appendChild(o);
    }
    sel2.value = p.id;
    loadPlan(p.id);
    $('bpInfo').textContent =
      '"' +
      bp.name +
      '": ' +
      walls.length +
      ' walls detected (' +
      cnt.b +
      ' load-bearing, ' +
      cnt.c +
      ' concrete, ' +
      cnt.g +
      ' glass).' +
      fpNote +
      (bp.dimNote || ' Check the width and correct it above if needed.') +
      ' Wrong walls can be fixed under Building > Edit walls.';
    showTab('bld');
    var card = $('bpCard');
    card.classList.add('flash');
    setTimeout(function () {
      card.classList.remove('flash');
    }, 1600);
    if (card.getBoundingClientRect().top > window.innerHeight)
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('bpDel').addEventListener('click', function () {
    if (!plan.custom) return;
    var id = plan.id;
    PLANS.splice(PLANS.indexOf(plan), 1);
    delete saved[id];
    var o = sel2.querySelector('option[value="' + id + '"]');
    if (o) o.remove();
    if (bp.planId === id) bp.planId = null;
    sel2.value = PLANS[0].id;
    loadPlan(PLANS[0].id);
  });
  $('planRen').addEventListener('click', function () {
    if (!plan.custom) return;
    var n = prompt('New name for the plan:', plan.name);
    if (!n || !(n = n.trim())) return;
    plan.name = n.slice(0, 60);
    plan.label = plan.tag ? plan.name : plan.name + ' (import)';
    var o = sel2.querySelector('option[value="' + plan.id + '"]');
    if (o) o.textContent = plan.label;
    $('h1').textContent = plan.name;
    saveSoon();
  });
  // variant = deep copy, without the floor assignment
  $('planDup').addEventListener('click', function () {
    clearTimeout(saveTimer);
    var cp = function (v) {
      return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    };
    var n = 1;
    PLANS.forEach(function (q) {
      if (q.name.indexOf(plan.name.replace(/ - variant \d+$/, '') + ' - variant') === 0) n++;
    });
    var p = {
      id: 'var' + Date.now().toString(36),
      name: plan.name.replace(/ - variant \d+$/, '') + ' - variant ' + n,
      tag: 'Variant',
      custom: true,
      widthM: plan.widthM,
      bpx: plan.bpx,
      outline: cp(plan.outline),
      zones: cp(plan.zones),
      aps: cp(plan.aps),
      walls: cp(curWalls()),
      items: cp(plan.items),
      bg: plan.bg,
      width: plan.width
    };
    p.label = p.name;
    saved[p.id] = {
      aps: cp(S.aps),
      items: cp(S.items),
      cnt: cp(S.cnt),
      next: S.next,
      meas: cp(S.meas),
      rects: cp(S.rects)
    };
    PLANS.push(p);
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.label;
    sel2.appendChild(o);
    sel2.value = p.id;
    loadPlan(p.id);
    readout.innerHTML =
      '<span>Variant created. Switch between original and variant in the plan list above to compare.</span>';
  });
  $('showBg').addEventListener('change', function (e) {
    $('bgImg').style.display = plan.bg && e.target.checked ? '' : 'none';
  });

  function loadPlan(id) {
    stopTest();
    sel = null;
    plan = PLANS.filter(function (p) {
      return p.id === id;
    })[0];
    plan.upm = plan.bpx / plan.widthM;
    plan.is = Math.max(1, Math.min(1.8, plan.upm / 36));
    S = saved[id];
    if (!S) {
      S = saved[id] = { aps: defaultAps(), items: null, cnt: {}, next: 1 };
      makeItems();
    }
    buildWalls();
    floorPoly.setAttribute(
      'points',
      plan.outline
        .map(function (p) {
          return p.join(',');
        })
        .join(' ')
    );
    rebuildMask();
    var bgEl = $('bgImg');
    if (plan.bg) {
      bgEl.setAttribute('href', plan.bg.src);
      bgEl.setAttribute('x', plan.bg.x);
      bgEl.setAttribute('y', plan.bg.y);
      bgEl.setAttribute('width', plan.bg.w);
      bgEl.setAttribute('height', plan.bg.h);
    }
    bgEl.style.display = plan.bg && $('showBg').checked ? '' : 'none';
    $('bgRow').hidden = !plan.bg;
    $('bpDel').hidden = !plan.custom;
    $('planRen').hidden = !plan.custom;
    aps = S.aps;
    items = S.items;
    grids = aps.map(function () {
      return new Float32Array(GW * GH);
    });
    counts = aps.map(newCounts);
    dist = aps.map(function () {
      return new Float32Array(GW * GH);
    });
    shareArr = [];
    clients = [];
    net = { list: [], byId: {} };
    buildAps();
    buildItems();
    updateSel();
    $('h1').textContent = plan.name;
    probe.setAttribute('opacity', '0');
    readout.innerHTML = HINT_IDLE;
    setWidthUI(plan.width || plan.widthM);
    floorUi();
    moved = {};
    aps.forEach(function (_, k) {
      moved[k] = true;
    });
    redo = true;
    schedule();
  }

  var moved = {},
    redo = false,
    queued = false;
  function updateTexts() {
    var bd = BANDS[params.band];
    $('statTitle').textContent = 'Coverage at ' + bd.name;
    var eff = params.loss.map(function (v) {
      return (Math.round(v * bd.f * 10) / 10).toLocaleString('en-US');
    });
    var f1 = function (v) {
      return (Math.round(v * 10) / 10).toLocaleString('en-US');
    };
    $('formula').innerHTML =
      '<b>1. Propagation</b><br>FSPL(1 m) = 20·log₁₀(f) + 20·log₁₀(4π/c) = ' +
      BANDS.map(function (x) {
        return f1(x.l0) + ' dB (' + x.name + ')';
      }).join(', ') +
      '<br>L = L₀ + 10·n·log₁₀(d) + Σ kᵢ·Lᵢ with n = ' +
      f1(params.n) +
      ', Lᵢ per wall see "Loss per wall"' +
      '<br>P<sub>RX</sub> = P<sub>TX</sub> + G<sub>TX</sub> - L + G<sub>RX</sub> = ' +
      params.tx +
      ' + ' +
      params.gtx +
      ' dBm EIRP - L + G<sub>RX</sub> (map: 0 dBi, PC +2, laptop/TV 0, small devices -1…-2 dBi)' +
      '<br><b>2. Quality &amp; data rate</b><br>N = -174 dBm/Hz + 10·log₁₀(B) + ' +
      params.nf +
      ' dB = ' +
      [0, 1, 2]
        .map(function (x) {
          return f1(noiseDbm(params.bw[x], params.nf)) + ' dBm (' + params.bw[x] + ' MHz)';
        })
        .join(', ') +
      '<br>SINR = P<sub>RX</sub> / (N + Σ P<sub>interference</sub>) - interferers: APs and neighbouring networks on the same channel, microwaves' +
      '<br>C = B·log₂(1 + SINR' +
      (params.gap ? ' / ' + params.gap + ' dB' : '') +
      ') × streams, capped at the Wi-Fi 6 rate (MCS 11)' +
      '<br><b>3. Medium access (CSMA/CA)</b><br>T<sub>backoff</sub> = random(0…CW), 9 µs, CW = 15 → 31 → … → 1023 on collision, DIFS 34 µs, 7 retries, A-MPDU up to 2.5 ms. ' +
      'Devices in one cell (same channel, APs hear each other) are simulated for 0.2 s; speed test = this device saturated, the others at their usual demand.';
    $('wallHint').textContent =
      'Every wall on the direct path from the AP subtracts its value. The sliders apply to 2.4 GHz.' +
      (params.band > 0
        ? ' At ' +
          bd.name +
          ' they count ' +
          String(bd.f) +
          '×: ' +
          TNAME.map(function (n, i) {
            return n + ' ' + eff[i] + ' dB';
          }).join(', ') +
          '.'
        : ' These are typical values, not measurements.');
  }
  function schedule(k) {
    if (k === undefined) {
      redo = true;
    } else moved[k] = true;
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      var m = Object.keys(moved);
      moved = {};
      m.forEach(function (i) {
        computeCounts(+i);
      });
      if (redo) {
        aps.forEach(function (_, i) {
          derive(i);
        });
        buildForeign();
        redo = false;
      } else
        m.forEach(function (i) {
          derive(+i);
        });
      updateTexts();
      combine();
      refreshNet();
    });
  }
  function scheduleAll() {
    redo = true;
    schedule();
  }

  // controls
  var bandBtns = [].slice.call(document.querySelectorAll('#bandSeg button'));
  bandBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      params.band = +btn.getAttribute('data-band');
      bandBtns.forEach(function (o) {
        o.setAttribute('aria-checked', o === btn ? 'true' : 'false');
      });
      buildAps();
      scheduleAll();
    });
  });

  var sel2 = $('planSel');
  PLANS.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.label;
    sel2.appendChild(o);
  });
  sel2.addEventListener('change', function () {
    loadPlan(sel2.value);
  });

  var lineSel = $('lineSel');
  LINES.forEach(function (l, i) {
    var o = document.createElement('option');
    o.value = i;
    o.textContent =
      l.name + ', ' + l.down.toLocaleString('en-US') + ' / ' + l.up.toLocaleString('en-US') + ' Mbit/s';
    lineSel.appendChild(o);
  });
  lineSel.value = lineIdx;
  function lineInfo() {
    var l = LINES[lineIdx];
    $('lineInfo').textContent =
      'Download ' +
      l.down.toLocaleString('en-US') +
      ' Mbit/s, upload ' +
      l.up.toLocaleString('en-US') +
      ' Mbit/s, base latency ' +
      l.ping +
      ' ms. About 6 % go to protocol overhead; other devices using the line reduce the rest.';
  }
  lineSel.addEventListener('change', function () {
    lineIdx = +lineSel.value;
    lineInfo();
    stopTest();
    scheduleNet();
  });
  lineInfo();

  function palette(id, tools) {
    $(id).innerHTML = tools
      .map(function (t) {
        return '<button type="button" data-add="' + t + '">+ ' + ITEMS[t].label + '</button>';
      })
      .join('');
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) addItem(b.getAttribute('data-add'));
    });
  }
  palette('palF', FURN_TOOLS);
  palette('palD', DEV_TOOLS);
  palette('palN', NOISE_TOOLS);

  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (!sel) return;
      sel.mode = b.getAttribute('data-mode');
      modeBtns.forEach(function (o) {
        o.setAttribute('aria-checked', o === b ? 'true' : 'false');
      });
      stopTest();
      scheduleNet();
    });
  });
  $('selCh').addEventListener('change', function (e) {
    if (!sel || !sel.ch) return;
    sel.ch[+e.target.dataset.b] = +e.target.value;
    schedule();
  });
  $('selRot').addEventListener('click', function () {
    if (sel) rotateItem(sel);
  });
  $('selDel').addEventListener('click', function () {
    if (sel) removeItem(sel);
  });
  $('devList').addEventListener('click', function (e) {
    var b = e.target.closest('.devrow');
    if (!b) return;
    var id = b.getAttribute('data-id');
    items.forEach(function (it) {
      if (it.id === id) select(it);
    });
  });
  $('showLinks').addEventListener('change', function (e) {
    linksG.style.display = e.target.checked ? '' : 'none';
  });
  $('resetItems').addEventListener('click', function () {
    stopTest();
    sel = null;
    makeItems();
    items = S.items;
    buildItems();
    updateSel();
    scheduleNet();
  });

  svgTop.addEventListener('pointerdown', function (e) {
    if (
      e.target.closest &&
      (e.target.closest('.item') || e.target.closest('.ap') || e.target.closest('.hit'))
    )
      return;
    if (sel) {
      sel = null;
      stopTest();
      Object.keys(itemEls).forEach(function (id) {
        itemEls[id].classList.remove('sel');
      });
      updateSel();
    }
    if (editing && e.button === 0) {
      var p = toSvg(e),
        s = snapPt(p.x, p.y);
      draw = { x: s[0], y: s[1] };
      svgTop.setPointerCapture(e.pointerId);
      setGhost(draw.x, draw.y);
      e.preventDefault();
    }
  });

  svgTop.addEventListener('pointermove', function (e) {
    if (meas || (e.target.closest && (e.target.closest('.ap') || e.target.closest('.drag')))) return;
    var p = toSvg(e),
      i = Math.floor((p.x - VX) / CELL),
      j = Math.floor((p.y - VY) / CELL);
    if (i < 0 || j < 0 || i >= GW || j >= GH || !mask[j * GW + i]) {
      probe.setAttribute('opacity', '0');
      return;
    }
    var idx = j * GW + i,
      k = bestAp[idx];
    probe.setAttribute('cx', p.x);
    probe.setAttribute('cy', p.y);
    probe.setAttribute('opacity', '1');
    readout.innerHTML =
      k < 0
        ? '<span>No access point active.</span>'
        : '<strong>' +
          fmtDb(best[idx]) +
          '</strong><span>' +
          esc(apLabel(k)) +
          ', ' +
          BANDS[params.band].name +
          ', SINR ' +
          Math.round(sinrArr[idx]) +
          ' dB, ≈ ' +
          fmtMb(rateArr[idx]) +
          ' Mbit/s, ' +
          cntArr[idx] +
          ' AP' +
          (cntArr[idx] === 1 ? '' : 's') +
          ' in good range</span>';
  });
  var viewSel = $('viewSel'),
    profSel = $('profSel');
  PROFILES.forEach(function (p, i) {
    var o = document.createElement('option');
    o.value = i;
    o.textContent = p.name;
    profSel.appendChild(o);
  });
  viewSel.value = params.view;
  profSel.value = params.prof;
  viewSel.addEventListener('change', function () {
    params.view = viewSel.value;
    combine();
    saveSoon();
  });
  profSel.addEventListener('change', function () {
    params.prof = +profSel.value;
    combine();
    scheduleNet();
  });
  svgTop.addEventListener('pointerleave', function () {
    if (meas) return;
    probe.setAttribute('opacity', '0');
    readout.innerHTML = HINT_IDLE;
  });

  function bind(id, out, fn, unit, dec) {
    var el = $(id),
      o = $(out);
    function upd() {
      var v = parseFloat(el.value);
      o.textContent =
        v.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }) +
        (unit || '');
      fn(v);
    }
    el.addEventListener('input', function () {
      upd();
      scheduleAll();
    });
    upd();
  }
  bind(
    'pTx',
    'oTx',
    function (v) {
      params.tx = v;
    },
    ' dBm'
  );
  bind(
    'pGtx',
    'oGtx',
    function (v) {
      params.gtx = v;
    },
    ' dBi'
  );
  bind(
    'pNf',
    'oNf',
    function (v) {
      params.nf = v;
    },
    ' dB'
  );
  bind(
    'pGap',
    'oGap',
    function (v) {
      params.gap = v;
    },
    ' dB'
  );
  [0, 1, 2].forEach(function (b) {
    var s = $('bw' + b);
    s.value = params.bw[b];
    s.addEventListener('change', function () {
      params.bw[b] = +s.value;
      scheduleAll();
      saveSoon();
    });
  });
  bind(
    'pN',
    'oN',
    function (v) {
      params.n = v;
    },
    '',
    1
  );
  bind(
    'pW',
    'oW',
    function (v) {
      params.width = v;
      if (plan) plan.width = v;
    },
    ' m'
  );
  bind(
    'dG',
    'oG',
    function (v) {
      params.loss[0] = v;
    },
    ' dB'
  );
  bind(
    'dC',
    'oC',
    function (v) {
      params.loss[1] = v;
    },
    ' dB'
  );
  bind(
    'dB',
    'oB',
    function (v) {
      params.loss[2] = v;
    },
    ' dB'
  );
  bind(
    'dD',
    'oD',
    function (v) {
      params.loss[3] = v;
    },
    ' dB'
  );
  bind(
    'dM',
    'oM',
    function (v) {
      params.loss[4] = v;
    },
    ' dB'
  );
  bind(
    'pSlab',
    'oSlab',
    function (v) {
      params.slab = v;
    },
    ' dB'
  );

  LVLS.forEach(function (l) {
    var o = document.createElement('option');
    o.value = l[0];
    o.textContent = l[1];
    $('flLvl').appendChild(o);
  });
  function floorUi() {
    $('flBld').value = S.bld || '';
    $('flLvl').value = S.lvl || 0;
    var names = {};
    PLANS.forEach(function (p) {
      var s = saved[p.id];
      if (s && s.bld) names[s.bld] = 1;
    });
    $('flList').innerHTML = Object.keys(names)
      .map(function (n) {
        return '<option value="' + esc(n) + '">';
      })
      .join('');
  }
  $('flBld').addEventListener('change', function (e) {
    var v = e.target.value.trim().slice(0, 40);
    if (v) S.bld = v;
    else delete S.bld;
    floorUi();
    scheduleAll();
    saveSoon();
  });
  $('flLvl').addEventListener('change', function (e) {
    S.lvl = +e.target.value;
    scheduleAll();
    saveSoon();
  });

  function setWidthUI(v) {
    params.width = v;
    $('pW').value = v;
    $('oW').textContent = v.toLocaleString('en-US') + ' m';
  }

  function defaultAps() {
    return plan.aps.map(function (p, k) {
      return { x: p[0], y: p[1], on: true, ch: defCh(k) };
    });
  }
  $('reset').addEventListener('click', function () {
    S.aps = defaultAps();
    loadPlan(plan.id);
  });
  $('addAp').addEventListener('click', addAp);
  $('autoCh').addEventListener('click', function () {
    autoChannels();
  });

  // AP optimiser
  // precompute signal for candidate sites x sample points on a coarse grid,
  // place greedily, then try swapping each AP against every candidate
  function apOptimize(auto) {
    var b = params.band,
      pf = PROFILES[params.prof];
    var budget = 6e7 / Math.max(20, nW),
      es = 4,
      cs = 8,
      E,
      C;
    function pts(step) {
      var a = [];
      for (var j = step >> 1; j < GH; j += step)
        for (var i = step >> 1; i < GW; i += step)
          if (mask[j * GW + i] && !outM[j * GW + i]) a.push(VX + (i + 0.5) * CELL, VY + (j + 0.5) * CELL);
      return a;
    }
    do {
      E = pts(es);
      C = pts(cs);
      if ((E.length * C.length) / 4 <= budget) break;
      es++;
      cs += 2;
    } while (es < 24);
    var nE = E.length / 2,
      nC = C.length / 2,
      M = new Float32Array(nC * nE),
      probeAp = { x: 0, y: 0 };
    for (var c = 0; c < nC; c++) {
      probeAp.x = C[2 * c];
      probeAp.y = C[2 * c + 1];
      for (var e = 0; e < nE; e++) M[c * nE + e] = sigAt(probeAp, E[2 * e], E[2 * e + 1], b);
    }
    function u(v) {
      return (v >= pf.good ? 1 : v >= pf.ok ? 0.5 : 0) + 0.002 * clamp(v + 100, 0, 60);
    }
    function bestAdd(bv, skip) {
      var bc = -1,
        bs = -1;
      for (var c = 0; c < nC; c++) {
        if (skip.indexOf(c) >= 0) continue;
        var s = 0,
          o = c * nE;
        for (var e = 0; e < nE; e++) {
          var v = M[o + e];
          s += u(v > bv[e] ? v : bv[e]);
        }
        if (s > bs) {
          bs = s;
          bc = c;
        }
      }
      return bc;
    }
    function bvOf(list) {
      var bv = new Float32Array(nE).fill(-200);
      list.forEach(function (c) {
        for (var e = 0; e < nE; e++) if (M[c * nE + e] > bv[e]) bv[e] = M[c * nE + e];
      });
      return bv;
    }
    function cov(list) {
      var bv = bvOf(list),
        g = 0;
      for (var e = 0; e < nE; e++) if (bv[e] >= pf.good) g++;
      return g / nE;
    }
    var target = auto
        ? 12
        : Math.max(
            1,
            aps.filter(function (a) {
              return a.on;
            }).length
          ),
      chosen = [];
    while (chosen.length < target) {
      chosen.push(bestAdd(bvOf(chosen), chosen));
      if (auto && cov(chosen) >= 0.95) break;
    }
    for (var round = 0; round < 2; round++)
      for (var k = 0; k < chosen.length; k++) {
        var others = chosen.filter(function (_, i) {
          return i !== k;
        });
        chosen[k] = bestAdd(bvOf(others), others);
      }
    return {
      pos: chosen.map(function (c) {
        return [Math.round(C[2 * c]), Math.round(C[2 * c + 1])];
      }),
      cov: cov(chosen)
    };
  }
  function runOptimize(auto) {
    var btn = $(auto ? 'optAuto' : 'optKeep'),
      txt = btn.textContent;
    btn.textContent = 'Calculating …';
    btn.disabled = true;
    setTimeout(function () {
      var t0 = performance.now(),
        r = apOptimize(auto);
      S.aps = r.pos.map(function (p, k) {
        return { x: p[0], y: p[1], on: true, ch: defCh(k) };
      });
      loadPlan(plan.id);
      [0, 1, 2].forEach(function (b) {
        autoChannels(b);
      });
      btn.textContent = txt;
      btn.disabled = false;
      $('optInfo').textContent =
        r.pos.length +
        ' AP' +
        (r.pos.length === 1 ? '' : 's') +
        ' placed: ' +
        Math.round(r.cov * 100) +
        ' % of the area good at ' +
        BANDS[params.band].name +
        ' (' +
        PROFILES[params.prof].name.replace('Requirement: ', '') +
        '). Channels reassigned. Undo with Ctrl+Z. (' +
        Math.round(performance.now() - t0) +
        ' ms)' +
        (auto && r.cov < 0.95 ? ' Even 12 APs do not reach 95 %: check walls or scale.' : '');
    }, 30);
  }
  // materials
  function materials() {
    var router = null,
      mpp = params.width / plan.bpx,
      runs = [],
      models = {},
      poe = 0;
    items.forEach(function (it) {
      if (it.t === 'router') router = it;
    });
    function len(x, y) {
      return router ? Math.round((Math.abs(x - router.x) + Math.abs(y - router.y)) * mpp * 1.2 + 3) : 0;
    }
    aps.forEach(function (ap, k) {
      if (!ap.on) return;
      var md = apModel(ap);
      models[md.name] = (models[md.name] || 0) + 1;
      if (md.bh) return; // mesh, no cable
      runs.push({ to: apName(ap, k), m: len(ap.x, ap.y), poe: true });
      poe++;
    });
    net.list.forEach(function (r) {
      if (r.type === 'lan') runs.push({ to: itemLabel(r.it), m: len(r.it.x, r.it.y), poe: false });
    });
    var total = 0,
      longest = null;
    runs.forEach(function (r) {
      total += r.m;
      if (!longest || r.m > longest.m) longest = r;
    });
    return {
      router: !!router,
      runs: runs,
      total: total,
      longest: longest,
      poe: poe,
      ports: runs.length,
      models: models
    };
  }
  function renderMat() {
    var M = materials(),
      h = '';
    if (!M.router) {
      $('matBox').innerHTML = '<p class="hint">No router on the plan.</p>';
      return;
    }
    h +=
      '<div class="stat"><div class="top"><span>Network cable (Cat 6A)</span><b>≈ ' +
      M.total.toLocaleString('en-US') +
      ' m</b></div></div>';
    h += '<div class="stat"><div class="top"><span>Cable runs</span><b>' + M.ports + '</b></div></div>';
    h +=
      '<div class="stat"><div class="top"><span>Switch ports / PoE</span><b>' +
      M.ports +
      ' / ' +
      M.poe +
      '</b></div></div>';
    if (M.longest)
      h +=
        '<p class="hint" style="margin-top:6px">Longest run: ' +
        esc(M.longest.to) +
        ' ≈ ' +
        M.longest.m +
        ' m' +
        (M.longest.m > 90 ? ' - over 90 m: beyond the Ethernet limit, an extra switch is needed.' : '') +
        '</p>';
    h +=
      '<h3>Access points</h3>' +
      Object.keys(M.models)
        .map(function (n) {
          return '<div>' + M.models[n] + ' × ' + esc(n) + '</div>';
        })
        .join('');
    $('matBox').innerHTML = h;
  }

  // report
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function buildReport() {
    var mpp = params.width / plan.bpx,
      x0 = 1e9,
      y0 = 1e9,
      pf = PROFILES[params.prof];
    plan.outline.forEach(function (p) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
    });
    var m = function (v) {
      return (Math.round(v * mpp * 10) / 10).toLocaleString('en-US');
    };
    var h =
      '<h2>Wi-Fi plan: ' +
      esc(plan.name) +
      '</h2><p>Created ' +
      new Date().toLocaleDateString('en-US') +
      ', map: ' +
      BANDS[params.band].name +
      ', ' +
      esc(pf.name) +
      ', building width ' +
      params.width.toLocaleString('en-US') +
      ' m, internet: ' +
      esc(LINES[lineIdx].name) +
      '</p>';
    h +=
      '<p>Coverage: <b>' +
      $('sGood').textContent +
      '</b> good, ' +
      $('sOk').textContent +
      ' fair, ' +
      $('sBad').textContent +
      ' weak. ' +
      esc($('chHint').textContent) +
      '</p>';
    h +=
      '<h2>Access points</h2><table><tr><th>AP</th><th>Model</th><th>Position (m from left/top)</th><th>Channel 2.4 / 5 / 6 GHz</th><th>Status</th><th>Devices, area</th></tr>';
    aps.forEach(function (ap, k) {
      h +=
        '<tr><td>' +
        esc(apName(ap, k)) +
        '</td><td>' +
        apModel(ap).name +
        '</td><td>' +
        m(ap.x - x0) +
        ' / ' +
        m(ap.y - y0) +
        '</td><td>' +
        CH[0][ap.ch[0]] +
        ' / ' +
        CH[1][ap.ch[1]] +
        ' / ' +
        CH[2][ap.ch[2]] +
        '</td><td>' +
        (ap.on ? 'on' : 'off') +
        '</td><td>' +
        (clients[k] || 0) +
        ', ' +
        (shareArr[k] || 0) +
        ' %</td></tr>';
    });
    h += '</table><h2>Devices</h2><table><tr><th>Device</th><th>Connection</th><th>≈ Download</th></tr>';
    net.list.forEach(function (r) {
      h +=
        '<tr><td>' +
        esc(itemLabel(r.it)) +
        '</td><td>' +
        esc(connText(r)) +
        '</td><td>' +
        (r.ok ? fmtMb(r.down) + ' Mbit/s' : 'offline') +
        '</td></tr>';
    });
    var M = materials();
    if (M.router) {
      h +=
        '</table><h2>Materials &amp; cabling</h2><p>Network cable ≈ <b>' +
        M.total.toLocaleString('en-US') +
        ' m</b> (Cat 6A), ' +
        M.ports +
        ' switch ports, ' +
        M.poe +
        ' with PoE, ' +
        Object.keys(M.models)
          .map(function (n) {
            return M.models[n] + ' × ' + esc(n);
          })
          .join(', ') +
        '</p><table><tr><th>Cable run from router to</th><th>Length</th><th>PoE</th></tr>';
      M.runs.forEach(function (r) {
        h +=
          '<tr><td>' +
          esc(r.to) +
          '</td><td>≈ ' +
          r.m +
          ' m' +
          (r.m > 90 ? ' (over 90 m)' : '') +
          '</td><td>' +
          (r.poe ? 'yes' : '') +
          '</td></tr>';
      });
    }
    h +=
      '</table><p style="font-size:11px;color:#555">Calculated with a simplified radio model (distance, wall loss, co-channel interference). Verify with an on-site measurement before installing.</p>';
    return h;
  }
  window.addEventListener('beforeprint', function () {
    var r = $('report');
    r.innerHTML = buildReport();
    r.hidden = false;
  });
  window.addEventListener('afterprint', function () {
    $('report').hidden = true;
  });
  $('printBtn').addEventListener('click', function () {
    window.print();
  });

  // PNG export
  // the SVG needs the CSS and resolved variables inlined to render as an image
  function exportPng() {
    var W = VW,
      H = VH,
      cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var cx = cv.getContext('2d'),
      cs = getComputedStyle(document.documentElement);
    cx.fillStyle = cs.getPropertyValue('--plan-out').trim() || '#fff';
    cx.fillRect(0, 0, W, H);
    cx.beginPath();
    plan.outline.forEach(function (p, i) {
      cx[i ? 'lineTo' : 'moveTo'](p[0] - VX, p[1] - VY);
    });
    cx.closePath();
    cx.fillStyle = cs.getPropertyValue('--plan').trim() || '#f8faf9';
    cx.fill();
    function fillPoly(pts, col) {
      cx.beginPath();
      pts.forEach(function (p, i) {
        cx[i ? 'lineTo' : 'moveTo'](p[0] - VX, p[1] - VY);
      });
      cx.closePath();
      cx.fillStyle = col;
      cx.fill();
    }
    (plan.zones || []).forEach(function (z) {
      fillPoly(z.poly, cs.getPropertyValue('--plan').trim());
    });
    (S.rects || []).forEach(function (r) {
      fillPoly(
        [
          [r.x1, r.y1],
          [r.x2, r.y1],
          [r.x2, r.y2],
          [r.x1, r.y2]
        ],
        cs.getPropertyValue(r.t === 'cut' ? '--plan-out' : '--plan').trim()
      );
    });
    cx.imageSmoothingEnabled = true;
    cx.drawImage($('heat'), 0, 0, W, H);
    var clone = svgTop.cloneNode(true);
    ['probe', 'ghost'].forEach(function (id) {
      var n = clone.querySelector('#' + id);
      if (n) n.remove();
    });
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('width', W);
    clone.setAttribute('height', H);
    var vars = [
      '--glass',
      '--concrete',
      '--brick',
      '--accent',
      '--accent-fg',
      '--fg',
      '--surface',
      '--plan',
      '--font-display',
      '--font-body'
    ]
      .map(function (v) {
        return v + ':' + cs.getPropertyValue(v);
      })
      .join(';');
    var css = [].map
      .call(document.querySelectorAll('style'), function (s) {
        return s.textContent;
      })
      .join('\n');
    var st = document.createElementNS(NS, 'style');
    st.textContent = css + '\nsvg{' + vars + '}';
    clone.insertBefore(st, clone.firstChild);
    var url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
    );
    var im = new Image();
    im.onload = function () {
      cx.drawImage(im, 0, 0, W, H);
      URL.revokeObjectURL(url);
      cv.toBlob(function (b) {
        download('WiFi map ' + plan.name + ' ' + BANDS[params.band].name + '.png', b);
      });
    };
    im.onerror = function () {
      URL.revokeObjectURL(url);
      alert('Export failed.');
    };
    im.src = url;
  }
  $('pngBtn').addEventListener('click', exportPng);

  var tabBtns = [].slice.call(document.querySelectorAll('#tabBar button'));
  function showTab(t) {
    document.querySelector('aside').setAttribute('data-tab', t);
    tabBtns.forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-t') === t ? 'true' : 'false');
    });
  }
  tabBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      showTab(b.getAttribute('data-t'));
    });
  });

  // help
  var help = $('help');
  function showHelp() {
    if (!help.open) help.showModal();
  }
  $('helpBtn').addEventListener('click', showHelp);
  $('helpClose').addEventListener('click', function () {
    help.close();
  });
  $('helpImport').addEventListener('click', function () {
    help.close();
    $('bpOpen').click();
  });
  help.addEventListener('close', function () {
    try {
      localStorage.setItem(KEY + '-seen', '1');
    } catch (e) {}
  });
  var seen = null;
  try {
    seen = localStorage.getItem(KEY + '-seen');
  } catch (e) {}
  if (!seen) setTimeout(showHelp, 400); // first visit
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || help.open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
      return;
    if (e.key === '?') {
      e.preventDefault();
      showHelp();
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      var bb = document.querySelector('#bandSeg [data-band="' + (+e.key - 1) + '"]');
      if (bb) bb.click();
    } else if (e.key === 'v' || e.key === 'V') {
      var o = viewSel.options;
      viewSel.selectedIndex = (viewSel.selectedIndex + 1) % o.length;
      viewSel.dispatchEvent(new Event('change'));
    }
  });

  $('optKeep').addEventListener('click', function () {
    runOptimize(false);
  });
  $('optAuto').addEventListener('click', function () {
    runOptimize(true);
  });

  sel2.value = startPlan;
  loadPlan(startPlan);
})();
