/**
 * Les dessins de la citadelle, en ISOMETRIQUE.
 *
 * ## Le losange 2:1, et pourquoi ses rangees vont de deux en deux
 *
 * Une dalle isometrique de 32 sur 16 se dessine en seize rangees dont la
 * largeur augmente de quatre a chaque fois : 2, 6, 10, ... 30, puis
 * redescend. Ce n'est pas une approximation d'une diagonale — c'est la seule
 * suite qui pave le plan sans trou ni recouvrement, parce que la rangee la
 * plus large d'une dalle vient se completer exactement avec la pointe des deux
 * dalles voisines. Toute autre pente laisse un liseré de fond visible entre
 * les dalles, et ce liseré scintille des que la camera bouge.
 *
 * ## Pourquoi le bloc fait deux fois la hauteur de sa case
 *
 * Un mur isometrique deborde AU-DESSUS de la case qu'il occupe : sa base est
 * le losange du sol, son sommet est seize pixels plus haut. La planche porte
 * donc des dessins de 32 sur 32 dont seuls les seize derniers rangs designent
 * la case ; le moteur de rendu remonte le dessin de la difference. Sans cela
 * il faudrait ranger les murs sur un calque separe et les decaler a la main,
 * ce qui revient a refaire la projection dans le decor.
 */
export const LARGEUR_ISO = 32
export const HAUTEUR_ISO = 16
/** Hauteur totale d'un dessin de la planche : la dalle plus le bloc. */
export const HAUTEUR_DESSIN_ISO = 32

/**
 * La cle de la citadelle.
 *
 * La pierre est GRISE et l'eau est BLEUE, et pas l'inverse d'un demi-ton :
 * une premiere version donnait aux deux des bleus voisins, et une mare au
 * milieu de la cour se lisait comme un dallage clair. Deux surfaces qui ne se
 * traversent pas de la meme facon doivent se distinguer d'un coup d'oeil,
 * meme reduites a un losange de trente-deux pixels.
 */
export const CLE_ISO: Record<string, string> = {
  o: '#0c0a14',
  p: '#8ea3b0',
  q: '#5d6f7c',
  r: '#3d4a54',
  a: '#1f5a80',
  A: '#3d8db8',
  m: '#8c8272',
  M: '#a89b86',
  n: '#6b6355',
  N: '#4e483d',
  y: '#f0c860',
  Y: '#fff0b0',
  v: '#2f6b4a',
}

/** Les rangees du losange : la moitie basse est le miroir de la haute. */
function spanDalle(y: number): { x0: number; x1: number } {
  const dy = y < HAUTEUR_ISO / 2 ? y : HAUTEUR_ISO - 1 - y
  return { x0: LARGEUR_ISO / 2 - 1 - 2 * dy, x1: LARGEUR_ISO / 2 + 2 * dy }
}

/** La premiere et la derniere rangee ou une colonne appartient au losange. */
function spanColonne(x: number): { y0: number; y1: number } {
  const d = Math.ceil(Math.max(LARGEUR_ISO / 2 - 1 - x, x - LARGEUR_ISO / 2) / 2)
  return { y0: d, y1: HAUTEUR_ISO - 1 - d }
}

const vide = (): string[][] =>
  Array.from({ length: HAUTEUR_DESSIN_ISO }, () => Array.from({ length: LARGEUR_ISO }, () => '.'))

/**
 * Une dalle de sol. Elle occupe les seize derniers rangs du dessin : le haut
 * reste transparent, puisqu'une dalle ne deborde pas au-dessus de sa case.
 */
function dalle(motif: (x: number, y: number) => string): string[] {
  const g = vide()
  for (let y = 0; y < HAUTEUR_ISO; y++) {
    const s = spanDalle(y)
    for (let x = s.x0; x <= s.x1; x++) {
      const bord = x === s.x0 || x === s.x1 || y === 0 || y === HAUTEUR_ISO - 1
      g[HAUTEUR_ISO + y][x] = bord ? 'o' : motif(x, y)
    }
  }
  return g.map((l) => l.join(''))
}

/**
 * Un bloc : la meme empreinte, mais monte de seize pixels.
 *
 * Trois faces, trois valeurs. La lumiere vient d'en haut a gauche, donc le
 * dessus est le plus clair, la face gauche moyenne, la face droite sombre.
 * Peindre les trois faces de la meme teinte est la faute qui fait qu'un
 * decor isometrique se lit comme un tapis au lieu d'un volume.
 */
function bloc(dessus: string, gauche: string, droite: string, liseré = 'o'): string[] {
  const g = vide()
  for (let x = 0; x < LARGEUR_ISO; x++) {
    const c = spanColonne(x)
    // Les flancs, de la premiere rangee du losange jusqu'a seize plus bas.
    for (let y = c.y0; y <= c.y1 + HAUTEUR_ISO; y++) {
      g[y][x] = x < LARGEUR_ISO / 2 ? gauche : droite
    }
    // Le bas des flancs suit le losange : c'est l'arete du sol.
    g[c.y1 + HAUTEUR_ISO][x] = liseré
    g[c.y0][x] = liseré
  }
  // Le dessus, par-dessus les flancs.
  for (let y = 0; y < HAUTEUR_ISO; y++) {
    const s = spanDalle(y)
    for (let x = s.x0; x <= s.x1; x++) {
      const bord = x === s.x0 || x === s.x1 || y === 0 || y === HAUTEUR_ISO - 1
      g[y][x] = bord ? liseré : dessus
    }
  }
  // L'arete verticale du milieu : elle separe les deux flancs et donne le
  // volume. Sans elle, un bloc vu de face ressemble a un rectangle plat.
  const milieu = spanColonne(LARGEUR_ISO / 2 - 1)
  for (let y = milieu.y1 + 1; y <= milieu.y1 + HAUTEUR_ISO; y++) {
    g[y][LARGEUR_ISO / 2 - 1] = liseré
    g[y][LARGEUR_ISO / 2] = liseré
  }
  return g.map((l) => l.join(''))
}

/** Le sol : des dalles de pierre, avec un joint plus sombre au centre. */
const SOL_ISO = dalle((x, y) => {
  const s = spanDalle(y)
  const centre = x > s.x0 + 3 && x < s.x1 - 3 && y > 2 && y < HAUTEUR_ISO - 3
  return centre ? 'M' : 'm'
})

/** Une dalle d'herbe, pour que la cour ne soit pas d'un seul ton. */
const HERBE_ISO = dalle((x, y) => (((x + y * 3) % 7 === 0) ? 'v' : ((x + y) % 5 === 0 ? 'n' : 'v')))

/** L'eau : un bleu franc, raye de reflets clairs. */
const EAU_ISO = dalle((x, y) => (((x + y * 2) % 9 < 2) ? 'A' : 'a'))

/** Le mur : un bloc de pierre grise. */
const MUR_ISO = bloc('p', 'q', 'r')

/** Une caisse : le meme volume, en bois. */
const CAISSE_ISO = bloc('M', 'm', 'N')

/** La sortie : un bloc marque d'or. On la voit de loin, c'est le but. */
const SORTIE_ISO = (() => {
  const g = bloc('Y', 'y', 'm').map((l) => l.split(''))
  // Une pointe claire au sommet : le repere que l'oeil cherche dans une cour.
  for (let y = 4; y < 12; y++) {
    const s = spanDalle(y)
    for (let x = s.x0 + 4; x <= s.x1 - 4; x++) g[y][x] = 'Y'
  }
  return g.map((l) => l.join(''))
})()

export const PLANCHE_ISO: string[][] = [SOL_ISO, HERBE_ISO, EAU_ISO, MUR_ISO, CAISSE_ISO, SORTIE_ISO]

export const ISO_SOL = 0
export const ISO_HERBE = 1
export const ISO_EAU = 2
export const ISO_MUR = 3
export const ISO_CAISSE = 4
export const ISO_SORTIE = 5
