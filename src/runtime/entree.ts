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
 *
 * ## Pourquoi la memoire se compte en PAS et non en millisecondes
 *
 * Elle se comptait en millisecondes, lues sur `performance.now()`. La regle
 * etait juste et le resultat n'etait pas REPRODUCTIBLE : deux executions des
 * memes touches, sur la meme machine, ne rendaient pas la meme partie, parce
 * que l'horloge murale ne retombe jamais sur les memes valeurs. Tout le reste
 * du moteur est deterministe — le pas est fixe, le hasard vient d'une graine —
 * et cette seule lecture d'horloge suffisait a tout ruiner : ni rejeu, ni
 * verification d'une partie, ni la moindre forme de multijoueur a rembobinage.
 *
 * Un appui est donc date par le NUMERO DU PAS ou il a eu lieu. La boucle dit
 * a chaque pas ou l'on en est ; entre deux pas, les evenements du clavier
 * s'inscrivent au pas courant. Les reglages restent exprimes en millisecondes
 * — c'est l'unite qui se compare a l'oeil — et se convertissent en pas au
 * moment de la lecture.
 *
 * On y perd une chose, et c'est correct : deux appuis de la meme touche dans
 * un seul pas ne se distinguent plus. Un jeu a pas fixe ne pouvait de toute
 * facon pas les voir ; l'horloge donnait l'illusion du contraire.
 */

/** Duree, en millisecondes, pendant laquelle un appui reste « recent ». */
export const MEMOIRE_MS = 150

export type Action = string

/**
 * L'etat des entrees a un pas donne, sous une forme qui se transmet.
 *
 * Deux masques de bits sur une liste d'actions ORDONNEE : ce qui est tenu, et
 * ce qui vient d'etre presse. Deux entiers suffisent donc a decrire un pas de
 * jeu, ce qui est exactement ce qu'un rembobinage doit garder pour chaque pas
 * et ce qu'un reseau doit transmettre.
 *
 * L'ordre des actions fait partie du format : deux programmes qui ne
 * l'accordent pas liraient « saut » la ou l'autre a ecrit « dash ». Il est
 * donc fixe ici, et l'on n'ajoute qu'A LA FIN.
 */
export const ACTIONS_ORDRE: Action[] = [
  'gauche', 'droite', 'haut', 'bas', 'action', 'saut', 'dash', 'annuler',
]

export interface EtatEntrees {
  /** Bit par action de `ACTIONS_ORDRE` : l'action est maintenue. */
  tenues: number
  /** Bit par action : l'action vient d'etre pressee a ce pas. */
  appuis: number
}

export const ETAT_VIDE: EtatEntrees = { tenues: 0, appuis: 0 }

export class Entrees {
  private enfoncees = new Set<string>()
  /** Touche -> numero du pas ou elle a ete pressee. Jamais une heure. */
  private pasAppui = new Map<string, number>()
  private pasRelache = new Map<string, number>()
  /** Action -> touches qui la declenchent. */
  private plan = new Map<Action, string[]>()
  private detacher: (() => void) | null = null

  /**
   * Le pas de simulation courant. C'est la seule horloge de ce fichier.
   *
   * Il vaut -1 avant le premier pas : zero ferait passer un appui jamais
   * survenu pour un appui du pas zero, et le premier saut partirait tout seul.
   */
  private pasCourant = -1
  /** Duree d'un pas, pour convertir les reglages exprimes en millisecondes. */
  pasMs = 1000 / 60
  /**
   * L'etat impose, quand il y en a un. Le clavier est alors ignore.
   *
   * C'est par la que passent le rejeu d'une partie enregistree et la
   * resimulation d'un rembobinage : le meme code de jeu tourne, et il ne sait
   * pas d'ou viennent les entrees. S'il le savait, il faudrait deux chemins —
   * et le deuxieme ne serait eprouve qu'a moitie.
   */
  private impose: EtatEntrees | null = null
  /** Les appuis deja consommes a ce pas, quand l'etat est impose. */
  private consommes = 0
  /**
   * Le pas du dernier appui consomme, PAR ACTION, pour le clavier local.
   *
   * ## Pourquoi par action, et non par touche
   *
   * La consommation supprimait l'appui de la TOUCHE — et la barre d'espace
   * sert a « action » ET a « saut », par conception : dans un jeu vu de
   * dessus il n'y a pas de saut, dans un jeu de plateforme l'epee et le saut
   * cohabitent. Frapper consommait donc le saut : le heros d'un projet relu
   * marchait contre une marche d'une case sans jamais decoller, et seul un
   * vrai navigateur l'a montre. Le chemin RESEAU consommait deja par action
   * — un masque de bits par rang — et les deux chemins divergeaient : la
   * meme partie ne se rejouait pas pareil selon qu'elle etait locale ou
   * imposee. Une seule regle, la bonne : consommer une action n'eteint
   * qu'elle.
   */
  private consommesLocaux = new Map<Action, number>()

  constructor(plan?: Record<Action, string[]>) {
    this.definirPlan(plan ?? {
      gauche: ['ArrowLeft', 'KeyA', 'KeyQ'],
      droite: ['ArrowRight', 'KeyD'],
      haut: ['ArrowUp', 'KeyW', 'KeyZ'],
      bas: ['ArrowDown', 'KeyS'],
      action: ['Space', 'KeyE', 'Enter'],
      // Le saut partage la barre d'espace avec « action » et la fleche haut
      // avec « haut » : dans un jeu vu de dessus il n'y a pas de saut, dans un
      // jeu de plateforme il n'y a pas de haut, et personne n'a jamais eu a
      // choisir. Deux actions peuvent tenir sur la meme touche — c'est
      // justement ce qu'un plan de touches sert a exprimer.
      saut: ['Space', 'KeyC', 'ArrowUp', 'KeyW'],
      dash: ['ShiftLeft', 'ShiftRight', 'KeyX'],
      annuler: ['Escape'],
    })
  }

  definirPlan(plan: Record<Action, string[]>): void {
    this.plan = new Map(Object.entries(plan))
  }

  /**
   * Le plan courant, sous une forme qui s'ecrit dans un fichier.
   *
   * Les codes inventes pour le tactile et la manette — ceux qui commencent par
   * une arobase — en sont retires : ils ne designent aucune touche, et les
   * enregistrer ferait croire a un plan qu'on pourrait modifier.
   */
  planCourant(): Record<Action, string[]> {
    const sortie: Record<Action, string[]> = {}
    for (const [a, k] of this.plan) sortie[a] = k.filter((c) => !c.startsWith('@'))
    return sortie
  }

  /** Branche l'ecoute clavier. Rend la fonction qui la debranche. */
  brancher(cible: EventTarget = window): () => void {
    const bas = (e: Event): void => {
      const k = (e as KeyboardEvent).code
      // `repeat` est ignore : une touche maintenue ne doit pas compter comme
      // une suite d'appuis, sinon un menu defile a la vitesse du clavier.
      if ((e as KeyboardEvent).repeat) return
      this.enfoncees.add(k)
      // Au pas COURANT : l'evenement arrive entre deux pas, et c'est le pas en
      // cours qui doit le voir. L'inscrire au pas suivant retarderait chaque
      // appui d'une image, ce qui se sent immediatement au saut.
      this.pasAppui.set(k, this.pasCourant)
    }
    const haut = (e: Event): void => {
      const k = (e as KeyboardEvent).code
      this.enfoncees.delete(k)
      this.pasRelache.set(k, this.pasCourant)
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

  /**
   * Les zones de l'ecran qui valent une action, pour le tactile.
   *
   * En FRACTIONS de la surface et non en pixels : la meme description marche
   * sur un telephone et sur une tablette, ce qui est tout l'interet. En
   * pixels, il faudrait un jeu de zones par appareil.
   */
  private zones: { x: number; y: number; l: number; h: number; action: Action }[] = []
  private doigts = new Map<number, Action>()
  private detacherTactile: (() => void) | null = null

  /**
   * Branche le tactile sur une surface, avec des zones.
   *
   * ## Pourquoi des zones et pas des boutons dessines
   *
   * Un bouton dessine appartient a l'interface ; une zone appartient aux
   * ENTREES. Les separer permet a un jeu de dessiner ses boutons comme il veut
   * — ou de ne pas les dessiner du tout, ce que font les jeux ou l'on pose le
   * pouce n'importe ou a gauche pour marcher.
   *
   * ## Pourquoi on suit chaque doigt
   *
   * Un doigt qui glisse de la zone « gauche » a la zone « droite » doit
   * relacher l'une et presser l'autre. En ne regardant que les appuis et les
   * relevers, le personnage continuerait de courir a gauche pendant qu'on
   * pousse a droite — et l'on croirait le jeu casse.
   */
  brancherTactile(
    cible: HTMLElement,
    zones: { x: number; y: number; l: number; h: number; action: Action }[],
  ): () => void {
    this.zones = zones
    const actionSous = (e: PointerEvent): Action | null => {
      const b = cible.getBoundingClientRect()
      if (b.width <= 0 || b.height <= 0) return null
      const fx = (e.clientX - b.left) / b.width
      const fy = (e.clientY - b.top) / b.height
      for (const z of this.zones) {
        if (fx >= z.x && fx < z.x + z.l && fy >= z.y && fy < z.y + z.h) return z.action
      }
      return null
    }
    const poser = (e: Event): void => {
      const p = e as PointerEvent
      const a = actionSous(p)
      const avant = this.doigts.get(p.pointerId)
      if (avant === a) return
      if (avant) this.relacherAction(avant)
      if (a) { this.doigts.set(p.pointerId, a); this.presserAction(a) }
      else this.doigts.delete(p.pointerId)
      e.preventDefault()
    }
    const lever = (e: Event): void => {
      const p = e as PointerEvent
      const a = this.doigts.get(p.pointerId)
      if (a) this.relacherAction(a)
      this.doigts.delete(p.pointerId)
    }
    const bouger = (e: Event): void => {
      if (!this.doigts.has((e as PointerEvent).pointerId)) return
      poser(e)
    }
    cible.addEventListener('pointerdown', poser)
    cible.addEventListener('pointermove', bouger)
    cible.addEventListener('pointerup', lever)
    cible.addEventListener('pointercancel', lever)
    this.detacherTactile = () => {
      cible.removeEventListener('pointerdown', poser)
      cible.removeEventListener('pointermove', bouger)
      cible.removeEventListener('pointerup', lever)
      cible.removeEventListener('pointercancel', lever)
      this.doigts.clear()
    }
    return this.detacherTactile
  }

  /**
   * Presse une ACTION directement, sans passer par une touche.
   *
   * Le tactile et la manette n'ont pas de code de touche. On leur invente un
   * code — le nom de l'action, prefixe — plutot que de tenir un deuxieme
   * mecanisme a cote du clavier : deux mecanismes finissent par diverger, et
   * l'un des deux oublie la memoire des appuis.
   */
  presserAction(a: Action): void {
    const k = `@${a}`
    if (!this.plan.has(a)) this.plan.set(a, [])
    const codes = this.plan.get(a) as string[]
    if (!codes.includes(k)) codes.push(k)
    if (this.enfoncees.has(k)) return
    this.enfoncees.add(k)
    this.pasAppui.set(k, this.pasCourant)
  }

  relacherAction(a: Action): void {
    const k = `@${a}`
    this.enfoncees.delete(k)
    this.pasRelache.set(k, this.pasCourant)
  }

  /**
   * Les manettes branchees, lues a chaque pas.
   *
   * ## Pourquoi on INTERROGE au lieu d'ecouter
   *
   * Une manette n'envoie pas d'evenement : on lit son etat. C'est donc a la
   * boucle de la consulter, une fois par pas, au moment ou elle dit aux
   * entrees ou l'on en est. Le faire a l'image donnerait un etat de manette
   * different de l'etat du clavier au meme pas, et un rejeu ne reproduirait
   * plus rien.
   *
   * ## Le plan par defaut
   *
   * Celui d'une manette de salon : la croix pour se diriger, le bouton du bas
   * pour sauter, celui de droite pour agir, les gachettes pour le dash. On y
   * ajoute les axes du stick gauche, avec une zone morte — sans elle, un stick
   * use fait marcher le personnage tout seul.
   */
  planManette: Record<number, Action> = {
    0: 'saut', 1: 'action', 2: 'action', 3: 'dash',
    5: 'dash', 7: 'dash',
    9: 'annuler',
    12: 'haut', 13: 'bas', 14: 'gauche', 15: 'droite',
  }

  /** En deca de quoi un stick est considere au repos. */
  zoneMorte = 0.35

  private manetteActive = false

  /** Lit les manettes et convertit leur etat en actions. */
  lireManettes(): void {
    const nav = globalThis as unknown as { navigator?: { getGamepads?: () => unknown[] } }
    const liste = nav.navigator?.getGamepads?.() ?? []
    const voulues = new Set<Action>()
    let branchee = false
    for (const brut of liste) {
      const m = brut as { buttons?: { pressed: boolean }[]; axes?: number[] } | null
      if (!m) continue
      branchee = true
      const boutons = m.buttons ?? []
      for (const [i, a] of Object.entries(this.planManette)) {
        if (boutons[Number(i)]?.pressed) voulues.add(a)
      }
      const axes = m.axes ?? []
      if ((axes[0] ?? 0) < -this.zoneMorte) voulues.add('gauche')
      if ((axes[0] ?? 0) > this.zoneMorte) voulues.add('droite')
      if ((axes[1] ?? 0) < -this.zoneMorte) voulues.add('haut')
      if ((axes[1] ?? 0) > this.zoneMorte) voulues.add('bas')
    }
    if (!branchee && !this.manetteActive) return
    this.manetteActive = branchee
    // On relache ce qui n'est plus voulu : sans cela, lacher la croix
    // laisserait le personnage courir pour toujours.
    for (const a of ACTIONS_ORDRE) {
      if (voulues.has(a)) this.presserAction(a)
      else if (this.enfoncees.has(`@${a}`) && !this.doigts.size) this.relacherAction(a)
    }
  }

  debrancher(): void {
    this.detacher?.()
    this.detacher = null
    this.detacherTactile?.()
    this.detacherTactile = null
  }

  private touches(a: Action): string[] { return this.plan.get(a) ?? [] }

  /** Le rang d'une action dans le format transmissible, ou -1. */
  private rang(a: Action): number { return ACTIONS_ORDRE.indexOf(a) }

  /**
   * Avance d'un pas. C'est la boucle qui l'appelle, et elle seule.
   *
   * Elle est le seul endroit ou le temps existe pour ce fichier, et le temps
   * y est un compte de pas.
   */
  auPas(n: number): void {
    this.pasCourant = n
    this.consommes = 0
  }

  get pas(): number { return this.pasCourant }

  /** La fenetre de memoire, en pas. Au moins un : sinon elle n'existe pas. */
  private memoireEnPas(ms: number): number {
    if (ms < 0) return -1
    return Math.max(0, Math.round(ms / this.pasMs))
  }

  /** L'action est-elle maintenue en ce moment ? */
  tenue(a: Action): boolean {
    if (this.impose) {
      const r = this.rang(a)
      return r >= 0 && (this.impose.tenues & (1 << r)) !== 0
    }
    return this.touches(a).some((k) => this.enfoncees.has(k))
  }

  /** L'action a-t-elle ete demandee dans la fenetre de memoire ? */
  vientDePresser(a: Action, memoire = MEMOIRE_MS): boolean {
    if (this.impose) {
      const r = this.rang(a)
      return r >= 0 && (this.impose.appuis & (1 << r)) !== 0
        && (this.consommes & (1 << r)) === 0
    }
    const fenetre = this.memoireEnPas(memoire)
    if (fenetre < 0) return false
    // -Infini et non -1 : avant le premier pas, `pasCourant` vaut -1 et les
    // appuis sont dates -1 — une sentinelle a -1 les avalerait tous.
    const consomme = this.consommesLocaux.get(a) ?? -Infinity
    return this.touches(a).some((k) => {
      const p = this.pasAppui.get(k)
      // Un appui deja consomme PAR CETTE ACTION ne compte plus ; le meme
      // appui reste servi aux autres actions de la meme touche.
      return p !== undefined && this.pasCourant - p <= fenetre && p > consomme
    })
  }

  vientDeRelacher(a: Action, memoire = MEMOIRE_MS): boolean {
    const fenetre = this.memoireEnPas(memoire)
    if (fenetre < 0) return false
    return this.touches(a).some((k) => {
      const p = this.pasRelache.get(k)
      return p !== undefined && this.pasCourant - p <= fenetre
    })
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
    if (this.impose) {
      const r = this.rang(a)
      if (r >= 0) this.consommes |= 1 << r
      return true
    }
    let dernier = -Infinity
    for (const k of this.touches(a)) {
      const p = this.pasAppui.get(k)
      if (p !== undefined && p > dernier) dernier = p
    }
    this.consommesLocaux.set(a, dernier)
    return true
  }

  /**
   * L'etat de ce pas, sous forme transmissible.
   *
   * Un appui compte comme « presse a ce pas » s'il est tombe dans la fenetre
   * de memoire ET n'a pas encore ete consomme. C'est exactement ce que le jeu
   * verrait ; capturer autre chose ferait diverger le rejeu de la partie qu'il
   * pretend rejouer.
   */
  capturer(memoire = MEMOIRE_MS): EtatEntrees {
    let tenues = 0
    let appuis = 0
    ACTIONS_ORDRE.forEach((a, r) => {
      if (this.tenue(a)) tenues |= 1 << r
      if (this.vientDePresser(a, memoire)) appuis |= 1 << r
    })
    return { tenues, appuis }
  }

  /**
   * Impose l'etat des entrees, ou rend la main au clavier avec `null`.
   *
   * Le jeu ne sait pas qu'il est pilote : c'est ce qui garantit qu'une partie
   * rejouee suit exactement le meme chemin qu'une partie jouee.
   */
  imposer(e: EtatEntrees | null): void {
    this.impose = e ? { ...e } : null
    this.consommes = 0
  }

  get estImpose(): boolean { return this.impose !== null }

  /** Oublie tout : touches enfoncees, appuis, relachements. */
  vider(): void {
    this.enfoncees.clear()
    this.pasAppui.clear()
    this.consommesLocaux.clear()
    this.pasRelache.clear()
    this.consommes = 0
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
    this.pasAppui.set(code, this.pasCourant)
  }
  simulerRelache(code: string): void {
    this.enfoncees.delete(code)
    this.pasRelache.set(code, this.pasCourant)
  }
}
