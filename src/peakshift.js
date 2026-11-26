import { getGridProfile } from './profiles.js';

export const HOURS_IN_DAY = 24;
export const MINUTES_PER_HOUR = 60;
export const DEFAULT_MAX_NODES = 250000;
export const DEFAULT_MAX_CANDIDATES_PER_APPLIANCE = 60000;
const EPSILON = 1e-9;

export class PeakShiftError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PeakShiftError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new PeakShiftError(code, message, details);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInteger(value) {
  return Number.isInteger(value);
}

export function parseIntensity(input) {
  let hours = input;
  if (typeof input === 'string') {
    const profile = getGridProfile(input);
    if (!profile) {
      fail('MALFORMED_INTENSITY', `Unknown synthetic grid profile "${input}".`, { field: 'intensity' });
    }
    hours = profile.hours;
  } else if (isPlainObject(input)) {
    if (Array.isArray(input.hours)) hours = input.hours;
    else if (Array.isArray(input.hourly)) hours = input.hourly;
    else if (typeof input.profile === 'string') return parseIntensity(input.profile);
    else fail('MALFORMED_INTENSITY', 'Intensity must be a profile id or an object with 24 hourly values.', { field: 'intensity' });
  }

  if (!Array.isArray(hours)) {
    fail('MALFORMED_INTENSITY', 'Intensity must be an array of 24 hourly numbers.', { field: 'intensity' });
  }
  if (hours.length !== HOURS_IN_DAY) {
    fail('MALFORMED_INTENSITY', `Intensity must contain exactly ${HOURS_IN_DAY} hourly values.`, {
      field: 'intensity',
      actual: hours.length
    });
  }

  return hours.map((value, hour) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail('MALFORMED_INTENSITY', `Intensity at hour ${hour} must be a finite number.`, { field: 'intensity', hour });
    }
    if (value < 0 || value > 2000) {
      fail('MALFORMED_INTENSITY', `Intensity at hour ${hour} must be between 0 and 2000 gCO2/kWh.`, {
        field: 'intensity',
        hour,
        actual: value
      });
    }
    return value;
  });
}

export function effectiveDeadlineHour(appliance) {
  return appliance.deadlineHour + appliance.flexibilityHours;
}

export function slotsNeeded(appliance) {
  return Math.ceil(appliance.runMinutes / MINUTES_PER_HOUR);
}

export function normalizeAppliance(raw, index = 0) {
  if (!isPlainObject(raw)) {
    fail('MALFORMED_APPLIANCE', `Appliance ${index + 1} must be an object.`, { applianceIndex: index });
  }

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `appliance-${index + 1}`;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id;
  const circuit = typeof raw.circuit === 'string' && raw.circuit.trim() ? raw.circuit.trim() : 'main';
  const mode = raw.mode;

  if (!/^[a-z0-9][a-z0-9-_]{0,47}$/i.test(id)) {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" has an invalid id.`, { applianceIndex: index, id });
  }
  if (!/^[a-z0-9][a-z0-9-_]{0,47}$/i.test(circuit)) {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" has an invalid circuit id.`, { applianceIndex: index, id, circuit });
  }
  if (typeof raw.powerW !== 'number' || !Number.isFinite(raw.powerW) || raw.powerW <= 0 || raw.powerW > 12000) {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" powerW must be a finite number above 0 and at most 12000.`, {
      applianceIndex: index,
      id,
      field: 'powerW'
    });
  }
  if (!isInteger(raw.runMinutes) || raw.runMinutes < 1 || raw.runMinutes > 720) {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" runMinutes must be an integer from 1 to 720.`, {
      applianceIndex: index,
      id,
      field: 'runMinutes'
    });
  }
  if (!isInteger(raw.deadlineHour) || raw.deadlineHour < 1 || raw.deadlineHour > HOURS_IN_DAY) {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" deadlineHour must be an integer from 1 to 24.`, {
      applianceIndex: index,
      id,
      field: 'deadlineHour'
    });
  }

  const flexibilityHours = raw.flexibilityHours ?? 0;
  if (!isInteger(flexibilityHours) || flexibilityHours < 0 || flexibilityHours > 8) {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" flexibilityHours must be an integer from 0 to 8.`, {
      applianceIndex: index,
      id,
      field: 'flexibilityHours'
    });
  }
  if (raw.deadlineHour + flexibilityHours > HOURS_IN_DAY) {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" deadline plus flexibility crosses the end of the modeled day.`, {
      applianceIndex: index,
      id,
      field: 'flexibilityHours',
      deadlineHour: raw.deadlineHour,
      flexibilityHours
    });
  }
  if (mode !== 'one-shot' && mode !== 'repeatable') {
    fail('MALFORMED_APPLIANCE', `Appliance "${id}" mode must be "one-shot" or "repeatable".`, {
      applianceIndex: index,
      id,
      field: 'mode'
    });
  }

  return Object.freeze({
    id,
    name,
    circuit,
    powerW: raw.powerW,
    runMinutes: raw.runMinutes,
    deadlineHour: raw.deadlineHour,
    flexibilityHours,
    mode
  });
}

export function parseAppliances(input) {
  if (!Array.isArray(input) || input.length === 0) {
    fail('MALFORMED_APPLIANCES', 'Appliances must be a non-empty array.', { field: 'appliances' });
  }
  if (input.length > 12) {
    fail('MALFORMED_APPLIANCES', 'At most 12 appliances fit the exact-search planner.', {
      field: 'appliances',
      actual: input.length
    });
  }
  const appliances = input.map((raw, index) => normalizeAppliance(raw, index));
  const seen = new Set();
  for (const appliance of appliances) {
    if (seen.has(appliance.id)) {
      fail('MALFORMED_APPLIANCES', `Duplicate appliance id "${appliance.id}".`, { id: appliance.id });
    }
    seen.add(appliance.id);
  }
  return Object.freeze(appliances);
}

export function normalizePlanningInput(input) {
  if (!isPlainObject(input)) {
    fail('MALFORMED_INPUT', 'Planning input must be an object with intensity and appliances.');
  }
  const intensityInput = input.intensity ?? input.intensityProfile ?? input.profile;
  if (intensityInput === undefined) {
    fail('MALFORMED_INPUT', 'Planning input is missing intensity.', { field: 'intensity' });
  }
  return Object.freeze({
    intensity: Object.freeze(parseIntensity(intensityInput)),
    appliances: parseAppliances(input.appliances)
  });
}

export function feasibleHours(appliance) {
  const needed = slotsNeeded(appliance);
  const deadline = effectiveDeadlineHour(appliance);
  if (needed > deadline) return [];
  return Array.from({ length: deadline }, (_, hour) => hour);
}

function placementIsSortedUniqueIntegers(placement) {
  if (!Array.isArray(placement)) return false;
  let previous = -1;
  for (const hour of placement) {
    if (!isInteger(hour) || hour < 0 || hour >= HOURS_IN_DAY || hour <= previous) return false;
    previous = hour;
  }
  return true;
}

export function placementIsContiguous(placement) {
  if (placement.length < 2) return true;
  for (let index = 1; index < placement.length; index += 1) {
    if (placement[index] !== placement[index - 1] + 1) return false;
  }
  return true;
}

export function validatePlacement(placement, appliance) {
  const needed = slotsNeeded(appliance);
  if (!placementIsSortedUniqueIntegers(placement)) {
    fail('INVALID_PLACEMENT', `Placement for "${appliance.id}" must be sorted unique hour integers.`, { applianceId: appliance.id });
  }
  if (placement.length !== needed) {
    fail('INVALID_PLACEMENT', `Placement for "${appliance.id}" must reserve exactly ${needed} hour slots.`, {
      applianceId: appliance.id,
      expected: needed,
      actual: placement.length
    });
  }
  if (placement.length > 0 && placement[placement.length - 1] + 1 > effectiveDeadlineHour(appliance)) {
    fail('DEADLINE_VIOLATION', `Placement for "${appliance.id}" ends after its effective deadline.`, {
      applianceId: appliance.id,
      placement,
      effectiveDeadlineHour: effectiveDeadlineHour(appliance)
    });
  }
  if (appliance.mode === 'one-shot' && !placementIsContiguous(placement)) {
    fail('INVALID_PLACEMENT', `One-shot appliance "${appliance.id}" must use contiguous hours.`, {
      applianceId: appliance.id,
      placement
    });
  }
  return true;
}

function factorialRatio(n, k) {
  let result = 1;
  for (let index = 0; index < k; index += 1) result = (result * (n - index)) / (index + 1);
  return result;
}

export function estimatePlacementCount(appliance) {
  const needed = slotsNeeded(appliance);
  const deadline = effectiveDeadlineHour(appliance);
  if (needed > deadline) return 0;
  if (appliance.mode === 'one-shot') return deadline - needed + 1;
  return factorialRatio(deadline, needed);
}

function pushCombinations(output, deadline, needed, start, prefix) {
  if (prefix.length === needed) {
    output.push(prefix.slice());
    return;
  }
  const remaining = needed - prefix.length;
  for (let hour = start; hour <= deadline - remaining; hour += 1) {
    prefix.push(hour);
    pushCombinations(output, deadline, needed, hour + 1, prefix);
    prefix.pop();
  }
}

export function generatePlacements(appliance, options = {}) {
  const maxCandidates = options.maxCandidatesPerAppliance ?? DEFAULT_MAX_CANDIDATES_PER_APPLIANCE;
  const estimate = estimatePlacementCount(appliance);
  if (estimate === 0) {
    return [];
  }
  if (estimate > maxCandidates) {
    fail('SEARCH_SPACE_TOO_LARGE', `Appliance "${appliance.id}" has ${estimate} possible hour placements, above the exact-search cap of ${maxCandidates}.`, {
      applianceId: appliance.id,
      estimate,
      maxCandidates
    });
  }

  const needed = slotsNeeded(appliance);
  const deadline = effectiveDeadlineHour(appliance);
  const output = [];
  if (appliance.mode === 'one-shot') {
    for (let start = 0; start + needed <= deadline; start += 1) {
      output.push(Array.from({ length: needed }, (_, offset) => start + offset));
    }
  } else {
    pushCombinations(output, deadline, needed, 0, []);
  }
  for (const placement of output) validatePlacement(placement, appliance);
  return output;
}

export function maskForPlacement(placement) {
  return placement.reduce((mask, hour) => mask | (1 << hour), 0);
}

export function placementsOverlap(first, second) {
  return (maskForPlacement(first) & maskForPlacement(second)) !== 0;
}

function comparePlacements(first, second) {
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    const a = first[index] ?? -1;
    const b = second[index] ?? -1;
    if (a !== b) return a - b;
  }
  return 0;
}

export function costForPlacement(intensity, appliance, placement) {
  validatePlacement(placement, appliance);
  let remainingMinutes = appliance.runMinutes;
  let grams = 0;
  for (const hour of placement) {
    const minutes = Math.min(MINUTES_PER_HOUR, remainingMinutes);
    if (minutes <= 0) break;
    grams += (appliance.powerW / 1000) * (minutes / MINUTES_PER_HOUR) * intensity[hour];
    remainingMinutes -= minutes;
  }
  return grams;
}

export function describePlacement(intensity, appliance, placement) {
  validatePlacement(placement, appliance);
  let remainingMinutes = appliance.runMinutes;
  let grams = 0;
  let energyKwh = 0;
  const minutesByHour = [];
  for (const hour of placement) {
    const minutes = Math.min(MINUTES_PER_HOUR, remainingMinutes);
    if (minutes <= 0) break;
    const kwh = (appliance.powerW / 1000) * (minutes / MINUTES_PER_HOUR);
    const hourGrams = kwh * intensity[hour];
    energyKwh += kwh;
    grams += hourGrams;
    minutesByHour.push(Object.freeze({
      hour,
      minutes,
      intensity: intensity[hour],
      kwh,
      grams: hourGrams
    }));
    remainingMinutes -= minutes;
  }
  return Object.freeze({
    applianceId: appliance.id,
    name: appliance.name,
    circuit: appliance.circuit,
    mode: appliance.mode,
    powerW: appliance.powerW,
    runMinutes: appliance.runMinutes,
    deadlineHour: appliance.deadlineHour,
    flexibilityHours: appliance.flexibilityHours,
    effectiveDeadlineHour: effectiveDeadlineHour(appliance),
    hours: Object.freeze(placement.slice()),
    startHour: placement[0],
    endHour: placement[placement.length - 1] + 1,
    slotsReserved: placement.length,
    energyKwh,
    grams,
    minutesByHour: Object.freeze(minutesByHour)
  });
}

function buildCandidates(intensity, appliance, options) {
  const candidates = generatePlacements(appliance, options).map((placement) => Object.freeze({
    placement: Object.freeze(placement),
    mask: maskForPlacement(placement),
    grams: costForPlacement(intensity, appliance, placement)
  }));
  candidates.sort((first, second) => {
    if (Math.abs(first.grams - second.grams) > EPSILON) return first.grams - second.grams;
    return comparePlacements(first.placement, second.placement);
  });
  return candidates;
}

function solveCircuit(intensity, circuit, entries, options) {
  const jobs = entries.map(({ appliance, applianceIndex }) => {
    const candidates = buildCandidates(intensity, appliance, options);
    return { appliance, applianceIndex, candidates, needed: slotsNeeded(appliance) };
  });

  for (const job of jobs) {
    if (job.candidates.length === 0) {
      fail('INFEASIBLE_DEADLINE', `Appliance "${job.appliance.id}" cannot finish ${job.needed} reserved hour slot${job.needed === 1 ? '' : 's'} before hour ${effectiveDeadlineHour(job.appliance)}.`, {
        applianceId: job.appliance.id,
        circuit,
        effectiveDeadlineHour: effectiveDeadlineHour(job.appliance),
        slotsNeeded: job.needed
      });
    }
  }

  jobs.sort((first, second) => {
    if (first.candidates.length !== second.candidates.length) return first.candidates.length - second.candidates.length;
    if (first.needed !== second.needed) return second.needed - first.needed;
    return first.appliance.id.localeCompare(second.appliance.id);
  });

  const suffixMin = Array.from({ length: jobs.length + 1 }, () => 0);
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    suffixMin[index] = suffixMin[index + 1] + jobs[index].candidates[0].grams;
  }

  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  let nodes = 0;
  let bestGrams = Infinity;
  let bestChosen = null;

  function search(jobIndex, occupiedMask, grams, chosen) {
    nodes += 1;
    if (nodes > maxNodes) {
      fail('SEARCH_SPACE_TOO_LARGE', `Exact circuit search exceeded ${maxNodes} nodes. Narrow deadlines or reduce repeatable runtimes.`, {
        circuit,
        maxNodes
      });
    }
    if (grams + suffixMin[jobIndex] >= bestGrams - EPSILON) return;
    if (jobIndex === jobs.length) {
      bestGrams = grams;
      bestChosen = chosen.slice();
      return;
    }

    const job = jobs[jobIndex];
    for (const candidate of job.candidates) {
      if ((occupiedMask & candidate.mask) !== 0) continue;
      const nextGrams = grams + candidate.grams;
      if (nextGrams + suffixMin[jobIndex + 1] >= bestGrams - EPSILON) continue;
      chosen.push({ job, candidate });
      search(jobIndex + 1, occupiedMask | candidate.mask, nextGrams, chosen);
      chosen.pop();
    }
  }

  search(0, 0, 0, []);

  if (!bestChosen) {
    fail('INFEASIBLE_CIRCUIT', `Circuit "${circuit}" cannot carry these appliance windows without double-booking an hour.`, {
      circuit,
      applianceIds: jobs.map((job) => job.appliance.id)
    });
  }

  const assignments = bestChosen
    .map(({ job, candidate }) => Object.freeze({
      applianceIndex: job.applianceIndex,
      assignment: describePlacement(intensity, job.appliance, candidate.placement)
    }))
    .sort((first, second) => first.applianceIndex - second.applianceIndex)
    .map(({ assignment }) => assignment);

  return {
    assignments: Object.freeze(assignments),
    grams: bestGrams,
    nodes,
    candidateCount: jobs.reduce((total, job) => total + job.candidates.length, 0)
  };
}

function hourOrderForNaive(eveningHour, deadline) {
  const order = [];
  for (let hour = eveningHour; hour < deadline; hour += 1) order.push(hour);
  for (let hour = 0; hour < Math.min(eveningHour, deadline); hour += 1) order.push(hour);
  return order;
}

function findNaivePlacement(appliance, occupiedMask, eveningHour) {
  const needed = slotsNeeded(appliance);
  const deadline = effectiveDeadlineHour(appliance);
  if (needed > deadline) {
    fail('INFEASIBLE_DEADLINE', `Appliance "${appliance.id}" cannot finish before its effective deadline in the naive plan.`, {
      applianceId: appliance.id,
      effectiveDeadlineHour: deadline,
      slotsNeeded: needed
    });
  }

  if (appliance.mode === 'one-shot') {
    const startOrder = hourOrderForNaive(eveningHour, deadline).filter((start) => start + needed <= deadline);
    for (const start of startOrder) {
      const placement = Array.from({ length: needed }, (_, offset) => start + offset);
      if ((occupiedMask & maskForPlacement(placement)) === 0) return placement;
    }
  } else {
    const placement = [];
    for (const hour of hourOrderForNaive(eveningHour, deadline)) {
      if ((occupiedMask & (1 << hour)) === 0) placement.push(hour);
      if (placement.length === needed) break;
    }
    placement.sort((a, b) => a - b);
    if (placement.length === needed) return placement;
  }

  fail('INFEASIBLE_CIRCUIT', `The naive evening plan cannot fit appliance "${appliance.id}" on circuit "${appliance.circuit}".`, {
    applianceId: appliance.id,
    circuit: appliance.circuit
  });
}

export function naiveEveningPlan(intensityInput, appliancesInput, eveningHour = 18) {
  const intensity = parseIntensity(intensityInput);
  const appliances = Array.isArray(appliancesInput) ? parseAppliances(appliancesInput) : appliancesInput;
  if (!isInteger(eveningHour) || eveningHour < 0 || eveningHour >= HOURS_IN_DAY) {
    fail('MALFORMED_INPUT', 'Evening hour must be an integer from 0 to 23.', { eveningHour });
  }

  const occupiedByCircuit = new Map();
  const assignments = appliances.map((appliance) => {
    const occupiedMask = occupiedByCircuit.get(appliance.circuit) ?? 0;
    const placement = findNaivePlacement(appliance, occupiedMask, eveningHour);
    occupiedByCircuit.set(appliance.circuit, occupiedMask | maskForPlacement(placement));
    return describePlacement(intensity, appliance, placement);
  });

  return Object.freeze({
    eveningHour,
    assignments: Object.freeze(assignments),
    grams: assignments.reduce((total, assignment) => total + assignment.grams, 0)
  });
}

export function solveSchedule(input, options = {}) {
  const normalized = normalizePlanningInput(input);
  const groups = new Map();
  normalized.appliances.forEach((appliance, applianceIndex) => {
    if (!groups.has(appliance.circuit)) groups.set(appliance.circuit, []);
    groups.get(appliance.circuit).push({ appliance, applianceIndex });
  });

  let nodes = 0;
  let candidateCount = 0;
  const optimized = [];
  for (const [circuit, entries] of groups.entries()) {
    const result = solveCircuit(normalized.intensity, circuit, entries, options);
    nodes += result.nodes;
    candidateCount += result.candidateCount;
    optimized.push(...result.assignments.map((assignment, index) => ({ assignment, index, entries })));
  }

  const optimizedAssignments = optimized
    .flatMap(({ assignment }) => assignment)
    .sort((first, second) => {
      const firstIndex = normalized.appliances.findIndex((appliance) => appliance.id === first.applianceId);
      const secondIndex = normalized.appliances.findIndex((appliance) => appliance.id === second.applianceId);
      return firstIndex - secondIndex;
    });

  const naive = naiveEveningPlan(normalized.intensity, normalized.appliances, options.eveningHour ?? 18);
  const optimizedGrams = optimizedAssignments.reduce((total, assignment) => total + assignment.grams, 0);
  const naiveGrams = naive.assignments.reduce((total, assignment) => total + assignment.grams, 0);

  const appliances = normalized.appliances.map((appliance) => {
    const optimizedAssignment = optimizedAssignments.find((assignment) => assignment.applianceId === appliance.id);
    const naiveAssignment = naive.assignments.find((assignment) => assignment.applianceId === appliance.id);
    return Object.freeze({
      applianceId: appliance.id,
      name: appliance.name,
      circuit: appliance.circuit,
      powerW: appliance.powerW,
      runMinutes: appliance.runMinutes,
      energyKwh: optimizedAssignment.energyKwh,
      optimizedGrams: optimizedAssignment.grams,
      naiveGrams: naiveAssignment.grams,
      savingGrams: naiveAssignment.grams - optimizedAssignment.grams,
      optimizedHours: optimizedAssignment.hours,
      naiveHours: naiveAssignment.hours
    });
  });

  const savingGrams = naiveGrams - optimizedGrams;
  return Object.freeze({
    intensity: normalized.intensity,
    appliances: normalized.appliances,
    optimized: Object.freeze({
      assignments: Object.freeze(optimizedAssignments),
      grams: optimizedGrams
    }),
    naive,
    appliancesSavings: Object.freeze(appliances),
    totals: Object.freeze({
      optimizedGrams,
      naiveGrams,
      savingGrams,
      optimizedKgCo2e: optimizedGrams / 1000,
      naiveKgCo2e: naiveGrams / 1000,
      savingKgCo2e: savingGrams / 1000,
      savingPercent: naiveGrams > 0 ? (savingGrams / naiveGrams) * 100 : 0,
      energyKwh: optimizedAssignments.reduce((total, assignment) => total + assignment.energyKwh, 0)
    }),
    search: Object.freeze({
      exact: true,
      nodes,
      candidateCount,
      maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
      resolution: 'hour',
      circuitReservation: 'whole-hour roundup'
    })
  });
}
