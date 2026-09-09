import { Carte, VIDE } from '../tuiles/tilemap.ts'
import type { Projection } from '../noyau/projection.ts'

/**
 * Tiled, dans les deux sens.
 *
 * ## Pourquoi Tiled avant tout le reste
 *
 * C'est l'editeur de cartes 2D que tout le monde a deja, et son format est lu
 * par Godot, Unity, LOVE, Phaser, Bevy, et une quarantaine d'autres. Savoir le
 * lire et l'ecrire, c'est etre compatible avec l'ecosysteme entier sans ecrire
 * un connecteur par moteur.
 *
 * On traite le JSON (`.tmj`) et non le XML (`.tmx`) : meme information, et un
 * navigateur lit le premier sans analyseur.
 *
 * ## Le piege des index : Tiled compte a partir de UN
 *
 * Dans Tiled, zero veut dire « case vide » et la premiere tuile porte le
 * numero un. Chez nous, zero EST la premiere tuile et le vide vaut -1. Toute
 * conversion qui oublie ce decalage produit une carte ou chaque tuile est
 * remplacee par sa voisine — un decor qui ressemble a l'original de loin, et
 * qui est faux partout.
 *
 * Le `firstgid` s'ajoute par-dessus : une carte peut employer plusieurs
 * planches, chacune commencant a un numero donne.
 */

export interface TiledCalque {
  id?: number
  name: string
  type: 'tilelayer' | 'objectgroup'
  width?: number
  height?: number
  data?: number[]
  visible?: boolean
  opacity?: number
  x?: number
  y?: number
  objects?: TiledObjet[]
  properties?: { name: string; type: string; value: unknown }[]
}

export interface TiledObjet {
  id: number
  name: string
  type?: string
  x: number
  y: number
  width: number
  height: number
  properties?: { name: string; type: string; value: unknown }[]
}

export interface TiledPlanche {
  firstgid: number
  name: string
  tilewidth: number
  tileheight: number
  tilecount?: number
  columns?: number
  image?: string
  imagewidth?: number
  imageheight?: number
}

export interface TiledCarte {
  type: 'map'
  version: string
  tiledversion?: string
  orientation: 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal'
  renderorder: string
  width: number
  height: number
  tilewidth: number
  tileheight: number
  infinite: boolean
  layers: TiledCalque[]
  tilesets: TiledPlanche[]
  nextlayerid?: number
  nextobjectid?: number
}

const ORIENTATION: Record<Projection['mode'], TiledCarte['orientation']> = {
  orthogonale: 'orthogonal',
  isometrique: 'isometric',
  'iso-decalee': 'staggered',
  hexagonale: 'hexagonal',
}
const MODE: Record<TiledCarte['orientation'], Projection['mode']> = {
  orthogonal: 'orthogonale',
  isometric: 'isometrique',
  staggered: 'iso-decalee',
  hexagonal: 'hexagonale',
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export interface OptionsTiled {
  projection: Projection
  /** Nom et image de la planche de tuiles. */
  planche: { nom: string; image: string; colonnes: number; nombre: number }
  /** Numero de la premiere tuile. Tiled reserve zero au vide. */
  firstgid?: number
}

export function versTiled(c: Carte, o: OptionsTiled): TiledCarte {
  const firstgid = o.firstgid ?? 1
  const calques: TiledCalque[] = c.calques.map((l, i) => ({
    id: i + 1,
    name: l.nom,
    type: 'tilelayer',
    width: c.largeur,
    height: c.hauteur,
    visible: l.visible,
    opacity: 1,
    x: 0,
    y: 0,
    // Le decalage se fait ICI, une seule fois : le vide devient zero, et la
    // tuile n devient n + firstgid.
    data: Array.from(l.cases, (v) => (v === VIDE ? 0 : v + firstgid)),
    properties: [{ name: 'devant', type: 'bool', value: l.devant }],
  }))

  // La collision part en calque d'objets : Tiled n'a pas de grille de
  // collision, et la mettre en propriete de tuile la perdrait des qu'on
  // repeint. Un rectangle par case solide se relit dans n'importe quel moteur.
  const objets: TiledObjet[] = []
  let id = 1
  for (let cy = 0; cy < c.hauteur; cy++) {
    for (let cx = 0; cx < c.largeur; cx++) {
      if (!c.solides[c.index(cx, cy)]) continue
      objets.push({
        id: id++, name: '', type: 'solide',
        x: cx * c.tuile, y: cy * c.tuile, width: c.tuile, height: c.tuile,
      })
    }
  }
  if (objets.length) {
    calques.push({
      id: calques.length + 1, name: 'collision', type: 'objectgroup',
      visible: true, opacity: 1, x: 0, y: 0, objects: objets,
    })
  }

  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: ORIENTATION[o.projection.mode],
    renderorder: 'right-down',
    width: c.largeur,
    height: c.hauteur,
    tilewidth: c.tuile,
    tileheight: o.projection.mode === 'isometrique' ? o.projection.hauteurTuile : c.tuile,
    infinite: false,
    layers: calques,
    tilesets: [{
      firstgid,
      name: o.planche.nom,
      tilewidth: c.tuile,
      tileheight: c.tuile,
      tilecount: o.planche.nombre,
      columns: o.planche.colonnes,
      image: o.planche.image,
      imagewidth: o.planche.colonnes * c.tuile,
      imageheight: Math.ceil(o.planche.nombre / o.planche.colonnes) * c.tuile,
    }],
    nextlayerid: calques.length + 1,
    nextobjectid: id,
  }
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface RapportImport {
  carte: Carte
  mode: Projection['mode']
  /** Ce qui a ete lu, et ce qui a ete laisse de cote. */
  calquesLus: number
  objetsLus: number
  avertissements: string[]
}

export function depuisTiled(t: TiledCarte): RapportImport {
  const avertissements: string[] = []
  if (t.infinite) {
    avertissements.push('carte infinie : seuls les fragments deja poses sont lus')
  }
  const firstgid = t.tilesets.length ? Math.min(...t.tilesets.map((p) => p.firstgid)) : 1
  if (t.tilesets.length > 1) {
    avertissements.push(
      `${t.tilesets.length} planches : les index sont ramenes a la premiere, `
      + 'les tuiles des autres seront decalees',
    )
  }

  const c = new Carte(t.width, t.height, t.tilewidth)
  c.calques = []
  let calquesLus = 0
  let objetsLus = 0

  for (const l of t.layers) {
    if (l.type === 'tilelayer' && l.data) {
      const devant = l.properties?.find((p) => p.name === 'devant')?.value === true
      const calque = c.ajouterCalque(l.name, { visible: l.visible ?? true, devant })
      for (let i = 0; i < calque.cases.length && i < l.data.length; i++) {
        const brut = l.data[i]
        // Le retour du decalage. Les bits de retournement de Tiled occupent
        // les quatre bits de poids fort : on les masque, sinon une tuile
        // retournee ressort avec un index astronomique.
        const gid = brut & 0x0fffffff
        calque.cases[i] = gid === 0 ? VIDE : gid - firstgid
      }
      calquesLus++
      continue
    }
    if (l.type === 'objectgroup' && l.objects) {
      for (const o of l.objects) {
        objetsLus++
        if (o.type !== 'solide' && l.name !== 'collision') continue
        const cx0 = Math.floor(o.x / c.tuile)
        const cy0 = Math.floor(o.y / c.tuile)
        const cx1 = Math.ceil((o.x + o.width) / c.tuile) - 1
        const cy1 = Math.ceil((o.y + o.height) / c.tuile) - 1
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            if (c.dedans(cx, cy)) c.solides[c.index(cx, cy)] = 1
          }
        }
      }
    }
  }

  if (!calquesLus) avertissements.push('aucun calque de tuiles : la carte sera vide')

  return { carte: c, mode: MODE[t.orientation] ?? 'orthogonale', calquesLus, objetsLus, avertissements }
}

/** Reconnait un fichier Tiled a son contenu, jamais a son extension. */
export function estDuTiled(o: unknown): o is TiledCarte {
  if (!o || typeof o !== 'object') return false
  const t = o as Record<string, unknown>
  return t.type === 'map' && Array.isArray(t.layers) && typeof t.width === 'number'
}
