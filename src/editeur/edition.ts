import type { Jeu } from '../runtime/jeu.ts'
import type { Carte, Calque } from '../tuiles/tilemap.ts'
import { VIDE, SOLIDE } from '../tuiles/tilemap.ts'
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
export type Outil =
  | 'terrain' | 'gomme' | 'collision' | 'tuile' | 'entite' | 'salle' | 'main'

/**
 * Comment le pinceau depose ce qu'il depose.
 *
 * ## Pourquoi ce n'est pas trois outils de plus
 *
 * « Rectangle » et « remplir » ne sont pas des outils : ce sont des manieres
 * d'appliquer CELUI qu'on a choisi. Un rectangle de mur, un rectangle de
 * collision et un rectangle de tuile sont le meme geste sur trois matieres.
 * En faire des outils separes obligerait a en creer un par matiere, et la
 * barre finirait a quinze boutons pour trois idees.
 */
export type Trace = 'libre' | 'rectangle' | 'remplir'

export interface EtatEdition {
  outil: Outil
  /**
   * Le trace : a main levee, en rectangle, ou par remplissage.
   *
   * Il existe parce que peindre un niveau case par case ne se fait pas. Une
   * carte de quarante sur trente-trois, c'est mille trois cents clics — et
   * l'editeur avait exactement cela a offrir.
   */
  trace: Trace
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
  /**
   * La matiere que l'outil « collision » pose : un jeu de drapeaux.
   *
   * Un seul nombre et non une liste de cases a cocher dans l'etat : les
   * drapeaux se combinent par un « ou » binaire, et garder les deux formes
   * ferait un jour diverger l'une de l'autre.
   */
  matiere: number
  /** Le calque que l'outil « tuile » peint, par son nom. */
  calqueChoisi: string | null
}

export class Edition {
  readonly etat: EtatEdition = {
    outil: 'terrain', calque: null, montrerCollision: false, tuileFixe: 0,
    espece: null, tuileChoisie: 0, calqueChoisi: null, matiere: SOLIDE, trace: 'libre',
  }

  /**
   * Ce que l'edition fait des salles : les poser, les retirer, les lire.
   *
   * Comme pour les entites, l'edition ne les possede pas : elle sait ou l'on
   * a clique, le monde sait ce qu'il en fait. C'est ce qui permet a un monde
   * sans salles de ne rien avoir a refuser — il ne branche rien.
   */
  surSalle: {
    liste(): { nom: string; x: number; y: number; largeur: number; hauteur: number }[]
    poser(x: number, y: number, largeur: number, hauteur: number): void
    retirer(nom: string): void
  } | null = null

  /**
   * Ce que l'edition fait quand on pose ou retire une entite.
   *
   * L'edition ne connait ni le peuplement ni le catalogue : elle sait
   * seulement qu'un clic a eu lieu a tel endroit du monde. C'est l'editeur qui
   * decide ce que cela veut dire — et c'est ce qui permet a un monde sans
   * entites de simplement ne pas brancher ce crochet.
   */
  surEntite: ((cx: number, cy: number, retirer: boolean) => void) | null = null

  /**
   * Ce que l'edition fait quand on DEPLACE une entite deja posee.
   *
   * Le crochet rend un identifiant a l'appui — l'entite saisie, ou null — puis
   * recoit les cases traversees, puis la fin du geste. Trois temps et non un,
   * parce qu'un deplacement doit se voir pendant qu'on le fait : une entite
   * qui ne saute a sa nouvelle place qu'au relachement se pose de travers une
   * fois sur deux.
   */
  surDeplacement: {
    saisir(cx: number, cy: number): string | null
    poser(id: string, cx: number, cy: number): void
    finir(id: string): void
  } | null = null

  /** Ce qu'on peut defaire. Partage avec l'editeur, qui y pose ses gestes. */
  readonly historique = new Historique()

  /**
   * Le coin de depart d'un rectangle en cours, et son coin courant.
   *
   * Il sert a DESSINER l'apercu autant qu'a appliquer : sans apercu, on trace
   * un rectangle a l'aveugle et l'on defait une fois sur deux.
   */
  rectangle: { x0: number; y0: number; x1: number; y1: number } | null = null

  /** L'etat de la carte avant le geste en cours, ou null. */
  private photo: {
    cases: Int32Array[]
    presence: (Uint8Array | null)[]
    solides: Uint16Array
  } | null = null
  private jeu: Jeu
  private carte: Carte
  private peint = false
  /** Ce que le premier appui a decide : on pose ou on retire, pas les deux. */
  private pose = true
  private dernierePosition: { cx: number; cy: number } | null = null
  private glisseCamera: { x: number; y: number; camX: number; camY: number } | null = null
  /** L'entite qu'on traine, et si elle a vraiment change de case. */
  private glisseEntite: { id: string; depart: { cx: number; cy: number }; bougee: boolean } | null = null

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
    // Saisir une entite deja posee, au clic gauche, avant toute autre chose.
    // Sans ce test, poser et deplacer se disputeraient le meme geste, et l'on
    // empilerait une creature sur celle qu'on voulait bouger.
    if (this.etat.outil === 'entite' && bouton === 0 && this.surDeplacement) {
      const pris = this.surDeplacement.saisir(c.cx, c.cy)
      if (pris) {
        this.glisseEntite = { id: pris, depart: { cx: c.cx, cy: c.cy }, bougee: false }
        this.peint = true
        this.dernierePosition = { cx: c.cx, cy: c.cy }
        return
      }
    }
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

    /*
     * UNE SALLE SE TIRE TOUJOURS EN RECTANGLE.
     *
     * Elle n'a pas de sens « a main levee » : c'est un rectangle par
     * definition. Le mode de trace ne s'y applique donc pas, et l'outil
     * l'impose au lieu de laisser choisir un mode qui ne voudrait rien dire.
     */
    if (this.etat.outil === 'salle') {
      this.peint = true
      if (bouton === 2) {
        // Le clic droit retire la salle sous le curseur, comme il retire
        // partout ailleurs.
        const dessous = this.salleEn(c.cx, c.cy)
        if (dessous) this.surSalle?.retirer(dessous.nom)
        this.peint = false
        this.jeu.dessiner()
        return
      }
      this.rectangle = { x0: c.cx, y0: c.cy, x1: c.cx, y1: c.cy }
      return
    }

    /*
     * Le rectangle n'applique RIEN tant qu'on n'a pas lache.
     *
     * On pourrait peindre au fur et a mesure et effacer ce qui deborde. Ce
     * serait plus court a ecrire et faux a l'usage : un rectangle qu'on
     * retaille laisserait derriere lui tout ce qu'il a effleure, et le
     * « defaire » ne rendrait pas la carte de depart.
     */
    if (this.etat.trace === 'rectangle' && this.etat.outil !== 'entite') {
      this.rectangle = { x0: c.cx, y0: c.cy, x1: c.cx, y1: c.cy }
      return
    }
    if (this.etat.trace === 'remplir' && this.etat.outil !== 'entite') {
      this.remplir(c.cx, c.cy)
      return
    }
    this.appliquer(c.cx, c.cy)
  }

  /**
   * Remplit la zone d'un seul tenant qui part de cette case.
   *
   * ## Ce que « la meme » veut dire
   *
   * Cela depend de l'outil, et c'est ce qui rend le remplissage utile : pour
   * le terrain c'est « il y a un mur ou il n'y en a pas », pour la collision
   * c'est la matiere exacte, pour la tuile c'est l'index dessine. Un seul
   * critere pour les trois remplirait la carte entiere une fois sur deux.
   *
   * ## Pourquoi une file et non la recursion
   *
   * Une carte de deux cents cases de cote fait quarante mille cases. La
   * recursion y epuise la pile du navigateur, et le remplissage tombe sur une
   * erreur au lieu de remplir.
   */
  private remplir(cx: number, cy: number): void {
    const depart = this.valeurSous(cx, cy)
    const cible = this.valeurPosee()
    // Remplir avec ce qui est deja la ne ferait rien, et couterait un geste
    // dans l'historique — un « defaire » qui ne defait rien.
    if (depart === cible) return
    this.photographier()
    this.peint = true
    const vues = new Uint8Array(this.carte.cases)
    const file = [this.carte.index(cx, cy)]
    vues[file[0]] = 1
    let compte = 0
    while (file.length) {
      const i = file.pop()!
      const x = i % this.carte.largeur
      const y = (i - x) / this.carte.largeur
      if (this.valeurSous(x, y) !== depart) continue
      this.appliquer(x, y)
      compte++
      // Quatre voisins et non huit : deux zones qui ne se touchent que par un
      // coin sont deux zones. En diagonale, le remplissage fuit par le moindre
      // angle et deborde dans la piece d'a cote.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= this.carte.largeur || ny >= this.carte.hauteur) continue
        const j = this.carte.index(nx, ny)
        if (vues[j]) continue
        vues[j] = 1
        file.push(j)
      }
    }
    void compte
    this.jeu.dessiner()
  }

  /** La salle qui couvre cette case, s'il y en a une. */
  salleEn(cx: number, cy: number): { nom: string; x: number; y: number; largeur: number; hauteur: number } | null {
    for (const s of this.surSalle?.liste() ?? []) {
      if (cx >= s.x && cy >= s.y && cx < s.x + s.largeur && cy < s.y + s.hauteur) return s
    }
    return null
  }

  /** Ce qui est pose sur cette case, du point de vue de l'outil courant. */
  private valeurSous(cx: number, cy: number): number {
    const i = this.carte.index(cx, cy)
    if (this.etat.outil === 'collision') return this.carte.solides[i]
    if (this.etat.outil === 'tuile') {
      const calque = this.carte.calques.find((q) => q.nom === this.etat.calqueChoisi)
        ?? this.etat.calque
      return calque ? calque.cases[i] : VIDE
    }
    return this.etatDe(cx, cy) ? 1 : 0
  }

  /** Ce que l'outil courant DEPOSERAIT sur une case. */
  private valeurPosee(): number {
    if (this.etat.outil === 'collision') return this.pose ? this.etat.matiere : 0
    if (this.etat.outil === 'tuile') return this.pose ? this.etat.tuileChoisie : VIDE
    return this.etat.outil === 'gomme' ? 0 : (this.pose ? 1 : 0)
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
    if (this.rectangle) {
      if (this.rectangle.x1 === c.cx && this.rectangle.y1 === c.cy) return
      this.rectangle.x1 = c.cx
      this.rectangle.y1 = c.cy
      // On redessine pour que l'apercu suive : la scene est arretee, rien ne
      // le ferait a notre place.
      this.jeu.dessiner()
      return
    }
    if (this.dernierePosition && this.dernierePosition.cx === c.cx && this.dernierePosition.cy === c.cy) return
    if (this.glisseEntite) {
      this.dernierePosition = { cx: c.cx, cy: c.cy }
      this.glisseEntite.bougee = true
      this.surDeplacement?.poser(this.glisseEntite.id, c.cx, c.cy)
      this.jeu.dessiner()
      return
    }
    // On ne seme pas d'entites en glissant : une par clic, sinon un geste
    // depose trente creatures qu'il faut retirer une par une.
    if (this.etat.outil === 'entite') return
    this.appliquer(c.cx, c.cy)
  }

  finir(): void {
    if (this.glisseEntite) {
      // Un clic qui n'a pas bouge n'est pas un deplacement : c'est un clic sur
      // une entite, et il ne doit rien laisser dans l'historique. Sans cette
      // distinction, chaque clic rate encombre le « defaire ».
      if (this.glisseEntite.bougee) this.surDeplacement?.finir(this.glisseEntite.id)
      this.glisseEntite = null
      this.peint = false
      this.dernierePosition = null
      return
    }
    if (this.rectangle && this.etat.outil === 'salle') {
      const r = this.rectangle
      this.rectangle = null
      this.peint = false
      const x0 = Math.min(r.x0, r.x1)
      const y0 = Math.min(r.y0, r.y1)
      const l = Math.abs(r.x1 - r.x0) + 1
      const h = Math.abs(r.y1 - r.y0) + 1
      // Une salle d'une case est un clic rate, pas une salle. On l'ignore au
      // lieu d'en creer une qu'il faudra retirer.
      if (l >= 2 && h >= 2) this.surSalle?.poser(x0, y0, l, h)
      this.jeu.dessiner()
      return
    }
    if (this.rectangle) {
      const r = this.rectangle
      this.rectangle = null
      this.photographier()
      const x0 = Math.min(r.x0, r.x1)
      const x1 = Math.max(r.x0, r.x1)
      const y0 = Math.min(r.y0, r.y1)
      const y1 = Math.max(r.y0, r.y1)
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.appliquer(x, y)
      this.jeu.dessiner()
      this.enregistrer(`${NOM_GESTE[this.etat.outil] ?? this.etat.outil} (rectangle)`)
      this.peint = false
      this.dernierePosition = null
      return
    }
    if (this.peint) this.enregistrer(NOM_GESTE[this.etat.outil] ?? this.etat.outil)
    this.peint = false
    this.glisseCamera = null
    this.dernierePosition = null
  }

  private etatDe(cx: number, cy: number): boolean {
    const i = this.carte.index(cx, cy)
    // On compare a la matiere CHOISIE : repasser le meme pinceau sur une case
    // qui la porte deja doit l'effacer, alors qu'une case d'une autre matiere
    // doit etre remplacee. Tester « non vide » ferait effacer une plateforme
    // quand on voulait y poser des pointes.
    if (this.etat.outil === 'collision') return this.carte.solides[i] === this.etat.matiere
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
      this.carte.solides[i] = this.pose ? this.etat.matiere : 0
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
    this.carte.solides[i] = pose ? SOLIDE : 0
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
