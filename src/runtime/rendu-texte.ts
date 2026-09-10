import type { Ecran } from './ecran.ts'
import {
  pixelsDe, largeurTexte, LARGEUR_GLYPHE, HAUTEUR_GLYPHE, CHASSE, INTERLIGNE,
} from './fonte.ts'
import type { Dialogue } from './dialogue.ts'
import type { Menu } from './menu.ts'

/**
 * Dessiner du texte, des boites, un dialogue, un menu.
 *
 * ## Pourquoi ce fichier est le seul a connaitre le canevas
 *
 * La fonte rend des points, le dialogue rend des lignes, le menu rend un
 * curseur : aucun des trois ne sait dessiner, et c'est ce qui permet de les
 * eprouver sans navigateur. Le prix a payer est ce fichier-ci, qui ne contient
 * AUCUNE decision — que des boucles. Une regle qui se glisserait ici serait
 * une regle qu'aucun banc ne verrait.
 *
 * ## Pourquoi on dessine dans le tampon virtuel
 *
 * Et non par-dessus le canevas visible. Dessiner a l'echelle finale
 * obligerait chaque lettre a se caler elle-meme sur la grille de l'ecran, et
 * le premier oubli ferait baver un contour. Dans le tampon, une unite EST un
 * pixel — la question ne se pose pas.
 */

export interface StyleTexte {
  couleur?: string
  /** Couleur de l'ombre portee. Absente : pas d'ombre. */
  ombre?: string
  /** Decalage de l'ombre. Un pixel en bas a droite, par defaut. */
  ombreX?: number
  ombreY?: number
}

/**
 * Ecrit un texte dans le tampon.
 *
 * L'ombre portee d'un pixel n'est pas une coquetterie : du texte clair sur un
 * fond clair devient illisible, et un jeu a des fonds de toutes les couleurs.
 * Un liseré sombre le rend lisible partout, ce que la seule couleur ne peut
 * pas garantir.
 */
export function ecrire(
  ecran: Ecran, texte: string, x: number, y: number, style: StyleTexte = {},
): void {
  const ctx = ecran.ctx
  const dx = style.ombreX ?? 1
  const dy = style.ombreY ?? 1
  if (style.ombre) {
    ctx.fillStyle = style.ombre
    for (const p of pixelsDe(texte, x + dx, y + dy)) ctx.fillRect(p.x, p.y, 1, 1)
  }
  ctx.fillStyle = style.couleur ?? '#ffffff'
  for (const p of pixelsDe(texte, x, y)) ctx.fillRect(p.x, p.y, 1, 1)
}

export interface StyleBoite {
  fond?: string
  bord?: string
  /** Marge interieure, en pixels. */
  marge?: number
}

/**
 * Une boite a bord d'un pixel.
 *
 * Le bord est dessine par deux rectangles pleins et non par un trait : un
 * trait de canevas est centre sur sa coordonnee, donc a cheval sur deux
 * pixels, donc gris des deux cotes. C'est la facon la plus courante de rater
 * une bordure en pixel art.
 */
export function boite(
  ecran: Ecran, x: number, y: number, l: number, h: number, style: StyleBoite = {},
): void {
  const ctx = ecran.ctx
  ctx.fillStyle = style.bord ?? '#e8ecf4'
  ctx.fillRect(x, y, l, h)
  ctx.fillStyle = style.fond ?? '#12101c'
  ctx.fillRect(x + 1, y + 1, Math.max(0, l - 2), Math.max(0, h - 2))
}

/** Hauteur d'une boite de dialogue a `n` lignes, marges comprises. */
export function hauteurBoite(lignes: number, marge = 5): number {
  return lignes * HAUTEUR_GLYPHE + Math.max(0, lignes - 1) * INTERLIGNE + marge * 2
}

export interface StyleDialogue extends StyleBoite, StyleTexte {
  /** Couleur du nom de qui parle. */
  couleurNom?: string
  /** Couleur du choix mis en avant. */
  couleurChoix?: string
}

/**
 * Dessine un dialogue en bas de l'ecran.
 *
 * En BAS : c'est la ou l'on regarde le moins pendant l'action, donc la ou une
 * boite gene le moins. Un dialogue au centre coupe le jeu en deux, et l'on ne
 * voit plus ce qui arrive pendant qu'on lit.
 */
export function dessinerDialogue(
  ecran: Ecran, d: Dialogue, style: StyleDialogue = {},
): void {
  if (!d.ouvert) return
  const marge = style.marge ?? 5
  const lignes = d.lignesVisibles()
  const choix = d.courante?.choix ?? []
  const total = lignes.length + (d.complet ? choix.length : 0)
  const h = hauteurBoite(Math.max(1, total), marge)
  const l = ecran.vue.largeur - 8
  const x = 4
  const y = ecran.vue.hauteur - h - 4
  boite(ecran, x, y, l, h, style)

  const qui = d.courante?.qui ?? ''
  if (qui) {
    // Le nom chevauche le bord haut de la boite : il se lit comme une
    // etiquette et ne mange pas une ligne de texte.
    boite(ecran, x + 4, y - HAUTEUR_GLYPHE - 3, largeurTexte(qui) + 6, HAUTEUR_GLYPHE + 4, style)
    ecrire(ecran, qui, x + 7, y - HAUTEUR_GLYPHE - 1, {
      ...style, couleur: style.couleurNom ?? '#7fd4a8',
    })
  }

  let ly = y + marge
  for (const ligne of lignes) {
    ecrire(ecran, ligne, x + marge, ly, style)
    ly += HAUTEUR_GLYPHE + INTERLIGNE
  }
  if (d.complet) {
    choix.forEach((c, i) => {
      const vise = i === d.curseur
      ecrire(ecran, `${vise ? '>' : ' '} ${c.texte}`, x + marge, ly, {
        ...style,
        couleur: vise ? (style.couleurChoix ?? '#f0c860') : (style.couleur ?? '#ffffff'),
      })
      ly += HAUTEUR_GLYPHE + INTERLIGNE
    })
  }
}

export interface StyleMenu extends StyleTexte {
  couleurVisee?: string
  couleurInerte?: string
  /** Espacement vertical entre deux entrees, en pixels. */
  pas?: number
}

/**
 * Dessine un menu centre, avec son curseur.
 *
 * Le curseur est un caractere pose A GAUCHE, et la ligne visee ne se decale
 * pas : un menu dont les lignes bougent quand on descend fatigue l'oeil, et
 * l'on perd de vue ce qu'on avait choisi.
 */
export function dessinerMenu(
  ecran: Ecran, m: Menu, x: number, y: number, style: StyleMenu = {},
): void {
  const pas = style.pas ?? HAUTEUR_GLYPHE + 5
  m.entrees.forEach((e, i) => {
    const vise = i === m.curseur
    const couleur = !e.active
      ? (style.couleurInerte ?? '#5a5f70')
      : (vise ? (style.couleurVisee ?? '#f0c860') : (style.couleur ?? '#e8ecf4'))
    if (vise && e.active) {
      ecrire(ecran, '>', x - (LARGEUR_GLYPHE + CHASSE) - 2, y + i * pas, { ...style, couleur })
    }
    ecrire(ecran, e.texte, x, y + i * pas, { ...style, couleur })
  })
}

/** Ecrit un texte centre sur la largeur de la vue. */
export function ecrireCentre(
  ecran: Ecran, texte: string, y: number, style: StyleTexte = {},
): void {
  ecrire(ecran, texte, Math.round((ecran.vue.largeur - largeurTexte(texte)) / 2), y, style)
}
