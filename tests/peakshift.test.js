import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOURS_IN_DAY,
  PeakShiftError,
  costForPlacement,
  effectiveDeadlineHour,
  estimatePlacementCount,
  feasibleHours,
  generatePlacements,
  naiveEveningPlan,
  normalizeAppliance,
  normalizePlanningInput,
  parseIntensity,
  placementIsContiguous,
  placementsOverlap,
  slotsNeeded,
  solveSchedule,
  validatePlacement
} from '../src/peakshift.js';
import { GRID_PROFILES } from '../src/profiles.js';
import { SAMPLE_APPLIANCES, samplePlanningInput } from '../src/sample-data.js';

const flat500 = Array.from({ length: 24 }, () => 500);
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};
const appliance = (overrides = {}) => ({
  id: 'load',
  name: 'Load',
  powerW: 1000,
  runMinutes: 60,
  deadlineHour: 24,
  flexibilityHours: 0,
  mode: 'one-shot',
  circuit: 'main',
  ...overrides
});
const inputFor = (intensity, appliances) => ({ intensity, appliances });

function bruteForceBestGrams(input) {
  const normalized = normalizePlanningInput(input);
  const perAppliance = normalized.appliances.map((item) => ({
    appliance: item,
    candidates: generatePlacements(item).map((placement) => ({
      placement,
      grams: costForPlacement(normalized.intensity, item, placement)
    }))
  }));
  let best = Infinity;

  function visit(index, masks, grams) {
    if (index === perAppliance.length) {
      best = Math.min(best, grams);
      return;
    }
    const { appliance: item, candidates } = perAppliance[index];
    for (const candidate of candidates) {
      const bit = candidate.placement.reduce((mask, hour) => mask | (1 << hour), 0);
      const occupied = masks.get(item.circuit) ?? 0;
      if ((occupied & bit) !== 0) continue;
      masks.set(item.circuit, occupied | bit);
      visit(index + 1, masks, grams + candidate.grams);
      masks.set(item.circuit, occupied);
    }
  }

  visit(0, new Map(), 0);
  return best;
}

test('intensity parsing accepts exactly 24 finite hourly numbers', () => {
  const values = parseIntensity(flat500);
  assert.equal(values.length, HOURS_IN_DAY);
  assert.equal(values[0], 500);
  assert.equal(values[23], 500);
  assert.notEqual(values, flat500);
});

test('intensity parsing resolves the three labeled synthetic profiles', () => {
  assert.equal(GRID_PROFILES.length, 3);
  assert.deepEqual(GRID_PROFILES.map((profile) => profile.id), ['solar-heavy', 'wind-heavy', 'coal-heavy']);
  assert.equal(parseIntensity('solar-heavy')[12], 92);
  assert.equal(parseIntensity('wind-heavy')[3], 108);
  assert.equal(parseIntensity('coal-heavy')[19], 682);
  assert.equal(parseIntensity({ profile: 'solar-heavy' })[13], 88);
});

test('malformed intensity input is rejected deterministically', () => {
  assert.throws(() => parseIntensity(flat500.slice(0, 23)), /exactly 24/);
  assert.throws(() => parseIntensity([...flat500.slice(0, 23), Number.NaN]), /finite number/);
  assert.throws(() => parseIntensity([...flat500.slice(0, 23), Infinity]), /finite number/);
  assert.throws(() => parseIntensity([-1, ...flat500.slice(1)]), /between 0 and 2000/);
  assert.throws(() => parseIntensity([2001, ...flat500.slice(1)]), /between 0 and 2000/);
  assert.throws(() => parseIntensity('unknown-grid'), /Unknown synthetic grid profile/);
  assert.throws(() => parseIntensity({ hours: 'not-an-array' }), /object with 24 hourly values/);
});

test('appliance normalization keeps valid fields and defaults', () => {
  const normalized = normalizeAppliance({
    id: 'dishwasher',
    name: 'Dishwasher',
    powerW: 1200.5,
    runMinutes: 75,
    deadlineHour: 22,
    flexibilityHours: 2,
    mode: 'one-shot',
    circuit: 'kitchen'
  });
  assert.equal(normalized.id, 'dishwasher');
  assert.equal(normalized.name, 'Dishwasher');
  assert.equal(normalized.powerW, 1200.5);
  assert.equal(normalized.runMinutes, 75);
  assert.equal(normalized.deadlineHour, 22);
  assert.equal(normalized.flexibilityHours, 2);
  assert.equal(normalized.mode, 'one-shot');
  assert.equal(normalized.circuit, 'kitchen');
  assert.equal(effectiveDeadlineHour(normalized), 24);
  assert.equal(slotsNeeded(normalized), 2);
});

test('malformed appliance fields are rejected', () => {
  assert.throws(() => normalizeAppliance(null), /must be an object/);
  assert.throws(() => normalizeAppliance(appliance({ powerW: 0 })), /powerW/);
  assert.throws(() => normalizeAppliance(appliance({ powerW: 12001 })), /powerW/);
  assert.throws(() => normalizeAppliance(appliance({ runMinutes: 0 })), /runMinutes/);
  assert.throws(() => normalizeAppliance(appliance({ runMinutes: 30.5 })), /runMinutes/);
  assert.throws(() => normalizeAppliance(appliance({ deadlineHour: 0 })), /deadlineHour/);
  assert.throws(() => normalizeAppliance(appliance({ deadlineHour: 25 })), /deadlineHour/);
  assert.throws(() => normalizeAppliance(appliance({ flexibilityHours: -1 })), /flexibilityHours/);
  assert.throws(() => normalizeAppliance(appliance({ deadlineHour: 23, flexibilityHours: 2 })), /crosses the end/);
  assert.throws(() => normalizeAppliance(appliance({ mode: 'sometimes' })), /one-shot/);
  assert.throws(() => normalizeAppliance(appliance({ circuit: 'bad circuit' })), /circuit/);
});

test('planning input rejects empty, duplicate and missing collections', () => {
  assert.throws(() => normalizePlanningInput(null), /must be an object/);
  assert.throws(() => normalizePlanningInput({ appliances: [appliance()] }), /missing intensity/);
  assert.throws(() => normalizePlanningInput(inputFor(flat500, [])), /non-empty array/);
  assert.throws(() => normalizePlanningInput(inputFor(flat500, [appliance(), appliance()])), /Duplicate appliance id/);
  const tooMany = Array.from({ length: 13 }, (_, index) => appliance({ id: `load-${index}` }));
  assert.throws(() => normalizePlanningInput(inputFor(flat500, tooMany)), /At most 12/);
});

test('hour-window feasibility uses whole-hour reservations and effective deadlines', () => {
  const flexible = appliance({ runMinutes: 61, deadlineHour: 4, flexibilityHours: 2 });
  assert.equal(slotsNeeded(flexible), 2);
  assert.equal(effectiveDeadlineHour(flexible), 6);
  assert.deepEqual(feasibleHours(flexible), [0, 1, 2, 3, 4, 5]);
  assert.equal(estimatePlacementCount(flexible), 5);
  const repeatable = appliance({ runMinutes: 120, deadlineHour: 5, mode: 'repeatable' });
  assert.equal(estimatePlacementCount(repeatable), 10);
  assert.equal(feasibleHours(appliance({ runMinutes: 300, deadlineHour: 4 })).length, 0);
});

test('placement validation rejects deadline, ordering and contiguity violations', () => {
  const oneShot = appliance({ runMinutes: 120, deadlineHour: 4 });
  assert.equal(validatePlacement([1, 2], oneShot), true);
  assert.equal(placementIsContiguous([1, 2]), true);
  assert.equal(placementIsContiguous([1, 3]), false);
  assert.throws(() => validatePlacement([1, 3], oneShot), /contiguous/);
  assert.throws(() => validatePlacement([3, 4], oneShot), /effective deadline/);
  assert.throws(() => validatePlacement([1, 1], oneShot), /sorted unique/);
  assert.throws(() => validatePlacement([1], oneShot), /exactly 2/);
  assert.throws(() => validatePlacement([1, 2, 3], oneShot), /exactly 2/);
});

test('repeatable placements may be split while one-shot placements stay contiguous', () => {
  const repeatable = appliance({ runMinutes: 120, deadlineHour: 5, mode: 'repeatable' });
  assert.equal(validatePlacement([0, 4], repeatable), true);
  const placements = generatePlacements(repeatable);
  assert.equal(placements.length, 10);
  assert.deepEqual(placements[0], [0, 1]);
  assert.deepEqual(placements[9], [3, 4]);
  assert.equal(generatePlacements(appliance({ runMinutes: 120, deadlineHour: 5 })).every(placementIsContiguous), true);
});

test('placement emissions prorate the final partial hour', () => {
  const intensity = Array.from({ length: 24 }, () => 100);
  intensity[8] = 200;
  intensity[9] = 400;
  const item = appliance({ powerW: 2000, runMinutes: 90 });
  const grams = costForPlacement(intensity, item, [8, 9]);
  close(grams, (2 * 200) + (1 * 400));
  assert.equal(grams, 800);
});

test('circuit conflict bit masks detect overlapping hours only', () => {
  assert.equal(placementsOverlap([2, 3], [3, 4]), true);
  assert.equal(placementsOverlap([2, 3], [4, 5]), false);
  assert.equal(placementsOverlap([0], [23]), false);
});

test('solver picks the lowest-carbon feasible hour for one appliance', () => {
  const intensity = Array.from({ length: 24 }, () => 500);
  intensity[2] = 100;
  const result = solveSchedule(inputFor(intensity, [appliance()]));
  assert.deepEqual(result.optimized.assignments[0].hours, [2]);
  close(result.optimized.assignments[0].grams, 100);
  close(result.totals.optimizedKgCo2e, 0.1);
});

test('must-finish-by deadline forces a higher-carbon but feasible hour', () => {
  const intensity = Array.from({ length: 24 }, () => 500);
  intensity[2] = 100;
  intensity[0] = 300;
  const result = solveSchedule(inputFor(intensity, [appliance({ deadlineHour: 1 })]));
  assert.deepEqual(result.optimized.assignments[0].hours, [0]);
  close(result.optimized.assignments[0].grams, 300);
});

test('one-shot solver compares whole contiguous windows rather than isolated cheap hours', () => {
  const intensity = Array.from({ length: 24 }, () => 500);
  intensity[0] = 10;
  intensity[1] = 1000;
  intensity[5] = 200;
  intensity[6] = 200;
  const result = solveSchedule(inputFor(intensity, [appliance({ runMinutes: 120 })]));
  assert.deepEqual(result.optimized.assignments[0].hours, [5, 6]);
  close(result.optimized.assignments[0].grams, 400);
});

test('same-circuit appliances are never double-booked', () => {
  const intensity = Array.from({ length: 24 }, (_, hour) => (hour < 2 ? 100 : 500));
  const first = appliance({ id: 'first', runMinutes: 120 });
  const second = appliance({ id: 'second', runMinutes: 120 });
  const result = solveSchedule(inputFor(intensity, [first, second]));
  const used = result.optimized.assignments.flatMap((assignment) => assignment.hours);
  assert.equal(new Set(used).size, used.length);
  assert.equal(result.optimized.assignments.every((assignment) => placementIsContiguous(assignment.hours)), true);
  assert.equal(used.length, 4);
});

test('different circuits may use the same hour', () => {
  const intensity = Array.from({ length: 24 }, (_, hour) => (hour === 3 ? 100 : 500));
  const first = appliance({ id: 'first', circuit: 'kitchen' });
  const second = appliance({ id: 'second', circuit: 'garage' });
  const result = solveSchedule(inputFor(intensity, [first, second]));
  assert.deepEqual(result.optimized.assignments[0].hours, [3]);
  assert.deepEqual(result.optimized.assignments[1].hours, [3]);
});

test('impossible deadlines are rejected before search', () => {
  assert.throws(
    () => solveSchedule(inputFor(flat500, [appliance({ runMinutes: 180, deadlineHour: 2 })])),
    (error) => error instanceof PeakShiftError && error.code === 'INFEASIBLE_DEADLINE'
  );
  assert.equal(feasibleHours(appliance({ runMinutes: 180, deadlineHour: 2 })).length, 0);
});

test('a circuit with no non-overlapping feasible set is rejected', () => {
  const first = appliance({ id: 'first', runMinutes: 240, deadlineHour: 4 });
  const second = appliance({ id: 'second', runMinutes: 240, deadlineHour: 4 });
  assert.throws(
    () => solveSchedule(inputFor(flat500, [first, second])),
    (error) => error instanceof PeakShiftError && error.code === 'INFEASIBLE_CIRCUIT'
  );
});

test('solver matches a brute-force oracle on a two-load mixed-mode instance', () => {
  const intensity = [500, 90, 480, 120, 460, 140, 440, 160, 420, 180, 400, 200, 390, 210, 380, 220, 370, 230, 360, 240, 350, 250, 340, 260];
  const input = inputFor(intensity, [
    appliance({ id: 'one', runMinutes: 120, deadlineHour: 8, mode: 'one-shot' }),
    appliance({ id: 'two', runMinutes: 120, deadlineHour: 8, mode: 'repeatable' })
  ]);
  const result = solveSchedule(input);
  close(result.totals.optimizedGrams, bruteForceBestGrams(input));
  assert.equal(Number.isFinite(bruteForceBestGrams(input)), true);
});

test('solver matches a brute-force oracle across three deterministic small instances', () => {
  const cases = [
    {
      intensity: [100, 500, 120, 480, 140, 460, 160, 440, 180, 420, 200, 400, 220, 380, 240, 360, 260, 340, 280, 320, 300, 300, 320, 340],
      appliances: [appliance({ id: 'a', deadlineHour: 5 }), appliance({ id: 'b', deadlineHour: 5 })]
    },
    {
      intensity: [300, 80, 300, 90, 300, 100, 300, 110, 300, 120, 300, 130, 300, 140, 300, 150, 300, 160, 300, 170, 300, 180, 300, 190],
      appliances: [
        appliance({ id: 'a', runMinutes: 120, deadlineHour: 6, mode: 'repeatable' }),
        appliance({ id: 'b', runMinutes: 60, deadlineHour: 6, circuit: 'other' })
      ]
    },
    {
      intensity: [200, 210, 90, 220, 95, 230, 100, 240, 105, 250, 110, 260, 115, 270, 120, 280, 125, 290, 130, 300, 135, 310, 140, 320],
      appliances: [
        appliance({ id: 'a', runMinutes: 120, deadlineHour: 6 }),
        appliance({ id: 'b', runMinutes: 60, deadlineHour: 6 }),
        appliance({ id: 'c', runMinutes: 60, deadlineHour: 6, circuit: 'garage' })
      ]
    }
  ];
  for (const fixture of cases) {
    const input = inputFor(fixture.intensity, fixture.appliances);
    close(solveSchedule(input).totals.optimizedGrams, bruteForceBestGrams(input));
  }
  assert.equal(cases.length, 3);
});

test('naive evening plan starts at the evening hour when feasible', () => {
  const plan = naiveEveningPlan(flat500, [appliance()]);
  assert.deepEqual(plan.assignments[0].hours, [18]);
  close(plan.grams, 500);
});

test('savings math reconciles appliance rows to plan totals', () => {
  const result = solveSchedule(samplePlanningInput('solar-heavy'));
  assert.ok(result.totals.optimizedGrams < result.totals.naiveGrams);
  close(result.totals.savingGrams, result.totals.naiveGrams - result.totals.optimizedGrams);
  close(
    result.appliancesSavings.reduce((total, row) => total + row.savingGrams, 0),
    result.totals.savingGrams
  );
  close(result.totals.savingKgCo2e, result.totals.savingGrams / 1000);
  close(result.totals.savingPercent, (result.totals.savingGrams / result.totals.naiveGrams) * 100);
  assert.equal(result.appliancesSavings.length, SAMPLE_APPLIANCES.length);
});

test('flat intensity produces zero savings when naive reservations happen to be optimal', () => {
  const result = solveSchedule(inputFor(flat500, [appliance({ id: 'flat-load' })]));
  close(result.totals.savingGrams, 0);
  assert.equal(result.totals.savingPercent, 0);
});

test('repeatable solver can split a load across non-contiguous cheap hours', () => {
  const intensity = Array.from({ length: 24 }, () => 500);
  intensity[1] = 100;
  intensity[4] = 100;
  intensity[2] = 450;
  const repeatable = appliance({ runMinutes: 120, mode: 'repeatable' });
  const result = solveSchedule(inputFor(intensity, [repeatable]));
  assert.deepEqual(result.optimized.assignments[0].hours, [1, 4]);
  close(result.optimized.assignments[0].grams, 200);
});

test('solver output is deterministic across repeated runs', () => {
  const first = solveSchedule(samplePlanningInput('wind-heavy'));
  const second = solveSchedule(samplePlanningInput('wind-heavy'));
  assert.equal(JSON.stringify(first.optimized.assignments), JSON.stringify(second.optimized.assignments));
  assert.equal(JSON.stringify(first.totals), JSON.stringify(second.totals));
});

test('oversized repeatable search spaces fail honestly instead of hanging', () => {
  const huge = appliance({ runMinutes: 720, deadlineHour: 24, mode: 'repeatable' });
  assert.equal(estimatePlacementCount(huge), 2704156);
  assert.throws(
    () => solveSchedule(inputFor(flat500, [huge])),
    (error) => error instanceof PeakShiftError && error.code === 'SEARCH_SPACE_TOO_LARGE'
  );
});
