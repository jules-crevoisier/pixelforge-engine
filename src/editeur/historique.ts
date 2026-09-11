/**
 * L'historique : defaire et refaire.
 *
 * ## Pourquoi on enregistre la DIFFERENCE et non l'action
 *
 * On pourrait enregistrer « pinceau de terrain en 12,7 » et rejouer l'inverse.
 * C'est plus econome, et c'est un piege : poser du terrain repeint aussi les
 * huit voisins, met a jour la collision, et un jour fera autre chose encore.
 * Chaque nouvelle consequence devrait etre ajoutee a l'inverse, et la premiere
 * oubliee laisse un defaire qui ne defait pas tout — le pire des defauts,
 * parce qu'on ne s'en apercoit que trois gestes plus tard.
 *
 * On photographie donc l'etat avant le geste, on compare apres, et l'on garde
 * les cases qui ont change. Le cout est une copie de tableau par geste ; sur
 * une carte de treize mille cases, c'est une poignee de kilo-octets, et la
 * garantie est totale au lieu d'etre esperee.
 *
 * ## Pourquoi une limite
 *
 * Sans limite, une seance de deux heures garde deux heures de photographies.
 * Cinquante gestes couvrent tout ce qu'on defait vraiment ; au-dela, on
 * recommence.
 *
 * ## Pourquoi aussi une limite en OCTETS
 *
 * Depuis que les gestes de structure sont dans le meme journal, un geste ne
 * pese plus quelques kilo-octets : redimensionner une carte photographie le
 * projet ENTIER, sons echantillonnes compris. Cinquante de ces gestes-la sur
 * un projet d'un mega-octet tiendraient cent mega-octets dans l'onglet — et
 * c'est l'editeur qui tomberait, pas le journal. On compte donc aussi ce que
 * le passe pese, et l'on oublie les plus vieux gestes avant d'y laisser la
 * memoire de la machine.
 */
export interface Geste {
  nom: string
  defaire(): void
  refaire(): void
  /**
   * Ce que ce geste pese, en octets, quand il porte une photographie.
   *
   * Absent pour un coup de pinceau : quelques cases changees ne valent pas
   * qu'on les compte.
   */
  poids?: number | undefined
  /**
   * La carte sur laquelle ce geste a eu lieu, quand il en vise une.
   *
   * Elle sert a une chose : defaire un coup de pinceau donne sur une AUTRE
   * carte que celle qu'on regarde doit ramener sous les yeux la carte
   * concernee. Sans cela, le Ctrl+Z semble ne rien faire — alors qu'il a
   * defait quelque chose, ailleurs.
   */
  carte?: string | undefined
}

export const GESTES_GARDES = 50
/** Ce que le passe a le droit de peser : au-dela, les plus vieux s'oublient. */
export const POIDS_GARDE = 24 * 1024 * 1024

export class Historique {
  private passe: Geste[] = []
  private futur: Geste[] = []

  get peutDefaire(): boolean { return this.passe.length > 0 }
  get peutRefaire(): boolean { return this.futur.length > 0 }
  get nomDefaire(): string | null { return this.passe[this.passe.length - 1]?.nom ?? null }
  get nomRefaire(): string | null { return this.futur[this.futur.length - 1]?.nom ?? null }
  get taille(): number { return this.passe.length }
  /**
   * Le dernier geste pose, ou null.
   *
   * Il sert a FUSIONNER : trente pressions sur une fleche sont un seul
   * deplacement, pas trente. L'appelant compare l'identite du dernier geste a
   * celle du sien — si un autre geste s'est intercale, il n'a plus le droit de
   * prolonger le precedent.
   */
  get dernier(): Geste | null { return this.passe[this.passe.length - 1] ?? null }

  /** Ce que le passe pese, photographies comprises. */
  get poids(): number { return this.passe.reduce((t, g) => t + (g.poids ?? 0), 0) }

  /**
   * Ce qu'on pourra defaire, du plus recent au plus ancien.
   *
   * Le journal se MONTRE, comme dans les moteurs qui en ont un : savoir que
   * trois gestes en arriere il y a « carte redimensionnee » evite d'appuyer
   * six fois sur Ctrl+Z pour voir ou l'on retombe.
   */
  get derniers(): string[] {
    return this.passe.map((g) => g.nom).reverse()
  }

  /**
   * Enregistre un geste accompli.
   *
   * Le futur est efface : on vient de partir dans une autre direction, et
   * garder l'ancienne branche donnerait un « refaire » qui rejoue quelque
   * chose qui n'a plus de sens.
   */
  poser(g: Geste): void {
    this.passe.push(g)
    if (this.passe.length > GESTES_GARDES) this.passe.shift()
    // Le poids se compte APRES le compte des gestes : un seul geste enorme —
    // un projet d'un mega-octet photographie — doit rester defaisable, sinon
    // le geste qu'on vient de faire serait le premier a s'oublier.
    while (this.passe.length > 1 && this.poids > POIDS_GARDE) this.passe.shift()
    this.futur.length = 0
  }

  defaire(): Geste | null {
    const g = this.passe.pop()
    if (!g) return null
    g.defaire()
    this.futur.push(g)
    return g
  }

  refaire(): Geste | null {
    const g = this.futur.pop()
    if (!g) return null
    g.refaire()
    this.passe.push(g)
    return g
  }

  vider(): void {
    this.passe.length = 0
    this.futur.length = 0
  }
}

/** Le genre de tableau qu'une carte porte : cases, presence, collision. */
export type TableauCarte = Int32Array | Uint16Array | Uint8Array

/**
 * Une case qui a change : ou, et ce qu'elle valait de part et d'autre.
 *
 * ## Pourquoi une ADRESSE a cote de la reference
 *
 * On gardait une reference au tableau vivant, et c'etait juste tant que rien
 * ne remplacait ce tableau. Mais l'editeur reconstruit le projet entier a
 * chaque geste de structure : apres un redimensionnement, le tableau photographie
 * n'est plus celui que le jeu dessine. Le « defaire » ecrivait alors dans un
 * tableau que plus personne ne regarde — il ne defaisait rien, en silence, ce
 * qui est la pire facon de ne pas defaire.
 *
 * Chaque changement porte donc AUSSI l'adresse de son tableau — « la
 * collision de la carte niveau2 », « les cases du calque decor » — et le
 * journal la resout au moment de defaire, dans le projet tel qu'il est alors.
 * La reference reste comme secours, pour les gestes qui n'ont pas d'adresse.
 */
export interface Changement {
  tableau: TableauCarte
  /** Ou ce tableau se retrouve dans le projet vivant. Voir `Resolveur`. */
  cible?: string | undefined
  index: number
  avant: number
  apres: number
}

/** Retrouve un tableau de carte par son adresse, dans le projet d'aujourd'hui. */
export type Resolveur = (cible: string) => TableauCarte | null

/** L'adresse d'un tableau de carte, telle que le resolveur la comprend. */
export const adresseSolides = (carte: string): string => `carte:${carte}/solides`
export const adresseCases = (carte: string, calque: string): string =>
  `carte:${carte}/calque:${calque}/cases`
export const adressePresence = (carte: string, calque: string): string =>
  `carte:${carte}/calque:${calque}/presence`

/**
 * Compare deux etats d'un meme tableau et rend ce qui a bouge.
 *
 * On garde une reference au tableau VIVANT, pas a la photographie : c'est lui
 * qu'il faudra remettre en place. Garder la copie ferait defaire dans un
 * tableau que plus personne ne regarde.
 */
export function differences(
  vivant: TableauCarte, photo: TableauCarte, cible?: string,
): Changement[] {
  const out: Changement[] = []
  for (let i = 0; i < vivant.length; i++) {
    if (vivant[i] !== photo[i]) {
      out.push({ tableau: vivant, cible, index: i, avant: photo[i], apres: vivant[i] })
    }
  }
  return out
}

/**
 * Un geste fait de cases changees. Le plus courant : un coup de pinceau.
 *
 * Le resolveur est consulte A CHAQUE fois et non une fois pour toutes : entre
 * le geste et son annulation, le projet a pu etre reconstruit deux fois, et
 * c'est le tableau d'aujourd'hui qu'il faut ecrire. Quand l'adresse ne mene
 * nulle part — le calque a ete supprime depuis — on n'ecrit rien plutot que
 * d'ecrire au hasard : mieux vaut un geste qui ne se defait pas qu'un geste
 * qui abime une autre carte.
 */
export function gesteDeChangements(
  nom: string, changements: Changement[], apres: () => void = () => {},
  resoudre?: Resolveur | undefined, carte?: string | undefined,
): Geste {
  const ecrire = (sens: 'avant' | 'apres'): void => {
    for (const c of changements) {
      const t = c.cible && resoudre ? resoudre(c.cible) : c.tableau
      if (!t || c.index >= t.length) continue
      t[c.index] = c[sens]
    }
    apres()
  }
  return {
    nom,
    carte,
    defaire: () => ecrire('avant'),
    refaire: () => ecrire('apres'),
  }
}
