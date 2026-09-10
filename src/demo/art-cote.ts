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
import {
  hauteurSol, PENTE_DROITE, PENTE_GAUCHE, PENTE_DEMI, PENTE_HAUTE,
} from '../tuiles/tilemap.ts'

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

/**
 * Une tuile de pente, dessinee DEPUIS la fonction de collision.
 *
 * ## Pourquoi on ne la dessine pas a la main
 *
 * Parce que le dessin et la collision ne doivent pas pouvoir mentir l'un sur
 * l'autre. Une rampe dessinee a la main et une rampe calculee finissent par
 * differer d'un pixel : le personnage marche un pixel au-dessus de la roche,
 * ou s'y enfonce, et l'on ne sait pas lequel des deux a tort. En prenant la
 * hauteur du sol dans `hauteurSol`, celle-la meme dont se sert le controleur,
 * la question ne peut pas se poser — ils ont la meme source.
 *
 * L'herbe se pose sur la premiere rangee pleine de chaque colonne, comme sur
 * les cases plates : c'est ce qui rattache visuellement une cote au sol.
 */
function penteDepuisMatiere(matiere: number): string[] {
  const g = Array.from({ length: TUILE }, () => Array.from({ length: TUILE }, () => 'f'))
  for (let x = 0; x < TUILE; x++) {
    const haut = hauteurSol(matiere, x, TUILE)
    for (let y = haut; y < TUILE; y++) {
      // Trois tons du haut vers le bas : l'herbe eclairee, la roche claire,
      // la roche d'ombre. La meme lumiere que partout ailleurs — elle vient
      // d'en haut, sans quoi la cote parait collee sur le decor.
      g[y][x] = y === haut ? 'e' : y === haut + 1 ? 'H' : y < haut + 4 ? 'c' : 'r'
    }
  }
  return g.map((l) => l.join(''))
}

/** Les six formes, dans l'ordre des constantes ci-dessous. */
const PENTES = [
  PENTE_DROITE,
  PENTE_GAUCHE,
  PENTE_DROITE | PENTE_DEMI,
  PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
  PENTE_GAUCHE | PENTE_DEMI,
  PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
].map(penteDepuisMatiere)

/**
 * Les stalactites du lointain : le fond qui defile a mi-vitesse.
 *
 * Elles sont tirees d'un HASARD FIGE et non ecrites a la main : quatre tuiles
 * dessinees a la main se reconnaissent au bout de trois ecrans, et l'oeil
 * repere la repetition avant de reperer la profondeur. Une graine fixe donne
 * un dessin different par tuile et le meme a chaque lancement — ce qui est la
 * seule chose qui compte pour un fond.
 */
function lointain(graine: number): string[] {
  let etat = graine >>> 0
  // Un generateur a un seul mot d'etat : suffisant pour du decor, et surtout
  // reproductible dans tous les langages, ce qu'un Math.random ne serait pas.
  const suivant = (): number => {
    etat = (etat * 1664525 + 1013904223) >>> 0
    return etat / 4294967296
  }
  // La tuile est OPAQUE : c'est elle le fond de la salle, et non un motif
  // pose par-dessus un fond plat. Un lointain transparent se ferait recouvrir
  // par le decor de premier plan, et l'on ne verrait jamais qu'il defile.
  const g = Array.from({ length: TUILE }, () => Array.from({ length: TUILE }, () => 'f'))
  /*
   * Deux ou trois concretions par tuile, et non une par colonne.
   *
   * Une par colonne donnait un peigne : l'oeil y lisait une texture reguliere
   * et non un relief. Ce qui fait un lointain, c'est le VIDE entre les
   * formes — sans lui, il n'y a pas de silhouette, seulement du grain.
   */
  const combien = 2 + Math.floor(suivant() * 2)
  for (let n = 0; n < combien; n++) {
    const centre = Math.floor(suivant() * TUILE)
    const longueur = 3 + Math.floor(suivant() * 9)
    const parLeHaut = suivant() < 0.72
    for (let i = 0; i < longueur; i++) {
      // Elle s'affine en descendant : une pointe, pas un baton. La demi-largeur
      // tombe a zero sur les deux tiers de la longueur.
      const demi = Math.max(0, Math.round((1 - i / longueur) * 1.8))
      const y = parLeHaut ? i : TUILE - 1 - i
      for (let x = centre - demi; x <= centre + demi; x++) {
        if (x < 0 || x >= TUILE) continue
        /*
         * Deux tons, tous deux PLUS SOMBRES que le premier plan.
         *
         * C'est ce qui fait reculer le fond. Dans une caverne il n'y a pas de
         * ciel pour delaver le lointain, seulement moins de lumiere : le
         * fond s'assombrit au lieu de palir. Un fond au meme ton que le sol
         * se colle au personnage et la profondeur disparait.
         */
        g[y][x] = x === centre - demi ? 'r' : 'd'
      }
    }
  }
  return g.map((l) => l.join(''))
}

const LOINTAIN = [lointain(0x5eed), lointain(0xc0ffee), lointain(0x1234), lointain(0xbeef)]

export const PLANCHE_CAVERNE: string[][] = [
  ...MASQUES_BLOB47.map(rocheDepuisMasque),
  FOND,
  LANTERNE,
  POINTES,
  PASSERELLE,
  ...PENTES,
  ...LOINTAIN,
]

export const TUILE_FOND = 47
export const TUILE_LANTERNE = 48
export const TUILE_POINTES = 49
export const TUILE_PASSERELLE = 50
/** Les six pentes, dans l'ordre de `PENTES`. */
export const TUILE_PENTE_D = 51
export const TUILE_PENTE_G = 52
export const TUILE_DEMI_D_BAS = 53
export const TUILE_DEMI_D_HAUT = 54
export const TUILE_DEMI_G_BAS = 55
export const TUILE_DEMI_G_HAUT = 56
/** Les quatre tuiles du lointain, pour le calque a parallaxe. */
export const TUILE_LOINTAIN = 57
export const LOINTAIN_NOMBRE = 4
