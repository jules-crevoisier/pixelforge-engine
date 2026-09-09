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

const projet = serialiserProjet(
  'demo', { largeur: 320, hauteur: 180 },
  new Palette('donjon', ['#14101a', '#7a7466'].map(depuisHex)),
  [{ nom: 'salle', carte }], [{ nom: 'principale', racine }],
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
  }
} else {
  check('python3 est disponible', false, 'chargeur Python non eprouve')
}

/* Rust : on compile. Serde n'est pas installe, donc on retire les derives et
 * la fonction qui s'en sert — ce qui reste est la ou l'on se trompe vraiment,
 * c'est-a-dire la forme des structures et la logique des acces. */
if (dispo('rustc')) {
  const brut = chargeur('rust', projet)
  const sansSerde = brut
    .replace(/use serde::Deserialize;\n/g, '')
    .replace(/#\[derive\(Debug, Clone, Deserialize\)\]/g, '#[derive(Debug, Clone)]')
    .replace(/\s*#\[serde\(rename = "type"\)\]/g, '')
    .replace(/impl Projet \{[\s\S]*?\n\}\n/, '')
  const f = join(dir, 'projet.rs')
  writeFileSync(f, sansSerde)
  const r = spawnSync('rustc', ['--edition', '2021', '--crate-type', 'lib',
    '--out-dir', dir, f], { encoding: 'utf8' })
  check('le chargeur Rust compile', r.status === 0,
    r.status === 0 ? 'structures et acces, serde retire faute de crate'
      : (r.stderr || '').split('\n').filter((l) => l.startsWith('error')).slice(0, 2).join(' | '))
} else {
  check('rustc est disponible', false, 'chargeur Rust non eprouve')
}

/* TypeScript : le compilateur du projet lui-meme. */
{
  const f = join(dir, 'projet_charge.ts')
  writeFileSync(f, chargeur('typescript', projet))
  const r = spawnSync('node_modules/.bin/tsc', ['--noEmit', '--strict',
    '--target', 'ES2022', '--lib', 'ES2022', '--moduleResolution', 'bundler',
    '--module', 'ESNext', f], { encoding: 'utf8' })
  check('le chargeur TypeScript passe le compilateur en mode strict',
    r.status === 0, r.status === 0 ? '' : (r.stdout || '').split('\n')[0])
}

console.log('\n--- ce qui n\'est PAS execute, faute d\'interprete ici ---')

for (const [cible, marqueurs] of [
  ['csharp', ['class Projet', 'public const int VIDE = -1', 'DeplierCases', 'namespace PixelForge']],
  ['gdscript', ['class_name ProjetPixelForge', 'const VIDE := -1', 'static func charger', 'deplier_cases']],
  ['lua', ['Projet.VIDE = -1', 'function Projet.depuis', 'deplier_cases', 'est_solide']],
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

rmSync(dir, { recursive: true, force: true })
void existsSync

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
