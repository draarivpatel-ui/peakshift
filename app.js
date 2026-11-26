import {
  PeakShiftError,
  naiveEveningPlan,
  normalizePlanningInput,
  parseIntensity,
  solveSchedule
} from './src/peakshift.js';
import { GRID_PROFILES, getGridProfile } from './src/profiles.js';
import { SAMPLE_APPLIANCES, samplePlanningInput } from './src/sample-data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const PROFILE_IDS = GRID_PROFILES.map((profile) => profile.id);

const elements = {
  profileNote: document.querySelector('#profile-note'),
  chart: document.querySelector('#intensity-chart'),
  statLow: document.querySelector('#stat-low'),
  statPeak: document.querySelector('#stat-peak'),
  statAverage: document.querySelector('#stat-average'),
  rows: document.querySelector('#appliance-rows'),
  add: document.querySelector('#add-appliance'),
  solve: document.querySelector('#solve-button'),
  reset: document.querySelector('#reset-sample'),
  error: document.querySelector('#error-panel'),
  results: document.querySelector('#results'),
  resultsLink: document.querySelector('#results-link'),
  searchMeta: document.querySelector('#search-meta'),
  timeline: document.querySelector('#timeline'),
  legend: document.querySelector('#timeline-legend'),
  acknowledge: document.querySelector('#acknowledge-model'),
  reveal: document.querySelector('#reveal-summary'),
  summary: document.querySelector('#summary-panel'),
  metricOptimized: document.querySelector('#metric-optimized'),
  metricNaive: document.querySelector('#metric-naive'),
  metricSaving: document.querySelector('#metric-saving'),
  metricPercent: document.querySelector('#metric-percent'),
  savingsRows: document.querySelector('#savings-rows'),
  download: document.querySelector('#download-report'),
  print: document.querySelector('#print-report'),
  jsonInput: document.querySelector('#json-input'),
  applyJson: document.querySelector('#apply-json'),
  exportJson: document.querySelector('#export-json')
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const state = {
  profileId: 'solar-heavy',
  intensity: parseIntensity('solar-heavy'),
  appliances: clone(SAMPLE_APPLIANCES),
  solution: null
};

function padHour(hour) {
  return String(hour).padStart(2, '0');
}

function formatHour(hour) {
  return `${padHour(hour)}:00`;
}

function formatWindow(hours) {
  if (!hours || hours.length === 0) return '-';
  const groups = [];
  let start = hours[0];
  let previous = hours[0];
  for (let index = 1; index < hours.length; index += 1) {
    if (hours[index] !== previous + 1) {
      groups.push([start, previous + 1]);
      start = hours[index];
    }
    previous = hours[index];
  }
  groups.push([start, previous + 1]);
  return groups.map(([from, end]) => `${formatHour(from)}-${formatHour(end)}`).join(' + ');
}

function formatKg(grams) {
  return `${(grams / 1000).toFixed(2)} kgCO2e`;
}

function formatGrams(grams) {
  return `${grams.toFixed(1)} g`;
}

function intensityClass(value) {
  if (value < 170) return 'intensity-low';
  if (value < 330) return 'intensity-mid';
  if (value < 500) return 'intensity-high';
  return 'intensity-extreme';
}

function applianceCode(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function clearError() {
  elements.error.hidden = true;
  elements.error.textContent = '';
}

function showError(error) {
  const prefix = error instanceof PeakShiftError ? `${error.code}: ` : '';
  elements.error.textContent = `${prefix}${error.message}`;
  elements.error.hidden = false;
}

function invalidateSolution() {
  state.solution = null;
  elements.results.hidden = true;
  elements.summary.hidden = true;
  elements.acknowledge.checked = false;
  elements.reveal.disabled = true;
}

function setProfile(profileId) {
  const profile = getGridProfile(profileId);
  if (!profile) return;
  state.profileId = profileId;
  state.intensity = parseIntensity(profileId);
  invalidateSolution();
  renderGrid();
}

function renderProfileButtons() {
  document.querySelectorAll('.profile-option').forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.profile === state.profileId));
  });
}

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function renderChart() {
  const values = state.intensity;
  const width = 720;
  const height = 300;
  const margin = { top: 22, right: 18, bottom: 34, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = Math.ceil(Math.max(...values, 100) / 100) * 100;
  const xFor = (hour) => margin.left + (hour + 0.5) * (innerWidth / 24);
  const yFor = (value) => margin.top + innerHeight - (value / maxValue) * innerHeight;

  const chart = elements.chart;
  chart.replaceChildren();
  chart.appendChild(svgElement('title', { id: 'chart-title' })).textContent = 'Synthetic hourly grid carbon intensity';
  chart.appendChild(svgElement('desc', { id: 'chart-desc' })).textContent = 'Twenty-four hourly bars with a line showing grams of CO2 per kilowatt-hour for the selected synthetic grid profile.';

  for (const fraction of [0, 0.5, 1]) {
    const y = margin.top + innerHeight - fraction * innerHeight;
    chart.appendChild(svgElement('line', {
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y,
      class: 'chart-gridline'
    }));
    const label = svgElement('text', {
      x: margin.left - 8,
      y: y + 4,
      'text-anchor': 'end',
      class: 'chart-tick'
    });
    label.textContent = Math.round(maxValue * fraction);
    chart.appendChild(label);
  }

  const barWidth = innerWidth / 24;
  values.forEach((value, hour) => {
    const x = margin.left + hour * barWidth + 2;
    const y = yFor(value);
    chart.appendChild(svgElement('rect', {
      x,
      y,
      width: Math.max(2, barWidth - 4),
      height: margin.top + innerHeight - y,
      rx: 3,
      class: `chart-bar ${intensityClass(value)}`
    }));
  });

  const points = values.map((value, hour) => `${xFor(hour).toFixed(2)},${yFor(value).toFixed(2)}`).join(' ');
  chart.appendChild(svgElement('polyline', { points, class: 'chart-line' }));

  for (const hour of [0, 6, 12, 18, 23]) {
    const tick = svgElement('text', {
      x: xFor(hour),
      y: height - 10,
      'text-anchor': 'middle',
      class: 'chart-tick'
    });
    tick.textContent = formatHour(hour);
    chart.appendChild(tick);
  }

  const unit = svgElement('text', {
    x: margin.left,
    y: 13,
    class: 'chart-label'
  });
  unit.textContent = 'gCO2/kWh, synthetic hourly intensity';
  chart.appendChild(unit);
}

function renderGrid() {
  renderProfileButtons();
  const profile = getGridProfile(state.profileId);
  elements.profileNote.textContent = profile
    ? `${profile.note} This is a labeled synthetic profile, not live grid telemetry.`
    : 'Custom hourly input is active. PeakShift validates its shape but cannot verify its provenance.';

  const low = Math.min(...state.intensity);
  const lowHour = state.intensity.indexOf(low);
  const evening = state.intensity.slice(17, 22);
  const peak = Math.max(...evening);
  const peakHour = 17 + evening.indexOf(peak);
  const average = state.intensity.reduce((sum, value) => sum + value, 0) / state.intensity.length;
  elements.statLow.textContent = `${formatHour(lowHour)} · ${low} g`;
  elements.statPeak.textContent = `${formatHour(peakHour)} · ${peak} g`;
  elements.statAverage.textContent = `${average.toFixed(0)} g`;
  renderChart();
}

function numberInputValue(input) {
  return input.value === '' ? 0 : Number(input.value);
}

function updateApplianceFromInput(input) {
  const row = input.closest('tr');
  if (!row) return;
  const index = Number(row.dataset.index);
  const field = input.dataset.field;
  if (!Number.isInteger(index) || !field || !state.appliances[index]) return;
  state.appliances[index][field] = input.type === 'number' ? numberInputValue(input) : input.value;
  invalidateSolution();
  clearError();
}

function tableInput(row, field, value, options = {}) {
  const input = document.createElement('input');
  input.dataset.field = field;
  input.value = value;
  input.setAttribute('aria-label', `${field} for appliance row`);
  if (options.type) input.type = options.type;
  if (options.min !== undefined) input.min = options.min;
  if (options.max !== undefined) input.max = options.max;
  if (options.step !== undefined) input.step = options.step;
  if (options.className) input.className = options.className;
  input.addEventListener('input', () => updateApplianceFromInput(input));
  input.addEventListener('change', () => updateApplianceFromInput(input));
  return input;
}

function renderTable() {
  const rows = state.appliances.map((appliance, index) => {
    const row = document.createElement('tr');
    row.dataset.index = index;

    const nameCell = document.createElement('td');
    const nameInput = tableInput(row, 'name', appliance.name, { className: 'name-input' });
    nameInput.setAttribute('aria-label', `Appliance ${index + 1} name`);
    nameCell.appendChild(nameInput);
    row.appendChild(nameCell);

    const powerCell = document.createElement('td');
    const powerInput = tableInput(row, 'powerW', appliance.powerW, { type: 'number', min: 1, max: 12000, step: 1 });
    powerInput.setAttribute('aria-label', `Appliance ${index + 1} power in watts`);
    powerCell.appendChild(powerInput);
    row.appendChild(powerCell);

    const minutesCell = document.createElement('td');
    const minutesInput = tableInput(row, 'runMinutes', appliance.runMinutes, { type: 'number', min: 1, max: 720, step: 1 });
    minutesInput.setAttribute('aria-label', `Appliance ${index + 1} run minutes`);
    minutesCell.appendChild(minutesInput);
    row.appendChild(minutesCell);

    const deadlineCell = document.createElement('td');
    const deadlineInput = tableInput(row, 'deadlineHour', appliance.deadlineHour, { type: 'number', min: 1, max: 24, step: 1 });
    deadlineInput.setAttribute('aria-label', `Appliance ${index + 1} finish by hour`);
    deadlineCell.appendChild(deadlineInput);
    row.appendChild(deadlineCell);

    const flexCell = document.createElement('td');
    const flexInput = tableInput(row, 'flexibilityHours', appliance.flexibilityHours, { type: 'number', min: 0, max: 8, step: 1 });
    flexInput.setAttribute('aria-label', `Appliance ${index + 1} flexibility hours`);
    flexCell.appendChild(flexInput);
    row.appendChild(flexCell);

    const modeCell = document.createElement('td');
    const mode = document.createElement('select');
    mode.dataset.field = 'mode';
    mode.setAttribute('aria-label', `Appliance ${index + 1} mode`);
    for (const [value, label] of [['one-shot', 'One-shot'], ['repeatable', 'Repeatable']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      mode.appendChild(option);
    }
    mode.value = appliance.mode;
    mode.addEventListener('input', () => updateApplianceFromInput(mode));
    mode.addEventListener('change', () => updateApplianceFromInput(mode));
    modeCell.appendChild(mode);
    row.appendChild(modeCell);

    const circuitCell = document.createElement('td');
    const circuitInput = tableInput(row, 'circuit', appliance.circuit, { className: 'circuit-input' });
    circuitInput.setAttribute('aria-label', `Appliance ${index + 1} circuit`);
    circuitCell.appendChild(circuitInput);
    row.appendChild(circuitCell);

    const removeCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-row';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${appliance.name}`);
    remove.disabled = state.appliances.length === 1;
    remove.addEventListener('click', () => {
      state.appliances.splice(index, 1);
      invalidateSolution();
      renderTable();
    });
    removeCell.appendChild(remove);
    row.appendChild(removeCell);
    return row;
  });
  elements.rows.replaceChildren(...rows);
}

function addAppliance() {
  const index = state.appliances.length + 1;
  state.appliances.push({
    id: `custom-load-${index}`,
    name: `Custom load ${index}`,
    powerW: 800,
    runMinutes: 60,
    deadlineHour: 24,
    flexibilityHours: 0,
    mode: 'one-shot',
    circuit: 'main'
  });
  invalidateSolution();
  clearError();
  renderTable();
  const lastRow = elements.rows.lastElementChild;
  lastRow?.querySelector('input')?.focus();
}

function resetSample() {
  state.profileId = 'solar-heavy';
  state.intensity = parseIntensity('solar-heavy');
  state.appliances = clone(SAMPLE_APPLIANCES);
  invalidateSolution();
  clearError();
  renderGrid();
  renderTable();
  elements.jsonInput.value = JSON.stringify(samplePlanningInput(state.profileId), null, 2);
}

function colorIndexForAppliance(id) {
  const index = state.appliances.findIndex((appliance) => appliance.id === id);
  return index >= 0 ? index : 0;
}

function renderLegend() {
  const items = state.solution.optimized.assignments.map((assignment) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = `legend-dot tone-${colorIndexForAppliance(assignment.applianceId) % 12}`;
    const label = document.createElement('span');
    label.textContent = assignment.name;
    item.append(dot, label);
    return item;
  });
  elements.legend.replaceChildren(...items);
}

function renderTimeline() {
  const solution = state.solution;
  const circuits = [...new Set(state.appliances.map((appliance) => appliance.circuit))];
  const lanes = circuits.map((circuit) => {
    const lane = document.createElement('div');
    lane.className = 'lane-row';

    const label = document.createElement('div');
    label.className = 'lane-label';
    label.textContent = circuit;
    lane.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'hour-grid';
    for (const hour of HOURS) {
      const cell = document.createElement('div');
      cell.className = `hour-cell ${intensityClass(solution.intensity[hour])}`;
      const assignment = solution.optimized.assignments.find((item) => item.circuit === circuit && item.hours.includes(hour));
      if (assignment) {
        const detail = assignment.minutesByHour.find((item) => item.hour === hour);
        cell.classList.add('filled', `tone-${colorIndexForAppliance(assignment.applianceId) % 12}`);
        if (detail && detail.minutes < 60) cell.classList.add('partial');
        cell.textContent = applianceCode(assignment.name);
        cell.title = `${assignment.name}, ${formatHour(hour)} to ${formatHour(hour + 1)}, ${detail?.minutes ?? 0} minutes, ${solution.intensity[hour]} gCO2/kWh`;
      } else {
        cell.title = `${circuit}, ${formatHour(hour)}, no reserved load, background intensity ${solution.intensity[hour]} gCO2/kWh`;
      }
      grid.appendChild(cell);
    }
    lane.appendChild(grid);
    return lane;
  });
  elements.timeline.replaceChildren(...lanes);
  renderLegend();
  elements.searchMeta.textContent = `exact branch-and-bound · ${solution.search.nodes} nodes · ${solution.search.candidateCount} placements · whole-hour circuit reservations`;
}

function renderSummary() {
  const solution = state.solution;
  if (!solution) return;
  elements.metricOptimized.textContent = formatKg(solution.totals.optimizedGrams);
  elements.metricNaive.textContent = formatKg(solution.totals.naiveGrams);
  elements.metricSaving.textContent = formatKg(solution.totals.savingGrams);
  elements.metricPercent.textContent = `${solution.totals.savingPercent.toFixed(1)}%`;

  const rows = solution.appliancesSavings.map((row) => {
    const tr = document.createElement('tr');
    const cells = [
      row.name,
      formatWindow(row.naiveHours),
      formatWindow(row.optimizedHours),
      `${row.energyKwh.toFixed(2)} kWh`,
      `${formatGrams(row.savingGrams)} · ${(row.savingGrams / 1000).toFixed(3)} kg`
    ];
    cells.forEach((value, index) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (index === 4 && row.savingGrams > 0) td.className = 'positive-saving';
      tr.appendChild(td);
    });
    return tr;
  });
  elements.savingsRows.replaceChildren(...rows);
}

function solve({ scroll = true } = {}) {
  clearError();
  try {
    const payload = {
      intensity: state.intensity,
      appliances: state.appliances
    };
    state.solution = solveSchedule(payload);
    elements.results.hidden = false;
    elements.summary.hidden = true;
    elements.acknowledge.checked = false;
    elements.reveal.disabled = true;
    renderTimeline();
    renderSummary();
    if (scroll) elements.results.scrollIntoView({ block: 'start', behavior: 'auto' });
    return state.solution;
  } catch (error) {
    invalidateSolution();
    showError(error);
    return null;
  }
}

function revealSummary({ scroll = true } = {}) {
  if (!state.solution || !elements.acknowledge.checked) return;
  renderSummary();
  elements.summary.hidden = false;
  if (scroll) elements.summary.scrollIntoView({ block: 'start', behavior: 'auto' });
}

function currentPayload() {
  return {
    intensity: state.profileId === 'custom' ? { hours: state.intensity } : { profile: state.profileId },
    appliances: state.appliances.map((appliance) => ({ ...appliance }))
  };
}

function applyJson() {
  clearError();
  try {
    const parsed = JSON.parse(elements.jsonInput.value);
    const normalized = normalizePlanningInput(parsed);
    const intensityInput = parsed.intensity ?? parsed.intensityProfile ?? parsed.profile;
    let profileId = 'custom';
    if (typeof intensityInput === 'string' && PROFILE_IDS.includes(intensityInput)) profileId = intensityInput;
    if (intensityInput && typeof intensityInput === 'object' && PROFILE_IDS.includes(intensityInput.profile)) profileId = intensityInput.profile;

    state.profileId = profileId;
    state.intensity = [...normalized.intensity];
    state.appliances = normalized.appliances.map((appliance) => ({ ...appliance }));
    invalidateSolution();
    renderGrid();
    renderTable();
  } catch (error) {
    showError(error);
  }
}

function exportJson() {
  elements.jsonInput.value = JSON.stringify(currentPayload(), null, 2);
}

function downloadReport() {
  if (!state.solution) return;
  const report = {
    product: 'PeakShift',
    built: 'November 2026',
    disclosure: 'Modeled output from hourly synthetic or user-supplied intensity and nameplate appliance power. This is not measured utility, meter, bill or emissions data.',
    input: currentPayload(),
    totals: state.solution.totals,
    optimized: state.solution.optimized.assignments,
    naive: state.solution.naive.assignments,
    applianceSavings: state.solution.appliancesSavings,
    search: state.solution.search,
    notModeled: [
      'embodied carbon',
      'rebound effects',
      'tariffs and bills',
      'efficiency losses',
      'measured marginal emissions',
      'household infrastructure limits'
    ]
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'peakshift-modeled-report.json';
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.querySelectorAll('.profile-option').forEach((button) => {
    button.addEventListener('click', () => setProfile(button.dataset.profile));
  });
  elements.add.addEventListener('click', addAppliance);
  elements.solve.addEventListener('click', () => solve());
  elements.reset.addEventListener('click', resetSample);
  elements.acknowledge.addEventListener('change', () => {
    elements.reveal.disabled = !elements.acknowledge.checked;
  });
  elements.reveal.addEventListener('click', () => revealSummary());
  elements.download.addEventListener('click', downloadReport);
  elements.print.addEventListener('click', () => window.print());
  elements.applyJson.addEventListener('click', applyJson);
  elements.exportJson.addEventListener('click', exportJson);
  elements.resultsLink.addEventListener('click', (event) => {
    if (elements.results.hidden) {
      event.preventDefault();
      elements.solve.focus();
    }
  });
}

function bootstrapDemoState() {
  const params = new URLSearchParams(window.location.search);
  const requestedProfile = params.get('profile');
  if (requestedProfile && PROFILE_IDS.includes(requestedProfile)) setProfile(requestedProfile);
  const shot = params.get('shot');
  if (shot === 'schedule' || shot === 'summary') {
    document.body.dataset.shot = shot;
    solve({ scroll: false });
    if (shot === 'summary') {
      elements.acknowledge.checked = true;
      elements.reveal.disabled = false;
      revealSummary({ scroll: false });
    }
  }
}

bindEvents();
renderGrid();
renderTable();
elements.jsonInput.value = JSON.stringify(samplePlanningInput(state.profileId), null, 2);
bootstrapDemoState();

window.__peakshift = {
  state,
  solve,
  revealSummary,
  resetSample,
  setProfile,
  naiveEveningPlan,
  formatWindow
};
