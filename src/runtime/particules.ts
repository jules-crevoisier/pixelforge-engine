import { Hasard } from '../niveau/plan.ts'

/**
 * Les particules : ce qui rend un coup satisfaisant.
 *
 * ## Pourquoi elles ne sont PAS dans la simulation
 *
 * Une gerbe d'etincelles ne decide de rien. La mettre dans l'etat du jeu
 * obligerait a la photographier a chaque pas garde par le rembobinage, a la
 * transmettre, a s'accorder dessus entre deux machines — pour quelque chose
 * que personne ne peut contredire. Elle vit donc du cote de la PRESENTATION,
 * comme le son, et l'empreinte du jeu ne la voit pas.
 *
 * La consequence s'assume : apres un rembobinage, les etincelles ne sont pas
 * exactement aux memes endroits sur les deux machines. Personne ne s'en
 * apercevra jamais, et c'est precisement le critere.
 *
 * ## Pourquoi un pixel, et pas une texture
 *
 * A cette resolution, une particule fait un pixel — deux au plus. Une texture
 * de fumee douce serait floue, donc etrangere. La variete vient du NOMBRE, de
 * la duree de vie et de la couleur, pas du dessin.
 *
 * ## Pourquoi les positions restent entieres
 *
 * Meme contrat que tout le reste. Une particule en sous-pixel scintille entre
 * deux colonnes, et l'oeil le voit tout de suite sur un fond uni.
 */

export interface Emission {
  /** Combien de particules d'un coup. */
  nombre: number
  /** Duree de vie, en millisecondes, et sa variation. */
  vie: number
  vieVariation: number
  /** Vitesse initiale, en pixels par seconde, et sa variation. */
  vitesse: number
  vitesseVariation: number
  /**
   * Direction moyenne, en degres, et ouverture de l'eventail.
   *
   * Zero degre pointe vers la droite, quatre-vingt-dix vers le BAS : c'est le
   * sens de l'ecran, pas celui des mathematiques. Se tromper la-dessus fait
   * tomber les etincelles vers le haut, et l'on cherche longtemps.
   */
  angle: number
  ouverture: number
  /** Pesanteur appliquee, en pixels par seconde carree. */
  pesanteur: number
  /** Frottement par seconde, de 0 a 1. Zero : rien ne ralentit. */
  frottement: number
  /** Les couleurs traversees pendant la vie, de la premiere a la derniere. */
  couleurs: string[]
}

export function emission(p: Partial<Emission> = {}): Emission {
  return {
    nombre: p.nombre ?? 8,
    vie: p.vie ?? 400,
    vieVariation: p.vieVariation ?? 150,
    vitesse: p.vitesse ?? 60,
    vitesseVariation: p.vitesseVariation ?? 30,
    angle: p.angle ?? -90,
    ouverture: p.ouverture ?? 60,
    pesanteur: p.pesanteur ?? 180,
    frottement: p.frottement ?? 0,
    couleurs: p.couleurs ?? ['#ffffff', '#ffd66b', '#c0334a'],
  }
}

interface Particule {
  x: number
  y: number
  vx: number
  vy: number
  restant: number
  duree: number
  couleurs: string[]
}

export class Particules {
  private liste: Particule[] = []
  private hasard: Hasard
  /**
   * Plafond du nombre de particules vivantes.
   *
   * Un plafond, et non une file qui grandit : une explosion de mille
   * particules ne se voit pas mieux qu'une de cent, et fait tomber la cadence
   * — c'est-a-dire qu'elle abime le jeu pour embellir un instant du jeu. Les
   * plus anciennes cedent la place.
   */
  plafond = 400

  constructor(graine = 1) { this.hasard = new Hasard(graine >>> 0) }

  get nombre(): number { return this.liste.length }

  /** Une gerbe, a un point du monde. */
  emettre(e: Emission, x: number, y: number): void {
    for (let i = 0; i < e.nombre; i++) {
      const a = ((e.angle + (this.hasard.reel() - 0.5) * e.ouverture) * Math.PI) / 180
      const v = e.vitesse + (this.hasard.reel() - 0.5) * 2 * e.vitesseVariation
      const duree = Math.max(16, e.vie + (this.hasard.reel() - 0.5) * 2 * e.vieVariation)
      this.liste.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        restant: duree, duree, couleurs: e.couleurs,
      })
    }
    // On coupe par le DEBUT : les plus anciennes sont les plus proches de
    // disparaitre, donc celles dont l'absence se remarque le moins.
    if (this.liste.length > this.plafond) {
      this.liste.splice(0, this.liste.length - this.plafond)
    }
    this.pesanteurCourante = e.pesanteur
    this.frottementCourant = e.frottement
  }

  private pesanteurCourante = 180
  private frottementCourant = 0

  avancer(dtMs: number): void {
    const dt = dtMs / 1000
    const vivantes: Particule[] = []
    for (const p of this.liste) {
      p.restant -= dtMs
      if (p.restant <= 0) continue
      p.vy += this.pesanteurCourante * dt
      if (this.frottementCourant > 0) {
        const k = Math.max(0, 1 - this.frottementCourant * dt)
        p.vx *= k
        p.vy *= k
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      vivantes.push(p)
    }
    this.liste = vivantes
  }

  /**
   * Ce qu'il faut peindre : un point entier et une couleur.
   *
   * Rendre au lieu de peindre, comme le lecteur d'animation rend ses
   * evenements : le banc peut compter et mesurer sans navigateur, et
   * l'appelant choisit sa facon de dessiner.
   */
  points(): { x: number; y: number; couleur: string }[] {
    return this.liste.map((p) => {
      const avance = 1 - p.restant / p.duree
      const i = Math.min(
        p.couleurs.length - 1, Math.floor(avance * p.couleurs.length),
      )
      return { x: Math.round(p.x), y: Math.round(p.y), couleur: p.couleurs[Math.max(0, i)] }
    })
  }

  vider(): void { this.liste.length = 0 }
}
