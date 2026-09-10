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
 */
export interface Geste {
  nom: string
  defaire(): void
  refaire(): void
}

export const GESTES_GARDES = 50

export class Historique {
  private passe: Geste[] = []
  private futur: Geste[] = []

  get peutDefaire(): boolean { return this.passe.length > 0 }
  get peutRefaire(): boolean { return this.futur.length > 0 }
  get nomDefaire(): string | null { return this.passe[this.passe.length - 1]?.nom ?? null }
  get nomRefaire(): string | null { return this.futur[this.futur.length - 1]?.nom ?? null }
  get taille(): number { return this.passe.length }

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
    this.futur.length = 0
  }

  defaire(): string | null {
    const g = this.passe.pop()
    if (!g) return null
    g.defaire()
    this.futur.push(g)
    return g.nom
  }

  refaire(): string | null {
    const g = this.futur.pop()
    if (!g) return null
    g.refaire()
    this.passe.push(g)
    return g.nom
  }

  vider(): void {
    this.passe.length = 0
    this.futur.length = 0
  }
}

/** Une case qui a change : ou, et ce qu'elle valait de part et d'autre. */
export interface Changement {
  tableau: Int32Array | Uint16Array | Uint8Array
  index: number
  avant: number
  apres: number
}

/**
 * Compare deux etats d'un meme tableau et rend ce qui a bouge.
 *
 * On garde une reference au tableau VIVANT, pas a la photographie : c'est lui
 * qu'il faudra remettre en place. Garder la copie ferait defaire dans un
 * tableau que plus personne ne regarde.
 */
export function differences(
  vivant: Int32Array | Uint16Array | Uint8Array, photo: Int32Array | Uint16Array | Uint8Array,
): Changement[] {
  const out: Changement[] = []
  for (let i = 0; i < vivant.length; i++) {
    if (vivant[i] !== photo[i]) out.push({ tableau: vivant, index: i, avant: photo[i], apres: vivant[i] })
  }
  return out
}

/** Un geste fait de cases changees. Le plus courant : un coup de pinceau. */
export function gesteDeChangements(
  nom: string, changements: Changement[], apres: () => void = () => {},
): Geste {
  return {
    nom,
    defaire() {
      for (const c of changements) c.tableau[c.index] = c.avant
      apres()
    },
    refaire() {
      for (const c of changements) c.tableau[c.index] = c.apres
      apres()
    },
  }
}
