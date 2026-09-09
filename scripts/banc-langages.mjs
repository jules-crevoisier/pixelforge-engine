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

const projet = serialiserProjet(
  'demo', { largeur: 320, hauteur: 180 },
  new Palette('donjon', ['#14101a', '#7a7466'].map(depuisHex)),
  [{ nom: 'salle', carte }], [{ nom: 'principale', racine }],
  CLIPS,
)
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
from projet_charge import Projet, VIDE

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
    check('Python retrouve les clips, leur suite et leurs evenements',
      v.clips.join(',') === CLIPS.map((c) => c.nom).join(',')
      && v.suite_attaque === 'marche' && v.evenements_marche.length === 2,
      `${v.clips.join(', ')} · suite « ${v.suite_attaque} »`)
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
  const main = `
fn clips() -> Vec<Clip> {
    vec![${CLIPS.map(enRust).join(', ')}]
}

fn main() {
    let cs = clips();
    let table: Vec<(usize, i64)> = vec![${TABLE.map((e) => `(${CLIPS.findIndex((c) => c.nom === e.clip)}, ${e.ms})`).join(', ')}];
    let sortie: Vec<String> = table.iter().map(|(i, ms)| cs[*i].image_a(*ms).to_string()).collect();
    println!("{}", sortie.join(","));
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
    const rendus = (e.stdout || '').trim().split(',').map(Number)
    const ecarts = TABLE.filter((t, i) => rendus[i] !== t.image)
    check('Rust rend EXACTEMENT la meme image que le moteur, instant par instant',
      e.status === 0 && rendus.length === TABLE.length && ecarts.length === 0,
      ecarts.length
        ? `${ecarts.length} ecarts, ex. ${ecarts[0].clip} a ${ecarts[0].ms} ms`
        : `${TABLE.length} instants`)
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
console.log(JSON.stringify({
  clips: p.animations.map((a) => a.nom),
  images,
  cases: m.deplierCases(p.cartes[0], p.cartes[0].calques[0])[1 * p.cartes[0].largeur + 1],
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
      && v.cases === mur.cases[carte.index(1, 1)],
      `${v.clips.length} clips, tuile ${v.cases} en 1,1`)
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
    'class Clip', 'public int ImageA(int ms)', 'OrdreDeLecture', 'aller-retour']],
  ['gdscript', ['class_name ProjetPixelForge', 'const VIDE := -1', 'static func charger', 'deplier_cases',
    'static func image_a', 'static func ordre_de_lecture', 'aller-retour']],
  ['lua', ['Projet.VIDE = -1', 'function Projet.depuis', 'deplier_cases', 'est_solide',
    'function Projet.image_a', 'function Projet.ordre_de_lecture', 'aller-retour']],
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
