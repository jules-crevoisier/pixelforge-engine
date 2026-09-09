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

export const PLANCHE_HEROS: string[][] = [HEROS_BAS, HEROS_COTE, HEROS_HAUT, HEROS_COTE]

export const DIR_BAS = 0
export const DIR_DROITE = 1
export const DIR_HAUT = 2
export const DIR_GAUCHE = 3
