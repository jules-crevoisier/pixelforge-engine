import { Carte, VIDE } from '../tuiles/tilemap.ts'

/**
 * LDtk, dans les deux sens.
 *
 * ## Pourquoi LDtk en plus de Tiled
 *
 * LDtk est l'editeur de niveaux de Deepnight — l'auteur de Dead Cells — et il
 * est fait pour le pixel art la ou Tiled est generaliste. Deux choses le
 * distinguent, et ce sont exactement celles qui nous interessent :
 *
 * - le **monde** est une liste de niveaux places les uns par rapport aux
 *   autres, ce qui est la structure d'un metroidvania ou d'un roguelite ;
 * - les **regles automatiques** posent les tuiles depuis un masque de
 *   presence, comme notre terrain. La conversion est donc directe dans un sens
 *   comme dans l'autre.
 *
 * ## Ce qu'on ne fait PAS
 *
 * On ne recree pas les regles automatiques de LDtk a l'import : on prend les
 * tuiles qu'elles ont produites. Recreer la regle demanderait de deviner
 * l'intention depuis son resultat, ce qui est faux des que deux regles se
 * chevauchent. On garde donc le masque de presence, qui est l'information
 * source, et notre propre autotiling repose les tuiles.
 */

export interface LdtkTuile {
  /** Position en pixels dans le niveau. */
  px: [number, number]
  /** Position source dans la planche, en pixels. */
  src: [number, number]
  /** Bits de retournement : 1 = horizontal, 2 = vertical. */
  f: number
  t: number
  d: number[]
  a?: number
}

export interface LdtkCalque {
  __identifier: string
  __type: 'IntGrid' | 'Tiles' | 'AutoLayer' | 'Entities'
  __cWid: number
  __cHei: number
  __gridSize: number
  __opacity?: number
  visible?: boolean
  intGridCsv?: number[]
  gridTiles?: LdtkTuile[]
  autoLayerTiles?: LdtkTuile[]
  entityInstances?: unknown[]
}

export interface LdtkNiveau {
  identifier: string
  uid: number
  worldX: number
  worldY: number
  pxWid: number
  pxHei: number
  layerInstances: LdtkCalque[]
}

export interface LdtkProjet {
  jsonVersion: string
  defaultGridSize: number
  levels: LdtkNiveau[]
  worldLayout?: string
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export interface OptionsLdtk {
  /** Nombre de colonnes de la planche, pour retrouver la position source. */
  colonnes: number
  /** Position du niveau dans le monde. */
  monde?: { x: number; y: number }
}

export function versLdtk(nom: string, c: Carte, o: OptionsLdtk): LdtkProjet {
  const calques: LdtkCalque[] = []

  // La collision part en IntGrid : c'est la structure prevue pour, et LDtk
  // s'en sert lui-meme pour ses regles automatiques.
  calques.push({
    __identifier: 'Collision',
    __type: 'IntGrid',
    __cWid: c.largeur,
    __cHei: c.hauteur,
    __gridSize: c.tuile,
    visible: true,
    intGridCsv: Array.from(c.solides, (v) => (v ? 1 : 0)),
  })

  // Les calques de dessin. LDtk les range du dessus vers le dessous, a
  // l'inverse de nous : on inverse, sinon le sol recouvre les murs.
  for (const l of [...c.calques].reverse()) {
    const tuiles: LdtkTuile[] = []
    for (let cy = 0; cy < c.hauteur; cy++) {
      for (let cx = 0; cx < c.largeur; cx++) {
        const t = l.cases[c.index(cx, cy)]
        if (t === VIDE) continue
        tuiles.push({
          px: [cx * c.tuile, cy * c.tuile],
          src: [(t % o.colonnes) * c.tuile, Math.floor(t / o.colonnes) * c.tuile],
          f: 0,
          t,
          d: [c.index(cx, cy)],
        })
      }
    }
    calques.push({
      __identifier: l.nom.replace(/[^A-Za-z0-9_]/g, '_'),
      __type: 'Tiles',
      __cWid: c.largeur,
      __cHei: c.hauteur,
      __gridSize: c.tuile,
      __opacity: 1,
      visible: l.visible,
      gridTiles: tuiles,
    })
  }

  return {
    jsonVersion: '1.5.3',
    defaultGridSize: c.tuile,
    worldLayout: 'Free',
    levels: [{
      identifier: nom.replace(/[^A-Za-z0-9_]/g, '_'),
      uid: 1,
      worldX: o.monde?.x ?? 0,
      worldY: o.monde?.y ?? 0,
      pxWid: c.largeur * c.tuile,
      pxHei: c.hauteur * c.tuile,
      layerInstances: calques,
    }],
  }
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface RapportLdtk {
  cartes: { nom: string; carte: Carte; monde: { x: number; y: number } }[]
  avertissements: string[]
}

export function depuisLdtk(p: LdtkProjet): RapportLdtk {
  const avertissements: string[] = []
  const cartes: RapportLdtk['cartes'] = []

  for (const niveau of p.levels) {
    const premier = niveau.layerInstances[0]
    const grille = premier?.__gridSize ?? p.defaultGridSize
    const larg = Math.max(...niveau.layerInstances.map((l) => l.__cWid), 1)
    const haut = Math.max(...niveau.layerInstances.map((l) => l.__cHei), 1)
    const c = new Carte(larg, haut, grille)
    c.calques = []

    // On relit dans l'ordre inverse, pour revenir a notre convention.
    for (const l of [...niveau.layerInstances].reverse()) {
      if (l.__type === 'IntGrid' && l.intGridCsv) {
        // Toute valeur non nulle bloque. LDtk permet plusieurs valeurs pour
        // distinguer des matieres ; on ne garde que « solide ou non », et on
        // le dit plutot que de laisser croire qu'on a tout compris.
        const valeurs = new Set(l.intGridCsv.filter((v) => v !== 0))
        if (valeurs.size > 1) {
          avertissements.push(
            `« ${l.__identifier} » a ${valeurs.size} valeurs de grille : toutes ramenees a « solide »`,
          )
        }
        for (let i = 0; i < c.solides.length && i < l.intGridCsv.length; i++) {
          c.solides[i] = l.intGridCsv[i] ? 1 : 0
        }
        continue
      }
      if (l.__type === 'Entities') {
        avertissements.push(`entites de « ${l.__identifier} » non importees`)
        continue
      }
      const tuiles = l.gridTiles ?? l.autoLayerTiles
      if (!tuiles) continue
      const calque = c.ajouterCalque(l.__identifier, { visible: l.visible ?? true })
      let retournees = 0
      for (const t of tuiles) {
        const cx = Math.floor(t.px[0] / grille)
        const cy = Math.floor(t.px[1] / grille)
        if (!c.dedans(cx, cy)) continue
        if (t.f) retournees++
        calque.cases[c.index(cx, cy)] = t.t
      }
      if (retournees) {
        avertissements.push(
          `${retournees} tuile(s) retournee(s) dans « ${l.__identifier} » : `
          + 'le retournement n\'est pas conserve',
        )
      }
    }

    cartes.push({
      nom: niveau.identifier,
      carte: c,
      monde: { x: niveau.worldX, y: niveau.worldY },
    })
  }

  if (!cartes.length) avertissements.push('aucun niveau dans ce projet')
  return { cartes, avertissements }
}

/** Reconnait un projet LDtk a son contenu. */
export function estDuLdtk(o: unknown): o is LdtkProjet {
  if (!o || typeof o !== 'object') return false
  const p = o as Record<string, unknown>
  return typeof p.jsonVersion === 'string' && Array.isArray(p.levels)
}
