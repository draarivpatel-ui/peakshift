export const GRID_PROFILES = Object.freeze([
  Object.freeze({
    id: 'solar-heavy',
    label: 'Solar-heavy synthetic grid',
    shortLabel: 'Solar-heavy',
    note: 'Midday solar depression and a steep evening fossil ramp.',
    hours: Object.freeze([
      410, 388, 366, 350, 342, 360,
      392, 342, 274, 205, 148, 112,
      92, 88, 96, 124, 188, 305,
      492, 618, 642, 590, 522, 456
    ])
  }),
  Object.freeze({
    id: 'wind-heavy',
    label: 'Wind-heavy synthetic grid',
    shortLabel: 'Wind-heavy',
    note: 'Low overnight wind output with a smaller evening peak.',
    hours: Object.freeze([
      156, 132, 118, 108, 112, 128,
      162, 214, 252, 286, 304, 316,
      324, 318, 306, 296, 302, 338,
      402, 448, 430, 366, 286, 204
    ])
  }),
  Object.freeze({
    id: 'coal-heavy',
    label: 'Coal-heavy synthetic grid',
    shortLabel: 'Coal-heavy',
    note: 'High marginal emissions all day with only a modest midday dip.',
    hours: Object.freeze([
      586, 574, 562, 552, 548, 556,
      584, 622, 640, 628, 600, 556,
      512, 492, 486, 502, 538, 594,
      654, 682, 676, 648, 620, 598
    ])
  })
]);

export function getGridProfile(id) {
  return GRID_PROFILES.find((profile) => profile.id === id) || null;
}

export function profileIds() {
  return GRID_PROFILES.map((profile) => profile.id);
}
