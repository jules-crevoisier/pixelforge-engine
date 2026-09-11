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
  /**
   * Un fichier WAV importe, en base64 — le son n'est alors plus synthetise.
   *
   * ## Pourquoi accepter un fichier dans un moteur qui decrit tout en donnees
   *
   * Les six nombres de la synthese font les bruitages d'une puce sonore, et
   * c'est un style. Mais un cri enregistre, une note de guitare, un bruit
   * d'eau ne se decrivent pas en six nombres — et refuser l'audio enregistre
   * fermerait la porte a la moitie des jeux. Le fichier part DANS le projet,
   * comme les planches partent en lettres : un projet reste un seul fichier
   * qui se depose sur la page. Seul le volume s'applique encore ; les autres
   * reglages appartiennent a la synthese, et les cacher vaut mieux que les
   * laisser sans effet.
   */
  wav?: string
}

export function son(nom: string, p: Partial<Son> = {}): Son {
  const s: Son = {
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
  // Seulement s'il existe : un champ `wav: undefined` changerait la liste
  // des cles de chaque son, et tout ce qui compare des sons au banc.
  if (p.wav !== undefined) s.wav = p.wav
  return s
}

/* ------------------------------------------------------------------ */
/* Le WAV importe                                                      */
/* ------------------------------------------------------------------ */

/** Les octets d'une chaine base64. Chunk par chunk : atob n'a pas de limite
 * dure, mais les tres longues chaines coutent ; c'est symetrique de l'encodage. */
export function octetsDepuisBase64(b64: string): Uint8Array {
  const brut = atob(b64)
  const octets = new Uint8Array(brut.length)
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i)
  return octets
}

/** L'inverse, par morceaux : btoa(String.fromCharCode(...tout)) explose la
 * pile d'appels des quelques dizaines de milliers d'octets. */
export function base64DepuisOctets(octets: Uint8Array): string {
  let s = ''
  const PAS = 0x8000
  for (let i = 0; i < octets.length; i += PAS) {
    s += String.fromCharCode(...octets.subarray(i, i + PAS))
  }
  return btoa(s)
}

/**
 * Lit un WAV PCM seize bits. Null si ce n'en est pas un — l'appelant DIT
 * alors pourquoi il refuse, au lieu d'importer du bruit.
 *
 * Le decodeur vit ici et non a cote de l'encodeur d'export : l'export
 * importe deja ce module pour rendre les sons, et l'inverse serait un cycle.
 * Les chunks sont parcourus un a un — un WAV sorti d'Audacity porte souvent
 * un chunk LIST avant les donnees, et le lire a offset fixe le casserait.
 */
export function dechiffrerWav(
  octets: Uint8Array,
): { echantillons: Float32Array; taux: number } | null {
  if (octets.length < 44) return null
  const texte = (i: number, attendu: string): boolean =>
    [...attendu].every((c, j) => octets[i + j] === c.charCodeAt(0))
  if (!texte(0, 'RIFF') || !texte(8, 'WAVE')) return null
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  let position = 12
  let taux = 0
  let voies = 0
  let bits = 0
  let format = 0
  let debut = -1
  let taille = 0
  while (position + 8 <= octets.length) {
    const id = String.fromCharCode(
      octets[position], octets[position + 1], octets[position + 2], octets[position + 3],
    )
    const t = vue.getUint32(position + 4, true)
    if (id === 'fmt ' && position + 24 <= octets.length) {
      format = vue.getUint16(position + 8, true)
      voies = vue.getUint16(position + 10, true)
      taux = vue.getUint32(position + 12, true)
      bits = vue.getUint16(position + 22, true)
    } else if (id === 'data') {
      debut = position + 8
      taille = t
    }
    // Les chunks sont alignes sur deux octets ; un chunk impair est complete.
    position += 8 + t + (t % 2)
  }
  if (format !== 1 || bits !== 16 || voies < 1 || taux <= 0 || debut < 0) return null
  const totales = Math.floor(Math.min(taille, octets.length - debut) / 2)
  const parVoie = Math.floor(totales / voies)
  if (parVoie < 1) return null
  const sortie = new Float32Array(parVoie)
  for (let i = 0; i < parVoie; i++) {
    // Mixage mono : la moyenne des voies. Le moteur joue tout en une voie,
    // comme il dessine tout en pixels entiers.
    let somme = 0
    for (let v = 0; v < voies; v++) somme += vue.getInt16(debut + (i * voies + v) * 2, true)
    sortie[i] = (somme / voies) / 32768
  }
  return { echantillons: sortie, taux }
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
  if (s.wav) {
    const brut = dechiffrerWav(octetsDepuisBase64(s.wav))
    if (brut) {
      // Reechantillonnage au plus proche : pour des sons d'un dixieme de
      // seconde, un filtre n'apporterait rien qu'on entende, et le plus
      // proche est reproductible au banc a l'echantillon pres.
      const n2 = Math.max(1, Math.round((brut.echantillons.length * tauxEchantillon) / brut.taux))
      const sortie = new Float32Array(n2)
      for (let i = 0; i < n2; i++) {
        const j = Math.min(brut.echantillons.length - 1, Math.round((i * brut.taux) / tauxEchantillon))
        sortie[i] = brut.echantillons[j] * s.volume
      }
      return sortie
    }
    // Un wav illisible RETOMBE sur la synthese : le son change au lieu de
    // disparaitre, et un son etrange se remarque la ou un silence s'oublie.
  }
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
