/**
 * L'eclairage, fidele a la palette.
 *
 * ## Ce que « fidele a la palette » veut dire, et pourquoi c'est LA regle
 *
 * Assombrir en multipliant les canaux — ce que fait tout moteur generaliste —
 * fabrique des couleurs qui ne sont dans la palette de personne : un damier de
 * trois teintes devient un degrade de milliers, et le jeu cesse d'etre du
 * pixel art a la premiere torche. Ici, chaque pixel eclaire est REMPLACE par
 * une couleur de la palette du projet : celle qui ressemble le plus a sa
 * version assombrie. La nuit d'un projet est donc faite des couleurs que son
 * artiste a choisies — et si la palette n'a pas de tons sombres, la nuit le
 * DIT en restant claire, au lieu d'inventer des tons a sa place.
 *
 * ## Pourquoi des NIVEAUX et un tramage, pas un degrade
 *
 * La lumiere est quantifiee en quelques niveaux, et la frontiere entre deux
 * niveaux est tramee en damier 2x2 — la technique de tous les jeux de
 * l'epoque, parce qu'un degrade continu n'existe pas dans une palette. Le
 * tramage est ORDONNE (matrice de Bayer), donc deterministe : deux machines
 * qui rendent la meme scene rendent les memes pixels, et un enregistrement
 * d'ecran se compresse au lieu de fourmiller.
 *
 * ## Ou vit le cout, et pourquoi il est mesure
 *
 * Tout se paie dans `appliquer` : une passe sur le tampon de 320x180. Le banc
 * de charge la chronometre — une promesse de prix qui n'est pas mesuree est
 * un mensonge qui attend son heure. Et quand l'ambiante vaut un et qu'aucune
 * source n'existe, on ne touche PAS aux pixels : un monde sans nuit ne paie
 * rien.
 */

export interface SourceLumiere {
  /** Centre, en pixels du monde. */
  x: number
  y: number
  /** Rayon de pleine lumiere ; la lumiere s'eteint a deux rayons. */
  rayon: number
}

export interface ReglagesLumiere {
  /** Lumiere ambiante, de 0 (nuit noire) a 1 (plein jour). */
  ambiante: number
  /** Nombre de niveaux de lumiere, tramage non compris. */
  niveaux: number
}

/** La matrice de Bayer 2x2, en fractions de niveau. */
const BAYER: number[] = [0.25, 0.75, 1.0, 0.5]

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * La table qui rend l'assombrissement fidele a la palette.
 *
 * Pour chaque couleur de la palette et chaque niveau, on precalcule LA
 * couleur de la palette la plus proche de sa version assombrie. Le tampon ne
 * contient que des couleurs de palette — c'est le contrat du moteur — donc
 * une simple table indexee par couleur suffit, et la passe ne calcule rien.
 */
export class TableLumiere {
  /** rgb entasse -> index de palette. */
  private rang = new Map<number, number>()
  /** [niveau][index de palette] -> rgb entasse deja assombri. */
  private table: Uint32Array[] = []
  readonly niveaux: number

  constructor(couleurs: string[], niveaux = 4) {
    this.niveaux = Math.max(2, Math.round(niveaux))
    const rgb = couleurs.map((c) => {
      const n = parseInt(c.replace('#', ''), 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
    })
    rgb.forEach(([r, g, b], i) => {
      const cle = (r << 16) | (g << 8) | b
      // La PREMIERE occurrence gagne : deux ecritures de la meme couleur ne
      // doivent pas se disputer la table.
      if (!this.rang.has(cle)) this.rang.set(cle, i)
    })
    for (let n = 0; n < this.niveaux; n++) {
      // Le niveau zero n'est pas le noir absolu : un monde a peine visible
      // vaut mieux qu'un trou, et le noir pur ecraserait tout ce que la
      // palette a de sombre.
      const facteur = 0.12 + 0.88 * (n / (this.niveaux - 1))
      const ligne = new Uint32Array(rgb.length)
      rgb.forEach(([r, g, b], i) => {
        const vise = [r * facteur, g * facteur, b * facteur]
        let meilleur = 0
        let distance = Infinity
        rgb.forEach(([r2, g2, b2], j) => {
          const d = (r2 - vise[0]) ** 2 + (g2 - vise[1]) ** 2 + (b2 - vise[2]) ** 2
          if (d < distance) { distance = d; meilleur = j }
        })
        const [r3, g3, b3] = rgb[meilleur]
        ligne[i] = (r3 << 16) | (g3 << 8) | b3
      })
      this.table.push(ligne)
    }
  }

  /** La couleur assombrie d'un rgb entasse, ou lui-meme s'il est inconnu. */
  assombrir(rgb: number, niveau: number): number {
    const i = this.rang.get(rgb)
    if (i === undefined) return rgb
    const n = Math.max(0, Math.min(this.niveaux - 1, niveau))
    return this.table[n][i]
  }
}

/**
 * La lumiere en un point du monde, de 0 a 1, avant quantification.
 *
 * Pleine a moins d'un rayon, eteinte a deux rayons, lineaire entre les deux :
 * la chute quadratique physique est invisible en quatre niveaux, et la
 * lineaire se regle a l'oeil — c'est le rayon qu'on ajuste, pas une courbe.
 */
export function lumiereEn(
  x: number, y: number, sources: SourceLumiere[], ambiante: number,
): number {
  let l = clamp01(ambiante)
  for (const s of sources) {
    const d = Math.hypot(x - s.x, y - s.y)
    if (d < s.rayon) return 1
    if (d < s.rayon * 2) l = Math.max(l, 1 - (d - s.rayon) / s.rayon)
  }
  return l
}

export class Eclairage {
  ambiante = 1
  /** Ce qui fournit les sources, chaque image. Le monde le branche. */
  sources: (() => SourceLumiere[]) | null = null
  private table: TableLumiere
  /** Duree de la derniere passe, en millisecondes. Pour les bancs. */
  dernierCout = 0

  constructor(couleurs: string[], niveaux = 4) {
    this.table = new TableLumiere(couleurs, niveaux)
  }

  /** Vrai quand la passe ne changerait rien : elle ne se paie alors pas. */
  get inutile(): boolean {
    return this.ambiante >= 1
  }

  /**
   * Assombrit un tampon RGBA en place. `cameraX/Y` placent le tampon dans le
   * monde, la ou vivent les sources.
   */
  appliquer(
    pixels: Uint8ClampedArray, largeur: number, hauteur: number,
    cameraX: number, cameraY: number,
  ): void {
    if (this.inutile) { this.dernierCout = 0; return }
    const debut = performance.now()
    const sources = this.sources?.() ?? []
    const n = this.table.niveaux
    /*
     * La lumiere se calcule sur une grille de 4x4 pixels, pas par pixel :
     * une lampe de soixante pixels de rayon ne varie pas d'un pixel a
     * l'autre, et c'est ce qui divise le cout par seize. Le tramage, lui,
     * reste au pixel — c'est lui qui casse les marches entre cellules.
     */
    const pas = 4
    const gl = Math.ceil(largeur / pas) + 1
    const gh = Math.ceil(hauteur / pas) + 1
    const grille = new Float32Array(gl * gh)
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gl; gx++) {
        grille[gy * gl + gx] = lumiereEn(
          cameraX + gx * pas, cameraY + gy * pas, sources, this.ambiante)
      }
    }
    const vue = new Uint32Array(pixels.buffer, pixels.byteOffset, largeur * hauteur)
    for (let y = 0; y < hauteur; y++) {
      const gy = (y / pas) | 0
      const seuilLigne = (y & 1) << 1
      for (let x = 0; x < largeur; x++) {
        const l = grille[gy * gl + ((x / pas) | 0)]
        if (l >= 1) continue
        // La quantification tramee : le niveau fractionnaire est compare au
        // seuil de Bayer de CE pixel, et monte ou descend d'un cran.
        const brut = l * (n - 1)
        const bas = brut | 0
        const niveau = brut - bas >= BAYER[seuilLigne | (x & 1)] ? bas + 1 : bas
        if (niveau >= n - 1) continue
        const p = vue[y * largeur + x]
        // Le tampon est en ABGR petit-boutiste : on remet le rgb a l'endroit.
        const rgb = ((p & 255) << 16) | (p & 0xff00) | ((p >> 16) & 255)
        const sombre = this.table.assombrir(rgb, niveau)
        vue[y * largeur + x] = (p & 0xff000000)
          | ((sombre & 255) << 16) | (sombre & 0xff00) | ((sombre >> 16) & 255)
      }
    }
    this.dernierCout = performance.now() - debut
  }
}
