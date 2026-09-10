import { Ecran, type Vue } from './ecran.ts'
import { Entrees } from './entree.ts'
import { Boucle } from './boucle.ts'
import { deplacer, type GrilleSolide } from './collision.ts'
import { CorpsMobiles, grilleAvecCorps } from './corps.ts'
import { rendreScene, suivre, type Camera } from './rendu.ts'
import {
  type Projection, ORTHO_DESSUS, projeter, boiteMonde,
} from '../noyau/projection.ts'
import type { Atlas } from './atlas.ts'
import type { Carte } from '../tuiles/tilemap.ts'
import { rect } from '../noyau/pixel.ts'
import {
  type Noeud, type NoeudSprite, type NoeudCorps, Mouvements, trouverParNom,
} from '../scene/noeud.ts'

/**
 * Le jeu : ce qui tient ensemble l'ecran, les entrees, la boucle et la scene.
 *
 * C'est aussi la surface que verra le scripting embarque. Un script attache a
 * un noeud recevra ce contexte, et rien d'autre : pas le DOM, pas le systeme
 * de fichiers, pas l'editeur. Ce n'est pas une precaution de securite — le
 * script vient de la personne elle-meme — c'est une precaution de CONCEPTION.
 * Un script qui peut toucher au DOM finira par le faire, et le jeu ne sera
 * plus exportable vers aucun autre langage.
 */
export interface ContexteJeu {
  /** Temps du pas, en secondes. Fixe. */
  readonly dt: number
  readonly entrees: Entrees
  readonly racine: Noeud
  readonly carte: Carte
  /**
   * Le decor ET les corps mobiles, reunis. C'est contre elle qu'on se deplace.
   *
   * `carte` reste le decor seul, parce que c'est lui qu'on interroge pour
   * savoir ce qu'une CASE fait — une pointe, un liquide. Confondre les deux
   * ferait croire qu'une plateforme mobile a une matiere de case, ce qui n'a
   * pas de sens : elle n'est pas dans la grille.
   */
  readonly grille: GrilleSolide
  /** Les corps mobiles du monde : plateformes, caisses, obstacles vivants. */
  readonly corps: CorpsMobiles
  /** Numero du pas depuis le demarrage. */
  readonly pas: number
  trouver(nom: string): Noeud | null
  /** Deplace un corps contre le decor. Rend ce qui a ete parcouru. */
  bouger(corps: NoeudCorps, dx: number, dy: number): { dx: number; dy: number; bloque: boolean }
}

export type Script = (c: ContexteJeu, noeud: Noeud) => void

export interface OptionsJeu {
  vue?: Vue
  pasMs?: number
  /**
   * Comment le monde se montre. Le defaut est la vue de dessus orthogonale,
   * qui est aussi la seule ou projection et monde se confondent — c'est le
   * cas ou l'on ne veut pas payer un concept qu'on n'emploie pas.
   */
  projection?: Projection
}

export class Jeu {
  readonly ecran: Ecran
  readonly entrees = new Entrees()
  readonly camera: Camera = { x: 0, y: 0 }
  readonly mouvements = new Mouvements()
  racine: Noeud
  carte: Carte
  projection: Projection
  /** Marge morte de la camera, en pixels de l'ecran. */
  margeCamera = { x: 32, y: 20 }
  /**
   * Verrouille la camera sur une salle de cette taille, en cases.
   *
   * ## Deux cameras, deux jeux differents
   *
   * La camera qui SUIT convient a un monde continu : on voit toujours autour
   * de soi, et le cadrage n'a pas de sens propre. La camera par SALLE dit tout
   * autre chose : la salle est l'unite, on la voit en entier, et l'on ne sait
   * rien de la suivante avant d'y entrer. C'est ce cadrage qui fait un Zelda,
   * un Isaac, un Metroid — le suspense y est une consequence directe de la
   * camera, pas d'un artifice.
   *
   * Elle n'a de sens qu'en projection orthogonale : en isometrique une salle
   * rectangulaire de cases est un losange a l'ecran, et le cadrage montrerait
   * quatre coins de vide.
   */
  cameraParSalle: { largeur: number; hauteur: number } | null = null
  /**
   * Duree du glissement d'une salle a l'autre, en secondes.
   *
   * Zero donne une coupe franche, comme le Zelda de 1986. Un quart de seconde
   * donne le glissement d'Isaac. Plus long, et l'on attend.
   */
  dureeTransition = 0.28
  /**
   * Les corps mobiles du monde.
   *
   * Le jeu les detient parce que c'est lui qui compose la grille contre
   * laquelle tout se deplace. Le peuplement les REMPLIT a chaque pas depuis
   * la scene, comme il remplit le reste : rien ne s'y inscrit a la main.
   */
  readonly corps = new CorpsMobiles()
  private grilleComposee: GrilleSolide | null = null
  private carteComposee: Carte | null = null
  cartes = new Map<string, { carte: Carte; atlas: Atlas }>()
  sprites = new Map<string, Atlas>()
  /** Scripts par nom de noeud. */
  scripts = new Map<string, Script>()
  private boucle: Boucle
  private cibleCamera: string | null = null

  constructor(sortie: HTMLCanvasElement, racine: Noeud, carte: Carte, opts: OptionsJeu = {}) {
    this.ecran = new Ecran(sortie, opts.vue ?? { largeur: 320, hauteur: 180 })
    this.racine = racine
    this.carte = carte
    this.projection = opts.projection ?? ORTHO_DESSUS(carte.tuile)
    this.boucle = new Boucle(
      () => this.avancer(),
      () => this.dessiner(),
      { pasMs: opts.pasMs ?? 1000 / 60 },
    )
  }

  suivreNoeud(nom: string | null): void { this.cibleCamera = nom }

  /** Le coin de la salle qui contient ce point du monde, en pixels. */
  private coinSalle(x: number, y: number): { x: number; y: number } | null {
    const s = this.cameraParSalle
    if (!s) return null
    const lp = s.largeur * this.carte.tuile
    const hp = s.hauteur * this.carte.tuile
    return { x: Math.floor(x / lp) * lp, y: Math.floor(y / hp) * hp }
  }

  /**
   * Pose la camera sur sa cible d'un coup, sans marge morte.
   *
   * A l'ouverture, la camera est a l'origine et la marge morte ne la fera
   * bouger qu'au premier pas de simulation : on ouvre donc l'editeur sur un
   * coin de carte vide pendant que le heros est ailleurs. Un cadrage immediat
   * n'est pas un detail d'agrement — c'est la difference entre voir son
   * niveau et croire qu'il ne s'est pas charge.
   */
  cadrer(): void {
    if (!this.cibleCamera) return
    const c = trouverParNom(this.racine, this.cibleCamera)
    if (!c) return
    const coin = this.coinSalle(c.x, c.y)
    if (coin) { this.camera.x = coin.x; this.camera.y = coin.y; return }
    const p = projeter(this.projection, c.x, c.y, this.carte.tuile)
    this.camera.x = p.x - this.ecran.vue.largeur / 2
    this.camera.y = p.y - this.ecran.vue.hauteur / 2
    const b = boiteMonde(this.projection, this.carte.largeur, this.carte.hauteur)
    this.camera.x = Math.max(b.x, Math.min(this.camera.x, Math.max(b.x, b.x + b.l - this.ecran.vue.largeur)))
    this.camera.y = Math.max(b.y, Math.min(this.camera.y, Math.max(b.y, b.y + b.h - this.ecran.vue.hauteur)))
  }

  demarrer(): void {
    this.entrees.brancher()
    this.boucle.demarrer()
  }

  arreter(): void {
    this.boucle.arreter()
    this.entrees.debrancher()
  }

  get tourne(): boolean { return this.boucle.tourne }
  get pas(): number { return this.boucle.pas }

  /** Un pas de simulation. Public, pour qu'un banc puisse le declencher. */
  avancer(): void {
    const ctx = this.contexte()
    for (const [nom, script] of this.scripts) {
      const n = trouverParNom(this.racine, nom)
      if (n) script(ctx, n)
    }
    if (this.cibleCamera) {
      const c = trouverParNom(this.racine, this.cibleCamera)
      if (c && this.cameraParSalle) {
        // Le cadrage par salle : la camera vise le coin de la salle occupee,
        // et y glisse. On vise le coin et non le centre du heros — sinon le
        // cadrage bougerait a l'interieur de la salle, ce qui est exactement
        // ce qu'on ne veut pas.
        const coin = this.coinSalle(c.x, c.y)
        if (coin) {
          const dt = this.boucle.pasMs / 1000
          if (this.dureeTransition <= 0) {
            this.camera.x = coin.x
            this.camera.y = coin.y
          } else {
            // Un glissement a vitesse constante, et non un lissage
            // exponentiel : le lissage n'arrive jamais tout a fait, et la
            // camera continue de ramper d'un demi-pixel bien apres que le
            // joueur a repris la main.
            const dx = coin.x - this.camera.x
            const dy = coin.y - this.camera.y
            const reste = Math.hypot(dx, dy)
            const pas = (Math.hypot(this.ecran.vue.largeur, this.ecran.vue.hauteur) / this.dureeTransition) * dt
            if (reste <= pas) {
              this.camera.x = coin.x
              this.camera.y = coin.y
            } else {
              this.camera.x += (dx / reste) * pas
              this.camera.y += (dy / reste) * pas
            }
          }
        }
      } else if (c) {
        // La camera vit dans le repere de l'ECRAN : elle cadre ce qu'on voit,
        // pas ou l'on est. Suivre la cible en coordonnees orthogonales
        // marcherait de dessus et deraperait en isometrique, ou avancer d'une
        // case vers l'est deplace de deux fois plus en largeur qu'en hauteur.
        const p = projeter(this.projection, c.x, c.y, this.carte.tuile)
        suivre(this.camera, p.x, p.y, this.ecran.vue,
          this.margeCamera.x, this.margeCamera.y,
          boiteMonde(this.projection, this.carte.largeur, this.carte.hauteur))
      }
    }
  }

  /**
   * Dessine par-dessus la scene, dans le tampon du jeu.
   *
   * L'interface d'un jeu pixel art n'est PAS du HTML pose au-dessus du
   * canevas : elle est faite des memes pixels, a la meme echelle, avec la meme
   * palette. Un coeur de vie dessine en HTML aurait une autre taille de pixel
   * que le coeur qu'on ramasse au sol, et le jeu aurait l'air de deux jeux.
   * D'ou ce crochet, qui ecrit dans le tampon avant l'agrandissement.
   */
  apresDessin: ((ctx: CanvasRenderingContext2D, ecran: Ecran) => void) | null = null

  dessiner(): void {
    rendreScene(this.ecran, this.racine, this.camera, this.cartes, this.sprites, this.projection)
    if (this.apresDessin) this.apresDessin(this.ecran.ctx, this.ecran)
    this.ecran.presenter()
  }

  private contexte(): ContexteJeu {
    const dt = this.boucle.pasMs / 1000
    return {
      dt,
      entrees: this.entrees,
      racine: this.racine,
      carte: this.carte,
      grille: this.grille,
      corps: this.corps,
      pas: this.boucle.pas,
      trouver: (nom) => trouverParNom(this.racine, nom),
      bouger: (corps, dx, dy) => this.bouger(corps, dx, dy),
    }
  }

  /**
   * Deplace un corps, en passant par son accumulateur.
   *
   * C'est le seul chemin par lequel un script fait bouger quelque chose, et
   * c'est voulu : ecrire `noeud.x += v * dt` marcherait — et casserait le
   * contrat de pixel a la premiere ligne de gameplay. Ici la fraction est
   * gardee par l'accumulateur, le pas rendu est entier, et le reste est jete
   * sur l'axe ou l'on bute.
   */
  bouger(corps: NoeudCorps, dx: number, dy: number): { dx: number; dy: number; bloque: boolean } {
    const parent = corps as Noeud
    const hote = this.hoteDe(parent) ?? parent
    const acc = this.mouvements.de(corps.id)
    const pas = acc.pas(dx, dy)
    if (!pas.x && !pas.y) return { dx: 0, dy: 0, bloque: false }

    const boite = rect(hote.x + corps.x + corps.boiteX, hote.y + corps.y + corps.boiteY,
      corps.boiteL, corps.boiteH)
    const c = deplacer(this.grille, boite, pas.x, pas.y)
    hote.x += c.dx
    hote.y += c.dy
    if (c.bloqueX) acc.bloquerX()
    if (c.bloqueY) acc.bloquerY()
    return { dx: c.dx, dy: c.dy, bloque: c.bloqueX || c.bloqueY }
  }

  /**
   * La grille composee, reconstruite seulement quand la carte change.
   *
   * On la garde d'un pas a l'autre : `bouger` avance pixel par pixel et
   * appelle la grille des dizaines de fois par corps et par pas. Fabriquer
   * l'objet a chaque appel se verrait au ramasse-miettes bien avant de se
   * voir a l'ecran.
   */
  get grille(): GrilleSolide {
    if (!this.grilleComposee || this.carteComposee !== this.carte) {
      this.grilleComposee = grilleAvecCorps(this.carte, this.corps)
      this.carteComposee = this.carte
    }
    return this.grilleComposee
  }

  /** Le noeud qui porte ce corps : c'est lui qu'on deplace, pas la boite. */
  private hoteDe(corps: Noeud): Noeud | null {
    const chercher = (n: Noeud): Noeud | null => {
      for (const e of n.enfants) {
        if (e.id === corps.id) return n
        const r = chercher(e)
        if (r) return r
      }
      return null
    }
    return chercher(this.racine)
  }
}

export type { NoeudSprite }
