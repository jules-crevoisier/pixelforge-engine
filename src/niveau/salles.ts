/**
 * Un niveau fait de SALLES, comme Celeste.
 *
 * ## Pourquoi ce n'est pas une grille reguliere
 *
 * Le moteur savait deja verrouiller la camera sur une salle — mais sur une
 * grille : toutes les salles de la meme taille, decoupees au couteau dans une
 * carte. C'est le decoupage d'Isaac, et il convient a des salles engendrees.
 *
 * Celeste n'est pas fait comme cela. Ses salles sont des rectangles POSES A LA
 * MAIN, de tailles differentes : un couloir de deux ecrans de large et d'un
 * demi de haut, un puits d'un demi de large et de trois de haut. La forme de
 * la salle EST le niveau — elle dit ou l'on regarde, ou l'on entre, ou l'on
 * recommence. Une grille reguliere ne peut pas exprimer cela, et l'on ne peut
 * donc pas faire un Celeste avec.
 *
 * ## Les trois choses qu'une salle decide
 *
 * 1. **Ou la camera s'arrete.** Elle ne sort jamais de la salle courante ;
 *    c'est ce qui fait qu'un ecran de Celeste est un tableau, et non une
 *    fenetre qui glisse sur un monde continu.
 * 2. **Ou l'on reapparait.** Mourir renvoie a l'entree de la salle COURANTE et
 *    non a un point de sauvegarde lointain. C'est la regle qui rend la mort
 *    bon marche, et c'est la seule raison pour laquelle on accepte de mourir
 *    deux cents fois dans un chapitre.
 * 3. **Quand on change de tableau.** Sortir d'une salle par un cote fait
 *    entrer dans celle d'a cote, et la camera glisse d'un tableau a l'autre.
 *
 * ## Pourquoi les salles sont des DONNEES
 *
 * Meme raison que tout le reste : un niveau dont le decoupage vit dans le code
 * ne se modifie qu'en recompilant, donc ne se modifie pas. Les salles partent
 * dans le fichier de projet et les six chargeurs les retrouvent.
 */

/** Une salle, en CASES. Les pixels se deduisent de la taille de tuile. */
export interface Salle {
  nom: string
  /**
   * La carte sur laquelle cette salle vit. Vide : toutes.
   *
   * Une salle est en cases, et deux cartes ont les memes cases — la meme
   * raison qui a donne leur carte aux declencheurs (format v14) : sans elle,
   * le decoupage du niveau un s'appliquait aussi au niveau deux.
   */
  carte?: string
  x: number
  y: number
  largeur: number
  hauteur: number
  /**
   * Ou l'on reapparait dans cette salle, en pixels du monde.
   *
   * Null : on reapparait la ou l'on est ENTRE. C'est le defaut, et c'est le
   * bon dans la plupart des cas — une salle qu'on traverse de gauche a droite
   * se recommence par la gauche. Une valeur explicite sert aux salles ou
   * l'entree n'est pas un bon depart : on tombe dedans par le haut, et
   * recommencer en l'air ferait retomber dans les pointes.
   */
  reprise?: { x: number; y: number } | null
}

/** Une salle vide, avec ses valeurs par defaut. */
export function salle(nom: string, p: Partial<Salle> = {}): Salle {
  return {
    nom,
    carte: p.carte ?? '',
    x: p.x ?? 0,
    y: p.y ?? 0,
    largeur: Math.max(1, p.largeur ?? 20),
    hauteur: Math.max(1, p.hauteur ?? 12),
    reprise: p.reprise ?? null,
  }
}

/** Les bornes d'une salle en pixels du monde. */
export const bornesDe = (s: Salle, tuile: number): { x: number; y: number; l: number; h: number } => ({
  x: s.x * tuile, y: s.y * tuile, l: s.largeur * tuile, h: s.hauteur * tuile,
})

const dedansSalle = (s: Salle, tuile: number, x: number, y: number): boolean => {
  const b = bornesDe(s, tuile)
  return x >= b.x && y >= b.y && x < b.x + b.l && y < b.y + b.h
}

/**
 * Le decoupage d'un niveau en salles, et le suivi de celle ou l'on est.
 *
 * ## Pourquoi elle GARDE la salle courante
 *
 * On pourrait chercher la salle a chaque pas depuis la position. Deux raisons
 * de ne pas le faire, et la seconde est la vraie :
 *
 * - un personnage peut se trouver dans un interstice — entre deux salles qui
 *   ne se touchent pas tout a fait, ou dans une porte. Cherchee a chaque pas,
 *   la salle deviendrait « aucune », la camera se libererait et le tableau
 *   sauterait. En gardant la derniere connue, on ne quitte une salle que pour
 *   une autre.
 * - le CHANGEMENT est un evenement du jeu : c'est lui qui deplace le point de
 *   reprise et lance le glissement de la camera. Sans memoire, il n'y a pas
 *   de changement, seulement un etat qu'on relit.
 */
export class Salles {
  private liste: Salle[]
  private tuile: number
  private courante: Salle | null = null
  /** Ou l'on est entre dans la salle courante, en pixels. */
  private entree: { x: number; y: number } | null = null
  /** Combien de fois on a change de salle. Pour les bancs. */
  changements = 0

  constructor(liste: Salle[] = [], tuile = 16) {
    this.liste = liste
    this.tuile = tuile
  }

  get nombre(): number { return this.liste.length }
  get salles(): readonly Salle[] { return this.liste }
  get nom(): string { return this.courante?.nom ?? '' }
  get salleCourante(): Salle | null { return this.courante }

  /** La salle qui contient ce point du monde, ou null. */
  salleEn(x: number, y: number): Salle | null {
    for (const s of this.liste) if (dedansSalle(s, this.tuile, x, y)) return s
    return null
  }

  salleNommee(nom: string): Salle | null {
    return this.liste.find((s) => s.nom === nom) ?? null
  }

  /** Les bornes de la salle courante, ou null si l'on n'en a aucune. */
  bornes(): { x: number; y: number; l: number; h: number } | null {
    return this.courante ? bornesDe(this.courante, this.tuile) : null
  }

  /**
   * Ou l'on reapparait : la reprise explicite de la salle, ou son entree.
   *
   * Null tant qu'on n'est entre nulle part — un niveau sans salle garde son
   * ancien point de reprise, ce qui vaut mieux que d'en inventer un.
   */
  reprise(): { x: number; y: number } | null {
    if (!this.courante) return null
    return this.courante.reprise ?? this.entree
  }

  /**
   * Signale ou se trouve le personnage. Rend la salle si l'on vient d'en
   * changer, null sinon.
   *
   * C'est la seule methode qui ecrit : tout le reste se lit. Un appelant qui
   * l'oublie garde une camera bloquee sur la premiere salle, ce qui se voit
   * tout de suite — mieux qu'un etat qui derive en silence.
   */
  suivre(x: number, y: number): Salle | null {
    if (this.courante && dedansSalle(this.courante, this.tuile, x, y)) return null
    const trouvee = this.salleEn(x, y)
    // Dans un interstice : on GARDE la salle courante. La chercher a chaque
    // pas ferait sauter le tableau chaque fois qu'un pixel depasse.
    if (!trouvee) return null
    if (trouvee === this.courante) return null
    this.courante = trouvee
    this.entree = { x, y }
    this.changements++
    return trouvee
  }

  /** Pose la salle courante sans passer par un deplacement. */
  poser(x: number, y: number): Salle | null {
    const s = this.salleEn(x, y)
    if (!s) return null
    this.courante = s
    this.entree = { x, y }
    return s
  }

  /**
   * L'etat, pour l'instantane du reseau.
   *
   * La salle courante EST de l'etat : deux machines qui n'ont pas la meme
   * n'ont pas la meme camera, ni le meme point de reprise. Le nom suffit —
   * la liste, elle, ne bouge pas de la partie.
   */
  instantane(): { nom: string; entree: { x: number; y: number } | null; changements: number } {
    return {
      nom: this.courante?.nom ?? '',
      entree: this.entree ? { ...this.entree } : null,
      changements: this.changements,
    }
  }

  restaurer(e: { nom: string; entree: { x: number; y: number } | null; changements: number }): void {
    this.courante = e.nom ? this.salleNommee(e.nom) : null
    this.entree = e.entree ? { ...e.entree } : null
    this.changements = e.changements
  }
}

/**
 * Les salles qui se CHEVAUCHENT, s'il y en a.
 *
 * Deux salles qui se recouvrent rendent « dans quelle salle suis-je ? » sans
 * reponse : le resultat depend de l'ordre de la liste, donc de rien. La
 * camera sauterait d'un tableau a l'autre au gre des pixels, et le defaut
 * serait attribue a la camera.
 *
 * On les SIGNALE au lieu de les interdire : l'editeur doit pouvoir montrer le
 * probleme pendant qu'on pose une salle, pas refuser de la poser.
 */
export function chevauchements(liste: Salle[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      const a = liste[i]
      const b = liste[j]
      // Deux salles de cartes DIFFERENTES ne se genent pas : elles occupent
      // les memes cases, mais jamais en meme temps. Une salle sans carte vit
      // partout, donc elle peut croiser n'importe qui.
      const memeMonde = !(a.carte ?? '') || !(b.carte ?? '') || a.carte === b.carte
      const seCroise = memeMonde
        && a.x < b.x + b.largeur && b.x < a.x + a.largeur
        && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur
      if (seCroise) out.push([a.nom, b.nom])
    }
  }
  return out
}

/**
 * Les salles qu'on ne peut atteindre depuis la premiere, de proche en proche.
 *
 * Deux salles sont voisines si elles se TOUCHENT par un cote — pas seulement
 * par un coin : on ne traverse pas un point. C'est une verification de
 * niveau, pas de moteur : une salle inatteignable est du travail perdu, et
 * elle ne se voit qu'en jouant tout le chapitre.
 */
export function salleIsolees(liste: Salle[]): string[] {
  if (liste.length === 0) return []
  const touche = (a: Salle, b: Salle): boolean => {
    const cheveauchementX = a.x < b.x + b.largeur && b.x < a.x + a.largeur
    const cheveauchementY = a.y < b.y + b.hauteur && b.y < a.y + a.hauteur
    // Un cote commun : elles se touchent sur un axe et se recouvrent sur
    // l'autre. Le simple contact de deux coins ne compte pas.
    const colleX = a.x + a.largeur === b.x || b.x + b.largeur === a.x
    const colleY = a.y + a.hauteur === b.y || b.y + b.hauteur === a.y
    return (colleX && cheveauchementY) || (colleY && cheveauchementX)
      || (cheveauchementX && cheveauchementY)
  }
  const vus = new Set<string>([liste[0].nom])
  const file = [liste[0]]
  while (file.length) {
    const s = file.pop()!
    for (const autre of liste) {
      if (vus.has(autre.nom)) continue
      if (!touche(s, autre)) continue
      vus.add(autre.nom)
      file.push(autre)
    }
  }
  return liste.filter((s) => !vus.has(s.nom)).map((s) => s.nom)
}
