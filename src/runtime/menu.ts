/**
 * Les menus : un ecran-titre, une pause, un reglage.
 *
 * ## Pourquoi c'est un objet et non un ecran de plus
 *
 * Un ecran-titre, un menu de pause et une liste de reglages sont la meme
 * chose : des entrees, un curseur, et ce qui se passe quand on valide. Les
 * ecrire trois fois donnerait trois fois l'occasion de traiter la boucle du
 * curseur differemment, et l'un des trois s'arreterait a la derniere ligne
 * pendant que les deux autres bouclent.
 *
 * ## Pourquoi les entrees inertes existent
 *
 * « Continuer » sans partie enregistree doit se VOIR et ne pas repondre.
 * Le retirer de la liste change la place de tout le reste d'un ecran a
 * l'autre, et l'on appuie alors sur « Nouvelle partie » en croyant appuyer sur
 * « Options ». Une entree grisee garde la geographie du menu.
 */

export interface Entree {
  texte: string
  /** Ce que l'entree designe. */
  valeur: string
  /** Fausse : l'entree se voit, se saute, et ne se choisit pas. */
  active: boolean
}

export function entree(texte: string, valeur: string, active = true): Entree {
  return { texte, valeur, active }
}

export class Menu {
  entrees: Entree[]
  private index = 0
  /** Vrai quand aucune entree n'est choisissable. */
  get vide(): boolean { return !this.entrees.some((e) => e.active) }

  constructor(entrees: Entree[] = []) {
    this.entrees = entrees
    this.index = this.premiereActive(0, 1)
  }

  get curseur(): number { return this.index }
  get choisie(): Entree | null { return this.entrees[this.index] ?? null }

  private premiereActive(depuis: number, sens: number): number {
    const n = this.entrees.length
    if (n === 0) return 0
    for (let k = 0; k < n; k++) {
      const i = ((depuis + k * sens) % n + n) % n
      if (this.entrees[i]?.active) return i
    }
    return depuis
  }

  /**
   * Deplace le curseur en sautant les entrees inertes, et en bouclant.
   *
   * Boucler n'est pas un detail : sur un menu de trois lignes, descendre une
   * quatrieme fois pour revenir en haut est ce que tout le monde essaie. Un
   * menu qui bute sur sa derniere ligne donne l'impression d'avoir plante.
   */
  deplacer(d: number): boolean {
    if (this.vide) return false
    const avant = this.index
    const n = this.entrees.length
    let i = this.index
    for (let k = 0; k < n; k++) {
      i = ((i + d) % n + n) % n
      if (this.entrees[i]?.active) break
    }
    this.index = i
    return i !== avant
  }

  /** Rend la valeur choisie, ou vide si l'entree est inerte. */
  valider(): string {
    const e = this.choisie
    return e && e.active ? e.valeur : ''
  }

  /** Change les entrees en gardant la selection si elle reste possible. */
  remplacer(entrees: Entree[]): void {
    const valeur = this.choisie?.valeur
    this.entrees = entrees
    const i = entrees.findIndex((e) => e.valeur === valeur && e.active)
    this.index = i >= 0 ? i : this.premiereActive(0, 1)
  }
}
