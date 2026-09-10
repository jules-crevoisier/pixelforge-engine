/**
 * Le plan d'etage : quelles salles, ou, et reliees comment.
 *
 * ## Pourquoi un plan avant des tuiles
 *
 * On pourrait engendrer directement une grande carte et y creuser des
 * couloirs. C'est ce que font les generateurs de donjons « organiques », et
 * c'est le bon choix quand le jeu veut des couloirs. Un jeu a SALLES — Isaac,
 * Dead Cells, Metroid — a besoin d'autre chose : que la salle soit une unite,
 * qu'on sache la nommer, la remplir, la verrouiller, y cadrer la camera, dire
 * qu'elle est nettoyee. Le plan existe donc AVANT les tuiles, et les tuiles
 * ne font que le realiser.
 *
 * C'est aussi ce qui permet de verifier le niveau sans le dessiner : la
 * connexite, la place du boss, le nombre de culs-de-sac se lisent sur le plan.
 *
 * ## Pourquoi une graine et non `Math.random`
 *
 * Un niveau qu'on ne peut pas reproduire est un niveau qu'on ne peut pas
 * corriger : « il y avait un mur infranchissable » devient une histoire au
 * lieu d'un rapport. Avec une graine, le meme nombre rend le meme etage, sur
 * toutes les machines et dans six langages si besoin.
 */

/**
 * Un generateur congruentiel lineaire.
 *
 * Les constantes sont celles de Numerical Recipes. Ce n'est pas un generateur
 * de qualite cryptographique et ce n'est pas ce qu'on lui demande : on veut
 * une suite reproductible, rapide, et qu'on puisse reecrire a l'identique en
 * Python ou en Rust en trois lignes. `Math.random` n'a aucune de ces
 * proprietes — il n'est meme pas specifie.
 */
export class Hasard {
  private etat: number

  constructor(graine: number) {
    // Un etat nul se reproduirait indefiniment : on l'ecarte.
    this.etat = (graine >>> 0) || 1
  }

  /** Entier sur 32 bits. */
  suivant(): number {
    this.etat = (Math.imul(this.etat, 1664525) + 1013904223) >>> 0
    return this.etat
  }

  /** Reel dans [0, 1[. */
  reel(): number { return this.suivant() / 4294967296 }

  /**
   * Entier dans [0, n[.
   *
   * Par les bits de POIDS FORT, et non par un modulo. Les bits de poids faible
   * d'un generateur congruentiel sont notoirement mauvais : le dernier bit
   * alterne strictement, si bien que `suivant() % 2` rend 0, 1, 0, 1 quelle
   * que soit la graine. Deux graines differentes donnaient ici exactement le
   * meme etage, parce que le seul tirage qui comptait etait un tirage sur deux.
   */
  entier(n: number): number { return n <= 0 ? 0 : Math.floor(this.reel() * n) }

  /** Un element au hasard, ou null si la liste est vide. */
  parmi<T>(liste: T[]): T | null {
    return liste.length ? liste[this.entier(liste.length)] : null
  }
}

export type RoleSalle = 'depart' | 'commune' | 'tresor' | 'boutique' | 'boss'

export interface SallePlan {
  /** Position sur la grille de l'etage. */
  cx: number
  cy: number
  role: RoleSalle
  /** Voisines, dans l'ordre est, sud, ouest, nord. Null s'il n'y a personne. */
  voisines: (SallePlan | null)[]
  /** Distance au depart, en nombre de salles. */
  distance: number
}

export interface PlanEtage {
  graine: number
  largeur: number
  hauteur: number
  salles: SallePlan[]
  depart: SallePlan
  boss: SallePlan
}

/** Est, sud, ouest, nord — l'ordre horaire, et celui des portes. */
export const DIRECTIONS: { dx: number; dy: number }[] = [
  { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
]
export const OPPOSEE = [2, 3, 0, 1]

export interface OptionsPlan {
  largeur?: number
  hauteur?: number
  /** Nombre de salles vise, depart compris. */
  salles?: number
}

/**
 * Engendre un plan d'etage.
 *
 * ## L'algorithme, et la regle qui fait tout
 *
 * On part du centre et l'on pousse des salles voisines au hasard, par vagues.
 * Une candidate est refusee si elle touche DEJA plus d'une salle placee. Cette
 * seule regle est ce qui distingue un etage d'Isaac d'une tache informe : sans
 * elle, les salles se collent en pave et l'etage n'a plus ni branches ni
 * culs-de-sac — donc plus rien a decouvrir, et nulle part ou mettre un tresor.
 *
 * On refuse aussi une candidate une fois sur deux, ce qui allonge les branches
 * au lieu de remplir le voisinage immediat.
 *
 * Le boss va au cul-de-sac le PLUS LOIN du depart, en nombre de salles et non
 * a vol d'oiseau : c'est la distance que le joueur parcourt reellement.
 */
export function engendrerPlan(graine: number, opts: OptionsPlan = {}): PlanEtage {
  const largeur = opts.largeur ?? 9
  const hauteur = opts.hauteur ?? 7
  const vise = Math.max(2, Math.min(opts.salles ?? 12, largeur * hauteur))
  const h = new Hasard(graine)

  const grille = new Map<string, SallePlan>()
  const clef = (x: number, y: number): string => `${x},${y}`
  const creer = (cx: number, cy: number): SallePlan => {
    const s: SallePlan = { cx, cy, role: 'commune', voisines: [null, null, null, null], distance: 0 }
    grille.set(clef(cx, cy), s)
    return s
  }

  const depart = creer(Math.floor(largeur / 2), Math.floor(hauteur / 2))
  depart.role = 'depart'

  const voisinesPlacees = (x: number, y: number): number =>
    DIRECTIONS.filter((d) => grille.has(clef(x + d.dx, y + d.dy))).length

  let file: SallePlan[] = [depart]
  // Une limite de tours : si la forme se bloque — un etage etroit, un tirage
  // malheureux — on rend ce qu'on a plutot que de tourner sans fin. Un
  // generateur qui peut ne pas terminer est un generateur qui figera le jeu un
  // jour, sur la machine de quelqu'un d'autre.
  for (let tour = 0; tour < 200 && grille.size < vise; tour++) {
    const prochaine: SallePlan[] = []
    for (const s of file) {
      for (let d = 0; d < DIRECTIONS.length; d++) {
        if (grille.size >= vise) break
        const nx = s.cx + DIRECTIONS[d].dx
        const ny = s.cy + DIRECTIONS[d].dy
        if (nx < 0 || ny < 0 || nx >= largeur || ny >= hauteur) continue
        if (grille.has(clef(nx, ny))) continue
        // La regle qui donne des branches au lieu d'un pave.
        if (voisinesPlacees(nx, ny) > 1) continue
        if (h.entier(2) === 0) continue
        prochaine.push(creer(nx, ny))
      }
    }
    // Rien n'a pousse : on repart de toutes les salles, sinon une vague vide
    // arreterait la croissance alors qu'il reste de la place.
    file = prochaine.length ? prochaine : [...grille.values()]
  }

  // Les liens, une fois toutes les salles posees.
  for (const s of grille.values()) {
    for (let d = 0; d < DIRECTIONS.length; d++) {
      s.voisines[d] = grille.get(clef(s.cx + DIRECTIONS[d].dx, s.cy + DIRECTIONS[d].dy)) ?? null
    }
  }

  // Les distances, par parcours en largeur depuis le depart.
  for (const s of grille.values()) s.distance = -1
  depart.distance = 0
  const attente: SallePlan[] = [depart]
  while (attente.length) {
    const s = attente.shift() as SallePlan
    for (const v of s.voisines) {
      if (v && v.distance < 0) { v.distance = s.distance + 1; attente.push(v) }
    }
  }

  const salles = [...grille.values()]
  // Les culs-de-sac : une seule voisine. C'est la qu'on met ce qui merite un
  // detour — sinon le joueur tombe sur le tresor en allant au boss.
  const impasses = salles
    .filter((s) => s !== depart && s.voisines.filter(Boolean).length === 1)
    .sort((a, b) => b.distance - a.distance || (b.cx + b.cy) - (a.cx + a.cy))

  // Le boss au plus loin. S'il n'y a aucune impasse — un etage minuscule — on
  // prend la salle la plus lointaine, quelle qu'elle soit.
  const boss = impasses[0]
    ?? salles.filter((s) => s !== depart).sort((a, b) => b.distance - a.distance)[0]
    ?? depart
  if (boss !== depart) boss.role = 'boss'

  const restantes = impasses.filter((s) => s !== boss)
  if (restantes[0]) restantes[0].role = 'tresor'
  if (restantes[1]) restantes[1].role = 'boutique'

  return { graine, largeur, hauteur, salles, depart, boss }
}

/** Les salles atteignables depuis le depart, en suivant les liens du plan. */
export function sallesAtteignables(p: PlanEtage): Set<SallePlan> {
  const vues = new Set<SallePlan>([p.depart])
  const file = [p.depart]
  while (file.length) {
    const s = file.shift() as SallePlan
    for (const v of s.voisines) if (v && !vues.has(v)) { vues.add(v); file.push(v) }
  }
  return vues
}
