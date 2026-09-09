import type { Ecran } from './ecran.ts'
import type { Atlas } from './atlas.ts'
import { rectDeTuile } from './atlas.ts'
import type { Carte } from '../tuiles/tilemap.ts'
import { VIDE } from '../tuiles/tilemap.ts'
import {
  type Projection, ORTHO_DESSUS, caseVersMonde, projeter, casesVisibles, profondeurMonde,
} from '../noyau/projection.ts'
import { type Noeud, type NoeudSprite, type NoeudCarte, parcourir } from '../scene/noeud.ts'

export interface Camera {
  x: number
  y: number
}

/** Ce qu'il reste a poser sur le tampon, une fois tout releve et trie. */
interface Trace {
  /** Clef de profondeur. */
  z: number
  /** Departage a profondeur egale : l'ordre des calques, puis de la scene. */
  rang: number
  atlas: Atlas
  /** Index de tuile dans la planche. */
  image: number
  /** Coin haut-gauche, en pixels de l'ecran. */
  x: number
  y: number
  miroir: boolean
}

/**
 * Le rendu d'une scene dans le tampon de l'ecran.
 *
 * ## Deux reperes, et un seul point de passage entre les deux
 *
 * La scene vit dans le monde ORTHOGONAL : une grille carree, des pixels, des
 * boites de collision alignees. L'ecran, lui, montre ce monde selon la
 * projection du projet — de face, de biais, en losange, en hexagones. La
 * conversion se fait ici et nulle part ailleurs. C'est ce qui permet au meme
 * heros, au meme controleur de plateforme et au meme moteur de collision de
 * servir dans les quatre modes sans une ligne de difference.
 *
 * ## Deux chemins de dessin, et pourquoi ils ne se valent pas
 *
 * Vu de dessus en orthogonale ou de cote, le decor est PLAT : aucune tuile ne
 * peut passer devant un personnage sauf si on l'a rangee dans un calque
 * « devant ». Deux passes suffisent, et le decor se dessine sans rien trier.
 *
 * En isometrique, un mur passe devant ou derriere le heros SELON SA CASE, et
 * la reponse change a chaque pas. Il faut donc melanger tuiles et personnages
 * dans un seul tri. C'est plus cher — un tri de quelques centaines d'elements
 * par image — et c'est le prix exact de l'isometrique. Le payer partout
 * ralentirait pour rien les jeux qui n'en ont pas besoin ; ne le payer nulle
 * part, c'est le defaut qu'on voit dans tous les jeux isometriques rates : le
 * personnage passe devant le mur qui devrait le cacher.
 */
export function rendreScene(
  ecran: Ecran, racine: Noeud, camera: Camera,
  cartes: Map<string, { carte: Carte; atlas: Atlas }>,
  sprites: Map<string, Atlas>,
  projection: Projection = ORTHO_DESSUS(16),
): void {
  const ctx = ecran.ctx
  const cx = Math.round(camera.x)
  const cy = Math.round(camera.y)

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#0d0f14'
  ctx.fillRect(0, 0, ecran.vue.largeur, ecran.vue.hauteur)

  // On releve d'abord ce qu'il y a a dessiner, puis on trie. Dessiner en
  // parcourant l'arbre donnerait l'ordre de la scene, qui n'a rien a voir avec
  // la profondeur vue de dessus.
  const aDessiner: { n: NoeudSprite; x: number; y: number }[] = []
  const cartesADessiner: { source: string; x: number; y: number }[] = []

  parcourir(racine, (n, px, py) => {
    if (!n.visible) return
    const x = px + n.x
    const y = py + n.y
    if (n.type === 'sprite') aDessiner.push({ n: n as NoeudSprite, x, y })
    if (n.type === 'carte') cartesADessiner.push({ source: (n as NoeudCarte).source, x, y })
  })

  const t = tuileSource(cartesADessiner, cartes, projection)
  const entrelace = projection.mode === 'isometrique' || projection.mode === 'iso-decalee'

  if (entrelace) {
    const traces: Trace[] = []
    for (const c of cartesADessiner) {
      const paire = cartes.get(c.source)
      if (paire) releverCarte(traces, ecran, paire.carte, paire.atlas, projection, c.x - cx, c.y - cy, null)
    }
    releverSprites(traces, aDessiner, sprites, projection, t, cx, cy)
    traces.sort((a, b) => (a.z - b.z) || (a.rang - b.rang))
    for (const tr of traces) poser(ctx, tr)
    return
  }

  // Le chemin plat : les calques de decor qui passent DERRIERE les
  // personnages, puis les personnages tries entre eux, puis ceux qui passent
  // DEVANT — un plafond, une cime d'arbre.
  const derriere: Trace[] = []
  for (const c of cartesADessiner) {
    const paire = cartes.get(c.source)
    if (paire) releverCarte(derriere, ecran, paire.carte, paire.atlas, projection, c.x - cx, c.y - cy, false)
  }
  for (const tr of derriere) poser(ctx, tr)

  const persos: Trace[] = []
  releverSprites(persos, aDessiner, sprites, projection, t, cx, cy)
  persos.sort((a, b) => (a.z - b.z) || (a.rang - b.rang))
  for (const tr of persos) poser(ctx, tr)

  const devant: Trace[] = []
  for (const c of cartesADessiner) {
    const paire = cartes.get(c.source)
    if (paire) releverCarte(devant, ecran, paire.carte, paire.atlas, projection, c.x - cx, c.y - cy, true)
  }
  for (const tr of devant) poser(ctx, tr)
}

function poser(ctx: CanvasRenderingContext2D, tr: Trace): void {
  const { sx, sy } = rectDeTuile(tr.atlas, tr.image)
  const { largeur, hauteur } = tr.atlas
  if (!tr.miroir) {
    ctx.drawImage(tr.atlas.canevas as CanvasImageSource, sx, sy, largeur, hauteur,
      tr.x, tr.y, largeur, hauteur)
    return
  }
  // Le miroir se fait par une transformation entiere : une mise a l'echelle de
  // -1 ne deplace rien et ne cree aucun demi-pixel.
  ctx.save()
  ctx.translate(tr.x + largeur, tr.y)
  ctx.scale(-1, 1)
  ctx.drawImage(tr.atlas.canevas as CanvasImageSource, sx, sy, largeur, hauteur,
    0, 0, largeur, hauteur)
  ctx.restore()
}

function releverSprites(
  sortie: Trace[], liste: { n: NoeudSprite; x: number; y: number }[],
  sprites: Map<string, Atlas>, p: Projection, tuile: number, cx: number, cy: number,
): void {
  liste.forEach((s, i) => {
    const atlas = sprites.get(s.n.source)
    if (!atlas) return
    const e = projeter(p, s.x, s.y, tuile)
    sortie.push({
      // Le sprite est repere par ses pieds, en cases : c'est la meme unite que
      // les tuiles, sans quoi les deux echelles ne se compareraient pas.
      z: profondeurMonde(p, s.x / tuile, s.y / tuile, 0, s.n.couche),
      rang: 1000 + i,
      atlas,
      image: s.n.image,
      x: Math.round(e.x) - cx - s.n.ancreX,
      y: Math.round(e.y) - cy - s.n.ancreY,
      miroir: s.n.miroir,
    })
  })
}

/**
 * Releve les tuiles visibles d'une carte.
 *
 * Une carte de deux cents par deux cents fait quarante mille cases ; l'ecran
 * en montre deux cents. Les parcourir toutes couterait deux cents fois le
 * travail utile, a chaque image, et le jeu ramerait sur une carte que
 * l'editeur affiche sans peine.
 *
 * `devant` vaut null quand on releve TOUS les calques d'un coup — c'est le cas
 * isometrique, ou le tri decidera lui-meme de ce qui passe devant.
 */
function releverCarte(
  sortie: Trace[], ecran: Ecran, carte: Carte, atlas: Atlas,
  p: Projection, ox: number, oy: number, devant: boolean | null,
): void {
  const b = casesVisibles(p, -ox, -oy, ecran.vue, carte)
  // Ce qui deborde au-dessus de la case : la hauteur d'un bloc isometrique,
  // ou zero pour une dalle plate.
  const debord = atlas.hauteur - p.hauteurTuile

  carte.calques.forEach((calque, iCalque) => {
    if (!calque.visible) return
    if (devant !== null && calque.devant !== devant) return
    for (let cy = b.y0; cy <= b.y1; cy++) {
      for (let cx = b.x0; cx <= b.x1; cx++) {
        const image = calque.cases[carte.index(cx, cy)]
        if (image === VIDE) continue
        const m = caseVersMonde(p, cx, cy)
        sortie.push({
          // Le demi : une tuile appartient a sa case, et un personnage debout
          // DANS cette case doit passer devant elle. Sans ce demi, les deux
          // sont a egalite et c'est l'ordre du tableau qui tranche — le heros
          // disparaitrait derriere le sol qu'il foule.
          z: profondeurMonde(p, cx + 0.5, cy + 0.5, 0, 0) - 0.5,
          rang: iCalque,
          atlas,
          image,
          x: ox + m.x,
          y: oy + m.y - debord,
          miroir: false,
        })
      }
    }
  })
}

/**
 * La taille de case du monde orthogonal ou vivent les entites.
 *
 * Elle vient de la carte, et non de la projection : en isometrique la case
 * fait 32x16 a l'ecran alors que le gameplay la traite comme un carre de 16.
 * Prendre `largeurTuile` ici ferait avancer le heros deux fois trop vite sur
 * un seul des deux axes — le genre de faute qui ne se voit qu'en diagonale.
 */
function tuileSource(
  cartesADessiner: { source: string }[],
  cartes: Map<string, { carte: Carte; atlas: Atlas }>,
  projection: Projection,
): number {
  for (const c of cartesADessiner) {
    const paire = cartes.get(c.source)
    if (paire) return paire.carte.tuile
  }
  return projection.hauteurTuile || 16
}

/**
 * Deplace la camera vers sa cible, avec une marge morte.
 *
 * Sans marge, la camera suit le moindre pas et l'image tremble en permanence.
 * Sur trois cent vingt pixels de large, un tremblement d'un pixel se voit
 * comme une secousse. La camera ne bouge donc que lorsque la cible SORT du
 * cadre mort, et seulement de ce qu'il faut pour l'y ramener.
 */
export function suivre(
  cam: Camera, cibleX: number, cibleY: number, vue: { largeur: number; hauteur: number },
  margeX: number, margeY: number,
  bornes: { x: number; y: number; l: number; h: number } | null,
): void {
  const centreX = cam.x + vue.largeur / 2
  const centreY = cam.y + vue.hauteur / 2
  if (cibleX > centreX + margeX) cam.x += cibleX - (centreX + margeX)
  if (cibleX < centreX - margeX) cam.x += cibleX - (centreX - margeX)
  if (cibleY > centreY + margeY) cam.y += cibleY - (centreY + margeY)
  if (cibleY < centreY - margeY) cam.y += cibleY - (centreY - margeY)

  // La camera ne sort pas de la carte : voir le vide au bord d'une salle est
  // le defaut le plus banal d'un jeu 2D, et le plus facile a eviter. Le monde
  // ne commence pas forcement a l'origine — une carte isometrique s'etend a
  // gauche de zero — d'ou un coin et non une simple taille.
  if (bornes) {
    cam.x = Math.max(bornes.x, Math.min(cam.x, Math.max(bornes.x, bornes.x + bornes.l - vue.largeur)))
    cam.y = Math.max(bornes.y, Math.min(cam.y, Math.max(bornes.y, bornes.y + bornes.h - vue.hauteur)))
  }
}
