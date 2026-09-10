import type { Rect } from '../noyau/pixel.ts'
import { M_SOLIDE, M_PLATEFORME, toucheSolide, type GrilleSolide } from './collision.ts'

/**
 * Les corps mobiles : ce qui bloque sans etre une case.
 *
 * ## Le probleme
 *
 * Tout le decor tenait dans la grille de tuiles. C'est exact pour un mur, et
 * faux pour tout ce qui bouge : une plateforme qui monte, une caisse qu'on
 * pousse, une porte qui coulisse, le dos d'un boss sur lequel on grimpe. Ces
 * choses-la ne sont pas alignees sur la grille, elles changent de place a
 * chaque pas, et une case ne sait pas dire « je suis ici a 13,5 pixels ».
 *
 * ## Pourquoi un registre, et pas un champ sur chaque entite
 *
 * Le controleur de plateforme, le deplacement des creatures et les scripts
 * passent tous par `GrilleSolide`. Si le corps mobile etait un champ des
 * entites, chacun de ces trois chemins devrait apprendre a parcourir les
 * entites — trois endroits ou oublier un cas. Un registre se BRANCHE sur la
 * grille : les trois chemins n'apprennent rien, et un obstacle mobile devient
 * du decor du point de vue de qui se cogne dedans.
 *
 * ## Ce que le registre retient en plus de la boite
 *
 * Le deplacement du dernier pas. C'est lui qui PORTE : une plateforme qui
 * monte de deux pixels doit monter de deux pixels ce qui se tient dessus.
 * Sans cette memoire, il faudrait comparer deux positions successives depuis
 * l'exterieur, et se tromper de pas.
 */
export interface CorpsMobile {
  id: string
  /** Coin haut-gauche de la boite, en pixels du monde. */
  x: number
  y: number
  l: number
  h: number
  /** `M_SOLIDE` ou `M_PLATEFORME` — voir `collision.ts`. */
  matiere: number
  /** Deplacement effectue au dernier pas, en pixels entiers. */
  dx: number
  dy: number
}

export class CorpsMobiles {
  private liste = new Map<string, CorpsMobile>()

  get nombre(): number { return this.liste.size }
  get tous(): CorpsMobile[] { return [...this.liste.values()] }
  get identifiants(): string[] { return [...this.liste.keys()] }
  de(id: string): CorpsMobile | null { return this.liste.get(id) ?? null }

  /**
   * Declare un corps, ou met a jour sa boite sans effacer son deplacement.
   *
   * Le deplacement se remet a zero ici : il est REPOSE a chaque pas par
   * `bouger`, et un corps qu'on redeclare sans bouger ne porte rien.
   */
  poser(id: string, x: number, y: number, l: number, h: number, matiere: number): CorpsMobile {
    const c = this.liste.get(id)
    if (c) {
      c.dx = x - c.x
      c.dy = y - c.y
      c.x = x; c.y = y; c.l = l; c.h = h; c.matiere = matiere
      return c
    }
    const neuf: CorpsMobile = { id, x, y, l, h, matiere, dx: 0, dy: 0 }
    this.liste.set(id, neuf)
    return neuf
  }

  retirer(id: string): boolean { return this.liste.delete(id) }
  vider(): void { this.liste.clear() }

  /**
   * Les drapeaux reunis des corps qui recouvrent ce rectangle.
   *
   * `sauf` exclut un corps : un corps solide qui se deplace se cognerait
   * sinon contre lui-meme des le premier pixel.
   */
  drapeaux(r: Rect, sauf = ''): number {
    let m = 0
    for (const c of this.liste.values()) {
      if (c.id === sauf) continue
      if (r.x < c.x + c.l && r.x + r.w > c.x && r.y < c.y + c.h && r.y + r.h > c.y) m |= c.matiere
    }
    return m
  }

  /**
   * Le corps a sens unique dont le dessus vaut exactement le bas de ce
   * rectangle.
   *
   * Meme regle de croisement que pour les cases, et pour la meme raison : un
   * corps deja enfonce dans la plateforme parce qu'il a saute par en dessous
   * ne doit pas s'y accrocher a l'instant ou il redescend.
   */
  plateformeSous(r: Rect, sauf = ''): CorpsMobile | null {
    const bas = r.y + r.h
    for (const c of this.liste.values()) {
      if (c.id === sauf || (c.matiere & M_PLATEFORME) === 0) continue
      if (c.y !== bas) continue
      if (r.x < c.x + c.l && r.x + r.w > c.x) return c
    }
    return null
  }

  /**
   * Le corps sur lequel ce rectangle REPOSE, plateforme ou solide.
   *
   * C'est la question du passager : « qu'est-ce qui me porte ». Elle est
   * distincte de « qu'est-ce qui me bloque » — un mur solide bloque sans
   * porter.
   */
  porteurSous(r: Rect, sauf = ''): CorpsMobile | null {
    const bas = r.y + r.h
    for (const c of this.liste.values()) {
      if (c.id === sauf || c.matiere === 0) continue
      if (c.y !== bas) continue
      if (r.x < c.x + c.l && r.x + r.w > c.x) return c
    }
    return null
  }
}

/**
 * Le decor et les corps mobiles, vus comme une seule grille.
 *
 * L'objet rendu delegue tout au decor et n'ajoute que les deux crochets en
 * pixels. Rien de ce qui se deplace n'a donc besoin de savoir qu'il existe des
 * corps mobiles — ce qui est exactement le but.
 */
export function grilleAvecCorps(g: GrilleSolide, corps: CorpsMobiles, sauf = ''): GrilleSolide {
  const compose: GrilleSolide = {
    tuile: g.tuile,
    largeur: g.largeur,
    hauteur: g.hauteur,
    solide: (cx, cy) => g.solide(cx, cy),
    corpsSur: (r) => corps.drapeaux(r, sauf) | (g.corpsSur ? g.corpsSur(r) : 0),
    plateformeMobileSous: (r) => corps.plateformeSous(r, sauf) !== null,
  }
  // On n'ajoute `matiere` que si le decor en a une : la declarer a `undefined`
  // n'est pas la meme chose que ne pas la declarer, et la collision distingue
  // les deux — une grille sans matiere traite les plateformes comme du vide.
  if (g.matiere) {
    const lire = g.matiere.bind(g)
    ;(compose as { matiere?: (cx: number, cy: number) => number }).matiere = lire
  }
  return compose
}

/**
 * Deplace une boite d'un nombre entier de pixels, en butant sur le decor.
 *
 * C'est ainsi qu'une plateforme mobile porte son passager. Elle ne lui donne
 * PAS de vitesse : le passager n'a rien demande, et une vitesse le ferait
 * continuer tout seul a l'instant ou la plateforme s'arrete — le defaut
 * classique du passager ejecte en bout de course.
 *
 * Le passager qui rencontre un mur est simplement laisse en arriere. Un vrai
 * ecrasement — mourir entre la plateforme et le plafond — demande une regle de
 * jeu, pas une regle de collision, et cette regle n'existe pas encore ; le
 * dire vaut mieux que de faire semblant.
 */
export function porter(
  g: GrilleSolide, boite: Rect, dx: number, dy: number,
): { dx: number; dy: number } {
  let fx = 0
  let fy = 0
  const sx = Math.sign(dx)
  for (let i = 0; i < Math.abs(dx); i++) {
    if (toucheSolide(g, { x: boite.x + fx + sx, y: boite.y, w: boite.w, h: boite.h })) break
    fx += sx
  }
  const sy = Math.sign(dy)
  for (let i = 0; i < Math.abs(dy); i++) {
    if (toucheSolide(g, { x: boite.x + fx, y: boite.y + fy + sy, w: boite.w, h: boite.h })) break
    fy += sy
  }
  return { dx: fx, dy: fy }
}

export { M_SOLIDE, M_PLATEFORME }
