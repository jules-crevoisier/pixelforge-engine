/**
 * Les creatures, les ramassages et le coup porte.
 *
 * ## Pourquoi ces dessins sont calcules
 *
 * Comme le cycle de marche : ce qu'on veut eprouver ici n'est pas le talent du
 * dessinateur, c'est que le systeme de combat, les planches et les index se
 * tiennent. Une gelee dessinee par une ellipse ecrasee prouve mieux qu'une
 * gelee dessinee a la main — si l'index d'une image glisse d'une case,
 * l'animation se disloque a l'ecran au lieu de passer inapercue derriere
 * quatre dessins qui se ressemblent.
 *
 * Un vrai projet remplacera ces planches par des dessins d'artiste. Rien dans
 * le moteur ne changera : une planche est une planche.
 */
import { TUILE } from './art.ts'

export const CLE_CREATURES: Record<string, string> = {
  o: '#12101c',
  v: '#3f9b52',
  V: '#68c46e',
  w: '#2a6b3c',
  b: '#4a3d6b',
  B: '#6b5a92',
  a: '#241f3a',
  r: '#c0334a',
  R: '#e8556a',
  y: '#f0c860',
  Y: '#fff0b0',
  s: '#e8ecf4',
  S: '#a8b4c8',
  n: '#8a7a5c',
  N: '#4e4638',
}

type Grille = string[][]
const vide = (): Grille =>
  Array.from({ length: TUILE }, () => Array.from({ length: TUILE }, () => '.'))
const enDessin = (g: Grille): string[] => g.map((l) => l.join(''))

/**
 * Une ellipse pleine, cernee d'un liseré.
 *
 * Le liseré n'est pas un contour dessine par-dessus : c'est le bord de
 * l'ellipse lui-meme. Poser un contour apres coup elargit la forme d'un pixel
 * de chaque cote, et deux creatures de meme taille finissent par ne plus
 * l'avoir.
 */
function ellipse(
  g: Grille, cx: number, cy: number, rx: number, ry: number,
  dedans: string, bord: string,
): void {
  for (let y = 0; y < TUILE; y++) {
    for (let x = 0; x < TUILE; x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      const d = dx * dx + dy * dy
      if (d > 1) continue
      // Le bord : ce qui est dans l'ellipse mais dont un voisin n'y est pas.
      const voisinDehors = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => {
        const ux = (x + ax + 0.5 - cx) / rx
        const uy = (y + ay + 0.5 - cy) / ry
        return ux * ux + uy * uy > 1
      })
      g[y][x] = voisinDehors ? bord : dedans
    }
  }
}

/**
 * La gelee : quatre temps d'ecrasement.
 *
 * Le VOLUME est conserve — quand elle s'aplatit, elle s'elargit. C'est la
 * regle de l'ecrasement-etirement, et c'est ce qui distingue une creature
 * vivante d'une image qu'on redimensionne : sans elle, la gelee a l'air de
 * s'eloigner de la camera au lieu de rebondir.
 */
function gelee(ecrasement: number): string[] {
  const g = vide()
  const base = 6.2
  const ry = base * (1 - ecrasement)
  const rx = (base * base) / ry
  const cy = TUILE - 1 - ry
  ellipse(g, TUILE / 2, cy, Math.min(rx, 7.4), ry, 'v', 'w')
  // Un reflet en haut a gauche : la lumiere vient de la, comme partout ici.
  for (let y = 0; y < TUILE; y++) {
    for (let x = 0; x < TUILE; x++) {
      if (g[y][x] !== 'v') continue
      if (x >= 4 && x <= 6 && y >= Math.floor(cy - ry) + 1 && y <= Math.floor(cy - ry) + 2) g[y][x] = 'V'
    }
  }
  // Les yeux, poses sur la ligne du milieu et non au sommet : une creature
  // dont les yeux montent avec le crane a l'air surprise en permanence.
  const yy = Math.round(cy)
  for (const xx of [5, 10]) {
    if (g[yy] && g[yy][xx] !== '.') g[yy][xx] = 'o'
    if (g[yy - 1] && g[yy - 1][xx] !== '.') g[yy - 1][xx] = 'o'
  }
  return enDessin(g)
}

/**
 * La chauve-souris : deux temps, ailes hautes et ailes basses.
 *
 * Dessinee a la main, celle-la. Une aile est une forme qu'aucune ellipse ne
 * donne, et l'avoir engendree produisait une tache dont on ne lisait meme pas
 * qu'elle volait. Calculer un dessin n'est utile que tant que le calcul dit
 * quelque chose de la forme.
 */
const CHAUVE_HAUTE = [
  '................',
  '..b..........b..',
  '.bBb........bBb.',
  '.bBBb......bBBb.',
  '..bBBb....bBBb..',
  '...bBBb..bBBb...',
  '....bBBbbBBb....',
  '.....bBBBBb.....',
  '.....bByyBb.....',
  '.....bBBBBb.....',
  '......bBBb......',
  '.......bb.......',
  '................',
  '................',
  '................',
  '................',
]

const CHAUVE_BASSE = [
  '................',
  '................',
  '................',
  '.....bBBBBb.....',
  '.....bByyBb.....',
  '.....bBBBBb.....',
  '....bBBbbBBb....',
  '...bBBb..bBBb...',
  '..bBBb....bBBb..',
  '.bBBb......bBBb.',
  '.bBb........bBb.',
  '..b..........b..',
  '................',
  '................',
  '................',
  '................',
]

/** Un coeur : ce qu'on ramasse, et ce qu'on perd. */
const COEUR = [
  '................',
  '................',
  '................',
  '....oo....oo....',
  '...orro..orro...',
  '..orRRro.orRro..',
  '..orRRrrorrrro..',
  '..orrrrrrrrrro..',
  '...orrrrrrrro...',
  '....orrrrrro....',
  '.....orrrro.....',
  '......orro......',
  '.......oo.......',
  '................',
  '................',
  '................',
]

/** Un coeur vide : la meme silhouette, sans rien dedans. */
const COEUR_VIDE = COEUR.map((l) => l.replace(/[rR]/g, 'a'))

/**
 * La taillade : deux temps d'un arc.
 *
 * Elle n'est pas attachee au personnage — elle est posee dans le monde a
 * l'endroit ou la frappe a lieu. C'est le meme choix que pour la boite de
 * frappe, et pour la meme raison : un effet qui suit son auteur permet de
 * reculer en plein geste et de frapper quand meme devant soi.
 */
function taillade(avancement: number): string[] {
  const g = vide()
  const r = 6 + avancement * 3
  const clair = avancement < 0.5 ? 's' : 'S'
  const sombre = avancement < 0.5 ? 'S' : 'a'
  for (let a = -62; a <= 62; a += 2) {
    const rad = (a * Math.PI) / 180
    const x = Math.round(1 + Math.cos(rad) * r)
    const y = Math.round(TUILE / 2 + Math.sin(rad) * r)
    if (y < 0 || y >= TUILE) continue
    // Deux pixels d'epaisseur : un arc d'un seul pixel se lit comme une rayure
    // d'affichage a cette taille, pas comme un geste.
    for (const [dx, c] of [[-1, sombre], [0, clair], [1, clair], [2, sombre]]) {
      const xx = x + (dx as number)
      if (xx < 0 || xx >= TUILE) continue
      if (g[y][xx] === clair) continue
      g[y][xx] = c as string
    }
  }
  return enDessin(g)
}

/**
 * La balise de reprise : un fanion.
 *
 * Deux images, eteinte et allumee. Un point de reprise qui ne change pas
 * d'aspect quand on le touche laisse douter qu'il ait servi — et l'on
 * refait le passage par prudence.
 */
const fanion = (allume: boolean): string[] => {
  const g = vide()
  for (let y = 3; y < TUILE; y++) g[y][5] = 'o'
  for (let y = 4; y < TUILE - 1; y++) g[y][6] = allume ? 'n' : 'N'
  for (let y = 3; y <= 8; y++) {
    for (let x = 7; x <= 12 - Math.max(0, y - 6) * 2; x++) {
      g[y][x] = allume ? (x < 9 ? 'Y' : 'y') : 'N'
    }
    g[y][Math.max(7, 13 - Math.max(0, y - 6) * 2)] = 'o'
  }
  for (let x = 3; x < 9; x++) { g[TUILE - 1][x] = 'o'; g[TUILE - 2][x] = allume ? 'n' : 'N' }
  return enDessin(g)
}

const BALISE_ETEINTE = fanion(false)
const BALISE_ALLUMEE = fanion(true)

/**
 * La tourelle : trois temps, et c'est tout l'interet.
 *
 * Au repos elle est fermee. Elle s'OUVRE avant de tirer — c'est le temps
 * d'anticipation, celui qui rend le tir evitable. Puis elle tire, bouche
 * beante. Un ennemi qui frappe sans annoncer est un ennemi injuste : le joueur
 * n'apprend rien, il encaisse.
 */
function tourelle(ouverture: number): string[] {
  const g = vide()
  ellipse(g, TUILE / 2, 10, 6, 5.5, 'B', 'b')
  // Le socle, pour qu'elle ne flotte pas.
  for (let x = 4; x < 12; x++) { g[TUILE - 2][x] = 'b'; g[TUILE - 1][x] = 'o' }
  // La bouche s'elargit avec l'ouverture, et s'eclaire.
  const demi = Math.max(1, Math.round(ouverture * 3))
  for (let y = 10 - demi; y <= 10 + demi; y++) {
    for (let x = 8 - demi; x <= 8 + demi; x++) {
      if (y < 0 || y >= TUILE || x < 0 || x >= TUILE) continue
      if (g[y][x] === '.') continue
      g[y][x] = ouverture > 0.6 ? 'R' : (ouverture > 0.2 ? 'r' : 'a')
    }
  }
  return enDessin(g)
}

/** La larme : ce que la tourelle envoie. */
const LARME_DESSIN = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......oo.......',
  '......osso......',
  '.....ossSSo.....',
  '.....osSSSo.....',
  '......oSSo......',
  '.......oo.......',
  '................',
  '................',
  '................',
  '................',
]

/**
 * La plateforme mobile : une dalle epaisse, posee au BAS de la case.
 *
 * Le bas et non le centre : le noeud d'une entite est a ses pieds, et la boite
 * qui bloque doit coincider avec ce qu'on voit. Une dalle dessinee au milieu de
 * sa case donnerait un sol invisible six pixels plus haut — le pire defaut
 * possible pour une plateforme, parce qu'on l'accuse de sauter mal.
 */
const DALLE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  'oooooooooooooooo',
  'osSsSsSsSsSsSsSo',
  'oSsSsSsSsSsSsSso',
  'obbbbbbbbbbbbbbo',
  'oBbBbBbBbBbBbBbo',
  'oooooooooooooooo',
]

/**
 * La caisse : solide, immobile, et poussee par rien pour l'instant.
 *
 * Trois rangees de planches et deux cerclages. Le cerclage n'est pas
 * decoratif : c'est lui qui dit « ceci se cogne » plutot que « ceci se
 * ramasse ». Une caisse lisse se confond avec un ramassage a la premiere
 * lecture, et l'on saute dessus au lieu de la contourner.
 */
const CAISSE = [
  '................',
  '................',
  '..oooooooooooo..',
  '..onnnnnnnnnno..',
  '..oNNNNNNNNNNo..',
  '..onnnnnnnnnno..',
  '..oooooooooooo..',
  '..onnnnnnnnnno..',
  '..oNNNNNNNNNNo..',
  '..onnnnnnnnnno..',
  '..oooooooooooo..',
  '..onnnnnnnnnno..',
  '..oNNNNNNNNNNo..',
  '..onnnnnnnnnno..',
  '..oooooooooooo..',
  '................',
]

export const PLANCHE_CREATURES: string[][] = [
  gelee(0), gelee(0.22), gelee(0), gelee(-0.18),
  CHAUVE_HAUTE, CHAUVE_BASSE,
  COEUR, COEUR_VIDE,
  taillade(0), taillade(1),
  BALISE_ETEINTE, BALISE_ALLUMEE,
  tourelle(0), tourelle(0.5), tourelle(1),
  LARME_DESSIN,
  DALLE, CAISSE,
]

export const GELEE = [0, 1, 2, 3]
export const CHAUVE_SOURIS = [4, 5]
export const COEUR_PLEIN = 6
export const COEUR_PERDU = 7
export const TAILLADE = [8, 9]
export const BALISE = [10, 11]
export const TOURELLE_REPOS = 12
export const TOURELLE_ANTICIPE = 13
export const TOURELLE_TIRE = 14
export const LARME = 15
export const DALLE_MOBILE = 16
export const CAISSE_INDEX = 17
export const COLONNES_CREATURES = 6
