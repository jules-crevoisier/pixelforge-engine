import { creerNoeud, type Noeud, type NoeudSprite } from '../scene/noeud.ts'
import type { ContexteJeu, Jeu } from '../runtime/jeu.ts'
import type { Ecran } from '../runtime/ecran.ts'
import { Combat, visibleSousInvulnerabilite, type Vitalite } from '../runtime/combat.ts'
import { Lecteur } from '../runtime/animation.ts'
import { rect } from '../noyau/pixel.ts'
import { rectDeTuile, type Atlas } from '../runtime/atlas.ts'
import { Troupe, clipsCreatures } from './creatures.ts'
import { COEUR_PLEIN, COEUR_PERDU } from './art-creatures.ts'
import { TUILE } from './art.ts'

/**
 * L'aventure : ce qui transforme une promenade en jeu.
 *
 * Une vie, des coups a donner, des coups a recevoir, et un ecran qui le dit.
 * C'est le plus petit ensemble qui fasse la difference entre « on peut s'y
 * deplacer » et « on peut y perdre ».
 *
 * ## Pourquoi c'est ici et non dans le moteur
 *
 * Trois points de vie, une epee de 120 millisecondes, un coeur en haut a
 * gauche : ce sont des choix de JEU, pas de moteur. Le moteur fournit les
 * frappes, les vitalites, l'invulnerabilite et le crochet de dessin ; ce
 * fichier decide ce qu'on en fait. Un autre jeu ecrirait le sien, et il
 * n'aurait rien a changer sous lui.
 */

/**
 * L'epee : sa portee devant soi, et son epaisseur.
 *
 * La boite part du CORPS et s'etend vers l'avant. Une premiere version la
 * posait, carree, a dix-huit pixels devant le personnage : elle ratait tout ce
 * qui etait colle a lui, c'est-a-dire exactement ce qui venait de le toucher.
 * On frappait dans le vide au moment ou l'on en avait le plus besoin.
 */
const PORTEE = 22
const EPAISSEUR = 18
/** Duree pendant laquelle la boite de frappe existe. */
const DUREE_FRAPPE_MS = 120
/** Delai entre deux coups. */
const REPOS_ARME_MS = 320
/** Poussee subie par ce qu'on touche. */
const POUSSEE = 190

export interface OptionsAventure {
  pvHeros?: number
  surMort?: () => void
}

export class Aventure {
  readonly combat = new Combat()
  readonly troupe: Troupe
  readonly lecteurTaillade = new Lecteur(clipsCreatures())
  private heros: NoeudSprite
  private vieHeros: Vitalite
  private taillade: NoeudSprite
  private reposArme = 0
  private pvMax: number
  private surMort: (() => void) | null
  /** Ce que le joueur a abattu, pour la barre d'etat. */
  abattus = 0

  constructor(racine: Noeud, heros: NoeudSprite, opts: OptionsAventure = {}) {
    this.heros = heros
    this.pvMax = opts.pvHeros ?? 3
    this.surMort = opts.surMort ?? null
    this.troupe = new Troupe(racine, this.combat)

    this.vieHeros = this.combat.inscrire(heros.id, {
      max: this.pvMax,
      camp: 'heros',
      boite: { x: -5, y: -14, l: 10, h: 14 },
      x: heros.x,
      y: heros.y,
    })

    // La taillade est un noeud a part, pose dans le MONDE a l'endroit du coup
    // — pas un enfant du heros. Un effet qui suit son auteur permet de reculer
    // en plein geste et de frapper quand meme devant soi.
    this.taillade = creerNoeud('sprite', 'taillade') as NoeudSprite
    this.taillade.source = 'creatures'
    this.taillade.ancreX = TUILE / 2
    this.taillade.ancreY = TUILE / 2
    this.taillade.visible = false
    this.taillade.couche = 1
    racine.enfants.push(this.taillade)
  }

  get pv(): number { return this.vieHeros.pv }
  get max(): number { return this.pvMax }
  get mort(): boolean { return this.vieHeros.mort }

  /**
   * Un pas d'aventure.
   *
   * `regard` est la direction du personnage, en pixels : c'est elle qui place
   * la frappe. On ne la deduit pas des touches — on peut frapper sans bouger,
   * et l'epee doit alors partir la ou l'on regarde.
   */
  avancer(c: ContexteJeu, regard: { x: number; y: number }): void {
    const dtMs = c.dt * 1000
    this.vieHeros.x = this.heros.x
    this.vieHeros.y = this.heros.y

    this.reposArme = Math.max(0, this.reposArme - dtMs)
    if (c.entrees.consommer('action') && this.reposArme === 0 && !this.vieHeros.mort) {
      // Le torse, et non les pieds : c'est la hauteur ou une epee passe, et
      // c'est celle des creatures qu'on veut toucher.
      const torse = this.heros.y - TUILE / 2
      const horizontal = Math.abs(regard.x) >= Math.abs(regard.y)
      const sens = horizontal ? (Math.sign(regard.x) || 1) : (Math.sign(regard.y) || 1)
      const boite = horizontal
        ? rect(sens > 0 ? this.heros.x - 2 : this.heros.x + 2 - PORTEE,
          torse - EPAISSEUR / 2, PORTEE, EPAISSEUR)
        : rect(this.heros.x - EPAISSEUR / 2,
          sens > 0 ? torse - 2 : torse + 2 - PORTEE, EPAISSEUR, PORTEE)
      const dx = horizontal ? sens : 0
      const dy = horizontal ? 0 : sens
      this.combat.frapper('heros', boite, 1, DUREE_FRAPPE_MS, POUSSEE, dx, dy)

      // La taillade se pose au bout de la portee, la ou l'oeil suit le geste.
      this.taillade.x = this.heros.x + dx * (PORTEE - 4)
      this.taillade.y = torse + dy * (PORTEE - 4)
      this.taillade.visible = true
      this.taillade.miroir = dx < 0
      this.lecteurTaillade.jouer('taillade', true)
      this.reposArme = REPOS_ARME_MS
    }

    this.troupe.avancer(c, this.heros, dtMs)

    for (const impact of this.combat.avancer(dtMs)) {
      if (impact.cible === this.heros.id) {
        // La poussee est appliquee d'un coup : un recul etale sur plusieurs
        // images demanderait une vitesse a garder, donc un etat de plus, pour
        // un effet que personne ne distingue a cette echelle.
        const corps = this.heros.enfants.find((e) => e.type === 'corps')
        if (corps) c.bouger(corps as never, impact.pousseeX * 0.06, impact.pousseeY * 0.06)
        if (impact.fatal && this.surMort) this.surMort()
      } else if (impact.fatal) {
        if (this.troupe.tuer(impact.cible)) this.abattus++
      }
    }

    if (this.taillade.visible) {
      this.lecteurTaillade.avancer(dtMs)
      this.taillade.image = this.lecteurTaillade.image
      if (this.lecteurTaillade.termine) this.taillade.visible = false
    }

    this.heros.visible = visibleSousInvulnerabilite(this.vieHeros.invulnerable)
  }

  /** Remet la vie, vide la troupe et efface les frappes en vol. */
  reinitialiser(): void {
    this.troupe.vider()
    this.combat.reinitialiser()
    this.abattus = 0
    this.reposArme = 0
    this.taillade.visible = false
    this.lecteurTaillade.reinitialiser()
    this.heros.visible = true
    this.vieHeros = this.combat.inscrire(this.heros.id, {
      max: this.pvMax,
      camp: 'heros',
      boite: { x: -5, y: -14, l: 10, h: 14 },
      x: this.heros.x,
      y: this.heros.y,
    })
  }

  /**
   * Les coeurs, dessines dans le tampon du jeu.
   *
   * Ils sont pris dans la MEME planche que les coeurs qu'on ramasse. Un coeur
   * d'interface dessine autrement finirait par ne plus ressembler au coeur du
   * sol, et le joueur ne ferait pas le lien.
   */
  installerEcran(jeu: Jeu): void {
    jeu.apresDessin = (ctx: CanvasRenderingContext2D, ecran: Ecran): void => {
      const atlas = jeu.sprites.get('creatures') as Atlas | undefined
      if (!atlas) return
      void ecran
      for (let i = 0; i < this.pvMax; i++) {
        const plein = i < this.vieHeros.pv
        const { sx, sy } = rectDeTuile(atlas, plein ? COEUR_PLEIN : COEUR_PERDU)
        ctx.drawImage(atlas.canevas as CanvasImageSource, sx, sy, atlas.largeur, atlas.hauteur,
          2 + i * 12, -2, atlas.largeur, atlas.hauteur)
      }
    }
  }
}
