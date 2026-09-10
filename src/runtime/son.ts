/**
 * Le son, decrit en DONNEES et non stocke en fichiers.
 *
 * ## Pourquoi pas des fichiers audio
 *
 * Un projet doit se suffire a lui-meme : c'est la regle qui a fait mettre les
 * planches de dessins dans le fichier plutot que de les charger a cote. Un
 * fichier d'onde pour un bruit de pas pese trente kilo-octets, ne se relit pas
 * dans un diff, et rouvre exactement le probleme qu'on avait resolu pour les
 * dessins.
 *
 * Un son est donc une DESCRIPTION : une forme d'onde, une frequence qui glisse
 * d'une valeur a une autre, une enveloppe, une duree. Six nombres. Ca tient
 * dans le fichier de projet, ca se relit, ca s'ajuste a la main, et ca traverse
 * les six langages comme le reste.
 *
 * C'est aussi ce que faisaient les machines de cette epoque : elles n'avaient
 * pas de fichiers audio, elles avaient trois oscillateurs et un bruit. La
 * contrainte donne le son du genre, elle ne le limite pas.
 *
 * ## Pourquoi la synthese est PURE
 *
 * `rendre` ne connait pas le navigateur : elle remplit un tableau
 * d'echantillons. Un banc peut donc verifier qu'un son dure ce qu'il annonce,
 * que son enveloppe descend a zero, qu'il ne sature pas — sans navigateur et
 * sans ecouter. Ce qui touche a l'audio du navigateur tient en dix lignes, a
 * part, et ne contient aucune decision.
 */

export type Forme = 'carre' | 'triangle' | 'scie' | 'bruit'

export const FORMES: Forme[] = ['carre', 'triangle', 'scie', 'bruit']

export interface Son {
  nom: string
  forme: Forme
  /** Frequence de depart et d'arrivee, en hertz. Egales : une note tenue. */
  frequence: number
  frequenceFin: number
  /** Duree totale, en millisecondes. */
  duree: number
  /** Volume de pointe, de 0 a 1. */
  volume: number
  /**
   * Attaque et chute, en millisecondes.
   *
   * Une attaque nulle donne un clic — le saut brutal de zero au volume plein
   * s'entend comme un craquement, et c'est le defaut le plus courant d'un son
   * de synthese fait a la main. Deux millisecondes suffisent a le supprimer.
   */
  attaque: number
  chute: number
  /**
   * Quantification de la frequence, en demi-tons. Zero : pas de quantification.
   *
   * Un glissando continu sonne « moderne » ; par paliers d'un demi-ton, il
   * sonne comme une puce sonore. C'est le meme choix que l'echelle entiere a
   * l'ecran : la contrainte fait le style.
   */
  paliers: number
}

export function son(nom: string, p: Partial<Son> = {}): Son {
  return {
    nom,
    forme: p.forme ?? 'carre',
    frequence: p.frequence ?? 440,
    frequenceFin: p.frequenceFin ?? (p.frequence ?? 440),
    duree: p.duree ?? 120,
    volume: p.volume ?? 0.3,
    attaque: p.attaque ?? 2,
    chute: p.chute ?? 40,
    paliers: p.paliers ?? 0,
  }
}

/**
 * Un bruit reproductible, pour la forme « bruit ».
 *
 * Un tirage non reproductible rendrait un son legerement different a chaque
 * coup — ce qui s'entend a peine, et rend impossible de verifier quoi que ce
 * soit au banc. La meme suite congruentielle que le reste du moteur, pour la
 * meme raison.
 */
function bruitDe(graine: number): () => number {
  let etat = graine >>> 0 || 1
  return () => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0
    return (etat / 4294967296) * 2 - 1
  }
}

/** La frequence quantifiee au demi-ton, quand le son le demande. */
function quantifier(f: number, paliers: number): number {
  if (paliers <= 0) return f
  // Un demi-ton vaut la racine douzieme de deux. On arrondit le nombre de
  // demi-tons au-dessus de 440 Hz, puis on revient en hertz.
  const demi = Math.log2(f / 440) * 12
  const arrondi = Math.round(demi / paliers) * paliers
  return 440 * 2 ** (arrondi / 12)
}

/**
 * Rend le son en echantillons, entre -1 et 1.
 *
 * L'enveloppe est en trois temps : l'attaque monte, le plateau tient, la chute
 * descend. Elle finit TOUJOURS a zero — un son coupe net a mi-volume claque, et
 * le claquement s'entend plus que le son.
 */
export function rendre(s: Son, tauxEchantillon = 44100): Float32Array {
  const n = Math.max(1, Math.round((s.duree / 1000) * tauxEchantillon))
  const sortie = new Float32Array(n)
  const attaque = Math.max(1, Math.round((s.attaque / 1000) * tauxEchantillon))
  const chute = Math.max(1, Math.round((s.chute / 1000) * tauxEchantillon))
  const prochainBruit = bruitDe(Math.round(s.frequence) * 2654435761)
  let phase = 0

  for (let i = 0; i < n; i++) {
    const avance = n === 1 ? 1 : i / (n - 1)
    const f = quantifier(
      s.frequence + (s.frequenceFin - s.frequence) * avance, s.paliers,
    )
    phase += f / tauxEchantillon
    phase -= Math.floor(phase)

    let onde: number
    if (s.forme === 'carre') onde = phase < 0.5 ? 1 : -1
    else if (s.forme === 'triangle') onde = 4 * Math.abs(phase - 0.5) - 1
    else if (s.forme === 'scie') onde = 2 * phase - 1
    else onde = prochainBruit()

    // L'enveloppe. La chute part de la FIN et non d'un instant fixe : un son
    // plus court que sa chute descend alors proprement au lieu de se couper.
    let enveloppe = 1
    if (i < attaque) enveloppe = i / attaque
    const restant = n - 1 - i
    if (restant < chute) enveloppe = Math.min(enveloppe, restant / chute)

    sortie[i] = onde * enveloppe * s.volume
  }
  return sortie
}

/** Fenetre de memoire du sonneur, en pas. Plus large que celle du reseau. */
export const MEMOIRE_PAS = 64

/**
 * Ce qui joue les sons, et surtout ce qui les EMPECHE de se rejouer.
 *
 * ## Le piege du rembobinage
 *
 * Les evenements d'animation sortent de la simulation a chaque pas. Quand le
 * reseau rembobine et refait cinquante pas, ces evenements ressortent — et
 * l'on entendrait cinquante bruits de pas d'un coup, a chaque correction. Le
 * son n'appartient donc pas a la simulation : il appartient a la
 * PRESENTATION, et cette classe retient ce qu'elle a deja joue pour ne pas le
 * rejouer.
 *
 * La cle est le pas ET la source : le meme bruit de pas de deux creatures
 * differentes au meme instant doit s'entendre deux fois.
 */
export class Sonneur {
  private banque = new Map<string, Son>()
  private joues = new Set<string>()
  /** Le pas le plus recent qu'on ait joue. */
  private dernierPas = -1
  /** Volume general, de 0 a 1. Zero coupe tout sans rien debrancher. */
  volume = 0.6
  /** Ce qui rend le son audible. Absent : on compte, on ne joue rien. */
  sortie: ((s: Son, volume: number) => void) | null = null
  /** Comptes, pour les bancs et pour un reglage. */
  joue = 0
  evites = 0

  constructor(sons: Son[] = []) { for (const s of sons) this.banque.set(s.nom, s) }

  ajouter(...sons: Son[]): this {
    for (const s of sons) this.banque.set(s.nom, s)
    return this
  }

  connait(nom: string): boolean { return this.banque.has(nom) }
  get nombre(): number { return this.banque.size }
  get sons(): Son[] { return [...this.banque.values()] }

  /**
   * Joue un son pour un evenement, une seule fois par pas et par source.
   *
   * Rend vrai si le son a ete joue. Faux veut dire soit « deja joue », soit
   * « inconnu » — et l'appelant n'a pas a distinguer les deux : dans les deux
   * cas il ne se passe rien, et les comptes le diront.
   */
  evenement(pas: number, source: string, nom: string): boolean {
    const s = this.banque.get(nom)
    if (!s) return false
    const cle = `${pas} ${source} ${nom}`
    if (this.joues.has(cle)) { this.evites++; return false }
    this.joues.add(cle)
    if (pas > this.dernierPas) {
      this.dernierPas = pas
      this.oublierAvant(pas - MEMOIRE_PAS)
    }
    this.joue++
    this.sortie?.(s, this.volume)
    return true
  }

  /**
   * Oublie ce qui est trop vieux pour etre rejoue.
   *
   * Sans cet oubli, la table grandit indefiniment : soixante entrees par
   * seconde pendant une heure font deux cent seize mille cles pour se souvenir
   * de bruits qu'on n'entendra plus. La fenetre couvre largement celle du
   * rembobinage.
   */
  private oublierAvant(pas: number): void {
    if (pas < 0) return
    for (const cle of this.joues) {
      const p = Number(cle.slice(0, cle.indexOf(' ')))
      if (p < pas) this.joues.delete(cle)
    }
  }

  /** Oublie tout : au redemarrage d'une partie. */
  vider(): void {
    this.joues.clear()
    this.dernierPas = -1
    this.joue = 0
    this.evites = 0
  }
}
