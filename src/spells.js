// Spells (ElemCo methods), encounters (molecules) and the rules that decide what happens when a spell meets a molecule.
// Every macro and option here follows the ElemCo.jl v0.16 documentation.

export const SPELLS = {
  hf:     { name: 'Hartree–Fock', macro: '@hf', tier: 0, cost: 18, power: 0.4, scaling: 'N⁴', color: 0x9fb6ff, maxSize: 5,
            desc: 'The mean field. Exact for a single electron and the reference for everything else. Blind to correlation.' },
  dfhf:   { name: 'DF-HF', macro: '@dfhf', tier: 0, cost: 6, power: 0.4, scaling: 'N³', color: 0xb9c9ff, maxSize: 5, needs: ['jkfit'],
            desc: 'Hartree–Fock with density fitting. A fraction of the cost, but it needs a jkfit fitting basis.' },
  dfmp2:  { name: 'DF-MP2', macro: '@dfmp2', tier: 1, cost: 14, power: 1.0, scaling: 'N⁵', color: 0x6fd08c, maxSize: 5, needs: ['mpfit'], ref: 'dfhf',
            desc: 'Second-order perturbation theory on density-fitted integrals. Cheap, decent for well-behaved molecules, useless near degeneracies.' },
  ccsd:   { name: 'CCSD', macro: '@cc ccsd', tier: 2, cost: 28, power: 2.0, scaling: 'N⁶', color: 0x4fb7c9, maxSize: 4, ref: 'dfhf', robust: 1,
            desc: 'Coupled cluster with singles and doubles. Exact for two electrons; struggles once a bond starts to break.' },
  dcsd:   { name: 'DCSD', macro: '@cc dcsd', tier: 2, cost: 28, power: 2.3, scaling: 'N⁶', color: 0x4063d8, maxSize: 4, ref: 'dfhf', robust: 2,
            desc: 'The distinguishable cluster method. Same cost as CCSD, noticeably sturdier when correlation gets strong.' },
  ccsdt:  { name: 'CCSD(T)', macro: '@cc ccsd(t)', tier: 3, cost: 44, power: 3.0, scaling: 'N⁷', color: 0xe9a23b, maxSize: 3, ref: 'dfhf', robust: 1, backfire: true,
            desc: 'The gold standard for single-reference molecules. The perturbative triples explode when the reference is bad.' },
  svd:    { name: 'SVD-DC-CCSDT', macro: '@cc svd-dc-ccsdt', tier: 3, cost: 36, power: 3.3, scaling: 'N⁵–N⁶', color: 0xff8c5a, maxSize: 4, needs: ['mpfit'], ref: 'dfhf', robust: 2,
            desc: 'Full triples made affordable by low-rank (SVD) amplitudes. Needs the mpfit basis; the Alpaca approves.' },
  udcsd:  { name: 'UDCSD', macro: '@cc udcsd', tier: 2, cost: 32, power: 2.3, scaling: 'N⁶', color: 0xcb3c33, maxSize: 4, ref: 'dfuhf', open: true, robust: 2, opts: ['ms2'],
            desc: 'Unrestricted DCSD on a UHF reference. For radicals and triplets: set wf ms2 to twice the spin.' },
  uccsdt: { name: 'UCCSD(T)', macro: '@cc uccsd(t)', tier: 3, cost: 48, power: 3.0, scaling: 'N⁷', color: 0xff6a3d, maxSize: 3, ref: 'dfuhf', open: true, robust: 1, backfire: true, opts: ['ms2'],
            desc: 'Open-shell CCSD(T). Gold standard for radicals that are still single-reference.' },
  eom:    { name: 'EOM-DCSD', macro: '@cc eom-dcsd', tier: 3, cost: 34, power: 2.3, scaling: 'N⁶', color: 0xd9d2ff, maxSize: 3, ref: 'dfhf', excited: true, opts: ['nstates'],
            desc: 'Equation-of-motion excited states on top of DCSD. The only spell that touches ghosts. eom nstates picks how many.' },
  mcscf:  { name: 'DF-MCSCF', macro: '@dfmcscf', tier: 3, cost: 30, power: 1.4, scaling: 'N⁴ · active', color: 0x9558b2, maxSize: 4, static: 3, opts: ['active'],
            desc: 'Multi-configurational SCF with an active space, wf active="(electrons,orbitals)". Captures static correlation, misses most of the dynamic.' },
  fci:    { name: 'FCI', macro: '@fci', tier: 4, cost: 60, power: 4.0, scaling: 'exponential', color: 0xffffff, maxSize: 1, ref: 'dfhf', static: 3,
            desc: 'Full configuration interaction: exact in the basis. Only castable on tiny molecules before memory runs out.' },
  ciphi:  { name: 'CIPHI', macro: '@ciphi', tier: 4, cost: 50, power: 3.6, scaling: 'selected', color: 0xf2f0ff, maxSize: 3, ref: 'dfhf', static: 3, opts: ['epsilon'],
            desc: 'Selected CI with perturbative selection and a PT2 correction. ciphi epsilon is the dial: smaller is more exact and more expensive.' },
  region: { name: 'Region', macro: '@region', tier: 3, cost: 10, power: 0, scaling: 'fragment', color: 0xe9c56b, maxSize: 5, modifier: true, opts: ['centers'],
            desc: 'Cut a fragment out of a big molecule; the environment is frozen as core. The next spell only has to correlate the fragment.' },
  twod:   { name: '2D-DCSD', macro: '@cc 2d-dcsd', tier: 3, cost: 36, power: 2.4, scaling: 'N⁶', color: 0xd86fb0, maxSize: 3, ref: 'dfuhf', twodet: true, robust: 2, opts: ['occa', 'occb'],
            desc: 'Two-determinant DCSD for open-shell singlets: one α-only and one β-only orbital, named with wf occa and occb. The biradical spell.' },
};
export const OPT_DEFAULTS = { ms2: 2, nstates: 1, active: '(6,6)', epsilon: '1e-4', centers: '[1, 2]', occa: '1-3+4', occb: '1-3+5' };

/** The ElemCo options a spell may carry as "additional settings" (group, key: [description, example]). Names follow src/infos/options.jl. */
export const OPTION_CATALOG = {
  scf:  { maxit: ['maximum SCF iterations', '200'], thr: ['SCF convergence threshold', '1e-8'], guess: ['orbital guess: :SAD (atomic densities), :HCORE, or :ORB from the dump', ':HCORE'], redthr: ['discard AO combinations whose overlap eigenvalue is below this (linear dependencies)', '1e-6'] },
  diis: { maxdiis: ['number of DIIS vectors kept', '10'], crop: ['CROP-DIIS variant, usually with maxcrop=3', 'true'], maxcrop: ['DIIS dimension for CROP-DIIS', '3'], resthr: ['residual threshold below which DIIS starts', '1.0'] },
  cc:   { maxit: ['maximum CC iterations', '100'], thr: ['residual convergence threshold', '1e-8'], shifts: ['level shift for singles', '0.3'], shiftp: ['level shift for doubles', '0.5'], conven: ['energy convergence factor: energy threshold = sqrt(thr) × conven', '0.01'],
          properties: ['compute properties such as the dipole moment', 'true'], usedf: ['density fitting inside SVD-DC-CCSDT; false switches to Cholesky', 'false'], ampsvdtol: ['amplitude decomposition threshold for SVD methods', '1e-6'], nomp2: ['skip the MP2 starting guess (1)', '1'],
          ignore_error: ['run perturbative triples on a similarity-transformed (ST=1) Hamiltonian anyway', 'true'] },
  wf:   { charge: ['charge relative to the neutral molecule or the dump', '1'], ms2: ['twice the spin projection', '2'], core: ['frozen core: :auto, :none, :small, :large', ':none'], freeze_nocc: ['number of occupied orbitals to freeze', '1'],
          occa: ['occupied α orbitals for an open-shell reference, e.g. "1-3+4"', '"1-3+4"'], occb: ['occupied β orbitals, e.g. "1-3+5"', '"1-3+5"'],
          store: ['file to store orbitals and converged amplitudes', '"cc.h5"'], start: ['file to restart amplitudes from', '"cc.h5"'], dump: ['orbital dump; "" reuses the orbitals of the start file', '""'], active: ['active space "(electrons, orbitals)"', '"(6,6)"'] },
  eom:  { nstates: ['number of excited states', '3'], shift: ['level shift for the Davidson solver', '0.1'] },
  ciphi:{ epsilon: ['selection threshold, smaller is tighter', '1e-5'], pt2_only: ['only the PT2 correction on a stored determinant space', 'true'], target_selection: ['maximum number of determinants', '500000'] },
  fci:  { nstates: ['number of states', '2'] },
  int:  { df: ['density-fitted integrals', 'false'], ao_direct: ['run the correlated method AO-direct on exact integrals', 'false'], fcidump: ['also write the MO integrals as a FCIDUMP', '"h2o.fcidump"'], screen: ['Cauchy–Schwarz prescreening threshold for exact integrals', '1e-10'] },
  cholesky: { thr: ['Cholesky decomposition threshold', '1e-6'] },
  mem:  { budget: ['memory budget in GB for large scratch arrays', '32'], fraction: ['fraction of free memory to use when the budget is automatic', '0.4'] },
  print:{ time: ['timing verbosity', '0'], memory: ['memory printing verbosity', '0'] },
  region: { mode: ['centre selection: :inclusive or :exclusive', ':exclusive'], occ_charge_thr: ['charge threshold to keep an occupied orbital in the fragment', '0.25'], pi: ['π-space selection: :none, :occupied, :both', ':occupied'] },
};
const REF_GROUPS = new Set(['scf', 'diis', 'int', 'cholesky', 'mem', 'print']);
const GLOBAL_WF = new Set(['charge', 'ms2', 'core', 'freeze_nocc', 'occa', 'occb']);
/** Parses "group key=value key=value; group key=value" into sets, validating against the catalogue. */
export function parseExtras(text) {
  const sets = [], errors = [];
  for (const raw of String(text || '').split(/[;\n]+/)) {
    const line = raw.trim().replace(/^@set\s+/i, '').replace(/\s*=\s*/g, '=').replace(/,/g, ' '); if (!line) continue;   // "@set cc a = 1, b = 2" is fine too
    const [group, ...pairs] = line.split(/\s+/);
    if (!OPTION_CATALOG[group]) { errors.push(`Unknown option group "${group}". Groups: ${Object.keys(OPTION_CATALOG).join(', ')}.`); continue; }
    if (!pairs.length) { errors.push(`"${group}" needs key=value pairs.`); continue; }
    for (const pr of pairs) {
      const m = pr.match(/^([a-z_0-9]+)=(.+)$/); if (!m) { errors.push(`"${pr}" is not key=value.`); continue; }
      const [, key, value] = m;
      if (!OPTION_CATALOG[group][key]) { const near = Object.keys(OPTION_CATALOG[group]).find((k) => k.startsWith(key.slice(0, 3))); errors.push(`No option "${key}" in ${group}.${near ? ` Did you mean ${near}?` : ''}`); continue; }
      sets.push({ group, key, value });
    }
  }
  return { sets, errors };
}
export const findExtra = (sets, group, key) => { const s = sets.find((x) => x.group === group && x.key === key); return s ? s.value : undefined; };
export const extraSatisfied = (sets, need) => { const v = findExtra(sets, need.group, need.key); if (v === undefined) return false; if (need.min !== undefined) return parseFloat(v) >= need.min; if (need.eq !== undefined) return String(v).replace(/"/g, '') === String(need.eq).replace(/"/g, ''); return true; };

/** The Julia input for a spell with options, on a given molecule. This is what the player actually learns. */
export function craftInput(spellId, opts, enc) {
  const s = SPELLS[spellId]; if (!s) return '';
  const { sets } = parseExtras(opts.extra);
  const lines = ['using ElemCo', '@print_input'];
  if (enc) lines.push(enc.geometryLine || `geometry = "angstrom\n${enc.atoms.map(([e, x, y, z]) => `  ${e.padEnd(2)} ${fmt(x)} ${fmt(y)} ${fmt(z)}`).join('\n')}"`);
  const needsMpfit = s.needs && s.needs.includes('mpfit');
  const basis = opts.basis && opts.basis.trim();
  lines.push(basis ? (basis.startsWith('Dict') ? `basis = ${basis}` : `basis = "${basis.replace(/^"|"$/g, '')}"`) : needsMpfit ? 'basis = Dict("ao"=>"cc-pVDZ", "jkfit"=>"cc-pvdz-jkfit", "mpfit"=>"cc-pvdz-mpfit")' : 'basis = "vdz"');
  const open = s.open || (enc && enc.open);
  const globalWf = [];
  if (enc && enc.charge && !sets.some((x) => x.group === 'wf' && x.key === 'charge')) globalWf.push(`charge=${enc.charge}`);
  if (open) globalWf.push(`ms2=${opts.ms2 ?? (enc && enc.ms2) ?? 2}`);
  if (s.twodet) globalWf.push('ms2=0', `occa="${(opts.occa ?? OPT_DEFAULTS.occa).replace(/"/g, '')}"`, `occb="${(opts.occb ?? OPT_DEFAULTS.occb).replace(/"/g, '')}"`);   // the two open-shell orbitals of the singlet
  for (const x of sets) if (x.group === 'wf' && GLOBAL_WF.has(x.key) && !(x.key === 'ms2' && open)) globalWf.push(`${x.key}=${x.value}`);
  if (globalWf.length) lines.push(`@set wf ${globalWf.join(' ')}`);
  const block = (macro, groupSets) => { const byGroup = {}; for (const x of groupSets) (byGroup[x.group] = byGroup[x.group] || []).push(`${x.key}=${x.value}`);
    const body = Object.entries(byGroup).map(([gname, kv]) => `  @set ${gname} ${kv.join(' ')}`); return body.length ? `${macro} begin\n${body.join('\n')}\nend` : macro; };
  const refSets = sets.filter((x) => REF_GROUPS.has(x.group));
  const methodSets = sets.filter((x) => !REF_GROUPS.has(x.group) && !(x.group === 'wf' && GLOBAL_WF.has(x.key)));
  if (spellId === 'hf') { lines.push(block('@hf', refSets)); return lines.join('\n'); }
  if (spellId === 'dfhf') { lines.push(block('@dfhf', refSets)); return lines.join('\n'); }
  lines.push(block(open || s.twodet ? '@dfuhf' : '@dfhf', refSets));
  if (spellId === 'mcscf') { lines.push(block('@dfmcscf', [{ group: 'wf', key: 'active', value: `"${(opts.active ?? OPT_DEFAULTS.active).replace(/"/g, '')}"` }, ...methodSets.filter((x) => !(x.group === 'wf' && x.key === 'active'))])); return lines.join('\n'); }
  if (spellId === 'region') { lines.push(block(`@region ${opts.centers ?? OPT_DEFAULTS.centers}`, methodSets.filter((x) => x.group === 'region')), '@cc dcsd   # correlates only the region; the environment is frozen'); return lines.join('\n'); }
  if (spellId === 'eom') lines.push(block('@cc eom-dcsd', [{ group: 'eom', key: 'nstates', value: String(opts.nstates ?? 1) }, ...methodSets.filter((x) => !(x.group === 'eom' && x.key === 'nstates'))]));
  else if (spellId === 'ciphi') lines.push(block('@ciphi', [{ group: 'ciphi', key: 'epsilon', value: String(opts.epsilon ?? OPT_DEFAULTS.epsilon) }, ...methodSets.filter((x) => !(x.group === 'ciphi' && x.key === 'epsilon'))]));
  else lines.push(block(s.macro, methodSets));
  return lines.join('\n');
}
const fmt = (v) => (v >= 0 ? ' ' : '') + v.toFixed(4);

// ------------------------------------------------------------ molecules / encounters
const hexRing = (r, z = 0, offset = Math.PI / 6) => Array.from({ length: 6 }, (_, k) => [r * Math.cos(offset + k * Math.PI / 3), r * Math.sin(offset + k * Math.PI / 3), z]);
function benzene() { const a = []; hexRing(1.3915).forEach(([x, y]) => { a.push(['C', x, y, 0]); const f = 2.4715 / 1.3915; a.push(['H', x * f, y * f, 0]); }); return a; }
function naphthalene() {
  const a = [], cs = [];
  for (const cx of [-1.2124, 1.2124]) hexRing(1.4).forEach(([x, y]) => { const px = +(cx + x).toFixed(4), py = +y.toFixed(4); if (!cs.some((c) => Math.abs(c[0] - px) < 0.01 && Math.abs(c[1] - py) < 0.01)) cs.push([px, py, cx]); });
  for (const [x, y, cx] of cs) { a.push(['C', x, y, 0]); if (Math.abs(x) > 0.05) { const dx = x - cx, dy = y, l = Math.hypot(dx, dy); a.push(['H', x + dx / l * 1.08, y + dy / l * 1.08, 0]); } }
  return a;
}
function fusedRings(n) {   // n linearly fused benzene rings (naphthalene, anthracene, ...)
  const a = [], cs = [], centres = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 2.4248);
  for (const cx of centres) hexRing(1.4).forEach(([x, y]) => { const px = +(cx + x).toFixed(4), py = +y.toFixed(4); if (!cs.some((c) => Math.abs(c[0] - px) < 0.01 && Math.abs(c[1] - py) < 0.01)) cs.push([px, py, cx]); });
  for (const [x, y, cx] of cs) { a.push(['C', x, y, 0]); const inner = centres.some((c) => c !== cx && Math.abs(x - (c + cx) / 2) < 0.05); if (!inner) { const dx = x - cx, dy = y, l = Math.hypot(dx, dy); a.push(['H', x + dx / l * 1.08, y + dy / l * 1.08, 0]); } }
  return a;
}
const WATER_ATOMS = [['O', 0, 0, -0.0659], ['H', 0, -0.7604, 0.5227], ['H', 0, 0.7604, 0.5227]];
function caffeineSketch() {   // a plausible caffeine skeleton for the creature model; the real geometry comes from jlmol's PubChem export
  const a = []; hexRing(1.38, 0, 0).forEach(([x, y], i) => a.push([i % 3 === 1 ? 'N' : 'C', x - 0.7, y, 0]));
  [[1.95, 1.1], [2.75, 0.0], [1.95, -1.1]].forEach(([x, y], i) => a.push([i === 1 ? 'C' : 'N', x, y, 0]));
  a.push(['O', -0.7 + 1.38 * 1.9, 0, 0.0], ['O', -2.8, 1.2, 0], ['C', -2.9, -1.4, 0.4], ['C', 2.9, 2.4, -0.3], ['C', 0.2, 2.8, 0.3]);
  for (let i = 0; i < 10; i++) { const c = a[[9, 10, 11][i % 3]]; a.push(['H', c[1] + Math.cos(i * 2.1) * 0.9, c[2] + Math.sin(i * 2.1) * 0.9, c[3] + (i % 2 ? 0.7 : -0.7)]); }
  return a;
}
// size class: 1 ≤ 4 electrons, 2 ≤ 20, 3 ≤ 50, 4 ≤ 100, 5 more. static: 0 none, 1 mild, 2 strong, 3 severe.
export const ENCOUNTERS = {
  hatom:    { name: 'Lone Hydrogen', formula: 'H', nelec: 1, size: 1, hp: 30, atoms: [['H', 0, 0, 0]], kind: 'wisp', xp: 20,
              tells: ['a single electron', 'nothing to correlate'], lesson: 'One electron has no partner to correlate with: Hartree–Fock is exact here.' },
  h2:       { name: 'Dihydrogen', formula: 'H₂', nelec: 2, size: 1, hp: 60, atoms: [['H', 0, 0, -0.37], ['H', 0, 0, 0.37]], kind: 'dynamic', xp: 40,
              tells: ['two electrons in one bond', 'gentle dynamic correlation'], lesson: 'Two electrons: MP2 does well, CCSD is already exact for a two-electron system.' },
  water:    { name: 'Water Sprite', formula: 'H₂O', nelec: 10, size: 2, hp: 110, atoms: [['O', 0, 0, -0.0659], ['H', 0, -0.7604, 0.5227], ['H', 0, 0.7604, 0.5227]], kind: 'dynamic', xp: 60,
              tells: ['closed shell', 'a well-behaved single reference'], lesson: 'Textbook dynamic correlation. Anything from MP2 upward works; CCSD(T) is the benchmark.' },
  n2eq:     { name: 'Bound Dinitrogen', formula: 'N₂ · 1.10 Å', nelec: 14, size: 2, hp: 150, atoms: [['N', 0, 0, -0.549], ['N', 0, 0, 0.549]], kind: 'dynamic', hard: true, xp: 80,
              tells: ['a triple bond', 'strong but still dynamic correlation'], lesson: 'Near equilibrium N₂ is single-reference but strongly correlated: MP2 overshoots, CCSD(T) or DCSD hit cleanly.' },
  n2str:    { name: 'Stretched Dinitrogen', formula: 'N₂ · 2.2 Å', nelec: 14, size: 2, hp: 200, atoms: [['N', 0, 0, -1.1], ['N', 0, 0, 1.1]], kind: 'static', static: 2, xp: 120,
              tells: ['a bond being torn apart', 'near-degenerate orbitals'], lesson: 'A breaking triple bond is multireference. MP2 and CCSD(T) fail, CCSD drifts, DCSD still wounds it. To finish it you need MCSCF or selected CI.' },
  h2str:    { name: 'Torn Dihydrogen', formula: 'H₂ · 2.5 Å', nelec: 2, size: 1, hp: 90, atoms: [['H', 0, 0, -1.25], ['H', 0, 0, 1.25]], kind: 'static', static: 3, xp: 70,
              tells: ['two electrons, far apart', 'the simplest multireference problem'], lesson: 'Two electrons: FCI is trivial, and CCSD or DCSD are exact for two electrons even when the bond is broken.' },
  lih:      { name: 'Lithium Hydride', formula: 'LiH', nelec: 4, size: 1, hp: 80, atoms: [['Li', 0, 0, -0.8], ['H', 0, 0, 0.8]], kind: 'dynamic', xp: 60,
              tells: ['four electrons', 'small enough for the exact answer'], lesson: 'Four electrons in a small basis: FCI fits in memory. Anything bigger and you reach for CIPHI.' },
  n2dump:   { name: 'Dinitrogen in a FCIDUMP', formula: 'N₂ · cc-pVDZ dump', nelec: 14, size: 2, hp: 180, atoms: [['N', 0, 0, -0.549], ['N', 0, 0, 0.549]], kind: 'static', static: 2, xp: 130,
              geometryLine: 'fcidump = "N2.FCIDUMP"', tells: ['integrals only, no geometry', '28 orbitals: FCI would need memory the island does not have'],
              lesson: 'FCI on N₂/cc-pVDZ runs out of memory. CIPHI selects the important determinants and adds a PT2 correction for the rest.' },
  o2:       { name: 'Triplet Dioxygen', formula: 'O₂ · ³Σg⁻', nelec: 16, size: 2, hp: 170, atoms: [['O', 0, 0, -0.604], ['O', 0, 0, 0.604]], kind: 'open', open: true, ms2: 2, static: 1, xp: 120,
              tells: ['two unpaired electrons', 'a triplet ground state'], lesson: 'Closed-shell references cannot hold two unpaired electrons. wf ms2=2, a UHF reference, and an unrestricted method.' },
  h2co:     { name: 'Formaldehyde Ghost', formula: 'H₂CO · n→π*', nelec: 16, size: 2, hp: 140, atoms: [['C', 0, 0, 0], ['O', 0, 0, 1.205], ['H', 0, 0.943, -0.587], ['H', 0, -0.943, -0.587]], kind: 'excited', excited: true, state: 1, xp: 130,
              tells: ['not in its ground state', 'a lone pair promoted into π*'], lesson: 'Ground-state spells pass straight through an excited state. EOM-DCSD with eom nstates=1 reaches the n→π* state.' },
  benzene:  { name: 'Benzene Golem', formula: 'C₆H₆', nelec: 42, size: 3, hp: 260, atoms: benzene(), kind: 'large', xp: 160,
              tells: ['42 electrons, aromatic', 'single-reference but heavy'], lesson: 'Benzene is single-reference but big. CCSD(T) is expensive at N⁷; SVD-DC-CCSDT gives triples at a fraction of the cost.' },
  naphth:   { name: 'Naphthalene Golem', formula: 'C₁₀H₈', nelec: 68, size: 4, hp: 300, atoms: naphthalene(), kind: 'large', xp: 200,
              tells: ['68 electrons, two fused rings', 'too big for (T)'], lesson: 'At this size perturbative triples are out of reach. DCSD or SVD-DC-CCSDT still scale; or cut a region out first.' },
  caffeine: { name: 'PubChem Golem', formula: 'C₈H₁₀N₄O₂ · caffeine', nelec: 102, size: 5, hp: 340, atoms: caffeineSketch(), kind: 'large', xp: 240, needsRegion: true,
              geometryLine: 'geometry = "caffeine.xyz"   # exported from jlmol (PubChem CID 1983)',
              tells: ['102 electrons, fetched by jlmol from PubChem', 'only the carbonyl matters to you'], lesson: 'Too big to correlate whole. @region on the atoms you care about freezes the rest as core; then a correlated spell on the fragment.' },
  natom:    { name: 'Quartet Nitrogen', formula: 'N · ⁴S', nelec: 7, size: 2, hp: 130, atoms: [['N', 0, 0, 0]], kind: 'open', open: true, ms2: 3, static: 0, xp: 110,
              tells: ['a lone atom', 'three unpaired electrons: a quartet'], lesson: 'Three unpaired electrons give S = 3/2, so wf ms2 = 3. Any other spin setting builds the wrong reference.' },
  h2co2:    { name: "Formaldehyde's Second Ghost", formula: 'H₂CO · state 2', nelec: 16, size: 2, hp: 150, atoms: [['C', 0, 0, 0], ['O', 0, 0, 1.205], ['H', 0, 0.943, -0.587], ['H', 0, -0.943, -0.587]], kind: 'excited', excited: true, state: 2, xp: 120,
              tells: ['a second excitation', 'eom nstates=1 stops one state short'], lesson: 'EOM solves for as many states as eom nstates asks. The second ghost needs nstates=2 or more.' },
  stubwater:{ name: 'Stubborn Water', formula: 'H₂O · diverging amplitudes', nelec: 10, size: 2, hp: 140, atoms: [['O', 0, 0, -0.0659], ['H', 0, -0.7604, 0.5227], ['H', 0, 0.7604, 0.5227]], kind: 'dynamic', xp: 100,
              needs: [{ group: 'cc', key: 'shiftp', min: 0.4, spells: ['ccsd', 'dcsd', 'ccsdt', 'svd', 'udcsd', 'uccsdt', 'eom'], why: 'WARNING: CC iterations did not converge! The amplitude update overshoots on this one. Raise the doubles level shift: cc shiftp=0.5 in the spell\'s additional settings.' }],
              tells: ['ordinary water, but its amplitudes overshoot', 'only a damped update converges'], lesson: 'A level shift damps the amplitude update. cc shiftp for doubles (default 0.2), cc shifts for singles (default 0.15). Set it inside the macro\'s begin…end block.' },
  twitchy:  { name: 'Twitchy Water', formula: 'H₂O · oscillating SCF', nelec: 10, size: 2, hp: 130, atoms: [['O', 0, 0, -0.0659], ['H', 0, -0.7604, 0.5227], ['H', 0, 0.7604, 0.5227]], kind: 'dynamic', xp: 90,
              needs: [{ group: 'diis', key: 'maxdiis', min: 10, why: 'WARNING: SCF not converged. The reference oscillates before any correlation spell can start. Give DIIS more vectors: diis maxdiis=10 in the additional settings (it lands in the reference block).' }],
              tells: ['the reference will not settle', 'every spell needs a converged SCF first'], lesson: 'Options for the reference (scf, diis) go into the reference macro\'s block; the correlation spell inherits the converged orbitals.' },
  corelih:  { name: 'Core-Bound Lithium Hydride', formula: 'LiH · 1s correlation', nelec: 4, size: 1, hp: 120, atoms: [['Li', 0, 0, -0.8], ['H', 0, 0, 0.8]], kind: 'dynamic', xp: 90,
              needs: [{ group: 'wf', key: 'core', eq: ':none', spells: ['dfmp2', 'ccsd', 'dcsd', 'ccsdt', 'svd', 'fci', 'ciphi'], result: 'weak', factor: 0.25, why: 'Its strength sits in the lithium 1s core, and the default frozen core (wf core=:auto, which falls back to :large) leaves it untouched. Set wf core=:none to correlate the core.' }],
              tells: ['four electrons', 'two of them in a core that is normally frozen'], lesson: 'wf core controls the frozen-core approximation: :auto (default), :none, :small, :large. freeze_nocc freezes an explicit number of orbitals instead.' },
  // ---- the wild population: a database of molecules by size and by kind of correlation. Wild ones respawn.
  he:       { name: 'Helium Mote', formula: 'He', nelec: 2, size: 1, hp: 50, atoms: [['He', 0, 0, 0]], kind: 'wisp', xp: 30,
              tells: ['two electrons on one atom', 'coupled cluster is exact'], lesson: 'Helium has two electrons: CCSD or DCSD is exact within the basis, and MP2 already recovers most of the correlation.' },
  beh2:     { name: 'Beryllium Hydride', formula: 'BeH₂', nelec: 6, size: 2, hp: 100, atoms: [['Be', 0, 0, 0], ['H', 0, 0, -1.33], ['H', 0, 0, 1.33]], kind: 'dynamic', static: 1, xp: 65,
              tells: ['six electrons, linear', 'beryllium 2s and 2p lie close together'], lesson: 'Near-degenerate 2s/2p on beryllium makes MP2 shaky and CCSD strain; DCSD or SVD-DC-CCSDT hold. Along the Be + H₂ insertion path it turns fully multireference.' },
  nh3:      { name: 'Ammonia Sprite', formula: 'NH₃', nelec: 10, size: 2, hp: 110, atoms: [['N', 0, 0, 0.112], ['H', 0, 0.938, -0.263], ['H', 0.812, -0.469, -0.263], ['H', -0.812, -0.469, -0.263]], kind: 'dynamic', xp: 55,
              tells: ['ten electrons, one lone pair', 'well behaved'], lesson: 'A well-behaved closed shell: MP2 is decent, CCSD good, anything with triples is the benchmark.' },
  ch4:      { name: 'Methane Sprite', formula: 'CH₄', nelec: 10, size: 2, hp: 110, atoms: [['C', 0, 0, 0], ['H', 0.629, 0.629, 0.629], ['H', -0.629, -0.629, 0.629], ['H', -0.629, 0.629, -0.629], ['H', 0.629, -0.629, -0.629]], kind: 'dynamic', xp: 55,
              tells: ['ten electrons, four single bonds', 'as single-reference as it gets'], lesson: 'Single bonds only: the single-reference expansion converges fast, so even MP2 recovers most of the correlation energy.' },
  hf:       { name: 'Hydrogen Fluoride Sprite', formula: 'HF', nelec: 10, size: 2, hp: 110, atoms: [['H', 0, 0, -0.46], ['F', 0, 0, 0.46]], kind: 'dynamic', xp: 55,
              tells: ['ten electrons, one polar bond', 'closed shell'], lesson: 'A polar single bond, still single-reference. Its correlation energy is dominated by the fluorine lone pairs.' },
  co:       { name: 'Carbon Monoxide', formula: 'CO', nelec: 14, size: 2, hp: 150, atoms: [['C', 0, 0, -0.64], ['O', 0, 0, 0.49]], kind: 'dynamic', hard: true, xp: 80,
              tells: ['a triple bond, polar', 'strong dynamic correlation'], lesson: 'Isoelectronic with N₂ and just as demanding: MP2 overshoots, CCSD is only fair, DCSD or CCSD(T) get it right.' },
  c2h2:     { name: 'Acetylene', formula: 'C₂H₂', nelec: 14, size: 2, hp: 140, atoms: [['C', 0, 0, -0.6], ['C', 0, 0, 0.6], ['H', 0, 0, -1.66], ['H', 0, 0, 1.66]], kind: 'dynamic', hard: true, xp: 75,
              tells: ['a carbon–carbon triple bond', 'π electrons crowd together'], lesson: 'Triple bonds pack many electron pairs into a small volume: strong but still dynamic correlation. Methods with triples are the benchmark.' },
  c2h4:     { name: 'Ethylene', formula: 'C₂H₄', nelec: 16, size: 2, hp: 140, atoms: [['C', 0, 0, -0.667], ['C', 0, 0, 0.667], ['H', 0, 0.923, -1.23], ['H', 0, -0.923, -1.23], ['H', 0, 0.923, 1.23], ['H', 0, -0.923, 1.23]], kind: 'dynamic', xp: 65,
              tells: ['a double bond, planar', 'single-reference at equilibrium'], lesson: 'Ethylene at equilibrium is single-reference. Twist the double bond by 90° and it becomes a textbook diradical.' },
  f2:       { name: 'Difluorine', formula: 'F₂', nelec: 18, size: 2, hp: 160, atoms: [['F', 0, 0, -0.706], ['F', 0, 0, 0.706]], kind: 'dynamic', static: 1, xp: 90,
              tells: ['a notoriously weak single bond', 'Hartree–Fock does not even bind it'], lesson: 'F₂ is unbound at the Hartree–Fock level: correlation makes the bond. MP2 overshoots, CCSD strains, DCSD and SVD-DC-CCSDT hit cleanly.' },
  waterdimer:{ name: 'Water Dimer', formula: '(H₂O)₂', nelec: 20, size: 2, hp: 150, atoms: [['O', -1.45, 0, 0], ['H', -1.9, 0.75, 0], ['H', -0.5, 0.05, 0], ['O', 1.45, 0, 0], ['H', 1.8, -0.5, 0.75], ['H', 1.8, -0.5, -0.75]], kind: 'dynamic', xp: 70,
              tells: ['two molecules held by a hydrogen bond', 'dispersion is pure correlation'], lesson: 'Hydrogen bonds and dispersion are correlation effects; Hartree–Fock underbinds the dimer badly, MP2 does well, CCSD(T) is the reference.' },
  oh:       { name: 'Hydroxyl Radical', formula: 'OH · ²Π', nelec: 9, size: 2, hp: 120, atoms: [['O', 0, 0, 0], ['H', 0, 0, 0.97]], kind: 'open', open: true, ms2: 1, xp: 90,
              tells: ['nine electrons: one unpaired', 'a doublet'], lesson: 'An odd number of electrons means a doublet: wf ms2=1, a UHF reference and an unrestricted method.' },
  no:       { name: 'Nitric Oxide', formula: 'NO · ²Π', nelec: 15, size: 2, hp: 150, atoms: [['N', 0, 0, -0.6], ['O', 0, 0, 0.55]], kind: 'open', open: true, ms2: 1, xp: 100,
              tells: ['fifteen electrons', 'one in an antibonding π orbital'], lesson: 'A stable radical with a single unpaired π* electron: ms2=1, unrestricted coupled cluster.' },
  ch2:      { name: 'Triplet Methylene', formula: 'CH₂ · ³B₁', nelec: 8, size: 2, hp: 120, atoms: [['C', 0, 0, 0.1], ['H', 0, 0.99, -0.3], ['H', 0, -0.99, -0.3]], kind: 'open', open: true, ms2: 2, xp: 95,
              tells: ['eight electrons, two unpaired', 'a triplet ground state'], lesson: 'Methylene\'s ground state is a triplet: wf ms2=2. The singlet, 9 kcal/mol higher, is a two-configuration problem.' },
  cn:       { name: 'Cyano Radical', formula: 'CN · ²Σ⁺', nelec: 13, size: 2, hp: 160, atoms: [['C', 0, 0, -0.6], ['N', 0, 0, 0.57]], kind: 'open', open: true, ms2: 1, static: 1, xp: 110,
              tells: ['a doublet with a triple bond', 'the UHF reference is badly spin-contaminated'], lesson: 'CN is a doublet whose UHF reference is heavily spin-contaminated: (T) on top of it is fragile, UDCSD is the safer choice.' },
  o3:       { name: 'Ozone Wraith', formula: 'O₃', nelec: 24, size: 3, hp: 220, atoms: [['O', 0, 0, 0.44], ['O', 1.09, 0, -0.22], ['O', -1.09, 0, -0.22]], kind: 'static', static: 2, xp: 150,
              tells: ['24 electrons, bent', 'a diradical hiding in a closed shell'], lesson: 'Ozone is the classic multireference closed shell: (T) is unreliable, CCSD drifts, DCSD wounds it, and an active space or selected CI finishes it.' },
  c2:       { name: 'Dicarbon', formula: 'C₂ · X¹Σg⁺', nelec: 12, size: 2, hp: 190, atoms: [['C', 0, 0, -0.62], ['C', 0, 0, 0.62]], kind: 'static', static: 3, xp: 150,
              tells: ['twelve electrons, no hydrogens', 'several configurations of equal weight'], lesson: 'Dicarbon has several low-lying configurations of comparable weight. Only MCSCF or selected CI describe it; single-reference spells do not converge.' },
  anthr:    { name: 'Anthracene Golem', formula: 'C₁₄H₁₀', nelec: 94, size: 4, hp: 320, atoms: fusedRings(3), kind: 'large', xp: 210,
              tells: ['94 electrons, three fused rings', 'too big for (T)'], lesson: 'Three fused rings: perturbative triples are out of reach. DCSD or SVD-DC-CCSDT still scale, or cut a region first.' },
  glycine:  { name: 'Glycine Golem', formula: 'C₂H₅NO₂', nelec: 40, size: 3, hp: 250, atoms: [['N', -1.2, 0.9, 0], ['C', 0, 0.2, 0], ['C', 1.25, 1.0, 0], ['O', 2.3, 0.4, 0], ['O', 1.2, 2.3, 0], ['H', -1.3, 1.5, 0.8], ['H', -1.3, 1.5, -0.8], ['H', 0, -0.4, 0.9], ['H', 0, -0.4, -0.9], ['H', 2.0, 2.8, 0]], kind: 'large', xp: 170,
              tells: ['40 electrons, the smallest amino acid', 'single-reference but heavy'], lesson: 'Forty electrons of well-behaved correlation. CCSD(T) is affordable but slow at N⁷; SVD-DC-CCSDT gives triples cheaply.' },
  // ---- creatures for the trials
  scanwater:{ name: 'Scan-Point Water', formula: 'H₂O · one point of a scan', nelec: 10, size: 2, hp: 130, atoms: WATER_ATOMS, kind: 'dynamic', xp: 90,
              needs: [{ group: 'wf', key: 'store', spells: ['ccsd', 'dcsd', 'ccsdt', 'svd', 'udcsd', 'uccsdt', 'eom'], why: 'Converged, and thrown away: the next scan point starts from scratch and the creature reforms. Add wf store="cc.h5" to keep the amplitudes.' }],
              tells: ['one geometry of many', 'whatever converges here is wasted unless it is stored'], lesson: 'wf store writes orbitals and amplitudes; wf start restarts from them at the next scan point.' },
  fitless:  { name: 'Unfitted Golem', formula: 'C₆H₆ · element without mpfit', nelec: 42, size: 3, hp: 260, atoms: benzene(), kind: 'large', xp: 170,
              blockSpells: { dfmp2: 'ERROR: Basis set mpfit not found for this element! DF-MP2 has nothing to fit with.' },
              needs: [{ group: 'cc', key: 'usedf', eq: 'false', spells: ['svd'], why: 'ERROR: Basis set mpfit not found for this element! Let SVD-DC-CCSDT Cholesky-decompose the exact integrals instead: cc usedf=false.' }],
              tells: ['42 electrons on an element without a fitting basis', 'density fitting has nothing to fit with'], lesson: 'cc usedf=false replaces density fitting by a Cholesky decomposition of the exact integrals; cc ampsvdtol sets the amplitude SVD threshold.' },
  hydroxide:{ name: 'Hydroxide Anion', formula: 'OH⁻', nelec: 10, size: 2, hp: 130, atoms: [['O', 0, 0, 0], ['H', 0, 0, 0.964]], kind: 'dynamic', xp: 90, charge: -1,
              needsBasis: { re: /(^|[;,\s"])(O\s*=\s*)?a(ug-cc-p)?v[dtq]z/i, why: 'The extra electron is diffuse and the compact vdz basis cannot hold it: the spell misses. Put augmented functions on the oxygen, basis "vdz; O=avdz".' },
              tells: ['an anion: one electron more than water', 'its outermost electron is far from the nuclei'], lesson: 'Anions need diffuse (augmented) functions, and only where the charge sits: basis = "vdz; O=avdz".' },
  // ---- the dissociation curve (Convergence Cape) and the basis ladder
  n2mid:    { name: 'Strained Dinitrogen', formula: 'N₂ · 1.5 Å', nelec: 14, size: 2, hp: 170, atoms: [['N', 0, 0, -0.75], ['N', 0, 0, 0.75]], kind: 'dynamic', static: 1, xp: 100,
              tells: ['a triple bond stretched by a third', 'the single reference begins to strain'], lesson: 'At 1.5 Å N₂ is still single-reference, barely: MP2 fails, CCSD and CCSD(T) only hold on, DCSD is the safe hit.' },
  n2far:    { name: 'Sundered Dinitrogen', formula: 'N₂ · 2.0 Å', nelec: 14, size: 2, hp: 190, atoms: [['N', 0, 0, -1.0], ['N', 0, 0, 1.0]], kind: 'static', static: 2, xp: 120,
              tells: ['a triple bond nearly broken', 'two configurations of comparable weight'], lesson: 'At 2.0 Å the (T) correction explodes and CCSD drifts; DCSD still wounds it, MCSCF or selected CI finish it.' },
  n2brk:    { name: 'Broken Dinitrogen', formula: 'N₂ · 2.5 Å', nelec: 14, size: 2, hp: 210, atoms: [['N', 0, 0, -1.25], ['N', 0, 0, 1.25]], kind: 'static', static: 3, xp: 150,
              tells: ['two nitrogen atoms, six electrons undecided', 'no single reference survives'], lesson: 'Past 2.5 Å only multireference methods converge: an active space (6,6) with MCSCF, then selected CI for the rest.' },
  basiswater:{ name: 'Unconverged Water', formula: 'H₂O · cc-pVDZ is not enough', nelec: 10, size: 2, hp: 150, atoms: WATER_ATOMS, kind: 'dynamic', xp: 100,
              needsBasis: { re: /(^|[;,\s"=])(aug-cc-p|a)?v[tq5]z|cc-pV[TQ5]Z/i, why: 'In cc-pVDZ the correlation energy is a fifth short of the basis-set limit: the spell only scratches. Use a triple-zeta basis, basis = "vtz", or larger.' },
              tells: ['ordinary water', 'its correlation energy converges slowly with the basis'], lesson: 'Correlation energies converge slowly with the basis: cc-pVDZ recovers roughly 80 % of the limit, cc-pVTZ 90 %, cc-pVQZ 95 %. Extrapolate as X⁻³.' },
  // ---- the transcorrelated marsh
  tcdump:   { name: 'Transcorrelated Dump', formula: 'N₂ · xTC FCIDUMP', nelec: 14, size: 2, hp: 200, atoms: [['N', 0, 0, -0.549], ['N', 0, 0, 0.549]], kind: 'dynamic', hard: true, xp: 140,
              geometryLine: 'fcidump = "N2_TC.FCIDUMP"   # header ST=1: similarity transformed, non-Hermitian',
              blockSpells: { ccsdt: 'ERROR: perturbative triples on a similarity-transformed (ST=1) Hamiltonian. Use the Λ variant, @cc λccsd(t), or set cc ignore_error=true if you know what you are doing.',
                uccsdt: 'ERROR: perturbative triples on a similarity-transformed (ST=1) Hamiltonian. Use the Λ variant or cc ignore_error=true.',
                dfmp2: 'ERROR: a FCIDUMP has no AO basis, so there is nothing to density-fit. DF-MP2 cannot run on a dump.' },
              tells: ['integrals only, similarity transformed', 'non-Hermitian: left and right vectors differ'], lesson: 'A transcorrelated FCIDUMP carries ST=1 in its header. DCSD, FCI and CIPHI work with non-Hermitian integrals; (T) needs the Λ variant.' },
  // ---- the open-shell singlet
  ch2s:     { name: 'Singlet Methylene', formula: 'CH₂ · ¹B₁', nelec: 8, size: 2, hp: 160, atoms: [['C', 0, 0, 0.1], ['H', 0, 1.06, -0.3], ['H', 0, -1.06, -0.3]], kind: 'static', static: 2, twodet: true, xp: 130,
              tells: ['eight electrons, two of them unpaired with opposite spin', 'an open-shell singlet: two determinants of equal weight'], lesson: 'An open-shell singlet needs two determinants: 2D-DCSD with wf occa and occb naming the two open-shell orbitals. A single UHF determinant is spin-contaminated.' },
  dragon:   { name: 'Dragon of Static Correlation', formula: 'N₂ · 3.0 Å', nelec: 14, size: 2, hp: 520, atoms: [['N', 0, 0, -1.5], ['N', 0, 0, 1.5]], kind: 'static', static: 3, xp: 400, boss: true,
              tells: ['a triple bond fully broken', 'six electrons in six near-degenerate orbitals'], lesson: 'Severe static correlation. MCSCF with a (6,6) active space exposes it; CIPHI finishes it. Single-reference spells only feed it.' },
};

// ------------------------------------------------------------ the wild population
// Per zone: which creatures roam there (offset from the zone centre), and which main quest must be finished before they appear.
// Killed wild creatures respawn after `respawn` seconds. Each is a plain entry from ENCOUNTERS, so the rules in judge() apply unchanged.
export const WILD = [
  { zone: 'harbor', gate: 'fitting', respawn: 75, pool: [{ enc: 'he', dx: -15, dz: 4 }, { enc: 'h2', dx: 13, dz: -9 }] },
  { zone: 'fields', gate: 'scf', respawn: 75, pool: [{ enc: 'nh3', dx: -12, dz: -8 }, { enc: 'ch4', dx: 12, dz: -9 }, { enc: 'hf', dx: -3, dz: 14 }] },
  { zone: 'bazaar', gate: 'fitting', respawn: 90, pool: [{ enc: 'water', dx: -11, dz: -9 }, { enc: 'waterdimer', dx: 11, dz: 9 }] },
  { zone: 'forest', gate: 'ladder', respawn: 90, pool: [{ enc: 'co', dx: -12, dz: -8 }, { enc: 'c2h2', dx: 12, dz: -10 }, { enc: 'c2h4', dx: -13, dz: 9 }, { enc: 'f2', dx: 3, dz: 13 }] },
  { zone: 'caves', gate: 'dumps', respawn: 90, pool: [{ enc: 'beh2', dx: -12, dz: 10 }, { enc: 'lih', dx: 12, dz: -3 }, { enc: 'c2', dx: 0, dz: -12 }] },
  { zone: 'ridge', gate: 'spins', respawn: 100, pool: [{ enc: 'oh', dx: -12, dz: -6 }, { enc: 'no', dx: 12, dz: -8 }, { enc: 'ch2', dx: -10, dz: 10 }, { enc: 'cn', dx: 10, dz: 10 }, { enc: 'h2co', dx: 0, dz: 13 }] },
  { zone: 'tower', gate: 'golems', respawn: 120, pool: [{ enc: 'anthr', dx: -14, dz: 14 }, { enc: 'glycine', dx: 14, dz: 14 }, { enc: 'o3', dx: 0, dz: 18 }] },
  { zone: 'lagoon', gate: 'ladder', respawn: 90, pool: [{ enc: 'waterdimer', dx: -11, dz: 8 }, { enc: 'nh3', dx: 10, dz: -9 }] },
  { zone: 'marsh', gate: 'dumps', respawn: 100, pool: [{ enc: 'cn', dx: -12, dz: 6 }, { enc: 'no', dx: 11, dz: 8 }, { enc: 'tcdump', dx: 0, dz: -13 }] },
  { zone: 'cape', gate: 'fitting', respawn: 90, pool: [{ enc: 'f2', dx: -10, dz: -6 }, { enc: 'co', dx: 10, dz: -4 }] },
];

// ------------------------------------------------------------ the rules
/** @returns {{result:'best'|'ok'|'weak'|'fail'|'backfire'|'modifier', factor:number, reason:string}} */
export function judge(spellId, opts, enc, state = {}) {
  const s = SPELLS[spellId]; if (!s || !enc) return { result: 'fail', factor: 0, reason: 'No such spell.' };
  const size = state.regioned ? Math.min(enc.size, 2) : enc.size;
  const has = (k) => !s.needs || !s.needs.includes(k) || (state.items || []).includes(k);
  if (!has('jkfit')) return { result: 'fail', factor: 0, reason: 'ERROR: Basis set cc-pvdz-jkfit not found! Density fitting needs the jkfit basis from the bazaar.' };
  if (!has('mpfit')) return { result: 'fail', factor: 0, reason: 'ERROR: Basis set cc-pvdz-mpfit not found! The correlated fit needs the mpfit basis from the bazaar.' };
  if (spellId === 'region') {
    if (enc.size >= 3) return { result: 'modifier', factor: 0, reason: `@region ${opts.centers ?? OPT_DEFAULTS.centers}: fragment orbitals selected, environment frozen as core. The golem shrinks.` };
    return { result: 'fail', factor: 0, reason: 'Nothing to cut out: the molecule is already small enough to correlate whole.' };
  }
  if (enc.excited && !s.excited) return { result: 'fail', factor: 0, reason: 'The spell passes through the ghost: a ground-state method cannot see an excited state. Use EOM-DCSD.' };
  if (s.excited && !enc.excited) return { result: 'weak', factor: 0.4, reason: 'EOM finds excited states; this creature is in its ground state, so only the underlying DCSD bites.' };
  if (s.excited && enc.excited && (opts.nstates ?? 1) < (enc.state || 1)) return { result: 'fail', factor: 0, reason: `eom nstates=${opts.nstates} is too few: the n→π* state is state ${enc.state}.` };
  if (enc.open && !s.open && !['hf', 'mcscf', 'fci', 'ciphi'].includes(spellId)) return { result: 'fail', factor: 0, reason: `ERROR: a closed-shell reference cannot hold ${enc.ms2} unpaired electrons. Set wf ms2=${enc.ms2}, use @dfuhf and a U method.` };
  if (s.open && !enc.open) return { result: 'weak', factor: 0.6, reason: 'An unrestricted method on a closed shell works, but you paid for spin contamination you did not need.' };
  if (s.open && enc.open && (opts.ms2 ?? 0) !== enc.ms2) return { result: 'fail', factor: 0, reason: `wf ms2=${opts.ms2 ?? 0} is the wrong spin: this is a ${enc.ms2 === 2 ? 'triplet' : 'doublet'}, ms2 is twice the spin projection, so ms2=${enc.ms2}.` };
  if (s.twodet && enc.open) return { result: 'fail', factor: 0, reason: '2D-DCSD is for open-shell singlets (ms2=0). This is a high-spin state: one determinant, UDCSD.' };
  if (s.twodet && !enc.twodet) return { result: 'weak', factor: 0.5, reason: 'Two determinants where one suffices: it converges, but you paid for the second.' };
  if (enc.twodet) {
    if (s.twodet) return { result: 'best', factor: 1.3, reason: `2D-DCSD with occa="${opts.occa ?? OPT_DEFAULTS.occa}" occb="${opts.occb ?? OPT_DEFAULTS.occb}": both determinants of the open-shell singlet, spin-pure.` };
    if (spellId === 'mcscf') return { result: 'ok', factor: 0.8, reason: 'The active space holds both determinants; the dynamic correlation is still missing.' };
    if (spellId === 'fci' || spellId === 'ciphi') return { result: 'best', factor: 1.2, reason: 'Every determinant at once: the open-shell singlet is nothing special here.' };
    if (s.open) return { result: 'weak', factor: 0.4, reason: 'A single UHF determinant with ms2=0 is a spin-contaminated mix of singlet and triplet. It scratches. 2D-DCSD treats both determinants.' };
    if (spellId !== 'hf' && spellId !== 'dfhf') return { result: 'fail', factor: 0, reason: 'WARNING: CC iterations did not converge! A closed-shell reference cannot hold an open-shell singlet. Two determinants: @cc 2d-dcsd with wf occa and occb.' };
  }
  if (size > s.maxSize) {
    if (spellId === 'fci') return { result: 'fail', factor: 0, reason: 'ERROR: FCI space too large: the determinant list does not fit in memory. Use CIPHI, or a much smaller molecule.' };
    return { result: 'fail', factor: 0, reason: `${s.name} scales as ${s.scaling}: ${enc.nelec} electrons would run for weeks. Cut out a @region first, or use a cheaper method.` };
  }
  if (enc.blockSpells && enc.blockSpells[spellId]) return { result: 'fail', factor: 0, reason: enc.blockSpells[spellId] };
  if (enc.needsBasis && spellId !== 'hf' && spellId !== 'dfhf' && !enc.needsBasis.re.test(opts.basis || '')) return { result: 'weak', factor: 0.2, reason: enc.needsBasis.why };
  const { sets } = parseExtras(opts.extra);
  for (const n of enc.needs || []) { if (n.spells && !n.spells.includes(spellId)) continue; if (!extraSatisfied(sets, n)) return { result: n.result || 'fail', factor: n.factor || 0, reason: n.why }; }
  const st = enc.static || 0;
  if (enc.nelec === 1 && spellId !== 'hf' && spellId !== 'dfhf') return { result: 'weak', factor: 0.3, reason: 'One electron has no correlation energy: anything beyond the mean field is wasted mana here.' };
  if (enc.nelec === 2 && ['ccsd', 'dcsd', 'svd'].includes(spellId)) return { result: 'best', factor: 1.2, reason: 'Two electrons: coupled cluster with doubles is exact, bond broken or not.' };
  if (spellId === 'hf' || spellId === 'dfhf') return enc.nelec === 1 ? { result: 'best', factor: 2.0, reason: 'One electron: the mean field is the exact answer.' } : { result: 'weak', factor: 0.15, reason: 'Hartree–Fock only builds the reference; the correlation energy is untouched.' };
  if (spellId === 'mcscf') { if (st >= 1) return { result: st >= 2 ? 'ok' : 'weak', factor: st >= 2 ? 0.8 : 0.4, reason: `MCSCF with active="${opts.active ?? OPT_DEFAULTS.active}" captures the static correlation. The dynamic part is still missing.` };
    return { result: 'weak', factor: 0.25, reason: 'No static correlation here: the active space buys almost nothing over Hartree–Fock.' }; }
  if (spellId === 'fci') return { result: 'best', factor: 1.5, reason: 'Exact within the basis.' };
  if (spellId === 'ciphi') { const eps = parseFloat(opts.epsilon ?? OPT_DEFAULTS.epsilon); if (eps > 1e-3) return { result: 'weak', factor: 0.5, reason: `epsilon=${opts.epsilon} keeps too few determinants; tighten it (1e-4 or smaller).` };
    if (st === 0 && size >= 3) return { result: 'ok', factor: 0.7, reason: 'Selected CI converges here, but on a single-reference molecule this size a coupled-cluster spell is far cheaper.' };
    return { result: 'best', factor: 1.3, reason: `CIPHI with epsilon=${opts.epsilon ?? OPT_DEFAULTS.epsilon}: selected determinants plus PT2, converged.` }; }
  if (spellId === 'dfmp2') { if (st >= 2) return { result: 'fail', factor: 0, reason: 'MP2 denominators collapse near degeneracy: the correction diverges and the energy is meaningless.' }; if (enc.hard || st === 1) return { result: 'weak', factor: 0.45, reason: 'MP2 overshoots on strongly correlated bonds. It scratches, no more.' }; return { result: 'ok', factor: 0.8, reason: 'Well-behaved molecule: MP2 recovers most of the correlation cheaply.' }; }
  const robust = s.robust || 1;
  if (st > robust) { if (s.backfire) return { result: 'backfire', factor: 0, reason: 'WARNING: (T) correction exploded. Perturbative triples on a multireference target amplify the error; the recoil hits you.' };
    return { result: 'fail', factor: 0, reason: `WARNING: CC iterations did not converge! ${s.name} needs a single reference; this target is multireference.` }; }
  if (st === robust && st > 0) return { result: 'ok', factor: 0.7, reason: `${s.name} holds where the single-reference expansion strains. It wounds, it does not finish.` };
  const best = s.tier >= 3 || (s.tier === 2 && !enc.hard);
  return best ? { result: 'best', factor: 1.0, reason: `${s.name}: clean hit.` } : { result: 'ok', factor: 0.75, reason: `${s.name} is good here; a method with triples would be the benchmark.` };
}
export const RESULT_DMG = { best: 42, ok: 30, weak: 14, fail: 0, backfire: 0, modifier: 0 };
