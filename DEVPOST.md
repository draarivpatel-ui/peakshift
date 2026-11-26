# Devpost copy for PeakShift

## Inspiration

Electricity demand and grid carbon intensity do not peak at the same time in every grid. A dishwasher, dryer, water heater or EV charger can often run later or earlier without changing the service it provides. PeakShift was built fresh in November 2026 to make that tradeoff concrete. The project asks a simple question. If a household already plans to run the same appliances for the same minutes, how much modeled carbon intensity can be avoided just by choosing better hours?

## What it does

PeakShift is an offline carbon-aware load planner. It ships with three labeled synthetic grid profiles, solar-heavy, wind-heavy and coal-heavy. Each profile contains 24 hourly carbon-intensity values in gCO2/kWh. A household queue contains appliances with power in watts, run minutes, finish-by deadlines, deadline flexibility, one-shot or repeatable behavior and circuit ids.

The solver schedules every appliance into feasible hour slots. One-shot appliances stay contiguous. Repeatable appliances can split across separate hours. Every effective deadline is enforced. Two appliances on one circuit can never occupy the same hour, while separate circuits may overlap.

The app compares the optimized schedule with a naive evening-first plan. It reports total kgCO2e for both plans, the modeled saving, the percentage reduction and the marginal saving for each appliance. The result is gated behind an explicit acknowledgment that the output is modeled rather than measured. A visible panel lists important exclusions, including embodied carbon, rebound effects, tariffs, efficiency losses and measured marginal emissions.

## How we built it

PeakShift is dependency-free HTML, CSS and vanilla JavaScript. The browser UI and the Node test suite share the same ES module solver. No account, network service, external API, build step or runtime package is required.

The model uses hourly circuit reservations. Runtime is rounded up to whole hours for occupancy, while emissions are prorated by the real minutes in each occupied hour. The solver enumerates legal placements for each appliance and runs deterministic branch-and-bound search per circuit with bit-mask conflict checks. Ties break by cost and then hour order. Impossible deadlines and infeasible circuits are rejected. Oversized repeatable search spaces produce an honest error rather than a silent approximation.

The automated Node suite contains 26 deterministic test cases and 89 assertion statements. It covers intensity parsing, malformed input, appliance validation, feasible hour windows, deadline rejection, placement rules, emissions prorating, circuit conflict detection, naive-plan behavior, savings math, deterministic output, oversized search refusal and equivalence with a brute-force oracle on small mixed instances. A separate headless-Chrome harness passes 22 browser checks covering rendering, offline resource loading, the acknowledgment gate, deterministic totals, marginal rows and profile invalidation.

Three screenshots were captured at 1440 by 900 from the real running app. The demo video was captured locally at 30 fps from the app and uses locally synthesized narration.

## Challenges

The main challenge was keeping the scheduler understandable without making it trivial. Hourly carbon data means minute-level placement would imply false precision, but minute-level energy still matters when a run crosses an hour boundary. PeakShift separates those ideas. Circuit occupancy rounds up to whole hours, while emissions prorate by actual minutes.

A second challenge was making constraints visible. A cheapest-hour list would ignore contiguous appliance cycles, split loads, deadlines and circuit conflicts. The exact solver handles all four together and exposes its own resolution and search limits.

The third challenge was avoiding overclaiming. Carbon-aware timing is easy to present as guaranteed climate impact. The app instead treats the result as a modeled comparison and requires the user to acknowledge the difference before showing the summary.

## Accomplishments

PeakShift runs entirely offline as a static page while still using an exact deterministic solver. It does not hide the model behind a black box. Visitors can inspect and edit the appliance queue, paste custom JSON, see the schedule hour by hour, download the modeled report and read the model contract.

The sample solar-heavy day reduces modeled emissions from 11.55 kgCO2e in the naive evening plan to 1.85 kgCO2e in the optimized plan, a modeled reduction of 84.0 percent for the same 20.05 kWh of appliance demand. The wind-heavy and coal-heavy profiles produce different outcomes, showing that the value of shifting depends on the shape of the grid day.

The test suite proves the solver against brute-force enumeration on small instances rather than relying only on hand-picked examples.

## What we learned

Load shifting is a constraint problem, not just a chart-reading problem. The lowest-carbon hour is not always feasible once contiguous cycles, split operation, deadlines and circuit sharing are considered.

The work also showed how important boundary honesty is for climate software. Tariffs, behavior change, embodied emissions, efficiency losses and marginal grid emissions can change the real-world answer. A useful educational tool can still be rigorous if it names those exclusions clearly.

## What's next

Useful next steps are sub-hourly intensity data, measured marginal-emissions sources where available, tariff comparison as a separate objective, appliance-specific ramp and minimum-cycle constraints, service-panel capacity limits, battery and rooftop-solar interactions, uncertainty ranges and multi-objective schedules that weigh carbon against cost and comfort.

## Built with

HTML, CSS, JavaScript, Node.js, the Node test runner, headless Chrome, FFmpeg and local OmniVoice narration synthesis.

## AI disclosure

AI coding assistants were used during implementation, debugging, test design, documentation and video-production scripting. The solver behavior, numerical outputs, tests and final claims were checked through deterministic automated tests, brute-force oracle comparisons on small instances and local browser verification. Local voice synthesis was used for the demo narration.
