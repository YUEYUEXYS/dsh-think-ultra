<p align="center">
  <img src="./assets/logo.png" alt="dsh-think-ultra" width="170" />
</p>

# dsh-think-ultra

A reasoning layer for DeepSeek Harness (DSH). Current build is
`0.10.0-experimental-preview`. It runs only inside an official, unmodified DSH,
and this repository ships the delivered build — the readable source is not
published, and the licence does not grant reverse analysis, modification or
extraction (see [LICENSE](./LICENSE)).

## What "Ultra" actually is

<p align="center">
  <img src="./assets/logo.png" alt="Ultra" width="100" />
</p>

DeepSeek's API exposes four reasoning efforts: `off`, `low`, `high`, `max`.
There is no fifth one. Send `reasoning_effort="ultra"` and the provider
rejects the request outright (`... does not support reasoning effort "ultra"`).
This plugin never makes that mistake.

It wraps the already-registered provider adapter with a proxy. The proxy adds
an `Ultra` row to the model's effort list so the native dropdown shows it, and
on the way out — in both `stream` and the v0.11 `prepareCall` path — it maps
`ultra` back to `max`, the strongest effort the API actually accepts. That
mapping is cached per `(provider, model)`, so Flash, Vision and Pro never
overwrite each other. If a future DSH build changes the registration shape and
the proxy cannot attach, the client falls back to a 1:1-styled replica
dropdown; the wire value underneath is still `max`.

So the floor is welded to native `max`, always. Ultra is not a magic word sent
to the model. It is the machinery that runs **around and above** a `max` call.
Moving a slider up widens that machinery; it does not change the word in the
request.

## It is not a prompt wrapper

The gain is meant to come from test-time compute, not from adjectives in a
system prompt. Each heavier tier issues **real, additional, independent `max`
calls** through Harness's own `llm` surface, then reconciles them. The layers,
from cheap to expensive:

- **L1 — tournament.** Several independent `max` samples of the same task, a
  separate adjudicator pass over them, a repair pass aimed at the concrete
  defects the judge named, and only the strongest candidate is delivered.
- **L1.5 — executable verification.** Anything in an answer that can be
  computed or run — arithmetic, pure-function behaviour, dates, complexity
  claims — is extracted as an assertion and actually executed in an isolated
  local VM. A failed assertion is hard evidence, not an opinion, and the
  answer is corrected against it.
- **L2 — cross-review.** The main answer is left intact and audited by an
  independent pass; only the specific faults found are patched back in.
- **L3 — forward reasoning toolkit.** The problem is solved again from
  scratch under several different reasoning paradigms, each a separate `max`
  call, and a result needs at least two independent routes to agree before it
  is folded back.
- **Recursive reasoning tree.** The single-layer tournament is turned into a
  tree: the root fans out into different viewpoints according to the branching
  slider, each layer is judged, and a dedicated falsification pass tries to
  kill the leading answer before it is allowed up the tree.
- **Model-callable toolboxes.** Tools the model can actively function-call,
  mounted into a session's own agent scope only while that session is on Ultra
  — non-Ultra sessions and other conversations cannot see them. Flash, Vision
  and Pro get different tool sets.

Around those sit a metacognition loop (boundary assessment, difficulty
estimate, path self-correction, intermediate self-check, error rollback,
self-quantification), a multi-agent scheduler (task sharding, deadlock
avoidance, priority scheduling, subtask state sync, dynamic resource
allocation), and a task guardian (circuit breaking, silent retry, keep-alive,
traceable fault location, snapshot/rollback, self-healing).

A small **native daemon** backs the host side. It is written in Rust with the
standard library only — no network APIs, no third-party crates, a hand-written
JSON parser over line-delimited stdio RPC. It does output review, long-session
drift scoring with an auto-breaker, snapshot save/rollback, bounded project
parsing (file/language/definition census with hard caps), and branch planning.
Everything stays on the machine.

The whole thing has one source of truth: an "essence" engine that resolves a
`model × mode × tier` matrix into the actual intensity of every axis. The
sliders are a view over that matrix, not independent flags.

## Three profiles, kept strictly apart

State does not cross between models. Slider positions, toggles, directive
text and saved state are stored per profile; switching model loads only that
model's table, and Ultra arms only when Ultra is selected.

| Profile | Main axes | Stability axes | Extra | Directive cap |
|---|---|---|---|---|
| **Flash** | 8 | 3 shown (2 more run as a fixed hidden floor, never collapsing to zero) | base toolbox | 16,000 chars |
| **Vision** | 11 (the Flash set + 3 visual axes: tiled close-reading, cross-checking image against text, visual graph reading) | 3 shown | Flash toolbox plus vision-only tools (overlapping-tile transcription, image/text cross-verification) | 16,000 chars |
| **Pro** | 15 (the Flash set plus code-strength and the full metacognition/abstraction/synthesis/coherence/calibration block) | all 5 | the largest tool and channel set | 40,000 chars |

Vision is, by construction, Flash with eyes. Pro is a strict superset by
capability, not by accident.

Each axis has seven magnetic notches: **off, low, medium, high, ultra-high,
extreme, zenith.** `zenith` is the all-open notch and is kept locked for now;
an axis tops out at `extreme` unless that profile is allowed higher, and the
ceiling differs per axis and per model on purpose. That leaves headroom for
later builds instead of giving every slider the same range.

The directive box is not a truncated string. A clause-level compiler splits
the text, classifies each clause, and layers it (a near-constitutional layer
versus soft preferences) rather than cutting sentences at a character count.
A backend budget valve degrades long directives by depth tier so they cannot
overflow the context window.

## The panel

The control surface is built to a fairly obsessive standard because you will
look at it all day: a dark-violet liquid-glass design language that runs from
deep violet at low notches toward electric violet and a white-hot magenta at
the top; magnetic snapping; pooled particles on DPR-aware `requestAnimationFrame`
loops with transform/alpha-only painting; a live constraint solver that
measures real DOM rectangles and repairs overlap, z-index fights and viewport
overflow as they appear; a render scheduler aimed at holding 120 fps by
cutting redundant paints and reusing resources. The panel follows Harness's
global language (Chinese/English), persists every setting to `localStorage`
so a refresh or crash restores the exact layout of all three profiles, and
includes:

- a price estimator built on public list prices and the **real** per-tier call
  counts (the same mapping the tournament uses), with every multiplier shown
  separately — it cannot see DeepSeek's backend billing, so it never pretends
  to be exact;
- a dangerous-action hard breaker with graded policy from log-only up to hard
  block;
- a zero-token "essence pre-check" on submit that strips the literal wording,
  pulls out the real objective and any hidden constraints, contradictions,
  missing preconditions or infeasible asks, and asks for confirmation before
  sending;
- token throttling budgets per notch, from unlimited at off down to a tight
  input budget at the top.

## It is supposed to be expensive

This is the part to read before you drag everything to the top. Every judge,
every re-solve, every fork of the reasoning tree is a genuine extra `max`
call, so cost climbs steeply with the tiers — the toggles named devil's
advocate, double recheck, best-of-n, dual jury, the tree tournament and the
L3 forge are the heaviest. There is no "make it stronger but use fewer tokens"
switch here by design; if you want cheap, stay on the lower notches and read
the price estimator before you send. The plugin exists for the opposite
trade-off: spend the compute, raise the floor, and check the result harder.

## What it is reaching for, and what it does not promise

### The part that is certain

Start from what the machinery guarantees regardless of any outside model. The
wire floor is native `max` - the strongest effort DeepSeek actually accepts -
and every heavier notch adds **real, additional, independent `max` calls** on
top of it rather than relabelling the request. With the heavy axes open, then,
both Flash and Pro are, by construction, a substantial step above their own
bare-`max` baseline: more samples, more independent passes, more verification,
and more reconciliation before anything reaches you. That gain is how the
pipeline is built, not a hope.

### The two reference points

The design is aimed at two specific flagships that sit a weight class above
the underlying model:

- **Flash on Ultra, fully opened,** is built to close most of the gap to - and,
  on a meaningful share of long-chain reasoning, multi-step execution and
  code-engineering tasks, to punch upward toward - **Fable 5**-class
  performance. Flash is the small, cheap model; the entire point is that
  stacked test-time compute lets it trade blows well above its listed tier.
- **Pro on Ultra** starts from the stronger model that already sits close to
  that tier on bare `max`, and is built to run right alongside **Opus 5**-class
  systems: a deeper tournament, the full metacognition/abstraction/synthesis
  block, the largest toolbox and every stability axis the build exposes.

Vision inherits the entire Flash target and layers the visual close-reading
axes on top - it is Flash with eyes, held to the same reference points rather
than a separate, weaker track.

### Where this goes next

The architecture is deliberately not capped at today's models.

- **As the host gets stronger, Ultra rises with it.** Ultra is a layer above
  DeepSeek's own `max`, not a patch frozen against one snapshot. When DeepSeek
  ships a newer base - v4.1, v5 and beyond - the floor rises with it, and the
  same tournament, executable-verification, cross-review and recursive
  reasoning-tree stack compounds on top of the new baseline instead of being
  rebuilt from zero. A stronger native `max` is a stronger starting point for
  every Ultra tier.
- **As the build gets more abstract, the target moves up.** The end state is
  not "tie one named flagship". It is a depth engine whose notches, toolboxes
  and multi-agent scheduling keep being pushed toward whatever the next
  generation of frontier systems looks like. The locked `zenith` notch and the
  deliberately different per-axis ceilings exist so there is real headroom to
  aim there later without destabilising the current preview.

### What is, and is not, promised

Be clear-eyed. This is an **experimental preview**, and a full benchmark
battery against those flagships has not been run. Everything above is the
architectural direction and the theoretical result of stacking additional
`max` compute - a target the system was built against, not a warranted
ranking, measured score or business outcome (the licence says the same in
Article 23). It is expected to match or beat the bulk of ordinary models in
its own lane; whether it beats a specific named flagship on *your* task is
something only your own tests can settle. The names Fable 5 and Opus 5 are
design reference points, not claims of a finished head-to-head comparison.

## Why the source is not in this repository

The hard part was never writing an assertive prompt. It is bolting a
multi-layer test-time pipeline, three isolated profiles, a `max`-welded wire
layer, a local Rust daemon and a 120 fps glass panel into Harness's lifecycle
without editing a single line of the host and without destabilising it across
model switches and long sessions. Because of that, only the delivered build is
published. The readable source, internal construction and build tooling are
not supplied, and the licence expressly forbids reverse analysis (even for
research or learning), changing even a byte, extracting technical material,
feeding the build to an AI to reconstruct it, and re-uploading it.

## Where it runs

The authorised locus is an official, unmodified DeepSeek Harness. This build
targets the `0.11.0-rc.2` generation of the DSH client/agent/peer packages
(and `cordis ^4`), on Node `>= 22.6`. Inside an official Harness you are
welcome to stack it with other plugins and let them interoperate through the
host's ordinary interfaces — Harness is a plugin ecosystem, and coexistence is
expected use.

Taking the unchanged build and trying to run it inside some other, non-DSH
agent application is a different matter: the licence treats that as a fenced
grey zone — not licensed, not supported, not warranted, and it gives no
immunity from the no-reverse/no-modify/no-extract rules. Read Article 9 of the
licence before you go there. Running it on a forked, patched or re-hosted
"DSH" is not the grey zone; it is simply out of scope.

## Install

1. Use an official DSH at a supported version, Node `>= 22.6`.
2. Install the plugin into DSH's plugin location the usual way (the peer
   packages `@deepseek-ai/cordis`, `dsh-client-runtime`,
   `dsh-client-ui-conversation`, `dsh-client-ui-sidebar`, `dsh-agent` and
   `dsh-invariants` are provided by the host).
3. Copy `dsh-think-ultra.config.json.example` to your DSH home as
   `thinking-ultra.config.json` if you want the hand-edited surface; the panel
   covers normal use.
4. Pick a model, select **Ultra**, and open the panel.

## ◆ THIS EXISTS TO MAKE YOU MONEY — read this like your rent depends on it, because it can

> Every line of code in here, every fork of its reasoning tree, every single
> pixel of that violet panel was engineered for one thing and one thing only:
> **to put money in your pocket.** It doesn't sleep. It doesn't hedge. It
> thinks at `max` so that *you* can charge at `max`. This is not a plugin you
> use — it's a workforce you deploy.

### ▸ The honest part — and the mantra

At full tilt Ultra spends real tokens — real money — every second it thinks.
I won't insult you by hiding that. Now burn this line into your skull:

**► An Ultra running at full power that isn't billing *somebody* is running
backwards — turning your own tokens into smoke.**

You did not install something this extreme to hand out free favours. If all it
ever does is drain *your* balance while you give its results away — honestly,
I'd worry about you. You'd be holding a force multiplier and using it as a
candle. **Don't. Point it at revenue, and let somebody else pay for the fire.**
You're not buying tokens; you're buying the right to out-think and out-deliver
people spending ten times what you spend.

### ▸ It's all already cleared for you — the entire deal, in one place

- ◆ **You keep 100% of the money.** Every subscription, every invoice, every
  tip — yours. Zero royalty, zero rev-share, zero per-seat tax, zero renewal
  fee, zero fine print.
- ◆ **Charge any price, in any shape.** Subscriptions, metered/usage billing,
  monthly retainers, seat licences, refillable credit packs, rush fees,
  one-off projects, agency work, white-labelled *services*, multi-tenant SaaS
  — any industry, any territory, any language.
- ◆ **No "powered by", no attribution required.** You never have to mention me
  to a customer; brand the *service* however you like.
- ◆ **No copyleft, no viral licence crawling into your stack.** Your prompts,
  your surrounding code, your workflow, your customer list, every output — all
  yours, sealed, sellable, secret if you want it secret.
- ◆ **No accounting back to me.** I don't audit your books, I don't cap your
  upside, I don't even ask.
- ◆ **You can send me nothing. Ever.** That isn't a loophole I forgot to close
  — it's the entire design. I win when you win. Full stop.

### ▸ How to actually run it — zero to first delivery

1. ► Load it in an official DSH (see [Install](#install)), pick a model,
   select **Ultra** — the outgoing floor snaps to native `max` the instant you
   do.
2. ► Match the notches to the job: lighter tiers for volume and speed; the
   heavy machinery (tournament, double recheck, best-of-n, L3 forge, recursive
   reasoning tree) for the work that has to be unbeatable.
3. ► Read the price estimator *before* you send — it lays your real token cost
   bare. Then quote the customer **comfortably above** that number. The gap
   between the two is your wage.
4. ► Deliver the **result**, never the files: you run Ultra, the client
   receives the outcome. That one habit keeps you clean under the licence *and*
   makes you irreplaceable.
5. ► Save every winning configuration per profile — it persists. The next
   identical job becomes one click, and that is exactly how raw effort turns
   into a repeatable income line.

### ▸ Where the money is · how to take it · how to make it stable

**◆ WHERE — the shelves you sell on**
► Freelance, gig and crowdsourcing boards · agency subcontracting · niche
communities and Discords · local businesses and founders who could never hire
a whole team · your own audience, mailing list or storefront · and, once you're
ready, your own hosted service. Go where the painful, high-stakes,
"nobody-else-wants-this" work already gathers — that's where price pressure is
weakest and your edge is sharpest.

**◆ HOW — what you're actually selling**
- **Cash today:** the jobs people flinch from — long multi-step research, code
  that must be right the first time, reports and analyses that normally need
  three painful passes, hopeless-looking data, "is this even solvable"
  briefs. Charge per job, per hour, or a rush premium. You bring depth buyers
  can't find at your price point; that gap *is* the margin — take it.
- **Productised offers:** package the repeats into fixed-price products
  ("deep audit in 24h", "hard-problem sprint", "verified & reviewed
  deliverable") so you never reinvent the quote.
- **The big swing:** wrap it into your own service — a hosted studio, a
  vertical agent for one industry (legal first-pass, financial analysis, code
  review, research desk, content factory, data wrangling), multi-tenant SaaS,
  white-label outcomes. Sell the outcome; never the files.

**◆ STABLE — turn gigs into rent money (this is the part that changes a life)**
- ► Move every one-off buyer onto a **monthly retainer / care package** — "your
  hardest problems, handled every month". Predictable cash you can actually
  plan a life around.
- ► Layer recurring revenue on top: maintenance & monitoring subscriptions,
  refillable credit packs, a paid membership, priority/rush tiers.
  *One retainer is side money → five is your rent → twenty is a company.*
- ► Hold many small clients instead of betting everything on one big one —
  that's resilience, not luck.
- ► Pour early profits into templates and saved Ultra profiles, so delivery
  gets cheaper for you every single week while your price stays firm.
- ► Over-deliver once and own the relationship: work this strong turns one
  invoice into a renewal, a renewal into a referral, and a referral into
  compounding income you don't have to grind from scratch every morning.
- ► Keep a hard margin between token cost and price, invoice on a rhythm, and
  never let a single customer be bigger than you can afford to lose. That's
  what "stable" actually means — a structure, not a wish.

### ▸ And when it pays off

When it lands your first paid gig, rescues an entire night, or just makes you
grin at how absurdly hard it went — **come back and star this repo**, and hand
it to the next person grinding as hard as you. That is genuinely the fuel. If
it put real money in your pocket and you're feeling generous, a coffee or a tip
through the sponsor button means the world — never expected, never required,
*your* income always comes first. But when it happens, it tells me this wild,
unreasonable thing actually lifted somebody's life, and I'll pour every bit of
it straight into the next, even more insane version. You owe me nothing;
earning well is already the best thank-you I could ever receive.

### ▸ The one line you don't cross

Sell the **service and the result while you run it**; never hand over the
delivered files, and never open, change, extract, reconstruct or port the
build. Article 18 is the test; Article 27 is the cost of crossing it. Stay on
this side and you are completely — gloriously — free.

> Now close this page, put a number on your first offer, and go make it rain.
> **Every pixel was built for this moment. Don't you dare let it think for
> free.** ✦

## Roadmap

Follow supported official DSH releases with compatibility builds; keep opening
higher notches and more model-specific toolboxes in later versions. The
interface and internals of a preview can change between builds.

## Licence

Proprietary delivered-build terms — see [LICENSE](./LICENSE). In one
sentence: commercial operation is extremely permissive and royalty-free;
operation is scoped to the official DSH ecosystem; off-host use is a documented
grey zone; reverse analysis, modification, extraction, AI reconstruction and
re-upload are not permitted, with the consequences set out in Article 27.
