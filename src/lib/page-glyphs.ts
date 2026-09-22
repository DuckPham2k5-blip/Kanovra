/**
 * Outline drawings shown behind each page, one per navigation section.
 *
 * Kept apart from the component that renders them so the geometry can be
 * rendered and eyeballed on its own — a hand-written path either reads as a
 * bell or it does not, and that is far easier to check outside React.
 *
 * All glyphs share a 200x200 grid so their stroke weights match.
 */

export type Glyph = {
  /** Outline strokes, drawn in order. */
  paths: string[];
  /** Joint positions, lit like stars before the lines appear. */
  nodes: [number, number][];
};

export const GLYPHS: Record<string, Glyph> = {
  // Assistant — a small neural network: three layers of nodes wired together,
  // which reads as "AI" the way the board reads as Projects.
  ai: {
    paths: [
      "M42 64 L100 54",
      "M42 64 L100 100",
      "M42 64 L100 146",
      "M42 100 L100 54",
      "M42 100 L100 100",
      "M42 100 L100 146",
      "M42 136 L100 54",
      "M42 136 L100 100",
      "M42 136 L100 146",
      "M100 54 L158 82",
      "M100 54 L158 118",
      "M100 100 L158 82",
      "M100 100 L158 118",
      "M100 146 L158 82",
      "M100 146 L158 118",
    ],
    nodes: [[42, 64], [42, 100], [42, 136], [100, 54], [100, 100], [100, 146], [158, 82], [158, 118]],
  },
  // Overview — a dashboard split into panels.
  overview: {
    paths: [
      "M30 34 H92 V88 H30 Z",
      "M108 34 H170 V62 H108 Z",
      "M108 78 H170 V166 H108 Z",
      "M30 104 H92 V166 H30 Z",
    ],
    nodes: [[30, 34], [92, 34], [92, 88], [30, 88], [108, 34], [170, 34], [170, 62], [108, 62], [108, 78], [170, 78], [170, 166], [108, 166], [30, 104], [92, 104], [92, 166], [30, 166]],
  },
  // Maps — a constellation: one centre with branches running off it, which is
  // the shape every one of the eight types is a special case of.
  maps: {
    paths: [
      "M100 100 L52 58",
      "M100 100 L156 66",
      "M100 100 L60 148",
      "M100 100 L148 150",
      "M52 58 L34 30",
      "M52 58 L26 76",
      "M156 66 L178 42",
      "M148 150 L172 172",
      "M60 148 L36 168",
    ],
    nodes: [[100, 100], [52, 58], [156, 66], [60, 148], [148, 150], [34, 30], [26, 76], [178, 42], [172, 172], [36, 168]],
  },
  // My tasks — a checklist, with the ticks as their own strokes.
  tasks: {
    paths: [
      "M32 44 H62 V74 H32 Z",
      "M38 59 L46 67 L58 49",
      "M80 59 H168",
      "M32 92 H62 V122 H32 Z",
      "M38 107 L46 115 L58 97",
      "M80 107 H168",
      "M32 140 H62 V170 H32 Z",
      "M80 155 H140",
    ],
    nodes: [[32, 44], [62, 74], [80, 59], [168, 59], [32, 92], [62, 122], [80, 107], [168, 107], [32, 140], [62, 170], [80, 155], [140, 155]],
  },
  // Projects — a kanban board. The short rule above each stack reads as a
  // column header, which is what separates this from three loose rectangles.
  projects: {
    paths: [
      "M22 32 H70",
      "M22 46 H70 V88 H22 Z",
      "M22 102 H70 V144 H22 Z",
      "M82 32 H130",
      "M82 46 H130 V116 H82 Z",
      "M142 32 H190",
      "M142 46 H190 V74 H142 Z",
      "M142 88 H190 V130 H142 Z",
    ],
    nodes: [[22, 32], [70, 32], [22, 46], [70, 88], [22, 102], [70, 144], [82, 32], [130, 32], [82, 46], [130, 116], [142, 32], [190, 32], [142, 46], [190, 74], [142, 88], [190, 130]],
  },
  // Calendar — a month grid.
  calendar: {
    paths: [
      "M28 46 H172 V172 H28 Z",
      "M28 78 H172",
      "M60 30 V60",
      "M140 30 V60",
      "M76 78 V172",
      "M124 78 V172",
      "M28 125 H172",
    ],
    nodes: [[28, 46], [172, 46], [172, 172], [28, 172], [60, 30], [140, 30], [76, 78], [124, 78], [28, 125], [172, 125]],
  },
  // Analytics — rising bars with a trend line over them.
  analytics: {
    paths: [
      "M30 170 H172",
      "M30 170 V40",
      "M48 170 V132",
      "M80 170 V106",
      "M112 170 V118",
      "M144 170 V70",
      "M48 122 L80 96 L112 108 L144 58",
    ],
    nodes: [[30, 40], [30, 170], [172, 170], [48, 132], [80, 106], [112, 118], [144, 70], [48, 122], [80, 96], [112, 108], [144, 58]],
  },
  // Notifications — a bell, with rings coming off it.
  notifications: {
    paths: [
      "M64 132 C64 132 74 122 74 96 C74 70 88 56 100 56 C112 56 126 70 126 96 C126 122 136 132 136 132 Z",
      "M86 132 C86 146 92 154 100 154 C108 154 114 146 114 132",
      "M100 40 V56",
      "M148 78 C156 88 158 102 156 112",
      "M52 78 C44 88 42 102 44 112",
    ],
    nodes: [[100, 40], [74, 96], [126, 96], [64, 132], [136, 132], [100, 154], [148, 78], [52, 78]],
  },
  // Members — a group, one figure in front.
  members: {
    paths: [
      "M100 62 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0",
      "M58 158 C58 128 76 112 100 112 C124 112 142 128 142 158",
      "M46 80 m-15 0 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0",
      // The flanking figures get the same shoulder curve as the centre one,
      // cut short where they tuck behind it — as separate arcs they read as
      // loose commas rather than as people.
      "M14 152 C14 130 27 118 46 118 C55 118 62 120 68 125",
      "M154 80 m-15 0 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0",
      "M186 152 C186 130 173 118 154 118 C145 118 138 120 132 125",
    ],
    nodes: [[100, 62], [100, 112], [58, 158], [142, 158], [46, 80], [154, 80], [14, 152], [186, 152]],
  },
  // Settings — sliders. A ringed gear was the obvious choice, but in pure
  // outline at this weight the teeth read as a sun's rays; sliders say
  // "settings" without the ambiguity.
  settings: {
    paths: [
      "M38 62 H162",
      "M74 62 m-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0",
      "M38 100 H162",
      "M120 100 m-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0",
      "M38 138 H162",
      "M92 138 m-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0",
    ],
    nodes: [[38, 62], [162, 62], [74, 62], [38, 100], [162, 100], [120, 100], [38, 138], [162, 138], [92, 138]],
  },
};
