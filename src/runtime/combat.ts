import { type Rect, rect, seChevauchent } from '../noyau/pixel.ts'

/**
 * Le combat : qui frappe qui, combien de fois, et a quel moment.
 *
 * ## Les deux regles qui font tout le reste
 *
 * **Un coup ne touche qu'une fois par cible.** Une frappe dure : le geste
 * occupe cent millisecondes, soit six images de jeu. Si la boite de frappe
 * blessait a chaque image, un seul coup d'epee ferait six fois les degats, et
 * la difficulte du jeu dependrait du taux de rafraichissement. On garde donc,
 * dans la frappe elle-meme, la liste de ce qu'elle a deja touche.
 *
 * **Etre touche rend invulnerable un instant.** Sans cela, marcher dans un
 * piege tue en un dixieme de seconde, et le joueur n'a meme pas le temps de
 * comprendre ce qui l'a atteint. Les images d'invulnerabilite ne sont pas une
 * facilite : elles sont ce qui rend un degat LISIBLE.
 *
 * Les deux regles se ressemblent et ne se remplacent pas. La premiere protege
 * d'un meme coup, la seconde de deux coups differents. Un jeu qui n'a que la
 * seconde perd la moitie de ses degats quand deux ennemis frappent ensemble ;
 * un jeu qui n'a que la premiere meurt dans les braseros.
 *
 * ## Pourquoi le systeme ne connait pas la scene
 *
 * Il travaille sur des identifiants, des boites et des camps. Il ne sait pas
 * ce qu'est un noeud, un sprite, une carte. C'est ce qui permet de l'eprouver
 * au banc sans navigateur, et de le porter tel quel — la ou un systeme qui
 * fouille l'arbre de scene serait a reecrire pour chaque jeu.
 */

/**
 * A qui l'on appartient. Une frappe ne blesse jamais son propre camp.
 *
 * `decor` n'appartient a personne, et c'est tout son interet : une pointe
 * blesse le heros ET la creature qui marche dessus. Traiter les pieges comme
 * un deuxieme mecanisme, a cote des frappes, aurait demande de reecrire les
 * images d'invulnerabilite une seconde fois — donc deux endroits ou se
 * tromper, et deux comportements qui divergent un jour.
 */
export type Camp = 'heros' | 'ennemi' | 'neutre' | 'decor'

export interface Vitalite {
  max: number
  pv: number
  /** Millisecondes d'invulnerabilite restantes. */
  invulnerable: number
  /**
   * Duree d'invulnerabilite accordee par un coup recu.
   *
   * Elle n'est pas la meme pour tout le monde, et ce n'est pas un detail de
   * reglage : longue, elle protege le joueur d'une mort qu'il ne comprendrait
   * pas ; longue sur un ennemi, elle rend l'epee molle — on frappe, il ne se
   * passe rien, on croit avoir rate. Le meme nombre pour les deux donne un jeu
   * ou l'un des deux camps se joue mal.
   */
  invulnerabiliteMs: number
  camp: Camp
  /** Boite de reception, relative a la position de l'entite. */
  boite: { x: number; y: number; l: number; h: number }
  /** Position de l'entite, en pixels du monde. */
  x: number
  y: number
  mort: boolean
}

export interface Frappe {
  id: string
  camp: Camp
  degats: number
  /** Boite en pixels du MONDE : une frappe ne suit pas son auteur. */
  boite: Rect
  /** Millisecondes restantes. */
  reste: number
  /** Poussee appliquee a la cible, en pixels par seconde. */
  poussee: number
  /** Direction de la poussee. Normalisee a la creation. */
  dx: number
  dy: number
  /** Ce que cette frappe a deja touche. */
  touches: Set<string>
}

export interface Impact {
  cible: string
  frappe: string
  degats: number
  /** Poussee a appliquer, en pixels par seconde. */
  pousseeX: number
  pousseeY: number
  /** Vrai si ce coup a mis la cible a zero. */
  fatal: boolean
}

/**
 * Duree d'invulnerabilite apres un coup recu, en millisecondes.
 *
 * Six dixiemes pour le joueur : de quoi voir ce qui l'a touche et sortir du
 * danger. Deux dixiemes pour un ennemi : de quoi ne pas etre tue en une image
 * par une frappe qui dure, sans que l'epee ait l'air molle.
 */
export const INVULNERABILITE_MS = 600
export const INVULNERABILITE_ENNEMI_MS = 220

export class Combat {
  readonly vies = new Map<string, Vitalite>()
  readonly frappes: Frappe[] = []
  private compteur = 0

  inscrire(
    id: string,
    v: Omit<Vitalite, 'invulnerable' | 'mort' | 'pv' | 'invulnerabiliteMs'>
      & { pv?: number; invulnerabiliteMs?: number },
  ): Vitalite {
    const vie: Vitalite = {
      ...v,
      pv: v.pv ?? v.max,
      invulnerable: 0,
      invulnerabiliteMs: v.invulnerabiliteMs ?? INVULNERABILITE_MS,
      mort: false,
    }
    this.vies.set(id, vie)
    return vie
  }

  retirer(id: string): void { this.vies.delete(id) }

  /**
   * Declenche une frappe.
   *
   * La boite est donnee en pixels du monde et ne bouge plus. Une frappe qui
   * suivrait son auteur permettrait de reculer en plein geste et de toucher
   * quand meme derriere soi — le genre de chose qu'on ne remarque qu'en
   * regardant quelqu'un abuser du jeu.
   */
  frapper(
    camp: Camp, boite: Rect, degats: number, dureeMs: number,
    poussee = 0, dx = 0, dy = 0,
  ): Frappe {
    const n = Math.hypot(dx, dy) || 1
    const f: Frappe = {
      id: `f${++this.compteur}`,
      camp,
      degats,
      boite,
      reste: Math.max(1, dureeMs),
      poussee,
      dx: dx / n,
      dy: dy / n,
      touches: new Set(),
    }
    this.frappes.push(f)
    return f
  }

  /** Ou se trouve la boite de reception d'une entite, en pixels du monde. */
  boiteDe(v: Vitalite): Rect {
    return rect(v.x + v.boite.x, v.y + v.boite.y, v.boite.l, v.boite.h)
  }

  /**
   * Un pas. Rend les impacts de ce pas, dans l'ordre ou ils se produisent.
   *
   * Comme le lecteur d'animation, il REND au lieu d'appeler : c'est ce qui
   * permet a l'appelant de choisir ce qu'il en fait — un son, un recul, une
   * disparition — sans que le systeme ait besoin de connaitre le jeu.
   */
  avancer(dtMs: number): Impact[] {
    const impacts: Impact[] = []

    for (const v of this.vies.values()) {
      if (v.invulnerable > 0) v.invulnerable = Math.max(0, v.invulnerable - dtMs)
    }

    for (const [id, v] of this.vies) {
      if (v.mort) continue
      const cible = this.boiteDe(v)
      for (const f of this.frappes) {
        if (f.camp === v.camp) continue
        // Une frappe ne touche qu'une fois par cible, meme si elle dure six
        // images. Sans ce garde, les degats dependraient du taux d'images.
        if (f.touches.has(id)) continue
        if (v.invulnerable > 0) continue
        if (!seChevauchent(f.boite, cible)) continue
        f.touches.add(id)
        v.pv -= f.degats
        v.invulnerable = v.invulnerabiliteMs
        const fatal = v.pv <= 0
        if (fatal) { v.pv = 0; v.mort = true }
        impacts.push({
          cible: id,
          frappe: f.id,
          degats: f.degats,
          pousseeX: f.dx * f.poussee,
          pousseeY: f.dy * f.poussee,
          fatal,
        })
      }
    }

    // Les frappes vieillissent APRES avoir servi : une frappe d'une seule
    // image doit pouvoir toucher a l'image ou elle nait.
    for (let i = this.frappes.length - 1; i >= 0; i--) {
      this.frappes[i].reste -= dtMs
      if (this.frappes[i].reste <= 0) this.frappes.splice(i, 1)
    }
    return impacts
  }

  /** Rend tout a neuf, sans oublier les frappes en vol. */
  reinitialiser(): void {
    this.vies.clear()
    this.frappes.length = 0
    this.compteur = 0
  }
}

/**
 * Le clignotement d'une entite invulnerable.
 *
 * Un personnage qui encaisse sans rien montrer laisse croire que le coup n'a
 * pas porte. Le clignotement est le retour le moins couteux et le plus lu :
 * une entite sur deux images est cachee tant qu'elle est invulnerable.
 */
export function visibleSousInvulnerabilite(invulnerable: number, periodeMs = 100): boolean {
  if (invulnerable <= 0) return true
  return Math.floor(invulnerable / periodeMs) % 2 === 0
}
