import { Carte, VIDE } from '../tuiles/tilemap.ts'
import { TUILE, TUILE_SOL, TUILE_SORTIE } from './art.ts'
import { creerNoeud, type Noeud, type NoeudSprite, type NoeudCorps } from '../scene/noeud.ts'

/**
 * La salle de demonstration.
 *
 * Elle est ecrite en texte, comme les dessins : `#` un mur, `.` du sol, `S` la
 * sortie, `@` le depart du heros. Une carte qu'on lit dans le source est une
 * carte qu'on corrige sans lancer l'editeur, et le diff dit ce qui a bouge.
 */
const PLAN = [
  '####################',
  '#..................#',
  '#..####....####....#',
  '#..#..........#....#',
  '#..#..####....#....#',
  '#.....#..#.........#',
  '#..@..#..#....##...#',
  '#.....#..#....##...#',
  '#..####..######....#',
  '#..................#',
  '#....####....####..#',
  '#.......#....#.....#',
  '#.......#....#..S..#',
  '#..................#',
  '####################',
]

export interface Donjon {
  carte: Carte
  racine: Noeud
  heros: NoeudSprite
  corps: NoeudCorps
  depart: { x: number; y: number }
}

export function construireDonjon(): Donjon {
  const largeur = PLAN[0].length
  const hauteur = PLAN.length
  const carte = new Carte(largeur, hauteur, TUILE)

  // Le sol d'abord, sous tout le reste. Il n'est pas un terrain : il n'a pas
  // de voisinage a consulter, chaque case porte la meme dalle.
  const sol = carte.ajouterCalque('sol')
  const mur = carte.ajouterCalque('mur', {
    terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: true },
  })

  let depart = { x: TUILE, y: TUILE }
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const c = PLAN[y][x]
      const i = carte.index(x, y)
      sol.cases[i] = c === 'S' ? TUILE_SORTIE : TUILE_SOL
      if (c === '#') {
        if (mur.presence) mur.presence[i] = 1
        carte.solides[i] = 1
      } else {
        sol.cases[i] = c === 'S' ? TUILE_SORTIE : TUILE_SOL
      }
      if (c === '@') depart = { x: x * TUILE + TUILE / 2, y: y * TUILE + TUILE }
    }
  }
  // Le terrain se calcule une fois, a la construction : c'est le seul moment
  // ou tout recalculer est le bon choix.
  carte.rafraichirTout(mur)
  for (let i = 0; i < mur.cases.length; i++) if (!mur.presence?.[i]) mur.cases[i] = VIDE

  const racine = creerNoeud('noeud', 'salle')
  const noeudCarte = creerNoeud('carte', 'decor') as Noeud & { source: string }
  noeudCarte.source = 'salle'
  racine.enfants.push(noeudCarte)

  const heros = creerNoeud('sprite', 'heros') as NoeudSprite
  heros.source = 'heros'
  // L'ancre est aux pieds, au milieu : c'est le point qui touche le sol, donc
  // celui qui doit correspondre a la position. Ancrer en haut a gauche
  // obligerait chaque calcul de gameplay a compenser la taille du dessin.
  heros.ancreX = TUILE / 2
  heros.ancreY = TUILE
  heros.x = depart.x
  heros.y = depart.y

  const corps = creerNoeud('corps', 'corps') as NoeudCorps
  // La boite est plus etroite que le dessin, et ne couvre que les jambes : un
  // personnage vu de dessus passe dans un couloir large comme ses pieds, pas
  // comme ses epaules. C'est ce qui fait qu'on ne « raccroche » pas aux coins.
  corps.boiteX = -4
  corps.boiteY = -6
  corps.boiteL = 8
  corps.boiteH = 6
  heros.enfants.push(corps)
  racine.enfants.push(heros)

  return { carte, racine, heros, corps, depart }
}

export const PLAN_DEMO = PLAN
