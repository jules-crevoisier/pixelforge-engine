/**
 * Les dessins de la caverne, vue de COTE.
 *
 * ## Pourquoi une deuxieme planche et non une teinte differente
 *
 * Vu de dessus, un mur montre sa tranche : un liseré sombre du cote ou il n'a
 * pas de voisin, et rien de plus. Vu de cote, le meme masque de voisinage veut
 * dire autre chose — une case sans voisin EN HAUT est une plateforme sur
 * laquelle on marche, elle porte l'herbe et la lumiere ; une case sans voisin
 * en bas est un plafond, elle est dans l'ombre. Le haut et le bas cessent
 * d'etre interchangeables des qu'il y a une gravite.
 *
 * C'est la meme raison qui fait exister `Regard` a cote de `ModeProjection` :
 * la grille est la meme, ce qu'elle signifie ne l'est pas.
 */
import {
  MASQUES_BLOB47, HAUT, BAS, GAUCHE, DROITE,
  HAUT_DROITE, BAS_DROITE, BAS_GAUCHE, HAUT_GAUCHE,
} from '../tuiles/terrain.ts'
import { TUILE } from './art.ts'

export const CLE_CAVERNE: Record<string, string> = {
  o: '#0b0a12',
  r: '#3b3346',
  R: '#4e4459',
  c: '#5f5468',
  h: '#3f7a46',
  H: '#59a355',
  e: '#7fc46a',
  f: '#171426',
  F: '#221d33',
  y: '#f0c860',
  d: '#2a2340',
}

/**
 * Une case de roche, dessinee depuis son masque de voisinage.
 *
 * La lumiere vient d'en haut, comme dans presque tout le pixel art : la face
 * superieure est la plus claire, les flancs le sont moins, le dessous est
 * noir. Un eclairage lateral serait aussi defendable, mais il faudrait alors
 * le tenir sur tous les dessins du jeu, y compris ceux qu'on n'a pas encore
 * faits.
 */
function rocheDepuisMasque(masque: number): string[] {
  const n = (bit: number): boolean => (masque & bit) !== 0
  const g: string[][] = []
  for (let y = 0; y < TUILE; y++) {
    const ligne: string[] = []
    for (let x = 0; x < TUILE; x++) {
      // Une trame irreguliere, mais deterministe : deux tuiles voisines du
      // meme masque doivent etre identiques, sinon le mur scintille quand on
      // repeint une case.
      const grain = ((x * 7 + y * 13) % 11 === 0) || ((x * 3 + y * 5) % 17 === 0)
      ligne.push(grain ? 'r' : 'R')
    }
    g.push(ligne)
  }

  // Le dessus : de la terre, puis de l'herbe. C'est ce qui dit au joueur, sans
  // un mot, ou il peut poser les pieds.
  if (!n(HAUT)) {
    for (let x = 0; x < TUILE; x++) {
      g[0][x] = 'e'
      g[1][x] = 'H'
      g[2][x] = (x + Math.floor(x / 3)) % 3 === 0 ? 'H' : 'h'
      g[3][x] = (x * 5) % 7 === 0 ? 'h' : 'c'
    }
  }
  // Le dessous : un plafond ne recoit pas de lumiere.
  if (!n(BAS)) for (let x = 0; x < TUILE; x++) { g[TUILE - 1][x] = 'o'; g[TUILE - 2][x] = 'r' }
  // Les flancs : la paroi qu'on longe en glissant, et sur laquelle on rebondit.
  if (!n(GAUCHE)) for (let y = 0; y < TUILE; y++) { g[y][0] = 'o'; if (y > 3 || n(HAUT)) g[y][1] = 'r' }
  if (!n(DROITE)) for (let y = 0; y < TUILE; y++) { g[y][TUILE - 1] = 'o'; if (y > 3 || n(HAUT)) g[y][TUILE - 2] = 'r' }

  // Les angles rentrants : deux cotes pleins, la diagonale vide.
  if (n(HAUT) && n(DROITE) && !n(HAUT_DROITE)) g[0][TUILE - 1] = 'o'
  if (n(BAS) && n(DROITE) && !n(BAS_DROITE)) g[TUILE - 1][TUILE - 1] = 'o'
  if (n(BAS) && n(GAUCHE) && !n(BAS_GAUCHE)) g[TUILE - 1][0] = 'o'
  if (n(HAUT) && n(GAUCHE) && !n(HAUT_GAUCHE)) g[0][0] = 'o'

  return g.map((l) => l.join(''))
}

/** Le fond : ce qu'on voit derriere le joueur, et qui ne bloque rien. */
const FOND = Array.from({ length: TUILE }, (_, y) =>
  Array.from({ length: TUILE }, (_, x) => ((x + y) % 8 === 0 ? 'F' : 'f')).join(''))

/** La sortie : une lanterne accrochee au fond. */
const LANTERNE = [
  'ffffffffffffffff',
  'fffffffoofffffff',
  'ffffffoyyoffffff',
  'fffffoyyyyofffff',
  'fffffoyddyofffff',
  'fffffoyddyofffff',
  'fffffoyyyyofffff',
  'ffffffoyyoffffff',
  'fffffffoofffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
]

/**
 * Les pointes, calculees.
 *
 * Quatre dents dans la case, dessinees au BAS et pointant vers le haut : c'est
 * la seule disposition qui dise, sans un mot, d'ou vient le danger. Des
 * pointes centrees dans leur case laissent croire qu'on peut passer dessous.
 *
 * La dent s'elargit d'un pixel toutes les deux rangees. Un pixel par rangee
 * donnerait une aiguille qu'on ne voit pas ; deux, un triangle mou.
 */
function pointes(): string[] {
  const g = Array.from({ length: TUILE }, () => Array.from({ length: TUILE }, () => 'f'))
  const HAUT_DENT = 6
  // DEUX dents et non quatre. Sur seize pixels, quatre dents font quatre
  // pixels chacune : le triangle n'a pas la place de s'affiner et se lit
  // comme un rectangle. Deux dents de huit pixels ont une pointe.
  for (let dent = 0; dent < 2; dent++) {
    const centre = dent * 8 + 4
    for (let y = HAUT_DENT; y < TUILE - 2; y++) {
      const demi = Math.floor((y - HAUT_DENT) / 2) + 1
      for (let x = centre - demi; x < centre + demi; x++) {
        if (x < 0 || x >= TUILE) continue
        // Le cote gauche capte la lumiere, le droit est dans l'ombre : la
        // meme regle que partout ici, sans quoi les dents ont l'air plates.
        g[y][x] = x < centre ? 'c' : 'r'
      }
      if (centre - demi - 1 >= 0) g[y][centre - demi - 1] = 'o'
      if (centre + demi < TUILE) g[y][centre + demi] = 'o'
    }
  }
  for (let x = 0; x < TUILE; x++) { g[TUILE - 2][x] = 'r'; g[TUILE - 1][x] = 'o' }
  return g.map((l) => l.join(''))
}
const POINTES = pointes()

/** Une passerelle : solide quand on tombe dessus, traversable par en dessous. */
const PASSERELLE = [
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'cccccccccccccccc',
  'RRRRRRRRRRRRRRRR',
  'rrrrrrrrrrrrrrrr',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
  'ffffffffffffffff',
]

export const PLANCHE_CAVERNE: string[][] = [
  ...MASQUES_BLOB47.map(rocheDepuisMasque),
  FOND,
  LANTERNE,
  POINTES,
  PASSERELLE,
]

export const TUILE_FOND = 47
export const TUILE_LANTERNE = 48
export const TUILE_POINTES = 49
export const TUILE_PASSERELLE = 50
