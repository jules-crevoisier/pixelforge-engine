import type { Ecran } from './ecran.ts'
import type { Atlas } from './atlas.ts'
import { rectDeTuile } from './atlas.ts'
import type { Carte } from '../tuiles/tilemap.ts'
import { VIDE } from '../tuiles/tilemap.ts'
import { type Noeud, type NoeudSprite, type NoeudCarte, parcourir, ordonner } from '../scene/noeud.ts'

export interface Camera {
  x: number
  y: number
}

/**
 * Le rendu d'une scene dans le tampon de l'ecran.
 *
 * ## Pourquoi la camera est arrondie ici et nulle part ailleurs
 *
 * La camera peut suivre une cible avec un lissage, donc vivre en reel. Mais
 * elle se pose sur la grille AU MOMENT DU RENDU, une seule fois, et tout le
 * reste du dessin se calcule a partir de cette valeur entiere. Arrondir chaque
 * sprite separement donnerait des ecarts d'un pixel entre voisins selon leur
 * position — le decor se decoudrait.
 */
export function rendreScene(
  ecran: Ecran, racine: Noeud, camera: Camera,
  cartes: Map<string, { carte: Carte; atlas: Atlas }>,
  sprites: Map<string, Atlas>,
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
  const cartesADessiner: { source: string; x: number; y: number; devant: boolean }[] = []

  parcourir(racine, (n, px, py) => {
    if (!n.visible) return
    const x = px + n.x
    const y = py + n.y
    if (n.type === 'sprite') aDessiner.push({ n: n as NoeudSprite, x, y })
    if (n.type === 'carte') {
      cartesADessiner.push({ source: (n as NoeudCarte).source, x, y, devant: false })
    }
  })

  // Les calques de decor qui passent DERRIERE les personnages.
  for (const c of cartesADessiner) {
    const paire = cartes.get(c.source)
    if (paire) dessinerCarte(ctx, ecran, paire.carte, paire.atlas, c.x - cx, c.y - cy, false)
  }

  aDessiner.sort((a, b) => ordonner({ couche: a.n.couche, y: a.y }, { couche: b.n.couche, y: b.y }))
  for (const s of aDessiner) {
    const atlas = sprites.get(s.n.source)
    if (!atlas) continue
    dessinerSprite(ctx, atlas, s.n, s.x - cx, s.y - cy)
  }

  // Et ceux qui passent DEVANT : un plafond, une cime d'arbre.
  for (const c of cartesADessiner) {
    const paire = cartes.get(c.source)
    if (paire) dessinerCarte(ctx, ecran, paire.carte, paire.atlas, c.x - cx, c.y - cy, true)
  }
}

function dessinerSprite(
  ctx: CanvasRenderingContext2D, atlas: Atlas, n: NoeudSprite, x: number, y: number,
): void {
  const { sx, sy } = rectDeTuile(atlas, n.image)
  const dx = Math.round(x) - n.ancreX
  const dy = Math.round(y) - n.ancreY
  if (!n.miroir) {
    ctx.drawImage(atlas.canevas as CanvasImageSource, sx, sy, atlas.tuile, atlas.tuile,
      dx, dy, atlas.tuile, atlas.tuile)
    return
  }
  // Le miroir se fait par une transformation entiere : une mise a l'echelle de
  // -1 ne deplace rien et ne cree aucun demi-pixel.
  ctx.save()
  ctx.translate(dx + atlas.tuile, dy)
  ctx.scale(-1, 1)
  ctx.drawImage(atlas.canevas as CanvasImageSource, sx, sy, atlas.tuile, atlas.tuile,
    0, 0, atlas.tuile, atlas.tuile)
  ctx.restore()
}

/**
 * Dessine une carte, en ne parcourant QUE les cases visibles.
 *
 * Une carte de deux cents par deux cents fait quarante mille cases ; l'ecran
 * en montre deux cents. Les parcourir toutes couterait deux cents fois le
 * travail utile, a chaque image, et le jeu ramerait sur une carte que
 * l'editeur affiche sans peine.
 */
function dessinerCarte(
  ctx: CanvasRenderingContext2D, ecran: Ecran, carte: Carte, atlas: Atlas,
  ox: number, oy: number, devant: boolean,
): void {
  const t = carte.tuile
  const x0 = Math.max(0, Math.floor(-ox / t))
  const y0 = Math.max(0, Math.floor(-oy / t))
  const x1 = Math.min(carte.largeur - 1, Math.floor((ecran.vue.largeur - ox) / t))
  const y1 = Math.min(carte.hauteur - 1, Math.floor((ecran.vue.hauteur - oy) / t))

  for (const calque of carte.calques) {
    if (!calque.visible || calque.devant !== devant) continue
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const tuile = calque.cases[carte.index(cx, cy)]
        if (tuile === VIDE) continue
        const { sx, sy } = rectDeTuile(atlas, tuile)
        ctx.drawImage(atlas.canevas as CanvasImageSource, sx, sy, t, t,
          ox + cx * t, oy + cy * t, t, t)
      }
    }
  }
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
  bornes: { largeur: number; hauteur: number } | null,
): void {
  const centreX = cam.x + vue.largeur / 2
  const centreY = cam.y + vue.hauteur / 2
  if (cibleX > centreX + margeX) cam.x += cibleX - (centreX + margeX)
  if (cibleX < centreX - margeX) cam.x += cibleX - (centreX - margeX)
  if (cibleY > centreY + margeY) cam.y += cibleY - (centreY + margeY)
  if (cibleY < centreY - margeY) cam.y += cibleY - (centreY - margeY)

  // La camera ne sort pas de la carte : voir le vide au bord d'une salle est
  // le defaut le plus banal d'un jeu 2D, et le plus facile a eviter.
  if (bornes) {
    cam.x = Math.max(0, Math.min(cam.x, Math.max(0, bornes.largeur - vue.largeur)))
    cam.y = Math.max(0, Math.min(cam.y, Math.max(0, bornes.hauteur - vue.hauteur)))
  }
}
