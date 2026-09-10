import { creerNoeud, type Noeud, type NoeudSprite } from '../scene/noeud.ts'
import type { ContexteJeu, Jeu } from '../runtime/jeu.ts'
import type { Ecran } from '../runtime/ecran.ts'
import { Combat, visibleSousInvulnerabilite, type Vitalite } from '../runtime/combat.ts'
import { Lecteur, type Clip } from '../runtime/animation.ts'
import { type Projection, ORTHO_DESSUS } from '../noyau/projection.ts'
import { rect } from '../noyau/pixel.ts'
import { rectDeTuile, type Atlas } from '../runtime/atlas.ts'
import { Sonneur } from '../runtime/son.ts'
import { Particules, emission, type Emission } from '../runtime/particules.ts'
import { Peuplement, type Espece } from '../runtime/entites.ts'
import { clipsDemo, ESPECES_DEMO } from './especes-demo.ts'
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
  /**
   * Millisecondes entre la mort et la reapparition. Zero : on ne reapparait
   * pas, et c'est au jeu de decider quoi faire.
   *
   * Six dixiemes : assez pour voir qu'on est mort, assez peu pour ne pas
   * attendre. Celeste tient a cette valeur — mourir mille fois n'est
   * supportable que si mourir est bref.
   */
  reapparitionMs?: number
  /** Le catalogue employe. Par defaut celui de la demonstration. */
  especes?: Espece[]
  /** Les clips. Par defaut tous ceux de la demonstration, heros compris. */
  clips?: Clip[]
  /** La projection, pour les entites dirigees au clavier. */
  projection?: Projection
  tuile?: number
}

export class Aventure {
  readonly combat = new Combat()
  readonly peuplement: Peuplement
  readonly lecteurTaillade = new Lecteur(clipsDemo())
  private heros: NoeudSprite
  /**
   * La vitalite du heros, quand PERSONNE d'autre ne la tient.
   *
   * Des que le heros porte une espece, c'est le peuplement qui l'inscrit au
   * combat, et l'aventure doit se servir de CETTE inscription-la. En garder
   * une deuxieme donnait deux objets pour un seul personnage : le combat
   * blessait l'un, l'aventure lisait l'autre, et le heros mourait sans jamais
   * reapparaitre — parce que celle qu'on lisait n'etait jamais morte. Le
   * defaut ne se voyait pas au banc, dont le heros de test ne porte pas
   * d'espece, et se voyait tout de suite en jouant.
   */
  private vieDeSecours: Vitalite
  private taillade: NoeudSprite
  private reposArme = 0
  private pvMax: number
  private surMort: (() => void) | null
  /** Ce que le joueur a abattu, pour la barre d'etat. */
  abattus = 0
  /** Ce qu'il a ramasse. */
  ramasses = 0
  /** Combien de fois il est mort. Celeste en fait un titre de gloire. */
  morts = 0
  /** Combien de balises il a allumees. */
  balisesAtteintes = 0

  /**
   * Ou l'on repart.
   *
   * C'est le jeu qui le deplace — a l'entree d'une salle, a un drapeau, a un
   * feu de camp. L'aventure ne fait que s'en servir : elle n'a aucune idee de
   * ce qui merite d'etre un point de reprise.
   */
  reapparition: { x: number; y: number }
  private attenteReapparition = 0

  /**
   * Le son et les etincelles : de la PRESENTATION, pas de la simulation.
   *
   * Ils ne decident de rien, ils ne partent pas dans un instantane, et
   * l'empreinte du jeu ne les voit pas. Le sonneur, lui, retient ce qu'il a
   * deja joue : sans quoi une correction reseau de cinquante pas ferait
   * entendre cinquante bruits de pas d'un coup.
   */
  readonly sonneur = new Sonneur()
  readonly particules = new Particules(1)
  /** Le pas courant, pour que le sonneur sache ce qu'il a deja joue. */
  private pasCourant = 0

  /** Les gerbes, decrites en donnees comme le reste. */
  gerbes: Record<string, Emission> = {
    // Le coup part vers le haut et retombe : c'est ce qui se lit comme un
    // impact plutot que comme une explosion.
    coup: emission({
      nombre: 7, vie: 260, vieVariation: 90, vitesse: 90, vitesseVariation: 45,
      angle: -90, ouverture: 180, pesanteur: 340,
      couleurs: ['#fff0b0', '#f0c860', '#c0334a'],
    }),
    mort: emission({
      nombre: 22, vie: 520, vieVariation: 200, vitesse: 130, vitesseVariation: 70,
      angle: -90, ouverture: 300, pesanteur: 300,
      couleurs: ['#e8ecf4', '#a8b4c8', '#4a3d6b'],
    }),
    ramasse: emission({
      nombre: 10, vie: 380, vieVariation: 120, vitesse: 55, vitesseVariation: 25,
      angle: -90, ouverture: 90, pesanteur: -40, frottement: 2,
      couleurs: ['#fff0b0', '#7fd4a8', '#3f9b52'],
    }),
  }
  private delaiReapparition: number

  constructor(racine: Noeud, heros: NoeudSprite, opts: OptionsAventure = {}) {
    this.heros = heros
    this.pvMax = opts.pvHeros ?? 3
    this.surMort = opts.surMort ?? null
    this.delaiReapparition = opts.reapparitionMs ?? 600
    this.reapparition = { x: heros.x, y: heros.y }
    this.peuplement = new Peuplement(
      racine, this.combat, opts.especes ?? ESPECES_DEMO, opts.clips ?? clipsDemo(),
      opts.projection ?? ORTHO_DESSUS(opts.tuile ?? TUILE), opts.tuile ?? TUILE,
    )

    // Le peuplement d'abord : s'il adopte le heros, c'est lui qui l'inscrit.
    this.peuplement.synchroniser()
    this.vieDeSecours = this.combat.vies.get(heros.id) ?? this.combat.inscrire(heros.id, {
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

  /** La vitalite qui fait foi : celle du combat, toujours. */
  private get vieHeros(): Vitalite {
    return this.combat.vies.get(this.heros.id) ?? this.vieDeSecours
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
    // Le pas vient du CONTEXTE et non d'un compteur a nous : c'est lui que le
    // rembobinage remet en arriere, et c'est sur lui que le sonneur se repere
    // pour ne pas rejouer ce qu'il a deja joue.
    this.pasCourant = c.pas
    this.vieHeros.x = this.heros.x
    this.vieHeros.y = this.heros.y

    // La mort d'abord : un mort ne frappe pas, ne ramasse pas, et ne se fait
    // pas frapper. Le laisser vivre le temps du compte a rebours donnerait des
    // degats posthumes, et un compteur de morts qui monte par deux.
    if (this.vieHeros.mort) {
      this.attenteReapparition -= dtMs
      this.heros.visible = Math.floor(this.attenteReapparition / 90) % 2 === 0
      if (this.delaiReapparition > 0 && this.attenteReapparition <= 0) this.reapparaitre()
      return
    }

    this.reposArme = Math.max(0, this.reposArme - dtMs)
    if (c.entrees.consommer('action') && this.reposArme === 0 && !this.vieHeros.mort) {
      this.sonneur.evenement(this.pasCourant, this.heros.id, 'coup')
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

    // La scene est la verite : une entite ajoutee par l'editeur entre dans le
    // jeu au pas suivant, une entite retiree en sort. Rien a prevenir.
    this.peuplement.synchroniser()
    // Les evenements d'animation deviennent des sons. Le clip dit QUAND, la
    // banque dit QUOI : le pas sonne a l'image ou le pied touche, pas a
    // intervalle regulier.
    for (const e of this.peuplement.avancer(c, this.heros, dtMs)) {
      this.sonneur.evenement(this.pasCourant, e.id, e.nom)
    }
    this.ramasser(c)

    for (const impact of this.combat.avancer(dtMs)) {
      if (impact.cible === this.heros.id) {
        // La poussee est appliquee d'un coup : un recul etale sur plusieurs
        // images demanderait une vitesse a garder, donc un etat de plus, pour
        // un effet que personne ne distingue a cette echelle.
        const corps = this.heros.enfants.find((e) => e.type === 'corps')
        if (corps) c.bouger(corps as never, impact.pousseeX * 0.06, impact.pousseeY * 0.06)
        this.sonneur.evenement(this.pasCourant, this.heros.id, impact.fatal ? 'mort' : 'touche')
        this.particules.emettre(
          this.gerbes[impact.fatal ? 'mort' : 'coup'], this.heros.x, this.heros.y - TUILE / 2,
        )
        if (impact.fatal) {
          this.morts++
          this.attenteReapparition = this.delaiReapparition
          this.combat.frappes.length = 0
          if (this.surMort) this.surMort()
        }
      } else {
        const vie = this.combat.vies.get(impact.cible)
        this.particules.emettre(
          this.gerbes[impact.fatal ? 'mort' : 'coup'],
          vie ? vie.x : this.heros.x, (vie ? vie.y : this.heros.y) - TUILE / 2,
        )
        this.sonneur.evenement(this.pasCourant, impact.cible, impact.fatal ? 'abattu' : 'coup')
        if (impact.fatal && this.peuplement.tuer(impact.cible)) this.abattus++
      }
    }

    if (this.taillade.visible) {
      this.lecteurTaillade.avancer(dtMs)
      this.taillade.image = this.lecteurTaillade.image
      if (this.lecteurTaillade.termine) this.taillade.visible = false
    }

    this.heros.visible = visibleSousInvulnerabilite(this.vieHeros.invulnerable)
    this.particules.avancer(dtMs)
  }

  /**
   * Ce que le heros ramasse en passant dessus.
   *
   * Un coeur au sol est une entite comme une autre : ce qui le distingue est
   * une valeur dans sa description, `soigne`. Inventer un systeme d'objets a
   * cote du systeme d'entites reviendrait a ecrire deux fois le placement, la
   * serialisation et le rendu.
   */
  private ramasser(c: ContexteJeu): void {
    void c
    const b = this.vieHeros.boite
    const touches = this.peuplement.quiTouche(
      this.heros.x + b.x, this.heros.y + b.y, b.l, b.h,
    )
    for (const n of touches) {
      const e = this.peuplement.especeDeNoeud(n.id)
      if (!e) continue
      // Une balise ne se ramasse pas : elle reste, et l'on peut y revenir.
      if (e.reprise) {
        if (this.reapparition.x !== n.x || this.reapparition.y !== n.y) {
          this.reapparition = { x: n.x, y: n.y }
          this.balisesAtteintes++
          this.sonneur.evenement(this.pasCourant, n.id, 'balise')
          this.particules.emettre(this.gerbes.ramasse, n.x, n.y - TUILE / 2)
        }
        continue
      }
      if (e.soigne <= 0) continue
      if (this.vieHeros.pv >= this.pvMax) continue
      this.vieHeros.pv = Math.min(this.pvMax, this.vieHeros.pv + e.soigne)
      this.sonneur.evenement(this.pasCourant, n.id, 'ramasse')
      this.particules.emettre(this.gerbes.ramasse, n.x, n.y - TUILE / 2)
      this.peuplement.tuer(n.id)
      this.ramasses++
    }
  }

  /**
   * Remet le heros sur pied a son point de reprise.
   *
   * Il repart INVULNERABLE un instant. Sans cela, reapparaitre dans la pointe
   * qui vient de tuer recommence la mort a l'image suivante, et l'on ne
   * comprend meme pas ce qui se passe.
   */
  reapparaitre(): void {
    this.heros.x = this.reapparition.x
    this.heros.y = this.reapparition.y
    this.heros.visible = true
    this.vieHeros.mort = false
    this.vieHeros.pv = this.pvMax
    this.vieHeros.invulnerable = 900
    this.vieHeros.x = this.heros.x
    this.vieHeros.y = this.heros.y
    this.attenteReapparition = 0
    this.peuplement.reinitialiserControleur(this.heros.id)
  }

  /** Remet la vie, vide le peuplement et efface les frappes en vol. */
  reinitialiser(): void {
    this.peuplement.vider()
    this.combat.reinitialiser()
    this.peuplement.oublier()
    this.abattus = 0
    this.ramasses = 0
    this.morts = 0
    this.balisesAtteintes = 0
    this.attenteReapparition = 0
    this.reapparition = { x: this.heros.x, y: this.heros.y }
    this.reposArme = 0
    this.taillade.visible = false
    this.lecteurTaillade.reinitialiser()
    this.heros.visible = true
    this.peuplement.synchroniser()
    this.vieDeSecours = this.combat.vies.get(this.heros.id) ?? this.combat.inscrire(this.heros.id, {
      max: this.pvMax,
      camp: 'heros',
      boite: { x: -5, y: -14, l: 10, h: 14 },
      x: this.heros.x,
      y: this.heros.y,
    })
    // Une partie qui recommence ne doit ni entendre ni voir la precedente.
    this.sonneur.vider()
    this.particules.vider()
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
      // Les etincelles AVANT l'interface : elles appartiennent au monde, donc
      // elles passent sous les coeurs et suivent la camera. Les dessiner par
      // dessus les ferait voler devant la jauge de vie.
      const ox = -Math.round(jeu.camera.x)
      const oy = -Math.round(jeu.camera.y)
      for (const p of this.particules.points()) {
        ctx.fillStyle = p.couleur
        ctx.fillRect(p.x + ox, p.y + oy, 1, 1)
      }
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
