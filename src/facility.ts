import * as Phaser from "phaser";
import { ROOMS, isHiding, type GameState, type RoomId } from "./simulation";

type Room = (typeof ROOMS)[number];
type Point = { x: number; y: number };
const W = 1000,
  H = 680;
const center = (r: Room): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const roomFor = (id: RoomId) => ROOMS.find((r) => r.id === id)!;
const routes: { from: RoomId; to: RoomId; points: number[][] }[] = [
  {
    from: "reception",
    to: "corridor",
    points: [
      [230, 515],
      [350, 515],
      [350, 445],
      [495, 445],
    ],
  },
  {
    from: "reception",
    to: "ward",
    points: [
      [230, 515],
      [230, 260],
    ],
  },
  {
    from: "ward",
    to: "archive",
    points: [
      [230, 260],
      [370, 260],
      [370, 215],
      [505, 215],
    ],
  },
  {
    from: "archive",
    to: "corridor",
    points: [
      [505, 215],
      [505, 445],
    ],
  },
  {
    from: "corridor",
    to: "laboratory",
    points: [
      [495, 445],
      [650, 445],
      [650, 230],
      [805, 230],
    ],
  },
  {
    from: "corridor",
    to: "generator",
    points: [
      [495, 445],
      [650, 445],
      [650, 495],
      [805, 495],
    ],
  },
  {
    from: "corridor",
    to: "exit",
    points: [
      [495, 445],
      [545, 445],
      [545, 602],
    ],
  },
  {
    from: "laboratory",
    to: "generator",
    points: [
      [805, 230],
      [805, 495],
    ],
  },
];

function paintFacility(ctx: CanvasRenderingContext2D) {
  let seed = 9457;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const line = (points: number[][], color: string, width = 1) => {
    ctx.beginPath();
    points.forEach(([x, y], i) =>
      i ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!),
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    stroke?: string,
  ) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  };
  const text = (
    s: string,
    x: number,
    y: number,
    size = 9,
    color = "#698480",
  ) => {
    ctx.font = `${size}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };
  const bolt = (x: number, y: number) => {
    ctx.fillStyle = "#7c9185";
    ctx.fillRect(x, y, 2, 2);
  };
  const blood = (x: number, y: number, r = 18) => {
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.ellipse(
        x + (random() - 0.5) * r * 2,
        y + (random() - 0.5) * r,
        random() * r * 0.4 + 1,
        random() * r * 0.18 + 1,
        random() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(112,47,37,${random() * 0.21 + 0.12})`;
      ctx.fill();
    }
  };
  const bed = (x: number, y: number, rot = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    box(-18, -29, 42, 64, "#050c0e");
    box(-21, -32, 39, 62, "#334640", "#7a8c7b");
    box(-17, -28, 31, 51, "#67756b", "#8f9a84");
    box(-14, -24, 25, 12, "#a0a48b", "#b6b799");
    box(-14, -8, 25, 27, "#697b6e");
    line(
      [
        [-11, 0],
        [8, 3],
        [-8, 7],
        [9, 9],
      ],
      "#7a8b7b",
    );
    line(
      [
        [-20, -23],
        [-20, 21],
      ],
      "#9ca58d",
      2,
    );
    line(
      [
        [17, -23],
        [17, 21],
      ],
      "#9ca58d",
      2,
    );
    for (const dx of [-18, 14])
      for (const dy of [-35, 32]) box(dx, dy, 4, 5, "#798a7e");
    ctx.restore();
  };
  const chair = (x: number, y: number, rot = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    box(-10, -8, 21, 22, "#090f11");
    box(-12, -12, 21, 20, "#35483f", "#667c68");
    box(-12, -15, 21, 5, "#708875");
    line(
      [
        [-13, -8],
        [-13, 12],
      ],
      "#6e8473",
      2,
    );
    line(
      [
        [11, -8],
        [11, 12],
      ],
      "#6e8473",
      2,
    );
    ctx.restore();
  };
  const table = (x: number, y: number, w: number, h: number) => {
    box(x + 5, y + 7, w, h, "#071012");
    box(x, y, w, h, "#48594e", "#87947d");
    box(x + 3, y + 3, w - 6, h - 6, "#59695a");
    for (const dx of [4, w - 6])
      for (const dy of [4, h - 6]) bolt(x + dx, y + dy);
  };
  const computer = (x: number, y: number) => {
    box(x + 2, y + 2, 24, 19, "#071014");
    box(x, y, 23, 17, "#1a2928", "#7c8b75");
    box(x + 3, y + 3, 17, 10, "#78bd9a");
    box(x + 7, y + 18, 10, 3, "#6a7a6b");
    box(x - 1, y + 24, 25, 7, "#42564b", "#697d67");
    line(
      [
        [x + 3, y + 27],
        [x + 19, y + 27],
      ],
      "#8d9b7f",
    );
  };
  ctx.fillStyle = "#080f11";
  ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(500, 350, 70, 500, 350, 580);
  vignette.addColorStop(0, "#172224");
  vignette.addColorStop(1, "#060c0f");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  for (let y = 38; y < H; y += 24)
    for (let x = 40; x < W; x += 24) {
      ctx.fillStyle = "rgba(121,157,147,.13)";
      ctx.fillRect(x, y, 1, 1);
    }
  ctx.strokeStyle = "#22322f";
  ctx.lineWidth = 1;
  ctx.strokeRect(64.5, 89.5, 882, 557);
  for (let x = 88; x < 940; x += 48) {
    line(
      [
        [x, 85],
        [x, 89],
      ],
      "#50635b",
    );
    text(String(Math.round(x / 24)).padStart(2, "0"), x - 5, 78, 7, "#4f635c");
  }
  for (let y = 113; y < 650; y += 48) {
    line(
      [
        [60, y],
        [64, y],
      ],
      "#50635b",
    );
    text(String(Math.round(y / 24)).padStart(2, "0"), 43, y + 3, 7, "#4f635c");
  }
  text("SUBLEVEL 01  /  INPATIENT BLOCK", 80, 35, 9, "#64867a");
  text("NORTH WING", 80, 58, 19, "#b8c7b5");
  text("ARCHITECTURAL TELEMETRY", 725, 34, 8, "#64867a");
  text("REV. 09  ·  1:150  ·  LIVE FEED", 725, 51, 8, "#8da595");
  // Exposed conduits beneath the architecture.
  line(
    [
      [92, 611],
      [92, 115],
      [937, 115],
      [937, 613],
      [664, 613],
    ],
    "#263c35",
    3,
  );
  line(
    [
      [98, 618],
      [98, 121],
      [931, 121],
      [931, 620],
      [664, 620],
    ],
    "#142d28",
    2,
  );
  for (let y = 150; y < 590; y += 52) {
    line(
      [
        [88, y],
        [102, y],
      ],
      "#31463c",
      2,
    );
    line(
      [
        [927, y],
        [941, y],
      ],
      "#31463c",
      2,
    );
  }
  // Concrete connection tunnels, all continuous with the room floors.
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  for (const route of routes) {
    line(route.points, "#020808", 55);
    line(route.points, "#64726a", 43);
    line(route.points, "#283b35", 38);
    line(route.points, "#31463d", 30);
  }
  for (const route of routes) {
    ctx.setLineDash([3, 9]);
    line(route.points, "rgba(141,169,133,.17)", 1);
    ctx.setLineDash([]);
  }
  for (const r of ROOMS) {
    ctx.save();
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    box(r.x - 8, r.y - 8, r.w + 16, r.h + 16, "#192824");
    ctx.restore();
    box(r.x - 6, r.y - 6, r.w + 12, r.h + 12, "#6d7b6a", "#879481");
    box(r.x - 2, r.y - 2, r.w + 4, r.h + 4, "#1b2c28", "#263c30");
    const floor = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    floor.addColorStop(0, "#44584a");
    floor.addColorStop(0.35, "#2a4036");
    floor.addColorStop(1, "#1b2d28");
    ctx.fillStyle = floor;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    // Uneven square ceramic tiles and dirty grout.
    for (let y = r.y; y < r.y + r.h; y += 24)
      for (let x = r.x; x < r.x + r.w; x += 24) {
        box(x + 1, y + 1, 22, 22, `rgba(143,157,128,${random() * 0.07})`);
        line(
          [
            [x, y],
            [x + 24, y],
            [x + 24, y + 24],
          ],
          "rgba(5,18,16,.25)",
        );
      }
    for (let i = 0; i < 150; i++) {
      const x = r.x + random() * r.w,
        y = r.y + random() * r.h;
      ctx.fillStyle = `rgba(8,16,13,${random() * 0.24})`;
      ctx.fillRect(x, y, random() * 5 + 0.5, random() * 2 + 0.5);
    }
    const light = ctx.createRadialGradient(
      r.x + r.w * 0.35,
      r.y + 20,
      2,
      r.x + r.w * 0.35,
      r.y + 20,
      r.w * 0.9,
    );
    light.addColorStop(0, "rgba(154,187,126,.17)");
    light.addColorStop(1, "rgba(43,82,54,0)");
    ctx.fillStyle = light;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Wall shadows give the floor a shallow, physical recess.
    const shadow = ctx.createLinearGradient(0, r.y, 0, r.y + 24);
    shadow.addColorStop(0, "rgba(0,6,5,.65)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(r.x, r.y, r.w, 24);
    for (let i = 0; i < 4; i++) {
      const x = r.x + random() * r.w,
        y = r.y + random() * r.h;
      line(
        [
          [x, y],
          [x + 5, y + 11],
          [x + 2, y + 16],
          [x + 8, y + 26],
        ],
        "rgba(1,12,9,.3)",
      );
    }
    ctx.restore();
    for (let x = r.x + 9; x < r.x + r.w - 5; x += 34) {
      box(x, r.y - 7, 16, 2, "#9caa8a");
      box(x + 4, r.y + r.h + 4, 12, 2, "#414e43");
    }
    // Surface chips break up the otherwise severe room outline.
    for (let i = 0; i < 16; i++) {
      const x = r.x + random() * r.w;
      box(x, r.y - 6, random() * 7 + 1, random() * 3 + 1, "#23372e");
    }
  }
  // Doors sit across the cut-outs in the concrete walls.
  const door = (x: number, y: number, vertical = false, red = false) => {
    ctx.save();
    ctx.translate(x, y);
    if (vertical) ctx.rotate(Math.PI / 2);
    box(-21, -8, 42, 16, "#263a32");
    box(-17, -2, 34, 4, "#899779", "#a3ad8d");
    line(
      [
        [-17, -4],
        [-17, -21],
        [17, -21],
      ],
      "rgba(161,182,145,.3)",
    );
    ctx.fillStyle = red ? "#d55d49" : "#99b890";
    ctx.fillRect(-22, -6, 3, 12);
    ctx.fillRect(20, -6, 3, 12);
    ctx.restore();
  };
  door(230, 430);
  door(230, 360);
  door(340, 515, true);
  door(365, 445, true);
  door(340, 260, true);
  door(400, 215, true);
  door(505, 300);
  door(505, 370);
  door(625, 445, true);
  door(700, 230, true);
  door(700, 495, true);
  door(805, 330);
  door(805, 410);
  door(545, 520);
  door(545, 565, false, true);
  // Ward: six worn hospital beds, bedside cabinets and curtains.
  for (const y of [215, 306])
    for (const x of [157, 302]) {
      bed(x, y, Math.PI / 2);
    }
  for (const x of [141, 270])
    for (const y of [179, 270]) {
      box(x, y, 23, 17, "#52614f", "#94a085");
      box(x + 6, y + 7, 11, 2, "#a1a78b");
    }
  line(
    [
      [215, 170],
      [215, 339],
    ],
    "#7e8c74",
    2,
  );
  line(
    [
      [220, 172],
      [220, 338],
    ],
    "rgba(135,157,130,.3)",
    7,
  );
  blood(258, 335, 18);
  // Archive: rows leave the east-west and south access aisles open.
  for (const x of [423, 482, 541])
    for (const y of [159, 239]) {
      if (x === 482 && y === 239) continue;
      box(x + 5, y + 5, 39, 42, "#0e1e1c");
      box(x, y, 35, 42, "#4b5c49", "#8b9577");
      for (let sy = y + 3; sy < y + 40; sy += 20) {
        box(x + 3, sy, 29, 14, "#283d31");
        for (let i = 0; i < 7; i++)
          box(
            x + 4 + i * 4,
            sy + 1,
            2,
            11,
            ["#8a8c65", "#6c8b70", "#a59c73"][Math.floor(random() * 3)]!,
          );
        line(
          [
            [x, sy + 16],
            [x + 35, sy + 16],
          ],
          "#859576",
          2,
        );
      }
    }
  // Laboratory: work surfaces surround a clear central surgical aisle.
  table(751, 168, 108, 39);
  for (const x of [765, 790, 817]) {
    box(x, 174, 13, 20, "#849582", "#a6b49a");
    box(x + 2, 178, 9, 10, "#557f68");
    box(x + 1, 171, 11, 3, "#b0b49a");
  }
  computer(831, 171);
  bed(758, 283, Math.PI / 2);
  box(872, 160, 23, 96, "#58695a", "#89967e");
  for (let y = 167; y < 250; y += 28) {
    box(878, y, 12, 20, "#223e32", "#6c8b6b");
    box(891, y + 8, 2, 5, "#b9baa0");
  }
  chair(850, 279, Math.PI);
  blood(830, 290, 24);
  line(
    [
      [728, 304],
      [743, 300],
      [752, 305],
      [766, 303],
    ],
    "#6f3c2f",
    2,
  );
  // Reception: the abandoned nurses station.
  table(257, 455, 61, 81);
  table(227, 455, 90, 26);
  computer(276, 460);
  chair(275, 509, Math.PI / 2);
  for (const x of [145, 177, 209]) chair(x, 565);
  box(140, 466, 49, 24, "#4d6251", "#7f9279");
  box(145, 471, 39, 14, "#293c32");
  box(285, 552, 31, 28, "#485b49", "#91a082");
  line(
    [
      [300, 557],
      [300, 575],
    ],
    "#8fa98b",
    3,
  );
  line(
    [
      [291, 566],
      [309, 566],
    ],
    "#8fa98b",
    3,
  );
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.translate(245 + random() * 50, 543 + random() * 27);
    ctx.rotate(random());
    box(0, 0, 9, 13, "#8c967e");
    line(
      [
        [2, 4],
        [7, 4],
      ],
      "#52674f",
    );
    ctx.restore();
  }
  // Corridor gurney and a displaced wheelchair.
  bed(444, 480, Math.PI / 2);
  chair(590, 476, 0.4);
  box(384, 391, 21, 12, "#3c5242", "#7e9679");
  blood(540, 475, 13);
  // Generator: the mechanical bank sits below the clear service aisle.
  ctx.save();
  ctx.beginPath();
  ctx.rect(727, 523, 142, 49);
  ctx.clip();
  box(727, 523, 142, 49, "#31382b");
  for (let x = 670; x < 920; x += 19)
    line(
      [
        [x, 520],
        [x + 55, 575],
      ],
      "#7c7447",
      7,
    );
  ctx.restore();
  box(740, 534, 118, 39, "#0a1714");
  box(735, 528, 118, 39, "#58664f", "#9b9f78");
  box(743, 533, 76, 26, "#253d2e", "#789272");
  for (let x = 750; x < 815; x += 8)
    line(
      [
        [x, 538],
        [x, 554],
      ],
      "#879879",
      3,
    );
  box(826, 534, 18, 22, "#1e3329", "#7d9373");
  box(830, 538, 10, 8, "#91c28f");
  for (const x of [724, 747, 770]) {
    box(x, 446, 19, 25, "#475940", "#8c9870");
    line(
      [
        [x + 4, 451],
        [x + 14, 451],
      ],
      "#b0a57b",
    );
  }
  box(877, 439, 21, 100, "#4e624f", "#91a17c");
  for (let y = 448; y < 526; y += 13) {
    box(882, y, 10, 4, "#91aa7e");
  }
  line(
    [
      [849, 551],
      [864, 562],
      [859, 570],
      [836, 575],
      [818, 568],
    ],
    "#10261c",
    4,
  );
  // Emergency lift and pressure-sealed double doors.
  box(496, 580, 98, 44, "#1e322b", "#758d76");
  box(503, 585, 40, 33, "#3f5745", "#7e977c");
  box(547, 585, 40, 33, "#3f5745", "#7e977c");
  line(
    [
      [545, 583],
      [545, 620],
    ],
    "#0d2118",
    3,
  );
  text("↑", 536, 609, 20, "#a2bb8e");
  box(600, 589, 7, 19, "#82906f");
  box(602, 591, 3, 6, "#d6714e");
  // Room identities are HTML labels so their text stays readable at every FIT size.
  // Understated equipment callouts and scale reference.
  text("NO SIGNAL", 818, 372, 8, "#7f6954");
  line(
    [
      [806, 361],
      [806, 388],
    ],
    "#52644f",
  );
  text("STAFF ACCESS ONLY", 281, 407, 7, "#687e68");
  text("0", 763, 656, 7, "#647e6d");
  text("5m", 864, 656, 7, "#647e6d");
  line(
    [
      [780, 651],
      [780, 657],
      [860, 657],
      [860, 651],
    ],
    "#6b8671",
  );
  line(
    [
      [820, 653],
      [820, 657],
    ],
    "#6b8671",
  );
  // Fine analog grain is deterministic and incurs no animation cost.
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle =
      random() > 0.5 ? "rgba(161,186,145,.025)" : "rgba(0,0,0,.08)";
    ctx.fillRect(random() * W, random() * H, 1, 1);
  }
}

function routePosition(from: RoomId, to: RoomId, progress: number): Point {
  const route = routes.find(
    (r) => (r.from === from && r.to === to) || (r.from === to && r.to === from),
  );
  if (!route) {
    const a = center(roomFor(from)),
      b = center(roomFor(to));
    return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
  }
  const points =
    route.from === from ? route.points : [...route.points].reverse();
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0]! - points[i]![0]!, p[1]! - points[i]![1]!));
  let distance = lengths.reduce((a, b) => a + b, 0) * progress;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i]!) {
      const p = points[i]!,
        q = points[i + 1]!,
        t = distance / lengths[i]!;
      return { x: p[0]! + (q[0]! - p[0]!) * t, y: p[1]! + (q[1]! - p[1]!) * t };
    }
    distance -= lengths[i]!;
  }
  return center(roomFor(to));
}

export function createFacility(
  parent: HTMLElement,
  onRoomSelect: (id: RoomId) => void,
) {
  const labels = document.createElement("div");
  labels.className = "facility-labels";
  labels.setAttribute("aria-hidden", "true");
  const atmosphere = document.createElement("div");
  atmosphere.className = "facility-atmosphere";
  labels.append(atmosphere);
  const roomNames: Record<RoomId, string> = {
    reception: "受付", corridor: "中央ホール", ward: "隔離病棟",
    archive: "書庫", laboratory: "研究室", generator: "非常用電源室", exit: "避難口",
  };
  const roomLabels = ROOMS.map((room) => {
    const label = document.createElement("span");
    label.className = "facility-room-label";
    label.textContent = `${room.label} ${roomNames[room.id]}`;
    if (room.id === "ward") {
      const refuge = document.createElement("small");
      refuge.textContent = "隠れ場所";
      label.append(refuge);
    }
    label.style.left = `${(room.x + 6) / W * 100}%`;
    label.style.top = `${(room.y + 7) / H * 100}%`;
    labels.append(label);
    return { room, label };
  });
  const agentLabel = document.createElement("span");
  agentLabel.className = "facility-agent-label";
  agentLabel.textContent = "サム";
  labels.append(agentLabel);
  const destinationLabel = document.createElement("span");
  destinationLabel.className = "facility-destination-label hidden";
  labels.append(destinationLabel);
  const killerLabel = document.createElement("span");
  killerLabel.className = "facility-killer-label";
  killerLabel.textContent = "ぬこぬこさん";
  labels.append(killerLabel);
  let latestState: GameState | undefined;
  let selection: RoomId = "reception";
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  class FacilityScene extends Phaser.Scene {
    private selectionGraphics!: Phaser.GameObjects.Graphics;
    private lightGraphics!: Phaser.GameObjects.Graphics;
    private effectGraphics!: Phaser.GameObjects.Graphics;
    private agent!: Phaser.GameObjects.Container;
    private samSprite?: Phaser.GameObjects.Image;
    private killerSprite?: Phaser.GameObjects.Image;
    private killerFallback!: Phaser.GameObjects.Container;
    private killerAura!: Phaser.GameObjects.Graphics;
    private dust!: Phaser.GameObjects.Graphics;
    private lockLabels = new Map<RoomId, Phaser.GameObjects.Text>();
    private dustParticles = Array.from({ length: 26 }, (_, i) => ({
      x: (i * 173.7) % W,
      y: (i * 93.3) % H,
      r: i % 4 === 0 ? 1.1 : 0.6,
    }));
    private playerPoint: Point = center(roomFor("reception"));
    private killerPoint: Point = center(roomFor("laboratory"));
    private hoverRoom: RoomId | null = null;
    preload() {
      this.load.image("sam-map", "/sam-map.webp");
      this.load.image("nuko-map", "/nuko-map.webp");
    }
    create() {
      const texture = this.textures.createCanvas("facility-plan", W, H)!;
      paintFacility(texture.getContext());
      texture.refresh();
      this.add.image(0, 0, "facility-plan").setOrigin(0);
      this.lightGraphics = this.add.graphics();
      this.selectionGraphics = this.add.graphics();
      this.effectGraphics = this.add.graphics();
      this.dust = this.add.graphics();
      for (const room of ROOMS) {
        const label = this.add.text(
          room.x + room.w / 2,
          room.y + room.h / 2,
          "ENTRY BLOCKED",
          {
            align: "center",
            backgroundColor: "#351713",
            color: "#ffd0ba",
            fontFamily: "monospace",
            fontSize: "9px",
            padding: { x: 5, y: 4 },
            stroke: "#8c3026",
            strokeThickness: 1,
          },
        ).setOrigin(0.5).setDepth(10).setVisible(false);
        this.lockLabels.set(room.id, label);
      }
      // Survivor: coat, pack, shoulders and a cool illuminated head.
      const shadow = this.add.ellipse(1, 4, 19, 12, 0x000604, 0.8);
      const coat = this.add.graphics();
      coat.fillStyle(0xc8d2bd);
      coat.fillRoundedRect(-5, -3, 10, 13, 3);
      coat.fillStyle(0x5c7c6e);
      coat.fillRoundedRect(-3, 1, 6, 7, 2);
      coat.lineStyle(2, 0xb5cbb1);
      coat.lineBetween(-5, 1, -8, 4);
      coat.lineBetween(5, 1, 8, 3);
      coat.lineStyle(2, 0x95b6a3);
      coat.lineBetween(-3, 8, -4, 13);
      coat.lineBetween(3, 8, 4, 13);
      const head = this.add
        .circle(0, -6, 4.5, 0xd7ead0)
        .setStrokeStyle(1, 0x95c7af);
      const lamp = this.add.circle(4, -7, 1.7, 0xc2ffe0);
      this.agent = this.add.container(this.playerPoint.x, this.playerPoint.y, [
        shadow,
        coat,
        head,
        lamp,
      ]);
      this.agent.setDepth(3);
      if (this.textures.exists("sam-map")) {
        const source = this.textures.get("sam-map").getSourceImage() as HTMLImageElement;
        this.samSprite = this.add.image(this.playerPoint.x, this.playerPoint.y, "sam-map")
          .setOrigin(0.5, 0.94).setScale(85 / source.height).setDepth(4);
        this.agent.setVisible(false);
      }
      this.killerAura = this.add.graphics().setDepth(2);
      const killerShadow = this.add.ellipse(0, 3, 32, 13, 0x18020e, 0.8);
      const killerBody = this.add.graphics();
      killerBody.fillStyle(0xd299b9, 0.9);
      killerBody.fillCircle(0, -26, 8);
      killerBody.fillTriangle(0, -20, -16, 4, 16, 4);
      killerBody.lineStyle(3, 0xb96d96);
      killerBody.lineBetween(-5, 2, -7, 13);
      killerBody.lineBetween(5, 2, 7, 13);
      this.killerFallback = this.add.container(this.killerPoint.x, this.killerPoint.y, [killerShadow, killerBody]).setDepth(4);
      if (this.textures.exists("nuko-map")) {
        const source = this.textures.get("nuko-map").getSourceImage() as HTMLImageElement;
        this.killerSprite = this.add.image(this.killerPoint.x, this.killerPoint.y, "nuko-map")
          .setOrigin(0.5, 0.98).setScale(95 / source.height).setDepth(5);
        this.killerFallback.setVisible(false);
      }
      for (const r of ROOMS) {
        const zone = this.add
          .zone(r.x, r.y, r.w, r.h)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });
        zone.on("pointerdown", () => onRoomSelect(r.id));
        zone.on("pointerover", () => {
          this.hoverRoom = r.id;
        });
        zone.on("pointerout", () => {
          this.hoverRoom = null;
        });
      }
    }
    update(time: number, delta: number) {
      const state = latestState;
      const now = reducedMotion ? 0 : time * 0.001;
      let target = state
        ? center(roomFor(state.roomId))
        : center(roomFor("reception"));
      if (state?.targetRoomId && state.currentAction?.action === "move")
        target = routePosition(
          state.roomId,
          state.targetRoomId,
          state.progress,
        );
      const smoothing =
        state?.status === "waiting" ? 1 : Math.min(1, delta / 120);
      const previous = { ...this.playerPoint };
      this.playerPoint.x += (target.x - this.playerPoint.x) * smoothing;
      this.playerPoint.y += (target.y - this.playerPoint.y) * smoothing;
      const { x, y } = this.playerPoint;
      atmosphere.style.setProperty("--subject-x", `${x / W * 100}%`);
      atmosphere.style.setProperty("--subject-y", `${y / H * 100}%`);
      this.agent.setPosition(x, y);
      this.samSprite?.setPosition(x, y);
      this.samSprite?.setAlpha(state && isHiding(state) ? 0.55 : 1);
      if (this.samSprite && Math.abs(x - previous.x) > 0.1) this.samSprite.setFlipX(x < previous.x);
      if (state) {
        const killer = state.killer;
        const destination = killer.targetRoomId ? routePosition(killer.roomId, killer.targetRoomId, killer.progress) : center(roomFor(killer.roomId));
        const previousKillerX = this.killerPoint.x;
        this.killerPoint.x += (destination.x - this.killerPoint.x) * smoothing;
        this.killerPoint.y += (destination.y - this.killerPoint.y) * smoothing;
        this.killerSprite?.setPosition(this.killerPoint.x, this.killerPoint.y);
        if (this.killerSprite && Math.abs(this.killerPoint.x - previousKillerX) > 0.1) this.killerSprite.setFlipX(this.killerPoint.x < previousKillerX);
        this.killerFallback.setPosition(this.killerPoint.x, this.killerPoint.y);
        this.killerAura.clear();
        this.killerAura.lineStyle(killer.encountered ? 2 : 1, 0xe691b3, killer.encountered ? 0.8 : 0.45);
        this.killerAura.strokeEllipse(this.killerPoint.x, this.killerPoint.y, 48, 23);
        const approaching = Math.hypot(this.killerPoint.x - x, this.killerPoint.y - y) < 120;
        if (approaching) {
          this.killerAura.lineStyle(2, 0xe59b8c, 0.5);
          this.killerAura.strokeCircle(this.killerPoint.x, this.killerPoint.y, 36);
        }
        killerLabel.style.left = `${this.killerPoint.x / W * 100}%`;
        killerLabel.style.top = `${this.killerPoint.y / H * 100}%`;
        killerLabel.classList.toggle("approaching", approaching);
        killerLabel.textContent = approaching ? "ぬこぬこさん · 接近" : "ぬこぬこさん";
      }
      agentLabel.style.left = `${x / W * 100}%`;
      agentLabel.style.top = `${y / H * 100}%`;
      agentLabel.textContent = state && isHiding(state) ? "サム · 隠れている" : "サム";
      const moving =
        Math.hypot(
          this.playerPoint.x - previous.x,
          this.playerPoint.y - previous.y,
        ) > 0.1;
      if (moving)
        this.agent.setRotation(
          Phaser.Math.Angle.Between(previous.x, previous.y, x, y) + Math.PI / 2,
        );
      const pulse = 0.75 + Math.sin(now * 2.4) * 0.1;
      const light = this.lightGraphics;
      light.clear();
      // Soft concentric falloff and a long, diffuse handheld flashlight.
      for (let r = 80; r > 5; r -= 5) {
        light.fillStyle(0x91e8bb, 0.005 * pulse);
        light.fillCircle(x, y, r);
      }
      const angle = this.agent.rotation - Math.PI / 2;
      for (let i = 8; i >= 1; i--) {
        const length = 108 + i * 4,
          spread = 0.25 + i * 0.025;
        light.fillStyle(0xc1e4af, 0.007);
        light.fillTriangle(
          x,
          y,
          x + Math.cos(angle - spread) * length,
          y + Math.sin(angle - spread) * length,
          x + Math.cos(angle + spread) * length,
          y + Math.sin(angle + spread) * length,
        );
      }
      light.lineStyle(1, 0x9bd7b2, 0.55);
      light.strokeCircle(x, y, 19);
      light.lineStyle(1, 0x7aaf91, 0.14);
      light.strokeCircle(x, y, 25 + Math.sin(now * 1.6) * 3);
      light.fillStyle(0xc0ffe0, 0.9);
      light.fillCircle(x, y - 7, 2);
      const g = this.selectionGraphics;
      g.clear();
      // Only an accepted, currently executing move is visible. No future plan is drawn.
      if (state?.currentAction?.action === "move" && state.targetRoomId === state.currentAction.target) {
        const targetRoom = state.currentAction.target;
        const remaining = 1 - state.progress;
        g.lineStyle(2, 0xcbd8a1, 0.8);
        const sections = 64;
        for (let i = 0; i < sections; i += 2) {
          const a = routePosition(state.roomId, targetRoom, state.progress + remaining * i / sections);
          const b = routePosition(state.roomId, targetRoom, state.progress + remaining * (i + 1) / sections);
          g.lineBetween(a.x, a.y, b.x, b.y);
        }
        const destination = center(roomFor(targetRoom));
        g.lineStyle(2, 0xd3dda8, 0.9);
        g.strokeCircle(destination.x, destination.y, 16);
        g.lineBetween(destination.x - 7, destination.y, destination.x + 7, destination.y);
        g.lineBetween(destination.x, destination.y - 7, destination.x, destination.y + 7);
      }
      const selected = roomFor(selection);
      if (this.hoverRoom && this.hoverRoom !== selection) {
        const r = roomFor(this.hoverRoom);
        g.fillStyle(0x83c5a0, 0.05);
        g.fillRect(r.x, r.y, r.w, r.h);
        g.lineStyle(1, 0x9ac7a3, 0.35);
        g.strokeRect(r.x - 11, r.y - 11, r.w + 22, r.h + 22);
      }
      // Broken corner brackets are readable without flattening the floor.
      g.lineStyle(1.5, 0xb9d5a4, 0.85);
      for (const [cx, cy, sx, sy] of [
        [selected.x - 13, selected.y - 13, 1, 1],
        [selected.x + selected.w + 13, selected.y - 13, -1, 1],
        [selected.x - 13, selected.y + selected.h + 13, 1, -1],
        [selected.x + selected.w + 13, selected.y + selected.h + 13, -1, -1],
      ]) {
        g.lineBetween(cx!, cy!, cx! + sx! * 20, cy!);
        g.lineBetween(cx!, cy!, cx!, cy! + sy! * 20);
      }
      // Current location carries a tiny tracking crosshair.
      g.lineStyle(1, 0xc5ebc7, 0.7);
      for (const [dx, dy] of [
        [-29, 0],
        [29, 0],
        [0, -29],
        [0, 29],
      ])
        g.lineBetween(x + dx!, y + dy!, x + dx! * 0.84, y + dy! * 0.84);
      const fx = this.effectGraphics;
      fx.clear();
      if (state) {
        for (const effect of state.effects) {
          const r = roomFor(effect.roomId);
          const p = center(r);
          if (effect.type === "blackout") {
            fx.fillStyle(0x010707, 0.81);
            fx.fillRect(r.x, r.y, r.w, r.h);
            fx.lineStyle(1, 0x9b3d32, 0.6);
            fx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
          } else if (effect.type === "apparition") {
            const opacity = 0.22 + Math.sin(now * 6) * 0.12;
            for (let j = 0; j < 5; j++) {
              fx.fillStyle(0xc1d5c8, opacity * 0.13);
              fx.fillEllipse(p.x + 45, p.y, 17 + j * 6, 47 + j * 7);
            }
            fx.fillStyle(0xc4d5c7, opacity);
            fx.fillCircle(p.x + 45, p.y - 20, 5);
            fx.fillTriangle(
              p.x + 45,
              p.y - 15,
              p.x + 34,
              p.y + 25,
              p.x + 54,
              p.y + 25,
            );
          } else if (effect.type === "whisper") {
            fx.lineStyle(1, 0xad6d61, 0.3);
            for (let j = 0; j < 3; j++)
              fx.strokeCircle(p.x, p.y, 20 + ((now * 10 + j * 15) % 55));
          } else if (effect.type === "lock") {
            fx.lineStyle(2, 0xcb6955, 0.85);
            fx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
          }
        }
        if (!state.power) {
          fx.fillStyle(0x02080b, 0.24);
          fx.fillRect(0, 95, W, H - 95);
        }
        for (const r of ROOMS) {
          const sealed = (state.locks[r.id] ?? 0) > state.elapsed;
          const lockLabel = this.lockLabels.get(r.id);
          lockLabel?.setText(state.roomId === r.id ? "SAM INSIDE\nEXIT BLOCKED" : "ENTRY BLOCKED");
          lockLabel?.setVisible(sealed);
          if (sealed) {
            fx.fillStyle(0xd67459, 0.9);
            fx.fillRoundedRect(r.x + r.w - 23, r.y + 11, 10, 9, 1);
            fx.lineStyle(1.5, 0xd67459, 0.9);
            fx.strokeCircle(r.x + r.w - 18, r.y + 10, 3);
          }
        }
      }
      // Slow airborne motes are intentionally sparse.
      this.dust.clear();
      for (const d of this.dustParticles) {
        this.dust.fillStyle(0xc3d3b8, 0.08 + Math.sin(now + d.x) * 0.04);
        this.dust.fillCircle(
          (d.x + now * 1.5) % W,
          (d.y + Math.sin(now * 0.2 + d.x) * 5) % H,
          d.r,
        );
      }
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    backgroundColor: "#080e0f",
    transparent: false,
    antialias: true,
    scene: FacilityScene,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: W,
      height: H,
    },
    render: { powerPreference: "low-power" },
    fps: { target: 30, forceSetTimeOut: false },
    audio: { noAudio: true },
    banner: false,
  });
  parent.append(labels);
  let resizeFrame = 0;
  let destroyed = false;
  function alignLabels() {
    const { width, height } = game.scale.displaySize;
    labels.style.width = `${width}px`;
    labels.style.height = `${height}px`;
    labels.style.left = `${(parent.clientWidth - width) / 2}px`;
    labels.style.top = `${(parent.clientHeight - height) / 2}px`;
  }
  game.scale.on(Phaser.Scale.Events.RESIZE, alignLabels);
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (destroyed) return;
      game.scale.getParentBounds();
      game.scale.refresh();
      alignLabels();
    });
  });
  resizeObserver.observe(parent);
  alignLabels();
  return {
    update(state: GameState, selectedRoom: RoomId) {
      latestState = state;
      selection = selectedRoom;
      const moving = state.currentAction?.action === "move" && state.targetRoomId === state.currentAction.target;
      destinationLabel.classList.toggle("hidden", !moving);
      if (moving && state.currentAction) {
        const destination = center(roomFor(state.currentAction.target));
        destinationLabel.textContent = `移動先：${roomNames[state.currentAction.target]}`;
        destinationLabel.style.left = `${destination.x / W * 100}%`;
        destinationLabel.style.top = `${destination.y / H * 100}%`;
      }
      for (const { room, label } of roomLabels) {
        label.classList.toggle("selected", room.id === selectedRoom);
      }
    },
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      game.scale.off(Phaser.Scale.Events.RESIZE, alignLabels);
      labels.remove();
      game.destroy(true);
    },
  };
}
