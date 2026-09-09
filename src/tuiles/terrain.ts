/**
 * L'autotiling : poser un mur, et que ses coins se dessinent tout seuls.
 *
 * C'est la fonction la plus rentable d'un editeur de jeu 2D, et celle que les
 * moteurs generalistes traitent en module annexe. Un donjon de deux cents
 * cases demande, a la main, de choisir pour chaque case laquelle des
 * quarante-sept tuiles de mur convient — et de tout reprendre des qu'on
 * deplace une salle. Avec un terrain, on peint « ici c'est du mur » et la
 * bonne tuile se deduit du voisinage.
 *
 * ## Pourquoi quarante-sept et pas deux cent cinquante-six
 *
 * Une case a huit voisins, donc 2^8 = 256 configurations. Mais un voisin en
 * diagonale ne change RIEN si l'un des deux voisins orthogonaux qui le
 * touchent est vide : le coin est de toute facon ouvert, et le dessin est le
 * meme. En eliminant ces doublons il ne reste que 47 cas distincts — c'est le
 * jeu dit « blob », et c'est le nombre de tuiles qu'un artiste doit dessiner.
 *
 * Sans cette reduction on demanderait 256 dessins pour 47 resultats visibles :
 * 209 tuiles dessinees pour rien, et autant d'occasions de se tromper.
 *
 * ## Le jeu a seize
 *
 * Quand les coins ne sont pas dessines — un mur vu de dessus dans un donjon,
 * une plateforme — seuls les quatre voisins orthogonaux comptent : 2^4 = 16
 * tuiles. C'est beaucoup moins de travail pour l'artiste, et souvent
 * suffisant. Les deux jeux sont donc proposes, et le terrain declare lequel il
 * emploie.
 */

/** Les huit voisins, dans l'ordre des bits. */
export const HAUT = 1
export const HAUT_DROITE = 2
export const DROITE = 4
export const BAS_DROITE = 8
export const BAS = 16
export const BAS_GAUCHE = 32
export const GAUCHE = 64
export const HAUT_GAUCHE = 128

export type JeuDeTuiles = 'blob47' | 'bord16'

/**
 * Nettoie un masque de voisinage : un coin ne compte que si ses deux cotes
 * sont pleins.
 *
 * C'est cette seule ligne de raisonnement qui fait passer de 256 a 47.
 */
export function masqueNettoye(voisins: number): number {
  let m = voisins
  if (!(m & HAUT) || !(m & DROITE)) m &= ~HAUT_DROITE
  if (!(m & BAS) || !(m & DROITE)) m &= ~BAS_DROITE
  if (!(m & BAS) || !(m & GAUCHE)) m &= ~BAS_GAUCHE
  if (!(m & HAUT) || !(m & GAUCHE)) m &= ~HAUT_GAUCHE
  return m
}

/**
 * Table des 47 masques valides, dans un ordre STABLE.
 *
 * L'ordre est celui des masques croissants, et il ne changera jamais : c'est
 * l'index dans cette table qui est enregistre dans les fichiers de projet et
 * dans la planche de tuiles de l'artiste. Le reordonner casserait tous les
 * projets existants et toutes les planches deja dessinees.
 */
export const MASQUES_BLOB47: readonly number[] = (() => {
  const vus = new Set<number>()
  for (let v = 0; v < 256; v++) vus.add(masqueNettoye(v))
  return [...vus].sort((a, b) => a - b)
})()

/** Les 16 masques du jeu sans coins, orthogonaux seulement. */
export const MASQUES_BORD16: readonly number[] = (() => {
  const out: number[] = []
  for (let i = 0; i < 16; i++) {
    out.push(
      (i & 1 ? HAUT : 0) | (i & 2 ? DROITE : 0) | (i & 4 ? BAS : 0) | (i & 8 ? GAUCHE : 0),
    )
  }
  return out.sort((a, b) => a - b)
})()

/** Index d'un masque dans son jeu, ou 0 si le masque est inconnu. */
export function indexDeMasque(masque: number, jeu: JeuDeTuiles): number {
  const table = jeu === 'blob47' ? MASQUES_BLOB47 : MASQUES_BORD16
  const m = jeu === 'blob47' ? masqueNettoye(masque) : masque & (HAUT | DROITE | BAS | GAUCHE)
  const i = table.indexOf(m)
  return i < 0 ? 0 : i
}

/** Une grille de terrain : vrai la ou le terrain est present. */
export interface GrilleTerrain {
  readonly largeur: number
  readonly hauteur: number
  /** Vrai si la case porte ce terrain. Hors grille, voir `dehorsEstPlein`. */
  plein(x: number, y: number): boolean
}

/**
 * Ce qu'on considere au-dela du bord de la carte.
 *
 * `true` fait que le terrain se prolonge : un mur colle au bord n'aura pas de
 * coin dessine face au vide, ce qui est ce qu'on veut d'une salle fermee. Avec
 * `false`, la carte a un contour net — utile pour une ile, une plateforme
 * flottante. C'est un choix de rendu, pas une constante : les deux se
 * rencontrent dans un meme jeu.
 */
export function masqueEn(
  g: GrilleTerrain, x: number, y: number, dehorsEstPlein: boolean,
): number {
  const p = (dx: number, dy: number): boolean => {
    const ax = x + dx, ay = y + dy
    if (ax < 0 || ay < 0 || ax >= g.largeur || ay >= g.hauteur) return dehorsEstPlein
    return g.plein(ax, ay)
  }
  return (p(0, -1) ? HAUT : 0)
    | (p(1, -1) ? HAUT_DROITE : 0)
    | (p(1, 0) ? DROITE : 0)
    | (p(1, 1) ? BAS_DROITE : 0)
    | (p(0, 1) ? BAS : 0)
    | (p(-1, 1) ? BAS_GAUCHE : 0)
    | (p(-1, 0) ? GAUCHE : 0)
    | (p(-1, -1) ? HAUT_GAUCHE : 0)
}

/** L'index de tuile a poser en (x, y), pour un terrain donne. */
export function tuilePour(
  g: GrilleTerrain, x: number, y: number, jeu: JeuDeTuiles, dehorsEstPlein = true,
): number {
  return indexDeMasque(masqueEn(g, x, y, dehorsEstPlein), jeu)
}
