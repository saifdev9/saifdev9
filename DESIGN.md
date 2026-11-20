# DESIGN: saifdev9 profile

## Brief

- Subject: Saif Ali (`saifdev9`), Kolkata. GitHub bio: "LEAD FRONT-END DEVELOPER && JR. DevOps Engineer", company Indiminds.
- Audience: recruiters, other developers, teammates landing on github.com/saifdev9.
- Job: in 3 seconds say who this is and that the work ships; then show the real repos.
- Canvas: the GitHub profile README. GitHub strips CSS, JS and `style` from Markdown, so every
  designed surface is an SVG image (CSS animation inside the SVG still runs). Text stays in
  Markdown where it has to be readable, linkable or selectable.
- Assets: none supplied. All content comes from the public GitHub profile and repos.

## Concepts

| | Idea | Anchor | Signature | O / F / Fe / P |
|---|---|---|---|---|
| **A. Formal: `&&`** | The profile runs the bio as a shell chain. The right side of `&&` only runs if the left exits 0, so the page is a log of commands that succeeded | The bio literally says `FRONT-END DEVELOPER && DevOps`; gitcloner, scripts and claude-skills are shell-native | `front-end` types, returns `0`, the `&&` snaps on in taxi yellow, `devops` runs | 4 / 5 / 5 / 1 |
| B. Place: Kolkata taxi | Black and yellow Ambassador taxi livery as the identity, the meter as the stat counter | Kolkata | meter digits rolling over | 3 / 3 / 4 / 4 |
| C. Process: clone many | The profile as gitcloner's progress screen, every repo a progress bar | gitcloner | 18 bars filling in parallel | 2 / 4 / 4 / 4 (terminal READMEs are everywhere) |

Pick A. It cannot move to anyone else: the operator is in Saif's own bio. Stolen from B: the
accent is Kolkata taxi yellow, and the hero carries the city's coordinates.

Found while setting it: `front-end` and `&& devops` are both exactly nine characters, so in a
monospace face the two roles lock into a perfect 9-cell block. That became the grid.

## Concept card

```
Idea:        Saif's bio is a shell chain, front-end && devops; the profile runs it, and everything on it exited 0.
Metaphor:    a POSIX shell: prompt, command, exit status, logout.
Signature:   hero: the chain executes (type, exit 0, && snaps yellow, devops runs), then the prompt waits.
Emotion:     precise and a little playful; a tool that works.
Motion verb: execute: things appear in run order with a hard snap (steps), never a soft fade.
Screenshot:  the 9x2 block "front-end / && devops" with the yellow ampersands and the 0 chips.
```

## System

- Palette (single committed theme; it reads on GitHub light, dark and dimmed):
  - `ground` #0D1117, GitHub's own dark canvas (was a warm tar #0B0B0A; changed so dark mode shows no seam)
  - `ink` #F3F0E7
  - `muted` #A29E93 (7.6:1 on ground)
  - `line` #262B33 hairlines and cells
  - `accent` #FFC72C Kolkata taxi yellow; only for `&&`, exit codes and the running job
  - `on-accent` #0B0B0A
- Type: Geist (reading: titles 600, labels and prose 400/500) and Geist Mono (code only: the
  chain, prompts, stage names, repo names, URLs; 700 display, 400 text). Both Google, OFL.
  Chosen at the owner's request for a more professional face; it replaced an all-Martian-Mono
  system. All type is converted to outlines at build time, so nothing depends on fonts
  loading inside an `<img>`.
- Charts (dataviz method): contributions are an isometric year (after the owner's reference
  screenshots): one bar per day, height and color both from GitHub's own level buckets on the
  one-hue ramp #1B2025 #6B5110 #9C7714 #D19F17 #FFC72C (faintest level 2.5:1 on ground), lit
  from the top left; the figures sit in the strip's two empty corners on desktop and in a row
  above it on compact art (phones show the last 26 weeks). The bars rise once, week by week,
  in under 1.5 s. A radar of contribution types was considered and left out: 2,642 of 2,692
  contributions are private and GitHub does not break those down, so it would show 35 commits.
  Languages are ranked bars in two columns, one hue (ink, "Other" muted), value at the tip.
  No hover exists in an image, so each panel's alt text is its table view. Data comes from the
  public contribution page (exactly what visitors see) and the public repos API at build time;
  .github/workflows/redraw.yml rebuilds daily.
- Grid: 10 columns across a 904-unit measure (margin 48 of 1000). Columns 1 to 9 hold content,
  column 10 is the status gutter where exit codes live. The hero display size is set so one
  glyph advance equals one column. Compact panels use the same rule on 640 and 400 units.
- Three art sizes, picked by window width so each renders between ~0.8x and ~1.3x. GitHub's
  README column is ~310 to 685 px below 768 px, drops to ~390 px when the profile sidebar
  appears at 768 px, and reaches ~846 px at 1280 px:
  phone (400) for <=600 px and 768-900 px, mid (640) up to 1199 px, desktop (1000) above.
- Shape: radius 0 everywhere. Hairlines 1 unit.
- Motion: typing at 30 ms per character, the `&&` snap is 180 ms cubic-bezier(.2,.9,.2,1).
  The chain is done by 0.75 s and the `cat about` output prints at 1.1 s. The prompt cursor
  blinks until 3.2 s and then holds; the pipeline's yellow job runs the chain once (4.5 s)
  and leaves its `0` lit.
- Decision: the page is still after about 5.3 s. An SVG inside an `<img>` cannot offer a pause
  control, and Chrome does not pass the page's reduced-motion setting into it (measured), so
  looping motion would break WCAG 2.2.2. Every motion is one-shot and under 5 s, and every
  final frame is the designed frame. The in-SVG `prefers-reduced-motion` rule stays for
  browsers that do honour it.

## Composition

```
HERO (1000x560)                         PHONE (400x560)
Saif Ali             Kolkata 22.57N     Saif Ali
saifdev9                                saifdev9
| f | r | o | n | t | - | e | n | d |0  front-end 0
| & | & |   | d | e | v | o | p | s |0  && devops 0
~$ cat about                            ~$ cat about
the bio, every && yellow                bio, 7 lines
~$ _                                    ~$ _

PIPELINE                                PHONE: stages stacked on a vertical rail
write        && release   && ship
=====job=====>============>=====>[0]    (one run, ends on the lit chip)
tools        tools        tools
note         note         note

WORK: header + one linked SVG per row
name + kind (cols 1-4; gitcloner larger as the lead) | what it does, proof, underlined URL (5-8) | ships to + year (9-10)

FOOTER   exit [0]   ...   colophon
         ~$ mail saifdev99@gmail.com      (the whole footer links to mailto)
         logout
<details> `cat .secret`: the nine-character grid, the one thing left in GitHub's own type
```

Every panel is one HTML block with no blank lines and `align="top"` on each `<img>`, so the
whole README renders as one continuous slab; a 1-unit hairline at the top of each panel is
the only seam. `tools/build.mjs` writes README.md too, so every `alt` carries its panel's
full text from the same DATA block.

Pass 1 critic (6.7) changes: bio moved from GitHub sans into the hero as `cat about` output;
seams removed; the four identical row `0` chips replaced by a real per-repo "ships to";
reading text raised to 15 units minimum (about 13 px rendered); row URLs underlined in ink
as the link cue, kept on phone; pipeline chip moved onto the end of its rail; secret moved
above the footer and set in the page's voice.

Pass 2 critic (7.0) changes: contact moved into the footer as the last command; the panels
joined into one slab; intro compressed (bio prints at 1.4 s, was 2.3 s); the role no
longer repeats three times; each repo got a checked proof line (gitcloner's is its last CI
release run, a literal exit 0); all exit codes on one vertical; a 640-unit art size for
the 601 to 1199 px windows where the desktop art shrank text under 10 px.

## Genericness test

A generic model would ship: "Hi there" + typing SVG + stats cards + skill-icon rows + capsule
banner, or a fake terminal window with traffic-light dots. Changed: no third-party widgets,
no window chrome, no icon rows, no stats cards; the terminal is used as a rule system (exit
codes, `&&`, logout), not as a costume.

## Platform limits (decided, not missed)

- No hover states: images inside a README receive no pointer events. Every panel is still a
  real link where it points somewhere.
- No real headings inside panels: their text is in the `alt` attributes, which GitHub keeps.
- Light/dark variants were dropped on purpose: GitHub rewrites `prefers-color-scheme` sources,
  which would break the phone-width sources.

Compaction (owner: "too big"): total height cut from 2,869 to about 1,780 units on desktop by
setting the chain beside the bio, one-line figures, comma-run tool lists, two-column
languages and tighter rows.

Pass 3 critic (7.15) changes: ground switched to GitHub's own dark #0D1117 so dark mode has no
seam; the pipeline's progress is now a track that fills and stays filled (rest frame: every
stage passed, `0` lit); each repo row has its `0` back in the status column, now backed by its
proof line, with "ships to" moved under the name; a plain Markdown line under the slab makes
the email and repo links selectable; phone text raised to 15 units; phone hero drops the
"exit" captions for clearance.
