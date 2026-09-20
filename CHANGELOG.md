# Changelog

This project follows a preview-first cadence; delivered builds are hardened
and obfuscated, and internal implementation details are intentionally not
disclosed here.

## [0.1.0]

### Stable release
- First stable release of the hardened **Think** distribution for DeepSeek
  Harness (package `dsh-think-ultra`).
- Global capability control (0–20) scoped to Ultra inference; it is rendered
  disabled on non-Ultra tiers and is fully isolated per model and mode.
- Four isolated surfaces, persisted independently: **Flash · Velocity**,
  **Flash · Apex**, **Pro · Velocity** and **Pro · Apex**. The Apex layer is
  the strict superset of the Velocity base; switching model or mode is a clean
  state transition with no cross-surface leakage.
- First-run welcome flow with a built-in EN/中文 switch (defaults to English);
  the persisted schema resets cleanly for first-time users.
- Expanded reasoning toolbox and a dedicated engine set plus per-surface
  profiles; the full set is surfaced on the host side and wired into the
  client settings panel.
- Optional offline native guardian core (std-only, zero network/DNS); when
  blocked or missing, the plugin transparently falls back to its built-in JS
  engine.
- Distribution hardening: the client bundle ships hardened/obfuscated with
  identifier pulverisation, string-array encryption, control-flow flattening,
  self-defence, integrity anchoring, developer-tools detection, runtime
  tamper / freeze detection and a non-destructive revocation mechanism. The
  runtime never deletes user files, never performs network calls and never
  fingerprints hardware.
- Compatibility: DeepSeek Harness `>=0.1.2-alpha.2 <0.2.0` (covers the
  0.1.6-alpha line), Node `>=22.6`.
- Custom distribution licence: commercial monetisation is expressly
  permitted and encouraged; deobfuscation, reverse engineering, modification,
  extraction and re-upload are prohibited — see [LICENSE](LICENSE).

## [0.10.0-experimental-preview]

### Notes
- First **experimental preview** of the hardened dsh-think-ultra distribution for
  DeepSeek Harness.
- Ultra is layered strictly above native `max` effort (the wire payload remains
  `max`); it adds the depth, stability, toolbox, memory and metacognitive stack.
- Three rigorously isolated surfaces: **Flash**, **Vision** (Flash with visual
  perception / deep image reading) and **Pro** (widest control set).
- Per-model core depth sliders, a collapsible stability cluster, capability
  toggles, per-model persisted preference directives, one-shot presets and
  model-specific Ultra toolboxes.
- Native guardian core bridged over stdio JSON-RPC; 100% local operation.
- Distribution hardening: identifier pulverisation, RC4 string-array encoding,
  control-flow flattening with decoy paths, self-defence, anti-debug and a
  host-binding virtual-machine gate.
- Custom distribution licence (TUPARL-1.0): commercial monetisation expressly
  permitted and encouraged; deobfuscation, reverse engineering and repository
  hijacking prohibited — see [LICENSE](LICENSE).

> Experimental preview: not a stable, independently audited release; surfaces
> and notches may change between builds.
