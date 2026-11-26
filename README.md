# PeakShift

Live app: https://aariv.me/peakshift/
Source code: https://github.com/draarivpatel-ui/peakshift

PeakShift is an offline home-load shifter built in November 2026. It schedules flexible household appliances against one synthetic day of hourly grid carbon intensity and compares the optimized plan with a naive evening-first plan.

The app is one static HTML page with vanilla CSS and JavaScript. It has zero runtime dependencies, no accounts, no analytics, no external service calls and no build step. A labeled sample day ships in the page.

## What it does

- Loads one of three labeled synthetic grid profiles: solar-heavy, wind-heavy or coal-heavy.
- Accepts custom JSON with 24 hourly intensity values in gCO2/kWh and a household appliance list.
- Models each appliance with power in watts, run minutes, a preferred finish hour, deadline flexibility in hours, one-shot or repeatable behavior, and a circuit id.
- Rounds circuit occupancy up to whole-hour reservations because the carbon input is hourly.
- Keeps one-shot runs contiguous and lets repeatable runs split across non-contiguous hours.
- Honors hard effective deadlines, calculated as finish-by hour plus flexibility hours.
- Prevents double-booking on each individual circuit while allowing separate circuits to run at the same time.
- Uses exact deterministic branch-and-bound search over legal hour placements.
- Reports optimized kgCO2e, naive-evening kgCO2e, total modeled saving, percent reduction and per-appliance marginal savings.
- Requires the user to acknowledge that the result is modeled rather than measured before the summary is shown or printed.
- Includes a visible panel describing what the model does not represent.

## Model

The day is divided into 24 hourly intensity slots. Every appliance needs `ceil(runMinutes / 60)` whole-hour circuit reservations. Emissions are prorated by actual run minutes rather than charged for the entire final reservation. For example, a 2000 W appliance running 90 minutes uses 2 kWh in its first hour and 1 kWh in its second hour.

A one-shot placement is one consecutive run of hours. A repeatable placement is any set of distinct hours before its deadline. For each circuit, the solver enumerates legal placements, sorts them by cost and placement order, then performs branch-and-bound search with a bit mask of occupied hours. It returns the minimum-cost feasible assignment under the model. Ties resolve deterministically by lexicographic hour order. If a deadline or circuit makes the instance impossible, the solver rejects it. If the exact search space exceeds the explicit cap, the solver reports that limitation instead of silently switching to a heuristic.

The comparison plan is deliberately simple. It starts appliances at 18:00 when feasible, respects the same deadlines and circuit exclusions, and otherwise falls back to the earliest feasible hours in input order. It is a behavioral baseline for comparison, not a claim about how every household behaves.

## Honest limits

PeakShift does not model embodied carbon, rebound effects, tariffs, bills, efficiency losses, standby power, power factor, motor ramps, measured marginal emissions, panel capacity, battery behavior, solar self-consumption or utility demand-response rules. The three shipped curves are synthetic average-intensity shapes. They are not live telemetry or a forecast for any real balancing authority. The output is an educational modeled comparison, not proof of real-world emissions reduction.

## Run locally

Requires Node 22 or newer for the test suite. The browser app itself is static.

```bash
npm run serve
```

Then open the printed local URL. Any other static file server also works.

## Tests

```bash
npm test
npm run check:browser
```

The Node suite contains 26 deterministic test cases and 89 assertion statements. Coverage includes intensity parsing, malformed input, appliance validation, hour-window feasibility, deadline rejection, placement validation, contiguous and split runs, prorated emissions, circuit conflict detection, naive-plan behavior, savings reconciliation, deterministic output, oversized-search refusal and solver equivalence with a brute-force oracle on small instances.

The browser harness adds 22 checks in headless Chrome. It verifies rendering, offline resource loading, the acknowledgment gate, deterministic sample totals, summary rows and profile invalidation.

## Screenshots and video

Three real 1440 by 900 screenshots live in `assets/screenshots/` and are regenerated with:

```bash
npm run screenshots
```

The committed demo video is `video/demo.mp4`. It was captured locally at 30 fps from the running static app with local narration synthesis. It is not hosted on YouTube.

## Input schema

```json
{
  "intensity": { "profile": "solar-heavy" },
  "appliances": [
    {
      "id": "dishwasher",
      "name": "Dishwasher",
      "powerW": 1200,
      "runMinutes": 75,
      "deadlineHour": 22,
      "flexibilityHours": 2,
      "mode": "one-shot",
      "circuit": "kitchen"
    }
  ]
}
```

`intensity` may instead be an array of exactly 24 finite numbers from 0 to 2000. `deadlineHour` is an end hour from 1 to 24. `flexibilityHours` extends that deadline inside the same modeled day. `mode` is `one-shot` or `repeatable`. At most 12 appliances are accepted.

## AI disclosure

AI coding assistants were used during implementation, debugging, test design, documentation and video-production scripting. The solver behavior, numerical outputs, tests and final claims were checked through deterministic automated tests, brute-force oracle comparisons on small instances and local browser verification. Local voice synthesis was used for the demo narration.

## License

MIT. See `LICENSE`. The bundled Public Sans and IBM Plex Mono font files are used under the SIL Open Font License in `fonts/OFL.txt`.
