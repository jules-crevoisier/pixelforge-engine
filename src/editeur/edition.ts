import type { Jeu } from '../runtime/jeu.ts'
import type { Carte, Calque } from '../tuiles/tilemap.ts'
import { VIDE } from '../tuiles/tilemap.ts'
import { mondeVersCase } from '../noyau/projection.ts'
import {
  Historique, differences, gesteDeChangements, type Changement,
} from './historique.ts'

/**
 * Le mode edition : peindre le decor pendant que la scene est arretee.
 *
 * ## Pourquoi le pinceau peint un TERRAIN et non une tuile
 *
 * Choisir la bonne tuile parmi quarante-sept, case par case, c'est ce que
 * l'autotiling existe pour supprimer. Le pinceau dit donc « ici il y a du
 * mur », et la tuile se deduit. Un pinceau qui pose une tuile precise reste
 * disponible pour les cas particuliers, mais il ne peut pas etre le geste par
 * defaut : ce serait rendre a la main le travail qu'on vient d'automatiser.
 *
 * ## Pourquoi la solidite suit le terrain par defaut
 *
 * Un mur qu'on peint et qui ne bloque pas est une source d'erreur silencieuse
 * — on ne s'en apercoit qu'en jouant, parfois bien plus tard. Peindre du mur
 * pose donc la collision du meme geste, et le mode « collision » permet de la
 * corriger ensuite : un tapis qui ne bloque pas, un trou invisible qui bloque.
 */
export type Outil = 'terrain' | 'gomme' | 'collision' | 'tuile' | 'entite' | 'main'

export interface EtatEdition {
  outil: Outil
  /** Le calque de terrain qu'on peint. */
  calque: Calque | null
  /** Affiche la grille de collision par-dessus le decor. */
  montrerCollision: boolean
  /**
   * Tuile posee quand le calque n'obeit pas a un terrain.
   *
   * L'autotiling ne s'applique qu'aux decors qui ont un voisinage a consulter.
   * Un bloc isometrique n'en a pas : il est le meme quels que soient ses
   * voisins, et vouloir lui en donner un reviendrait a dessiner quarante-sept
   * variantes identiques.
   */
  tuileFixe: number
  /**
   * L'espece que l'outil « entite » pose, et la tuile que l'outil « tuile »
   * peint. Deux choix qui vivent dans l'etat de l'edition et non dans le
   * bouton : on veut pouvoir changer d'outil et retrouver son choix.
   */
  espece: string | null
  tuileChoisie: number
  /** Le calque que l'outil « tuile » peint, par son nom. */
  calqueChoisi: string | null
}

export class Edition {
  readonly etat: EtatEdition = {
    outil: 'terrain', calque: null, montrerCollision: false, tuileFixe: 0,
    espece: null, tuileChoisie: 0, calqueChoisi: null,
  }

  /**
   * Ce que l'edition fait quand on pose ou retire une entite.
   *
   * L'edition ne connait ni le peuplement ni le catalogue : elle sait
   * seulement qu'un clic a eu lieu a tel endroit du monde. C'est l'editeur qui
   * decide ce que cela veut dire — et c'est ce qui permet a un monde sans
   * entites de simplement ne pas brancher ce crochet.
   */
  surEntite: ((cx: number, cy: number, retirer: boolean) => void) | null = null

  /** Ce qu'on peut defaire. Partage avec l'editeur, qui y pose ses gestes. */
  readonly historique = new Historique()

  /** L'etat de la carte avant le geste en cours, ou null. */
  private photo: {
    cases: Int32Array[]
    presence: (Uint8Array | null)[]
    solides: Uint8Array
  } | null = null
  private jeu: Jeu
  private carte: Carte
  private peint = false
  /** Ce que le premier appui a decide : on pose ou on retire, pas les deux. */
  private pose = true
  private dernierePosition: { cx: number; cy: number } | null = null
  private glisseCamera: { x: number; y: number; camX: number; camY: number } | null = null

  constructor(jeu: Jeu, carte: Carte) {
    this.jeu = jeu
    this.carte = carte
    this.etat.calque = calqueEditable(carte)
  }

  /**
   * Case du monde sous un point de la page, ou null hors de la vue.
   *
   * Le chemin passe par la projection et non par une division : sur une carte
   * isometrique, diviser par la taille de tuile pointe la case du dessous des
   * qu'on s'ecarte du centre d'un losange — et l'on s'en ecarte justement
   * quand on vise une case voisine. C'est le defaut qui trahit un editeur
   * orthogonal repeint en losanges.
   */
  caseSous(pageX: number, pageY: number): { cx: number; cy: number } | null {
    const p = this.jeu.ecran.versJeu(pageX, pageY)
    if (!p) return null
    const c = mondeVersCase(this.jeu.projection,
      p.x + Math.round(this.jeu.camera.x), p.y + Math.round(this.jeu.camera.y))
    if (!this.carte.dedans(c.x, c.y)) return null
    return { cx: c.x, cy: c.y }
  }

  /** Change la carte editee : l'editeur passe d'un monde a l'autre. */
  changerCarte(carte: Carte, tuileFixe = 0): void {
    this.carte = carte
    this.etat.calque = calqueEditable(carte)
    this.etat.tuileFixe = tuileFixe
    this.finir()
  }

  /**
   * Photographie la carte avant un geste.
   *
   * Tout, et non le calque touche : le pinceau de terrain change la collision
   * en meme temps que le dessin, et un jour il changera autre chose. Copier
   * tout coute quelques kilo-octets et rend le defaire complet par
   * construction, au lieu de le rendre complet par vigilance.
   */
  private photographier(): void {
    this.photo = {
      cases: this.carte.calques.map((c) => c.cases.slice()),
      presence: this.carte.calques.map((c) => (c.presence ? c.presence.slice() : null)),
      solides: this.carte.solides.slice(),
    }
  }

  /** Compare a la photographie et enregistre le geste, s'il a change quelque chose. */
  private enregistrer(nom: string): void {
    if (!this.photo) return
    const changements: Changement[] = []
    this.carte.calques.forEach((c, i) => {
      changements.push(...differences(c.cases, this.photo!.cases[i]))
      const p = this.photo!.presence[i]
      if (c.presence && p) changements.push(...differences(c.presence, p))
    })
    changements.push(...differences(this.carte.solides, this.photo.solides))
    this.photo = null
    if (changements.length === 0) return
    this.historique.poser(gesteDeChangements(nom, changements, () => this.jeu.dessiner()))
  }

  commencer(pageX: number, pageY: number, bouton: number): void {
    if (this.etat.outil === 'main' || bouton === 1) {
      this.glisseCamera = { x: pageX, y: pageY, camX: this.jeu.camera.x, camY: this.jeu.camera.y }
      return
    }
    const c = this.caseSous(pageX, pageY)
    if (!c) return
    this.peint = true
    if (this.etat.outil !== 'entite') this.photographier()
    // Le bouton droit retire, comme partout ailleurs. Et sur un terrain deja
    // present, le premier appui decide : on retire. Sans cette regle, un
    // glissement sur une zone melangee pose et retire alternativement.
    // L'outil « entite » pose au clic gauche et retire au clic droit, sans
    // regarder ce qu'il y a deja : une entite n'occupe pas une case, plusieurs
    // peuvent se superposer, et « inverser » n'aurait pas de sens.
    this.pose = this.etat.outil === 'entite' || this.etat.outil === 'tuile'
      ? bouton !== 2
      : (bouton === 2 ? false : !this.etatDe(c.cx, c.cy))
    this.dernierePosition = null
    this.appliquer(c.cx, c.cy)
  }

  bouger(pageX: number, pageY: number): void {
    if (this.glisseCamera) {
      const k = this.jeu.ecran.echelle
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      this.jeu.camera.x = this.glisseCamera.camX - ((pageX - this.glisseCamera.x) * dpr) / k
      this.jeu.camera.y = this.glisseCamera.camY - ((pageY - this.glisseCamera.y) * dpr) / k
      this.jeu.dessiner()
      return
    }
    if (!this.peint) return
    const c = this.caseSous(pageX, pageY)
    if (!c) return
    if (this.dernierePosition && this.dernierePosition.cx === c.cx && this.dernierePosition.cy === c.cy) return
    // On ne seme pas d'entites en glissant : une par clic, sinon un geste
    // depose trente creatures qu'il faut retirer une par une.
    if (this.etat.outil === 'entite') return
    this.appliquer(c.cx, c.cy)
  }

  finir(): void {
    if (this.peint) this.enregistrer(NOM_GESTE[this.etat.outil] ?? this.etat.outil)
    this.peint = false
    this.glisseCamera = null
    this.dernierePosition = null
  }

  private etatDe(cx: number, cy: number): boolean {
    const i = this.carte.index(cx, cy)
    if (this.etat.outil === 'collision') return this.carte.solides[i] !== 0
    return (this.etat.calque?.presence?.[i] ?? 0) !== 0
  }

  private appliquer(cx: number, cy: number): void {
    this.dernierePosition = { cx, cy }
    const i = this.carte.index(cx, cy)

    if (this.etat.outil === 'entite') {
      // On passe la CASE et non un point. Une entite est ancree a ses pieds :
      // le point vise tombe sur le bord de sa boite ou juste a cote, et un
      // test ponctuel la rate une fois sur deux. Une case designe sans
      // ambiguite ce qu'on croit montrer.
      this.surEntite?.(cx, cy, !this.pose)
      this.jeu.dessiner()
      return
    }

    if (this.etat.outil === 'tuile') {
      const calque = this.carte.calques.find((q) => q.nom === this.etat.calqueChoisi)
        ?? this.etat.calque
      if (!calque) return
      // La tuile precise, sans autotiling : c'est le geste qu'on garde pour
      // les cas particuliers, la ou le voisinage ne sait pas deviner.
      calque.cases[i] = this.pose ? this.etat.tuileChoisie : VIDE
      if (calque.presence) calque.presence[i] = this.pose ? 1 : 0
      this.jeu.dessiner()
      return
    }

    if (this.etat.outil === 'collision') {
      this.carte.solides[i] = this.pose ? 1 : 0
      this.jeu.dessiner()
      return
    }

    const calque = this.etat.calque
    if (!calque) return
    const pose = this.etat.outil === 'gomme' ? false : this.pose
    this.carte.peindreTerrain(calque, cx, cy, pose)
    // Sans terrain, la tuile ne se deduit de rien : on pose celle du monde.
    if (!calque.terrain) calque.cases[i] = pose ? this.etat.tuileFixe : VIDE
    // La collision suit le terrain : un mur peint qui ne bloque pas ne se
    // decouvre qu'en jouant, parfois bien plus tard.
    this.carte.solides[i] = pose ? 1 : 0
    if (!pose) calque.cases[i] = VIDE
    this.jeu.dessiner()
  }

  /** Compte ce qui est pose, pour la barre d'etat. */
  compter(): { terrain: number; solides: number } {
    let terrain = 0
    let solides = 0
    const p = this.etat.calque?.presence
    for (let i = 0; i < this.carte.cases; i++) {
      if (p && p[i]) terrain++
      if (this.carte.solides[i]) solides++
    }
    return { terrain, solides }
  }
}

/**
 * Le calque que le pinceau modifie.
 *
 * Le calque de terrain, s'il y en a un — c'est celui qu'on veut peindre neuf
 * fois sur dix. Sinon le dernier, qui est le plus haut : peindre sous le decor
 * deja pose donnerait l'impression que le pinceau ne fait rien.
 */
function calqueEditable(carte: Carte): Calque | null {
  return carte.calques.find((c) => c.terrain)
    ?? carte.calques[carte.calques.length - 1]
    ?? null
}

/** Ce que l'historique montrera pour chaque outil. */
const NOM_GESTE: Record<string, string> = {
  terrain: 'terrain',
  gomme: 'gomme',
  collision: 'collision',
  tuile: 'tuile',
}
