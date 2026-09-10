import { type Son, son, rendre } from './son.ts'

/**
 * La musique : une suite de notes, decrite en donnees comme le reste.
 *
 * ## Pourquoi pas un fichier
 *
 * Meme raison que pour les sons et les dessins : un projet doit se suffire a
 * lui-meme. Une minute de musique en fichier d'onde pese dix megaoctets et ne
 * se relit pas dans un diff ; en notes, elle pese deux kilo-octets et l'on
 * voit quelle note a change.
 *
 * ## Pourquoi des noms de notes et non des hertz
 *
 * « do4 » se transpose, se lit, se corrige. « 261,63 » ne se compare a rien et
 * ne se transpose qu'a la calculatrice. Les jeux de cette epoque ecrivaient
 * leurs musiques en notes pour la meme raison, et c'est ce qui permet a
 * quelqu'un qui lit la musique d'en ecrire une sans toucher au code.
 *
 * ## Pourquoi plusieurs voies
 *
 * Une puce sonore avait trois oscillateurs et un canal de bruit. Une seule
 * voie ne fait pas une musique : il faut au moins une melodie, une basse et
 * une percussion. Trois voies suffisent a tout ce que le genre a produit.
 */

/** Les douze demi-tons, dans l'ordre. Le bemol s'ecrit comme le diese. */
const DEMI_TONS: Record<string, number> = {
  do: 0, 'do#': 1, re: 2, 're#': 3, mi: 4, fa: 5, 'fa#': 6,
  sol: 7, 'sol#': 8, la: 9, 'la#': 10, si: 11,
}

/**
 * La frequence d'une note ecrite « la4 », « do#5 », « sol3 ».
 *
 * Le la4 vaut 440 hertz — la reference universelle. Rend zero pour un
 * silence, note par un point : un silence a une DUREE, il ne peut donc pas
 * etre simplement absent de la suite.
 */
export function frequenceDe(note: string): number {
  if (!note || note === '.') return 0
  const m = /^([a-z]+#?)(-?\d+)$/.exec(note.trim().toLowerCase())
  if (!m) return 0
  const demi = DEMI_TONS[m[1]]
  if (demi === undefined) return 0
  const octave = Number(m[2])
  // Le la de la quatrieme octave est le rang 57 depuis do0.
  const rang = octave * 12 + demi
  return 440 * 2 ** ((rang - 57) / 12)
}

export interface Voie {
  /** Le timbre : la forme d'onde et l'enveloppe, sans la hauteur. */
  timbre: Son
  /**
   * Les notes, une par temps. Le point est un silence, le tiret prolonge.
   *
   * Le tiret compte : sans lui, une blanche s'ecrirait en repetant la note, et
   * l'on entendrait deux attaques au lieu d'une note tenue. C'est la
   * difference entre une melodie et un martelement.
   */
  notes: string[]
  /** Volume de la voie, de 0 a 1. */
  volume: number
}

export interface Musique {
  nom: string
  /** Temps par minute. */
  tempo: number
  /** Voies jouees ensemble. */
  voies: Voie[]
  /** Vrai : on reprend au debut a la fin. */
  boucle: boolean
}

export function musique(nom: string, p: Partial<Musique> = {}): Musique {
  return {
    nom,
    tempo: p.tempo ?? 120,
    voies: p.voies ?? [],
    boucle: p.boucle ?? true,
  }
}

export function voie(notes: string[], p: Partial<Voie> = {}): Voie {
  return {
    timbre: p.timbre ?? son('timbre', { forme: 'carre', chute: 40 }),
    notes,
    volume: p.volume ?? 0.5,
  }
}

/** Duree d'un temps, en millisecondes. */
export const dureeTemps = (tempo: number): number => 60000 / Math.max(1, tempo)

/** Duree totale d'une musique, en millisecondes. */
export function dureeDe(m: Musique): number {
  const temps = m.voies.reduce((n, v) => Math.max(n, v.notes.length), 0)
  return temps * dureeTemps(m.tempo)
}

/**
 * Rend la musique en echantillons, comme un son.
 *
 * ## Pourquoi on additionne au lieu de mixer savamment
 *
 * Trois voies a un demi-volume ne saturent pas, et un limiteur ferait
 * « pomper » le son a chaque percussion — le defaut qui trahit un mixage
 * automatique. On additionne, et l'on BORNE a la fin : si ca sature, c'est que
 * les volumes sont trop hauts, et c'est a la musique de le dire, pas au
 * moteur de le cacher.
 *
 * ## Pourquoi une note tenue n'est pas rejouee
 *
 * Un tiret prolonge la note precedente : on continue l'onde au lieu de la
 * relancer. Relancer donnerait une attaque a chaque temps, et une blanche
 * sonnerait comme deux noires.
 */
export function rendreMusique(m: Musique, tauxEchantillon = 44100): Float32Array {
  const parTemps = dureeTemps(m.tempo)
  const temps = m.voies.reduce((n, v) => Math.max(n, v.notes.length), 0)
  const total = Math.max(1, Math.round((temps * parTemps * tauxEchantillon) / 1000))
  const sortie = new Float32Array(total)

  for (const v of m.voies) {
    let t = 0
    while (t < v.notes.length) {
      const note = v.notes[t]
      if (!note || note === '.' || note === '-') { t++; continue }
      // On compte les tirets qui suivent : c'est la duree de la note.
      let n = 1
      while (t + n < v.notes.length && v.notes[t + n] === '-') n++
      const f = frequenceDe(note)
      if (f > 0) {
        const duree = n * parTemps
        const echantillons = rendre({
          ...v.timbre,
          frequence: f,
          frequenceFin: f,
          duree,
          volume: v.timbre.volume * v.volume,
          // La chute ne depasse jamais la note : une chute de deux cents
          // millisecondes sur une croche de cent la ferait commencer avant
          // d'avoir fini de monter.
          chute: Math.min(v.timbre.chute, duree * 0.6),
        }, tauxEchantillon)
        const debut = Math.round((t * parTemps * tauxEchantillon) / 1000)
        for (let i = 0; i < echantillons.length && debut + i < total; i++) {
          sortie[debut + i] += echantillons[i]
        }
      }
      t += n
    }
  }
  // On borne au lieu de normaliser : normaliser ferait varier le volume
  // general selon la note la plus forte, et deux musiques du meme jeu
  // n'auraient pas le meme niveau.
  for (let i = 0; i < total; i++) sortie[i] = Math.max(-1, Math.min(1, sortie[i]))
  return sortie
}

/**
 * Ce qui fait jouer une musique, et une seule a la fois.
 *
 * ## Pourquoi une seule
 *
 * Deux musiques qui se superposent ne sonnent jamais bien, et l'on ne
 * s'apercoit du recouvrement qu'en jouant longtemps — au moment ou l'on change
 * de salle en boucle. Demander la meme musique deux fois ne fait donc rien :
 * c'est la regle qui evite qu'un script la relance a chaque pas.
 */
export class Musicien {
  private banque = new Map<string, Musique>()
  /** Ce qui joue en ce moment, par son nom. */
  private courante = ''
  /** Ce qui rend la musique audible. Absent : on compte, on ne joue rien. */
  sortie: ((m: Musique, volume: number) => void) | null = null
  arret: (() => void) | null = null
  volume = 0.4
  /** Comptes, pour les bancs. */
  lancees = 0

  constructor(musiques: Musique[] = []) { for (const m of musiques) this.banque.set(m.nom, m) }

  ajouter(...musiques: Musique[]): this {
    for (const m of musiques) this.banque.set(m.nom, m)
    return this
  }

  get nom(): string { return this.courante }
  get nombre(): number { return this.banque.size }
  get musiques(): Musique[] { return [...this.banque.values()] }

  /** Lance une musique. Rend faux si c'est deja elle qui joue. */
  jouer(nom: string): boolean {
    if (nom === this.courante) return false
    const m = this.banque.get(nom)
    if (!m) return false
    // On n'arrete QUE s'il y a quelque chose a arreter. Appeler `arret` a vide
    // parait sans consequence ici, mais chez l'hote c'est un `stop()` sur une
    // source qui n'existe pas encore : une exception au premier lancement,
    // dans du code qui n'a rien fait de mal.
    if (this.courante) this.arret?.()
    this.courante = nom
    this.lancees++
    this.sortie?.(m, this.volume)
    return true
  }

  arreter(): void {
    if (!this.courante) return
    this.arret?.()
    this.courante = ''
  }
}
