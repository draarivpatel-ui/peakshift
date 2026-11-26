export const SAMPLE_APPLIANCES = Object.freeze([
  Object.freeze({
    id: 'ev-top-up',
    name: 'EV top-up charge',
    powerW: 3200,
    runMinutes: 180,
    deadlineHour: 24,
    flexibilityHours: 0,
    mode: 'one-shot',
    circuit: 'garage'
  }),
  Object.freeze({
    id: 'dishwasher',
    name: 'Dishwasher',
    powerW: 1200,
    runMinutes: 75,
    deadlineHour: 22,
    flexibilityHours: 2,
    mode: 'one-shot',
    circuit: 'kitchen'
  }),
  Object.freeze({
    id: 'washer',
    name: 'Washing machine',
    powerW: 650,
    runMinutes: 60,
    deadlineHour: 21,
    flexibilityHours: 3,
    mode: 'one-shot',
    circuit: 'laundry'
  }),
  Object.freeze({
    id: 'dryer',
    name: 'Electric dryer',
    powerW: 2800,
    runMinutes: 45,
    deadlineHour: 22,
    flexibilityHours: 2,
    mode: 'one-shot',
    circuit: 'laundry'
  }),
  Object.freeze({
    id: 'water-heater',
    name: 'Heat-pump water heater',
    powerW: 2200,
    runMinutes: 120,
    deadlineHour: 20,
    flexibilityHours: 4,
    mode: 'repeatable',
    circuit: 'utility'
  }),
  Object.freeze({
    id: 'pool-pump',
    name: 'Pool filtration pump',
    powerW: 900,
    runMinutes: 120,
    deadlineHour: 18,
    flexibilityHours: 6,
    mode: 'repeatable',
    circuit: 'utility'
  })
]);

export function samplePlanningInput(profileId = 'solar-heavy') {
  return {
    intensity: { profile: profileId },
    appliances: SAMPLE_APPLIANCES.map((appliance) => ({ ...appliance }))
  };
}
