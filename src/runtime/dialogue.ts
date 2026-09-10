import { couper, largeurTexte, HAUTEUR_GLYPHE, INTERLIGNE } from './fonte.ts'

/**
 * Le dialogue : du texte qui s'ecrit, et des choix qui engagent.
 *
 * ## Pourquoi le texte s'ecrit lettre a lettre
 *
 * Un pave qui apparait d'un coup se saute. Le texte qui se compose donne un
 * rythme, et surtout il donne au joueur une raison d'appuyer — donc une prise.
 * Le deuxieme appui affiche la replique entiere : faire attendre quelqu'un qui
 * a deja lu est la faute la plus repandue du genre, et elle transforme un
 * dialogue en corvee.
 *
 * ## Pourquoi la vitesse se compte en caracteres par seconde
 *
 * Et non en « caracteres par image ». A trente images par seconde, un dialogue
 * regle par image irait deux fois moins vite — et le reglage ne serait plus
 * comparable a la lecture d'un etre humain, qui lit a une vitesse et non a une
 * cadence.
 *
 * ## Pourquoi le decoupage se fait ICI et pas au dessin
 *
 * Le nombre de lignes decide de la hauteur de la boite, et la hauteur de la
 * boite decide du cadrage. Le savoir au moment de dessiner serait trop tard :
 * on aurait deja choisi ou poser la boite.
 */

export interface Choix {
  texte: string
  /** Ce que le choix designe. L'appelant en fait ce qu'il veut. */
  valeur: string
}

export interface Replique {
  /** Qui parle. Vide : personne, et le nom ne s'affiche pas. */
  qui: string
  texte: string
  /** Les choix proposes a la fin. Vide : on continue simplement. */
  choix: Choix[]
}

export function replique(texte: string, p: Partial<Replique> = {}): Replique {
  return { qui: p.qui ?? '', texte, choix: p.choix ?? [] }
}

export interface ReglagesDialogue {
  /** Largeur utile du texte, en pixels. */
  largeur?: number
  /** Caracteres par seconde. */
  vitesse?: number
  /** Lignes visibles a la fois. */
  lignes?: number
}

export class Dialogue {
  private suite: Replique[] = []
  private index = 0
  /** Combien de caracteres sont deja ecrits, en nombre reel. */
  private avance = 0
  private lignesCoupees: string[] = []
  private largeur: number
  private vitesse: number
  /** Lignes visibles a la fois. */
  readonly lignes: number
  /** Le choix mis en avant, quand il y en a. */
  curseur = 0
  /** Ce que le dernier choix a rendu, ou vide. */
  derniereValeur = ''

  constructor(r: ReglagesDialogue = {}) {
    this.largeur = r.largeur ?? 240
    this.vitesse = r.vitesse ?? 45
    this.lignes = r.lignes ?? 3
  }

  get ouvert(): boolean { return this.index < this.suite.length }
  get courante(): Replique | null { return this.suite[this.index] ?? null }
  /** Vrai quand toute la replique est ecrite. */
  get complet(): boolean {
    return this.avance >= this.lignesCoupees.join('').length
  }

  /** Ouvre une suite de repliques. Remplace ce qui etait en cours. */
  ouvrir(suite: Replique[]): void {
    this.suite = suite
    this.index = 0
    this.curseur = 0
    this.derniereValeur = ''
    this.preparer()
  }

  fermer(): void { this.suite = []; this.index = 0; this.avance = 0; this.lignesCoupees = [] }

  private preparer(): void {
    this.avance = 0
    this.curseur = 0
    const r = this.courante
    this.lignesCoupees = r ? couper(r.texte, this.largeur) : []
  }

  avancerTemps(dtMs: number): void {
    if (!this.ouvert || this.complet) return
    this.avance += (this.vitesse * dtMs) / 1000
  }

  /**
   * Ce qu'il faut afficher : les lignes, tronquees a l'avancement.
   *
   * Le compte de caracteres traverse les lignes : sinon les trois lignes
   * s'ecriraient en meme temps, chacune de son cote, ce qui ne ressemble a
   * rien.
   */
  lignesVisibles(): string[] {
    let reste = Math.floor(this.avance)
    const sortie: string[] = []
    for (const l of this.lignesCoupees) {
      if (reste <= 0) { sortie.push(''); continue }
      sortie.push(l.slice(0, reste))
      reste -= l.length
    }
    // On ne montre que les dernieres lignes quand la replique deborde : c'est
    // ce qu'un joueur attend d'une boite qui defile.
    return sortie.slice(Math.max(0, sortie.length - this.lignes))
  }

  /** Hauteur du texte affiche, en pixels. */
  hauteurTexte(): number {
    const n = Math.min(this.lignes, this.lignesCoupees.length)
    return n * HAUTEUR_GLYPHE + Math.max(0, n - 1) * INTERLIGNE
  }

  /** Largeur reellement occupee, pour cadrer une boite au plus juste. */
  largeurTexte(): number {
    return this.lignesCoupees.reduce((m, l) => Math.max(m, largeurTexte(l)), 0)
  }

  /** Deplace le curseur dans les choix, en bouclant. */
  deplacer(d: number): void {
    const c = this.courante
    if (!c || c.choix.length === 0) return
    this.curseur = (this.curseur + d + c.choix.length) % c.choix.length
  }

  /**
   * Un appui. Rend ce qui s'est passe, pour que l'appelant en fasse un son.
   *
   * `'complete'` : on a saute l'ecriture. `'choisi'` : un choix a ete pris.
   * `'suivant'` : on passe a la replique suivante. `'ferme'` : c'etait la
   * derniere.
   */
  valider(): 'complete' | 'choisi' | 'suivant' | 'ferme' | 'rien' {
    if (!this.ouvert) return 'rien'
    if (!this.complet) {
      // Le deuxieme appui affiche tout : faire attendre quelqu'un qui a deja
      // lu transforme un dialogue en corvee.
      this.avance = this.lignesCoupees.join('').length
      return 'complete'
    }
    const c = this.courante as Replique
    if (c.choix.length > 0) {
      this.derniereValeur = c.choix[this.curseur]?.valeur ?? ''
      this.index++
      this.preparer()
      return this.ouvert ? 'choisi' : 'ferme'
    }
    this.index++
    this.preparer()
    return this.ouvert ? 'suivant' : 'ferme'
  }
}
