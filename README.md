<p align="center">
  <img src="./assets/logo.png" alt="dsh-think-ultra" width="170" />
</p>

# Think Ultra

**The heavy, local reasoning layer for the official DeepSeek Harness (DSH).**

Think Ultra is a native plugin for DeepSeek Harness that runs a real,
test-time-compute reasoning stack around the model's native maximum effort —
more samples, more judges, more verification, more reconciliation — entirely
on your machine, with no network calls of its own. It turns a single
maximum-effort response into a layered pipeline: multi-pass tournaments,
executable verification, cross-review, a metacognitive core, and model-callable
toolboxes.

The floor is welded to native `max`. Raising a slider widens the machinery
around that `max` call; it never changes the word in the request.

---

## What "Ultra" actually is

The DeepSeek API exposes four reasoning efforts: `off`, `low`, `high`, `max`.
There is no fifth — send `reasoning_effort="ultra"` and the provider rejects it.
Think Ultra wraps the registered provider adapter with a proxy, adds an
**Ultra** row to the native dropdown, and maps `ultra` back to **`max`** on the
way out, cached per `(provider, model)`.

**Ultra is not a magic word sent to the model. It is the machinery that runs
around and above a `max` call.** The gain is meant to come from test-time
compute, not adjectives in a system prompt: every heavier tier issues real,
additional, independent `max` calls through Harness's own `llm` surface, then
reconciles them.

---

## What's new in v0.1.0

- **Four fully isolated surfaces.** State is kept per *model × mode* —
  Flash / Pro × Velocity (迅流) / Apex (极境) — each persisted independently.
  Sliders, toggles, mode, authorization and directives never bleed across
  surfaces. Velocity is the fast single-chain base; Apex is its strict
  over-clocking superset.
- **Global capability control (0–20).** One number drives the whole reasoning
  ceiling. It exists only on the Ultra tier (greyed out and frozen on Max),
  remembers its value across launches, and the 19→20 step is a deliberate
  discontinuity that arms the full chain.
- **A 46-axis reasoning kernel.** The raw surface is 46 independent engine
  axes with zero fake controls; day-to-day they fold into 7 / 10 / 8 master
  rods (Flash / Pro / Vision), with every axis micro-tunable in an advanced
  panel.
- **Metacognition core, L1–L5.** L0 linear → L2 devil's advocate → L3
  multi-jury → L4 frame deconstruction → L5 recursive self-reference, with
  non-linear budget amplification (×1 to ×4.2), plus red, black, lab and abyss
  switches gated per level.
- **Seven deterministic Rust engines.** std-only, zero dependencies, zero
  network, JSON-RPC over stdio — including an 8-wave orchestrator, a
  probability field and a policy compiler. The plugin transparently falls back
  to a built-in JS engine if the native binary is missing.
- **OC over-clocking (Apex).** Multiple candidates → 2-gram clustering →
  self-consistency voting → cross-verification → falsification elimination →
  confidence ranking → optimal synthesis.
- **L1–L5 reasoning stack.** L1 tournament, L1.5 executable verification in an
  isolated local VM, L2 cross-review, L3 multi-paradigm forge, and a recursive
  reasoning tree.
- **Model-callable toolboxes.** 30 professional tools across five boxes plus
  21 layered reasoning tools, with a three-layer fuse for wall-clock, rounds
  and token budget.
- **Stability and memory.** 10-hour+ endurance, layered milestones, context
  distillation, goal anchoring, three-tier memory with semantic retrieval, and
  an anti-loop hard gate.
- **Super Think, code and vision.** A stable graded thinking phase, a seven-step
  code-understanding pipeline, and a seven-step multimodal vision pipeline
  (Flash can read images).
- **Hardened build.** The delivered client is obfuscated and self-defending.
  On violation it responds non-destructively — it clears in-memory markers and
  writes a local revocation flag; it never deletes files, opens a socket, or
  fingerprints hardware.

---

## Install

Requirements: **Node.js ≥ 22.6** and a working DeepSeek Harness install.
The published bundle already ships a built `lib/` — there is no build step.

```bash
# install into the web profile straight from GitHub
dsh plugin --profile web add https://github.com/YUEYUEXYS/dsh-think-ultra/tarball/main

# restart the profile
dsh --profile web
```

Or install a downloaded tarball:

```bash
dsh plugin add ./dsh-think-ultra-0.1.0.tgz
```

After restart, open the reasoning-tier dropdown and select **Ultra** to open the
control panel. First launch shows the welcome screen; your configuration is
persisted in the DSH profile. If the native Rust helper is absent or blocked,
the plugin falls back to the JS engine automatically.

---

## Quick start

1. Pick a model (DeepSeek V4.1 Flash — multimodal — or V4 Pro).
2. Set the inference tier to **Ultra**.
3. Open the panel and choose **Velocity** or **Apex**, and move the global
   capability slider.
4. Read the price estimator before you send on the heavy tiers.
5. Start the conversation — the enhancements engage automatically.

The model selects and calls the toolboxes itself on Ultra sessions; describe
what you want in plain language.

---

## Compatibility

- **Fully compatible with the latest DeepSeek Harness 0.1.6-alpha.2 (the
  0.16-alpha line).**
- Forward-compatible within `>=0.1.2-alpha.2 <0.2.0`; future 0.1.x releases keep
  working without changes, and only the breaking 0.2 line requires an update.
- Supported models: DeepSeek V4.1 Flash (multimodal) and DeepSeek V4 Pro.
- Node `>=22.6`.

---

## 100% offline

The plugin never phones home. Every rule, template and prompt fragment is
shipped locally and offline; the Rust core is std-only with no network APIs; a
static source scan shows zero network calls. The only update check is an
explicit, user-triggered read of the public release feed.

---

## Make money with Think Ultra

Think Ultra is explicitly licensed for commercial use — the deal is simple:
**you keep 100% of the money, you never mention us, you just never give away
the plugin itself.**

- Paid delivery, freelance work and agencies — charge for the deliverable.
- Consulting and advisory — audits, due diligence, deep research.
- SaaS or a hosted service — run it on the backend for your own customers,
  with subscriptions, usage, seats, retainers, credit packs or rush fees.
- Team and company leverage — cut turnaround on the hard tasks nobody else
  wants.
- Productised offers — "deep audit in 24h", "verified code review",
  "hard-problem sprint" as fixed-price products.
- Content, courses and public comparisons built on top of it.

You sell the **outcome while you run it**. You do not hand over the delivered
files, and you do not open, change, extract or re-host the build. There is no
royalty, no attribution, no audit, and no cap on your upside. See
[`LICENSE`](LICENSE).

---

## A note on cost

It is supposed to be expensive. Every judge, every re-solve and every fork of
the reasoning tree is a genuine extra `max` call, so cost climbs steeply with
the tiers — the devil's advocate, double recheck, best-of-n, dual jury, tree
tournament and L3 forge are the heaviest. There is no "make it stronger but use
fewer tokens" switch. Match the notch to the job and let the customer pay for
the fire.

The floor is native `max`, and every heavier notch adds real, additional
independent calls — that is how the pipeline is built, not a hope. This is not
a benchmarked ranking or a guaranteed head-to-head score against any named
model; whether it beats a particular system on your task is something only your
own tests can settle.

---

## License

Proprietary. **Think Ultra Proprietary Commercial License (TUPA-CL v1.0).**
Commercial use is expressly permitted inside DeepSeek Harness; reverse
engineering, de-obfuscation, file inspection, technical analysis, modification,
redistribution and re-hosting are prohibited. See [`LICENSE`](LICENSE).

---

**Made for DeepSeek Harness.** If Think Ultra helps, a star is appreciated.
