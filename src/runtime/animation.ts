/**
 * Les animations : des images, des durees, et des evenements.
 *
 * ## Pourquoi des millisecondes et non des images
 *
 * On pourrait dire « quatre images de jeu par dessin ». C'est ce que faisaient
 * les consoles, ou le taux de rafraichissement etait grave dans le materiel.
 * Sur le web il ne l'est pas : la meme animation tournerait a deux vitesses
 * differentes sur deux ecrans. Une duree en millisecondes est ce qu'exportent
 * Aseprite et LibreSprite, c'est ce que comprennent Unity et Godot, et c'est la
 * seule unite qui survive a un changement de pas de simulation.
 *
 * ## Pourquoi le lecteur rend les evenements au lieu de les appeler
 *
 * Un evenement — le pied qui touche le sol, l'image ou le coup porte — doit
 * declencher quelque chose. Si le lecteur appelait lui-meme une fonction, il
 * lui faudrait connaitre le jeu, l'audio, la scene ; il deviendrait
 * inexportable et inéprouvable sans navigateur. Il rend donc une liste, et
 * l'appelant en fait ce qu'il veut.
 *
 * ## Le piege des evenements avales
 *
 * Quand une image de jeu est longue — un chargement, un onglet qui revient au
 * premier plan — le temps ecoule peut couvrir PLUSIEURS dessins d'un coup. Un
 * lecteur naif se contente d'arriver au bon dessin ; tous les evenements des
 * dessins traverses sont perdus, et le bruit de pas manque justement quand la
 * machine rame. On avance donc dessin par dessin, en relevant tout ce qu'on
 * franchit, dans l'ordre.
 */

/** Un dessin de l'animation : quelle case de la planche, et combien de temps. */
export interface ImageAnim {
  /** Index dans la planche. */
  index: number
  /** Duree d'affichage, en millisecondes. */
  duree: number
  /**
   * Decalage du dessin, en pixels. Il sert aux images qui ne tiennent pas dans
   * la case — une epee levee, un saut ou le personnage se ramasse — sans avoir
   * a agrandir toute la planche pour une seule image.
   */
  decalageX?: number
  decalageY?: number
}

export type ModeBoucle = 'boucle' | 'unique' | 'aller-retour'

export interface Evenement {
  /** Rang de l'image dans le clip, et non index de planche. */
  image: number
  nom: string
}

export interface Clip {
  nom: string
  images: ImageAnim[]
  boucle: ModeBoucle
  evenements: Evenement[]
  /** Clip enchaine a la fin d'un clip `unique`. Une attaque revient au repos. */
  suite: string | null
}

export function clip(
  nom: string, images: ImageAnim[], opts: Partial<Omit<Clip, 'nom' | 'images'>> = {},
): Clip {
  return {
    nom,
    images,
    boucle: opts.boucle ?? 'boucle',
    evenements: opts.evenements ?? [],
    suite: opts.suite ?? null,
  }
}

/** Un clip a duree constante, la forme la plus courante. */
export function clipRegulier(
  nom: string, indices: number[], dureeMs: number,
  opts: Partial<Omit<Clip, 'nom' | 'images'>> = {},
): Clip {
  return clip(nom, indices.map((index) => ({ index, duree: dureeMs })), opts)
}

/**
 * L'ordre de lecture d'un clip.
 *
 * L'aller-retour ne repete PAS ses extremites : quatre dessins donnent
 * 1 2 3 4 3 2, six pas et non huit. Les repeter ferait tenir la premiere et la
 * derniere pose deux fois plus longtemps que les autres, et tout le mouvement
 * se mettrait a saccader aux deux bouts — le defaut classique du balancement
 * fait a la main.
 */
export function ordreDeLecture(clip: Clip): number[] {
  const n = clip.images.length
  if (clip.boucle !== 'aller-retour' || n <= 2) return clip.images.map((_, i) => i)
  const ordre = clip.images.map((_, i) => i)
  for (let i = n - 2; i >= 1; i--) ordre.push(i)
  return ordre
}

/** Duree totale d'un tour de clip, en millisecondes. */
export function dureeDe(clip: Clip): number {
  return ordreDeLecture(clip).reduce((s, i) => s + Math.max(1, clip.images[i].duree), 0)
}

export class Lecteur {
  readonly clips = new Map<string, Clip>()
  private courant: Clip | null = null
  /** Rang dans l'ordre de lecture, et non index de planche. */
  private rang = 0
  private reste = 0
  private fini = false

  constructor(clips: Clip[] = []) {
    for (const c of clips) this.clips.set(c.nom, c)
  }

  ajouter(...clips: Clip[]): this {
    for (const c of clips) this.clips.set(c.nom, c)
    return this
  }

  get nom(): string | null { return this.courant?.nom ?? null }
  get termine(): boolean { return this.fini }

  /** L'image de planche a dessiner. -1 si aucun clip n'est en cours. */
  get image(): number {
    if (!this.courant) return -1
    return this.courant.images[ordreDeLecture(this.courant)[this.rang]].index
  }

  get decalage(): { x: number; y: number } {
    if (!this.courant) return { x: 0, y: 0 }
    const im = this.courant.images[ordreDeLecture(this.courant)[this.rang]]
    return { x: im.decalageX ?? 0, y: im.decalageY ?? 0 }
  }

  /**
   * Lance un clip.
   *
   * Redemander le clip DEJA en cours ne le recommence pas. C'est la regle qui
   * rend le lecteur utilisable depuis un script : celui-ci tourne a chaque pas
   * et redemande « marche » tant qu'on avance. Sans cette regle, l'animation
   * repart de son premier dessin soixante fois par seconde et le personnage ne
   * bouge jamais — le defaut le plus courant des premiers jeux faits a la main.
   */
  jouer(nom: string, forcer = false): void {
    if (!forcer && this.courant?.nom === nom) return
    const c = this.clips.get(nom)
    if (!c || c.images.length === 0) return
    this.courant = c
    this.rang = 0
    this.reste = Math.max(1, c.images[ordreDeLecture(c)[0]].duree)
    this.fini = false
  }

  /** Repart du debut du clip en cours. */
  recommencer(): void {
    if (this.courant) this.jouer(this.courant.nom, true)
  }

  /**
   * Avance de `dtMs` millisecondes et rend les evenements franchis, dans
   * l'ordre. Un clip termine rend l'evenement `fin`.
   */
  avancer(dtMs: number): string[] {
    const declenches: string[] = []
    if (!this.courant || dtMs <= 0) return declenches
    // Un garde-fou : une image de jeu de plusieurs secondes — un onglet revenu
    // au premier plan — ne doit pas faire tourner cette boucle des milliers de
    // fois. Au-dela d'un tour complet, la suite est de toute facon identique.
    let restant = Math.min(dtMs, dureeDe(this.courant) * 2)

    while (restant > 0 && this.courant) {
      if (restant < this.reste) { this.reste -= restant; break }
      restant -= this.reste
      const c = this.courant
      const ordre = ordreDeLecture(c)

      if (this.rang + 1 < ordre.length) {
        this.rang++
      } else if (c.boucle === 'unique') {
        this.fini = true
        declenches.push('fin')
        if (c.suite && c.suite !== c.nom) { this.jouer(c.suite, true); continue }
        // On tient la derniere image : disparaitre serait pire que se figer.
        this.reste = Infinity
        break
      } else {
        this.rang = 0
      }
      this.reste = Math.max(1, c.images[ordreDeLecture(this.courant)[this.rang]].duree)
      for (const e of c.evenements) if (e.image === ordre[this.rang]) declenches.push(e.nom)
    }
    return declenches
  }

  /** Remet le lecteur a neuf, en gardant ses clips. */
  reinitialiser(): void {
    this.courant = null
    this.rang = 0
    this.reste = 0
    this.fini = false
  }
}

/**
 * L'image d'un clip apres `ms` millisecondes, sans etat.
 *
 * ## Pourquoi cette fonction existe a cote du lecteur
 *
 * Le lecteur est un objet : il garde son rang, son reste, et il rend les
 * evenements franchis. C'est ce qu'il faut dans une boucle de jeu. Mais c'est
 * exactement ce qu'on ne veut pas porter dans six langages — un objet a etat
 * se porte mal, se teste mal, et deux ports divergent au premier cas limite.
 *
 * `imageA` est la meme regle exprimee sans etat : un clip, un temps, une
 * image. C'est ELLE qu'on genere dans les chargeurs, parce qu'une fonction
 * pure se traduit sans ambiguite et se compare d'un langage a l'autre. Le banc
 * exige d'ailleurs que le lecteur et `imageA` tombent d'accord, puis que les
 * ports Python et Rust tombent d'accord avec eux — sinon « marche avec tous
 * les langages » ne voudrait rien dire.
 */
export function imageA(clip: Clip, ms: number): number {
  const ordre = ordreDeLecture(clip)
  if (ordre.length === 0) return -1
  const total = dureeDe(clip)
  let t = ms < 0 ? 0 : ms
  if (clip.boucle === 'unique') {
    if (t >= total) return clip.images[ordre[ordre.length - 1]].index
  } else {
    t %= total
  }
  for (const rang of ordre) {
    const d = Math.max(1, clip.images[rang].duree)
    if (t < d) return clip.images[rang].index
    t -= d
  }
  return clip.images[ordre[ordre.length - 1]].index
}
