// Side quests: trials that teach options and advanced settings. Types:
//   quiz  — a chain of situations with choices (wrong answers explain and retry)
//   craft — bind a spell with specific options to the hotbar (checked when you return)
//   hunt  — creatures spawned near the mentor; the killing cast must satisfy requireSpell / requireExtras
//   cast  — like hunt, but it is enough to hit the target once with a qualifying cast
// A hunt may carry quiz steps as well: the creature appears once the questions are answered. Hunts without
// requireSpell / requireExtras / requireOpts / requireBasis count any kill, staff included.
export const SIDE_QUESTS = [
  // ---------------- Postdoc Pim (harbour): integrals, properties, exports
  { id: 'pim_dipole', npc: 'pim', title: 'A dipole for the postdoc', needs: { quest: 'fitting' }, type: 'cast',
    intro: { text: 'I need the dipole moment of water for a paper and my cluster is down. Any correlated spell prints it if you ask: cc properties=true in the additional settings. Craft one and hit the Water Sprite I lured behind the hut.', code: '@cc dcsd begin\n  @set cc properties=true\nend' },
    spawn: [{ enc: 'water', zone: 'harbor', dx: -12, dz: -6 }], requireExtras: [{ group: 'cc', key: 'properties', eq: 'true' }], hitOnly: true,
    hint: 'The cast must carry cc properties=true. Open the workbench with Tab and add it under additional settings.',
    reward: { xp: 70, mana: 10 }, done: { text: 'A dipole, correlated. Properties come from the coupled-cluster density, so they cost a Lambda equation on top of the energy.' },
    lesson: 'cc properties=true computes properties such as the dipole moment from the correlated density.' },
  { id: 'pim_ints', npc: 'pim', title: 'Who owns the integrals', needs: { quest: 'fitting' }, type: 'hunt',
    spawn: [{ enc: 'water', zone: 'harbor', dx: -14, dz: 2 }, { enc: 'water', zone: 'harbor', dx: -9, dz: -13 }], hint: 'Two water sprites drift along the shore; correlate them both, any spell you like, and we are even.',
    intro: { text: 'Three coupled-cluster runs on the same orbitals, and the integrals were generated three times. Wasteful. What do you write between @dfhf and the three @cc lines?' },
    steps: [
      { q: 'Generate the MO integrals once and let all three runs share them:', choices: [
        { t: '<code>@dfints</code> after <code>@dfhf</code>: the integrals persist and are yours', ok: true, why: 'Whoever creates them owns them. A driver that has to generate its own drops them when it finishes.' },
        { t: '<code>@set int df=false</code>', why: 'That switches to exact integrals, it does not make anything persist.' },
        { t: '<code>@print_input</code> three times', why: 'That only echoes the input.' }] },
      { q: 'Later you run @localize and then another @cc dcsd. What must happen?', choices: [
        { t: 'Call <code>@dfints</code> again: the orbitals changed, so the stored MO integrals are stale', ok: true, why: 'MO integrals depend on the orbitals. Nothing refreshes them for you once you own them.' },
        { t: 'Nothing, integrals never change', why: 'AO integrals never change; MO integrals do, with every orbital change.' },
        { t: '<code>@set wf dump=""</code>', why: 'That is about which orbitals a restart uses, not about integrals.' }] }],
    reward: { xp: 60 }, done: { text: 'Own them, refresh them. And if you never call @dfints, each run is self-contained, just slower.' },
    lesson: '@dfints / @moints create persistent MO integrals; after @localize or a new @dfhf you must call them again. Without them each correlated run generates and discards its own.' },
  { id: 'pim_export', npc: 'pim', title: 'A FCIDUMP for the Keeper', needs: { quest: 'dumps' }, type: 'hunt',
    spawn: [{ enc: 'n2dump', zone: 'harbor', dx: 15, dz: -5 }], hint: 'A dinitrogen from the archive haunts the pier, integrals only. It is multireference: DCSD wounds it, CIPHI finishes it.',
    intro: { text: 'The Keeper wants the water integrals as a FCIDUMP for his archive. Which lines write one?' },
    steps: [{ q: 'Write the integrals of the current orbitals to a file:', choices: [
      { t: '<code>@hf</code>, <code>@moints</code>, <code>@write_ints "H2O.FCIDUMP"</code>', ok: true, why: '@write_ints needs persistent MO integrals, so @moints (or @dfints) first. The file carries NELEC and MS2 with the charge applied.' },
      { t: '<code>@dfhf</code> alone: it writes wf.h5', why: 'wf.h5 is the orbital dump, not the integrals.' },
      { t: '<code>@cc dcsd</code>, it writes everything', why: 'The driver discards its own integrals when it finishes.' }] }],
    reward: { xp: 60 }, done: { text: 'Delivered. Reading it back later needs no charge option: the dump already knows.', code: '@hf\n@moints\n@write_ints "H2O.FCIDUMP"' },
    lesson: 'To export integrals: generate persistent MO integrals (@moints or @dfints), then @write_ints "FILE".' },
  // ---------------- Brother Levelshift (forest): convergence of the amplitude equations
  { id: 'levi_shifts', npc: 'levi', title: 'The stubborn one', needs: { quest: 'ladder' }, type: 'hunt',
    intro: { text: 'There is a water sprite in this wood whose amplitudes overshoot every iteration. No level shift, no convergence. Craft a coupled-cluster spell with a raised doubles shift and put it down.', code: '@cc dcsd begin\n  @set cc maxit=100 shiftp=0.5\nend' },
    spawn: [{ enc: 'stubwater', zone: 'forest', dx: 9, dz: -2 }], requireSpell: ['ccsd', 'dcsd', 'ccsdt', 'svd'], requireExtras: [{ group: 'cc', key: 'shiftp', min: 0.4 }],
    hint: 'The killing spell needs cc shiftp of at least 0.4 in its additional settings.',
    reward: { xp: 90, hp: 10 }, done: { text: 'Damped, converged, done. Shifts slow the update but never change the converged answer.' },
    lesson: 'cc shiftp (doubles, default 0.2) and cc shifts (singles, default 0.15) damp the amplitude update; raise them when the residual grows.' },
  { id: 'levi_conven', npc: 'levi', title: 'Converged in energy, not in residual', needs: { quest: 'ladder' }, type: 'hunt',
    spawn: [{ enc: 'co', zone: 'forest', dx: -11, dz: -3 }], hint: 'A carbon monoxide waits behind the chapel; it is as demanding as N₂, so DCSD or CCSD(T), not MP2.',
    intro: { text: 'A student says her energy stopped changing at iteration 8 but the run went on to iteration 30. She wants to stop earlier, safely.' },
    steps: [{ q: 'Which options define when the CC iterations stop?', choices: [
      { t: '<code>cc thr</code> for the residual, and the energy threshold is <code>sqrt(thr) × conven</code>', ok: true, why: 'Both must be met. Loosening thr alone also loosens the energy criterion through the square root.' },
      { t: '<code>scf thr</code>', why: 'That is the SCF. The amplitude equations have their own block.' },
      { t: '<code>print time=0</code>', why: 'Silence is not convergence.' }] }],
    reward: { xp: 50 }, done: { text: 'Residual and energy, both. If you need only relative energies, a looser thr is honest as long as you say so.' },
    lesson: 'CC stops when the residual is below cc thr and the energy change below sqrt(thr) × cc conven.' },
  { id: 'levi_crop', npc: 'levi', title: 'DIIS on a diet', needs: { quest: 'scf' }, type: 'hunt',
    spawn: [{ enc: 'c2h4', zone: 'forest', dx: 4, dz: 12 }], hint: 'An ethylene grazes at the forest edge, well behaved: any correlated spell converges on it.',
    intro: { text: 'On the big molecule the DIIS vectors alone do not fit in memory, and convergence slows to a crawl without them.' },
    steps: [{ q: 'Keep DIIS acceleration with a small memory footprint:', choices: [
      { t: '<code>@set diis crop=true maxcrop=3</code>: CROP-DIIS needs only three vectors', ok: true, why: 'CROP-DIIS (JCTC 11, 1518) converges with a subspace of about three vectors.' },
      { t: '<code>@set diis maxdiis=1</code>', why: 'One vector is no extrapolation at all.' },
      { t: '<code>@set scf maxit=500</code>', why: 'More iterations without acceleration is just slower.' }] }],
    reward: { xp: 50 }, done: { text: 'Three vectors, same speed. Memory is a resource like any other.' },
    lesson: 'diis crop=true with diis maxcrop=3 gives DIIS acceleration with a tiny subspace.' },
  // ---------------- Farmer DIIS: the reference block
  { id: 'diis_twitchy', npc: 'diis', title: 'The twitchy sprite', needs: { quest: 'scf' }, type: 'hunt',
    intro: { text: 'A water sprite by the fence has an SCF that will not settle, so no correlation spell can even start on it. Whatever you cast, give its reference more DIIS vectors.', code: '@dfhf begin\n  @set diis maxdiis=10\nend\n@cc dcsd' },
    spawn: [{ enc: 'twitchy', zone: 'fields', dx: -8, dz: 8 }], requireExtras: [{ group: 'diis', key: 'maxdiis', min: 10 }],
    hint: 'Add diis maxdiis=10 to the spell; the workbench puts diis and scf settings into the reference block.',
    reward: { xp: 80, hp: 10 }, done: { text: 'Settled. Reference options ride along with every spell you cast; the correlation part inherits the converged orbitals.' },
    lesson: 'scf and diis settings belong to the reference macro. In the workbench they are written into @dfhf begin … end.' },
  // ---------------- Radical Rhea: spins, ghosts, active spaces
  { id: 'rhea_quartet', npc: 'rhea', title: 'Three unpaired', needs: { quest: 'spins' }, type: 'hunt',
    intro: { text: 'A nitrogen atom wanders the ridge: ⁴S, three unpaired electrons. Your triplet setting will build the wrong reference. Craft the right spin and cast an unrestricted spell.', code: '@set wf ms2=3\n@dfuhf\n@cc udcsd' },
    spawn: [{ enc: 'natom', zone: 'ridge', dx: -9, dz: -6 }], requireSpell: ['udcsd', 'uccsdt'],
    hint: 'Craft UDCSD or UCCSD(T) with ms2=3 (twice the spin projection of a quartet).',
    reward: { xp: 100, hp: 10 }, done: { text: 'ms2 counts unpaired electrons: 1 doublet, 2 triplet, 3 quartet.' },
    lesson: 'wf ms2 is twice the spin projection: doublet 1, triplet 2, quartet 3.' },
  { id: 'rhea_ghost2', npc: 'rhea', title: 'The second ghost', needs: { quest: 'spins' }, type: 'hunt',
    intro: { text: 'Formaldehyde has more than one excited state, and the second one haunts the pillars. EOM solves as many states as you ask for.', code: '@cc eom-dcsd begin\n  @set eom nstates=2\nend' },
    spawn: [{ enc: 'h2co2', zone: 'ridge', dx: 8, dz: -8 }], requireSpell: ['eom'],
    hint: 'Craft EOM-DCSD with nstates of 2 or more.', reward: { xp: 90 }, done: { text: 'Two states, two ghosts. Each extra state costs another Davidson solve.' },
    lesson: 'eom nstates sets how many excited states EOM computes; the k-th state needs nstates ≥ k.' },
  { id: 'rhea_active', npc: 'rhea', title: 'Choosing an active space', needs: { quest: 'spins' }, type: 'hunt',
    intro: { text: 'Before the dragon: a smaller stretched dinitrogen, to practise the active space. Which orbitals matter when a triple bond breaks?' },
    steps: [{ q: 'Pick the active space for N₂ with the bond stretched:', choices: [
      { t: '<code>(6,6)</code>: the six bonding electrons in the 2p bonding and antibonding orbitals', ok: true, why: 'σ, π, π and their antibonding partners: the degeneracy that breaks the single reference lives there.' },
      { t: '<code>(2,2)</code>: just the σ bond', why: 'The π bonds break too; two electrons cannot describe a triple bond dissociating.' },
      { t: '<code>(14,28)</code>: everything', why: 'That is FCI in a cc-pVDZ basis dressed up as MCSCF; it does not fit.' }] }],
    spawn: [{ enc: 'n2str', zone: 'ridge', dx: 0, dz: -10 }], requireSpell: ['mcscf'], requireOpts: { active: '(6,6)' }, hitOnly: true,
    hint: 'Craft DF-MCSCF with active="(6,6)" and hit the stretched dinitrogen with it; finish it with whatever you like.',
    reward: { xp: 120, hp: 15 }, done: { text: 'Six in six. Active spaces are chemistry first, arithmetic second.', code: '@dfmcscf begin\n  @set wf active="(6,6)"\nend' },
    lesson: 'wf active="(electrons, orbitals)" defines the MCSCF active space; choose it from the bonds that break.' },
  // ---------------- Keeper of the Dumps: cores, selected CI restarts
  { id: 'keeper_core', npc: 'keeper', title: 'Correlating the core', needs: { quest: 'dumps' }, type: 'hunt',
    intro: { text: 'A lithium hydride in the cave keeps its strength in the 1s core. Every spell freezes that core by default. Unfreeze it.', code: '@cc dcsd begin\n  @set wf core=:none\nend' },
    spawn: [{ enc: 'corelih', zone: 'caves', dx: -9, dz: -4 }], requireExtras: [{ group: 'wf', key: 'core', eq: ':none' }],
    hint: 'The killing cast needs wf core=:none in its settings.', reward: { xp: 80, hp: 10 }, done: { text: 'Core correlation is small and expensive, which is why :auto freezes it. Sometimes it is the whole story.' },
    lesson: 'wf core = :auto | :none | :small | :large controls the frozen core; wf freeze_nocc freezes an explicit count.' },
  { id: 'keeper_pt2', npc: 'keeper', title: 'Only the correction', needs: { quest: 'dumps' }, type: 'hunt',
    spawn: [{ enc: 'c2', zone: 'caves', dx: 10, dz: 6 }], requireSpell: ['ciphi'], hint: 'A dicarbon lurks deeper in the cave. Several configurations of equal weight: only CIPHI finishes it.',
    intro: { text: 'A CIPHI space is stored in my_ciphi.h5 and converged. I want the PT2 correction recomputed with a different threshold, and nothing else.' },
    steps: [{ q: 'Recompute only the PT2 correction on the stored determinants:', choices: [
      { t: '<code>@ciphi begin @set ciphi pt2_only=true; @set wf start="my_ciphi.h5" end</code>', ok: true, why: 'pt2_only skips the variational iterations and uses the stored space.' },
      { t: '<code>@ciphi begin @set ciphi epsilon=1e-2 end</code>', why: 'That reselects a smaller space from scratch.' },
      { t: '<code>@fci</code>', why: 'Full CI is exactly what selected CI is avoiding.' }] }],
    reward: { xp: 60 }, done: { text: 'Store with wf store, restart with wf start, correct with pt2_only. The Keeper approves.' },
    lesson: 'CIPHI restarts: wf store / wf start keep the determinant space; ciphi pt2_only=true recomputes only the correction.' },
  // ---------------- Archivist Ada (caves): restarts and charges
  { id: 'ada_restart', npc: 'ada', title: 'Store before you leave', needs: { quest: 'ladder' }, type: 'hunt',
    intro: { text: 'Every scan point you converge and throw away is an hour lost. A water from one point of my scan reforms outside every time its amplitudes are discarded. Craft a coupled-cluster spell that stores them, bind it, and finish the scan.', code: '@cc dcsd begin\n  @set wf store="cc.h5"\nend' },
    spawn: [{ enc: 'scanwater', zone: 'caves', dx: 9, dz: -2 }], requireSpell: ['ccsd', 'dcsd', 'ccsdt', 'svd'], requireExtras: [{ group: 'wf', key: 'store' }],
    hint: 'Add wf store="cc.h5" to a coupled-cluster spell, bind it to a slot, and cast that slot on the scan-point water outside.',
    reward: { xp: 70 }, done: { text: 'And the next point starts with wf start="cc.h5": the stored amplitudes are projected onto the new orbitals. Set wf dump="" only when you want the stored orbitals themselves, as for an orbital-optimised restart.' },
    lesson: 'wf store writes orbitals and amplitudes; wf start restarts from them (projected onto the current dump orbitals); dump="" reuses the stored orbitals.' },
  { id: 'ada_charge', npc: 'ada', title: 'The dump knows', needs: { quest: 'dumps' }, type: 'hunt',
    spawn: [{ enc: 'hydroxide', zone: 'caves', dx: -10, dz: 4 }], hint: 'A hydroxide anion drifts near the cave mouth. Its extra electron is diffuse: set the basis to "vdz; O=avdz" or the spell misses.',
    intro: { text: 'An archived FCIDUMP holds a neutral molecule. A visitor wants its anion, a doublet, from the same file.' },
    steps: [{ q: 'What does the visitor add?', choices: [
      { t: '<code>@cc udcsd begin @set wf charge=-1 ms2=1 end</code>', ok: true, why: 'charge is relative to the dump, ms2 is twice the spin, and an odd electron needs the unrestricted method.' },
      { t: '<code>@set wf nelec=1</code>', why: 'nelec is the total electron count.' },
      { t: '<code>@set wf charge=1</code>', why: 'Positive charge removes an electron: that is the cation.' }] }],
    reward: { xp: 60 }, done: { text: 'Relative charges, absolute spins. Files written by @write_ints already carry the charge, so reading those needs nothing.' },
    lesson: 'wf charge is relative to the dump or neutral molecule; a FCIDUMP written by @write_ints carries its charge and ms2.' },
  // ---------------- Captain Scan (harbour pier): machines and geometries
  { id: 'scan_mem', npc: 'scan', title: 'A shared node', needs: { quest: 'prologue' }, type: 'hunt',
    spawn: [{ enc: 'hatom', zone: 'harbor', dx: 14, dz: 8 }, { enc: 'hatom', zone: 'harbor', dx: 17, dz: 1 }], hint: 'Two stray hydrogens got off my boat. The staff or the mean field will do; there is nothing to correlate.',
    intro: { text: 'My run was killed on the shared node: the automatic memory budget grabbed the whole machine.' },
    steps: [{ q: 'Make the run fit next to other jobs:', choices: [
      { t: '<code>@set mem fraction=0.4</code>, or an explicit <code>mem budget</code> in GB', ok: true, why: 'The budget for large scratch arrays is estimated from free memory; fraction scales it, budget fixes it.' },
      { t: '<code>@set print memory=0</code>', why: 'That hides the numbers; the allocation is unchanged.' },
      { t: '<code>@set mem budget=-1</code>', why: 'That is the automatic estimate you already had.' }] },
      { q: 'On the AMD node the same run crawls. First thing to try?', choices: [
      { t: 'Run <code>ElemCo.amdmkl()</code> once in a separate Julia session, then rerun', ok: true, why: 'MKL is slow on Zen unless it is forced to AVX2; the helper patches two libraries once.' },
      { t: '<code>@set int screen=0</code>', why: 'That disables prescreening and makes it slower.' },
      { t: '<code>@set print time=0</code>', why: 'Timings off does not speed anything up.' }] }],
    reward: { xp: 60, mana: 10 }, done: { text: 'Budget, fraction, amdmkl. Machines have options too.' },
    lesson: 'mem budget (GB) and mem fraction control scratch memory; ElemCo.amdmkl() fixes MKL on AMD Zen once per machine.' },
  { id: 'scan_geometry', npc: 'scan', title: 'Coordinates from jlmol', needs: { quest: 'fitting' }, type: 'hunt',
    spawn: [{ enc: 'water', zone: 'harbor', dx: 12, dz: 13 }], hint: 'A water sprite came ashore with the cargo. Any correlated spell converges on it.',
    intro: { text: 'jlmol exported my molecule to caffeine.xyz. I do not want to paste 24 lines into the input.' },
    steps: [{ q: 'Use the file directly:', choices: [
      { t: '<code>geometry = "caffeine.xyz"</code>', ok: true, why: 'A geometry string that is a single existing file name is read as an xyz file.' },
      { t: '<code>geometry = load("caffeine.xyz")</code>', why: 'There is no load(); the geometry variable does the work.' },
      { t: '<code>@loadfile caffeine.xyz</code>', why: '@loadfile is for ElemCo\'s own files, not geometries.' }] },
      { q: 'The file is in bohr, not ångström:', choices: [
      { t: 'Put <code>bohr</code> on the first line of the geometry, the way the ElemCo examples do', ok: true, why: 'The first line of a geometry can state the unit: bohr or angstrom.' },
      { t: 'Multiply every number by 0.529 by hand', why: 'Possible, tedious, and a source of errors.' },
      { t: '<code>@set wf unit=:bohr</code>', why: 'No such option.' }] }],
    reward: { xp: 50 }, done: { text: 'Files for big molecules, inline for small ones, and always say the unit.' },
    lesson: 'geometry = "file.xyz" reads the file; the first line of an inline geometry may be "bohr" or "angstrom".' },
  // ---------------- Basia: per-atom bases
  { id: 'basia_peratom', npc: 'basia', title: 'Diffuse where it counts', needs: { quest: 'fitting' }, type: 'hunt',
    intro: { text: 'A hydroxide anion is loose behind the stalls, and every spell in a compact basis passes through it. An anion needs diffuse functions on the oxygen, and only there. Craft any correlated spell whose basis puts avdz on O and keeps vdz elsewhere, bind it, and cast it.', code: 'basis = "vdz; O=avdz"' },
    spawn: [{ enc: 'hydroxide', zone: 'bazaar', dx: 10, dz: 6 }], requireBasis: /O\s*=\s*avdz/i, hint: 'In the workbench, set the basis field to "vdz; O=avdz", bind the spell, and cast that slot on the hydroxide.',
    reward: { xp: 60, mana: 10 }, done: { text: 'Element by element, or centre by centre with H1=…, H2=…. The fitting sets follow automatically.' },
    lesson: 'Per-element bases: "vdz; O=avdz"; per-centre: "vdz; H1=vtz". Even-tempered functions: "vdz+2diffuse".' },
  // ---------------- Harbormaster Fock: redundant bases
  { id: 'fock_redthr', npc: 'fock', title: 'Linear dependencies', needs: { quest: 'prologue' }, type: 'hunt',
    spawn: [{ enc: 'hatom', zone: 'harbor', dx: -12, dz: 12 }, { enc: 'hatom', zone: 'harbor', dx: -6, dz: 15 }], hint: 'Two lone hydrogens loiter by the boats. The mean field is exact on them; the staff works too.',
    intro: { text: 'With a huge diffuse basis on a small molecule the SCF complains about linear dependencies and stalls.' },
    steps: [{ q: 'Make the SCF robust against a redundant basis:', choices: [
      { t: 'Raise <code>scf redthr</code> (e.g. 1e-6) so redundant AO combinations are removed by canonical orthogonalisation', ok: true, why: 'Eigenvectors of the overlap matrix below redthr are discarded; the default is 1e-8.' },
      { t: 'Loosen <code>scf thr</code>', why: 'That changes when you stop, not what you diagonalise.' },
      { t: '<code>@set int screen=0</code>', why: 'Prescreening is about integral cost.' }] }],
    reward: { xp: 50 }, done: { text: 'Redundancies removed, orbitals reduced, and every correlated method downstream drops the same functions.' },
    lesson: 'scf redthr discards near-redundant AO combinations (overlap eigenvalues below it); raise it for diffuse or large bases.' },
  // ---------------- The Alpaca: SVD settings
  { id: 'alpaca_usedf', npc: 'alpaca', title: 'No fitting basis, no problem', needs: { quest: 'golems' }, type: 'hunt',
    intro: { text: 'A golem below the tower is made of an element without an mpfit basis, so density fitting has nothing to fit with. SVD-DC-CCSDT can Cholesky-decompose the exact integrals instead. Craft it, bind it, cast it.', code: '@cc svd-dc-ccsdt begin\n  @set cc usedf=false\nend' },
    spawn: [{ enc: 'fitless', zone: 'tower', dx: -13, dz: 14 }], requireSpell: ['svd'], requireExtras: [{ group: 'cc', key: 'usedf', eq: 'false' }],
    hint: 'Craft SVD-DC-CCSDT with cc usedf=false in the additional settings, bind it, and cast that slot on the unfitted golem.',
    reward: { xp: 80, mana: 10 }, done: { text: 'Low rank either way. And cc ampsvdtol is the accuracy dial: 1e-5 by default, tighten it when the triples matter.' },
    lesson: 'cc usedf=false lets SVD-DC-CCSDT Cholesky-decompose exact integrals instead of density fitting; cc ampsvdtol sets the amplitude SVD threshold.' },
];
export const SIDE_NPCS = {
  pim:  { name: 'Postdoc Pim', color: '#2f8f9b' }, levi: { name: 'Brother Levelshift', color: '#6b4a9b' }, ada: { name: 'Archivist Ada', color: '#b5751a' }, scan: { name: 'Captain Scan', color: '#3c5aa8' },
};
