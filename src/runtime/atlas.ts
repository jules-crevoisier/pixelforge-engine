import { type Palette, versHex } from '../noyau/palette.ts'

/**
 * Les dessins, tels que le moteur les tient en memoire.
 *
 * Un atlas est une planche : un canevas unique ou toutes les tuiles d'un
 * tileset, ou toutes les images d'une animation, sont rangees cote a cote. On
 * n'en dessine qu'un morceau a la fois avec `drawImage`.
 *
 * ## Pourquoi une planche et non un canevas par image
 *
 * Changer de source entre deux `drawImage` coute cher — le navigateur doit
 * reteleverser la texture. Sur une carte de mille tuiles, c'est mille
 * changements par image au lieu d'un. La planche fait de tout le decor un seul
 * appel de texture.
 */
export interface Atlas {
  canevas: HTMLCanvasElement | OffscreenCanvas
  /** Largeur d'une case de la planche. */
  largeur: number
  /**
   * Hauteur d'une case. Elle differe de la largeur des qu'on sort de
   * l'orthogonale : une dalle isometrique fait 32x16, et un bloc 32x32 dont
   * seize pixels debordent au-dessus de sa case. Une planche forcee au carre
   * obligerait a decouper ces dessins en deux, ou a les rogner.
   */
  hauteur: number
  /** Nombre de cases par rangee. */
  colonnes: number
}

export function rectDeTuile(a: Atlas, index: number): { sx: number; sy: number } {
  return {
    sx: (index % a.colonnes) * a.largeur,
    sy: Math.floor(index / a.colonnes) * a.hauteur,
  }
}

/**
 * Construit un atlas a partir de dessins en lettres.
 *
 * Le format est celui de l'editeur de sprites : une lettre par couleur, le
 * point pour le vide. C'est lisible dans un diff, ca se relit six mois plus
 * tard, et surtout ca ne demande aucun fichier binaire pour qu'une
 * demonstration existe.
 */
export function atlasDepuisLettres(
  dessins: string[][], cle: Record<string, string>, largeur: number, colonnes = 8,
  hauteur = largeur,
): Atlas {
  const lignes = Math.ceil(dessins.length / colonnes)
  const c = document.createElement('canvas')
  c.width = colonnes * largeur
  c.height = Math.max(1, lignes) * hauteur
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canevas 2D indisponible')
  ctx.imageSmoothingEnabled = false

  dessins.forEach((dessin, i) => {
    const ox = (i % colonnes) * largeur
    const oy = Math.floor(i / colonnes) * hauteur
    for (let y = 0; y < dessin.length; y++) {
      const ligne = dessin[y]
      for (let x = 0; x < ligne.length; x++) {
        const hex = cle[ligne[x]]
        if (!hex) continue
        ctx.fillStyle = hex
        ctx.fillRect(ox + x, oy + y, 1, 1)
      }
    }
  })

  return { canevas: c, largeur, hauteur, colonnes }
}

/**
 * Les couleurs employees par une cle de dessin, pour alimenter la palette du
 * projet. Sans cela il faudrait declarer deux fois les memes teintes, et les
 * deux listes divergeraient au premier changement.
 */
export function couleursDe(cle: Record<string, string>): string[] {
  return [...new Set(Object.values(cle))]
}

/** Les couleurs d'une palette, en hexadecimal, pour un panneau. */
export function hexDe(p: Palette): string[] {
  return p.couleurs.map(versHex)
}
