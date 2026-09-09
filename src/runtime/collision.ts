import { type Rect, rect, droite, bas } from '../noyau/pixel.ts'

/**
 * Collisions contre une grille de tuiles.
 *
 * ## Pourquoi axe par axe, et pas en diagonale
 *
 * Deplacer un corps en diagonale puis chercher ou il touche donne des cas
 * insolubles : un corps coince dans un coin ne sait plus de quel cote reculer,
 * et il traverse ou il reste bloque selon l'ordre des tests. En bougeant
 * d'abord sur X, en resolvant, puis sur Y, chaque resolution est
 * unidimensionnelle donc evidente. C'est ce que font tous les jeux de
 * plateforme qui glissent correctement le long d'un mur.
 *
 * ## Pourquoi on avance pixel par pixel
 *
 * Un corps rapide teste a l'arrivee seulement traverserait un mur d'un pixel
 * d'epaisseur : c'est le « tunneling ». On avance donc d'un pixel a la fois.
 * A la resolution d'un jeu pixel art, un corps depasse rarement dix pixels par
 * pas — la boucle est courte, et la garantie est totale au lieu d'etre
 * probable.
 */
export interface GrilleSolide {
  readonly tuile: number
  readonly largeur: number
  readonly hauteur: number
  /** Vrai si la case bloque le passage. */
  solide(cx: number, cy: number): boolean
}

/** Les cases que couvre un rectangle du monde. */
export function casesCouvertes(g: GrilleSolide, r: Rect): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.floor(r.x / g.tuile),
    y0: Math.floor(r.y / g.tuile),
    // -1 : un corps dont le bord droit tombe pile sur une frontiere ne touche
    // pas la case suivante. Sans ce retrait, un corps large d'une tuile
    // exactement en occuperait deux et resterait coince partout.
    x1: Math.floor((droite(r) - 1) / g.tuile),
    y1: Math.floor((bas(r) - 1) / g.tuile),
  }
}

export function toucheSolide(g: GrilleSolide, r: Rect): boolean {
  if (r.w <= 0 || r.h <= 0) return false
  const c = casesCouvertes(g, r)
  for (let cy = c.y0; cy <= c.y1; cy++) {
    for (let cx = c.x0; cx <= c.x1; cx++) {
      if (cx < 0 || cy < 0 || cx >= g.largeur || cy >= g.hauteur) return true
      if (g.solide(cx, cy)) return true
    }
  }
  return false
}

export interface Contact {
  /** Deplacement reellement effectue. */
  dx: number
  dy: number
  /** Vrai si le mouvement a ete arrete sur cet axe. */
  bloqueX: boolean
  bloqueY: boolean
}

/**
 * Deplace une boite contre la grille, un axe apres l'autre, pixel par pixel.
 *
 * Rend ce qui a pu etre parcouru et sur quel axe on a bute. L'appelant remet
 * a zero le reste de son accumulateur sur l'axe bloque : garder une fraction
 * de mouvement contre un mur ferait avancer d'un pixel des que le mur
 * disparait, sans que le joueur ait rien demande.
 */
export function deplacer(g: GrilleSolide, boite: Rect, dx: number, dy: number): Contact {
  let x = boite.x
  let y = boite.y
  let bloqueX = false
  let bloqueY = false

  const pasX = Math.sign(dx)
  for (let i = 0; i < Math.abs(dx); i++) {
    if (toucheSolide(g, rect(x + pasX, y, boite.w, boite.h))) { bloqueX = true; break }
    x += pasX
  }

  const pasY = Math.sign(dy)
  for (let i = 0; i < Math.abs(dy); i++) {
    if (toucheSolide(g, rect(x, y + pasY, boite.w, boite.h))) { bloqueY = true; break }
    y += pasY
  }

  return { dx: x - boite.x, dy: y - boite.y, bloqueX, bloqueY }
}
