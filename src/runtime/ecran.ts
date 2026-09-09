import { echelleEntiere } from '../noyau/pixel.ts'

/**
 * L'ecran du jeu : une resolution virtuelle, agrandie d'un facteur entier.
 *
 * Le jeu dessine TOUJOURS dans la meme resolution, quelle que soit la fenetre.
 * C'est le contrat qui rend un jeu pixel art reproductible : le champ de
 * vision ne depend pas de l'ecran de la personne, une salle cadree a
 * l'edition est cadree pareil chez tout le monde, et un pixel du dessin
 * occupe exactement N pixels de l'ecran.
 *
 * Le prix a payer, ce sont des bandes noires. On les paie volontiers : la
 * seule alternative est une echelle fractionnaire, qui fait onduler la grille.
 *
 * ## Deux canevas et non un
 *
 * On dessine dans un canevas a la taille virtuelle — 320x180 par exemple —
 * puis on l'agrandit d'un coup dans le canevas visible. Dessiner directement a
 * l'echelle finale obligerait chaque sprite a se caler lui-meme sur la grille
 * ecran, et le premier oubli ferait baver un contour. Ici la question ne se
 * pose pas : dans le canevas virtuel, une unite EST un pixel.
 */
export interface Vue {
  readonly largeur: number
  readonly hauteur: number
}

export class Ecran {
  /** Le canevas ou le jeu dessine, a la resolution virtuelle. */
  readonly tampon: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  private echelleCourante = 1
  private decalageX = 0
  private decalageY = 0

  private readonly sortie: HTMLCanvasElement
  vue: Vue

  constructor(sortie: HTMLCanvasElement, vue: Vue) {
    this.sortie = sortie
    this.vue = vue
    this.tampon = document.createElement('canvas')
    this.tampon.width = vue.largeur
    this.tampon.height = vue.hauteur
    const c = this.tampon.getContext('2d', { alpha: false })
    if (!c) throw new Error('canevas 2D indisponible')
    this.ctx = c
    this.ctx.imageSmoothingEnabled = false
  }

  get echelle(): number { return this.echelleCourante }

  /** Change la resolution virtuelle du jeu. */
  redimensionner(vue: Vue): void {
    this.vue = vue
    this.tampon.width = vue.largeur
    this.tampon.height = vue.hauteur
    this.ctx.imageSmoothingEnabled = false
  }

  /**
   * Recalcule l'echelle et le centrage, puis recopie le tampon a l'ecran.
   *
   * Le canevas de sortie est dimensionne en PIXELS D'APPAREIL et non en pixels
   * CSS : sur un ecran a 150%, un pixel CSS vaut un pixel et demi d'appareil,
   * et une echelle entiere en CSS redevient fractionnaire a l'arrivee. C'est
   * la faute la plus courante d'un jeu pixel art sur le web, et elle ne se
   * voit que sur les machines des autres.
   */
  presenter(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const boite = this.sortie.getBoundingClientRect()
    const lp = Math.max(1, Math.round(boite.width * dpr))
    const hp = Math.max(1, Math.round(boite.height * dpr))
    if (this.sortie.width !== lp || this.sortie.height !== hp) {
      this.sortie.width = lp
      this.sortie.height = hp
    }

    const k = echelleEntiere(this.vue.largeur, this.vue.hauteur, lp, hp)
    this.echelleCourante = k
    const l = this.vue.largeur * k
    const h = this.vue.hauteur * k
    // Le centrage est arrondi a l'entier : un demi-pixel de decalage suffirait
    // a repartir les colonnes inegalement.
    this.decalageX = Math.floor((lp - l) / 2)
    this.decalageY = Math.floor((hp - h) / 2)

    const ctx = this.sortie.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, lp, hp)
    ctx.drawImage(this.tampon, this.decalageX, this.decalageY, l, h)
  }

  /** Position dans le jeu d'un point de la page. Rend null hors de la vue. */
  versJeu(pageX: number, pageY: number): { x: number; y: number } | null {
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const boite = this.sortie.getBoundingClientRect()
    const px = (pageX - boite.left) * dpr - this.decalageX
    const py = (pageY - boite.top) * dpr - this.decalageY
    const x = Math.floor(px / this.echelleCourante)
    const y = Math.floor(py / this.echelleCourante)
    if (x < 0 || y < 0 || x >= this.vue.largeur || y >= this.vue.hauteur) return null
    return { x, y }
  }
}
