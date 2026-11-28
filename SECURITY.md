# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/peakshift/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| latest `main` | Supported |

Security fixes are applied to the latest state of the default branch.

## Scope

This policy covers the static PeakShift browser application, including custom JSON input, schedule generation, print output, local browser storage and browser rendering.

In scope:

- A cross-site scripting or HTML injection path through appliance names, circuit labels, intensity input, schedule output or printed output.
- A JSON parser, validation or normalization flaw that bypasses documented input limits or executes attacker-controlled code.
- A print or report escaping flaw that makes generated output execute markup, a formula or a script when opened.
- A solver or resource-exhaustion flaw that can be triggered by input accepted as valid and makes the page unresponsive outside the documented search cap.
- A browser-storage or state-restoration flaw that crosses origins or persists attacker-controlled markup.

Out of scope:

- Browser vulnerabilities, operating system compromise or physical access to the machine.
- Damage caused by modified copies of the static application that do not come from this repository.
- The documented limits of the synthetic carbon-intensity model, unless a report shows a specific validation or output integrity failure.

## Coordinated disclosure

- Acknowledgment: within 3 business days.
- Initial triage: within 14 calendar days.
- Fix or mitigation target: within 90 calendar days for confirmed reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
