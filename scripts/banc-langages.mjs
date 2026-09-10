/**
 * Le banc des chargeurs generes.
 *
 * Ecrire un generateur de code et affirmer que sa sortie compile, c'est
 * exactement le genre de promesse qui se revele fausse le jour ou quelqu'un
 * s'en sert. Ce banc EXECUTE ce qu'il peut executer :
 *
 * - le chargeur Python lit reellement un projet exporte, et on compare les
 *   valeurs qu'il en tire a celles qu'on y a mises ;
 * - le chargeur Rust est compile par `rustc` ;
 * - le chargeur TypeScript est verifie par `tsc`.
 *
 * Pour C#, GDScript et Lua, aucun interprete n'est installe ici. On ne
 * pretend donc pas les avoir eprouves : on verifie seulement qu'ils portent
 * les symboles attendus, et le banc le DIT au lieu de laisser croire.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}
const dispo = (c) => spawnSync('command', ['-v', c], { shell: true }).status === 0

const { serialiserProjet, versTexte } = await import('../src/export/format.ts')
const { chargeur, CIBLES } = await import('../src/export/chargeurs.ts')
const { Carte } = await import('../src/tuiles/tilemap.ts')
const { Palette, depuisHex } = await import('../src/noyau/palette.ts')
const { creerNoeud } = await import('../src/scene/noeud.ts')
const { clip, clipRegulier, imageA } = await import('../src/runtime/animation.ts')
const { decrirePlanche } = await import('../src/export/format.ts')
const { ISO, caseVersMonde } = await import('../src/noyau/projection.ts')
const { espece } = await import('../src/runtime/entites.ts')

/* Un projet minuscule mais complet : un mur, une collision, un noeud. */
const carte = new Carte(5, 3, 16)
const mur = carte.ajouterCalque('mur', {
  terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: true },
})
carte.peindreTerrain(mur, 1, 1, true)
carte.peindreTerrain(mur, 2, 1, true)
carte.solides[carte.index(1, 1)] = 1
carte.solides[carte.index(2, 1)] = 1

const racine = creerNoeud('noeud', 'salle')
const heros = creerNoeud('sprite', 'heros')
heros.x = 40
heros.y = 32
heros.espece = 'gelee'
racine.enfants.push(heros)

/* Trois clips choisis pour couvrir les trois modes de bouclage, et des durees
 * inegales : un clip a duree constante ne distingue pas un portage juste d'un
 * portage qui divise au lieu de parcourir. */
const CLIPS = [
  clipRegulier('marche', [10, 11, 12, 13], 100, {
    evenements: [{ image: 0, nom: 'pas' }, { image: 2, nom: 'pas' }],
  }),
  clip('respire', [
    { index: 20, duree: 30 }, { index: 21, duree: 250 }, { index: 22, duree: 90 },
  ], { boucle: 'aller-retour' }),
  clip('attaque', [
    { index: 30, duree: 40 }, { index: 31, duree: 60 },
  ], { boucle: 'unique', suite: 'marche' }),
]

/* La table de reference : ce que le MOTEUR repond. Chaque portage doit rendre
 * exactement ces valeurs, sinon « marche avec tous les langages » ne veut rien
 * dire. Les instants sont choisis sur les frontieres — juste avant, pile, juste
 * apres — parce que c'est la que deux portages divergent. */
const INSTANTS = [0, 1, 29, 30, 31, 99, 100, 101, 279, 280, 370, 399, 400, 401, 700, 1234, 99999]
const TABLE = CLIPS.flatMap((c) => INSTANTS.map((ms) => ({ clip: c.nom, ms, image: imageA(c, ms) })))

/* Une planche minuscule, mais avec ce qui piege : du vide, une lettre en bas a
 * droite, et une case non carree. */
const PLANCHE = decrirePlanche('essai', [
  ['ab.', '.ba', 'a.b', '..b'],
  ['...', '...', '...', '..a'],
], { a: '#ff0000', b: '#00ff00' }, 2, 3, 4)

/* Deux especes : une qui poursuit et blesse, une qui ne fait que se ramasser.
 * Ce sont les deux extremes du catalogue. */
const ESPECES = [
  espece('gelee', { nom: 'Gelée', pv: 2, vitesse: 34, degats: 1, comportement: 'bond', vigilance: 90 }),
  espece('coeur', { nom: 'Cœur', camp: 'neutre', degats: 0, soigne: 1, comportement: 'immobile' }),
]

const projet = serialiserProjet(
  'demo', { largeur: 320, hauteur: 180 },
  new Palette('donjon', ['#14101a', '#7a7466'].map(depuisHex)),
  [{ nom: 'salle', carte }], [{ nom: 'principale', racine }],
  CLIPS,
  [PLANCHE],
  // Une projection isometrique : c'est celle ou les portages divergent, et
  // celle qu'une projection orthogonale ne distinguerait pas d'une erreur.
  ISO(32, 16),
  ESPECES,
)

/* La table de reference des cases : ou chaque case se pose a l'ecran. */
const CASES = []
for (let cy = 0; cy < 5; cy++) {
  for (let cx = 0; cx < 5; cx++) {
    const m = caseVersMonde(ISO(32, 16), cx, cy)
    CASES.push({ cx, cy, x: m.x, y: m.y })
  }
}
const CASES_POS = CASES.map(({ cx, cy }) => ({ cx, cy }))

/* La table de reference des pixels : ce que chaque portage doit retrouver.
 * `PIXELS_POS` ne porte que les coordonnees : on l'insere dans du Python et du
 * Rust, ou `null` ne s'ecrit pas comme en JavaScript. */
const PIXELS = []
for (let i = 0; i < PLANCHE.dessins.length; i++) {
  for (let y = 0; y < PLANCHE.hauteurCase; y++) {
    for (let x = 0; x < PLANCHE.largeurCase; x++) {
      const c = PLANCHE.dessins[i][y][x]
      PIXELS.push({ i, x, y, couleur: c === '.' ? null : PLANCHE.cle[c] })
    }
  }
}
const PIXELS_POS = PIXELS.map(({ i, x, y }) => ({ i, x, y }))
const json = versTexte(projet)
const dir = mkdtempSync(join(tmpdir(), 'pfe-lang-'))
writeFileSync(join(dir, 'projet.json'), json)

console.log('--- ce qui est reellement execute ---')

/* Python : on charge et on compare les valeurs, une a une. */
if (dispo('python3')) {
  writeFileSync(join(dir, 'projet_charge.py'), chargeur('python', projet))
  writeFileSync(join(dir, 'essai.py'), `
import json, sys
sys.path.insert(0, ${JSON.stringify(dir)})
from projet_charge import Projet, Espece, VIDE

p = Projet.charger(${JSON.stringify(join(dir, 'projet.json'))})
c = p.cartes[0]
cases = c.deplier_cases(c.calques[0])
sortie = {
    "version": p.version,
    "nom": p.nom,
    "vue": [p.vue["largeur"], p.vue["hauteur"]],
    "couleurs": p.palette["couleurs"],
    "taille": [c.largeur, c.hauteur, c.tuile],
    "mur_en_1_1": cases[1 * c.largeur + 1],
    "vide_en_0_0": cases[0] == VIDE,
    "solide_1_1": c.est_solide(1, 1),
    "solide_0_0": c.est_solide(0, 0),
    "solide_hors": c.est_solide(-1, 0),
    "heros": [p.scenes[0]["racine"].enfants[0].nom,
              p.scenes[0]["racine"].enfants[0].x,
              p.scenes[0]["racine"].enfants[0].y],
    "clips": [a.nom for a in p.animations],
    "suite_attaque": p.clip("attaque").suite,
    "evenements_marche": p.clip("marche").evenements,
    "images": [p.clip(e["clip"]).image_a(e["ms"]) for e in ${JSON.stringify(TABLE)}],
    "planches": [t.nom for t in p.planches],
    "case": [p.planche("essai").largeurCase, p.planche("essai").hauteurCase],
    "pixels": [p.planche("essai").pixel(e["i"], e["x"], e["y"]) for e in ${JSON.stringify(PIXELS_POS)}],
    "projection": p.projection.mode,
    "especes": [f"{e.id}:{e.comportement}:{e.degats}:{e.soigne}" for e in p.especes],
    "especeDuHeros": (p.espece_du_noeud(p.scenes[0]["racine"].enfants[0]) or Espece(id="?")).id,
    "cases": [list(p.projection.case_vers_monde(e["cx"], e["cy"])) for e in ${JSON.stringify(CASES_POS)}],
}
print(json.dumps(sortie))
`)
  const r = spawnSync('python3', [join(dir, 'essai.py')], { encoding: 'utf8' })
  if (r.status !== 0) {
    check('le chargeur Python tourne', false, (r.stderr || '').trim().split('\n').pop())
  } else {
    const v = JSON.parse(r.stdout)
    check('le chargeur Python tourne et lit le projet', true, `version ${v.version}, « ${v.nom} »`)
    check('Python retrouve la vue et la palette',
      v.vue[0] === 320 && v.vue[1] === 180 && v.couleurs.length === 2,
      `${v.vue.join('x')}, ${v.couleurs.join(' ')}`)
    check('Python retrouve la tuile posee par l\'autotiling',
      v.mur_en_1_1 === mur.cases[carte.index(1, 1)],
      `${v.mur_en_1_1} des deux cotes`)
    check('Python voit le vide comme VIDE, et non comme la tuile zero',
      v.vide_en_0_0 === true, 'la confusion la plus facile du format')
    check('Python retrouve la collision, dehors compris',
      v.solide_1_1 === true && v.solide_0_0 === false && v.solide_hors === true)
    check('Python retrouve le noeud et sa position',
      v.heros[0] === 'heros' && v.heros[1] === 40 && v.heros[2] === 32, v.heros.join(' '))
    check('Python retrouve le catalogue des especes, et celle que porte un noeud',
      v.especes.join(' ') === ESPECES.map((e) => `${e.id}:${e.comportement}:${e.degats}:${e.soigne}`).join(' ')
      && v.especeDuHeros === 'gelee',
      `${v.especes.join(', ')} · le noeud « heros » est une ${v.especeDuHeros}`)
    check('Python retrouve les clips, leur suite et leurs evenements',
      v.clips.join(',') === CLIPS.map((c) => c.nom).join(',')
      && v.suite_attaque === 'marche' && v.evenements_marche.length === 2,
      `${v.clips.join(', ')} · suite « ${v.suite_attaque} »`)
    const ecartsPixels = PIXELS.filter((e, i) => (v.pixels[i] ?? null) !== e.couleur)
    check('Python retrouve la planche, ses cases non carrees et chacun de ses pixels',
      v.planches.join(',') === 'essai' && v.case[0] === 3 && v.case[1] === 4
      && ecartsPixels.length === 0,
      ecartsPixels.length
        ? `${ecartsPixels.length} pixels faux sur ${PIXELS.length}`
        : `${PIXELS.length} pixels, vide compris`)
    const ecartsCases = CASES.filter((e, i) => v.cases[i][0] !== e.x || v.cases[i][1] !== e.y)
    check('Python place chaque case isometrique la ou le moteur la place',
      v.projection === 'isometrique' && ecartsCases.length === 0,
      ecartsCases.length
        ? `${ecartsCases.length} cases decalees, ex. ${ecartsCases[0].cx},${ecartsCases[0].cy}`
        : `${CASES.length} cases — la demi-largeur du losange comprise`)
    const ecarts = TABLE.filter((e, i) => v.images[i] !== e.image)
    check('Python rend EXACTEMENT la meme image que le moteur, instant par instant',
      ecarts.length === 0,
      ecarts.length
        ? `${ecarts.length} ecarts sur ${TABLE.length}, ex. ${ecarts[0].clip} a ${ecarts[0].ms} ms`
        : `${TABLE.length} instants, boucle, aller-retour et clip unique compris`)
  }
} else {
  check('python3 est disponible', false, 'chargeur Python non eprouve')
}

/* Rust : on compile, ET on execute la logique d'animation.
 *
 * Serde n'est pas installe ici, donc on retire les derives et la fonction qui
 * s'en sert : le JSON ne peut pas etre lu. Mais la ou deux portages divergent,
 * ce n'est pas la lecture du JSON — c'est la REGLE. On construit donc les
 * clips directement en Rust et l'on compare la table, valeur par valeur, a
 * celle du moteur. Compiler seulement aurait laisse passer un aller-retour qui
 * repete ses extremites, ou un modulo pose au mauvais endroit. */
if (dispo('rustc')) {
  const brut = chargeur('rust', projet)
  const sansSerde = brut
    .replace(/use serde::Deserialize;\n/g, '')
    .replace(/#\[derive\(Debug, Clone, Deserialize\)\]/g, '#[derive(Debug, Clone)]')
    .replace(/^[ \t]*#\[serde\([^\]]*\)\]\n/gm, '')
    .replace(/impl Projet \{[\s\S]*?\n\}\n/, '')

  const enRust = (c) => `Clip {
        nom: ${JSON.stringify(c.nom)}.to_string(),
        boucle: ${JSON.stringify(c.boucle)}.to_string(),
        suite: None,
        images: vec![${c.images.map((i) => `ImageAnim { index: ${i.index}, duree: ${i.duree}, decalage_x: 0, decalage_y: 0 }`).join(', ')}],
        evenements: vec![],
    }`
  const enRustPlanche = (t) => `Planche {
        nom: ${JSON.stringify(t.nom)}.to_string(),
        largeur_case: ${t.largeurCase},
        hauteur_case: ${t.hauteurCase},
        colonnes: ${t.colonnes},
        cle: [${Object.entries(t.cle).map(([k, v]) => `(${JSON.stringify(k)}.to_string(), ${JSON.stringify(v)}.to_string())`).join(', ')}]
            .into_iter().collect(),
        dessins: vec![${t.dessins.map((d) => `vec![${d.map((l) => `${JSON.stringify(l)}.to_string()`).join(', ')}]`).join(', ')}],
    }`
  const main = `
fn projection() -> Projection {
    Projection {
        mode: "isometrique".to_string(),
        regard: "dessus".to_string(),
        largeur_tuile: 32,
        hauteur_tuile: 16,
        hauteur_bloc: 16,
    }
}

fn planche() -> Planche {
    ${enRustPlanche(PLANCHE)}
}

fn clips() -> Vec<Clip> {
    vec![${CLIPS.map(enRust).join(', ')}]
}

fn main() {
    let cs = clips();
    let table: Vec<(usize, i64)> = vec![${TABLE.map((e) => `(${CLIPS.findIndex((c) => c.nom === e.clip)}, ${e.ms})`).join(', ')}];
    let sortie: Vec<String> = table.iter().map(|(i, ms)| cs[*i].image_a(*ms).to_string()).collect();
    println!("{}", sortie.join(","));

    let t = planche();
    let pixels: Vec<(usize, usize, usize)> = vec![${PIXELS_POS.map((e) => `(${e.i}, ${e.x}, ${e.y})`).join(', ')}];
    let couleurs: Vec<String> = pixels
        .iter()
        .map(|(i, x, y)| t.pixel(*i, *x, *y).cloned().unwrap_or_else(|| "-".to_string()))
        .collect();
    println!("{}", couleurs.join(","));

    let proj = projection();
    let cases: Vec<(i32, i32)> = vec![${CASES_POS.map((e) => `(${e.cx}, ${e.cy})`).join(', ')}];
    let places: Vec<String> = cases
        .iter()
        .map(|(cx, cy)| { let (x, y) = proj.case_vers_monde(*cx, *cy); format!("{}:{}", x, y) })
        .collect();
    println!("{}", places.join(","));
}
`
  const f = join(dir, 'projet_rs.rs')
  writeFileSync(f, `${sansSerde}${main}`)
  const r = spawnSync('rustc', ['--edition', '2021', '--out-dir', dir, f], { encoding: 'utf8' })
  check('le chargeur Rust compile', r.status === 0,
    r.status === 0 ? 'structures, acces et regle d\'animation ; serde retire faute de crate'
      : (r.stderr || '').split('\n').filter((l) => l.startsWith('error')).slice(0, 2).join(' | '))
  if (r.status === 0) {
    const e = spawnSync(join(dir, 'projet_rs'), { encoding: 'utf8' })
    const lignes = (e.stdout || '').trim().split('\n')
    const rendus = (lignes[0] || '').split(',').map(Number)
    const ecarts = TABLE.filter((t, i) => rendus[i] !== t.image)
    check('Rust rend EXACTEMENT la meme image que le moteur, instant par instant',
      e.status === 0 && rendus.length === TABLE.length && ecarts.length === 0,
      ecarts.length
        ? `${ecarts.length} ecarts, ex. ${ecarts[0].clip} a ${ecarts[0].ms} ms`
        : `${TABLE.length} instants`)
    const couleurs = (lignes[1] || '').split(',')
    const ecartsPixels = PIXELS.filter((q, i) => (couleurs[i] === '-' ? null : couleurs[i]) !== q.couleur)
    check('Rust retrouve chacun des pixels de la planche',
      ecartsPixels.length === 0,
      ecartsPixels.length
        ? `${ecartsPixels.length} faux sur ${PIXELS.length}, ex. dessin ${ecartsPixels[0].i} en ${ecartsPixels[0].x},${ecartsPixels[0].y}`
        : `${PIXELS.length} pixels, vide compris`)
    const places = (lignes[2] || '').split(',')
    const ecartsCases = CASES.filter((q, i) => places[i] !== `${q.x}:${q.y}`)
    check('Rust place chaque case isometrique la ou le moteur la place',
      ecartsCases.length === 0,
      ecartsCases.length
        ? `${ecartsCases.length} decalees, ex. ${ecartsCases[0].cx},${ecartsCases[0].cy} attendue en ${ecartsCases[0].x}:${ecartsCases[0].y}, obtenue ${places[CASES.indexOf(ecartsCases[0])]}`
        : `${CASES.length} cases`)
  }
} else {
  check('rustc est disponible', false, 'chargeur Rust non eprouve')
}

/* TypeScript : le compilateur du projet lui-meme, puis l'execution. */
{
  const f = join(dir, 'projet_charge.ts')
  writeFileSync(f, chargeur('typescript', projet))
  const r = spawnSync('node_modules/.bin/tsc', ['--noEmit', '--strict',
    '--target', 'ES2022', '--lib', 'ES2022', '--moduleResolution', 'bundler',
    '--module', 'ESNext', f], { encoding: 'utf8' })
  check('le chargeur TypeScript passe le compilateur en mode strict',
    r.status === 0, r.status === 0 ? '' : (r.stdout || '').split('\n')[0])

  // Compiler n'est pas tourner. Le chargeur genere est un fichier a part, sans
  // aucun lien avec le moteur : s'il repond la meme chose, c'est que la regle
  // a bien traverse.
  const essai = join(dir, 'essai_ts.mjs')
  writeFileSync(essai, `
import { readFileSync } from 'node:fs'
const m = await import(${JSON.stringify(f)})
const p = m.chargerProjet(readFileSync(${JSON.stringify(join(dir, 'projet.json'))}, 'utf8'))
const table = ${JSON.stringify(TABLE)}
const images = table.map((e) => m.imageA(m.clipNomme(p, e.clip), e.ms))
const pixels = ${JSON.stringify(PIXELS_POS)}.map(
  (e) => m.pixelDePlanche(m.plancheNommee(p, 'essai'), e.i, e.x, e.y))
const cases = ${JSON.stringify(CASES_POS)}.map((e) => m.caseVersMonde(p.projection, e.cx, e.cy))
console.log(JSON.stringify({
  clips: p.animations.map((a) => a.nom),
  images,
  pixels,
  cases,
  tuileEn11: m.deplierCases(p.cartes[0], p.cartes[0].calques[0])[1 * p.cartes[0].largeur + 1],
}))
`)
  const e = spawnSync('node', ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', essai],
    { encoding: 'utf8' })
  if (e.status !== 0) {
    check('le chargeur TypeScript tourne', false, (e.stderr || '').trim().split('\n').pop())
  } else {
    const v = JSON.parse(e.stdout)
    check('le chargeur TypeScript tourne et lit le projet exporte',
      v.clips.join(',') === CLIPS.map((c) => c.nom).join(',')
      && v.tuileEn11 === mur.cases[carte.index(1, 1)],
      `${v.clips.length} clips, tuile ${v.tuileEn11} en 1,1`)
    const ecartsPixels = PIXELS.filter((e, i) => (v.pixels[i] ?? null) !== e.couleur)
    check('TypeScript retrouve chacun des pixels de la planche',
      ecartsPixels.length === 0,
      ecartsPixels.length ? `${ecartsPixels.length} faux` : `${PIXELS.length} pixels`)
    const ecartsCases = CASES.filter((e, i) => v.cases[i].x !== e.x || v.cases[i].y !== e.y)
    check('TypeScript place chaque case isometrique la ou le moteur la place',
      ecartsCases.length === 0,
      ecartsCases.length ? `${ecartsCases.length} decalees` : `${CASES.length} cases`)
    const ecarts = TABLE.filter((t, i) => v.images[i] !== t.image)
    check('TypeScript rend EXACTEMENT la meme image que le moteur, instant par instant',
      ecarts.length === 0,
      ecarts.length ? `${ecarts.length} ecarts, ex. ${ecarts[0].clip} a ${ecarts[0].ms} ms`
        : `${TABLE.length} instants`)
  }
}

console.log('\n--- ce qui n\'est PAS execute, faute d\'interprete ici ---')

for (const [cible, marqueurs] of [
  ['csharp', ['class Projet', 'public const int VIDE = -1', 'DeplierCases', 'namespace PixelForge',
    'class Clip', 'public int ImageA(int ms)', 'OrdreDeLecture', 'aller-retour',
    'class Planche', 'public string Pixel(int index, int x, int y)',
    'class Projection', 'public void CaseVersMonde',
    'class Espece', 'public string comportement']],
  ['gdscript', ['class_name ProjetPixelForge', 'const VIDE := -1', 'static func charger', 'deplier_cases',
    'static func image_a', 'static func ordre_de_lecture', 'aller-retour',
    'static func pixel_de_planche', 'func planche(', 'static func case_vers_monde',
    'func espece(', 'static func comportement_de', 'func espece_du_noeud']],
  ['lua', ['Projet.VIDE = -1', 'function Projet.depuis', 'deplier_cases', 'est_solide',
    'function Projet.image_a', 'function Projet.ordre_de_lecture', 'aller-retour',
    'function Projet.pixel_de_planche', 'function Projet:planche(',
    'function Projet.case_vers_monde', 'function Projet:espece(',
    'function Projet.comportement_de']],
]) {
  const src = chargeur(cible, projet)
  const manquants = marqueurs.filter((m) => !src.includes(m))
  const nom = CIBLES.find((c) => c.id === cible)?.nom ?? cible
  check(`${nom} porte ses symboles attendus`, manquants.length === 0,
    manquants.length ? `manque : ${manquants.join(', ')}`
      : `${src.split('\n').length} lignes — NON execute, aucun interprete installe`)
}

check('chaque cible annoncee produit un chargeur non vide',
  CIBLES.every((c) => chargeur(c.id, projet).length > 400), `${CIBLES.length} cibles`)

console.log('\n--- les paquets Godot et Unity ---')

{
  const { paquetGodot, paquetUnity, PAQUETS } = await import('../src/export/moteurs.ts')
  const { zipper, crc32, versOctets } = await import('../src/export/paquet.ts')
  const { encoderPng, planchePixels } = await import('../src/export/png.ts')

  // Le CRC-32, d'abord : c'est lui qui decide si une archive s'ouvre, et il
  // sert aussi aux morceaux du PNG. Une valeur connue vaut mieux qu'un
  // sentiment — celle de « 123456789 » est publiee avec le format.
  check('le CRC-32 rend la valeur de reference',
    crc32(versOctets('123456789')) === 0xcbf43926,
    `0x${crc32(versOctets('123456789')).toString(16)} — la valeur publiee avec le format`)

  // Le PNG : sa structure se relit sans bibliotheque.
  {
    const img = planchePixels(
      [['ab', '.a'], ['ba', 'b.']], { a: '#ff0000', b: '#00ff00' }, 2, 2, 1)
    const png = encoderPng(img.largeur, img.hauteur, img.pixels)
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    check('le PNG porte sa signature', signature.every((v, i) => png[i] === v))

    // Chaque morceau porte son CRC, calcule sur le TYPE et les donnees — pas
    // sur la longueur. C'est la faute la plus courante quand on ecrit un PNG a
    // la main, et elle rend le fichier illisible sans rien expliquer.
    let i = 8
    const types = []
    let fautifs = 0
    const vue = new DataView(png.buffer, png.byteOffset, png.byteLength)
    while (i < png.length) {
      const n = vue.getUint32(i, false)
      const type = String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7])
      types.push(type)
      const couvert = png.subarray(i + 4, i + 8 + n)
      if (vue.getUint32(i + 8 + n, false) !== crc32(couvert)) fautifs++
      i += 12 + n
    }
    check('ses morceaux sont dans l\'ordre et leurs CRC tombent juste',
      types.join(',') === 'IHDR,IDAT,IEND' && fautifs === 0,
      `${types.join(', ')} — ${fautifs} CRC faux`)

    // Et le sens inverse : un CRC calcule sur la longueur en plus est faux.
    const faux = crc32(png.subarray(8, 8 + 4 + 13))
    check('un CRC qui engloberait la longueur serait different',
      faux !== vue.getUint32(8 + 8 + 13, false),
      'c\'est exactement la faute que la verification ci-dessus attrape')

    check('l\'image fait la taille annoncee',
      vue.getUint32(16, false) === 2 && vue.getUint32(20, false) === 4,
      `${vue.getUint32(16, false)}x${vue.getUint32(20, false)} pour 1 colonne de 2 dessins`)
  }

  // L'archive : on la relit avec son propre repertoire central.
  {
    const entrees = [
      { chemin: 'a.txt', contenu: versOctets('bonjour') },
      { chemin: 'd/b.json', contenu: versOctets('{"x":1}') },
    ]
    const z = zipper(entrees)
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength)
    // La fin du repertoire central est le dernier bloc de vingt-deux octets.
    const fin = z.length - 22
    check('l\'archive porte sa signature de fin et le bon compte',
      v.getUint32(fin, true) === 0x06054b50 && v.getUint16(fin + 10, true) === 2,
      `${v.getUint16(fin + 10, true)} entrées`)
    check('et chaque entree porte sa signature locale',
      v.getUint32(0, true) === 0x04034b50)

    // Reproductible : deux exports du meme projet donnent le meme octet. Sans
    // date figee, impossible de dire si un export a change quelque chose.
    const encore = zipper(entrees)
    check('deux archives du meme contenu sont identiques octet pour octet',
      z.length === encore.length && z.every((o, i) => o === encore[i]),
      'la date est figee : un horodatage rendrait tout export different')
  }

  // Le paquet Godot : ce qu'il reference doit exister.
  for (const [nom, entrees] of [['Godot', paquetGodot(projet)], ['Unity', paquetUnity(projet)]]) {
    const chemins = new Set(entrees.map((e) => e.chemin))
    const texte = new TextDecoder()
    const manquants = []
    for (const e of entrees) {
      if (/\.(png|zip)$/.test(e.chemin)) continue
      const contenu = texte.decode(e.contenu)
      // Tout chemin cite dans un fichier engendre doit se trouver dans le
      // paquet. Une reference cassee est la faute la plus courante d'un
      // generateur de projet, et la seule qu'on decouvre a l'ouverture.
      for (const m of contenu.matchAll(/res:\/\/([\w./%-]+)/g)) {
        // Un chemin construit a l'execution — « planches/%s.png » — ne peut
        // pas etre verifie ici. On le laisse passer plutot que de l'accuser a
        // tort : c'est le nom de la planche qui le complete, et le projet.json
        // dit deja quelles planches existent.
        if (m[1].includes('%')) continue
        if (!chemins.has(m[1])) manquants.push(`${e.chemin} -> res://${m[1]}`)
      }
    }
    check(`${nom} : tout chemin cite existe dans le paquet`,
      manquants.length === 0,
      manquants.length ? manquants.slice(0, 2).join(' | ')
        : `${entrees.length} fichiers, ${chemins.size} chemins`)

    const json = entrees.find((e) => e.chemin === 'projet.json')
    let lu = null
    try { lu = JSON.parse(texte.decode(json.contenu)) } catch { /* reste null */ }
    check(`${nom} : son projet.json se relit`,
      lu !== null && lu.version === projet.version && lu.especes.length === projet.especes.length,
      lu ? `version ${lu.version}, ${lu.especes.length} espèces` : 'illisible')

    // Le chemin « planches/%s.png » se complete a l'execution avec le nom de
    // la planche. On verifie donc que chaque nom du projet a bien son fichier :
    // c'est la seule facon de savoir que ce chemin construit tombera juste.
    const pngs = new Set(entrees
      .filter((e) => e.chemin.endsWith('.png'))
      .map((e) => e.chemin.replace('planches/', '').replace('.png', '')))
    const sansImage = projet.planches.filter((t) => !pngs.has(t.nom))
    check(`${nom} : chaque planche du projet a son PNG, sous son nom`,
      sansImage.length === 0 && pngs.size === projet.planches.length,
      sansImage.length ? `manque : ${sansImage.map((t) => t.nom).join(', ')}`
        : `${[...pngs].join(', ')}`)
  }

  // Les entites remontees : c'est ce qui rend le paquet Unity lisible par
  // JsonUtility, qui ne sait pas lire un dictionnaire libre.
  {
    const racine = projet.scenes[0].racine
    const portees = []
    const parcourir = (n) => { if (n.espece) portees.push(n.espece); (n.enfants ?? []).forEach(parcourir) }
    parcourir(racine)
    check('l\'espece et l\'image sont remontees a cote des champs communs',
      portees.length > 0 && racine.enfants[0].espece === 'gelee'
      && typeof racine.enfants[0].image === 'number'
      && racine.enfants[0].proprietes.espece === undefined,
      'et pas dupliquees : deux endroits pour une valeur, c\'est un jour ou ils divergent')
  }

  check('chaque paquet annonce est produit', PAQUETS.length === 2,
    PAQUETS.map((q) => q.nom).join(', '))
}

console.log('\n--- Tiled, dans les deux sens ---')

{
  const { versTiled, depuisTiled, estDuTiled } = await import('../src/export/tiled.ts')
  const { VIDE } = await import('../src/tuiles/tilemap.ts')
  const { ORTHO_DESSUS, ISO } = await import('../src/noyau/projection.ts')

  const t = versTiled(carte, {
    projection: ORTHO_DESSUS(16),
    planche: { nom: 'donjon', image: 'donjon.png', colonnes: 8, nombre: 49 },
  })

  check('la sortie est reconnue comme du Tiled', estDuTiled(t))
  check('elle porte la planche, ses dimensions et son image',
    t.tilesets[0].image === 'donjon.png' && t.tilesets[0].columns === 8,
    `${t.tilesets[0].name}, ${t.tilesets[0].tilecount} tuiles`)

  // Le piege : Tiled compte a partir de UN, et reserve zero au vide.
  const premierCalque = t.layers[0]
  const posee = carte.calques[0].cases[carte.index(1, 1)]
  check('le vide devient zero et la premiere tuile devient un',
    premierCalque.data[0] === 0 && premierCalque.data[carte.index(1, 1)] === posee + 1,
    `notre ${posee} sort en ${premierCalque.data[carte.index(1, 1)]}`)

  // La collision part en calque d'objets : Tiled n'a pas de grille dediee.
  const collision = t.layers.find((l) => l.type === 'objectgroup')
  check('la collision sort en rectangles, lisibles par n\'importe quel moteur',
    collision && collision.objects.length === 2,
    `${collision?.objects.length ?? 0} rectangles pour 2 cases solides`)

  // L'aller-retour complet.
  const r = depuisTiled(t)
  check('une carte exportee puis reimportee est identique',
    r.carte.calques[0].cases.every((v, i) => v === carte.calques[0].cases[i]),
    'tuile par tuile')
  check('et sa collision aussi',
    [...r.carte.solides].every((v, i) => v === carte.solides[i]))
  check('sans avertissement sur un cas simple', r.avertissements.length === 0,
    r.avertissements.join(' ; ') || 'aucun')

  // Les bits de retournement de Tiled : sans masque, un index astronomique.
  const trafique = JSON.parse(JSON.stringify(t))
  trafique.layers[0].data[carte.index(1, 1)] |= 0x80000000
  const r2 = depuisTiled(trafique)
  check('une tuile retournee par Tiled est lue sans son bit de poids fort',
    r2.carte.calques[0].cases[carte.index(1, 1)] === posee,
    'sans le masque, elle ressortirait en index astronomique')

  // Les avertissements servent a quelque chose : on les provoque.
  const infinie = { ...t, infinite: true }
  check('une carte infinie est signalee',
    depuisTiled(infinie).avertissements.some((a) => a.includes('infinie')))
  const deuxPlanches = { ...t, tilesets: [t.tilesets[0], { ...t.tilesets[0], firstgid: 100 }] }
  check('plusieurs planches sont signalees',
    depuisTiled(deuxPlanches).avertissements.some((a) => a.includes('planches')))
  const sansCalque = { ...t, layers: t.layers.filter((l) => l.type !== 'tilelayer') }
  check('une carte sans calque de tuiles est signalee',
    depuisTiled(sansCalque).avertissements.some((a) => a.includes('aucun calque')))

  // L'orientation fait l'aller-retour.
  const iso = versTiled(carte, {
    projection: ISO(32, 16),
    planche: { nom: 'd', image: 'd.png', colonnes: 8, nombre: 49 },
  })
  check('une carte isometrique sort en `isometric` et revient isometrique',
    iso.orientation === 'isometric' && depuisTiled(iso).mode === 'isometrique',
    `${iso.orientation} — hauteur de tuile ${iso.tileheight}`)

  check('le vide se relit VIDE, et non tuile zero',
    r.carte.calques[0].cases[0] === VIDE, 'la confusion la plus couteuse du format')
}

console.log('\n--- LDtk, dans les deux sens ---')

{
  const { versLdtk, depuisLdtk, estDuLdtk } = await import('../src/export/ldtk.ts')
  const { VIDE } = await import('../src/tuiles/tilemap.ts')

  const l = versLdtk('salle_un', carte, { colonnes: 8, monde: { x: 256, y: 0 } })
  check('la sortie est reconnue comme du LDtk', estDuLdtk(l))
  check('le niveau porte sa place dans le monde',
    l.levels[0].worldX === 256 && l.levels[0].pxWid === carte.largeur * carte.tuile,
    `${l.levels[0].pxWid}x${l.levels[0].pxHei} en (${l.levels[0].worldX}, ${l.levels[0].worldY})`)

  // La collision part en IntGrid : c'est la structure prevue pour, et celle
  // dont LDtk se sert lui-meme pour ses regles automatiques.
  const intGrid = l.levels[0].layerInstances.find((c) => c.__type === 'IntGrid')
  check('la collision sort en IntGrid', !!intGrid && intGrid.intGridCsv.filter(Boolean).length === 2,
    `${intGrid?.intGridCsv.filter(Boolean).length} cases a 1`)

  // Les tuiles portent leur position dans la planche : sans elle, LDtk
  // afficherait la premiere tuile partout.
  const tuiles = l.levels[0].layerInstances.find((c) => c.__type === 'Tiles')
  const posee = carte.calques[0].cases[carte.index(1, 1)]
  const t11 = tuiles.gridTiles.find((t) => t.px[0] === carte.tuile && t.px[1] === carte.tuile)
  check('chaque tuile porte sa position source dans la planche',
    t11 && t11.src[0] === (posee % 8) * carte.tuile
       && t11.src[1] === Math.floor(posee / 8) * carte.tuile,
    `tuile ${posee} -> src ${t11?.src.join(',')}`)
  check('et le vide n\'occupe aucune entree',
    tuiles.gridTiles.length === carte.calques[0].cases.filter((v) => v !== VIDE).length,
    `${tuiles.gridTiles.length} tuiles posees`)

  // L'aller-retour.
  const r = depuisLdtk(l)
  check('un niveau exporte puis reimporte garde ses tuiles',
    r.cartes[0].carte.calques[0].cases.every((v, i) => v === carte.calques[0].cases[i]),
    'tuile par tuile')
  check('et sa collision', [...r.cartes[0].carte.solides].every((v, i) => v === carte.solides[i]))
  check('et sa place dans le monde',
    r.cartes[0].monde.x === 256, `x=${r.cartes[0].monde.x}`)
  check('sans avertissement sur un cas simple', r.avertissements.length === 0,
    r.avertissements.join(' ; ') || 'aucun')

  // Ce qu'on ne sait PAS faire doit etre dit, pas tu.
  const avecEntites = JSON.parse(JSON.stringify(l))
  avecEntites.levels[0].layerInstances.push({
    __identifier: 'Entites', __type: 'Entities', __cWid: 5, __cHei: 3,
    __gridSize: 16, entityInstances: [{}],
  })
  check('les entites non importees sont signalees',
    depuisLdtk(avecEntites).avertissements.some((a) => a.includes('entites')))

  const avecRetourne = JSON.parse(JSON.stringify(l))
  avecRetourne.levels[0].layerInstances.find((c) => c.__type === 'Tiles').gridTiles[0].f = 1
  check('une tuile retournee est signalee comme non conservee',
    depuisLdtk(avecRetourne).avertissements.some((a) => a.includes('retournee')))

  const plusieursValeurs = JSON.parse(JSON.stringify(l))
  const ig = plusieursValeurs.levels[0].layerInstances.find((c) => c.__type === 'IntGrid')
  ig.intGridCsv[0] = 2
  ig.intGridCsv[1] = 3
  check('plusieurs matieres de grille ramenees a « solide » sont signalees',
    depuisLdtk(plusieursValeurs).avertissements.some((a) => a.includes('solide')))

  check('un projet sans niveau est signale',
    depuisLdtk({ jsonVersion: '1.5.3', defaultGridSize: 16, levels: [] })
      .avertissements.some((a) => a.includes('aucun niveau')))
}

rmSync(dir, { recursive: true, force: true })
void existsSync

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
