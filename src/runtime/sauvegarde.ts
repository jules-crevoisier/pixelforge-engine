/**
 * La sauvegarde de la PARTIE — pas celle du projet.
 *
 * ## Deux choses qu'on confond une fois, et une seule
 *
 * Le fichier de projet decrit le JEU : les cartes, les dessins, les especes,
 * les scenes. Il appartient a qui fabrique le jeu, il vit dans un depot, il se
 * relit dans un diff. La sauvegarde decrit une PARTIE : ou en est ce joueur-ci,
 * combien de coeurs il lui reste, quelles salles il a vues. Elle appartient au
 * joueur, elle vit sur sa machine, et personne ne la relira jamais a la main.
 *
 * Les melanger — enregistrer la position du heros dans le projet — a une
 * consequence immediate et desagreable : ouvrir le jeu de quelqu'un d'autre le
 * fait commencer la ou cette personne s'etait arretee. Et une consequence plus
 * lente : on ne peut plus corriger un niveau sans invalider les parties en
 * cours, puisque le niveau et la partie sont dans le meme fichier.
 *
 * ## Pourquoi la graine y figure
 *
 * Un etage engendre n'est reproductible que par sa graine. Une sauvegarde qui
 * ne la porte pas rouvre un AUTRE etage, avec le heros pose au milieu d'un mur.
 * C'est le genre de defaut qu'on ne voit qu'apres avoir engendre le deuxieme
 * niveau, c'est-a-dire trop tard.
 *
 * ## Pourquoi une version, des le premier jour
 *
 * Meme raison que pour le format de projet : un lecteur doit pouvoir DIRE
 * qu'il ne comprend pas ce qu'on lui donne, au lieu de lire de travers. Une
 * sauvegarde illisible qui s'annonce vaut mieux qu'une partie qui reprend avec
 * zero point de vie.
 */

export const VERSION_SAUVEGARDE = 1

export interface PartieSauvee {
  version: number
  /** Le projet auquel cette partie appartient. */
  projet: string
  /** Quand elle a ete ecrite, en millisecondes depuis 1970. */
  date: number
  /** La graine du monde engendre, s'il l'est. */
  graine: number
  /** Ou l'on reprend, en pixels du monde. */
  reprise: { x: number; y: number }
  /** Points de vie au moment de la sauvegarde, et maximum. */
  pv: number
  pvMax: number
  /** Ce que le joueur a fait : morts, abattus, balises touchees. */
  compteurs: Record<string, number>
  /**
   * Ce qu'il a vu ou ramasse, par identifiant.
   *
   * Une liste et non des booleens nommes : un jeu gagne des objets a ramasser
   * toute sa vie, et chacun aurait demande un champ de plus dans le format —
   * donc une migration a chaque coffre ajoute.
   */
  acquis: string[]
  /** Le temps de jeu, en millisecondes. */
  duree: number
}

export function partieNeuve(projet: string, p: Partial<PartieSauvee> = {}): PartieSauvee {
  return {
    version: VERSION_SAUVEGARDE,
    projet,
    date: p.date ?? 0,
    graine: p.graine ?? 0,
    reprise: p.reprise ? { ...p.reprise } : { x: 0, y: 0 },
    pv: p.pv ?? 3,
    pvMax: p.pvMax ?? 3,
    compteurs: { ...(p.compteurs ?? {}) },
    acquis: [...(p.acquis ?? [])],
    duree: p.duree ?? 0,
  }
}

/** Le texte a ecrire sur le disque. */
export function versTexte(p: PartieSauvee): string {
  return `${JSON.stringify(p, null, 2)}\n`
}

/**
 * Relit une sauvegarde. Rend `null` et DIT pourquoi si elle est illisible.
 *
 * Elle ne rejette pas une version plus recente : elle lit ce qu'elle
 * comprend et signale le reste. Refuser tout net obligerait a jeter une partie
 * de dix heures parce qu'une version a ajoute un champ.
 */
export function relire(
  texte: string,
): { partie: PartieSauvee | null; note: string } {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch (e) {
    return { partie: null, note: `sauvegarde illisible : ${e instanceof Error ? e.message : e}` }
  }
  const b = brut as Partial<PartieSauvee>
  if (!b || typeof b.version !== 'number' || typeof b.projet !== 'string') {
    return { partie: null, note: 'ce fichier n’a pas la forme d’une sauvegarde' }
  }
  const note = b.version > VERSION_SAUVEGARDE
    ? `sauvegarde en version ${b.version}, lecteur en version ${VERSION_SAUVEGARDE}`
      + ' : ce qu’elle porte en plus est ignoré'
    : ''
  return { partie: partieNeuve(b.projet, b), note }
}

/**
 * Ce qui tient la partie en cours et sait l'ecrire.
 *
 * ## Pourquoi elle ne connait pas le disque
 *
 * Elle recoit deux fonctions, lire et ecrire. Le navigateur a trois facons de
 * ranger un fichier — un dossier choisi, un telechargement, le stockage local
 * — et un jeu exporte vers Godot en aura une quatrieme. Les connaitre ici
 * ferait de cette classe le seul endroit a reprendre a chaque portage.
 */
export class Sauvegarde {
  private courante: PartieSauvee
  private lire: (cle: string) => string | null
  private ecrire: (cle: string, texte: string) => void
  /** L'horloge. Injectee : un banc doit pouvoir dater sans attendre. */
  private maintenant: () => number

  constructor(
    projet: string,
    acces: {
      lire?: (cle: string) => string | null
      ecrire?: (cle: string, texte: string) => void
      maintenant?: () => number
    } = {},
  ) {
    this.courante = partieNeuve(projet)
    this.lire = acces.lire ?? (() => null)
    this.ecrire = acces.ecrire ?? (() => {})
    this.maintenant = acces.maintenant ?? (() => Date.now())
  }

  get partie(): PartieSauvee { return this.courante }

  /** Le nom du fichier d'un emplacement. Trois emplacements suffisent. */
  static cleDe(projet: string, emplacement: number): string {
    return `${projet}.partie${emplacement}.json`
  }

  /** Note un compteur, un acquis, une reprise. */
  noter(compteur: string, delta = 1): void {
    this.courante.compteurs[compteur] = (this.courante.compteurs[compteur] ?? 0) + delta
  }

  acquerir(id: string): boolean {
    if (this.courante.acquis.includes(id)) return false
    this.courante.acquis.push(id)
    return true
  }

  a(id: string): boolean { return this.courante.acquis.includes(id) }

  reprendreA(x: number, y: number): void { this.courante.reprise = { x, y } }

  avancerDuree(ms: number): void { this.courante.duree += ms }

  poser(p: Partial<PartieSauvee>): void {
    this.courante = partieNeuve(this.courante.projet, { ...this.courante, ...p })
  }

  enregistrer(emplacement = 0): PartieSauvee {
    this.courante.date = this.maintenant()
    this.ecrire(
      Sauvegarde.cleDe(this.courante.projet, emplacement), versTexte(this.courante),
    )
    return this.courante
  }

  /**
   * Charge un emplacement. Rend la note du lecteur, vide si tout va bien.
   *
   * Un emplacement absent n'est pas une faute : c'est un emplacement vide, et
   * c'est le cas de tout le monde la premiere fois.
   */
  charger(emplacement = 0): { trouvee: boolean; note: string } {
    const texte = this.lire(Sauvegarde.cleDe(this.courante.projet, emplacement))
    if (texte === null) return { trouvee: false, note: '' }
    const { partie, note } = relire(texte)
    if (!partie) return { trouvee: false, note }
    if (partie.projet !== this.courante.projet) {
      // Une sauvegarde d'un AUTRE jeu : on refuse au lieu de reprendre au
      // milieu d'un monde qui n'existe pas ici.
      return {
        trouvee: false,
        note: `cette partie appartient à « ${partie.projet} », pas à « ${this.courante.projet} »`,
      }
    }
    this.courante = partie
    return { trouvee: true, note }
  }

  /** Ce qu'un menu montre pour chaque emplacement. */
  resume(emplacement = 0): string {
    const texte = this.lire(Sauvegarde.cleDe(this.courante.projet, emplacement))
    if (texte === null) return 'vide'
    const { partie } = relire(texte)
    if (!partie) return 'illisible'
    const minutes = Math.floor(partie.duree / 60000)
    const morts = partie.compteurs.morts ?? 0
    return `${partie.pv}/${partie.pvMax} pv · ${minutes} min · ${morts} mort${morts > 1 ? 's' : ''}`
  }
}
