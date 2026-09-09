import { type JeuDeTuiles, tuilePour } from './terrain.ts'

/**
 * Une carte de tuiles, en calques.
 *
 * ## Pourquoi des calques et non une seule grille
 *
 * Un sol, un mur, une decoration posee dessus, un plafond qui passe devant le
 * personnage : ce sont quatre choses qui occupent la MEME case et doivent
 * coexister. Avec une grille unique, poser une torche sur un mur efface le
 * mur, et le rendre devant ou derriere le joueur n'est plus une question qu'on
 * peut poser.
 *
 * ## Pourquoi la collision est une grille a part
 *
 * On pourrait la deduire du calque de mur — « tout ce qui est dessine bloque ».
 * C'est faux des le premier tapis : une tuile peut etre dessinee sans etre
 * solide, et un trou invisible peut bloquer. La collision est donc SA propre
 * grille, remplie par defaut depuis les tuiles marquees solides dans le
 * tileset, et corrigeable a la main sans toucher au dessin.
 */

/** Une case vide. Zero serait ambigu : c'est aussi la premiere tuile. */
export const VIDE = -1

export interface Calque {
  nom: string
  /** Index de tuile par case, ou VIDE. */
  cases: Int32Array
  visible: boolean
  /** Le calque passe-t-il devant les personnages ? */
  devant: boolean
  /**
   * Terrain auquel ce calque obeit, ou null s'il se peint tuile par tuile.
   * Un calque de terrain recalcule ses tuiles depuis son masque de presence.
   */
  terrain: { tuileDepart: number; jeu: JeuDeTuiles; dehorsEstPlein: boolean } | null
  /** Presence du terrain, quand il y en a un. */
  presence: Uint8Array | null
}

export class Carte {
  readonly largeur: number
  readonly hauteur: number
  readonly tuile: number
  calques: Calque[] = []
  /** Grille de collision, independante du dessin. */
  solides: Uint8Array

  constructor(largeur: number, hauteur: number, tuile = 16) {
    this.largeur = largeur
    this.hauteur = hauteur
    this.tuile = tuile
    this.solides = new Uint8Array(largeur * hauteur)
  }

  get cases(): number { return this.largeur * this.hauteur }
  index(x: number, y: number): number { return y * this.largeur + x }
  dedans(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.largeur && y < this.hauteur
  }

  ajouterCalque(nom: string, opts: Partial<Omit<Calque, 'nom' | 'cases'>> = {}): Calque {
    const c: Calque = {
      nom,
      cases: new Int32Array(this.cases).fill(VIDE),
      visible: opts.visible ?? true,
      devant: opts.devant ?? false,
      terrain: opts.terrain ?? null,
      presence: opts.terrain ? new Uint8Array(this.cases) : (opts.presence ?? null),
    }
    this.calques.push(c)
    return c
  }

  solide(cx: number, cy: number): boolean {
    if (!this.dedans(cx, cy)) return true
    return this.solides[this.index(cx, cy)] !== 0
  }

  /**
   * Repeint un calque de terrain a partir de sa presence.
   *
   * On ne recalcule que la case touchee ET ses huit voisines : poser une tuile
   * ne change le dessin de personne d'autre. Sur une carte de cent par cent,
   * tout recalculer a chaque coup de pinceau, c'est dix mille cases pour neuf
   * qui bougent — le pinceau devient poisseux des la premiere grande salle.
   */
  rafraichirTerrain(c: Calque, cx: number, cy: number, rayon = 1): void {
    if (!c.terrain || !c.presence) return
    const t = c.terrain
    const presence = c.presence
    const g = {
      largeur: this.largeur,
      hauteur: this.hauteur,
      plein: (x: number, y: number): boolean => presence[this.index(x, y)] !== 0,
    }
    for (let y = cy - rayon; y <= cy + rayon; y++) {
      for (let x = cx - rayon; x <= cx + rayon; x++) {
        if (!this.dedans(x, y)) continue
        const i = this.index(x, y)
        c.cases[i] = presence[i]
          ? t.tuileDepart + tuilePour(g, x, y, t.jeu, t.dehorsEstPlein)
          : VIDE
      }
    }
  }

  /** Repeint tout un calque de terrain. Pour un chargement, pas pour un pinceau. */
  rafraichirTout(c: Calque): void {
    if (!c.terrain || !c.presence) return
    for (let y = 0; y < this.hauteur; y++) {
      for (let x = 0; x < this.largeur; x++) this.rafraichirTerrain(c, x, y, 0)
    }
  }

  /** Pose ou retire du terrain, et met a jour le voisinage. */
  peindreTerrain(c: Calque, cx: number, cy: number, present: boolean): void {
    if (!c.presence || !this.dedans(cx, cy)) return
    const i = this.index(cx, cy)
    const avant = c.presence[i]
    c.presence[i] = present ? 1 : 0
    if (avant === c.presence[i]) return
    this.rafraichirTerrain(c, cx, cy, 1)
  }
}
