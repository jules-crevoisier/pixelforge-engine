import type { Noeud } from '../scene/noeud.ts'

/**
 * Prendre et rendre l'etat d'une simulation, et savoir dire qu'il a diverge.
 *
 * ## Pourquoi un instantane, avant tout reseau
 *
 * Un multijoueur nerveux ne transmet pas des POSITIONS : il transmet des
 * ENTREES, et chaque machine simule tout le monde. Le joueur distant a
 * cinquante millisecondes de retard, donc on PREDIT ce qu'il fait ; quand ses
 * vraies touches arrivent, il faut revenir cinquante millisecondes en arriere
 * et refaire le chemin avec les bonnes. Cette marche arriere n'existe que si
 * l'on sait rendre un etat exactement comme il etait.
 *
 * C'est aussi ce qui donne, sans un octet de reseau, le rejeu d'une partie, la
 * verification d'un record, et le « revenir en arriere » d'un mode entrainement.
 *
 * ## Pourquoi une empreinte, et pas une comparaison
 *
 * Deux machines ne peuvent pas s'envoyer leur etat complet a chaque pas — ce
 * serait plus gros que le jeu. Elles s'envoient un NOMBRE calcule sur cet
 * etat ; s'il differe, elles ont diverge. L'empreinte ne dit pas OU l'on a
 * diverge, seulement QUE l'on a diverge, et c'est exactement ce qu'il faut :
 * une divergence non detectee est une partie ou les deux joueurs voient deux
 * films differents et croient jouer ensemble.
 *
 * Elle ne porte que sur ce qui SE VOIT — position, image, vie. Y mettre les
 * fractions de pixel donnerait des divergences que personne ne peut constater,
 * et l'on passerait son temps a rembobiner pour rien.
 */

/**
 * Un noeud de la scene, reduit a ce qui change pendant une partie.
 *
 * ## Pourquoi il garde une REFERENCE au noeud
 *
 * Un instantane doit pouvoir RESSUSCITER : une creature tuee au pas 130 doit
 * revenir si l'on rembobine au pas 120, sinon les deux machines n'ont pas le
 * meme monde et la correction empire ce qu'elle repare. Une premiere version
 * ne gardait que les positions et laissait la scene decider qui existe — ce
 * qui paraissait prudent, et rendait le rembobinage tout simplement faux.
 *
 * Ressusciter demande de remettre le MEME noeud, pas un noeud qui lui
 * ressemble : son identifiant est cite par la vitalite, par le peuplement, par
 * un script. On garde donc la reference — ce qui est acceptable ici et le
 * serait rarement ailleurs : cet instantane ne s'ecrit pas dans un fichier, il
 * ne vit que quelques images, et le proprietaire des noeuds est la simulation
 * elle-meme.
 */
export interface NoeudInstantane {
  id: string
  /** L'identifiant du parent, ou null pour la racine. */
  parent: string | null
  x: number
  y: number
  visible: boolean
  image: number
  /** Le noeud lui-meme, pour pouvoir le remettre en place. */
  noeud: Noeud
}

export function prendreScene(racine: Noeud): NoeudInstantane[] {
  const sortie: NoeudInstantane[] = []
  const parcourir = (n: Noeud, parent: string | null): void => {
    const s = n as unknown as { image?: number }
    sortie.push({
      id: n.id, parent, x: n.x, y: n.y, visible: n.visible,
      image: typeof s.image === 'number' ? s.image : 0,
      noeud: n,
    })
    for (const e of n.enfants) parcourir(e, n.id)
  }
  parcourir(racine, null)
  return sortie
}

/**
 * Rend a la scene l'etat d'un instantane : qui existe, et ou.
 *
 * Trois temps, et l'ordre compte. On RETIRE d'abord ce qui n'existait pas —
 * sinon un noeud ajoute depuis se retrouverait deux fois. On REMET ensuite ce
 * qui a disparu, chez son parent d'alors. On repose enfin les positions.
 *
 * Un noeud remis retrouve sa place dans la liste de son parent, pas forcement
 * son rang : l'ordre des enfants decide de l'ordre de dessin, et deux entites
 * du meme calque qui echangent leur rang ne se distinguent pas a l'oeil. Le
 * retablir exactement couterait un tri a chaque rembobinage pour une
 * difference que personne ne peut voir.
 */
export function rendreScene(racine: Noeud, etat: NoeudInstantane[]): void {
  const parId = new Map(etat.map((n) => [n.id, n]))

  const retirer = (n: Noeud): void => {
    n.enfants = n.enfants.filter((e) => parId.has(e.id))
    for (const e of n.enfants) retirer(e)
  }
  retirer(racine)

  const presents = new Set<string>()
  const parNoeud = new Map<string, Noeud>()
  /**
   * Recense un noeud ET TOUT SON SOUS-ARBRE.
   *
   * Un noeud remis ramene ses enfants avec lui : sa boite de collision, ses
   * accroches. Ne recenser que lui laissait croire ses enfants absents, et
   * l'on remettait alors une deuxieme fois un enfant deja en place. La scene
   * gagnait un doublon a chaque rembobinage, sans que rien ne s'affiche de
   * travers — c'est l'empreinte qui l'a dit.
   */
  const recenser = (n: Noeud): void => {
    presents.add(n.id)
    parNoeud.set(n.id, n)
    for (const e of n.enfants) recenser(e)
  }
  recenser(racine)

  // On remet les manquants dans l'ordre de l'instantane : un parent y precede
  // toujours ses enfants, donc un parent lui-meme absent est deja revenu quand
  // on arrive a ses enfants.
  for (const e of etat) {
    if (presents.has(e.id) || !e.parent) continue
    const parent = parNoeud.get(e.parent)
    if (!parent) continue
    parent.enfants.push(e.noeud)
    recenser(e.noeud)
  }

  const reposer = (n: Noeud): void => {
    const e = parId.get(n.id)
    if (e) {
      n.x = e.x
      n.y = e.y
      n.visible = e.visible
      ;(n as unknown as { image?: number }).image = e.image
    }
    for (const f of n.enfants) reposer(f)
  }
  reposer(racine)
}

/**
 * Une empreinte de 32 bits, stable et bon marche.
 *
 * FNV-1a : quatre lignes, pas de table, le meme resultat en Python, en Rust et
 * en GDScript. Une empreinte cryptographique serait plus sure contre un
 * adversaire ; on ne se defend pas contre un adversaire ici, on detecte une
 * divergence entre deux machines qui essaient de s'accorder.
 */
export function empreinteDe(valeurs: Iterable<number>): number {
  let h = 0x811c9dc5
  for (const v of valeurs) {
    // Les nombres sont ramenes a l'entier : deux machines peuvent differer sur
    // le dernier bit d'un flottant sans que rien ne se voie a l'ecran, et une
    // empreinte qui compte ce bit-la declarerait une divergence a chaque pas.
    let n = Math.round(v) | 0
    for (let k = 0; k < 4; k++) {
      h ^= n & 0xff
      h = Math.imul(h, 0x01000193) >>> 0
      n >>>= 8
    }
  }
  return h >>> 0
}

/** L'empreinte d'une scene : ce que les joueurs voient, et rien d'autre. */
export function empreinteScene(etat: NoeudInstantane[]): number {
  const nombres: number[] = []
  // Trie par identifiant : l'ordre de parcours de la scene peut differer d'une
  // machine a l'autre des qu'une entite est ajoutee ailleurs dans l'arbre, et
  // deux etats identiques rendraient alors deux empreintes differentes.
  for (const n of [...etat].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    nombres.push(n.x, n.y, n.visible ? 1 : 0, n.image)
  }
  return empreinteDe(nombres)
}
