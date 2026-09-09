/**
 * Les dessins de la demonstration, en lettres.
 *
 * Une lettre par couleur, le point pour le vide. C'est lisible dans un diff,
 * ca se relit six mois plus tard, et surtout ca ne demande aucun fichier
 * binaire pour qu'une demonstration existe : le depot reste entierement en
 * texte.
 *
 * Les tuiles de mur suivent l'ordre du jeu blob a quarante-sept, celui que
 * `MASQUES_BLOB47` calcule. Toutes ne sont pas dessinees ici — celles qui
 * manquent retombent sur la premiere, ce qui donne un mur brut mais correct.
 * Un vrai projet fournira la planche complete ; la demonstration n'en a pas
 * besoin pour montrer que la mecanique fonctionne.
 */
import {
  MASQUES_BLOB47, HAUT, BAS, GAUCHE, DROITE,
  HAUT_DROITE, BAS_DROITE, BAS_GAUCHE, HAUT_GAUCHE,
} from '../tuiles/terrain.ts'

export const TUILE = 16

export const CLE_DONJON: Record<string, string> = {
  o: '#14101a',
  s: '#26263a',
  S: '#32324a',
  m: '#5e5a52',
  M: '#7a7466',
  d: '#2b2b3c',
  y: '#f0c860',
}

/** Le sol : une dalle sombre avec quelques eclats plus clairs. */
const SOL = [
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssSSSSssssSSSSss',
  'ssSSSSssssSSSSss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'sssSSSSSSSssssss',
  'sssSSSSSSSssssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssssssssSSSSssss',
  'ssssssssSSSSssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssssSSSSssssssss',
  'ssssssssssssssss',
]

/**
 * Les tuiles de mur, generees depuis leur masque de voisinage.
 *
 * Dessiner les quarante-sept a la main serait le travail d'un artiste, et un
 * vrai projet le fera. Pour une demonstration, les generer prouve mieux : si
 * l'autotiling se trompe de masque, le mur se disloque a l'ecran au lieu de
 * passer inapercu derriere quarante-sept dessins identiques. Une premiere
 * version renvoyait le meme dessin pour les quarante-sept, et les murs
 * flottaient chacun dans son cadre sans jamais se rejoindre.
 *
 * La regle du dessin est celle d'un mur vu de dessus : un liseré sombre
 * seulement du cote ou il n'y a PAS de voisin, et un point sombre dans un coin
 * dont les deux cotes sont pleins mais dont la diagonale est vide — c'est
 * l'angle rentrant, celui qu'on voit quand deux murs se rejoignent en L.
 */
function murDepuisMasque(masque: number): string[] {
  const n = (bit: number): boolean => (masque & bit) !== 0
  const g: string[][] = []
  for (let y = 0; y < TUILE; y++) {
    const ligne: string[] = []
    for (let x = 0; x < TUILE; x++) {
      // Le corps du mur : une trame de blocs, pour qu'il ne soit pas plat.
      const brique = (y % 5 === 0) || ((x + (Math.floor(y / 5) % 2) * 4) % 8 === 0)
      ligne.push(brique ? 'm' : 'M')
    }
    g.push(ligne)
  }

  const bord = (x: number, y: number): void => { g[y][x] = 'o' }

  if (!n(HAUT)) for (let x = 0; x < TUILE; x++) bord(x, 0)
  if (!n(BAS)) for (let x = 0; x < TUILE; x++) bord(x, TUILE - 1)
  if (!n(GAUCHE)) for (let y = 0; y < TUILE; y++) bord(0, y)
  if (!n(DROITE)) for (let y = 0; y < TUILE; y++) bord(TUILE - 1, y)

  // Les angles rentrants : deux cotes pleins, la diagonale vide.
  if (n(HAUT) && n(DROITE) && !n(HAUT_DROITE)) { bord(TUILE - 1, 0) }
  if (n(BAS) && n(DROITE) && !n(BAS_DROITE)) { bord(TUILE - 1, TUILE - 1) }
  if (n(BAS) && n(GAUCHE) && !n(BAS_GAUCHE)) { bord(0, TUILE - 1) }
  if (n(HAUT) && n(GAUCHE) && !n(HAUT_GAUCHE)) { bord(0, 0) }

  return g.map((l) => l.join(''))
}

/** La sortie : une dalle gravee. */
const SORTIE = [
  'oooooooooooooooo',
  'oddddddddddddddo',
  'odssssssssssssdo',
  'odsyyyyyyyyyysdo',
  'odsyddddddddysdo',
  'odsydddyydddysdo',
  'odsyddyyyyddysdo',
  'odsyddyyyyddysdo',
  'odsydddyydddysdo',
  'odsyddddddddysdo',
  'odsyyyyyyyyyysdo',
  'odssssssssssssdo',
  'oddddddddddddddo',
  'oddddddddddddddo',
  'oddddddddddddddo',
  'oooooooooooooooo',
]

/**
 * La planche du donjon : les 47 tuiles de mur, puis le sol, puis la sortie.
 * L'index d'une tuile de mur est celui que l'autotiling calcule.
 */
export const PLANCHE_DONJON: string[][] = [
  ...MASQUES_BLOB47.map(murDepuisMasque),
  SOL,
  SORTIE,
]

export const TUILE_SOL = 47
export const TUILE_SORTIE = 48

/* ------------------------------------------------------------------ */
/* Le heros, repris de l'editeur de sprites                            */
/* ------------------------------------------------------------------ */

export const CLE_HEROS: Record<string, string> = {
  o: '#1a1420',
  h: '#8f3f2a',
  H: '#c05f38',
  s: '#e8b892',
  m: '#c08a63',
  t: '#3f6fb5',
  T: '#5a90dd',
  u: '#2c4f85',
  b: '#5a3418',
  p: '#46536f',
  P: '#5e6d8c',
  q: '#1f3468',
  B: '#2e2018',
}

/** De face. Les pieds touchent le bas de la case : c'est l'ancrage. */
const HEROS_BAS = [
  '................',
  '................',
  '....oooooo......',
  '...oHHHhhho.....',
  '..oHHHHhhhho....',
  '..oHsssssmho....',
  '..oHsossomho....',
  '..oHsssssmho....',
  '...osssssmo.....',
  '....oooooo......',
  '.ooTTTTttuuoo...',
  '.oTutTttuuqqo...',
  '.osbbbbbbmo.....',
  '..oPppppqo......',
  '..oPp..pqo......',
  '..oBB..BBo......',
]

/** De dos : la meme silhouette, la nuque a la place du visage. */
const HEROS_HAUT = [
  '................',
  '................',
  '....oooooo......',
  '...oHHHhhho.....',
  '..oHHHHhhhho....',
  '..oHhhhhhhho....',
  '..oHhhhhhhho....',
  '..oHhhhhhhho....',
  '...ohhhhhho.....',
  '....oooooo......',
  '.ooTTTTttuuoo...',
  '.oTutTttuuqqo...',
  '.osbbbbbbmo.....',
  '..oPppppqo......',
  '..oPp..pqo......',
  '..oBB..BBo......',
]

/** De profil : plus etroit, un seul bras visible. Le miroir sert l'autre cote. */
const HEROS_COTE = [
  '................',
  '................',
  '....ooooo.......',
  '...oHHHhho......',
  '..oHHhhhhho.....',
  '..oHssssmho.....',
  '..oHsossmho.....',
  '..oHssssmho.....',
  '...ossssmo......',
  '....ooooo.......',
  '..ooTTttuoo.....',
  '..oTTttuuqo.....',
  '..osbbbbmo......',
  '...oPppqo.......',
  '...oPppqo.......',
  '...oBBBo........',
]

/* ------------------------------------------------------------------ */
/* Le cycle de marche, calcule depuis la pose de repos                 */
/* ------------------------------------------------------------------ */

/**
 * Les quatre temps d'un pas, obtenus en travaillant les deux dernieres
 * rangees de la pose de repos.
 *
 * ## Pourquoi le calculer plutot que le dessiner
 *
 * Un artiste dessinera les quatre poses, et il aura raison : un vrai cycle de
 * marche demande un balancement des bras, une inclinaison du buste, un
 * ecrasement a la reception. Ce qu'on veut prouver ici est autre chose — que
 * le lecteur d'animation, les evenements et la planche se tiennent. Un cycle
 * calcule le prouve MIEUX qu'un cycle dessine : si la planche se decale d'une
 * case, la marche se disloque a l'ecran au lieu de passer inapercue derriere
 * seize dessins qui se ressemblent.
 *
 * Le cycle est contact / passage / contact / passage, le squelette de tous les
 * cycles de marche. Les deux passages ne sont pas identiques : c'est l'autre
 * pied qui se leve, sans quoi le personnage sautille au lieu de marcher.
 */
type Grille = string[][]

const enGrille = (d: string[]): Grille => d.map((l) => l.split(''))
const enDessin = (g: Grille): string[] => g.map((l) => l.join(''))

/** Les colonnes occupees par les jambes, sur les deux dernieres rangees. */
function empriseJambes(g: Grille): { c0: number; c1: number } {
  let c0 = g[0].length
  let c1 = -1
  for (const y of [g.length - 2, g.length - 1]) {
    for (let x = 0; x < g[y].length; x++) {
      if (g[y][x] === '.') continue
      if (x < c0) c0 = x
      if (x > c1) c1 = x
    }
  }
  return { c0, c1 }
}

/** Ecarte les jambes d'un pixel de chaque cote : le temps du contact. */
function ecarterJambes(g: Grille): Grille {
  const { c0, c1 } = empriseJambes(g)
  if (c1 < c0) return g
  const milieu = Math.floor((c0 + c1) / 2)
  const r = g.map((l) => [...l])
  for (const y of [g.length - 2, g.length - 1]) {
    for (let x = 0; x < g[y].length; x++) r[y][x] = '.'
    for (let x = c0; x <= c1; x++) {
      if (g[y][x] === '.') continue
      const nx = x <= milieu ? x - 1 : x + 1
      if (nx >= 0 && nx < g[y].length) r[y][nx] = g[y][x]
    }
  }
  return r
}

/**
 * Leve un pied d'un pixel : le temps du passage.
 *
 * Le pied ne disparait pas, il remonte — la botte prend la place de la
 * cheville. Effacer la rangee du bas ferait boiter le personnage.
 */
function leverPied(g: Grille, cote: 'gauche' | 'droite'): Grille {
  const { c0, c1 } = empriseJambes(g)
  if (c1 < c0) return g
  const milieu = Math.floor((c0 + c1) / 2)
  const r = g.map((l) => [...l])
  const bas = g.length - 1
  for (let x = c0; x <= c1; x++) {
    const aGauche = x <= milieu
    if (aGauche !== (cote === 'gauche')) continue
    r[bas - 1][x] = g[bas][x]
    r[bas][x] = '.'
  }
  return r
}

/**
 * Le repos, puis les quatre temps du cycle.
 *
 * Le repos est la pose d'origine, pieds joints et poses. Ce n'est aucun des
 * quatre temps : le contact a les jambes en ciseaux et le passage a un pied en
 * l'air. Prendre l'un des deux comme pose d'arret donnerait un personnage qui
 * a toujours l'air de vouloir repartir.
 */
function cycleDeMarche(dessin: string[]): string[][] {
  const base = enGrille(dessin)
  return [
    dessin,
    enDessin(ecarterJambes(base)),
    enDessin(leverPied(base, 'droite')),
    enDessin(ecarterJambes(base)),
    enDessin(leverPied(base, 'gauche')),
  ]
}

/**
 * La planche du heros : quatre directions, quatre temps chacune.
 *
 * L'index d'une image est `direction * 5 + temps`, et la planche a cinq
 * colonnes — une direction par rangee. Ranger autrement marcherait aussi, mais
 * une rangee par direction se lit d'un coup d'oeil quand on ouvre la planche,
 * et une planche qu'on ne sait pas lire est une planche ou l'on met des mois a
 * voir qu'une image est a l'envers.
 */
export const PLANCHE_HEROS: string[][] = [
  ...cycleDeMarche(HEROS_BAS),
  ...cycleDeMarche(HEROS_COTE),
  ...cycleDeMarche(HEROS_HAUT),
  ...cycleDeMarche(HEROS_COTE),
]

/** Le repos plus les quatre temps du cycle. */
export const TEMPS_PAR_DIRECTION = 5
/** Colonnes de la planche : une direction par rangee. */
export const COLONNES_HEROS = TEMPS_PAR_DIRECTION

export const DIR_BAS = 0
export const DIR_DROITE = 1
export const DIR_HAUT = 2
export const DIR_GAUCHE = 3

/** L'image de planche pour une direction et un temps du cycle. */
export const imageHeros = (direction: number, temps = 0): number =>
  direction * TEMPS_PAR_DIRECTION + temps

export const TEMPS_REPOS = 0
/** Les temps du cycle de marche, dans l'ordre : contact, passage, contact, passage. */
export const TEMPS_MARCHE = [1, 2, 3, 4]
