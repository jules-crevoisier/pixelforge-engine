import type { PlancheSerialisee } from '../export/format.ts'

/**
 * Faire entrer l'art de l'artiste.
 *
 * ## Pourquoi ce fichier est le plus important de l'editeur
 *
 * Un moteur specialise pixel art sans porte d'entree pour les images est un
 * moteur ou l'artiste n'a pas le droit de travailler avec ses outils. Les
 * gens dessinent dans Aseprite, dans l'editeur de sprites d'a cote, dans ce
 * qu'ils aiment — et exportent des PNG. Jusqu'ici, la seule facon de mettre
 * un dessin dans un projet etait de le retaper lettre par lettre dans
 * l'atelier. Personne ne fera jamais un jeu comme cela.
 *
 * ## Ce qu'on importe, et en quoi ca se transforme
 *
 * - une IMAGE (PNG, GIF, WebP...) : decoupee en cases, elle devient une
 *   planche — les memes lettres et la meme cle que si on l'avait dessinee ici.
 * - un PROJET de l'editeur de sprites (`.pixelforge`) : chaque image de
 *   l'animation devient une case, calques aplatis. C'est le pont entre les
 *   deux produits : on dessine et on anime dans l'un, on joue dans l'autre.
 *
 * ## Les regles honnetes
 *
 * - la transparence partielle est APLATIE : une planche ne connait que le
 *   plein et le vide. On compte ce qu'on aplatit et on le dit, plutot que de
 *   le faire en silence.
 * - trop de couleurs, c'est REFUSE et non quantifie : au-dela de l'alphabet,
 *   ce n'est plus du pixel art, c'est une photo. Quantifier en douce
 *   donnerait un dessin qui ressemble a l'original sans etre celui de
 *   l'artiste — la pire des politesse.
 * - un agrandissement (export en x2, x3...) est DETECTE et ramene a
 *   l'echelle 1, et on le dit. Un « pixel » de quatre pixels casserait
 *   toutes les tailles de case du projet.
 */

/** Une image decodee, telle que le navigateur la rend : RGBA, un octet par canal. */
export interface ImageBrute {
  largeur: number
  hauteur: number
  donnees: Uint8ClampedArray
}

/**
 * Les lettres qu'une planche peut employer, dans l'ordre d'attribution.
 *
 * Le point est exclu — c'est le vide — ainsi que tout ce qui se lirait mal
 * dans un fichier : guillemets, barre inverse, virgule. Quatre-vingts
 * couleurs : au-dela, le refus a un nom, et il est ecrit dans le message.
 */
export const ALPHABET_PLANCHE =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  + '#$%&*+-/:;<=>?@[]^_{|}~!'

/** En dessous de quoi un pixel est du vide. La moitie : ni genereux ni pingre. */
const SEUIL_ALPHA = 128

const hex = (v: number): string => v.toString(16).padStart(2, '0')

/**
 * L'agrandissement uniforme d'une image, ou 1.
 *
 * Un export « x2 » d'Aseprite ou d'un outil web donne des pixels de quatre
 * pixels. On cherche le PLUS GRAND facteur qui divise les deux dimensions et
 * pour lequel chaque bloc est uniforme — en verifiant l'alpha aussi : un
 * degrade de transparence dans un bloc n'est pas un gros pixel.
 */
export function echelleDe(img: ImageBrute): number {
  for (let n = 8; n >= 2; n--) {
    if (img.largeur % n !== 0 || img.hauteur % n !== 0) continue
    let uniforme = true
    for (let by = 0; by < img.hauteur && uniforme; by += n) {
      for (let bx = 0; bx < img.largeur && uniforme; bx += n) {
        const base = (by * img.largeur + bx) * 4
        for (let dy = 0; dy < n && uniforme; dy++) {
          for (let dx = 0; dx < n; dx++) {
            const i = ((by + dy) * img.largeur + bx + dx) * 4
            if (img.donnees[i] !== img.donnees[base]
              || img.donnees[i + 1] !== img.donnees[base + 1]
              || img.donnees[i + 2] !== img.donnees[base + 2]
              || img.donnees[i + 3] !== img.donnees[base + 3]) { uniforme = false; break }
          }
        }
      }
    }
    if (uniforme) return n
  }
  return 1
}

/** Ramene une image agrandie a l'echelle 1, en prenant un pixel par bloc. */
export function reduire(img: ImageBrute, n: number): ImageBrute {
  if (n <= 1) return img
  const largeur = Math.floor(img.largeur / n)
  const hauteur = Math.floor(img.hauteur / n)
  const donnees = new Uint8ClampedArray(largeur * hauteur * 4)
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const s = (y * n * img.largeur + x * n) * 4
      const d = (y * largeur + x) * 4
      donnees[d] = img.donnees[s]
      donnees[d + 1] = img.donnees[s + 1]
      donnees[d + 2] = img.donnees[s + 2]
      donnees[d + 3] = img.donnees[s + 3]
    }
  }
  return { largeur, hauteur, donnees }
}

export interface ResultatImport {
  planche: PlancheSerialisee
  /** Ce qu'on a change ou aplati, dit en clair. Vide : rien a signaler. */
  avertissements: string[]
}

/**
 * Une planche depuis une image, decoupee en cases.
 *
 * Les cases se lisent de gauche a droite puis de haut en bas — l'ordre d'une
 * feuille de sprites, celui que tous les outils produisent. Une image qui ne
 * tombe pas juste est ROGNEE au multiple inferieur, et on le dit : rogner en
 * silence ferait chercher longtemps la rangee du bas.
 */
export function plancheDepuisImage(
  brute: ImageBrute, nom: string, largeurCase: number, hauteurCase: number,
  /**
   * Faut-il chercher un agrandissement ?
   *
   * Oui pour une image etrangere, dont on ne sait rien. NON pour un projet
   * de sprites : lui declare sa taille, et la detection s'est fait avoir par
   * un dessin sincerement plat — une image d'un aplat et d'une image vide
   * ressemble trait pour trait a un agrandissement, et la « ramener » l'a
   * detruite. Quand on SAIT, on ne devine pas.
   */
  detecterEchelle = true,
): ResultatImport {
  const avertissements: string[] = []
  let img = brute

  const echelle = detecterEchelle ? echelleDe(img) : 1
  if (echelle > 1) {
    img = reduire(img, echelle)
    avertissements.push(
      `L’image est un agrandissement ×${echelle} : ramenée à l’échelle 1 `
      + `(${img.largeur}×${img.hauteur}).`,
    )
  }

  const lc = Math.max(1, Math.floor(largeurCase))
  const hc = Math.max(1, Math.floor(hauteurCase))
  const colonnes = Math.floor(img.largeur / lc)
  const rangees = Math.floor(img.hauteur / hc)
  if (colonnes < 1 || rangees < 1) {
    throw new Error(
      `L’image fait ${img.largeur}×${img.hauteur} : trop petite pour des cases de ${lc}×${hc}.`,
    )
  }
  if (colonnes * lc !== img.largeur || rangees * hc !== img.hauteur) {
    avertissements.push(
      `${img.largeur}×${img.hauteur} n’est pas un multiple de ${lc}×${hc} : `
      + `rognée à ${colonnes * lc}×${rangees * hc}.`,
    )
  }

  /* La cle : une lettre par couleur, dans l'ordre de rencontre. L'ordre de
   * rencontre et non l'ordre de luminance : reimporter la meme image doit
   * rendre exactement la meme planche, lettre pour lettre. */
  const cle: Record<string, string> = {}
  const lettreDe = new Map<string, string>()
  let semiTransparents = 0

  const dessins: string[][] = []
  for (let cy = 0; cy < rangees; cy++) {
    for (let cx = 0; cx < colonnes; cx++) {
      const lignes: string[] = []
      for (let y = 0; y < hc; y++) {
        let ligne = ''
        for (let x = 0; x < lc; x++) {
          const i = ((cy * hc + y) * img.largeur + cx * lc + x) * 4
          const a = img.donnees[i + 3]
          if (a < SEUIL_ALPHA) {
            if (a > 0) semiTransparents++
            ligne += '.'
            continue
          }
          if (a < 255) semiTransparents++
          const couleur = `#${hex(img.donnees[i])}${hex(img.donnees[i + 1])}${hex(img.donnees[i + 2])}`
          let lettre = lettreDe.get(couleur)
          if (!lettre) {
            if (lettreDe.size >= ALPHABET_PLANCHE.length) {
              throw new Error(
                `Plus de ${ALPHABET_PLANCHE.length} couleurs : ce n’est plus du pixel art. `
                + 'Réduisez la palette dans votre outil de dessin, puis réimportez — '
                + 'quantifier à votre place donnerait un dessin qui n’est plus le vôtre.',
              )
            }
            lettre = ALPHABET_PLANCHE[lettreDe.size]
            lettreDe.set(couleur, lettre)
            cle[lettre] = couleur
          }
          ligne += lettre
        }
        lignes.push(ligne)
      }
      dessins.push(lignes)
    }
  }

  if (semiTransparents > 0) {
    avertissements.push(
      `${semiTransparents} pixel(s) à transparence partielle aplatis : `
      + 'une planche ne connaît que le plein et le vide.',
    )
  }

  return {
    planche: { nom, largeurCase: lc, hauteurCase: hc, colonnes, cle, dessins },
    avertissements,
  }
}

/* ------------------------------------------------------------------ */
/* Le pont : un projet de l'editeur de sprites                         */
/* ------------------------------------------------------------------ */

/** Ce qu'on lit d'un `.pixelforge` — le strict necessaire, version 1. */
interface SpriteJson {
  format: string
  version: number
  name?: string
  width: number
  height: number
  frameDurations: number[]
  layers: {
    visible: boolean
    reference?: boolean
    opacity: number
    blendMode?: string
    cels: ({ opacity: number; png: string } | null)[]
  }[]
}

/**
 * Une planche depuis un projet de l'editeur de sprites.
 *
 * ## Ce qui traverse, et ce qui s'aplatit
 *
 * Chaque image de l'animation devient une case, dans l'ordre. Les calques
 * visibles sont fondus de bas en haut avec leur opacite ; les calques de
 * REFERENCE — le modele qu'on decalque — ne sont pas du dessin et restent
 * dehors. Les modes de fusion « multiplier » et « ecran » sont calcules ;
 * les autres retombent sur le fondu normal, et on le dit.
 *
 * ## Pourquoi le decodage de PNG est INJECTE
 *
 * Les pixels d'un cel sont un PNG en base64. Le decoder demande le
 * navigateur ; tout le reste — la fusion, l'ordre, l'opacite, les regles —
 * n'en a pas besoin, et c'est tout le reste qui peut etre faux. En injectant
 * le decodeur, la logique s'eprouve en Node avec des pixels fabriques, et le
 * navigateur ne teste que ce que lui seul sait faire.
 */
export async function plancheDepuisSprite(
  texte: string,
  decoderPng: (base64: string) => Promise<ImageBrute>,
  nomVoulu = '',
): Promise<ResultatImport> {
  let brut: SpriteJson
  try {
    brut = JSON.parse(texte) as SpriteJson
  } catch {
    throw new Error('Ce fichier n’est pas un projet de l’éditeur de sprites : JSON illisible.')
  }
  if (brut.format !== 'pixelforge' || !Array.isArray(brut.layers)) {
    throw new Error('Ce fichier n’est pas un projet de l’éditeur de sprites.')
  }
  const avertissements: string[] = []
  const largeur = brut.width
  const hauteur = brut.height
  const images = Math.max(1, brut.frameDurations?.length ?? 1)

  /* La toile : toutes les images cote a cote, fond transparent. On fusionne
   * en flottant pour ne pas accumuler d'erreurs d'arrondi calque apres
   * calque. */
  const toile = new Float64Array(largeur * images * hauteur * 4)
  const fusionsAplaties = new Set<string>()

  for (const calque of brut.layers) {
    if (!calque.visible || calque.reference) continue
    const mode = calque.blendMode ?? 'normal'
    if (mode !== 'normal' && mode !== 'multiply' && mode !== 'screen') fusionsAplaties.add(mode)
    for (let f = 0; f < images; f++) {
      const cel = calque.cels[f]
      if (!cel || !cel.png) continue
      const pixels = await decoderPng(cel.png)
      if (pixels.largeur !== largeur || pixels.hauteur !== hauteur) {
        throw new Error(`Un cel fait ${pixels.largeur}×${pixels.hauteur} au lieu de ${largeur}×${hauteur}.`)
      }
      const alphaCalque = ((calque.opacity ?? 255) / 255) * ((cel.opacity ?? 255) / 255)
      for (let y = 0; y < hauteur; y++) {
        for (let x = 0; x < largeur; x++) {
          const s = (y * largeur + x) * 4
          const a = (pixels.donnees[s + 3] / 255) * alphaCalque
          if (a <= 0) continue
          const d = (y * largeur * images + f * largeur + x) * 4
          const fondA = toile[d + 3]
          // `a > 0` est garanti par le `continue` au-dessus : l'alpha de
          // sortie ne peut donc pas etre nul, et la division est sure.
          const sortieA = a + fondA * (1 - a)
          for (let c = 0; c < 3; c++) {
            let src = pixels.donnees[s + c] / 255
            const fond = toile[d + c]
            if (mode === 'multiply' && fondA > 0) src = src * fond
            else if (mode === 'screen' && fondA > 0) src = 1 - (1 - src) * (1 - fond)
            // Fondu source-sur-fond ordinaire, non premultiplie.
            toile[d + c] = (src * a + fond * fondA * (1 - a)) / sortieA
          }
          toile[d + 3] = sortieA
        }
      }
    }
  }

  if (fusionsAplaties.size > 0) {
    avertissements.push(
      `Mode(s) de fusion « ${[...fusionsAplaties].join(', ')} » aplatis en fondu normal.`,
    )
  }

  const donnees = new Uint8ClampedArray(largeur * images * hauteur * 4)
  for (let i = 0; i < toile.length; i++) donnees[i] = Math.round(toile[i] * 255)

  const nom = nomVoulu || brut.name || 'importee'
  const resultat = plancheDepuisImage(
    { largeur: largeur * images, hauteur, donnees }, nom, largeur, hauteur, false,
  )
  resultat.avertissements.unshift(...avertissements)
  if (images > 1) {
    resultat.avertissements.push(
      `${images} images d’animation devenues ${images} cases : un clip peut les rejouer.`,
    )
  }
  return resultat
}
