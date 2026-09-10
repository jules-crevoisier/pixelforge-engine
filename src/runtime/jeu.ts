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
import { Salles, type Salle } from '../niveau/salles.ts'
import type { Sonneur } from './son.ts'
import type { Musicien } from './musique.ts'
import type { Declencheurs } from './declencheurs.ts'
import { retirerDe } from './entites.ts'

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
  /**
   * Les entrees d'un joueur donne, pour un monde a plusieurs.
   *
   * ## Pourquoi une FONCTION et non un tableau
   *
   * Une entite dirigee demande « mes entrees » sans savoir combien de joueurs
   * existent, ni si le jeu est en reseau. Un tableau l'obligerait a connaitre
   * son rang ; une fonction lui permet de ne connaitre que son NOM — celui que
   * porte son noeud. C'est la meme raison qui fait qu'une espece porte un nom
   * d'intention et non un numero.
   *
   * Sans joueur nomme, on rend les entrees communes : c'est le cas d'un jeu
   * solo, et il ne doit rien couter.
   */
  entreesDe?(joueur: string): Entrees
  /** Les corps mobiles du monde : plateformes, caisses, obstacles vivants. */
  readonly corps: CorpsMobiles
  /** Numero du pas depuis le demarrage. */
  readonly pas: number
  trouver(nom: string): Noeud | null
  /** Deplace un corps contre le decor. Rend ce qui a ete parcouru. */
  bouger(corps: NoeudCorps, dx: number, dy: number): { dx: number; dy: number; bloque: boolean }
  /**
   * Ce qu'un script peut FAIRE, au-dela de bouger des corps.
   *
   * Chaque verbe ici a un correspondant direct dans les donnees du projet —
   * un son, une musique, un dialogue, une espece, une salle portent tous un
   * NOM dans le fichier. C'est ce qui garde les scripts exportables : un
   * verbe qui prendrait un objet du navigateur ne passerait pas la frontiere.
   *
   * Et chaque verbe REND quelque chose : un script qui joue un son inconnu
   * merite de pouvoir s'en apercevoir, au lieu d'un silence sans explication.
   */
  /** Joue un son par son nom. Deja joue a ce pas par cette source : rien. */
  jouer(son: string, source?: string): boolean
  /** Lance une musique par son nom. Deja elle qui joue : rien. */
  musique(nom: string): boolean
  /** Ouvre une suite de repliques par son nom. Inconnue : rien. */
  dire(dialogue: string): boolean
  /** Secoue la camera. Le plus fort l'emporte. */
  secouer(amplitude: number, ms: number): void
  /** Gele la simulation — le hit-stop. Le plus long l'emporte. */
  geler(ms: number): void
  /** Le nom du tableau ou l'on est, ou vide si le monde est continu. */
  readonly salle: string
  /** Pose une entite d'une espece du catalogue. Espece inconnue : null. */
  poser(espece: string, x: number, y: number): Noeud | null
  /** Retire un noeud de la scene, ou qu'il soit. */
  retirer(noeud: Noeud): boolean
  /**
   * Change de carte, par son nom. La meme carte, ou une inconnue : rien.
   *
   * C'est le verbe qui fait d'un projet multi-cartes un JEU : la zone de
   * sortie d'un niveau est un declencheur qui appelle `aller` ou
   * `niveauSuivant`. La carte, la scene et les creatures changent ensemble —
   * chaque carte a la scene du meme nom.
   */
  aller(carte: string): boolean
  /** La carte suivante du deroule. Au bout, ou sans deroule : rien. */
  niveauSuivant(): boolean
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
   * Le decoupage du niveau en salles POSEES A LA MAIN, a la Celeste.
   *
   * Il l'emporte sur `cameraParSalle`, qui decoupe une carte en rectangles
   * tous identiques : ce decoupage-la convient a des salles engendrees, pas a
   * un chapitre dessine ou la forme de chaque tableau est une decision.
   *
   * Quand il est pose, la camera ne sort jamais de la salle courante et
   * glisse d'un tableau a l'autre quand on en change.
   */
  salles: Salles | null = null
  /**
   * Ce qui reste du glissement entre deux tableaux, en secondes.
   *
   * Il ne sert qu'a BORNER la vitesse de la camera : sans lui, changer de
   * salle la teleporterait d'un ecran, et l'oeil perdrait le fil de ou l'on
   * se trouve. Pendant le glissement, le jeu continue — Celeste ne s'arrete
   * pas pour changer de tableau, et s'arreter casserait un enchainement.
   */
  private glissement = 0
  /** Appele quand on entre dans une nouvelle salle. */
  surSalle: ((s: Salle) => void) | null = null
  /**
   * Duree du glissement d'une salle a l'autre, en secondes.
   *
   * Zero donne une coupe franche, comme le Zelda de 1986. Un quart de seconde
   * donne le glissement d'Isaac. Plus long, et l'on attend.
   */
  dureeTransition = 0.28

  /**
   * Le temps d'arret d'un impact, en millisecondes restantes.
   *
   * ## Ce que le hit-stop repare
   *
   * Un coup qui touche sans que rien ne s'arrete se lit comme un coup qui
   * TRAVERSE. Deux ou trois images de gel, et le meme coup PORTE : l'oeil a le
   * temps de voir la rencontre, et le cerveau lui attribue un poids. C'est la
   * technique la moins chere et la plus efficace du genre, et celle qu'aucun
   * moteur generaliste ne propose parce qu'elle contredit l'idee d'une
   * simulation reguliere.
   *
   * ## Pourquoi elle GELE la simulation et non l'affichage
   *
   * On pourrait ralentir le temps. Ce n'est pas la meme chose : un
   * ralentissement etale le mouvement, un arret le SUSPEND. C'est
   * l'interruption nette qui fait l'impact — la meme raison qui fait qu'une
   * image fixe d'un coup est plus violente qu'un fondu.
   *
   * L'affichage, lui, continue : sans quoi la fenetre paraitrait figee, et
   * l'on ne verrait pas les etincelles jaillir pendant l'arret.
   */
  private gelRestant = 0

  /**
   * La secousse de camera : amplitude en pixels, et duree restante.
   *
   * Elle est ENTIERE et reproductible. Un tremblement en sous-pixel fait
   * onduler toute la grille — le defaut exact que l'echelle entiere existe
   * pour eviter, reintroduit par la porte de derriere. Et un tremblement tire
   * au sort ferait diverger deux captures d'ecran de la meme partie.
   */
  private secousseAmplitude = 0
  private secousseRestante = 0
  private secousseDuree = 1
  private secousseGraine = 1

  /**
   * Gele la simulation quelques millisecondes. L'affichage continue.
   *
   * Le plus long l'emporte : deux coups au meme instant ne doivent pas
   * additionner leurs arrets, sinon une melee fige le jeu une demi-seconde.
   */
  geler(ms: number): void { this.gelRestant = Math.max(this.gelRestant, ms) }

  /** Secoue la camera. Le plus fort l'emporte, pour la meme raison. */
  secouer(amplitude: number, ms: number): void {
    if (this.secousseRestante > 0 && amplitude <= this.secousseAmplitude) return
    this.secousseAmplitude = amplitude
    this.secousseRestante = ms
    this.secousseDuree = Math.max(1, ms)
    this.secousseGraine = (Math.imul(this.secousseGraine, 1664525) + 1013904223) >>> 0
  }

  get gele(): boolean { return this.gelRestant > 0 }
  get secousse(): number {
    return this.secousseRestante > 0
      ? this.secousseAmplitude * (this.secousseRestante / this.secousseDuree)
      : 0
  }

  /**
   * Le decalage de la secousse a cet instant, en pixels ENTIERS.
   *
   * L'amplitude decroit lineairement : une decroissance exponentielle laisse
   * un demi-pixel de tremblement pendant une seconde apres le coup, et l'on ne
   * comprend pas pourquoi l'image ne se pose pas.
   */
  private decalageSecousse(): { x: number; y: number } {
    if (this.secousseRestante <= 0) return { x: 0, y: 0 }
    const a = this.secousse
    const n = Math.imul(this.secousseGraine ^ Math.round(this.secousseRestante), 2654435761) >>> 0
    const sx = ((n & 0xffff) / 65536) * 2 - 1
    const sy = ((n >>> 16) / 65536) * 2 - 1
    return { x: Math.round(sx * a), y: Math.round(sy * a) }
  }
  /**
   * Les corps mobiles du monde.
   *
   * Le jeu les detient parce que c'est lui qui compose la grille contre
   * laquelle tout se deplace. Le peuplement les REMPLIT a chaque pas depuis
   * la scene, comme il remplit le reste : rien ne s'y inscrit a la main.
   */
  readonly corps = new CorpsMobiles()
  /**
   * Les entrees par joueur, quand il y en a plusieurs.
   *
   * Vide en solo : `entreesDe` rend alors les entrees communes, et rien dans
   * le jeu ne sait qu'il existe une notion de joueur. C'est ce qui permet
   * d'ajouter le multijoueur sans rendre le solo plus complique.
   */
  readonly entreesJoueurs = new Map<string, Entrees>()
  private grilleComposee: GrilleSolide | null = null
  private carteComposee: Carte | null = null
  cartes = new Map<string, { carte: Carte; atlas: Atlas }>()
  sprites = new Map<string, Atlas>()
  /** Scripts par nom de noeud. */
  scripts = new Map<string, Script>()
  /**
   * Les organes que le contexte des scripts expose, quand le jeu en a.
   *
   * Ils sont NULS par defaut, et les verbes du contexte rendent alors faux
   * sans rien casser : un monde sans musique doit pouvoir executer un script
   * qui en demande une — c'est le script qui apprend qu'il n'y en a pas, pas
   * la boucle qui tombe.
   */
  sonneur: Sonneur | null = null
  musicien: Musicien | null = null
  /** Ouvre une suite de repliques par son nom. C'est le monde qui la branche. */
  ouvrirDialogue: ((nom: string) => boolean) | null = null
  /** Pose une entite du catalogue. C'est le peuplement qui le branche. */
  poserEntite: ((espece: string, x: number, y: number) => Noeud | null) | null = null
  /**
   * Les declencheurs du niveau : « a l'entree de ce tableau », « au contact
   * de cette zone ». Ils s'observent apres les scripts des noeuds, dans le
   * meme pas — un declencheur qui tirerait au pas suivant mettrait un pas de
   * retard sur tout ce qu'il fait, et un rejeu reseau le mettrait ailleurs.
   */
  declencheurs: Declencheurs | null = null
  /** Change de carte, par son nom. C'est le monde qui le branche. */
  allerCarte: ((nom: string) => boolean) | null = null
  /** Le nom de la carte qui suit dans le deroule, ou vide. */
  prochaineCarte: (() => string) | null = null
  /**
   * Vrai quand une interface — ecran-titre, boite de dialogue — SUSPEND le
   * monde. Les declencheurs ne s'observent pas pendant : un heros qui
   * commence la partie sur une zone tirerait A TRAVERS l'ecran-titre, et le
   * niveau changerait avant qu'on ait appuye sur quoi que ce soit.
   */
  interfaceOuverte: (() => boolean) | null = null
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
    // La secousse s'eteint meme pendant le gel : elle appartient a
    // l'affichage, et une camera figee pendant l'arret ne tremblerait pas —
    // c'est-a-dire qu'elle ne servirait a rien au moment ou elle sert.
    if (this.secousseRestante > 0) this.secousseRestante -= this.boucle.pasMs
    if (this.gelRestant > 0) {
      this.gelRestant -= this.boucle.pasMs
      // On rend la main SANS avancer : le monde est suspendu, pas ralenti.
      // C'est l'interruption nette qui fait l'impact.
      return
    }
    // Les entrees apprennent OU L'ON EN EST avant que quiconque ne les lise.
    // C'est la seule horloge qu'elles connaissent : un compte de pas, donc une
    // partie qui se rejoue a l'identique.
    this.entrees.pasMs = this.boucle.pasMs
    this.entrees.auPas(this.boucle.pas)
    // La manette s'INTERROGE, elle n'envoie rien. On la lit au pas, avec le
    // reste : la lire a l'image donnerait un etat de manette different de
    // l'etat du clavier au meme pas, et un rejeu ne reproduirait plus rien.
    this.entrees.lireManettes()
    const ctx = this.contexte()
    for (const [nom, script] of this.scripts) {
      const n = trouverParNom(this.racine, nom)
      if (n) script(ctx, n)
    }
    // Les declencheurs regardent le monde APRES que les scripts l'ont bouge :
    // un heros qui franchit la ligne a ce pas tire a ce pas, pas au suivant.
    // Et jamais pendant qu'une interface suspend le monde — voir le champ.
    if (!(this.interfaceOuverte?.() ?? false)) {
      this.declencheurs?.avancer(ctx, this.salles?.nom ?? '', this.cibleCamera ?? '')
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
      } else if (c && this.salles) {
        /*
         * Le cadrage par salle DESSINEE.
         *
         * La camera suit le heros exactement comme ailleurs — meme marge
         * morte — mais bornee a la salle courante. Les deux comportements de
         * Celeste en decoulent sans qu'on les ecrive : dans une salle de la
         * taille de l'ecran, les bornes bloquent tout et le tableau est fixe ;
         * dans une salle plus large, la camera suit. Une regle, deux effets.
         */
        const p = projeter(this.projection, c.x, c.y, this.carte.tuile)
        const changee = this.salles.suivre(c.x, c.y)
        if (changee) {
          this.glissement = this.dureeTransition
          this.surSalle?.(changee)
        }
        const dt = this.boucle.pasMs / 1000
        this.glissement = Math.max(0, this.glissement - dt)
        // On calcule la cible sur une COPIE : `suivre` part de la camera
        // courante pour appliquer la marge morte, et la faire avancer d'un
        // coup nous priverait du glissement.
        const cible = { x: this.camera.x, y: this.camera.y }
        suivre(cible, p.x, p.y, this.ecran.vue,
          this.margeCamera.x, this.margeCamera.y, this.salles.bornes())
        const dx = cible.x - this.camera.x
        const dy = cible.y - this.camera.y
        const reste = Math.hypot(dx, dy)
        // Hors transition, la camera va ou elle doit : la marge morte a deja
        // fait le travail d'amortissement, et en rajouter la ferait ramper.
        const pas = this.glissement > 0
          ? (Math.hypot(this.ecran.vue.largeur, this.ecran.vue.hauteur)
            / Math.max(0.01, this.dureeTransition)) * dt
          : reste
        if (reste <= pas || reste === 0) {
          this.camera.x = cible.x
          this.camera.y = cible.y
        } else {
          this.camera.x += (dx / reste) * pas
          this.camera.y += (dy / reste) * pas
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
    // La secousse se pose sur la camera au moment du DESSIN et n'est jamais
    // ecrite dedans : sinon elle deriverait, et la camera ne reviendrait pas
    // exactement ou elle etait.
    const t = this.decalageSecousse()
    const vue = { x: this.camera.x + t.x, y: this.camera.y + t.y }
    rendreScene(this.ecran, this.racine, vue, this.cartes, this.sprites, this.projection)
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
      entreesDe: (j) => this.entreesJoueurs.get(j) ?? this.entrees,
      pas: this.boucle.pas,
      trouver: (nom) => trouverParNom(this.racine, nom),
      bouger: (corps, dx, dy) => this.bouger(corps, dx, dy),
      // Le son passe par l'EVENEMENT du sonneur et non par un « joue » brut :
      // c'est ce qui le rend sourd aux rejouages — un pas rembobine puis
      // rejoue ne fait pas entendre le meme son deux fois.
      jouer: (nom, source) =>
        this.sonneur ? this.sonneur.evenement(this.boucle.pas, source ?? 'script', nom) : false,
      musique: (nom) => this.musicien ? this.musicien.jouer(nom) : false,
      dire: (nom) => this.ouvrirDialogue ? this.ouvrirDialogue(nom) : false,
      secouer: (amplitude, ms) => this.secouer(amplitude, ms),
      geler: (ms) => this.geler(ms),
      salle: this.salles?.nom ?? '',
      poser: (espece, x, y) => this.poserEntite ? this.poserEntite(espece, x, y) : null,
      retirer: (noeud) => retirerDe(this.racine, noeud),
      aller: (carte) => this.allerCarte ? this.allerCarte(carte) : false,
      niveauSuivant: () => {
        const nom = this.prochaineCarte?.() ?? ''
        return nom ? (this.allerCarte?.(nom) ?? false) : false
      },
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
