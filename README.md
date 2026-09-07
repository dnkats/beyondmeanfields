# Beyond Mean Fields

Play it at **https://elem.co.il/beyondmeanfields/** (built and published from `main` by the GitHub Pages workflow).

A third-person 3D adventure about electron correlation, set on Convergence Island, built around [ElemCo.jl](https://github.com/fkfest/ElemCo.jl) and
[jlmol](https://github.com/fkfest/jlmol). Correlation is the enemy. You start with the mean field (`@hf`), learn density fitting
(`@dfhf`) and the fitting bases it needs, then climb the ladder: `@dfmp2`, `@cc ccsd`, `@cc dcsd`, `@cc ccsd(t)`,
`@cc svd-dc-ccsdt`, `@cc udcsd` and `@cc uccsd(t)` for open shells, `@cc eom-dcsd` for excited states, `@dfmcscf` with an active
space, `@fci`, `@ciphi`, and `@region` for molecules too big to correlate whole. Methods are spells with a mana cost that follows
their scaling and a domain where they work or backfire. Creatures are real molecules (H, H₂, water, N₂ bound and stretched,
O₂ triplet, formaldehyde's n→π* ghost, benzene, naphthalene, caffeine from PubChem via jlmol, and a dragon made of static
correlation) whose card tells you what they fear. Spells are crafted at a jlmol-style workbench that writes the ElemCo input
live; the inputs that converge are collected in a grimoire.

Beyond the main line, eleven mentors offer **trials** (side quests) that teach options and advanced settings. Every trial
ends in a fight: a creature appears near the mentor once you have accepted (and, for some, answered the mentor's
questions), and the killing cast must carry what the trial is about, such as `cc shiftp`, `wf store`, `wf core=:none`,
`cc usedf=false`, a per-element basis like `vdz; O=avdz`, a UHF spin setting or an active space. Trials pay XP, extra HP or
mana, and write a lesson into the grimoire.

The island is also populated by a **wild population** of molecules drawn from a database in `src/spells.js` (`ENCOUNTERS`
and `WILD`): helium and dihydrogen at the harbour, ammonia, methane and HF in the fields, CO, acetylene, ethylene and F₂ in
the forest, BeH₂ and dicarbon in the caves, OH, NO, triplet CH₂ and CN on the ridge, anthracene, glycine and ozone below
the tower. Each zone's roamers appear once the main quest for that zone is done, respawn a minute or two after they are
killed, give reduced XP, and obey the same rules as everything else: size and kind of correlation decide which spells they
fear and which they ignore.

The **workbench** (Tab) edits one hotbar slot at a time: pick a spell, choose which bound variant to edit (or start a new
draft), and changes apply to that slot as you type. Drafts you have not bound yet are kept until you bind them. Binding a
spell that satisfies an active trial says so at once.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

The decimated models, textures, HDRI and characters (about 170 MB) are committed under `public/assets`, so a clone runs as is.
To regenerate them from the original sources: `npm run fetch` (Poly Haven scans and the Quaternius nature kit, about 800 MB, CC0 / freely
licensed), `npm run optimize` (decimation of the scans to game budgets plus LOD variants) and `node scripts/convert-kit.mjs` (the kit's
trees, bushes and rocks to `q_*.glb`); the raw sources are git-ignored. `npm run build` produces a static site in
`dist/`; the workflow in `.github/workflows/pages.yml` does that with `BASE_PATH=/beyondmeanfields/` on every push to `main`
and publishes it to GitHub Pages. `npm run shots harbor forest` renders development screenshots.

## Controls

| Key | Action |
| --- | --- |
| left-click ground | walk there (double-click to run) |
| left-click a person, creature, pickup, the workbench or the tower door | walk over and use it (talk, target and swing, pick up, open the workbench, unlock) |
| right-click a creature | cast the selected spell at it |
| click a hotbar slot | select that spell and cast it at the current target |
| W A S D / arrows | move (Shift to run, Space to jump) |
| mouse drag / wheel | look around / zoom |
| C (or the menu) | mouse steering: the pointer is locked, moving the mouse turns the camera and you, W goes where you look, the crosshair picks what you click; Esc frees the pointer |
| Space | jump: rocks and boulders are solid, low ones can be walked up, steep ones must be jumped onto or climbed around |
| water and pier | you can wade in up to the waist (slowly); the harbour pier is walkable by its ramp; the camera stays out of houses and rocks |
| E | talk, pick up, unlock, use the jlmol workbench |
| F or click | Hartree–Fock staff (exact on one electron, useless on correlation) |
| 1–9 | cast the spell in that hotbar slot at the nearest molecule |
| Tab | spellbook and workbench: set options (ms2, nstates, active, epsilon, region centres), bind to slots |
| J / Esc | quest log, grimoire and menu (graphics preset cycles high → medium → low) |

Progress is saved in the browser. The graphics preset is auto-detected (integrated GPUs get `medium`); append `?q=low`, `?q=medium` or `?q=high` to force one. Vegetation is chunked with frustum culling and distance LOD, and the render resolution adapts to hold the frame rate, so integrated laptop GPUs are the target for `medium`.

Per frame the `medium` preset draws roughly 0.8–2 M triangles and 300–700 draw calls (main pass, a 40 m shadow box, bloom, a colour grade, SMAA); `high` adds half-resolution ambient occlusion and a higher render resolution, `low` drops post-processing. Vegetation comes from the Quaternius Stylized Nature MegaKit (CC0): trees of 1.6–10 k triangles with solid leaf geometry, drawn as meshes up to `lodFar` and as billboard impostors beyond it. The impostors are baked at load time (`src/impostor.js`): every tree type is rendered from eight azimuths into an atlas, and far cells draw one instanced quad per tree that picks the view facing the camera. Undergrowth never casts shadows, and mentors beyond 90 m are not drawn.

## Screenshots for development

`node scripts/shots.mjs harbor bazaar forest` starts Vite, opens headless Chromium (SwiftShader) and captures the listed views
into `shots/`. Software rendering makes the first frame of each view slow because every shader program is compiled on the CPU;
real GPUs do this in milliseconds.

## Assets

See `public/assets/LICENSES.md`. In short: Poly Haven models, textures and HDRI (CC0); Soldier, Michelle, Xbot and the
expressive robot (CC0, Tomás Laulhé) from the three.js examples; the Ready Player Me avatar and animation library; two Mixamo
characters mirrored from public tutorial repositories. Nothing in `public/assets` is committed to git; the fetch script
recreates it.

## Layout

- `src/main.js` bootstrap: quality, sky, terrain, water, vegetation scatter, buildings, props, characters, post-processing
- `src/world.js` environment: terrain function and splat shader, water shader, instancing helpers, procedural cottages and tower, post chain
- `src/assets.js` loaders, PBR texture sets, clip retargeting between Mixamo and Ready Player Me rigs
- `src/characters.js` animated characters, player controller, chase camera
- `src/entities.js` enemies, pickups, bolts, particles, sound
- `src/quests.js` dialogue graph and quest definitions (the teaching content)
- `src/game.js` input, HUD, dialogue UI, quest hooks, save/load, main loop
