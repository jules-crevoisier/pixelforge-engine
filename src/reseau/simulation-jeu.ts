import type { Noeud, Mouvements } from '../scene/noeud.ts'
import type { ContexteJeu } from '../runtime/jeu.ts'
import type { Peuplement } from '../runtime/entites.ts'
import type { Combat } from '../runtime/combat.ts'
import type { CorpsMobiles } from '../runtime/corps.ts'
import type { Entrees, EtatEntrees } from '../runtime/entree.ts'
import type { Simulation } from './partie.ts'
import {
  prendreScene, rendreScene, empreinteScene, empreinteDe,
  type NoeudInstantane,
} from './instantane.ts'

/**
 * Le vrai jeu, vu comme une simulation rembobinable.
 *
 * ## Pourquoi ce fichier est court, et pourquoi c'est bon signe
 *
 * Il ne fait qu'assembler : la scene sait se photographier, le peuplement
 * aussi, le combat aussi, les corps mobiles aussi. Si le rembobinage avait
 * demande de reecrire l'un d'eux, c'est que la separation aurait ete fausse —
 * on aurait alors DEUX versions de la simulation, celle qu'on joue et celle
 * qu'on rejoue, et la deuxieme n'aurait ete eprouvee qu'a moitie.
 *
 * ## Ce qui n'est pas dans l'instantane, et pourquoi
 *
 * La carte, les planches, les clips, le catalogue des especes : ce sont des
 * DONNEES, identiques d'un bout a l'autre de la partie et sur les deux
 * machines. Les copier a chaque pas garde couterait cent fois le reste pour
 * recopier ce qui ne bouge pas.
 *
 * La camera non plus : elle n'appartient pas a la simulation. Deux joueurs
 * voient le meme monde depuis deux endroits differents, et rembobiner la
 * camera de l'un ferait sauter son cadrage a chaque paquet en retard.
 */
export interface PiecesSimulation {
  racine: Noeud
  peuplement: Peuplement
  combat: Combat
  corps: CorpsMobiles
  entrees: Entrees
  /** Les entrees d'un joueur donne, pour un monde a plusieurs. */
  entreesDe?(joueur: string): Entrees | undefined
  /**
   * Les fractions de pixel en attente, par corps.
   *
   * Elles ne sont dans aucun des autres objets : elles vivent a cote de la
   * scene, et c'est precisement pourquoi on les oublie. Sans elles, un
   * rembobinage diverge des le premier pas refait.
   */
  mouvements: Mouvements
  /** Le contexte de jeu, tel que les scripts le recevront. */
  contexte(): ContexteJeu
  /** Ce que le monde fait a chaque pas, une fois les entrees posees. */
  pas(c: ContexteJeu, dtMs: number): void
  /** Le noeud dirige par chaque joueur. */
  noeudDe(joueur: string): Noeud | null
  dtMs: number
}

interface EtatComplet {
  scene: NoeudInstantane[]
  peuplement: unknown
  combat: unknown
  corps: unknown
  mouvements: [string, [number, number]][]
  pas: number
}

export class SimulationJeu implements Simulation {
  private p: PiecesSimulation
  private compteur = 0

  constructor(pieces: PiecesSimulation) { this.p = pieces }

  get pas(): number { return this.compteur }

  /**
   * Un pas, avec les entrees de CHAQUE joueur.
   *
   * ## Pourquoi les entrees sont IMPOSEES et non lues
   *
   * Le code du jeu appelle `c.entrees.tenue('saut')` sans savoir d'ou vient la
   * reponse. C'est ce qui garantit qu'une resimulation suit exactement le meme
   * chemin qu'un pas joue : il n'y a qu'un seul chemin. Un mode « rejeu » qui
   * emprunterait un autre code ne prouverait rien de la partie d'origine.
   *
   * ## Plusieurs personnages
   *
   * Chaque joueur a SON jeu d'entrees, et l'entite dirigee lit celui qui porte
   * son nom. Une premiere version n'en imposait qu'un seul : les deux
   * personnages lisaient les memes touches et bougeaient ensemble — le defaut
   * le plus previsible d'un multijoueur ajoute apres coup, et celui qu'on ne
   * voit pas tant qu'on teste a un joueur.
   *
   * Le jeu d'entrees COMMUN recoit le premier joueur par ordre alphabetique :
   * un monde solo, qui ne connait pas la notion de joueur, continue de
   * fonctionner sans rien savoir de tout ceci.
   */
  avancer(entrees: Map<string, EtatEntrees>): void {
    const noms = [...entrees.keys()].sort()
    for (const j of noms) {
      const propres = this.p.entreesDe?.(j)
      if (!propres) continue
      propres.auPas(this.compteur)
      propres.imposer(entrees.get(j) ?? null)
    }
    this.p.entrees.auPas(this.compteur)
    this.p.entrees.imposer(noms.length ? (entrees.get(noms[0]) ?? null) : null)
    this.p.pas(this.p.contexte(), this.p.dtMs)
    this.p.entrees.imposer(null)
    for (const j of noms) this.p.entreesDe?.(j)?.imposer(null)
    this.compteur++
  }

  instantane(): unknown {
    const e: EtatComplet = {
      scene: prendreScene(this.p.racine),
      peuplement: this.p.peuplement.instantane(),
      combat: this.p.combat.instantane(),
      corps: this.p.corps.instantane(),
      mouvements: this.p.mouvements.instantane(),
      pas: this.compteur,
    }
    return e
  }

  /**
   * L'ordre de restauration n'est pas indifferent.
   *
   * 1. La scene d'abord : elle decide QUI existe, et elle peut ressusciter.
   * 2. Le peuplement s'y accorde — c'est la qu'une entite revenue se voit
   *    reattribuer une vie, un lecteur, un controleur, tous neufs.
   * 3. On repose alors son etat vivant PAR-DESSUS ces valeurs neuves, et le
   *    combat par-dessus la vitalite neuve. Inverser 2 et 3 ferait ecraser ce
   *    qu'on vient de rendre par des valeurs par defaut — une creature
   *    ressuscitee repartirait a pleine vie, immobile.
   */
  restaurer(etat: unknown): void {
    const e = etat as EtatComplet
    rendreScene(this.p.racine, e.scene)
    this.p.peuplement.synchroniser()
    this.p.peuplement.restaurer(e.peuplement)
    this.p.combat.restaurer(e.combat)
    this.p.corps.restaurer(e.corps as never)
    this.p.mouvements.restaurer(e.mouvements)
    this.compteur = e.pas
  }

  /**
   * L'empreinte : ce qui se voit, et les points de vie.
   *
   * Les positions et les images disent l'essentiel ; les points de vie sont
   * ajoutes parce qu'une divergence sur la vie ne se voit pas tout de suite a
   * l'ecran et decide pourtant de la fin de la partie.
   */
  empreinte(): number {
    const scene = empreinteScene(prendreScene(this.p.racine))
    const vies: number[] = []
    for (const [id, v] of [...this.p.combat.vies].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      void id
      vies.push(v.pv, v.mort ? 1 : 0)
    }
    return empreinteDe([scene, ...vies])
  }
}
