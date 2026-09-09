/**
 * Les entrees, avec la memoire courte qu'il faut pour qu'un jeu reponde.
 *
 * ## Pourquoi une memoire, et pas juste « la touche est-elle enfoncee »
 *
 * Un jeu tourne a pas fixe. Une touche pressee et relachee entre deux pas
 * n'existe simplement pas pour lui : le joueur a appuye, le jeu n'a rien vu,
 * et c'est le jeu qui a tort. Sur un banc de l'editeur de sprites, six appuis
 * sur neuf disparaissaient de cette maniere.
 *
 * Chaque appui est donc DATE, et `vientDePresser` regarde en arriere sur une
 * fenetre courte. Le joueur qui appuie sur « sauter » un dixieme de seconde
 * trop tot obtient son saut — ce que tous les bons jeux de plateforme font, et
 * qu'aucun ne documente.
 *
 * ## Les actions plutot que les touches
 *
 * Le jeu demande « est-ce que le joueur veut aller a droite », pas « est-ce
 * que la fleche droite est enfoncee ». Sans cette couche, changer les touches
 * ou ajouter la manette demande de reprendre tout le code du jeu.
 */

/** Duree, en millisecondes, pendant laquelle un appui reste « recent ». */
export const MEMOIRE_MS = 150

export type Action = string

export class Entrees {
  private enfoncees = new Set<string>()
  private datesAppui = new Map<string, number>()
  private datesRelache = new Map<string, number>()
  /** Action -> touches qui la declenchent. */
  private plan = new Map<Action, string[]>()
  private detacher: (() => void) | null = null

  constructor(plan?: Record<Action, string[]>) {
    this.definirPlan(plan ?? {
      gauche: ['ArrowLeft', 'KeyA', 'KeyQ'],
      droite: ['ArrowRight', 'KeyD'],
      haut: ['ArrowUp', 'KeyW', 'KeyZ'],
      bas: ['ArrowDown', 'KeyS'],
      action: ['Space', 'KeyE', 'Enter'],
      annuler: ['Escape'],
    })
  }

  definirPlan(plan: Record<Action, string[]>): void {
    this.plan = new Map(Object.entries(plan))
  }

  /** Branche l'ecoute clavier. Rend la fonction qui la debranche. */
  brancher(cible: EventTarget = window): () => void {
    const bas = (e: Event): void => {
      const k = (e as KeyboardEvent).code
      // `repeat` est ignore : une touche maintenue ne doit pas compter comme
      // une suite d'appuis, sinon un menu defile a la vitesse du clavier.
      if ((e as KeyboardEvent).repeat) return
      this.enfoncees.add(k)
      this.datesAppui.set(k, performance.now())
    }
    const haut = (e: Event): void => {
      const k = (e as KeyboardEvent).code
      this.enfoncees.delete(k)
      this.datesRelache.set(k, performance.now())
    }
    // Une fenetre qui perd le focus garde ses touches enfoncees pour toujours :
    // on revient sur le jeu et le personnage court tout seul.
    const perdu = (): void => { this.enfoncees.clear() }

    cible.addEventListener('keydown', bas)
    cible.addEventListener('keyup', haut)
    window.addEventListener('blur', perdu)
    this.detacher = () => {
      cible.removeEventListener('keydown', bas)
      cible.removeEventListener('keyup', haut)
      window.removeEventListener('blur', perdu)
    }
    return this.detacher
  }

  debrancher(): void { this.detacher?.(); this.detacher = null }

  private touches(a: Action): string[] { return this.plan.get(a) ?? [] }

  /** L'action est-elle maintenue en ce moment ? */
  tenue(a: Action): boolean {
    return this.touches(a).some((k) => this.enfoncees.has(k))
  }

  /** L'action a-t-elle ete demandee dans la fenetre de memoire ? */
  vientDePresser(a: Action, memoire = MEMOIRE_MS): boolean {
    const t = performance.now()
    return this.touches(a).some((k) => t - (this.datesAppui.get(k) ?? -1e9) <= memoire)
  }

  vientDeRelacher(a: Action, memoire = MEMOIRE_MS): boolean {
    const t = performance.now()
    return this.touches(a).some((k) => t - (this.datesRelache.get(k) ?? -1e9) <= memoire)
  }

  /**
   * Consomme l'appui : la meme demande ne sera pas servie deux fois.
   *
   * Sans cela, une action lue a chaque pas pendant la fenetre de memoire se
   * declencherait plusieurs fois pour un seul appui — on ouvre le coffre, et
   * on le referme dans la foulee.
   */
  consommer(a: Action, memoire = MEMOIRE_MS): boolean {
    if (!this.vientDePresser(a, memoire)) return false
    for (const k of this.touches(a)) this.datesAppui.delete(k)
    return true
  }

  /** Direction demandee, en -1, 0 ou 1 sur chaque axe. */
  axe(): { x: number; y: number } {
    return {
      x: (this.tenue('droite') ? 1 : 0) - (this.tenue('gauche') ? 1 : 0),
      y: (this.tenue('bas') ? 1 : 0) - (this.tenue('haut') ? 1 : 0),
    }
  }

  /** Pour les bancs : simule un appui sans clavier. */
  simulerAppui(code: string): void {
    this.enfoncees.add(code)
    this.datesAppui.set(code, performance.now())
  }
  simulerRelache(code: string): void {
    this.enfoncees.delete(code)
    this.datesRelache.set(code, performance.now())
  }
}
