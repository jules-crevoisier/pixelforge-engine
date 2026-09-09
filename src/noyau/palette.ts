/**
 * La palette du projet, et le verrou qui la fait respecter.
 *
 * ## Pourquoi verrouiller
 *
 * Un jeu en pixel art tient debout par la coherence de ses couleurs. Trente
 * sprites dessines a six mois d'intervalle derivent : un bleu de tunique
 * devient deux bleus a trois unites d'ecart, un contour passe de #14101a a
 * #151119 parce qu'on l'a repioche a la pipette sur une capture d'ecran
 * compressee. Rien de tout cela ne se voit sur un sprite isole. Tout se voit
 * quand ils sont cote a cote dans le jeu.
 *
 * Un moteur generaliste ne peut pas aider : pour lui une couleur en vaut une
 * autre. Ici la palette est une propriete du PROJET, et tout asset qui en sort
 * est signale par son nom et le nombre de pixels fautifs.
 *
 * ## Pourquoi on signale au lieu d'interdire
 *
 * Refuser l'import serait pire : on importe souvent un asset justement pour le
 * retravailler, et un editeur qui dit non sans montrer quoi corriger ne sert
 * qu'a faire desactiver le verrou. Le constat porte donc les couleurs
 * fautives, leur effectif, et la couleur de la palette la plus proche — ce qui
 * suffit a decider en un coup d'oeil.
 */

/** Couleur empaquetee en 0xRRGGBB. L'alpha ne fait pas partie de la palette. */
export type Couleur = number

export const rvb = (r: number, v: number, b: number): Couleur =>
  ((r & 255) << 16) | ((v & 255) << 8) | (b & 255)

export const rouge = (c: Couleur): number => (c >> 16) & 255
export const vert = (c: Couleur): number => (c >> 8) & 255
export const bleu = (c: Couleur): number => c & 255

export function versHex(c: Couleur): string {
  return `#${c.toString(16).padStart(6, '0')}`
}

export function depuisHex(hex: string): Couleur {
  const s = hex.trim().replace(/^#/, '')
  const court = s.length === 3 ? s.split('').map((k) => k + k).join('') : s
  const n = Number.parseInt(court.slice(0, 6), 16)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Distance entre deux couleurs, en somme des ecarts de canaux.
 *
 * On garde la meme mesure que l'editeur de sprites — |dR|+|dV|+|dB| — pour que
 * les deux outils disent le meme chiffre du meme couple. Deux mesures
 * differentes dans une meme suite, c'est la garantie que l'une des deux sera
 * citee a tort un jour.
 */
export function distance(a: Couleur, b: Couleur): number {
  return Math.abs(rouge(a) - rouge(b)) + Math.abs(vert(a) - vert(b)) + Math.abs(bleu(a) - bleu(b))
}

/** Luminance perceptuelle, 0 a 255. */
export function luminance(c: Couleur): number {
  return 0.2126 * rouge(c) + 0.7152 * vert(c) + 0.0722 * bleu(c)
}

export class Palette {
  nom: string
  couleurs: Couleur[]

  constructor(nom: string, couleurs: Couleur[] = []) {
    this.nom = nom
    this.couleurs = [...couleurs]
  }

  get taille(): number { return this.couleurs.length }
  contient(c: Couleur): boolean { return this.couleurs.includes(c) }

  /** La couleur de la palette la plus proche, et son ecart. */
  plusProche(c: Couleur): { couleur: Couleur; ecart: number } | null {
    if (!this.couleurs.length) return null
    let meilleure = this.couleurs[0]
    let ecart = distance(c, meilleure)
    for (const p of this.couleurs) {
      const d = distance(c, p)
      if (d < ecart) { ecart = d; meilleure = p }
    }
    return { couleur: meilleure, ecart }
  }
}

export interface Fautive {
  couleur: Couleur
  pixels: number
  /** La couleur de la palette la plus proche, pour proposer un remplacement. */
  proche: Couleur
  ecart: number
}

export interface Verdict {
  conforme: boolean
  /** Part des pixels opaques hors palette, de 0 a 1. */
  part: number
  fautives: Fautive[]
}

/**
 * Verifie qu'une image ne sort pas de la palette du projet.
 *
 * `pixels` est un RGBA plat, tel que `getImageData` le rend. Les pixels
 * entierement transparents sont ignores : ils n'ont pas de couleur a
 * respecter, et les compter ferait echouer tout sprite qui a du vide autour —
 * c'est-a-dire tous.
 */
export function verifierPalette(pixels: Uint8ClampedArray, palette: Palette): Verdict {
  const compte = new Map<Couleur, number>()
  let opaques = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue
    opaques++
    const c = rvb(pixels[i], pixels[i + 1], pixels[i + 2])
    if (palette.contient(c)) continue
    compte.set(c, (compte.get(c) ?? 0) + 1)
  }

  const fautives: Fautive[] = []
  let horsPalette = 0
  for (const [c, n] of compte) {
    horsPalette += n
    const p = palette.plusProche(c)
    fautives.push({ couleur: c, pixels: n, proche: p?.couleur ?? 0, ecart: p?.ecart ?? 0 })
  }
  fautives.sort((a, b) => b.pixels - a.pixels)

  return {
    conforme: fautives.length === 0,
    part: opaques ? horsPalette / opaques : 0,
    fautives,
  }
}
