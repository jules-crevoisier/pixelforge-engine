/**
 * Le contrat de pixel.
 *
 * C'est le fichier le plus important du moteur, et c'est celui qui justifie
 * qu'il existe. Un moteur generaliste — Godot, Unity — pose ses objets a des
 * coordonnees reelles, les rend a une echelle quelconque et laisse la carte
 * graphique interpoler. Pour un jeu en pixel art, chacune de ces trois
 * libertes est un defaut :
 *
 * - une position a 12,4 pixels affiche un sprite a cheval sur deux pixels
 *   d'ecran, et son contour d'un pixel s'etale sur deux colonnes grises ;
 * - une echelle de 2,7 rend certains pixels sur trois pixels d'ecran et
 *   d'autres sur deux, dans la meme image : la grille ondule ;
 * - l'interpolation lineaire transforme un dessin a douze couleurs en un
 *   degrade a plusieurs milliers, et le travail de l'artiste avec.
 *
 * Ici la regle est inverse : le monde entier est en pixels entiers, l'echelle
 * est entiere, et rien n'est jamais interpole. Ce qui a besoin de precision —
 * une vitesse, une acceleration, une position en cours d'integration — la
 * garde dans un ACCUMULATEUR, et ne se pose sur la grille qu'au dernier
 * moment, une fois par image.
 *
 * ## Pourquoi un accumulateur, et pas simplement arrondir
 *
 * Arrondir la position a chaque image perd le reste : un objet a 0,4 pixel par
 * image n'avance jamais, parce que `round(0,4)` vaut zero a chaque fois. En
 * gardant le reste et en ne prenant que la partie entiere, le meme objet
 * avance d'un pixel toutes les deux ou trois images — irregulierement, ce qui
 * est exactement ce qu'on voit dans un jeu de cette epoque, et non un
 * glissement continu qui trahit le sous-pixel.
 */

/** Position sur la grille. Entiere par construction, jamais par convention. */
export interface Point {
  readonly x: number
  readonly y: number
}

export const pt = (x: number, y: number): Point => ({ x: Math.trunc(x), y: Math.trunc(y) })

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export const rect = (x: number, y: number, w: number, h: number): Rect =>
  ({ x: Math.trunc(x), y: Math.trunc(y), w: Math.max(0, Math.trunc(w)), h: Math.max(0, Math.trunc(h)) })

export const droite = (r: Rect): number => r.x + r.w
export const bas = (r: Rect): number => r.y + r.h

export function seChevauchent(a: Rect, b: Rect): boolean {
  return a.x < droite(b) && b.x < droite(a) && a.y < bas(b) && b.y < bas(a)
}

export function contient(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < droite(r) && p.y < bas(r)
}

/**
 * Arrondi qui commute avec le miroir.
 *
 * `Math.round` casse a la moitie : il monte toujours, donc -0,5 donne 0 et
 * +0,5 donne 1. Deux points symetriques par rapport a l'origine n'atterrissent
 * donc pas symetriquement, et un sprite retourne se decale d'un pixel. La
 * regle du pair — arrondir 0,5 vers le nombre pair le plus proche — est la
 * seule qui rende le meme ecart des deux cotes.
 */
export function arrondiPair(v: number): number {
  const bas0 = Math.floor(v)
  const reste = v - bas0
  if (reste !== 0.5) return Math.round(v)
  return bas0 % 2 === 0 ? bas0 : bas0 + 1
}

/**
 * Un mouvement qui garde son reste entre deux images.
 *
 * On lui donne un deplacement reel, il rend un deplacement ENTIER et conserve
 * ce qu'il n'a pas pu rendre. La somme des entiers rendus suit donc la somme
 * des reels demandes, a moins d'un pixel pres, pour toujours — ce qu'un
 * arrondi image par image ne fait pas.
 */
export class Accumulateur {
  private resteX = 0
  private resteY = 0

  /** Rend le pas entier a appliquer, et garde la fraction pour la suite. */
  pas(dx: number, dy: number): Point {
    this.resteX += dx
    this.resteY += dy
    const px = Math.trunc(this.resteX)
    const py = Math.trunc(this.resteY)
    this.resteX -= px
    this.resteY -= py
    return { x: px, y: py }
  }

  /** Oublie le reste : au contact d'un mur, il n'a plus de sens. */
  bloquerX(): void { this.resteX = 0 }
  bloquerY(): void { this.resteY = 0 }
  remettre(): void { this.resteX = 0; this.resteY = 0 }
}

/**
 * Facteur d'agrandissement d'une resolution virtuelle dans une fenetre.
 *
 * Toujours entier, et au moins un. Une resolution de 320x180 dans une fenetre
 * de 1280x800 rend 4 et non 4,44 : on prefere des bandes noires a une grille
 * qui ondule. C'est le contrat que tous les jeux pixel art qui se respectent
 * appliquent, et celui que les moteurs generalistes laissent a la charge du
 * developpeur — qui l'oublie.
 */
export function echelleEntiere(
  largeurVue: number, hauteurVue: number, largeurFenetre: number, hauteurFenetre: number,
): number {
  if (largeurVue <= 0 || hauteurVue <= 0) return 1
  return Math.max(1, Math.floor(Math.min(largeurFenetre / largeurVue, hauteurFenetre / hauteurVue)))
}
