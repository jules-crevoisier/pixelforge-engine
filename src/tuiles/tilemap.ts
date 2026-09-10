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
 * Les pentes : direction, et raideur.
 *
 * ## Comment une pente est definie
 *
 * Par la hauteur du sol EN CHAQUE COLONNE de pixels de la case. Ce n'est pas
 * un angle : c'est une table implicite, et c'est ce qui permet a deux cases
 * voisines de se raccorder au pixel pres. Un angle quelconque demanderait un
 * arrondi par colonne et deux tuiles qui ne se rejoignent pas — le defaut
 * qu'on voit dans la moitie des jeux amateurs, ou le personnage sautille en
 * montant une colline.
 *
 * ## Les deux raideurs, et pourquoi il n'y en a pas trois
 *
 * `PENTE_DROITE` et `PENTE_GAUCHE` disent le SENS de la montee.
 * `PENTE_DEMI` dit qu'il faut DEUX cases pour monter d'une, au lieu d'une
 * seule : le pas de la pente vaut alors un pixel toutes les deux colonnes, ce
 * qui reste exact — un demi n'est pas un arrondi. `PENTE_HAUTE` distingue,
 * parmi les deux cases d'une demi-pente, celle du HAUT.
 *
 * Un tiers, un quart, un cinquieme seraient le meme calcul avec un autre
 * diviseur. On s'arrete a deux parce que trois cases pour monter d'une case
 * de seize pixels donne une cote de cinq degres, qu'on ne distingue plus d'un
 * sol plat, et parce que chaque raideur de plus est une tuile de plus a
 * dessiner. Le jour ou il en faut une, c'est un drapeau et une division.
 *
 * ## Pourquoi ce n'est pas « solide »
 *
 * Une pente marquee solide bloque comme un mur : on se cogne dans le bas de la
 * cote au lieu de la monter. Les drapeaux sont donc distincts de SOLIDE, et
 * `hauteurSol` decide, colonne par colonne, ou le sol se trouve.
 */
export const PENTE_DROITE = 32
export const PENTE_GAUCHE = 64
/** Deux cases pour monter d'une, au lieu d'une seule. */
export const PENTE_DEMI = 128
/** Parmi les deux cases d'une demi-pente, celle du haut. Sans `PENTE_DEMI` : rien. */
export const PENTE_HAUTE = 256

/**
 * Les matieres qui SE COMBINENT, et leur nom.
 *
 * Une pointe peut etre solide, de l'eau peut blesser : ce sont des cases a
 * cocher, et une liste de choix exclusifs obligerait a inventer
 * « solide-et-blessant », puis « solide-et-blessant-et-liquide ».
 */
export const MATIERES: { drapeau: number; nom: string; aide: string }[] = [
  { drapeau: SOLIDE, nom: 'Solide', aide: 'Bloque dans toutes les directions.' },
  { drapeau: PLATEFORME, nom: 'Plateforme', aide: 'Solide quand on tombe dessus, traversable par en dessous.' },
  { drapeau: BLESSANTE, nom: 'Blessante', aide: 'Fait mal à ce qui la touche. Une pointe, un brasier.' },
  { drapeau: ECHELLE, nom: 'Échelle', aide: 'On y monte. Ne bloque pas.' },
  { drapeau: LIQUIDE, nom: 'Liquide', aide: 'On y avance moins vite. Ne bloque pas.' },
]

/**
 * Les formes de pente, qui S'EXCLUENT.
 *
 * Elles ne sont pas des cases a cocher, et ce n'est pas une simplification de
 * l'interface : une case n'a qu'une surface. « Monte a droite » ET « monte a
 * gauche » ne decrit rien, et « pente » ET « solide » decrit deux sols a la
 * fois. Le format ne sait pas les ecrire ensemble ; l'editeur ne doit donc pas
 * les proposer ensemble, sinon il laisse composer ce qui sera perdu a
 * l'enregistrement.
 *
 * « Blessante », elle, se coche par-dessus : une rampe herissee de pointes
 * existe, et c'est la seule combinaison qui ait un sens.
 */
export const FORMES_PENTE_NOMMEES: { drapeaux: number; nom: string; aide: string }[] = [
  { drapeaux: PENTE_DROITE, nom: 'Pente ↗', aide: 'Monte vers la droite, à quarante-cinq degrés.' },
  { drapeaux: PENTE_GAUCHE, nom: 'Pente ↖', aide: 'Monte vers la gauche, à quarante-cinq degrés.' },
  { drapeaux: PENTE_DROITE | PENTE_DEMI, nom: 'Demi ↗ bas',
    aide: 'Deux cases pour monter d’une, vers la droite : la première.' },
  { drapeaux: PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE, nom: 'Demi ↗ haut',
    aide: 'Deux cases pour monter d’une, vers la droite : la seconde.' },
  { drapeaux: PENTE_GAUCHE | PENTE_DEMI, nom: 'Demi ↖ bas',
    aide: 'Deux cases pour monter d’une, vers la gauche : la première rencontrée.' },
  { drapeaux: PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE, nom: 'Demi ↖ haut',
    aide: 'Deux cases pour monter d’une, vers la gauche : la seconde.' },
]

/** Tout ce qui decrit une pente, en un seul masque. */
export const PENTE = PENTE_DROITE | PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE

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
 *
 * C'est LA fonction de la pente : le controleur, le dessin de l'editeur et
 * les six chargeurs doivent tous s'y ramener. Deux endroits qui calculent
 * cette hauteur sont deux endroits qui divergeront, et le personnage
 * s'enfoncera d'un pixel dans la cote sans qu'on sache lequel a tort.
 */
export function hauteurSol(matiere: number, x: number, tuile: number): number {
  const versDroite = (matiere & PENTE_DROITE) !== 0
  if (!versDroite && (matiere & PENTE_GAUCHE) === 0) {
    return (matiere & SOLIDE) !== 0 ? 0 : tuile
  }
  // L'avancee LE LONG de la montee : on lit la case a l'envers quand elle
  // monte vers la gauche, ce qui evite d'ecrire deux fois la meme formule
  // — et donc de n'en corriger qu'une.
  const u = versDroite ? x : tuile - 1 - x
  const demi = (matiere & PENTE_DEMI) !== 0
  // La moitie haute d'une demi-pente part a mi-case : c'est ce qui raccorde
  // les deux cases sans marche. La moitie basse part du bas, comme une pente
  // entiere.
  const depart = demi && (matiere & PENTE_HAUTE) !== 0 ? (tuile >> 1) - 1 : tuile - 1
  return depart - (demi ? u >> 1 : u)
}

/** Vrai si cette matiere est une pente, d'un cote ou de l'autre. */
export const estPente = (m: number): boolean =>
  (m & (PENTE_DROITE | PENTE_GAUCHE)) !== 0

/**
 * La matiere, en un caractere.
 *
 * ## Pourquoi un seul caractere
 *
 * Une case reste UN caractere, une rangee reste une ligne, et un diff montre
 * toujours la case qui a change. Deux caracteres par case doubleraient la
 * taille et rendraient une rangee illisible a l'oeil.
 *
 * ## Pourquoi ce n'est plus la base trente-six
 *
 * Elle l'a ete, et c'etait faux. Les drapeaux montent maintenant plus haut que
 * trente-cinq, et le code BORNAIT a trente-cinq « pour que rien ne casse en
 * silence » — c'est-a-dire qu'il cassait en silence : une pente montant a
 * GAUCHE vaut soixante-quatre, sortait en « z », et se relisait en
 * trente-cinq. Toute colline tournee vers la gauche se rouvrait en mur. La
 * borne ne protegeait rien : elle transformait une valeur juste en une autre,
 * plausible, et fausse.
 *
 * ## Comment on tient dans un caractere quand meme
 *
 * En separant ce qui se combine de ce qui s'exclut. Les cinq matieres —
 * solide, plateforme, blessante, echelle, liquide — se combinent librement :
 * trente-deux valeurs, de 0 a 31, ecrites comme avant. Une pente, elle, n'est
 * jamais solide ni plateforme ni echelle ni liquide : c'est le contraire meme
 * d'une pente. Les pentes occupent donc les valeurs SUIVANTES, une par forme,
 * avec ou sans « blessante » — une rampe herissee de pointes existe.
 *
 * L'alphabet passe de trente-six a soixante-deux caracteres : chiffres,
 * minuscules, puis MAJUSCULES. Les trente-six premiers ne bougent pas, si bien
 * qu'un fichier ecrit avant se relit sans une ligne de migration ; « w »
 * valait deja une pente montant a droite, et la vaut toujours.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Les cinq matieres qui se combinent librement. */
const MATIERES_LIBRES = SOLIDE | PLATEFORME | BLESSANTE | ECHELLE | LIQUIDE

/** Les formes de pente, dans l'ordre ou elles s'ecrivent. */
const FORMES_PENTE = [
  PENTE_DROITE,
  PENTE_GAUCHE,
  PENTE_DROITE | PENTE_DEMI,
  PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
  PENTE_GAUCHE | PENTE_DEMI,
  PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
]

/** La premiere valeur ecrite qui designe une pente. */
const BASE_PENTE = 32

export const matiereEnCaractere = (m: number): string => {
  if (!estPente(m)) {
    // On MASQUE au lieu de borner : borner rendrait une valeur voisine, donc
    // une matiere differente et plausible. Un drapeau qu'on ne sait pas ecrire
    // doit disparaitre, pas se deguiser en un autre.
    return ALPHABET[m & MATIERES_LIBRES] ?? '0'
  }
  const forme = FORMES_PENTE.indexOf(m & PENTE)
  if (forme < 0) return '0'
  const blessante = (m & BLESSANTE) !== 0 ? FORMES_PENTE.length : 0
  return ALPHABET[BASE_PENTE + forme + blessante] ?? '0'
}

export const caractereEnMatiere = (c: string): number => {
  const v = ALPHABET.indexOf(c)
  if (v < 0) return 0
  if (v < BASE_PENTE) return v
  const rang = v - BASE_PENTE
  const forme = FORMES_PENTE[rang % FORMES_PENTE.length]
  if (forme === undefined) return 0
  return forme | (rang >= FORMES_PENTE.length ? BLESSANTE : 0)
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
  /**
   * La collision, un jeu de drapeaux par case.
   *
   * Seize bits et non huit : les matieres montent a neuf drapeaux depuis les
   * demi-pentes, et « moitie haute » vaut deux cent cinquante-six. Dans un
   * tableau d'octets, il repassait a zero — une demi-pente haute devenait une
   * demi-pente basse, sans une erreur, sans un avertissement, et le
   * personnage s'arretait a mi-cote.
   */
  solides: Uint16Array

  constructor(largeur: number, hauteur: number, tuile = 16) {
    this.largeur = largeur
    this.hauteur = hauteur
    this.tuile = tuile
    this.solides = new Uint16Array(largeur * hauteur)
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
