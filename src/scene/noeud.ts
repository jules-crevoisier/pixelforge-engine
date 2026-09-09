import { type Point, Accumulateur } from '../noyau/pixel.ts'

/**
 * L'arbre de scene.
 *
 * ## Pourquoi si peu de types de noeuds
 *
 * Un moteur generaliste en propose des dizaines, parce qu'il doit couvrir la
 * 3D, l'interface, le son spatialise, la physique a corps rigides. Un jeu 2D
 * en pixel art en emploie cinq, et les autres ne font qu'allonger la liste ou
 * l'on cherche. On en declare donc cinq, et on en ajoutera quand un vrai jeu
 * en manquera — pas avant.
 *
 * ## Pourquoi la position est entiere jusque dans le type
 *
 * `x` et `y` sont des entiers, et le mouvement fractionnaire passe par
 * l'accumulateur du noeud. Si la position acceptait des reels, la premiere
 * ligne de code de gameplay ecrirait `this.x += vitesse * dt` et le contrat de
 * pixel serait perdu sans que personne le remarque — c'est ainsi que meurent
 * les moteurs « pixel perfect ».
 */
export type TypeNoeud = 'noeud' | 'sprite' | 'carte' | 'corps' | 'zone' | 'camera'

export interface Noeud {
  id: string
  nom: string
  type: TypeNoeud
  /** Position locale, en pixels entiers, relative au parent. */
  x: number
  y: number
  visible: boolean
  enfants: Noeud[]
  /** Le script attache, s'il y en a un. */
  script: string | null
  /** Ce que le script y range. Le moteur n'y touche pas. */
  etat: Record<string, unknown>
}

export interface NoeudSprite extends Noeud {
  type: 'sprite'
  /** Chemin de l'asset dans le projet. */
  source: string
  /** Animation courante, et image dans cette animation. */
  animation: string
  image: number
  /** Point d'ancrage dans le dessin : les pieds, en general. */
  ancreX: number
  ancreY: number
  /** Le sprite est-il retourne ? Un miroir ne coute rien et evite un dessin. */
  miroir: boolean
  /** Ordre de dessin. A egalite, c'est le `y` qui tranche — voir `ordonner`. */
  couche: number
}

export interface NoeudCarte extends Noeud {
  type: 'carte'
  /** Chemin de la carte dans le projet. */
  source: string
}

export interface NoeudCorps extends Noeud {
  type: 'corps'
  /** Boite de collision, relative au noeud. */
  boiteX: number
  boiteY: number
  boiteL: number
  boiteH: number
  /** Vitesse en pixels par seconde. Le pas entier passe par l'accumulateur. */
  vx: number
  vy: number
}

export interface NoeudZone extends Noeud {
  type: 'zone'
  boiteX: number
  boiteY: number
  boiteL: number
  boiteH: number
  /** Ce que la zone declenche : porte, piege, ramassage. */
  role: string
}

export interface NoeudCamera extends Noeud {
  type: 'camera'
  /** Le noeud suivi, ou null pour une camera fixe. */
  cible: string | null
  /**
   * Marge morte au centre : la camera ne bouge pas tant que la cible y reste.
   *
   * Sans elle, la camera suit le moindre pas et l'image tremble en
   * permanence — sur une resolution de 320 pixels de large, un tremblement
   * d'un pixel se voit comme une secousse.
   */
  margeX: number
  margeY: number
}

let compteur = 0
export const nouvelId = (): string => `n${(++compteur).toString(36)}`

export function creerNoeud(type: TypeNoeud, nom: string): Noeud {
  const base: Noeud = {
    id: nouvelId(), nom, type, x: 0, y: 0, visible: true,
    enfants: [], script: null, etat: {},
  }
  switch (type) {
    case 'sprite':
      return { ...base, source: '', animation: 'repos', image: 0,
        ancreX: 0, ancreY: 0, miroir: false, couche: 0 } as NoeudSprite
    case 'carte':
      return { ...base, source: '' } as NoeudCarte
    case 'corps':
      return { ...base, boiteX: 0, boiteY: 0, boiteL: 8, boiteH: 8, vx: 0, vy: 0 } as NoeudCorps
    case 'zone':
      return { ...base, boiteX: 0, boiteY: 0, boiteL: 16, boiteH: 16, role: '' } as NoeudZone
    case 'camera':
      return { ...base, cible: null, margeX: 24, margeY: 16 } as NoeudCamera
    default:
      return base
  }
}

/** Position absolue d'un noeud, en remontant ses parents. */
export function positionMonde(racine: Noeud, id: string): Point | null {
  const chemin = (n: Noeud, ax: number, ay: number): Point | null => {
    const x = ax + n.x
    const y = ay + n.y
    if (n.id === id) return { x, y }
    for (const e of n.enfants) {
      const r = chemin(e, x, y)
      if (r) return r
    }
    return null
  }
  return chemin(racine, 0, 0)
}

export function parcourir(n: Noeud, f: (n: Noeud, parentX: number, parentY: number) => void,
                          px = 0, py = 0): void {
  f(n, px, py)
  for (const e of n.enfants) parcourir(e, f, px + n.x, py + n.y)
}

export function trouver(n: Noeud, id: string): Noeud | null {
  if (n.id === id) return n
  for (const e of n.enfants) {
    const r = trouver(e, id)
    if (r) return r
  }
  return null
}

export function trouverParNom(n: Noeud, nom: string): Noeud | null {
  if (n.nom === nom) return n
  for (const e of n.enfants) {
    const r = trouverParNom(e, nom)
    if (r) return r
  }
  return null
}

/**
 * Ordre de dessin d'une vue de dessus : le `y` tranche a couche egale.
 *
 * Dans un jeu vu de dessus, ce qui est plus BAS a l'ecran est plus PRES de la
 * camera et doit passer devant. Sans cette regle, un personnage devant une
 * caisse est dessine derriere elle selon l'ordre ou ils ont ete poses dans la
 * scene — et l'ordre change des qu'on renomme quelque chose.
 *
 * `couche` reste disponible pour ce qui echappe a la regle : un plafond, une
 * ombre au sol, une interface.
 */
export function ordonner(a: { couche: number; y: number }, b: { couche: number; y: number }): number {
  return a.couche - b.couche || a.y - b.y
}

/** Les accumulateurs vivent hors des noeuds : ils ne s'enregistrent pas. */
export class Mouvements {
  private table = new Map<string, Accumulateur>()
  de(id: string): Accumulateur {
    let a = this.table.get(id)
    if (!a) { a = new Accumulateur(); this.table.set(id, a) }
    return a
  }
  oublier(id: string): void { this.table.delete(id) }
}
