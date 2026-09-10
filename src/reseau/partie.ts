import { type EtatEntrees, ETAT_VIDE } from '../runtime/entree.ts'
import type { Message, Transport } from './transport.ts'

/**
 * Le rembobinage : jouer sans attendre les autres, et se corriger.
 *
 * ## Le probleme, en une phrase
 *
 * Les entrees du joueur d'en face arrivent en retard. On peut soit ATTENDRE
 * qu'elles arrivent — et le jeu accuse la latence a chaque appui, ce qui est
 * insupportable dans un jeu de plateforme — soit AVANCER en devinant, puis se
 * corriger quand la verite arrive. La deuxieme voie est celle de tous les jeux
 * de combat depuis vingt ans, et elle a un nom : rollback.
 *
 * ## Comment ca marche, en quatre temps
 *
 * 1. A chaque pas, j'envoie mes entrees et j'avance en supposant que les
 *    autres font ce qu'ils faisaient au pas precedent. C'est une prediction
 *    grossiere, et c'est la bonne : un joueur qui court continue de courir
 *    bien plus souvent qu'il ne change d'avis.
 * 2. Je garde un instantane par pas, et les entrees que j'ai supposees.
 * 3. Quand les vraies entrees d'un pas passe arrivent, je compare. Si elles
 *    correspondent a ce que j'avais suppose, il n'y a rien a faire — et c'est
 *    le cas la plupart du temps.
 * 4. Sinon je REVIENS a l'instantane de ce pas et je refais le chemin avec les
 *    bonnes entrees, jusqu'au present. Le joueur voit un saut d'une ou deux
 *    images sur le personnage distant, jamais sur le sien.
 *
 * ## Pourquoi le present ne se rembobine JAMAIS
 *
 * On ne revient qu'a des pas deja simules, et l'on refait toujours jusqu'au
 * pas courant. Le joueur local voit donc ses propres actions immediatement,
 * quoi qu'il arrive sur le reseau : c'est la propriete qui fait tout l'interet
 * du procede, et la seule chose qu'il ne faut jamais sacrifier pour simplifier
 * le code.
 *
 * ## Ce que la simulation doit savoir faire
 *
 * Trois choses, et rien de plus : avancer d'un pas avec les entrees de chacun,
 * se photographier, se remettre dans un etat photographie. `Partie` ne sait
 * rien du jeu — ni tuiles, ni entites, ni combat. C'est ce qui permet de
 * l'eprouver contre une simulation-jouet dont on connait la reponse a la main.
 */
export interface Simulation {
  /** Un pas, avec les entrees de chaque joueur. */
  avancer(entrees: Map<string, EtatEntrees>): void
  /** Copie complete de l'etat mouvant. */
  instantane(): unknown
  restaurer(etat: unknown): void
  /** Un nombre qui change des que l'etat visible change. */
  empreinte(): number
}

export interface ReglagesPartie {
  /**
   * Combien de pas on garde derriere soi.
   *
   * C'est la latence maximale rattrapable : au-dela, on ne peut plus revenir
   * assez loin et l'on doit accepter la divergence. Huit pas valent 133 ms a
   * soixante images — de quoi couvrir un aller-retour continental.
   */
  fenetre?: number
  /**
   * Retard volontaire applique a SES PROPRES entrees, en pas.
   *
   * Contre-intuitif et tres efficace : mes touches d'aujourd'hui valent pour
   * dans deux pas, et je les ANNONCE tout de suite. L'autre les recoit donc
   * avant d'en avoir besoin, ne me predit plus, et ne rembobine plus. Deux
   * images de retard se sentent a peine ; un rembobinage de huit images se
   * voit toujours.
   *
   * Une premiere version retardait ce que je JOUE au lieu de ce que
   * j'ANNONCE : le message partait toujours au dernier moment, arrivait
   * toujours en retard, et le reglage ne changeait rigoureusement rien. Le
   * banc l'a dit — cent huit pas refaits avec, cent huit sans.
   */
  retardLocal?: number
  /**
   * Combien de pas chaque message repete derriere lui.
   *
   * C'est la resistance aux pertes : il faut en perdre autant d'affilee pour
   * perdre reellement une entree. Huit pas coutent seize petits entiers par
   * message, soixante fois par seconde — rien du tout — et couvrent une rafale
   * de pertes de plus d'un dixieme de seconde.
   */
  redondance?: number
}

interface PasGarde {
  pas: number
  etat: unknown
  /** Ce qu'on a EMPLOYE pour simuler ce pas, suppositions comprises. */
  employees: Map<string, EtatEntrees>
  empreinte: number
}

export class Partie {
  private sim: Simulation
  private transport: Transport
  private joueurs: string[]
  private fenetre: number
  private retardLocal: number
  private redondance: number

  /** Les entrees CONNUES, par joueur puis par pas. */
  private connues = new Map<string, Map<number, EtatEntrees>>()
  /** Les pas simules qu'on peut encore rejouer. */
  private gardes: PasGarde[] = []
  private pasCourant = 0

  /** Comptes, pour dire ce qui s'est passe. */
  rembobinages = 0
  pasResimules = 0
  divergences = 0

  constructor(
    sim: Simulation, transport: Transport, joueurs: string[], r: ReglagesPartie = {},
  ) {
    this.sim = sim
    this.transport = transport
    this.joueurs = [...joueurs].sort()
    this.fenetre = r.fenetre ?? 12
    this.retardLocal = r.retardLocal ?? 2
    this.redondance = Math.max(1, r.redondance ?? 8)
    for (const j of this.joueurs) this.connues.set(j, new Map())
    // Se reconnaitre dans la liste n'est pas une politesse : sans cela, ses
    // propres entrees ne sont notees nulle part, personne ne les recoit, et la
    // partie diverge en silence. On refuse tot, avec la raison.
    if (!this.connues.has(this.transport.moi)) {
      throw new Error(
        `« ${this.transport.moi} » ne figure pas dans la liste des joueurs `
        + `(${this.joueurs.join(', ')})`,
      )
    }
  }

  get pas(): number { return this.pasCourant }

  /**
   * Ce qu'on emploie pour un joueur a un pas donne.
   *
   * Ce qui est connu, sinon la DERNIERE chose connue avant ce pas, sinon rien.
   * « La derniere chose connue » plutot que « rien » n'est pas un detail :
   * suppose immobile, un joueur qui court s'arrete net a chaque paquet en
   * retard, et l'on rembobine ensuite pour le faire repartir — le personnage
   * distant tremble en permanence. Suppose « il continue », il avance tout
   * droit et la correction ne se voit presque jamais.
   *
   * Les APPUIS, eux, ne se supposent pas : on ne devine pas un saut. Supposer
   * un appui ferait sauter le personnage distant tout seul une fois sur trois,
   * et un saut invente est bien plus visible qu'un saut en retard.
   */
  private employeesA(pas: number): Map<string, EtatEntrees> {
    const sortie = new Map<string, EtatEntrees>()
    for (const j of this.joueurs) {
      const parPas = this.connues.get(j) as Map<number, EtatEntrees>
      const exact = parPas.get(pas)
      if (exact) { sortie.set(j, exact); continue }
      let dernier = ETAT_VIDE
      for (let p = pas - 1; p >= pas - this.fenetre && p >= 0; p--) {
        const q = parPas.get(p)
        if (q) { dernier = q; break }
      }
      sortie.set(j, { tenues: dernier.tenues, appuis: 0 })
    }
    return sortie
  }

  private memesEntrees(a: Map<string, EtatEntrees>, b: Map<string, EtatEntrees>): boolean {
    for (const j of this.joueurs) {
      const x = a.get(j) ?? ETAT_VIDE
      const y = b.get(j) ?? ETAT_VIDE
      if (x.tenues !== y.tenues || x.appuis !== y.appuis) return false
    }
    return true
  }

  /**
   * Un pas de jeu : recevoir, corriger si besoin, envoyer, avancer.
   *
   * L'ordre compte. On recoit AVANT d'avancer, sinon on simule un pas de plus
   * avec des suppositions qu'on aurait pu remplacer tout de suite. Et l'on
   * corrige avant d'envoyer, pour que l'empreinte envoyee soit celle d'un etat
   * qu'on ne va pas defaire une ligne plus bas.
   */
  avancer(mesEntrees: EtatEntrees): void {
    for (const m of this.transport.recevoir()) this.recevoir(m)
    this.corriger()

    // Mes touches d'aujourd'hui valent pour dans `retardLocal` pas, et je les
    // annonce MAINTENANT. C'est tout le procede : l'autre les aura recues
    // avant d'en avoir besoin, donc il ne me predira pas, donc il ne
    // rembobinera pas a cause de moi.
    const pasVise = this.pasCourant + this.retardLocal
    this.noter(this.transport.moi, pasVise, mesEntrees)
    this.transport.envoyer({
      joueur: this.transport.moi,
      pas: pasVise,
      bande: this.bandeLocale(pasVise),
      empreinte: this.sim.empreinte(),
    })

    this.simulerUnPas()
  }

  /** Mes `redondance` dernieres entrees, la plus ancienne d'abord. */
  private bandeLocale(pas: number): EtatEntrees[] {
    const miennes = this.connues.get(this.transport.moi) as Map<number, EtatEntrees>
    const bande: EtatEntrees[] = []
    for (let p = pas - this.redondance + 1; p <= pas; p++) {
      bande.push(p >= 0 ? (miennes.get(p) ?? ETAT_VIDE) : ETAT_VIDE)
    }
    return bande
  }

  private noter(joueur: string, pas: number, e: EtatEntrees): void {
    const parPas = this.connues.get(joueur)
    if (parPas) parPas.set(pas, e)
  }

  private recevoir(m: Message): void {
    const parPas = this.connues.get(m.joueur)
    if (!parPas) return
    const debut = m.pas - m.bande.length + 1
    for (let k = 0; k < m.bande.length; k++) {
      const pas = debut + k
      if (pas < 0) continue
      // Un pas deja sorti de la fenetre ne sert plus a rien : on ne peut plus
      // y revenir, et l'inscrire ferait croire a une correction possible.
      if (pas < this.pasCourant - this.fenetre) continue
      const recu = m.bande[k]
      const avant = parPas.get(pas)
      // Deja connu et identique : rien de neuf. C'est le cas de la plupart des
      // entrees d'une bande, et c'est voulu — la redondance ne sert que quand
      // elle sert.
      if (avant && avant.tenues === recu.tenues && avant.appuis === recu.appuis) continue
      parPas.set(pas, recu)
      this.aCorriger = Math.min(this.aCorriger, pas)
    }
    // L'empreinte de l'autre, comparee a la notre au meme pas. On ne la
    // compare que si l'on a garde ce pas : sinon on se declarerait divergent
    // alors qu'on n'a simplement pas fini de se corriger.
    const garde = this.gardes.find((g) => g.pas === m.pas)
    if (garde && m.empreinte !== 0 && garde.empreinte !== m.empreinte) this.divergences++
  }

  private aCorriger = Infinity

  /**
   * Refait le chemin depuis le premier pas dont les entrees ont change.
   *
   * Rien n'est refait si les entrees recues correspondent a ce qu'on avait
   * suppose — et c'est le cas la plupart du temps, ce qui est toute la raison
   * pour laquelle le procede est jouable.
   */
  private corriger(): void {
    if (this.aCorriger === Infinity) return
    const suspect = this.aCorriger
    this.aCorriger = Infinity

    /*
     * On CHERCHE le premier pas reellement fautif, a partir du plus ancien
     * suspect. On ne se contente pas de tester ce pas-la.
     *
     * La premiere version le faisait, et le defaut est retors : `aCorriger`
     * retient le plus ancien pas dont une entree est ARRIVEE, ce qui n'est pas
     * le plus ancien pas dont une entree etait FAUSSE. Si l'entree recue pour
     * ce pas-la confirme ce qu'on avait suppose — ce qui arrive tres souvent,
     * c'est meme le principe — on concluait « rien a refaire » et l'on
     * abandonnait au passage les corrections des pas suivants, arrivees dans
     * le meme lot. Les deux machines divergeaient alors pour de bon, sans que
     * rien ne le signale.
     */
    let fautif = -1
    for (const g of this.gardes) {
      if (g.pas < suspect) continue
      if (!this.memesEntrees(this.employeesA(g.pas), g.employees)) { fautif = g.pas; break }
    }
    if (fautif < 0) return

    const garde = this.gardes.find((g) => g.pas === fautif)
    if (!garde) return

    this.rembobinages++
    this.sim.restaurer(garde.etat)
    const jusque = this.pasCourant
    this.gardes = this.gardes.filter((g) => g.pas < fautif)
    this.pasCourant = fautif
    while (this.pasCourant < jusque) {
      this.simulerUnPas()
      this.pasResimules++
    }
  }

  private simulerUnPas(): void {
    const employees = this.employeesA(this.pasCourant)
    this.gardes.push({
      pas: this.pasCourant,
      etat: this.sim.instantane(),
      employees,
      empreinte: this.sim.empreinte(),
    })
    this.sim.avancer(employees)
    this.pasCourant++
    // La fenetre est glissante : au-dela, on ne peut plus revenir, donc garder
    // coute de la memoire sans rien permettre.
    while (this.gardes.length > this.fenetre + 1) this.gardes.shift()
  }

  /** L'empreinte du pas courant, pour un banc ou un diagnostic. */
  empreinte(): number { return this.sim.empreinte() }

  /**
   * Le dernier pas dont les entrees de TOUS sont connues.
   *
   * C'est le seul etat sur lequel deux machines peuvent s'accorder : tout ce
   * qui est au-dela contient des suppositions, et deux machines ne supposent
   * pas la meme chose au meme moment. Comparer l'etat courant de deux joueurs
   * revient a comparer deux predictions — elles different, et ce n'est pas une
   * divergence, c'est le fonctionnement normal.
   */
  get pasConfirme(): number {
    let p = this.pasCourant - 1
    while (p >= 0) {
      if (this.joueurs.every((j) => this.connues.get(j)?.has(p))) return p
      p--
    }
    return -1
  }

  /** L'empreinte de l'etat AVANT ce pas, si on la garde encore. */
  empreinteA(pas: number): number | null {
    return this.gardes.find((g) => g.pas === pas)?.empreinte ?? null
  }
}
