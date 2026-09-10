import { Hasard } from '../niveau/plan.ts'
import type { EtatEntrees } from '../runtime/entree.ts'

/**
 * Le transport : par ou passent les entrees des autres joueurs.
 *
 * ## Pourquoi une interface, et un transport LOCAL d'abord
 *
 * Le rembobinage est la partie difficile, et elle n'a rien a voir avec le
 * reseau : c'est de l'arithmetique sur des pas et des instantanes. Si on
 * l'ecrit contre une vraie connexion, on ne peut plus l'eprouver — il faudrait
 * deux machines, une latence qu'on ne choisit pas, et des pertes qui ne se
 * reproduisent jamais deux fois pareil.
 *
 * Le transport local simule tout cela a partir d'une GRAINE : la meme latence,
 * la meme gigue et les memes pertes a chaque execution. Un banc peut donc dire
 * « avec cent millisecondes de latence et cinq pour cent de perte, les deux
 * joueurs voient la meme partie » — et le redire a l'identique demain.
 *
 * Une implementation WebRTC ou WebSocket viendra se brancher ici sans que le
 * rembobinage change d'une ligne. Si elle devait le changer, c'est que la
 * separation serait fausse.
 */

/**
 * Ce qu'un joueur envoie : ses entrees des derniers pas, pas seulement du
 * dernier.
 *
 * ## Pourquoi une bande et non une seule valeur
 *
 * Un rembobinage repare un retard ; il ne repare pas une PERTE. Si le paquet
 * qui portait le pas 412 n'arrive jamais, l'autre machine ne saura jamais ce
 * qui s'est passe a ce pas-la : elle continuera de supposer, l'ecart ne se
 * refermera pas, et les deux joueurs joueront deux parties differentes en
 * croyant jouer ensemble. Aucune quantite de correction ne rattrape une
 * information detruite.
 *
 * Chaque message porte donc les N derniers pas. Perdre un paquet devient sans
 * consequence des lors que le suivant arrive — et il faudrait en perdre N
 * d'affilee pour perdre vraiment quelque chose. Le cout est ridicule : une
 * entree tient dans deux petits entiers, et l'on en envoie huit au lieu d'une.
 *
 * C'est le choix qu'on regrette de ne pas avoir fait quand on decouvre le
 * probleme en production : il ne se voit pas au banc tant qu'on ne simule pas
 * de pertes, et il ne se voit pas non plus sur un reseau local.
 */
export interface Message {
  joueur: string
  /** Le pas de la DERNIERE entree de la bande. */
  pas: number
  /**
   * Les entrees des pas `pas - bande.length + 1` a `pas`, dans cet ordre.
   *
   * Un tableau plutot qu'une carte de pas vers entrees : l'ordre porte
   * l'information, ce qui evite d'ecrire un numero de pas par entree — pour un
   * message envoye soixante fois par seconde, cela compte.
   */
  bande: EtatEntrees[]
  /** Empreinte de l'etat a ce pas, pour detecter une divergence. */
  empreinte: number
}

export interface Transport {
  /** Qui je suis. */
  readonly moi: string
  /** Envoie mes entrees pour un pas. */
  envoyer(m: Message): void
  /** Rend ce qui est arrive depuis le dernier appel, et vide la boite. */
  recevoir(): Message[]
  /** Fait passer le temps du transport, en millisecondes. */
  avancer(ms: number): void
}

export interface ReglagesLien {
  /** Latence de base, en millisecondes, dans un seul sens. */
  latence?: number
  /** Variation aleatoire de la latence, en millisecondes. */
  gigue?: number
  /** Part des messages perdus, de 0 a 1. */
  perte?: number
  graine?: number
}

/**
 * Deux extremites reliees en memoire, avec latence, gigue et pertes.
 *
 * ## Pourquoi les messages ne sont pas remis dans l'ordre
 *
 * Un vrai reseau ne le fait pas, et un rembobinage qui suppose l'ordre casse
 * en production sans jamais casser au banc. Les messages sont delivres quand
 * leur echeance arrive, et deux messages peuvent donc se doubler. C'est au
 * destinataire de s'en arranger — ce qu'il fait naturellement, puisqu'il range
 * les entrees par NUMERO DE PAS et non par ordre d'arrivee.
 */
export class LienLocal {
  private enVol: { a: string; echeance: number; m: Message }[] = []
  private boites = new Map<string, Message[]>()
  private temps = 0
  private hasard: Hasard
  private r: Required<ReglagesLien>
  /** Comptes, pour que le banc puisse dire ce qui s'est vraiment passe. */
  envoyes = 0
  perdus = 0

  constructor(joueurs: string[], reglages: ReglagesLien = {}) {
    this.r = {
      latence: reglages.latence ?? 60,
      gigue: reglages.gigue ?? 0,
      perte: reglages.perte ?? 0,
      graine: reglages.graine ?? 1,
    }
    this.hasard = new Hasard(this.r.graine >>> 0)
    for (const j of joueurs) this.boites.set(j, [])
  }

  /** Une extremite, vue par un joueur. */
  pour(joueur: string): Transport {
    return {
      moi: joueur,
      envoyer: (m) => this.envoyer(joueur, m),
      recevoir: () => {
        const b = this.boites.get(joueur) ?? []
        this.boites.set(joueur, [])
        return b
      },
      avancer: () => { /* le temps est celui du lien, avance une seule fois */ },
    }
  }

  private envoyer(de: string, m: Message): void {
    for (const a of this.boites.keys()) {
      if (a === de) continue
      this.envoyes++
      if (this.hasard.reel() < this.r.perte) { this.perdus++; continue }
      const retard = this.r.latence + (this.r.gigue > 0 ? this.hasard.reel() * this.r.gigue : 0)
      this.enVol.push({ a, echeance: this.temps + retard, m })
    }
  }

  /** Fait passer le temps du lien, et delivre ce qui est arrive a echeance. */
  avancer(ms: number): void {
    this.temps += ms
    const reste: typeof this.enVol = []
    for (const p of this.enVol) {
      if (p.echeance <= this.temps) (this.boites.get(p.a) ?? []).push(p.m)
      else reste.push(p)
    }
    this.enVol = reste
  }
}
