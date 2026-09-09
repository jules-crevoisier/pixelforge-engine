import type { Jeu } from '../runtime/jeu.ts'
import type { Carte, Calque } from '../tuiles/tilemap.ts'
import { VIDE } from '../tuiles/tilemap.ts'

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
export type Outil = 'terrain' | 'gomme' | 'collision' | 'main'

export interface EtatEdition {
  outil: Outil
  /** Le calque de terrain qu'on peint. */
  calque: Calque | null
  /** Affiche la grille de collision par-dessus le decor. */
  montrerCollision: boolean
}

export class Edition {
  readonly etat: EtatEdition = { outil: 'terrain', calque: null, montrerCollision: false }
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
    this.etat.calque = carte.calques.find((c) => c.terrain) ?? null
  }

  /** Case du monde sous un point de la page, ou null hors de la vue. */
  caseSous(pageX: number, pageY: number): { cx: number; cy: number } | null {
    const p = this.jeu.ecran.versJeu(pageX, pageY)
    if (!p) return null
    const cx = Math.floor((p.x + this.jeu.camera.x) / this.carte.tuile)
    const cy = Math.floor((p.y + this.jeu.camera.y) / this.carte.tuile)
    if (!this.carte.dedans(cx, cy)) return null
    return { cx, cy }
  }

  commencer(pageX: number, pageY: number, bouton: number): void {
    if (this.etat.outil === 'main' || bouton === 1) {
      this.glisseCamera = { x: pageX, y: pageY, camX: this.jeu.camera.x, camY: this.jeu.camera.y }
      return
    }
    const c = this.caseSous(pageX, pageY)
    if (!c) return
    this.peint = true
    // Le bouton droit retire, comme partout ailleurs. Et sur un terrain deja
    // present, le premier appui decide : on retire. Sans cette regle, un
    // glissement sur une zone melangee pose et retire alternativement.
    this.pose = bouton === 2 ? false : !this.etatDe(c.cx, c.cy)
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
    this.appliquer(c.cx, c.cy)
  }

  finir(): void {
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

    if (this.etat.outil === 'collision') {
      this.carte.solides[i] = this.pose ? 1 : 0
      this.jeu.dessiner()
      return
    }

    const calque = this.etat.calque
    if (!calque) return
    const pose = this.etat.outil === 'gomme' ? false : this.pose
    this.carte.peindreTerrain(calque, cx, cy, pose)
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
