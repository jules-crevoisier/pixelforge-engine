import { SOLIDE, estPente } from '../tuiles/tilemap.ts'

/**
 * Se rendre quelque part, quand un mur est en travers.
 *
 * ## Le defaut que ce fichier repare
 *
 * « Poursuite » voulait dire : aller vers le heros en ligne droite. Derriere
 * un mur, la creature poussait contre la pierre indefiniment. Mesure sur une
 * salle a la Isaac — un mur au milieu, un passage a une case — elle n'avait
 * pas avance d'un seul pixel en quinze secondes. Ce n'est pas une creature
 * qui poursuit mal, c'est une creature qui ne poursuit pas.
 *
 * ## Pourquoi un champ de distance, et non un chemin par creature
 *
 * L'A* rend un chemin par creature. Vingt creatures, c'est vingt recherches,
 * et le cout monte avec le nombre d'ennemis — exactement la ou l'on n'en a
 * pas les moyens, puisque c'est la que le jeu est charge.
 *
 * Un champ de distance renverse le probleme : on parcourt la salle UNE fois
 * depuis le heros, et chaque case retient sa distance jusqu'a lui. N'importe
 * quelle creature n'a plus qu'a regarder ses huit voisines et descendre. Le
 * cout ne depend plus du nombre d'ennemis mais de la taille de la salle, et
 * cent creatures coutent le meme prix qu'une.
 *
 * ## Pourquoi il n'y a RIEN a garder d'un pas sur l'autre
 *
 * C'est la propriete qui compte pour le reseau. Un chemin garde en memoire
 * est de l'etat : apres un rembobinage, la creature repartirait d'un chemin
 * calcule dans un futur qui n'a plus lieu, et les deux machines divergeraient
 * sans qu'on sache pourquoi. Le champ, lui, se recalcule entierement a partir
 * du monde du pas courant. Il ne peut pas etre faux d'un pas a l'autre parce
 * qu'il n'est jamais reporte.
 *
 * ## Pourquoi des couts entiers
 *
 * Dix pour un pas droit, quatorze pour une diagonale — la racine de deux, en
 * dixiemes. On pourrait ecrire 1 et 1,41421356 : ce serait plus juste et
 * moins sur. Deux machines qui comparent des flottants dans un tas binaire
 * peuvent les ordonner autrement des que deux valeurs se touchent, et le
 * champ differerait d'une case. Les entiers ne se discutent pas.
 */

/** Une case inatteignable, ou hors du champ calcule. */
export const LOIN = -1

/** Ce qu'un chemin a besoin de savoir du monde : ce qui bloque, et ou. */
export interface GrilleChemin {
  readonly largeur: number
  readonly hauteur: number
  readonly tuile: number
  /** Vrai si l'on ne peut pas se tenir sur cette case. Dehors : vrai. */
  bloque(cx: number, cy: number): boolean
}

/** Le minimum qu'une carte doit offrir pour qu'on sache y naviguer. */
export interface CarteNavigable {
  largeur: number
  hauteur: number
  tuile: number
  solides: ArrayLike<number>
}

/**
 * La grille de chemin d'une carte du moteur.
 *
 * ## Pourquoi une pente ne bloque pas
 *
 * On la monte. La confondre avec un mur ferait contourner une colline par une
 * creature qui pouvait la gravir — et le detour se verrait, alors que la
 * cause ne se verrait pas.
 *
 * ## Pourquoi on ne demande PAS la methode `index`
 *
 * On l'a demandee, et le banc de charge est tombe : il passe au moteur une
 * carte reduite au strict necessaire, sans methode. Le calcul est
 * `y * largeur + x` et rien d'autre ; exiger qu'on nous le fournisse
 * n'apportait aucune souplesse et retirait des appelants legitimes. On
 * demande donc des DONNEES, et l'on fait le calcul ici.
 */
export function grilleDeCarte(carte: CarteNavigable): GrilleChemin | null {
  // Une carte sans grille de collision n'a rien a dire sur ce qui bloque. On
  // rend null plutot qu'une grille ou rien ne bloque : « je ne sais pas » et
  // « c'est degage » menent a des comportements opposes, et l'appelant doit
  // pouvoir les distinguer.
  if (!carte || !carte.solides || !(carte.largeur > 0) || !(carte.hauteur > 0)) return null
  const largeur = carte.largeur
  return {
    largeur,
    hauteur: carte.hauteur,
    tuile: carte.tuile > 0 ? carte.tuile : 16,
    bloque(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= largeur || cy >= carte.hauteur) return true
      const m = carte.solides[cy * largeur + cx]
      return (m & SOLIDE) !== 0 && !estPente(m)
    },
  }
}

const DROIT = 10
const DIAGONALE = 14

/**
 * Les huit voisins, dans un ordre FIXE.
 *
 * L'ordre decide des egalites : deux cases a la meme distance, c'est la
 * premiere de cette liste qui gagne. Le laisser au hasard de l'implantation
 * ferait deux moteurs qui choisissent des detours differents pour un meme
 * monde — et l'ecart ne se verrait qu'apres plusieurs secondes de jeu.
 */
const VOISINS: [number, number, number][] = [
  [0, -1, DROIT], [1, 0, DROIT], [0, 1, DROIT], [-1, 0, DROIT],
  [1, -1, DIAGONALE], [1, 1, DIAGONALE], [-1, 1, DIAGONALE], [-1, -1, DIAGONALE],
]

/**
 * Le champ de distance vers une source, en cases.
 *
 * Il se REMPLIT au lieu de se reconstruire : un champ alloue une fois et
 * reutilise a chaque pas evite trente mille octets de rebut par seconde, et
 * les a-coups du ramasse-miettes qu'ils finissent par provoquer.
 */
export class ChampDeFlux {
  /** Distance en dixiemes de case, ou LOIN. Indexe comme la carte. */
  private dist: Int32Array = new Int32Array(0)
  private largeur = 0
  private hauteur = 0
  /** Le nombre de cases examinees au dernier calcul, pour les bancs. */
  visitees = 0
  /** La case source du dernier calcul. */
  sourceX = -1
  sourceY = -1

  /* Le tas binaire, garde d'un calcul a l'autre pour ne rien allouer. */
  private tasCase: Int32Array = new Int32Array(0)
  private tasCout: Int32Array = new Int32Array(0)
  private taille = 0

  private redimensionner(l: number, h: number): void {
    if (this.largeur === l && this.hauteur === h) return
    this.largeur = l
    this.hauteur = h
    this.dist = new Int32Array(l * h)
    this.tasCase = new Int32Array(l * h)
    this.tasCout = new Int32Array(l * h)
  }

  distanceDe(cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.largeur || cy >= this.hauteur) return LOIN
    return this.dist[cy * this.largeur + cx]
  }

  /**
   * Remplit le champ depuis une case, sans depasser une portee.
   *
   * La portee n'est pas une economie de confort : sur une carte de deux cents
   * cases de cote, parcourir tout a chaque pas coute quarante mille cases pour
   * des creatures qui n'en voient que dix. On s'arrete donc a la distance ou
   * plus personne ne poursuit, et ce qui est au-dela vaut LOIN — c'est-a-dire
   * « je ne sais pas », et non « c'est inatteignable ».
   */
  calculer(g: GrilleChemin, cx: number, cy: number, porteeCases: number): void {
    this.redimensionner(g.largeur, g.hauteur)
    this.dist.fill(LOIN)
    this.taille = 0
    this.visitees = 0
    this.sourceX = cx
    this.sourceY = cy
    if (cx < 0 || cy < 0 || cx >= g.largeur || cy >= g.hauteur) return
    // Une source DANS un mur arrive : le heros traverse une porte, ou l'on
    // arrondit sa position sur une case pleine. On part quand meme — sinon
    // les creatures s'arreteraient net pendant qu'il passe.
    const maxi = Math.max(0, Math.round(porteeCases * DROIT))

    const source = cy * g.largeur + cx
    this.dist[source] = 0
    this.pousser(source, 0)

    while (this.taille > 0) {
      const cout = this.tasCout[0]
      const ici = this.tasCase[0]
      this.retirer()
      // Une case sortie du tas avec un cout perime : elle a deja ete traitee
      // par un chemin plus court. On la saute au lieu de tenir une table
      // « deja vue » de plus.
      if (cout > this.dist[ici]) continue
      this.visitees++
      const x = ici % g.largeur
      const y = (ici - x) / g.largeur
      for (const [dx, dy, pas] of VOISINS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= g.largeur || ny >= g.hauteur) continue
        if (g.bloque(nx, ny)) continue
        // Une diagonale ne se faufile pas entre deux murs qui se touchent par
        // le coin. Sans cette regle, une creature traverse un angle de mur en
        // biais : elle passe la ou aucun joueur ne pourrait passer, ce qui se
        // voit tout de suite et ne se pardonne pas.
        if (dx !== 0 && dy !== 0 && (g.bloque(x + dx, y) || g.bloque(x, y + dy))) continue
        const neuf = cout + pas
        if (neuf > maxi) continue
        const index = ny * g.largeur + nx
        const avant = this.dist[index]
        if (avant !== LOIN && avant <= neuf) continue
        this.dist[index] = neuf
        this.pousser(index, neuf)
      }
    }
  }

  /**
   * La case voisine ou aller depuis celle-ci, ou null.
   *
   * On descend d'une case a la fois : c'est tout ce dont une creature a
   * besoin, et cela evite de garder un chemin — donc de le garder JUSTE.
   */
  pasVers(g: GrilleChemin, cx: number, cy: number): { x: number; y: number } | null {
    const ici = this.distanceDe(cx, cy)
    if (ici === LOIN) return null
    if (ici === 0) return null
    let meilleur: { x: number; y: number } | null = null
    let mieux = ici
    for (const [dx, dy] of VOISINS) {
      const nx = cx + dx
      const ny = cy + dy
      if (g.bloque(nx, ny)) continue
      if (dx !== 0 && dy !== 0 && (g.bloque(cx + dx, cy) || g.bloque(cx, cy + dy))) continue
      const d = this.distanceDe(nx, ny)
      if (d === LOIN) continue
      // STRICTEMENT mieux : a egalite on garde le premier trouve, donc le
      // premier de `VOISINS`. Accepter l'egalite ferait osciller la creature
      // entre deux cases equivalentes, une image sur deux.
      if (d < mieux) { mieux = d; meilleur = { x: nx, y: ny } }
    }
    return meilleur
  }

  private pousser(index: number, cout: number): void {
    let i = this.taille++
    this.tasCase[i] = index
    this.tasCout[i] = cout
    while (i > 0) {
      const p = (i - 1) >> 1
      // A cout egal, la case de plus petit index remonte : l'ordre du tas est
      // TOTAL, il ne depend donc pas de l'ordre d'insertion.
      if (this.tasCout[p] < cout || (this.tasCout[p] === cout && this.tasCase[p] <= index)) break
      this.tasCout[i] = this.tasCout[p]; this.tasCase[i] = this.tasCase[p]
      this.tasCout[p] = cout; this.tasCase[p] = index
      i = p
    }
  }

  private retirer(): void {
    this.taille--
    if (this.taille <= 0) return
    const cout = this.tasCout[this.taille]
    const index = this.tasCase[this.taille]
    let i = 0
    for (;;) {
      const g = i * 2 + 1
      const d = g + 1
      let m = i
      let mc = cout
      let mi = index
      if (g < this.taille && (this.tasCout[g] < mc || (this.tasCout[g] === mc && this.tasCase[g] < mi))) {
        m = g; mc = this.tasCout[g]; mi = this.tasCase[g]
      }
      if (d < this.taille && (this.tasCout[d] < mc || (this.tasCout[d] === mc && this.tasCase[d] < mi))) {
        m = d; mc = this.tasCout[d]; mi = this.tasCase[d]
      }
      if (m === i) break
      this.tasCout[i] = mc; this.tasCase[i] = mi
      i = m
    }
    this.tasCout[i] = cout
    this.tasCase[i] = index
  }
}

/**
 * Vrai si rien ne bloque entre ces deux points du monde.
 *
 * ## Pourquoi elle sert
 *
 * Une creature qui voit sa cible doit aller DROIT dessus. Suivre le champ de
 * case en case donnerait une marche en escalier, visible et laide, la ou une
 * ligne droite est a la fois juste et naturelle. Le champ ne sert qu'a
 * contourner ce qu'on ne voit pas.
 *
 * ## Pourquoi on avance par pas d'une demi-case
 *
 * Un trace de Bresenham exact sur les cases repond « libre » pour une
 * diagonale qui rase deux coins — la ou un corps large ne passe pas. Un
 * echantillonnage regulier plus fin que la case ne peut pas manquer un mur,
 * et il coute deux fois rien : une dizaine de tests pour une portee ordinaire.
 */
export function ligneLibre(
  g: GrilleChemin, ax: number, ay: number, bx: number, by: number,
): boolean {
  const dx = bx - ax
  const dy = by - ay
  const longueur = Math.hypot(dx, dy)
  if (longueur < 1e-6) return !g.bloque(Math.floor(ax / g.tuile), Math.floor(ay / g.tuile))
  const pas = Math.max(1, Math.ceil((longueur * 2) / g.tuile))
  for (let i = 0; i <= pas; i++) {
    const t = i / pas
    const x = Math.floor((ax + dx * t) / g.tuile)
    const y = Math.floor((ay + dy * t) / g.tuile)
    if (g.bloque(x, y)) return false
  }
  return true
}
