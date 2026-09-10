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
  /** Vrai si la case bloque le passage en toutes circonstances. */
  solide(cx: number, cy: number): boolean
  /**
   * Les drapeaux de la case — voir `tuiles/tilemap.ts`.
   *
   * Facultatif : une grille qui ne connait que le solide reste valable, et
   * c'est ce que rendent les bancs les plus anciens. Sans cette fonction, une
   * plateforme se comporte comme du vide, ce qui est le defaut le moins
   * surprenant.
   */
  matiere?(cx: number, cy: number): number
  /**
   * Les drapeaux des corps MOBILES qui recouvrent ce rectangle du monde.
   *
   * Une plateforme qui bouge ne tient pas dans `solide(cx, cy)` : elle n'est
   * pas alignee sur la grille, et elle change de place a chaque pas. On ne
   * peut donc pas l'exprimer par une case. Ce crochet-ci travaille en pixels,
   * ce qui est la seule facon honnete de decrire un obstacle qui se deplace.
   *
   * Facultatif, et c'est voulu : une grille de decor pur reste valable, et
   * c'est ce que rendent les mondes sans plateforme mobile.
   */
  corpsSur?(r: Rect): number
  /**
   * Vrai si le dessus d'un corps mobile a sens unique vaut exactement le bas
   * de ce rectangle. Meme regle de croisement que pour les cases — voir
   * `plateformeArrete`.
   */
  plateformeMobileSous?(r: Rect): boolean
}

/** Les drapeaux, redeclares ici pour que la collision ne dependeplus des tuiles. */
export const M_SOLIDE = 1
export const M_PLATEFORME = 2

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
  // Les corps mobiles d'abord : ils sont peu nombreux, et un corps qui bloque
  // dispense de parcourir les cases.
  if (g.corpsSur && (g.corpsSur(r) & M_SOLIDE) !== 0) return true
  const c = casesCouvertes(g, r)
  for (let cy = c.y0; cy <= c.y1; cy++) {
    for (let cx = c.x0; cx <= c.x1; cx++) {
      if (cx < 0 || cy < 0 || cx >= g.largeur || cy >= g.hauteur) return true
      if (g.solide(cx, cy)) return true
    }
  }
  return false
}

/**
 * Vrai si une plateforme arrete ce corps qui descend d'un pixel.
 *
 * ## La regle, et pourquoi elle est si etroite
 *
 * Une plateforme ne bloque QUE si le bas du corps arrive pile sur le haut de
 * la case. On pourrait croire qu'il suffit de tester « il descend » — c'est ce
 * qu'on ecrit d'abord, et c'est faux : un corps deja enfonce dans la
 * plateforme, parce qu'il a saute par en dessous, s'y retrouverait pris a
 * l'instant ou il redescend. Il faut le CROISEMENT du bord, pas la direction.
 *
 * Comme le deplacement se fait pixel par pixel, le croisement s'ecrit
 * exactement : le bas du corps vaut le haut de la case, ni plus ni moins.
 */
export function plateformeArrete(g: GrilleSolide, r: Rect, traverse = false): boolean {
  if (traverse) return false
  // Une plateforme mobile obeit a la meme regle de croisement, mais son dessus
  // est un pixel quelconque et non un multiple de la tuile : elle a donc son
  // propre test, et il vient d'abord parce qu'il n'a pas besoin de la grille.
  if (g.plateformeMobileSous && g.plateformeMobileSous(r)) return true
  if (!g.matiere) return false
  const bas = r.y + r.h
  if (bas % g.tuile !== 0) return false
  const cy = bas / g.tuile
  const x0 = Math.floor(r.x / g.tuile)
  const x1 = Math.floor((droite(r) - 1) / g.tuile)
  for (let cx = x0; cx <= x1; cx++) {
    if (cx < 0 || cy < 0 || cx >= g.largeur || cy >= g.hauteur) continue
    if ((g.matiere(cx, cy) & M_PLATEFORME) !== 0) return true
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
export function deplacer(
  g: GrilleSolide, boite: Rect, dx: number, dy: number, traversePlateformes = false,
): Contact {
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
    const prochaine = rect(x, y + pasY, boite.w, boite.h)
    if (toucheSolide(g, prochaine)) { bloqueY = true; break }
    // Les plateformes n'arretent que ce qui descend, et seulement au moment ou
    // le bord croise le leur. On teste la position ACTUELLE, avant le pas :
    // c'est elle qui doit poser le bas du corps sur le haut de la case.
    if (pasY > 0 && plateformeArrete(g, rect(x, y, boite.w, boite.h), traversePlateformes)) {
      bloqueY = true
      break
    }
    y += pasY
  }

  return { dx: x - boite.x, dy: y - boite.y, bloqueX, bloqueY }
}
