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

/**
 * Ce qu'une case FAIT, en plus de ce qu'elle montre.
 *
 * ## Pourquoi un bit ne suffisait pas
 *
 * La grille de collision ne disait qu'une chose : ca bloque, ou ca ne bloque
 * pas. Avec ce seul bit on ne peut ecrire ni une pointe, ni une plateforme
 * qu'on traverse par en dessous, ni une echelle, ni de l'eau — c'est-a-dire
 * qu'on ne peut faire ni Celeste, ni Dead Cells, ni la moitie d'un Isaac. Ces
 * quatre-la ne sont pas des cas particuliers : ce sont les briques dont tout
 * le monde se sert.
 *
 * ## Pourquoi des drapeaux et non une liste de types
 *
 * Une pointe peut etre solide (un bloc herisse) ou non (des piques au sol
 * qu'on traverse en sautant). De l'eau peut blesser. Un type unique par case
 * obligerait a inventer « solide-et-blessant », puis « solide-et-blessant-et
 * -liquide ». Des drapeaux se combinent, et la combinaison qu'on n'a pas
 * prevue marche quand meme.
 */
export const RIEN = 0
export const SOLIDE = 1
/**
 * Une plateforme : solide quand on TOMBE dessus, traversable autrement.
 *
 * La regle exacte est dans `deplacer` : elle ne bloque que si le bas du corps
 * arrive pile sur le haut de la case. Tester « on descend » ne suffit pas —
 * un corps deja enfonce dedans resterait pris.
 */
export const PLATEFORME = 2
export const BLESSANTE = 4
export const ECHELLE = 8
export const LIQUIDE = 16
/**
 * Une pente a quarante-cinq degres, montant vers la DROITE ou vers la GAUCHE.
 *
 * ## Pourquoi seulement quarante-cinq degres
 *
 * Une pente est definie par la hauteur du sol EN CHAQUE COLONNE de pixels de
 * la case. A quarante-cinq degres, cette hauteur vaut la position dans la
 * case : une soustraction. Pour un angle quelconque il faudrait une table par
 * angle, un arrondi par colonne, et deux tuiles voisines qui ne se raccordent
 * pas au pixel pres — le defaut qu'on voit dans la moitie des jeux amateurs,
 * ou le personnage sautille en montant une colline.
 *
 * Les demi-pentes (deux cases pour monter d'une) sont la suite naturelle, et
 * elles se decrivent avec les memes deux drapeaux plus une hauteur de depart.
 * Elles ne sont pas la ; le dire vaut mieux que de laisser croire.
 *
 * ## Pourquoi ce n'est pas « solide »
 *
 * Une pente marquee solide bloque comme un mur : on se cogne dans le bas de la
 * cote au lieu de la monter. Les deux drapeaux sont donc distincts de SOLIDE,
 * et `hauteurSol` decide, colonne par colonne, ou le sol se trouve.
 */
export const PENTE_DROITE = 32
export const PENTE_GAUCHE = 64

/** Le nom de chaque drapeau, pour l'editeur et les rapports. */
export const MATIERES: { drapeau: number; nom: string; aide: string }[] = [
  { drapeau: SOLIDE, nom: 'Solide', aide: 'Bloque dans toutes les directions.' },
  { drapeau: PLATEFORME, nom: 'Plateforme', aide: 'Solide quand on tombe dessus, traversable par en dessous.' },
  { drapeau: BLESSANTE, nom: 'Blessante', aide: 'Fait mal à ce qui la touche. Une pointe, un brasier.' },
  { drapeau: ECHELLE, nom: 'Échelle', aide: 'On y monte. Ne bloque pas.' },
  { drapeau: LIQUIDE, nom: 'Liquide', aide: 'On y avance moins vite. Ne bloque pas.' },
  { drapeau: PENTE_DROITE, nom: 'Pente ↗', aide: 'Monte vers la droite, à quarante-cinq degrés.' },
  { drapeau: PENTE_GAUCHE, nom: 'Pente ↖', aide: 'Monte vers la gauche, à quarante-cinq degrés.' },
]

/**
 * La hauteur du sol dans une case, pour une colonne de pixels donnee.
 *
 * Rend la distance depuis le HAUT de la case : zero veut dire « le sol est au
 * sommet de la case », `tuile` veut dire « il n'y a pas de sol ici ». On
 * compte depuis le haut parce que c'est le sens de l'ecran, et que compter
 * depuis le bas obligerait a inverser a chaque usage — donc a se tromper une
 * fois sur deux.
 *
 * `x` est la position DANS la case, de 0 a tuile-1.
 */
export function hauteurSol(matiere: number, x: number, tuile: number): number {
  if ((matiere & PENTE_DROITE) !== 0) return tuile - 1 - x
  if ((matiere & PENTE_GAUCHE) !== 0) return x
  if ((matiere & SOLIDE) !== 0) return 0
  return tuile
}

/** Vrai si cette matiere est une pente, d'un cote ou de l'autre. */
export const estPente = (m: number): boolean =>
  (m & (PENTE_DROITE | PENTE_GAUCHE)) !== 0

/**
 * La matiere, en un caractere.
 *
 * En base trente-six : une case reste UN caractere, une rangee reste une
 * ligne, et un diff montre toujours la case qui a change. Les anciens fichiers
 * n'ecrivaient que des zeros et des uns — ils se relisent tels quels, puisque
 * zero vaut RIEN et un vaut SOLIDE dans les deux lectures.
 */
export const matiereEnCaractere = (m: number): string =>
  // On borne, on ne masque pas : « et 35 » vaut 100011 en binaire et effacerait
  // le drapeau quatre. Cinq drapeaux montent a trente-et-un, la borne ne sert
  // donc jamais — elle est la pour que le sixieme ne casse rien en silence.
  Math.min(35, Math.max(0, m)).toString(36)
export const caractereEnMatiere = (c: string): number => {
  const n = parseInt(c, 36)
  return Number.isNaN(n) ? 0 : n
}

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
  /**
   * Ce que chaque case FAIT : un jeu de drapeaux, independant du dessin.
   *
   * Le nom est reste au pluriel de « solide » parce que c'est ce qu'il porte
   * neuf fois sur dix, et que le renommer aurait touche tout le depot pour un
   * gain de vocabulaire.
   */
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

  /** La matiere d'une case. Hors carte : solide, on ne sort pas du monde. */
  matiere(cx: number, cy: number): number {
    if (!this.dedans(cx, cy)) return SOLIDE
    return this.solides[this.index(cx, cy)]
  }

  /** Vrai si la case bloque en toutes circonstances. */
  solide(cx: number, cy: number): boolean {
    return (this.matiere(cx, cy) & SOLIDE) !== 0
  }

  /** La matiere au point du monde donne, en pixels. */
  matiereEn(x: number, y: number): number {
    return this.matiere(Math.floor(x / this.tuile), Math.floor(y / this.tuile))
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
