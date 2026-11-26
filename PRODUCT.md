# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML, CSS and vanilla JavaScript, because the brief requires an offline zero-dependency artifact that can be copied unchanged onto GitHub Pages.

## Users

A student or household energy learner using one synthetic day of grid carbon intensity to understand when flexible appliances can run with lower modeled emissions. The immediate judging audience is the Green Shift Hacks reviewer, who needs the model, evidence and limits to be inspectable without an account.

Assumptions inferred from the implementation brief because this is a subagent build with no live decision round: the primary user is a judge or student, the surface is an operate-style planner, and the sample household is illustrative rather than a real home.

## Product Purpose

PeakShift turns a 24-hour carbon-intensity curve and a household appliance queue into an exact hour-resolved schedule. It compares that schedule with a naive evening plan, quantifies modeled grams and kilograms of CO2e avoided, and makes the difference between modeled and measured emissions impossible to miss.

Success means a visitor can load the shipped sample, change an appliance or grid profile, run the solver, inspect the schedule and report, and understand what the model does not claim.

## Positioning

Unlike a generic carbon dashboard, PeakShift schedules loads with explicit constraints. Unlike a black-box optimizer, it uses an exact exhaustive hour-placement search with deterministic tie-breaking and refuses instances outside its search budget.

## Constraints and Commitments

- Fully offline after the static files load.
- No accounts, keys, analytics or external service calls.
- Synthetic intensity profiles must always be labeled synthetic.
- Hourly data and whole-hour circuit reservations are the model resolution.
- The honest limits panel and modeled-versus-measured acknowledgment are required product behavior, not optional copy.
- Public copy must not claim measured household savings, utility partnership, tariff savings or real-world emissions reduction.
- Built November 2026.
