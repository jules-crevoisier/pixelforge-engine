import { Carte, VIDE } from '../tuiles/tilemap.ts'
import { Hasard, DIRECTIONS, type PlanEtage, type SallePlan } from './plan.ts'

/**
 * L'assemblage : un plan d'etage devient une carte de tuiles.
 *
 * ## Pourquoi une seule grande carte et non une carte par salle
 *
 * Une carte par salle serait plus econome, et c'est ce que fait un jeu qui
 * charge ses salles au fur et a mesure. Mais tout le reste du moteur — la
 * collision, le rendu, l'edition, l'export — travaille sur UNE carte. Decouper
 * maintenant obligerait a inventer un deuxieme systeme de coordonnees, et donc
 * a se tromper dedans.
 *
 * Une salle est donc un rectangle a une place fixe dans une grande carte. Les
 * cases des cellules vides restent VIDE et solides : on ne peut pas y aller,
 * elles ne coutent qu'un entier chacune, et la camera n'y va jamais puisqu'elle
 * est verrouillee sur les salles.
 *
 * ## Les portes
 *
 * Deux salles voisines ont chacune leur mur : entre elles il y a DEUX cases de
 * mur, pas une. Une porte perce donc les deux. Percer d'un seul cote laisse un
 * mur invisible d'une case, et le joueur se cogne dans ce qui a l'air d'etre
 * une ouverture — le defaut le plus enrageant qu'un niveau puisse avoir.
 */
export interface OptionsAssemblage {
  /** Taille d'une salle, en cases. */
  largeurSalle?: number
  hauteurSalle?: number
  tuile?: number
  /** Index de tuile pour le sol, le mur, et le marqueur des salles speciales. */
  tuileSol?: number
  tuileMarque?: number
}

export interface EtageAssemble {
  carte: Carte
  plan: PlanEtage
  largeurSalle: number
  hauteurSalle: number
  /** Position de depart du heros, en pixels du monde. */
  depart: { x: number; y: number }
  /** La salle qui contient ce point du monde, ou null. */
  salleEn(x: number, y: number): SallePlan | null
  /** Coin haut-gauche d'une salle, en pixels du monde. */
  coinDe(s: SallePlan): { x: number; y: number }
}

/** Hauteur de la porte horizontale, en cases. Trois : on passe sans viser. */
const PORTE_HAUTEUR = 3
/** Largeur de la porte verticale. Deux : la meme generosite, a l'horizontale. */
const PORTE_LARGEUR = 2

export function assemblerEtage(plan: PlanEtage, opts: OptionsAssemblage = {}): EtageAssemble {
  const L = opts.largeurSalle ?? 20
  const H = opts.hauteurSalle ?? 11
  const tuile = opts.tuile ?? 16
  const tuileSol = opts.tuileSol ?? 0
  const tuileMarque = opts.tuileMarque ?? tuileSol

  const carte = new Carte(plan.largeur * L, plan.hauteur * H, tuile)
  const sol = carte.ajouterCalque('sol', { presence: new Uint8Array(carte.cases) })
  const mur = carte.ajouterCalque('mur', {
    terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: true },
  })

  // Tout est plein au depart. On creuse ensuite : commencer plein et creuser
  // garantit qu'aucune cellule sans salle ne devient traversable par oubli.
  carte.solides.fill(1)
  if (mur.presence) mur.presence.fill(1)

  const poserSol = (x: number, y: number, t = tuileSol): void => {
    const i = carte.index(x, y)
    sol.cases[i] = t
    if (sol.presence) sol.presence[i] = 1
    if (mur.presence) mur.presence[i] = 0
    carte.solides[i] = 0
  }

  const coinDe = (s: SallePlan): { x: number; y: number } => ({ x: s.cx * L, y: s.cy * H })

  for (const s of plan.salles) {
    const o = coinDe(s)
    // L'interieur : tout sauf le pourtour d'une case.
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < L - 1; x++) poserSol(o.x + x, o.y + y)
    }
    // Le sol des cases de mur reste dessine dessous : sans cela, une porte
    // percee plus tard montrerait le vide sous ses pieds.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < L; x++) {
        const i = carte.index(o.x + x, o.y + y)
        if (sol.cases[i] === VIDE) {
          sol.cases[i] = tuileSol
          if (sol.presence) sol.presence[i] = 1
        }
      }
    }
    if (s.role !== 'commune' && s.role !== 'depart') {
      // Un marqueur au centre : le joueur doit voir de l'entree que la salle
      // n'est pas ordinaire.
      poserSol(o.x + Math.floor(L / 2), o.y + Math.floor(H / 2), tuileMarque)
    }
  }

  // Les portes, une fois toutes les salles posees : percer en meme temps
  // qu'on batit reboucherait la moitie des ouvertures.
  for (const s of plan.salles) {
    const o = coinDe(s)
    for (let d = 0; d < DIRECTIONS.length; d++) {
      const v = s.voisines[d]
      if (!v) continue
      const dir = DIRECTIONS[d]
      if (dir.dx !== 0) {
        // Porte est ou ouest : on perce LES DEUX murs mitoyens.
        const xInterieur = dir.dx > 0 ? o.x + L - 1 : o.x
        const xVoisin = xInterieur + dir.dx
        const y0 = o.y + Math.floor((H - PORTE_HAUTEUR) / 2)
        for (let k = 0; k < PORTE_HAUTEUR; k++) {
          poserSol(xInterieur, y0 + k)
          poserSol(xVoisin, y0 + k)
        }
      } else {
        const yInterieur = dir.dy > 0 ? o.y + H - 1 : o.y
        const yVoisin = yInterieur + dir.dy
        const x0 = o.x + Math.floor((L - PORTE_LARGEUR) / 2)
        for (let k = 0; k < PORTE_LARGEUR; k++) {
          poserSol(x0 + k, yInterieur)
          poserSol(x0 + k, yVoisin)
        }
      }
    }
  }

  /*
   * Les obstacles.
   *
   * Ils viennent apres les portes, et ils EVITENT deux bandes : celle des
   * portes horizontales et celle des portes verticales. Ces deux bandes
   * forment une croix libre au milieu de chaque salle, et cette croix relie a
   * elle seule les quatre portes possibles. C'est la garantie qu'aucun tirage,
   * si malheureux soit-il, ne peut condamner une salle.
   *
   * L'alternative — poser au hasard, puis verifier, puis recommencer — est
   * seduisante et mauvaise : elle rend le temps de generation imprevisible, et
   * elle ne garantit rien tant qu'on n'a pas borne le nombre d'essais. Une
   * regle qui rend la faute IMPOSSIBLE vaut mieux qu'une regle qui la rattrape.
   */
  const h = new Hasard((plan.graine ^ 0x5f3a) >>> 0)
  const bandeY0 = Math.floor((H - PORTE_HAUTEUR) / 2)
  const bandeX0 = Math.floor((L - PORTE_LARGEUR) / 2)
  const libre = (lx: number, ly: number): boolean => {
    if (lx < 1 || ly < 1 || lx >= L - 1 || ly >= H - 1) return false
    if (ly >= bandeY0 && ly < bandeY0 + PORTE_HAUTEUR) return false
    if (lx >= bandeX0 && lx < bandeX0 + PORTE_LARGEUR) return false
    return true
  }
  for (const s of plan.salles) {
    if (s.role === 'depart') continue
    const o = coinDe(s)
    const combien = s.role === 'boss' ? 5 : 2 + h.entier(4)
    for (let n = 0; n < combien; n++) {
      // Des amas plutot que des cases isolees : un pilier isole se lit comme
      // une faute d'affichage, un bloc de deux sur deux se lit comme du decor.
      const l = 1 + h.entier(2)
      const ht = 1 + h.entier(2)
      const lx = 1 + h.entier(L - 2)
      const ly = 1 + h.entier(H - 2)
      let possible = true
      for (let dy = 0; dy < ht && possible; dy++) {
        for (let dx = 0; dx < l; dx++) {
          if (!libre(lx + dx, ly + dy)) { possible = false; break }
          if (sol.cases[carte.index(o.x + lx + dx, o.y + ly + dy)] === tuileMarque) {
            possible = false
            break
          }
        }
      }
      if (!possible) continue
      for (let dy = 0; dy < ht; dy++) {
        for (let dx = 0; dx < l; dx++) {
          const i = carte.index(o.x + lx + dx, o.y + ly + dy)
          carte.solides[i] = 1
          if (mur.presence) mur.presence[i] = 1
        }
      }
    }
  }

  carte.rafraichirTout(mur)
  for (let i = 0; i < mur.cases.length; i++) if (!mur.presence?.[i]) mur.cases[i] = VIDE

  const oDepart = coinDe(plan.depart)
  const depart = {
    x: (oDepart.x + Math.floor(L / 2)) * tuile + tuile / 2,
    y: (oDepart.y + Math.floor(H / 2)) * tuile + tuile,
  }

  const salleEn = (x: number, y: number): SallePlan | null => {
    const cx = Math.floor(x / (L * tuile))
    const cy = Math.floor(y / (H * tuile))
    return plan.salles.find((s) => s.cx === cx && s.cy === cy) ?? null
  }

  return { carte, plan, largeurSalle: L, hauteurSalle: H, depart, salleEn, coinDe }
}
