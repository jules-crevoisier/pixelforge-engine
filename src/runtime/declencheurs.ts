import type { ContexteJeu, Script } from './jeu.ts'
import type { Noeud } from '../scene/noeud.ts'

/**
 * Les declencheurs : « quand ceci arrive, joue ce script ».
 *
 * ## Pourquoi c'est des DONNEES et non du code
 *
 * « A l'entree de ce tableau, lance la musique du boss » est une decision de
 * conception de niveau, pas de programmation. L'ecrire dans un script pose sur
 * un noeud oblige a interroger la salle a chaque pas, a retenir soi-meme qu'on
 * l'a deja fait, et a refaire tout cela pour chaque evenement du chapitre.
 * C'est exactement le genre de tuyauterie qu'un moteur doit fournir : la
 * personne qui dessine le niveau pose un rectangle ou nomme un tableau, ecrit
 * trois lignes, et le moteur se charge du « quand ».
 *
 * ## Les deux « quand », et pourquoi seulement deux
 *
 * **L'entree d'un tableau** et **le contact d'une zone** couvrent l'essentiel
 * du genre : la musique qui change, le dialogue qui s'ouvre, la herse qui se
 * ferme, le point de non-retour. Les autres moments — un ennemi meurt, un
 * objet est ramasse — appartiennent aux ESPECES et a leurs evenements
 * d'animation, qui existent deja. Doubler ces chemins ici creerait deux
 * facons de faire la meme chose, et deux facons de se contredire.
 *
 * ## Pourquoi le tir se fait A L'ENTREE et non « tant qu'on y est »
 *
 * Un script rejoue soixante fois par seconde tant qu'on reste dans la zone
 * rouvrirait le meme dialogue en boucle. On tire donc au FRANCHISSEMENT :
 * dehors puis dedans. Ressortir puis revenir tire a nouveau — sauf si le
 * declencheur est marque « une fois », auquel cas il est eteint pour la
 * partie.
 *
 * ## L'etat, et le rembobinage
 *
 * « Deja tire » et « deja dedans » sont de l'ETAT : deux machines en reseau
 * qui n'ont pas le meme s'ecartent au premier declencheur — l'une entend la
 * musique du boss, l'autre pas. D'ou `instantane`/`restaurer`, comme pour les
 * salles : le rembobinage remet aussi les declencheurs ou ils etaient.
 */
export interface Declencheur {
  nom: string
  quand: 'salle' | 'zone'
  /** La carte sur laquelle il vit. Vide : toutes. Voir le format v14. */
  carte: string
  /** Pour « salle » : le nom du tableau dont l'entree tire le script. */
  salle: string
  /** Pour « zone » : le rectangle a franchir, en CASES de la carte. */
  zone: { x: number; y: number; l: number; h: number }
  /**
   * Le nom du noeud qui doit entrer. Vide : le noeud que la camera suit —
   * c'est le heros dans tous les jeux du genre, sans avoir a le nommer.
   */
  qui: string
  /** Vrai : eteint apres le premier tir, jusqu'a la reinitialisation. */
  unefois: boolean
  script: Script
}

export interface EtatDeclencheurs {
  tires: string[]
  dedans: string[]
  salleVue: string
}

export class Declencheurs {
  private liste: Declencheur[] = []
  /** Les « une fois » deja tires, par nom. De l'etat. */
  private tires = new Set<string>()
  /** Les zones ou le sujet se trouve deja, par nom. De l'etat. */
  private dedans = new Set<string>()
  /** La salle observee au pas precedent. De l'etat. */
  private salleVue = ''
  /** Taille d'une case, pour convertir la position du sujet en cases. */
  tuile: number
  /** Compte des tirs, pour les bancs et pour un reglage. */
  tirs = 0
  /**
   * Le nom de la carte courante. C'est le monde qui le branche : les
   * declencheurs ne savent pas ou l'on joue, ils demandent.
   */
  carteCourante: (() => string) | null = null

  constructor(liste: Declencheur[] = [], tuile = 16) {
    this.liste = liste
    this.tuile = tuile
  }

  get nombre(): number { return this.liste.length }

  /**
   * Un pas d'observation. `salle` est le tableau courant, `sujetParDefaut` le
   * nom du noeud que la camera suit — celui qu'un `qui` vide designe.
   *
   * L'ordre ne bouge jamais : les declencheurs tirent dans l'ordre de la
   * liste, pour que deux machines qui rejouent la meme partie les tirent
   * dans le meme ordre.
   */
  avancer(c: ContexteJeu, salle: string, sujetParDefaut: string): void {
    const entreeSalle = salle !== this.salleVue
    this.salleVue = salle
    const carteIci = this.carteCourante?.() ?? ''
    for (const d of this.liste) {
      if (d.unefois && this.tires.has(d.nom)) continue
      // Un declencheur qui nomme une carte ne tire que sur elle : une zone
      // est en cases, et deux cartes ont les memes cases.
      if (d.carte && d.carte !== carteIci) continue
      if (d.quand === 'salle') {
        // On tire au CHANGEMENT et non a l'appartenance : « je suis dans la
        // salle du boss » est vrai pendant toute la rencontre, « j'y entre »
        // ne l'est qu'une fois.
        if (!entreeSalle || salle !== d.salle) continue
        this.tirer(c, d, sujetParDefaut)
        continue
      }
      const sujet = c.trouver(d.qui || sujetParDefaut)
      if (!sujet) {
        // Sujet absent : la zone ne peut pas dire « dehors ». On ne VIDE pas
        // `dedans` pour autant — un heros retire un pas puis repose (mort,
        // rembobinage) retirerait un tir qui a deja eu lieu.
        continue
      }
      const cx = Math.floor(sujet.x / this.tuile)
      const cy = Math.floor(sujet.y / this.tuile)
      const z = d.zone
      const dansZone = cx >= z.x && cx < z.x + z.l && cy >= z.y && cy < z.y + z.h
      const etait = this.dedans.has(d.nom)
      if (dansZone && !etait) {
        this.dedans.add(d.nom)
        this.tirer(c, d, sujetParDefaut, sujet)
      } else if (!dansZone && etait) {
        this.dedans.delete(d.nom)
      }
    }
  }

  private tirer(c: ContexteJeu, d: Declencheur, sujetParDefaut: string, sujet?: Noeud): void {
    if (d.unefois) this.tires.add(d.nom)
    this.tirs++
    // Le script recoit le SUJET comme noeud, pas un noeud fantome : c'est ce
    // qui lui permet d'ecrire `n.x` pour savoir ou l'entree a eu lieu.
    const n = sujet ?? c.trouver(d.qui || sujetParDefaut)
    if (n) d.script(c, n)
  }

  /**
   * L'etat, pour le rembobinage reseau. Voir `Salles.instantane` : meme
   * raison, meme forme.
   */
  instantane(): EtatDeclencheurs {
    return { tires: [...this.tires], dedans: [...this.dedans], salleVue: this.salleVue }
  }

  restaurer(e: EtatDeclencheurs): void {
    this.tires = new Set(e.tires)
    this.dedans = new Set(e.dedans)
    this.salleVue = e.salleVue
  }

  /** Tout oublier : c'est ce que fait « rejouer depuis le debut ». */
  oublier(): void {
    this.tires.clear()
    this.dedans.clear()
    this.salleVue = ''
    this.tirs = 0
  }
}
