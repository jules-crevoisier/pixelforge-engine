import { type Point, arrondiPair } from './pixel.ts'

/**
 * Les projections : comment une case de la carte devient une position a
 * l'ecran, et l'inverse.
 *
 * ## Pourquoi c'est un concept de premier ordre et non une option
 *
 * Un moteur qui traite l'isometrique comme « une carte orthogonale avec des
 * images en losange » se casse a la premiere question serieuse : quelle case
 * est sous la souris, dans quel ordre dessiner deux objets qui se croisent,
 * ou poser une ombre. Ces trois reponses changent completement selon la
 * projection, et elles doivent venir du meme endroit — sinon l'editeur pointe
 * une case et le jeu en dessine une autre.
 *
 * On declare donc la projection une fois, et tout le reste — le rendu, la
 * selection, le tri en profondeur, la camera — la consulte.
 *
 * ## Les quatre modes
 *
 * **Orthogonale** : la grille classique. Vue de dessus a la Zelda, ou vue de
 * cote a la Mario. La difference entre les deux n'est pas geometrique, elle
 * est dans le TRI et la GRAVITE — d'ou `Regard`, plus bas.
 *
 * **Isometrique** : le losange 2:1, celui de tous les jeux isometriques en
 * pixel art. Le rapport deux pour un n'est pas un choix esthetique : c'est le
 * seul qui fasse tomber les diagonales sur des pixels entiers, donc le seul
 * qui ne crenele pas.
 *
 * **Isometrique decalee** (« staggered ») : des losanges ranges en lignes
 * decalees. Plus compacte a stocker, et c'est ce que Tiled emploie par
 * defaut ; on la lit donc si on veut importer ses cartes.
 *
 * **Hexagonale** : pour la strategie au tour par tour. Les hexagones pointe en
 * haut, decales en colonnes.
 */
export type ModeProjection = 'orthogonale' | 'isometrique' | 'iso-decalee' | 'hexagonale'

/**
 * Ce que la camera regarde, ce qui n'est PAS la projection.
 *
 * Deux jeux peuvent partager la meme grille orthogonale et n'avoir rien de
 * commun : dans l'un la gravite tire vers le bas et l'on trie par calque, dans
 * l'autre il n'y a pas de gravite et l'on trie par `y` — ce qui est plus bas a
 * l'ecran est plus pres. Confondre les deux notions, c'est se retrouver avec
 * un personnage dessine derriere le tonneau qu'il cache.
 */
export type Regard = 'dessus' | 'cote'

export interface Projection {
  mode: ModeProjection
  regard: Regard
  /** Largeur d'une case, en pixels. */
  largeurTuile: number
  /** Hauteur d'une case. En isometrique, la moitie de la largeur. */
  hauteurTuile: number
  /** Hauteur d'un bloc dessine au-dessus de sa case, pour un mur isometrique. */
  hauteurBloc: number
}

export const ORTHO_DESSUS = (t = 16): Projection =>
  ({ mode: 'orthogonale', regard: 'dessus', largeurTuile: t, hauteurTuile: t, hauteurBloc: 0 })

export const ORTHO_COTE = (t = 16): Projection =>
  ({ mode: 'orthogonale', regard: 'cote', largeurTuile: t, hauteurTuile: t, hauteurBloc: 0 })

/**
 * Le losange 2:1.
 *
 * `largeur` doit etre paire, et la hauteur en est la moitie. Une largeur
 * impaire donne un losange dont le centre tombe entre deux pixels, et toutes
 * les diagonales se mettent a baver.
 */
export const ISO = (largeur = 32, hauteurBloc = 16): Projection => ({
  mode: 'isometrique', regard: 'dessus',
  largeurTuile: largeur - (largeur % 2),
  hauteurTuile: (largeur - (largeur % 2)) / 2,
  hauteurBloc,
})

export const ISO_DECALEE = (largeur = 32, hauteurBloc = 16): Projection => ({
  ...ISO(largeur, hauteurBloc), mode: 'iso-decalee',
})

export const HEXA = (largeur = 32, hauteur = 28): Projection =>
  ({ mode: 'hexagonale', regard: 'dessus', largeurTuile: largeur, hauteurTuile: hauteur, hauteurBloc: 0 })

/**
 * Case -> position du COIN HAUT-GAUCHE de son dessin, en pixels du monde.
 *
 * On rend le coin et non le centre : c'est ce que `drawImage` attend, et
 * convertir a chaque appel de rendu ferait passer un arrondi de plus dans la
 * boucle la plus chaude du moteur.
 */
export function caseVersMonde(p: Projection, cx: number, cy: number): Point {
  const l = p.largeurTuile
  const h = p.hauteurTuile
  switch (p.mode) {
    case 'orthogonale':
      return { x: cx * l, y: cy * h }
    case 'isometrique':
      // La transformation isometrique donne le SOMMET du losange ; on rend le
      // coin de sa boite, qui est une demi-largeur a gauche. Cette demie a
      // coute cent quarante-quatre cases sur cent quarante-quatre au banc :
      // l'inverse travaille dans le repere du sommet, et rendre le sommet ici
      // faisait pointer l'editeur sur une case pendant que le jeu en
      // dessinait une autre.
      return { x: (cx - cy) * (l / 2) - l / 2, y: (cx + cy) * (h / 2) }
    case 'iso-decalee':
      return { x: cx * l + (cy % 2 ? l / 2 : 0), y: cy * (h / 2) }
    case 'hexagonale':
      // Hexagones pointe en haut, colonnes decalees d'un demi-pas vertical.
      return { x: cx * Math.floor(l * 0.75), y: cy * h + (cx % 2 ? Math.floor(h / 2) : 0) }
  }
}

/**
 * Position du monde -> case.
 *
 * C'est la fonction qui decide ce qui se passe quand on clique, et c'est celle
 * qu'on rate le plus souvent. En isometrique, la naive — inverser la matrice —
 * donne la bonne case au centre du losange et la mauvaise pres des bords, la
 * ou l'on clique justement quand on vise une case voisine.
 */
export function mondeVersCase(p: Projection, x: number, y: number): Point {
  const l = p.largeurTuile
  const h = p.hauteurTuile
  switch (p.mode) {
    case 'orthogonale':
      return { x: Math.floor(x / l), y: Math.floor(y / h) }
    case 'isometrique': {
      // Inversion exacte du systeme : x = (cx-cy)*l/2, y = (cx+cy)*h/2.
      const a = x / (l / 2)
      const b = y / (h / 2)
      return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) }
    }
    case 'iso-decalee': {
      // Une carte decalee ne s'inverse pas par une division : les losanges de
      // deux rangees voisines se CHEVAUCHENT sur une demi-hauteur, donc un
      // point de la bande appartient a l'une ou a l'autre selon de quel cote
      // de l'arete il tombe. On teste donc les trois rangees candidates avec
      // la vraie distance en losange — |dx| + |dy| <= 1 une fois ramenes aux
      // demi-axes. Diviser donnait la rangee du dessous a tout coup.
      const approx = Math.floor(y / (h / 2))
      for (const cy of [approx, approx - 1, approx + 1]) {
        const decale = (((cy % 2) + 2) % 2) ? l / 2 : 0
        const cx = Math.round((x - decale - l / 2) / l)
        const bx = cx * l + decale
        const by = cy * (h / 2)
        const dx = (x - (bx + l / 2)) / (l / 2)
        const dy = (y - (by + h / 2)) / (h / 2)
        if (Math.abs(dx) + Math.abs(dy) <= 1) return { x: cx, y: cy }
      }
      return { x: Math.round((x - l / 2) / l), y: approx }
    }
    case 'hexagonale': {
      const pas = Math.floor(l * 0.75)
      const cx = Math.floor(x / pas)
      const decale = cx % 2 ? Math.floor(h / 2) : 0
      return { x: cx, y: Math.floor((y - decale) / h) }
    }
  }
}

/**
 * Clef de tri en profondeur.
 *
 * C'est la reponse a « qui passe devant qui », et elle depend entierement du
 * regard :
 *
 * - vu de COTE, la profondeur n'existe pas a l'ecran. Seul le calque tranche,
 *   et deux objets du meme calque se dessinent dans l'ordre de la scene.
 * - vu de DESSUS, ce qui est plus bas est plus pres. En orthogonale c'est `y`,
 *   en isometrique c'est `cx + cy` — la somme, parce que les deux axes
 *   s'eloignent tous les deux de la camera.
 * - la hauteur `z` passe toujours devant, quel que soit le mode : un objet
 *   pose sur une table cache la table.
 */
export function profondeur(p: Projection, x: number, y: number, z = 0, couche = 0): number {
  if (p.regard === 'cote') return couche * 1e6 + z
  if (p.mode === 'isometrique' || p.mode === 'iso-decalee') {
    const c = mondeVersCase(p, x, y)
    return couche * 1e6 + (c.x + c.y) * 1000 + y - z
  }
  return couche * 1e6 + y * 1000 - z
}

/**
 * Les quatre coins du losange d'une case, pour dessiner une selection.
 *
 * Un rectangle de selection sur une carte isometrique est le signe le plus sur
 * qu'un editeur a ete adapte au lieu d'etre concu pour.
 */
export function contourDeCase(p: Projection, cx: number, cy: number): Point[] {
  const o = caseVersMonde(p, cx, cy)
  const l = p.largeurTuile
  const h = p.hauteurTuile
  if (p.mode === 'orthogonale') {
    return [o, { x: o.x + l, y: o.y }, { x: o.x + l, y: o.y + h }, { x: o.x, y: o.y + h }]
  }
  if (p.mode === 'hexagonale') {
    const q = Math.floor(l / 4)
    return [
      { x: o.x + q, y: o.y }, { x: o.x + l - q, y: o.y },
      { x: o.x + l, y: o.y + Math.floor(h / 2) },
      { x: o.x + l - q, y: o.y + h }, { x: o.x + q, y: o.y + h },
      { x: o.x, y: o.y + Math.floor(h / 2) },
    ]
  }
  // Losange : sommet en haut, puis dans le sens horaire.
  return [
    { x: o.x + l / 2, y: o.y },
    { x: o.x + l, y: o.y + h / 2 },
    { x: o.x + l / 2, y: o.y + h },
    { x: o.x, y: o.y + h / 2 },
  ]
}

/**
 * Taille du monde, en pixels, pour une carte de cette taille.
 *
 * Sert a borner la camera. En isometrique, la carte occupe un losange plus
 * large que haut, et calculer sa boite avec la formule orthogonale laisse voir
 * le vide sur deux cotes.
 */
export function tailleMonde(p: Projection, largeur: number, hauteur: number): { l: number; h: number } {
  const lt = p.largeurTuile
  const ht = p.hauteurTuile
  switch (p.mode) {
    case 'orthogonale': return { l: largeur * lt, h: hauteur * ht }
    case 'isometrique': return { l: (largeur + hauteur) * (lt / 2), h: (largeur + hauteur) * (ht / 2) + p.hauteurBloc }
    case 'iso-decalee': return { l: largeur * lt + lt / 2, h: hauteur * (ht / 2) + ht }
    case 'hexagonale': return { l: largeur * Math.floor(lt * 0.75) + Math.floor(lt / 4), h: hauteur * ht + Math.floor(ht / 2) }
  }
}

/** L'arrondi symetrique, reexporte : le rendu isometrique en a besoin. */
export { arrondiPair }

/**
 * Un point CONTINU du monde orthogonal -> sa position a l'ecran.
 *
 * ## Pourquoi les entites vivent en coordonnees orthogonales
 *
 * Une carte isometrique n'est pas une autre geometrie : c'est la meme grille
 * carree, regardee de biais. Faire vivre le gameplay dans le losange
 * obligerait a reecrire les collisions, la poursuite, la distance — et a les
 * reecrire une deuxieme fois pour l'hexagone. On garde donc UNE seule verite,
 * la grille carree, et la projection n'intervient qu'au dessin et au clic.
 *
 * C'est ce qui permet au meme heros, au meme controleur et au meme moteur de
 * collision de servir en vue de dessus, en vue de cote et en isometrique sans
 * une ligne de difference.
 *
 * `tuileSource` est la taille de la case dans ce monde orthogonal ; le
 * resultat est en pixels de l'ecran de jeu.
 */
export function projeter(p: Projection, x: number, y: number, tuileSource: number): Point {
  const cx = x / tuileSource
  const cy = y / tuileSource
  switch (p.mode) {
    case 'orthogonale':
      return { x: cx * p.largeurTuile, y: cy * p.hauteurTuile }
    case 'isometrique':
      return { x: (cx - cy) * (p.largeurTuile / 2), y: (cx + cy) * (p.hauteurTuile / 2) }
    case 'iso-decalee':
      // Les rangees decalees n'ont de sens qu'aux entiers : entre deux
      // rangees, le decalage saute d'une demi-largeur. On projette donc le
      // point comme s'il etait isometrique, ce qui est la meme geometrie a la
      // rangee pres — et l'on ne s'en sert que pour placer une entite, jamais
      // pour poser une tuile.
      return { x: (cx - cy) * (p.largeurTuile / 2), y: (cx + cy) * (p.hauteurTuile / 2) }
    case 'hexagonale':
      return { x: cx * Math.floor(p.largeurTuile * 0.75), y: cy * p.hauteurTuile }
  }
}

/** L'inverse exact de `projeter`, pour retrouver ou l'on a clique. */
export function deprojeter(p: Projection, ex: number, ey: number, tuileSource: number): Point {
  switch (p.mode) {
    case 'orthogonale':
      return { x: (ex / p.largeurTuile) * tuileSource, y: (ey / p.hauteurTuile) * tuileSource }
    case 'isometrique':
    case 'iso-decalee': {
      const a = ex / (p.largeurTuile / 2)
      const b = ey / (p.hauteurTuile / 2)
      return { x: ((a + b) / 2) * tuileSource, y: ((b - a) / 2) * tuileSource }
    }
    case 'hexagonale':
      return { x: (ex / Math.floor(p.largeurTuile * 0.75)) * tuileSource, y: (ey / p.hauteurTuile) * tuileSource }
  }
}

/**
 * Les cases susceptibles d'etre visibles dans un cadre de l'ecran.
 *
 * ## Pourquoi ce n'est pas une simple division
 *
 * En orthogonale, le rectangle de l'ecran est un rectangle de cases : deux
 * divisions suffisent. En isometrique il devient un LOSANGE de cases, dont la
 * boite englobante se calcule en deprojetant les QUATRE coins de l'ecran — un
 * seul coin donnerait une bande qui laisse le decor apparaitre par morceaux
 * quand on longe une diagonale.
 *
 * On rend une boite, pas la forme exacte : quelques cases de trop coutent
 * moins qu'un test par case, et la marge absorbe la hauteur des blocs qui
 * depassent au-dessus de leur propre case.
 */
export function casesVisibles(
  p: Projection, camX: number, camY: number,
  vue: { largeur: number; hauteur: number },
  carte: { largeur: number; hauteur: number },
  marge = 2,
): { x0: number; y0: number; x1: number; y1: number } {
  const coins = [
    [camX, camY], [camX + vue.largeur, camY],
    [camX, camY + vue.hauteur], [camX + vue.largeur, camY + vue.hauteur],
  ]
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [ex, ey] of coins) {
    const c = mondeVersCase(p, ex, ey)
    if (c.x < x0) x0 = c.x
    if (c.y < y0) y0 = c.y
    if (c.x > x1) x1 = c.x
    if (c.y > y1) y1 = c.y
  }
  // La marge du haut est plus large : un bloc dessine au-dessus de sa case
  // deborde vers le haut, donc une case hors cadre par le bas de l'ecran peut
  // encore montrer son sommet.
  const hautSupplement = p.hauteurTuile > 0 ? Math.ceil(p.hauteurBloc / p.hauteurTuile) : 0
  return {
    x0: Math.max(0, x0 - marge),
    y0: Math.max(0, y0 - marge),
    x1: Math.min(carte.largeur - 1, x1 + marge + hautSupplement),
    y1: Math.min(carte.hauteur - 1, y1 + marge + hautSupplement),
  }
}

/**
 * Clef de tri pour une entite reperee dans le monde ORTHOGONAL.
 *
 * `profondeur` travaille dans le repere de l'ecran, ce qui convient au moteur
 * de rendu qui recoit deja des pixels projetes. Les entites, elles, vivent en
 * coordonnees orthogonales — voir `projeter` — et les reprojeter juste pour
 * les trier ferait passer une division et un arrondi de plus par sprite et par
 * image. La regle est la meme, exprimee dans le bon repere :
 *
 * - de COTE, seul le calque tranche ;
 * - de DESSUS en orthogonale, ce qui est plus BAS est plus pres, donc `y` ;
 * - en isometrique, les deux axes s'eloignent de la camera, donc `x + y`.
 */
export function profondeurMonde(
  p: Projection, x: number, y: number, z = 0, couche = 0,
): number {
  if (p.regard === 'cote') return couche * 1e6 + z
  if (p.mode === 'isometrique' || p.mode === 'iso-decalee') return couche * 1e6 + (x + y) - z
  return couche * 1e6 + y - z
}

/**
 * La boite du monde a l'ecran : son coin, et sa taille.
 *
 * `tailleMonde` donne l'etendue, ce qui suffit tant que le monde commence a
 * l'origine. Une carte isometrique, elle, commence a GAUCHE de l'origine : la
 * case (0, hauteur-1) est le point le plus a gauche de tout le losange. Borner
 * la camera a partir de zero laisserait voir le vide sur tout le flanc gauche
 * et interdirait d'atteindre le flanc droit.
 */
export function boiteMonde(
  p: Projection, largeur: number, hauteur: number,
): { x: number; y: number; l: number; h: number } {
  const t = tailleMonde(p, largeur, hauteur)
  switch (p.mode) {
    case 'isometrique':
      return { x: -hauteur * (p.largeurTuile / 2), y: -p.hauteurBloc, l: t.l, h: t.h }
    case 'iso-decalee':
      return { x: 0, y: -p.hauteurBloc, l: t.l, h: t.h }
    default:
      return { x: 0, y: 0, l: t.l, h: t.h }
  }
}
