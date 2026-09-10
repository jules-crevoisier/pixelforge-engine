import { Accumulateur } from '../noyau/pixel.ts'
import { type GrilleSolide, toucheSolide, plateformeArrete, sommetPente } from './collision.ts'
import { rect, type Rect } from '../noyau/pixel.ts'
import type { Entrees } from './entree.ts'

/**
 * Le controleur de plateforme.
 *
 * ## Pourquoi ce fichier existe
 *
 * La difference entre un jeu de plateforme qu'on repose au bout de dix minutes
 * et un jeu qu'on finit tient a une douzaine de techniques, toutes nommees,
 * toutes documentees, et presque toutes absentes des moteurs generalistes. Un
 * corps rigide avec de la gravite, c'est ce que donne un moteur physique — et
 * ca ne ressemble a aucun bon jeu de plateforme, parce qu'aucun bon jeu de
 * plateforme n'emploie de moteur physique.
 *
 * Chaque reglage ci-dessous repare un defaut precis, et chacun est mesure au
 * banc contre ce defaut. Les valeurs par defaut sont celles d'un jeu nerveux.
 *
 * ## Les techniques, et ce qu'elles reparent
 *
 * **Coyote time.** Le joueur appuie sur saut quelques images APRES avoir
 * quitte la plateforme, et le personnage saute quand meme. Sans lui, courir
 * jusqu'au bord et sauter rate une fois sur trois, parce que l'oeil voit le
 * personnage encore sur le rebord alors que la simulation l'a deja lache.
 *
 * **Tampon de saut.** Le joueur appuie quelques images AVANT de toucher le
 * sol, et le saut part des l'atterrissage. Sans lui, enchainer deux sauts
 * demande une precision a l'image pres que personne n'a.
 *
 * **Hauteur variable.** Relacher le bouton coupe la montee. C'est ce qui
 * permet un petit saut et un grand saut avec un seul bouton, et c'est ce que
 * la gravite seule ne peut pas donner.
 *
 * **Correction de coin.** Un saut qui frole un plafond par un ou deux pixels
 * est DECALE lateralement au lieu d'etre arrete net. Sans elle, on se cogne a
 * des coins qu'on croyait avoir passes, et le jeu parait injuste.
 *
 * **Apex flottant.** La gravite diminue au sommet du saut. Le personnage y
 * passe plus de temps, ce qui donne le controle au moment ou l'on en a le plus
 * besoin — viser sa plateforme.
 *
 * **Descente plus rapide que la montee.** Deux gravites. Un saut symetrique
 * parait mou ; toute la vivacite vient de la chute.
 */

export interface ReglagesPlateforme {
  /** Vitesse horizontale de pointe, en pixels par seconde. */
  vitesse: number
  /** Temps pour atteindre la vitesse de pointe, en secondes. */
  accroche: number
  /** Temps pour s'arreter, en secondes. Plus court que l'accroche : on
   *  s'arrete plus vite qu'on ne demarre, sinon on patine. */
  freinage: number
  /** Part du controle horizontal conserve en l'air, de 0 a 1. */
  controleEnLair: number

  /** Hauteur du saut au sommet, en pixels. On raisonne en hauteur, pas en
   *  impulsion : c'est ce que le niveau impose, et la gravite s'en deduit. */
  hauteurSaut: number
  /** Temps pour atteindre le sommet, en secondes. */
  tempsMontee: number
  /** Multiplicateur de gravite en descente. */
  gravitDescente: number
  /** Multiplicateur de gravite pres du sommet — l'apex flottant. */
  gravitApex: number
  /** Vitesse verticale sous laquelle on est « au sommet ». */
  seuilApex: number
  /** Multiplicateur applique a la montee quand on relache le bouton. */
  coupureSaut: number
  /** Vitesse de chute maximale, en pixels par seconde. */
  chuteMax: number
  /**
   * Denivele maximal franchi d'un pas en marchant, en pixels.
   *
   * C'est ce qui permet de MONTER une pente au lieu de s'y cogner : apres
   * chaque pas horizontal, on cherche le sol un peu plus haut et l'on s'y
   * pose. Le meme reglage fait franchir une marche d'un pixel sans sauter,
   * ce qui evite d'avoir a lisser le terrain a la main.
   *
   * Trop grand, on escalade les murs. A quarante-cinq degres et cent dix
   * pixels par seconde, on ne monte jamais plus de deux pixels par pas ; trois
   * laisse de la marge sans permettre l'escalade.
   */
  montee: number

  /** Fenetre de coyote, en secondes. */
  coyote: number
  /** Fenetre du tampon de saut, en secondes. */
  tampon: number
  /** Decalage lateral maximal pour la correction de coin, en pixels. */
  correctionCoin: number

  /** Glissade murale : vitesse de chute le long d'un mur. */
  vitesseGlissade: number
  /** Impulsion horizontale d'un saut mural. */
  pousseeMur: number
  /** Duree pendant laquelle le saut mural garde la main sur l'horizontale. */
  blocageApresMur: number

  /**
   * Duree pendant laquelle on traverse les plateformes, en secondes.
   *
   * Descendre d'une plateforme, c'est appuyer vers le bas et sauter. Il faut
   * alors cesser de la voir un instant — assez pour la franchir, pas assez
   * pour traverser la suivante. Un dixieme de seconde couvre une case de seize
   * pixels a n'importe quelle vitesse de chute.
   */
  traverseePlateforme: number

  /** Vitesse du dash, en pixels par seconde. */
  vitesseDash: number
  /** Duree du dash, en secondes. */
  dureeDash: number
  /** Delai avant de pouvoir redasher, en secondes. */
  recuperationDash: number
}

export const REGLAGES_DEFAUT: ReglagesPlateforme = {
  vitesse: 110,
  accroche: 0.09,
  freinage: 0.06,
  controleEnLair: 0.75,

  hauteurSaut: 46,
  tempsMontee: 0.34,
  gravitDescente: 1.7,
  gravitApex: 0.55,
  seuilApex: 34,
  coupureSaut: 0.4,
  chuteMax: 300,
  montee: 3,

  coyote: 0.1,
  tampon: 0.12,
  correctionCoin: 3,

  vitesseGlissade: 46,
  pousseeMur: 130,
  blocageApresMur: 0.16,
  traverseePlateforme: 0.1,

  vitesseDash: 260,
  dureeDash: 0.14,
  recuperationDash: 0.22,
}

/**
 * La gravite et l'impulsion se DEDUISENT de la hauteur voulue et du temps de
 * montee.
 *
 * Regler une gravite et une impulsion a la main, c'est chercher a l'aveugle :
 * on veut « sauter trois tuiles de haut », pas « une impulsion de -260 ». Les
 * deux formules viennent du mouvement uniformement accelere, et elles rendent
 * le reglage transposable — changer la taille des tuiles ne casse plus le
 * niveau.
 */
export function gravitéDe(r: ReglagesPlateforme): number {
  return (2 * r.hauteurSaut) / (r.tempsMontee * r.tempsMontee)
}
export function impulsionDe(r: ReglagesPlateforme): number {
  return -(2 * r.hauteurSaut) / r.tempsMontee
}

export type EtatPlateforme = 'sol' | 'air' | 'mur' | 'dash'

export interface Corps2D {
  x: number
  y: number
  readonly boite: { x: number; y: number; l: number; h: number }
}

export interface Diagnostic {
  etat: EtatPlateforme
  vx: number
  vy: number
  auSol: boolean
  /** -1 mur a gauche, +1 mur a droite, 0 aucun. */
  mur: number
  coyoteRestant: number
  tamponRestant: number
  /** Vrai a l'image ou une correction de coin a sauve le saut. */
  coinCorrige: boolean
  sautsUtilises: number
}

export class Plateformeur {
  r: ReglagesPlateforme
  vx = 0
  vy = 0
  private acc = new Accumulateur()
  private auSol = false
  private murCote = 0
  private coyoteRestant = 0
  private tamponRestant = 0
  private tientSaut = false
  private blocageMur = 0
  private tempsDash = 0
  private recupDash = 0
  private dirDash = { x: 0, y: 0 }
  private dashDispo = true
  private coinCorrige = false
  private sautsUtilises = 0
  /** Secondes restantes pendant lesquelles les plateformes sont ignorees. */
  private traversee = 0
  /** Sauts en l'air autorises. 0 = pas de double saut. */
  sautsAeriens = 0

  constructor(reglages: Partial<ReglagesPlateforme> = {}) {
    this.r = { ...REGLAGES_DEFAUT, ...reglages }
  }

  get etat(): EtatPlateforme {
    if (this.tempsDash > 0) return 'dash'
    if (this.auSol) return 'sol'
    if (this.murCote !== 0) return 'mur'
    return 'air'
  }

  diagnostic(): Diagnostic {
    return {
      etat: this.etat, vx: this.vx, vy: this.vy, auSol: this.auSol, mur: this.murCote,
      coyoteRestant: this.coyoteRestant, tamponRestant: this.tamponRestant,
      coinCorrige: this.coinCorrige, sautsUtilises: this.sautsUtilises,
    }
  }

  /**
   * Tout l'etat mouvant du controleur, dans un tableau de nombres.
   *
   * Un tableau et non un objet : un rembobinage en prend un par pas garde, et
   * un objet de dix-huit champs coute dix-huit allocations la ou un tableau en
   * coute une. L'ORDRE fait partie du contrat, et `restaurer` le lit dans le
   * meme ordre — deux listes cote a cote, qu'on relit ensemble.
   */
  instantane(): number[] {
    const a = this.acc.instantane()
    return [
      this.vx, this.vy, a[0], a[1],
      this.auSol ? 1 : 0, this.murCote, this.coyoteRestant, this.tamponRestant,
      this.tientSaut ? 1 : 0, this.blocageMur, this.tempsDash, this.recupDash,
      this.dirDash.x, this.dirDash.y, this.dashDispo ? 1 : 0,
      this.coinCorrige ? 1 : 0, this.sautsUtilises, this.traversee,
    ]
  }

  restaurer(e: number[]): void {
    this.vx = e[0]; this.vy = e[1]
    this.acc.restaurer([e[2], e[3]])
    this.auSol = e[4] === 1; this.murCote = e[5]
    this.coyoteRestant = e[6]; this.tamponRestant = e[7]
    this.tientSaut = e[8] === 1; this.blocageMur = e[9]
    this.tempsDash = e[10]; this.recupDash = e[11]
    this.dirDash = { x: e[12], y: e[13] }; this.dashDispo = e[14] === 1
    this.coinCorrige = e[15] === 1; this.sautsUtilises = e[16]; this.traversee = e[17]
  }

  /** Remet le controleur a neuf, sans changer les reglages. */
  reinitialiser(): void {
    this.vx = 0; this.vy = 0
    this.acc.remettre()
    this.auSol = false; this.murCote = 0
    this.coyoteRestant = 0; this.tamponRestant = 0
    this.tientSaut = false; this.blocageMur = 0
    this.tempsDash = 0; this.recupDash = 0
    this.dashDispo = true; this.sautsUtilises = 0
    this.traversee = 0
  }

  /**
   * Relance vers le haut a une hauteur donnee. C'est le rebond du pietinement.
   *
   * On donne une HAUTEUR et non une vitesse, pour la meme raison que le saut :
   * « rebondir de vingt-huit pixels » se compare a l'oeil sur le niveau,
   * « rebondir a -180 » ne se compare a rien. La formule est celle du saut,
   * inversee.
   *
   * Le rebond rend le dash et les sauts aeriens : sauter sur une tete est une
   * recompense, et une recompense qui laisse en l'air sans ressource est une
   * punition deguisee.
   */
  rebondir(hauteur: number): void {
    if (hauteur <= 0) return
    this.vy = -Math.sqrt(2 * gravitéDe(this.r) * hauteur)
    this.auSol = false
    this.tientSaut = false
    this.sautsUtilises = 0
    this.dashDispo = true
    this.acc.bloquerY()
  }

  /**
   * Un pas de simulation.
   *
   * `dirX` vaut -1, 0 ou 1. `sauteDemande` est vrai a l'image ou le bouton est
   * PRESSE, `sauteTenu` tant qu'il l'est. Les separer est indispensable : la
   * hauteur variable a besoin du maintien, le tampon a besoin de l'instant.
   */
  avancer(
    g: GrilleSolide, corps: Corps2D, dt: number,
    dirX: number, sauteDemande: boolean, sauteTenu: boolean,
    dashDemande = false, dirYDash = 0,
  ): void {
    /* eslint-disable-next-line no-param-reassign -- voir la traversee, plus bas */
    this.coinCorrige = false
    const r = this.r
    const gravite = gravitéDe(r)

    /* --- Ce sur quoi on repose --- */
    const boiteA = (dx: number, dy: number): Rect =>
      rect(corps.x + corps.boite.x + dx, corps.y + corps.boite.y + dy, corps.boite.l, corps.boite.h)

    // Descendre d'une plateforme : vers le bas ET sauter. On cesse alors de
    // la voir le temps de la franchir. Le tampon de saut est consomme au
    // passage, sans quoi on retomberait en sautant aussitot.
    if (this.traversee > 0) this.traversee -= dt
    if (sauteDemande && dirYDash > 0 && this.auSol
      && plateformeArrete(g, boiteA(0, 0)) && !toucheSolide(g, boiteA(0, 1))) {
      this.traversee = r.traverseePlateforme
      sauteDemande = false
      this.tamponRestant = 0
    }

    const solAvant = this.auSol
    // Une plateforme porte aussi : sans cela on tombe au travers de ce sur
    // quoi on vient d'atterrir, parce que le sol se cherche avec `solide`.
    // Une pente porte aussi, et elle porte a une HAUTEUR : on est dessus quand
    // le bas du corps l'atteint, pas quand il touche sa case.
    // La boite NON decalee : une pente se cherche sous les pieds tels qu'ils
    // sont, et l'on accepte un pixel d'avance — c'est la meme tolerance que
    // la sonde d'un pixel qui sert au sol plat.
    const pente = sommetPente(g, boiteA(0, 0))
    const surPente = pente !== null
      && corps.y + corps.boite.y + corps.boite.h >= pente - 1
    this.auSol = (toucheSolide(g, boiteA(0, 1))
      || (this.traversee <= 0 && plateformeArrete(g, boiteA(0, 0)))
      || surPente) && this.vy >= 0
    this.murCote = 0
    if (!this.auSol) {
      if (toucheSolide(g, boiteA(-1, 0))) this.murCote = -1
      else if (toucheSolide(g, boiteA(1, 0))) this.murCote = 1
    }

    /* --- Les deux memoires --- */
    if (this.auSol) {
      this.coyoteRestant = r.coyote
      this.sautsUtilises = 0
      this.dashDispo = true
    } else if (solAvant && this.vy >= 0) {
      // On vient de quitter le sol SANS sauter : le coyote demarre ici.
      this.coyoteRestant = r.coyote
    } else {
      this.coyoteRestant = Math.max(0, this.coyoteRestant - dt)
    }
    this.tamponRestant = sauteDemande ? r.tampon : Math.max(0, this.tamponRestant - dt)

    /* --- Le dash court-circuite tout le reste --- */
    this.recupDash = Math.max(0, this.recupDash - dt)
    if (this.tempsDash > 0) {
      this.tempsDash -= dt
      this.vx = this.dirDash.x * r.vitesseDash
      this.vy = this.dirDash.y * r.vitesseDash
      this.deplacer(g, corps, dt)
      if (this.tempsDash <= 0) {
        // On sort du dash a vitesse reduite : garder la pleine vitesse
        // donnerait un elan gratuit qu'aucun bon jeu ne laisse passer.
        this.vx *= 0.45
        this.vy *= 0.35
      }
      return
    }
    if (dashDemande && this.dashDispo && this.recupDash <= 0) {
      const dx = dirX || (this.murCote ? -this.murCote : 1)
      const dy = dirYDash
      const n = Math.hypot(dx, dy) || 1
      this.dirDash = { x: dx / n, y: dy / n }
      this.tempsDash = r.dureeDash
      this.recupDash = r.recuperationDash
      this.dashDispo = false
      this.acc.remettre()
      return
    }

    /* --- L'horizontale --- */
    this.blocageMur = Math.max(0, this.blocageMur - dt)
    if (this.blocageMur <= 0) {
      const cible = dirX * r.vitesse
      const controle = this.auSol ? 1 : r.controleEnLair
      // Le temps d'accroche et de freinage se convertit en acceleration : on
      // regle un TEMPS, qui se compare a l'oeil, pas une acceleration.
      const duree = dirX !== 0 ? r.accroche : r.freinage
      const pas = (r.vitesse / Math.max(1e-4, duree)) * controle * dt
      this.vx += Math.max(-pas, Math.min(pas, cible - this.vx))
    }

    /* --- La verticale --- */
    const glisse = !this.auSol && this.murCote !== 0 && dirX === this.murCote && this.vy > 0
    let g2 = gravite
    if (this.vy > 0) g2 *= r.gravitDescente
    if (Math.abs(this.vy) < r.seuilApex && !this.auSol) g2 *= r.gravitApex
    this.vy += g2 * dt
    if (glisse) this.vy = Math.min(this.vy, r.vitesseGlissade)
    this.vy = Math.min(this.vy, r.chuteMax)
    if (this.auSol && this.vy > 0) this.vy = 0

    /* --- Le saut --- */
    const peutSauterDuSol = this.coyoteRestant > 0
    const peutSauterDuMur = this.murCote !== 0
    const peutSauterEnLair = this.sautsUtilises < this.sautsAeriens
    if (this.tamponRestant > 0 && (peutSauterDuSol || peutSauterDuMur || peutSauterEnLair)) {
      this.vy = impulsionDe(r)
      this.tientSaut = true
      this.tamponRestant = 0
      if (peutSauterDuSol) {
        this.coyoteRestant = 0
      } else if (peutSauterDuMur) {
        // Le saut mural pousse dans le sens OPPOSE au mur, et bloque le
        // controle un instant : sans ce blocage, tenir la direction du mur
        // recolle immediatement au mur et le saut ne sert a rien.
        this.vx = -this.murCote * r.pousseeMur
        this.blocageMur = r.blocageApresMur
        this.dashDispo = true
      } else {
        this.sautsUtilises++
      }
      this.auSol = false
    }

    // La hauteur variable : relacher coupe la montee, une seule fois.
    if (this.tientSaut && !sauteTenu && this.vy < 0) {
      this.vy *= r.coupureSaut
      this.tientSaut = false
    }
    if (this.vy >= 0) this.tientSaut = false

    this.deplacer(g, corps, dt)
  }

  /**
   * Le deplacement, avec la correction de coin.
   *
   * Un saut qui frole un plafond par un ou deux pixels est decale
   * lateralement au lieu d'etre arrete net. C'est la technique la plus
   * invisible du lot : on ne la remarque jamais quand elle est la, et le jeu
   * parait injuste quand elle manque.
   */
  private deplacer(g: GrilleSolide, corps: Corps2D, dt: number): void {
    const pas = this.acc.pas(this.vx * dt, this.vy * dt)
    const b = corps.boite

    /*
     * Horizontal, pixel par pixel — et l'on MONTE ce qui se monte.
     *
     * Devant un obstacle, on cherche le meme pas quelques pixels plus haut. Si
     * le corps y passe, c'est une pente ou une marche : on grimpe. Sinon c'est
     * un mur : on s'arrete. Le meme test sert aux deux, et c'est ce qui evite
     * d'avoir deux regles qui se contredisent un jour.
     */
    const sx = Math.sign(pas.x)
    for (let i = 0; i < Math.abs(pas.x); i++) {
      if (toucheSolide(g, rect(corps.x + b.x + sx, corps.y + b.y, b.l, b.h))) {
        let monte = 0
        while (monte < this.r.montee) {
          monte++
          if (!toucheSolide(g, rect(corps.x + b.x + sx, corps.y + b.y - monte, b.l, b.h))) break
        }
        const passe = monte <= this.r.montee
          && !toucheSolide(g, rect(corps.x + b.x + sx, corps.y + b.y - monte, b.l, b.h))
        // On ne grimpe qu'au SOL : en l'air, une marche franchie toute seule
        // ferait s'accrocher aux rebords en plein saut.
        if (passe && this.auSol) {
          corps.x += sx
          corps.y -= monte
          continue
        }
        this.vx = 0
        this.acc.bloquerX()
        break
      }
      corps.x += sx
      // Sur une pente, on SUIT la surface au lieu de la quitter : sans cela on
      // descend une cote en petits sauts, une image sur deux en l'air.
      if (this.auSol && this.vy >= 0) {
        const dessous = sommetPente(g, rect(corps.x + b.x, corps.y + b.y, b.l, b.h))
        if (dessous !== null) {
          const cible = dessous - b.h - b.y
          const ecart = cible - corps.y
          if (ecart < 0 && ecart >= -this.r.montee) corps.y = cible
          else if (ecart > 0 && ecart <= this.r.montee) corps.y = cible
        }
      }
    }

    // Vertical, avec correction de coin a la montee.
    const sy = Math.sign(pas.y)
    for (let i = 0; i < Math.abs(pas.y); i++) {
      const ici = rect(corps.x + b.x, corps.y + b.y, b.l, b.h)
      // Une plateforme n'arrete que ce qui descend, et seulement au moment ou
      // le bas du corps croise le haut de la case.
      const surLaPente = sy > 0 && (() => {
        const p = sommetPente(g, rect(corps.x + b.x, corps.y + b.y, b.l, b.h))
        return p !== null && corps.y + b.y + b.h + sy > p
      })()
      const posee = sy > 0 && this.traversee <= 0
        && (plateformeArrete(g, ici) || surLaPente)
      if (!posee && !toucheSolide(g, rect(corps.x + b.x, corps.y + b.y + sy, b.l, b.h))) {
        corps.y += sy
        continue
      }
      if (posee) {
        this.auSol = true
        this.vy = 0
        this.acc.bloquerY()
        break
      }
      if (sy < 0 && this.corrigerCoin(g, corps)) {
        // Le decalage a libere le passage : on rejoue ce pixel.
        i--
        continue
      }
      if (sy > 0) this.auSol = true
      this.vy = 0
      this.acc.bloquerY()
      break
    }
  }

  private corrigerCoin(g: GrilleSolide, corps: Corps2D): boolean {
    const b = corps.boite
    for (let d = 1; d <= this.r.correctionCoin; d++) {
      for (const s of [-1, 1]) {
        const dx = d * s
        if (toucheSolide(g, rect(corps.x + b.x + dx, corps.y + b.y - 1, b.l, b.h))) continue
        if (toucheSolide(g, rect(corps.x + b.x + dx, corps.y + b.y, b.l, b.h))) continue
        corps.x += dx
        this.coinCorrige = true
        return true
      }
    }
    return false
  }
}

/** Lit les entrees dans la forme que `avancer` attend. */
export function lireEntrees(e: Entrees): {
  dirX: number; sauteDemande: boolean; sauteTenu: boolean; dash: boolean; dirY: number
} {
  const a = e.axe()
  return {
    dirX: a.x,
    sauteDemande: e.consommer('saut'),
    sauteTenu: e.tenue('saut'),
    dash: e.consommer('dash'),
    dirY: a.y,
  }
}
