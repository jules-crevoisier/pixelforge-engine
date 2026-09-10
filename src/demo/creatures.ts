import { creerNoeud, type Noeud, type NoeudSprite, type NoeudCorps } from '../scene/noeud.ts'
import type { ContexteJeu } from '../runtime/jeu.ts'
import {
  Combat, visibleSousInvulnerabilite, INVULNERABILITE_ENNEMI_MS, type Camp,
} from '../runtime/combat.ts'
import { Lecteur, clipRegulier, type Clip } from '../runtime/animation.ts'
import { rect } from '../noyau/pixel.ts'
import { GELEE, CHAUVE_SOURIS, TAILLADE, COEUR_PLEIN } from './art-creatures.ts'
import { TUILE } from './art.ts'

/**
 * Les creatures, et ce qui leur arrive.
 *
 * ## Pourquoi une troupe et non un tableau d'ennemis
 *
 * Un ennemi n'est pas une chose : c'est un noeud dans la scene, une vitalite
 * dans le systeme de combat, un lecteur d'animation, et une intention. Ces
 * quatre-la doivent naitre et mourir ENSEMBLE. Un tableau d'ennemis oblige
 * l'appelant a s'en souvenir, et il l'oublie : la vitalite d'un ennemi
 * disparu continue de recevoir des coups, le noeud reste dessine, le lecteur
 * tourne pour rien. La troupe est l'endroit ou ce quatuor est tenu.
 */
export type Espece = 'gelee' | 'chauve-souris'

interface Creature {
  espece: Espece
  noeud: NoeudSprite
  corps: NoeudCorps
  lecteur: Lecteur
  /** Direction de patrouille, pour la gelee. */
  dir: number
  /** Millisecondes avant le prochain bond. */
  attente: number
}

export function clipsCreatures(): Clip[] {
  return [
    // La gelee respire en aller-retour : les quatre temps sont deja un cycle
    // ferme, et le lire en boucle ferait sauter du dernier au premier.
    clipRegulier('gelee', GELEE, 160, { boucle: 'aller-retour' }),
    clipRegulier('chauve-souris', CHAUVE_SOURIS, 110),
    clipRegulier('taillade', TAILLADE, 60, { boucle: 'unique' }),
    clipRegulier('coeur', [COEUR_PLEIN], 1000),
  ]
}

/**
 * Distance au-dela de laquelle une creature ne fait plus rien, en pixels.
 *
 * Ce n'est pas une optimisation, c'est une regle de JEU. Sans elle, toutes les
 * creatures de l'etage convergent des la premiere seconde et le joueur affronte
 * les vingt-deux d'un coup dans le couloir de depart. Une creature vit dans sa
 * salle ; elle attend qu'on vienne. La valeur vaut un peu plus qu'une salle,
 * pour qu'une creature ne s'immobilise pas net au bord de l'ecran.
 */
export const RAYON_ACTIVITE = 340

/** Duree d'un bond de gelee, et du repos qui suit, en millisecondes. */
const DUREE_BOND = 520
const DUREE_REPOS = 380

/** Ce qu'une espece vaut : vie, vitesse, degats au contact, taille. */
const ESPECES: Record<Espece, {
  pv: number; vitesse: number; degats: number; boite: { x: number; y: number; l: number; h: number }
}> = {
  gelee: { pv: 2, vitesse: 34, degats: 1, boite: { x: -5, y: -7, l: 10, h: 7 } },
  'chauve-souris': { pv: 1, vitesse: 52, degats: 1, boite: { x: -5, y: -12, l: 10, h: 8 } },
}

export class Troupe {
  private creatures: Creature[] = []
  private racine: Noeud
  private combat: Combat
  private clips: Clip[]

  constructor(racine: Noeud, combat: Combat) {
    this.racine = racine
    this.combat = combat
    this.clips = clipsCreatures()
  }

  get vivantes(): number { return this.creatures.length }

  ajouter(espece: Espece, x: number, y: number): NoeudSprite {
    const def = ESPECES[espece]
    const n = creerNoeud('sprite', `${espece}-${this.creatures.length}`) as NoeudSprite
    n.source = 'creatures'
    n.ancreX = TUILE / 2
    n.ancreY = TUILE
    n.x = x
    n.y = y

    const corps = creerNoeud('corps', 'corps') as NoeudCorps
    corps.boiteX = def.boite.x
    corps.boiteY = def.boite.y
    corps.boiteL = def.boite.l
    corps.boiteH = def.boite.h
    n.enfants.push(corps)
    this.racine.enfants.push(n)

    const lecteur = new Lecteur(this.clips)
    lecteur.jouer(espece)
    n.image = lecteur.image

    this.combat.inscrire(n.id, {
      max: def.pv, camp: 'ennemi' as Camp, boite: def.boite, x, y,
      invulnerabiliteMs: INVULNERABILITE_ENNEMI_MS,
    })
    this.creatures.push({ espece, noeud: n, corps, lecteur, dir: 1, attente: 0 })
    return n
  }

  /**
   * Un pas de toute la troupe.
   *
   * Le contact blesse par une frappe d'une seule image, refaite a chaque pas.
   * On pourrait imaginer une « zone qui blesse en permanence » ; ce serait un
   * deuxieme mecanisme a cote des frappes, avec ses propres regles de
   * repetition — donc deux endroits ou se tromper. Une frappe d'une image
   * passe par le meme chemin que tout le reste, et l'invulnerabilite du heros
   * suffit a l'empecher de vider sa vie en une seconde.
   */
  avancer(c: ContexteJeu, cible: NoeudSprite, dtMs: number): void {
    for (const cr of this.creatures) {
      const vie = this.combat.vies.get(cr.noeud.id)
      if (!vie) continue
      const def = ESPECES[cr.espece]
      const dx = cible.x - cr.noeud.x
      const dy = cible.y - cr.noeud.y
      const distance = Math.hypot(dx, dy)
      if (distance > RAYON_ACTIVITE) continue

      if (cr.espece === 'chauve-souris') {
        // Elle fonce, toujours. Une chauve-souris qui hesite n'est plus une
        // chauve-souris.
        const n = distance || 1
        c.bouger(cr.corps, (dx / n) * def.vitesse * c.dt, (dy / n) * def.vitesse * c.dt)
      } else {
        // La gelee bondit par a-coups : elle avance une demi-seconde, puis
        // s'arrete. C'est ce qui rend une poursuite lente evitable — un
        // poursuivant lent mais continu est plus injuste qu'un poursuivant
        // rapide qu'on peut contourner.
        // Le compteur descend en permanence. Au-dessus de zero elle se repose,
        // en dessous elle bondit ; passe le temps du bond, il remonte. Un seul
        // nombre pour les deux phases, donc aucun etat a garder coherent.
        cr.attente -= dtMs
        if (cr.attente <= 0) {
          const versLeHeros = distance < 90
          const ax = versLeHeros ? Math.sign(dx) : cr.dir
          const ay = versLeHeros ? Math.sign(dy) : 0
          const n = Math.hypot(ax, ay) || 1
          const r = c.bouger(cr.corps, (ax / n) * def.vitesse * c.dt, (ay / n) * def.vitesse * c.dt)
          if (r.bloque) cr.dir = -cr.dir
          if (cr.attente <= -DUREE_BOND) cr.attente = DUREE_REPOS
        }
      }

      vie.x = cr.noeud.x
      vie.y = cr.noeud.y
      cr.noeud.visible = visibleSousInvulnerabilite(vie.invulnerable)
      cr.lecteur.avancer(dtMs)
      cr.noeud.image = cr.lecteur.image

      // Le contact : une frappe d'une image, a la place de la creature.
      this.combat.frapper('ennemi', rect(
        cr.noeud.x + def.boite.x, cr.noeud.y + def.boite.y, def.boite.l, def.boite.h,
      ), def.degats, 1, 150, dx, dy)
    }
  }

  /** Retire une creature morte, noeud, vitalite et lecteur d'un seul geste. */
  tuer(id: string): boolean {
    const i = this.creatures.findIndex((c) => c.noeud.id === id)
    if (i < 0) return false
    const cr = this.creatures[i]
    this.creatures.splice(i, 1)
    this.combat.retirer(id)
    const j = this.racine.enfants.indexOf(cr.noeud)
    if (j >= 0) this.racine.enfants.splice(j, 1)
    return true
  }

  /** Vide la troupe : pour recommencer une partie. */
  vider(): void {
    for (const cr of [...this.creatures]) this.tuer(cr.noeud.id)
  }

  positions(): { x: number; y: number }[] {
    return this.creatures.map((c) => ({ x: c.noeud.x, y: c.noeud.y }))
  }
}
