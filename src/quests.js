// The spell story: from the mean field to the correlation ladder. Every macro and option follows the ElemCo.jl v0.16 docs.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function hl(code) {
  return esc(code).split('\n').map((line) => {
    if (/^(ERROR|WARNING)/.test(line)) return `<span class="er">${line}</span>`;
    // strings first (they may contain # or @), then macros, then a trailing comment outside any string
    const parts = line.split(/("[^"]*")/);
    return parts.map((seg, i) => i % 2 ? `<span class="s">${seg}</span>` : seg.replace(/(@[a-z_]+)/g, '<span class="k">$1</span>').replace(/(#.*)$/, '<span class="cm">$1</span>')).join('');
  }).join('\n');
}
export const WATER = `geometry = "angstrom\n  O   0.000000   0.000000  -0.065862\n  H   0.000000  -0.760413   0.522729\n  H   0.000000   0.760413   0.522729"`;
export const FULL_INPUT = `using ElemCo\n@print_input\n${WATER}\nbasis = "vdz"\n@dfhf\n@cc dcsd`;

export function createQuests(ctx) {
  // ctx: spawnPack, spawnPickup, spawnEncounter, unlock, player, toast, saveGame, Sfx, zoneById, maxHP, startBoss, resumeBoss, winGame, showDialog, bossQuizNode, openForge
  const Q = { prologue: 0, fitting: 0, scf: 0, ladder: 0, dumps: 0, spins: 0, golems: 0, dragon: 0 };
  const QUESTS = [
    { id: 'prologue', title: 'The mean field', npc: 'fock', zone: 'harbor', needs: [],
      obj: ['Talk to Harbormaster Fock at the pier.', 'Talk to Harbormaster Fock at the pier.', 'Defeat the Lone Hydrogen at the harbour with Hartree–Fock: <b>F</b> swings the staff.', 'Report to Fock.', 'Done: HF, and why it is slow.'] },
    { id: 'fitting', title: 'The fitting basis', npc: 'basia', zone: 'bazaar', needs: ['prologue'],
      obj: ['Find Basia the Merchant at the bazaar.', 'Find Basia the Merchant at the bazaar.', 'Collect the fitting-basis pages around the bazaar: <b>{bfn}</b> missing.', 'Bring the pages to Basia and craft your first spells at the jlmol workbench.', 'Done: DF-HF, DF-MP2, and crafting inputs with jlmol.'] },
    { id: 'scf', title: 'Oscillating fields', npc: 'diis', zone: 'fields', needs: ['prologue'],
      obj: ['Find Farmer DIIS in the Hartree–Fock Fields.', 'Find Farmer DIIS in the Hartree–Fock Fields.', 'Clear the fields: <b>{osc1}</b> SCF Oscillators left.', 'Bring the SCF log back to Farmer DIIS.', 'Done: SCF convergence and faster mana.'] },
    { id: 'ladder', title: 'The correlation ladder', npc: 'cluster', zone: 'forest', needs: ['fitting'],
      obj: ['Find Dr. Cluster in the Correlation Forest.', 'Find Dr. Cluster in the Correlation Forest.', 'Defeat the Water Sprite and the Bound Dinitrogen in the forest: <b>{ladder}</b> left.', 'Report to Dr. Cluster.', 'Done: CCSD, DCSD, CCSD(T), and where they break.'] },
    { id: 'dumps', title: 'Exact answers', npc: 'keeper', zone: 'caves', needs: ['ladder'],
      obj: ['Find the Keeper of the Dumps at the cave mouth.', 'Find the Keeper of the Dumps at the cave mouth.', 'Defeat the creatures of the caves: <b>{dumps}</b> left.', 'Report to the Keeper.', 'Done: FCI, CIPHI, FCIDUMPs.'] },
    { id: 'spins', title: 'Open shells and ghosts', npc: 'rhea', zone: 'ridge', needs: ['ladder'],
      obj: ['Climb to Radical Rhea on the ridge.', 'Climb to Radical Rhea on the ridge.', 'Defeat the Triplet Dioxygen and the Formaldehyde Ghost: <b>{spins}</b> left.', 'Talk to Rhea.', 'Done: UDCSD, UCCSD(T), EOM-DCSD, MCSCF.'] },
    { id: 'golems', title: 'The big ones', npc: 'alpaca', zone: 'tower', needs: ['dumps', 'spins'],
      obj: ['Find the Alpaca below the Tower of (T).', 'Find the Alpaca below the Tower of (T).', 'Defeat the golems on the tower slope: <b>{golems}</b> left.', 'Report to the Alpaca.', 'Done: SVD-DC-CCSDT and @region.'] },
    { id: 'dragon', title: 'The dragon', npc: null, zone: 'tower', needs: ['golems'],
      obj: ['Unlock the Tower of (T).', 'Defeat the Dragon of Static Correlation.', 'Done: the island converged.'] },
  ];
  const questAvailable = (q) => q.needs.every((n) => Q[n] >= QUESTS.find((x) => x.id === n).obj.length - 1);
  const questDone = (q) => Q[q.id] >= q.obj.length - 1;
  const WHO = { fock: ['Harbormaster Fock', '#2f3f7a'], diis: ['Farmer DIIS', '#389826'], basia: ['Basia the Merchant', '#e9a23b'], cluster: ['Dr. Cluster', '#9558b2'], keeper: ['Keeper of the Dumps', '#8f97ad'], rhea: ['Radical Rhea', '#cb3c33'], alpaca: ['The Alpaca', '#9558b2'], boss: ['Dragon of Static Correlation', '#2a2d3a'], sprite: ['The island', '#4063d8'] };
  const zone = (id) => ctx.zoneById(id);
  const D = {
    // ---------------- prologue: Hartree–Fock
    fock0: { who: 'fock', text: 'Welcome to Convergence Island. Everything here is a fight against correlation, and every fight starts from the mean field. Your staff casts Hartree–Fock: press F. Go show the Lone Hydrogen by the water what one electron is worth.',
      code: 'using ElemCo\n@print_input\ngeometry = "angstrom\n  H  0.0  0.0  0.0"\nbasis = "vdz"\n@hf', run: () => { Q.prologue = 2; ctx.spawnEncounter('hatom', 'harbor', 9, 9, 'pro'); } },
    fock1: { who: 'fock', text: 'It is still out there by the water. One electron, no partner: Hartree–Fock is exact for it.' },
    fock2: { who: 'fock', text: 'Exact, for once. Now the bad news: exact integrals make Hartree–Fock scale as N⁴. On the water molecule it crawls, on benzene it stalls. Density fitting brings it to N³.', code: '@hf      # exact AO integrals, N⁴\n@dfhf    # density-fitted, N³, needs a jkfit basis', next: 'fock3' },
    fock3: { who: 'fock', text: 'But @dfhf refuses to run without a fitting basis, and the island has none left. Basia at the bazaar trades in them. Learn the fitted spell from her, then come back if the SCF ever refuses to settle.', run: () => { ctx.unlock(['dfhf']); completeQuest('prologue', 40); } },
    fockdone: { who: 'fock', text: 'Mean field first, always. If your reference is wrong, every spell built on it is wrong.' },
    // ---------------- fitting basis and the jlmol workbench
    basia0: { who: 'basia', text: 'Fitting bases, fresh from the library! But the wind took my pages: jkfit sheets for the Fock build, mpfit sheets for the correlation. Bring back the ones scattered around the square.',
      run: () => { Q.fitting = 2; const bz = zone('bazaar'); [[-8, 6], [7, -1], [1, 10], [-4, -7]].forEach(([dx, dz]) => ctx.spawnPickup('basisfn', bz.x + dx, bz.z + dz, 'bfn')); } },
    basia1: { who: 'basia', text: 'Still missing pages. They glow blue.' },
    basia2: { who: 'basia', text: 'All of them. Here is what a customer once typed, and what ElemCo told him:', code: 'basis = Dict("ao"=>"cc-pVDZ", "jkfit"=>"cc-pvdz-jk")\nERROR: Basis set cc-pvdz-jk not found! Did you mean: cc-pvdz-jkfit?', next: 'basia3' },
    basia3: { who: 'basia', text: 'What is the simplest correct input for a fitted cc-pVDZ calculation?',
      choices: [{ t: '<code>basis = "vdz"</code>', next: 'basia4', ok: true }, { t: '<code>basis = Dict("ao"=>"cc-pVDZ", "jkfit"=>"cc-pvdz-jk", "mpfit"=>"cc-pvdz-mpfit")</code>', next: 'basiax1' }, { t: '<code>@set int use_fallback_basis=true</code>', next: 'basiax2' }] },
    basiax1: { who: 'basia', text: 'Same typo with a third key. The fitting set is cc-pvdz-jkfit, as the error suggested.', next: 'basia3' },
    basiax2: { who: 'basia', text: 'That option only covers an element missing from a basis file, not a misspelled name.', next: 'basia3' },
    basia4: { who: 'basia', text: 'A plain string is enough: vdz is short for cc-pVDZ and the jkfit and mpfit sets are chosen for you. The Dict form is for when you want to pick them yourself. Now the pages are yours.', run: () => { ctx.giveItem('jkfit'); ctx.giveItem('mpfit'); }, next: 'basia5' },
    basia5: { who: 'basia', text: 'One more thing. That table with the glassware is a jlmol workbench. It is how spells are crafted here: pick a reference, a method, set the options, and the Julia input writes itself. Bind the result to a slot and it is yours to cast. Craft DF-HF and DF-MP2 now; Dr. Cluster in the forest teaches the real correlation spells.',
      code: 'using ElemCo\n@print_input\n' + WATER + '\nbasis = Dict("ao"=>"cc-pVDZ", "jkfit"=>"cc-pvdz-jkfit", "mpfit"=>"cc-pvdz-mpfit")\n@dfhf\n@dfmp2', run: () => { ctx.unlock(['dfhf', 'dfmp2']); completeQuest('fitting', 60); ctx.openForge && setTimeout(() => ctx.openForge(), 300); } },
    basiadone: { who: 'basia', text: 'Strings for the common case, Dict for control, jlmol when you would rather click than type.' },
    // ---------------- SCF side quest
    diis0: { who: 'diis', text: 'My Hartree–Fock will not converge, and the fields are crawling with SCF Oscillators. Put four of them down, then we will read the log together.', run: () => { Q.scf = 2; ctx.spawnPack('osc', 'fields', 4, 'osc1'); } },
    diis1: { who: 'diis', text: 'Still oscillators out there. The staff works on them: F.' },
    diis2: { who: 'diis', text: 'Here is my log. The energy flips between two values for fifty iterations and gives up.', code: 'Iter     Energy          DE          Res\n  48  -76.02531012   1.19e-03   4.5e-02\n  49  -76.02650411  -1.19e-03   4.4e-02\n  50  -76.02531244   1.19e-03   4.5e-02\nWARNING: SCF not converged   # scf.maxit = 50', next: 'diis3' },
    diis3: { who: 'diis', text: 'A two-cycle oscillation. What do you change first?',
      choices: [{ t: 'Bigger DIIS space and a different guess: <code>@dfhf begin @set diis maxdiis=10; @set scf guess=:HCORE end</code>', next: 'diis4', ok: true }, { t: 'More iterations for the wrong solver: <code>@set cc maxit=200</code>', next: 'diisx1' }, { t: 'Loosen the threshold: <code>@set scf thr=1e-2</code>', next: 'diisx2' }] },
    diisx1: { who: 'diis', text: 'cc is the coupled-cluster block. The SCF has its own: scf.', next: 'diis3' },
    diisx2: { who: 'diis', text: 'A loose threshold does not converge anything; it stops complaining. scf.thr is 1e-10 for a reason.', next: 'diis3' },
    diis4: { who: 'diis', text: 'Right. And you set it inside the macro, in a begin…end block, so it is restored afterwards. DIIS extrapolation also speeds up your own casting: take it.', code: '@dfhf begin\n  @set diis maxdiis=10\n  @set scf guess=:HCORE\nend', run: () => { ctx.giveItem('diis'); completeQuest('scf', 60); } },
    diisdone: { who: 'diis', text: 'scf options for the reference, cc options for the amplitudes, diis for both.' },
    // ---------------- the ladder
    cluster0: { who: 'cluster', text: 'So you can build a reference. Now the ladder. Coupled cluster with singles and doubles, N⁶, and its distinguishable-cluster cousin at the same cost. Craft them at the workbench and try them on the Water Sprite and the Bound Dinitrogen in the wood. Watch what MP2 does to the triple bond first, if you like.',
      code: '@dfhf\n@cc ccsd\n@cc dcsd', run: () => { Q.ladder = 2; ctx.unlock(['ccsd', 'dcsd']); ctx.spawnEncounter('water', 'forest', -8, 5, 'ladder'); ctx.spawnEncounter('n2eq', 'forest', 7, 8, 'ladder'); } },
    cluster1: { who: 'cluster', text: 'Two creatures still in the wood. Cast from the hotbar: 1 to 9.' },
    cluster2: { who: 'cluster', text: 'Good. Now the gold standard: the perturbative triples. N⁷, and only worth it when the reference is sound.', code: '@dfhf\n@cc ccsd(t)', next: 'cluster3' },
    cluster3: { who: 'cluster', text: 'Before you go, a log from last week. The residual grows every iteration.', code: 'Iter     SqNorm      Energy      DE          Res         Time\n  12   1.09121   -0.21734501  -0.00312   8.1e-03   0.7\n  13   1.18303   -0.22012377  -0.00278   2.4e-02   0.7\n  14   1.41270   -0.22910013  -0.00898   9.9e-02   0.8\nWARNING: CC iterations did not converge!',
      choices: [{ t: 'Damp the update: <code>@cc dcsd begin @set cc maxit=100 shiftp=0.5 shifts=0.3 end</code>', next: 'cluster4', ok: true }, { t: 'Loosen the reference: <code>@set scf thr=1e-6</code>', next: 'clusterx1' }, { t: 'Skip ahead: <code>@cc ccsd(t)</code>', next: 'clusterx2' }] },
    clusterx1: { who: 'cluster', text: 'The SCF is converged; the amplitude equations are misbehaving.', next: 'cluster3' },
    clusterx2: { who: 'cluster', text: '(T) is a correction on top of converged amplitudes. Nothing to correct if they diverge.', next: 'cluster3' },
    cluster4: { who: 'cluster', text: 'Level shifts, then store the amplitudes with wf store and restart the next geometry from them with wf start. Take the triples. And beware: something in the wood is stretching its bond. Single-reference spells will not finish it.',
      run: () => { ctx.unlock(['ccsdt']); completeQuest('ladder', 90); ctx.spawnEncounter('n2str', 'forest', 0, -9, 'flee'); } },
    clusterdone: { who: 'cluster', text: 'CCSD for the well behaved, DCSD when it strains, (T) when the reference is sound.' },
    // ---------------- the caves
    keeper0: { who: 'keeper', text: 'Down here we keep exact answers. Full CI: every determinant, the true energy in the basis, and a memory bill that grows exponentially. Craft it and try it on the Lithium Hydride and the Torn Dihydrogen. Then try it on the dinitrogen dump.',
      code: '@dfhf\n@fci', run: () => { Q.dumps = 2; ctx.unlock(['fci', 'ciphi']); ctx.spawnEncounter('lih', 'caves', -6, 7, 'dumps'); ctx.spawnEncounter('h2str', 'caves', 6, 8, 'dumps'); ctx.spawnEncounter('n2dump', 'caves', 9, -8, 'dumps'); } },
    keeper1: { who: 'keeper', text: 'When FCI runs out of memory, select. CIPHI keeps the determinants that matter and corrects for the rest.', code: 'fcidump = "N2.FCIDUMP"\n@ciphi begin\n  @set ciphi epsilon=1e-4\nend' },
    keeper2: { who: 'keeper', text: 'Exact where it fits, selected where it does not. A FCIDUMP holds the integrals without any geometry: fcidump is the third reserved name, next to geometry and basis. Rhea on the ridge has creatures no closed shell can hold.',
      run: () => completeQuest('dumps', 100) },
    keeperdone: { who: 'keeper', text: 'FCI for the tiny, CIPHI for the rest, and tighten epsilon until the energy stops moving.' },
    // ---------------- open shells and ghosts
    rhea0: { who: 'rhea', text: 'Two unpaired electrons up here, and a ghost. Closed-shell references cannot hold a triplet: set wf ms2 to twice the spin, build a UHF reference, cast an unrestricted method. Ghosts are excited states: only EOM sees them. And for what the dragon is made of, an active space.',
      code: '@set wf ms2=2\n@dfuhf\n@cc udcsd\n\n@dfhf\n@cc eom-dcsd begin\n  @set eom nstates=1\nend', run: () => { Q.spins = 2; ctx.unlock(['udcsd', 'uccsdt', 'eom', 'mcscf']); ctx.spawnEncounter('o2', 'ridge', -6, 5, 'spins'); ctx.spawnEncounter('h2co', 'ridge', 7, 4, 'spins'); } },
    rhea1: { who: 'rhea', text: 'Set the options before you cast: ms2 for the triplet, nstates for the ghost. The workbench, or the spellbook with Tab.' },
    rhea2: { who: 'rhea', text: 'ms2 for the spin, U for the method, EOM for the excited state. The Alpaca waits below the tower with the spells for the big ones.', code: '@dfmcscf begin\n  @set wf active="(6,6)"\nend', run: () => completeQuest('spins', 110) },
    rheadone: { who: 'rhea', text: 'Spin first, then the method. Never the other way round.' },
    // ---------------- the golems
    alpaca0: { who: 'alpaca', text: 'ALPACA here: Amended Low-rank Principal-element Adaptive Cross Approximation. Big molecules are my speciality. Triples with low-rank amplitudes, N⁵ instead of N⁷: svd-dc-ccsdt, with the mpfit basis. And when even that is too much, cut a region out and freeze the rest.',
      code: '@dfhf\n@cc svd-dc-ccsdt\n\n@dfhf\n@region [1, 2]\n@cc dcsd   # correlates only the region', run: () => { Q.golems = 2; ctx.unlock(['svd', 'region']); ctx.spawnEncounter('benzene', 'tower', -9, 9, 'golems'); ctx.spawnEncounter('naphth', 'tower', 9, 10, 'golems'); ctx.spawnEncounter('caffeine', 'tower', 0, 14, 'golems'); } },
    alpaca1: { who: 'alpaca', text: 'The caffeine came from jlmol, which fetched it from PubChem. Region first, then correlate the fragment.' },
    alpaca2: { who: 'alpaca', text: 'Low rank, high spirits. The dragon behind the door is nothing but static correlation: no single reference survives it. Active space first, then selected CI. Here is the key.', run: () => { ctx.giveItem('key'); completeQuest('golems', 140); } },
    alpacadone: { who: 'alpaca', text: 'If a matrix is big, it is probably low rank. If a molecule is big, it is probably a region.' },
    // ---------------- the dragon
    boss0: { who: 'boss', text: 'A triple bond, fully broken. Six electrons in six orbitals that no longer care about your reference. Feed me your single-reference spells.', run: () => ctx.startBoss() },
    boss1: { who: 'boss', text: 'Your coupled cluster strains. The dragon is not one configuration; it is many at once. What do you cast?',
      choices: [{ t: 'An active space: <code>@dfmcscf begin @set wf active="(6,6)" end</code>', next: 'bossok', ok: true }, { t: 'More triples: <code>@cc ccsd(t)</code>', next: 'bossbad' }, { t: 'Tighter convergence: <code>@set cc thr=1e-12</code>', next: 'bossbad' }] },
    boss2: { who: 'boss', text: 'The active space holds its shape but the dynamic correlation is still yours to pay. Finish it.',
      choices: [{ t: 'Selected CI: <code>@ciphi begin @set ciphi epsilon=1e-4 end</code>', next: 'bossok', ok: true }, { t: 'Full CI: <code>@fci</code>', next: 'bossbad' }, { t: 'Perturbation theory: <code>@dfmp2</code>', next: 'bossbad' }] },
    boss3: { who: 'boss', text: 'Converged.', run: () => ctx.winGame() },
    bossok: { who: 'boss', text: 'It flinches. Cast it now.', run: () => ctx.resumeBoss() },
    bossbad: { who: 'boss', text: 'Wrong. It feeds on that.', run: () => { ctx.player.hp = Math.max(1, ctx.player.hp - 20); ctx.showDialog(ctx.bossQuizNode()); } },
  };
  function npcNode(id) {
    const q = { fock: 'prologue', basia: 'fitting', diis: 'scf', cluster: 'ladder', keeper: 'dumps', rhea: 'spins', alpaca: 'golems' }[id], quest = QUESTS.find((x) => x.id === q);
    if (!questAvailable(quest)) return null;
    if (Q[q] === 0) Q[q] = 1;
    const st = Q[q];
    if (st === 1) return id + '0';
    if (st === 2) return id + '1';
    if (st === 3) return id + '2';
    return id + 'done';
  }
  const ITEMS = { jkfit: ['jkfit basis', 'blue'], mpfit: ['mpfit basis', 'blue'], diis: ['DIIS extrapolation', 'green'], key: ['tower key', 'amber'] };
  function completeQuest(id, xp) { const q = QUESTS.find((x) => x.id === id); Q[id] = q.obj.length - 1; ctx.player.xp += xp; ctx.Sfx.quest(); ctx.toast(`Quest complete: ${q.title}  +${xp} XP`, 'green'); ctx.saveGame(); }
  /** called by the game when an encounter creature dies; returns true when it advanced a quest */
  function onEncounterDefeated(tag, remaining) {
    const map = { ladder: 'ladder', dumps: 'dumps', spins: 'spins', golems: 'golems' };
    if (tag === 'pro' && Q.prologue === 2) { Q.prologue = 3; ctx.toast('The mean field was enough. Report to Fock.', 'green'); return true; }
    if (map[tag] && Q[map[tag]] === 2 && remaining === 0) { Q[map[tag]] = 3; ctx.toast('Cleared. Report back.', 'green'); ctx.saveGame(); return true; }
    return false;
  }
  return { D, WHO, QUESTS, Q, npcNode, giveItem: ctx.giveItem, completeQuest, ITEMS, questAvailable, questDone, onEncounterDefeated };
}
