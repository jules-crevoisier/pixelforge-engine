import type { Noeud, NoeudSprite, NoeudCorps } from '../scene/noeud.ts'
import { creerNoeud } from '../scene/noeud.ts'
import type { ContexteJeu } from './jeu.ts'
import { Combat, visibleSousInvulnerabilite, type Camp } from './combat.ts'
import { Lecteur, type Clip } from './animation.ts'
import { rect, seChevauchent } from '../noyau/pixel.ts'
import { BLESSANTE } from '../tuiles/tilemap.ts'
import { type Projection, ORTHO_DESSUS, deprojeter } from '../noyau/projection.ts'
import { Plateformeur, lireEntrees, type ReglagesPlateforme } from './plateforme.ts'
import { porter } from './corps.ts'
import {
  ChampDeFlux, grilleDeCarte, ligneLibre, LOIN, type GrilleChemin,
} from './chemin.ts'

/**
 * Les entites : des especes decrites en DONNEES, posees dans la scene.
 *
 * ## Le probleme que ca resout
 *
 * Les creatures naissaient d'un appel de fonction dans le code du monde. Trois
 * consequences, toutes mauvaises : on ne pouvait pas en poser une depuis
 * l'editeur, elles ne partaient pas dans le fichier de projet, et un projet
 * relu redevenait une salle vide. Un editeur ou l'on ne peut pas placer
 * d'ennemi n'est pas un editeur de jeu.
 *
 * Une entite est donc un NOEUD DE LA SCENE qui porte le nom de son espece. Le
 * reste — sa vie, son animation, son intention — est reconstruit a partir de
 * ce nom. Poser une creature, c'est ajouter un noeud ; l'enregistrer, c'est
 * enregistrer la scene, ce que le format sait deja faire.
 *
 * ## Pourquoi le comportement est un NOM et non une fonction
 *
 * Une fonction ne s'ecrit pas dans un fichier JSON. Un nom, si. Le fichier dit
 * « poursuite » et le moteur sait ce que cela veut dire ; un portage en Rust ou
 * en GDScript le saura aussi, parce que la liste est courte et documentee.
 * C'est le meme choix que pour les modes de bouclage d'une animation, et pour
 * la meme raison : ce qui traverse la frontiere doit etre du texte.
 *
 * Ce qui ne s'exprime pas par un de ces noms s'ecrit dans l'atelier de
 * scripts, et part alors dans le fichier sous forme de source.
 */

/**
 * Les intentions que le moteur sait tenir. Une liste courte, et documentee.
 *
 * `joueur` et `plateformeur` y figurent au meme titre que les autres, et ce
 * n'est pas une coquetterie : tant que le heros naissait d'un appel de
 * fonction, un projet relu depuis un fichier n'avait personne a diriger. Le
 * joueur est une entite comme les autres — un noeud qui porte le nom d'une
 * espece — et c'est ce qui rend un projet enregistre reellement jouable.
 */
export type Comportement =
  | 'immobile' | 'patrouille' | 'poursuite' | 'bond' | 'joueur' | 'plateformeur'
  | 'projectile' | 'porteur' | 'script'

export const COMPORTEMENTS: Comportement[] = [
  'immobile', 'patrouille', 'poursuite', 'bond', 'joueur', 'plateformeur',
  'projectile', 'porteur', 'script',
]

/**
 * Un etat d'une espece : ce qu'elle fait, et pendant combien de temps.
 *
 * ## Pourquoi une machine a etats, et pas une intention de plus
 *
 * Une seule intention par espece suffit a une gelee. Elle ne suffit a rien
 * d'autre : un ennemi qui compte doit ANNONCER son coup — se ramasser, frapper,
 * se decouvrir. Ces trois temps sont ce qui rend un combat lisible ; sans eux,
 * un ennemi qui touche est un ennemi injuste, et le joueur n'apprend rien.
 *
 * ## Pourquoi le declencheur passe par un evenement d'animation
 *
 * « Le coup porte a la troisieme image » ne peut pas s'ecrire en
 * millisecondes : changer la duree d'un dessin decalerait le coup, et personne
 * ne ferait le lien. Le clip porte deja ses evenements — le lecteur les REND
 * depuis le premier jour, et personne ne les consommait. L'etat dit ce que
 * l'evenement declenche, et le dessin reste maitre du moment.
 */
export interface EtatEspece {
  nom: string
  /** Clip joue pendant cet etat. */
  clip: string
  /** Ce que l'entite fait pendant ce temps. */
  intention: Comportement
  /** Millisecondes avant de passer a `suivant`. Zero : on y reste. */
  duree: number
  suivant: string
  /** Passe a cet etat des que la cible est plus proche que `distance`. */
  siProche?: { distance: number; vers: string }
  /** Passe a cet etat des que la cible est plus loin que `distance`. */
  siLoin?: { distance: number; vers: string }
  /**
   * Ce qu'un evenement du clip declenche.
   *
   * `frappe` pose une boite devant l'entite ; `tir` lance une autre espece.
   * Les deux au meme evenement sont permis — un coup d'epee qui projette une
   * onde est exactement cela.
   */
  declencheurs?: {
    evenement: string
    frappe?: { degats: number; portee: number; epaisseur: number; dureeMs: number; poussee: number }
    tir?: { espece: string; vitesse: number; nombre?: number; ecart?: number }
  }[]
}

export interface Boite { x: number; y: number; l: number; h: number }

/** Ce qu'une espece est, entierement en donnees. */
export interface Espece {
  id: string
  nom: string
  /** Nom de la planche ou piocher ses dessins. */
  planche: string
  /** Clip joue en permanence. */
  clip: string
  camp: Camp
  pv: number
  /** Pixels par seconde. */
  vitesse: number
  /** Degats infliges au contact. Zero pour ce qui ne blesse pas. */
  degats: number
  /**
   * Points de vie rendus a qui la ramasse. Zero : ce n'est pas un ramassage.
   *
   * Un coeur au sol et une gelee sont la meme chose pour le moteur : une
   * entite posee dans la scene, decrite par des donnees. Inventer un deuxieme
   * systeme pour les objets a ramasser reviendrait a ecrire deux fois le
   * placement, la serialisation et le rendu.
   */
  soigne: number
  /**
   * Toucher cette entite deplace le point de reprise.
   *
   * Une balise est une entite comme une autre : ce qui la distingue est une
   * valeur dans sa description. Inventer un systeme de points de reprise a
   * cote du systeme d'entites aurait fait ecrire deux fois le placement, la
   * serialisation et le rendu — pour un objet qu'on pose dans l'editeur
   * exactement comme on pose une gelee.
   */
  reprise: boolean
  comportement: Comportement
  /**
   * Distance a laquelle elle remarque la cible, en pixels. Zero : jamais.
   *
   * Elle est distincte du rayon d'activite : la vigilance dit quand la
   * creature CHANGE d'intention, le rayon dit quand elle cesse d'exister pour
   * le jeu. Une creature peut patrouiller sans avoir rien remarque.
   */
  vigilance: number
  boite: Boite
  ancreX: number
  ancreY: number
  /** Millisecondes d'invulnerabilite apres un coup recu. */
  invulnerabiliteMs: number
  /**
   * Suffixes de clips par direction, pour un personnage vu de dessus.
   *
   * Quand ils existent, l'entite joue `clip-bas`, `clip-haut` ou `clip-cote`
   * selon ou elle va, et `repos-...` quand elle s'arrete. Sinon elle garde son
   * clip unique. C'est ce qui permet a une gelee — qui n'a qu'une animation —
   * et a un heros — qui en a huit — de passer par le meme chemin.
   */
  clipsDiriges: boolean
  /** Reglages du controleur, pour un comportement de plateforme. */
  plateforme: Partial<ReglagesPlateforme>
  /**
   * Les etats, s'il y en a. Vide : l'espece n'a que son intention.
   *
   * Une liste et non une carte : l'ordre compte pour la lecture humaine — on
   * ecrit repos, guet, coup, recuperation dans cet ordre-la — et le nom suffit
   * a retrouver l'etat.
   */
  etats: EtatEspece[]
  /** L'etat de depart. Vide : le premier de la liste. */
  etatInitial: string
  /**
   * Duree de vie, en millisecondes. Zero : elle ne meurt pas d'elle-meme.
   *
   * C'est ce qui fait qu'un projectile ne traverse pas la carte entiere quand
   * il ne rencontre rien.
   */
  duree: number
  /**
   * Ce que cette entite oppose aux AUTRES corps. Zero : on la traverse.
   *
   * `1` solide — une caisse, une porte, une plateforme mobile pleine. `2`
   * plateforme a sens unique — on la traverse par en dessous et l'on se pose
   * dessus. Ce sont les memes drapeaux que les cases, et ce n'est pas une
   * coincidence : du point de vue de qui se cogne dedans, un obstacle mobile
   * est du decor.
   */
  matiereCorps: number
  /**
   * L'aller-retour d'un corps porteur. Zero partout : il reste ou il est.
   *
   * Un aller-retour et non une liste de points : c'est ce que sont
   * quatre-vingt-dix pour cent des plateformes mobiles, ca tient en quatre
   * nombres dans un fichier, et ca se lit dans l'editeur sans outil de
   * trajectoire. Ce qui demande davantage s'ecrit dans l'atelier de scripts.
   */
  trajet: { dx: number; dy: number; duree: number; pause: number }
  /**
   * Degats subis quand on lui saute sur la tete. Zero : on ne la pietine pas.
   *
   * C'est le verbe le plus universel du jeu de plateforme, et il ne peut pas
   * etre implicite : une creature a pointes doit pouvoir REFUSER d'etre
   * pietinee, sans quoi le joueur apprend un geste qui le tue une fois sur
   * deux.
   */
  degatsPietinement: number
  /**
   * Hauteur du rebond apres pietinement, en pixels. Zero : on ne rebondit pas.
   *
   * Elle appartient a la VICTIME et non au pietineur : un ressort vivant
   * renvoie plus haut qu'un champignon, et c'est ce qui distingue deux ennemis
   * qui se ressemblent.
   */
  rebondPietinement: number
  /**
   * Elle tombe. Sans effet dans un monde vu de dessus.
   *
   * ## Pourquoi DEUX conditions, et pas une
   *
   * Le monde decide qu'il existe un bas — c'est le regard de la projection.
   * L'espece decide si elle y obeit : une chauve-souris vole dans le meme
   * monde ou la gelee tombe. Mettre la pesanteur sur la seule espece la ferait
   * tomber vers le sud dans le donjon vu de dessus ; la mettre sur le seul
   * monde clouerait la chauve-souris au sol.
   *
   * Elle a ete ajoutee apres avoir JOUE : la gelee posee dans la caverne
   * derivait doucement vers le haut de l'ecran en poursuivant le heros. Aucun
   * banc ne l'avait dit, parce qu'aucun banc ne regarde.
   */
  pesante: boolean
  /**
   * La SOURCE du script de l'espece, pour l'intention « script ».
   *
   * ## Pourquoi c'est la vraie liberte du moteur
   *
   * Les huit autres intentions sont une liste FERMEE : on choisit dans ce que
   * le moteur sait faire. « script » renverse le rapport — on ECRIT ce que la
   * creature fait, avec le meme « c » et le meme « n » que l'atelier, et la
   * source part dans le fichier comme tout le reste. La liste courte reste le
   * bon depart ; elle cesse d'etre un plafond.
   *
   * C'est une source et non une fonction : un fichier ne transporte pas de
   * code compile, et c'est l'hote qui compile — l'editeur par l'atelier, un
   * portage par ce qu'il voudra.
   */
  script: string
  /**
   * Rayon de la lumiere qu'elle emet, en pixels. Zero : elle n'eclaire pas.
   *
   * Une torche est une entite comme une autre : ce qui la distingue est une
   * valeur dans sa description — la meme raison que pour `soigne` et
   * `reprise`. La lumiere s'eteint a deux rayons, voir `runtime/lumiere.ts`.
   */
  lueur: number
}

export function espece(id: string, p: Partial<Espece> = {}): Espece {
  return {
    id,
    nom: p.nom ?? id,
    planche: p.planche ?? 'creatures',
    clip: p.clip ?? id,
    camp: p.camp ?? 'ennemi',
    pv: p.pv ?? 1,
    vitesse: p.vitesse ?? 40,
    degats: p.degats ?? 1,
    soigne: p.soigne ?? 0,
    reprise: p.reprise ?? false,
    comportement: p.comportement ?? 'patrouille',
    vigilance: p.vigilance ?? 0,
    boite: p.boite ?? { x: -5, y: -8, l: 10, h: 8 },
    ancreX: p.ancreX ?? 8,
    ancreY: p.ancreY ?? 16,
    invulnerabiliteMs: p.invulnerabiliteMs ?? 220,
    clipsDiriges: p.clipsDiriges ?? false,
    plateforme: p.plateforme ?? {},
    etats: p.etats ?? [],
    etatInitial: p.etatInitial ?? '',
    duree: p.duree ?? 0,
    matiereCorps: p.matiereCorps ?? 0,
    trajet: p.trajet ?? { dx: 0, dy: 0, duree: 0, pause: 0 },
    degatsPietinement: p.degatsPietinement ?? 0,
    rebondPietinement: p.rebondPietinement ?? 0,
    pesante: p.pesante ?? false,
    lueur: p.lueur ?? 0,
    script: p.script ?? '',
  }
}

/**
 * Distance au-dela de laquelle une entite ne fait plus rien, en pixels.
 *
 * Ce n'est pas une optimisation, c'est une regle de JEU. Sans elle, toutes les
 * creatures de l'etage convergent des la premiere seconde et le joueur affronte
 * les vingt-deux d'un coup dans le couloir de depart. Une creature vit dans sa
 * salle ; elle attend qu'on vienne. La valeur vaut un peu plus qu'une salle,
 * pour qu'une creature ne s'immobilise pas net au bord de l'ecran.
 */
export const RAYON_ACTIVITE = 340

/**
 * Jusqu'ou l'on calcule le champ de navigation, en cases.
 *
 * Un peu plus loin que le rayon d'activite : une creature juste a la limite
 * doit trouver un chemin des l'instant ou elle s'eveille, et non une seconde
 * apres. Beaucoup plus loin ne servirait a rien — personne ne poursuit
 * au-dela — et couterait toute la carte a chaque pas.
 */
const PORTEE_NAVIGATION = 26

/** Ce qu'une case blessante retire, par defaut. */
export const DEGATS_MATIERE = 1

/**
 * Epaisseur de la bande de pietinement, en pixels.
 *
 * Trop mince, le pietinement rate quand la chute est rapide — le corps saute
 * par-dessus la bande entre deux pas. Trop epaisse, on tue en frolant de cote,
 * et le joueur ne sait plus ce qu'il a fait. Quatre pixels couvrent une chute
 * de trois cents pixels par seconde a soixante images.
 */
export const BANDE_PIETINEMENT = 5

/**
 * La pesanteur des creatures, en pixels par seconde carree, et leur vitesse de
 * chute maximale.
 *
 * Elles ne passent pas par le controleur de plateforme : il porte un saut, un
 * dash, un coyote et une glissade murale dont une gelee n'a que faire, et le
 * lui donner reviendrait a payer douze reglages pour en employer un. Ici la
 * pesanteur seule, et la vitesse limite qui evite de traverser un sol mince
 * quand une image est longue.
 */
export const PESANTEUR_ENTITE = 900
export const CHUTE_MAX_ENTITE = 300

/** Duree d'un bond, et du repos qui suit, en millisecondes. */
const DUREE_BOND = 520
const DUREE_REPOS = 380

/** L'etat vivant d'une entite : ce qui ne s'ecrit pas dans un fichier. */
interface Vivante {
  espece: Espece
  noeud: NoeudSprite
  corps: NoeudCorps
  lecteur: Lecteur
  /** Sens de patrouille. */
  cap: number
  /** Compteur du bond : positif au repos, negatif pendant le saut. */
  attente: number
  /** Le controleur de plateforme, pour qui en a un. */
  plateformeur: Plateformeur | null
  /** Derniere direction regardee, en unites d'ecran. */
  regard: { x: number; y: number }
  /** L'etat courant, quand l'espece en a. */
  etat: EtatEspece | null
  /** Millisecondes passees dans cet etat. */
  depuis: number
  /** Vitesse propre, en pixels par seconde. Sert aux projectiles. */
  vx: number
  vy: number
  /** Millisecondes de vie restantes, ou l'infini. */
  restant: number
  /** Ou l'entite a ete posee : l'origine de son aller-retour. */
  origine: { x: number; y: number }
  /** Millisecondes ecoulees sur le cycle du trajet. */
  phase: number
  /** Vraie a l'instant ou l'on vient de lui sauter dessus. */
  pietinee: boolean
}

/**
 * Le peuplement : il tient ensemble le noeud, la vitalite, le lecteur et
 * l'intention de chaque entite.
 *
 * Ces quatre-la doivent naitre et mourir ENSEMBLE. Les tenir separement oblige
 * l'appelant a s'en souvenir, et il l'oublie : la vitalite d'un ennemi disparu
 * continue de recevoir des coups, le noeud reste dessine, le lecteur tourne
 * pour rien.
 */
export class Peuplement {
  private vivantes = new Map<string, Vivante>()
  /** Les corps mobiles que CE peuplement a inscrits au registre du jeu. */
  private corpsInscrits = new Set<string>()
  private registreManquantDit = false
  private catalogue = new Map<string, Espece>()
  private racine: Noeud
  private combat: Combat
  private clips: Clip[]

  /** La projection sert aux entites dirigees au clavier : voir `agir`. */
  projection: Projection
  /** Taille de case du monde orthogonal ou vivent les entites. */
  tuile: number
  /**
   * Ce qu'une case blessante retire. Zero pour un monde sans piege.
   *
   * C'est un reglage de JEU et non de moteur : la meme pointe tue en un coup
   * dans Celeste et retire un demi-coeur dans Isaac.
   */
  degatsMatiere = DEGATS_MATIERE
  /**
   * Les scripts d'espece COMPILES, par identifiant d'espece.
   *
   * Le peuplement ne compile rien : il ne connait ni l'atelier ni ses
   * interdits, et c'est voulu — un banc y met une fonction nue, l'editeur y
   * met ce que l'atelier a verifie. Une espece a l'intention « script » sans
   * entree ici reste immobile : l'oubli se voit, il ne casse pas.
   */
  scriptsEspeces = new Map<string, (c: ContexteJeu, n: Noeud) => void>()

  /**
   * Le champ de navigation, recalcule une fois par pas depuis la cible.
   *
   * Il vit ici et non dans chaque creature : une seule traversee de la salle
   * sert TOUT LE MONDE. Vingt ennemis coutent alors le meme prix qu'un, ce
   * qui est exactement ce qu'on veut la ou le jeu est charge.
   *
   * Il ne se reporte jamais d'un pas sur l'autre : c'est ce qui le rend
   * insensible au rembobinage. Un chemin garde en memoire serait de l'etat,
   * et deux machines divergeraient apres une correction reseau.
   */
  private champ = new ChampDeFlux()
  private grille: GrilleChemin | null = null
  private carteDuChamp: unknown = null
  /** Comptes, pour les bancs : combien de cases le dernier champ a coutees. */
  get casesVisitees(): number { return this.champ.visitees }

  constructor(
    racine: Noeud, combat: Combat, especes: Espece[] = [], clips: Clip[] = [],
    projection: Projection = ORTHO_DESSUS(16), tuile = 16,
  ) {
    this.racine = racine
    this.combat = combat
    this.clips = clips
    this.projection = projection
    this.tuile = tuile
    for (const e of especes) this.catalogue.set(e.id, e)
  }

  get nombre(): number { return this.vivantes.size }
  get especes(): Espece[] { return [...this.catalogue.values()] }
  especeDe(id: string): Espece | null { return this.catalogue.get(id) ?? null }

  /**
   * Cree le noeud d'une entite, sans l'inscrire au jeu.
   *
   * C'est ce qu'appelle l'editeur quand on pose une creature : il ajoute un
   * noeud a la scene, et rien d'autre. La vie et l'animation viendront de
   * `synchroniser`, au demarrage — ce qui evite d'avoir a defaire tout cela
   * quand on repose la meme creature ailleurs pendant qu'on edite.
   */
  creerNoeudEntite(idEspece: string, x: number, y: number): NoeudSprite | null {
    const e = this.catalogue.get(idEspece)
    if (!e) return null
    const n = creerNoeud('sprite', `${e.id}-${Math.random().toString(36).slice(2, 7)}`) as NoeudSprite
    n.source = e.planche
    n.ancreX = e.ancreX
    n.ancreY = e.ancreY
    n.x = x
    n.y = y
    // Une image des la creation, et non a l'adoption : sinon une entite posee
    // pendant que le jeu est arrete se dessine avec la case zero de sa planche
    // — un mur, un morceau de sol — jusqu'au premier pas de simulation.
    n.image = this.premiereImage(e)
    // C'est CE champ qui fait d'un sprite une entite, et c'est lui qui part
    // dans le fichier de projet : le reste s'en deduit.
    ;(n as unknown as { espece: string }).espece = e.id

    const corps = creerNoeud('corps', 'corps') as NoeudCorps
    corps.boiteX = e.boite.x
    corps.boiteY = e.boite.y
    corps.boiteL = e.boite.l
    corps.boiteH = e.boite.h
    n.enfants.push(corps)
    return n
  }

  /** La premiere image du clip d'une espece, ou zero. */
  premiereImage(e: Espece): number {
    const c = this.clips.find((q) => q.nom === e.clip)
    return c?.images[0]?.index ?? 0
  }

  /**
   * Lance une entite avec une vitesse propre. C'est ainsi qu'on tire.
   *
   * Le projectile n'appartient pas a son auteur : il est pose dans le monde et
   * y vit sa vie. Un projectile enfant de celui qui l'a tire suivrait son
   * tireur — on tire, on recule, et le tir recule avec soi.
   */
  lancer(
    idEspece: string, x: number, y: number, dx: number, dy: number, camp?: Camp,
  ): NoeudSprite | null {
    const e = this.catalogue.get(idEspece)
    if (!e) return null
    const n = this.poser(idEspece, x, y)
    if (!n) return null
    const v = this.vivantes.get(n.id)
    if (!v) {
      // Pas encore adopte : on synchronise pour lui donner sa vitesse tout de
      // suite. Attendre le pas suivant ferait partir le tir avec un retard
      // d'une image, ce qui se voit sur une salve.
      this.synchroniser()
    }
    const vivante = this.vivantes.get(n.id)
    if (vivante) {
      const norme = Math.hypot(dx, dy) || 1
      vivante.vx = (dx / norme) * e.vitesse
      vivante.vy = (dy / norme) * e.vitesse
      vivante.regard = { x: Math.sign(dx), y: Math.sign(dy) }
      if (camp) {
        const vie = this.combat.vies.get(n.id)
        if (vie) vie.camp = camp
      }
    }
    return n
  }

  /** Pose une entite dans la scene. Rend son noeud, ou null si l'espece est inconnue. */
  poser(idEspece: string, x: number, y: number): NoeudSprite | null {
    const n = this.creerNoeudEntite(idEspece, x, y)
    if (n) this.racine.enfants.push(n)
    return n
  }

  /**
   * Accorde l'etat vivant sur ce que porte la scene.
   *
   * Tout part de la scene et rien de l'inverse : c'est ce qui permet a
   * l'editeur d'ajouter et de retirer des noeuds sans rien prevenir. Une
   * entite ajoutee est adoptee, une entite disparue est oubliee — vitalite
   * comprise, sinon elle continuerait de recevoir des coups depuis nulle part.
   */
  synchroniser(): void {
    const vus = new Set<string>()
    const parcourir = (n: Noeud): void => {
      const id = (n as unknown as { espece?: string }).espece
      if (n.type === 'sprite' && typeof id === 'string' && this.catalogue.has(id)) {
        vus.add(n.id)
        if (!this.vivantes.has(n.id)) this.adopter(n as NoeudSprite, this.catalogue.get(id) as Espece)
      }
      for (const e of n.enfants) parcourir(e)
    }
    parcourir(this.racine)
    for (const id of [...this.vivantes.keys()]) {
      if (!vus.has(id)) { this.vivantes.delete(id); this.combat.retirer(id) }
    }
  }

  private adopter(n: NoeudSprite, e: Espece): void {
    let corps = n.enfants.find((x) => x.type === 'corps') as NoeudCorps | undefined
    if (!corps) {
      corps = creerNoeud('corps', 'corps') as NoeudCorps
      corps.boiteX = e.boite.x
      corps.boiteY = e.boite.y
      corps.boiteL = e.boite.l
      corps.boiteH = e.boite.h
      n.enfants.push(corps)
    }
    const lecteur = new Lecteur(this.clips)
    lecteur.jouer(e.clip)
    /*
     * Un clip INTROUVABLE n'efface pas le dessin. Le lecteur rend alors -1,
     * et l'ecrire ferait disparaitre l'entite — c'est arrive au heros : son
     * espece nomme « marche », ses clips s'appellent « marche-bas » et
     * freres, et l'adoption le rendait invisible dans l'editeur jusqu'au
     * premier pas de jeu. Une capture d'ecran l'a montre ; aucun banc ne
     * regardait.
     */
    if (lecteur.image >= 0) n.image = lecteur.image
    this.combat.inscrire(n.id, {
      max: e.pv, camp: e.camp, boite: e.boite, x: n.x, y: n.y,
      invulnerabiliteMs: e.invulnerabiliteMs,
    })
    const etat = e.etats.length
      ? (e.etats.find((q) => q.nom === e.etatInitial) ?? e.etats[0])
      : null
    if (etat) lecteur.jouer(etat.clip)
    this.vivantes.set(n.id, {
      espece: e, noeud: n, corps, lecteur, cap: 1, attente: 0,
      plateformeur: e.comportement === 'plateformeur'
        ? new Plateformeur(e.plateforme)
        : null,
      regard: { x: 0, y: 1 },
      etat,
      depuis: 0,
      vx: 0,
      vy: 0,
      restant: e.duree > 0 ? e.duree : Infinity,
      origine: { x: n.x, y: n.y },
      phase: 0,
      pietinee: false,
    })
  }

  /**
   * Remet a neuf le controleur d'une entite dirigee.
   *
   * Une reapparition doit effacer la vitesse, le tampon de saut et le dash en
   * cours : sans cela on renait en tombant a la vitesse ou l'on est mort.
   */
  reinitialiserControleur(id: string): void {
    this.vivantes.get(id)?.plateformeur?.reinitialiser()
  }

  /** La direction que regarde une entite, en unites d'ecran. */
  regardDe(id: string): { x: number; y: number } {
    return this.vivantes.get(id)?.regard ?? { x: 0, y: 1 }
  }

  /** Le diagnostic du controleur de plateforme d'une entite, s'il y en a un. */
  diagnosticDe(id: string): ReturnType<Plateformeur['diagnostic']> | null {
    return this.vivantes.get(id)?.plateformeur?.diagnostic() ?? null
  }

  /**
   * Un pas de tout le peuplement. Rend les evenements d'animation franchis.
   *
   * Comme le lecteur, il REND au lieu d'appeler : l'appelant en fait un bruit
   * de pas, une trace, un compteur, sans que le peuplement ait besoin de
   * savoir ce qu'est un son.
   */
  /**
   * Refait le champ de navigation depuis la cible.
   *
   * La grille se reconstruit quand la CARTE change, pas a chaque pas : elle
   * ne fait que lire `solides`, et une carte qu'on repeint garde le meme
   * objet. Ce qui se recalcule a chaque pas, c'est le champ.
   */
  private rafraichirNavigation(c: ContexteJeu, cible: { x: number; y: number }): void {
    if (!c.carte) { this.grille = null; return }
    if (this.carteDuChamp !== c.carte) {
      this.carteDuChamp = c.carte
      this.grille = grilleDeCarte(c.carte)
    }
    const g = this.grille
    if (!g) return
    this.champ.calculer(
      g, Math.floor(cible.x / g.tuile), Math.floor(cible.y / g.tuile), PORTEE_NAVIGATION,
    )
  }

  /**
   * Ou aller pour rejoindre la cible, en tenant compte des murs.
   *
   * Rend un vecteur NORMALISE, ou null quand il n'y a rien de mieux a
   * proposer que la ligne droite. Trois cas, dans cet ordre :
   *
   * 1. la cible est en vue : on va droit dessus. C'est ce qui se passe neuf
   *    fois sur dix, c'est le moins cher, et c'est le plus naturel a
   *    regarder — suivre un champ de case en case donne une marche en
   *    escalier que l'oeil repere aussitot.
   * 2. elle ne l'est pas, mais le champ sait ou aller : on vise le CENTRE de
   *    la case suivante, pour ne pas raser l'angle du mur qu'on contourne.
   * 3. le champ ne sait pas : on rend null, et l'appelant reprend la ligne
   *    droite. C'est le comportement d'avant ce fichier, donc rien ne peut
   *    empirer.
   */
  direction(v: { x: number; y: number }, cible: { x: number; y: number }):
  { x: number; y: number } | null {
    const g = this.grille
    if (!g) return null
    if (ligneLibre(g, v.x, v.y, cible.x, cible.y)) return null
    const cx = Math.floor(v.x / g.tuile)
    const cy = Math.floor(v.y / g.tuile)
    if (this.champ.distanceDe(cx, cy) === LOIN) return null
    const pas = this.champ.pasVers(g, cx, cy)
    if (!pas) return null
    const bx = pas.x * g.tuile + g.tuile / 2
    const by = pas.y * g.tuile + g.tuile / 2
    const dx = bx - v.x
    const dy = by - v.y
    const n = Math.hypot(dx, dy)
    if (n < 1e-6) return null
    return { x: dx / n, y: dy / n }
  }

  avancer(
    c: ContexteJeu, cible: { x: number; y: number }, dtMs: number,
  ): { id: string; nom: string }[] {
    const evenements: { id: string; nom: string }[] = []
    const aRetirer: string[] = []
    // Les corps mobiles d'abord : une plateforme doit avoir bouge, et avoir
    // porte son passager, AVANT que le passager ne decide ou il va. L'inverse
    // le ferait decider depuis une position qui n'existe deja plus.
    this.avancerPorteurs(c, dtMs)
    // Le champ de navigation, une fois pour toutes les creatures. On le
    // recalcule a CHAQUE pas plutot que de le garder : garder demanderait de
    // savoir quand il devient faux — la cible bouge, une porte s'ouvre, une
    // caisse est poussee — et une reponse fausse a cette question-la se paie
    // en creatures qui longent un mur disparu.
    this.rafraichirNavigation(c, cible)
    for (const v of this.vivantes.values()) {
      const vie = this.combat.vies.get(v.noeud.id)
      // Un mort n'agit pas, ne frappe pas, et ne se fait pas frapper. Le
      // laisser vivre le temps d'un compte a rebours donnerait des degats
      // posthumes et un compteur qui monte par deux.
      if (!vie || vie.mort) continue
      const dx = cible.x - v.noeud.x
      const dy = cible.y - v.noeud.y
      const distance = Math.hypot(dx, dy)
      // Une entite dirigee au clavier est toujours active : c'est elle qui
      // sert de reference a toutes les autres, et l'endormir arreterait le jeu.
      const dirigee = v.espece.comportement === 'joueur'
        || v.espece.comportement === 'plateformeur'
      if (!dirigee && distance > RAYON_ACTIVITE) continue

      // La machine a etats d'abord : elle peut changer l'intention avant que
      // l'entite n'agisse, et un etat qui durerait une image de trop ferait
      // frapper apres coup.
      if (v.etat) this.avancerEtat(v, distance, dtMs)

      // La duree de vie : un projectile qui ne rencontre rien doit finir.
      v.restant -= dtMs
      if (v.restant <= 0) { aRetirer.push(v.noeud.id); continue }

      const intentionCourante = v.etat ? v.etat.intention : v.espece.comportement
      if (intentionCourante === 'script') {
        // L'intention qui appartient a la personne : son script decide, le
        // moteur ne fait que la pesanteur — la meme regle que pour les
        // autres, une creature pesante obeit au bas du monde.
        if (v.espece.pesante && this.projection.regard === 'cote') tomber(v, c)
        this.scriptsEspeces.get(v.espece.id)?.(c, v.noeud)
      } else {
        const contournement = peutContourner(intentionCourante, v.espece, this.projection, distance)
          ? this.direction(v.noeud, cible)
          : null
        const fini = agir(
          v, c, dx, dy, distance, dtMs, this.projection, this.tuile, contournement,
        )
        if (fini) { aRetirer.push(v.noeud.id); continue }
      }

      vie.x = v.noeud.x
      vie.y = v.noeud.y
      v.noeud.visible = visibleSousInvulnerabilite(vie.invulnerable)
      // La cadence suit la vitesse pour qui marche : une marche a cadence fixe
      // sur un personnage qui accelere donne l'impression qu'il patine.
      const facteur = v.plateformeur
        ? Math.min(1, Math.abs(v.plateformeur.vx) / (v.plateformeur.r.vitesse || 1))
        : 1
      for (const nom of v.lecteur.avancer(dtMs * (v.plateformeur ? Math.max(facteur, 0.0001) : 1))) {
        evenements.push({ id: v.noeud.id, nom })
        // C'est ici que « le coup porte a la troisieme image » devient vrai :
        // le dessin dit quand, l'etat dit quoi.
        this.declencher(v, nom, dx, dy)
      }
      if (v.lecteur.image >= 0) v.noeud.image = v.lecteur.image

      // Le decor qui blesse. La frappe appartient au camp « decor », donc a
      // personne : une pointe pique le heros comme la creature qui marche
      // dessus. Et comme c'est une frappe ordinaire, les images
      // d'invulnerabilite s'appliquent sans qu'on les reecrive.
      if (this.degatsMatiere > 0 && !vie.mort) {
        const b = v.espece.boite
        const boite = rect(v.noeud.x + b.x, v.noeud.y + b.y, b.l, b.h)
        if (matieresSous(c.carte, boite) & BLESSANTE) {
          // La poussee remonte : sortir d'une pointe par le haut est ce qu'on
          // veut neuf fois sur dix, et ce qui evite d'y rester coince.
          this.combat.frapper('decor', boite, this.degatsMatiere, 1, 120, 0, -1)
        }
      }

    }
    // Le pietinement se resout APRES le mouvement, et les degats de contact
    // apres lui.
    //
    // C'est un ordre, et il repare un defaut precis. En resolvant le
    // pietinement avant le mouvement, on le juge sur les positions du pas
    // PRECEDENT : le heros mord la poussiere a l'image ou il atterrit sur la
    // creature, et ne l'ecrase qu'a la suivante — il paie donc un coup pour un
    // geste reussi. En frappant apres le mouvement, chacun frappe depuis la
    // place ou il est vraiment.
    this.resoudrePietinements()
    for (const v of this.vivantes.values()) {
      const vie = this.combat.vies.get(v.noeud.id)
      if (!vie || vie.mort) continue
      const e = v.espece
      if (e.degats <= 0 || v.pietinee) continue
      if (e.comportement === 'joueur' || e.comportement === 'plateformeur') continue
      const distance = Math.hypot(cible.x - v.noeud.x, cible.y - v.noeud.y)
      if (distance > RAYON_ACTIVITE) continue
      // Le contact blesse par une frappe d'une seule image, refaite a chaque
      // pas. Une « zone qui blesse en permanence » serait un deuxieme
      // mecanisme a cote des frappes, avec ses propres regles de repetition —
      // donc deux endroits ou se tromper.
      this.combat.frapper(e.camp, rect(
        v.noeud.x + e.boite.x, v.noeud.y + e.boite.y, e.boite.l, e.boite.h,
      ), e.degats, 1, 150, cible.x - v.noeud.x, cible.y - v.noeud.y)
    }
    for (const id of aRetirer) this.tuer(id)
    return evenements
  }

  /**
   * Fait bouger les corps mobiles, et porter ce qui se tient dessus.
   *
   * ## Pourquoi les passagers sont releves AVANT le mouvement
   *
   * On cherche ce qui repose sur le dessus de la plateforme. Une fois qu'elle
   * a bouge, plus rien n'y repose : le passager est reste en arriere, ou bien
   * elle lui est passee au travers. Il faut donc faire la liste d'abord, puis
   * deplacer, puis rattraper la liste — c'est l'ordre qu'emploient tous les
   * jeux ou l'on monte sur une plateforme sans glisser dessus.
   *
   * ## Pourquoi le porteur n'est jamais endormi par le rayon d'activite
   *
   * Une creature qui s'immobilise hors de l'ecran ne se remarque pas. Une
   * plateforme, si : on revient dans la salle et elle n'est plus en phase avec
   * les trois autres, donc le passage n'est plus franchissable. Le decor doit
   * rester previsible, meme non regarde.
   */
  private avancerPorteurs(c: ContexteJeu, dtMs: number): void {
    // Un contexte bati a la main peut ne pas porter de registre. On ne tombe
    // pas pour autant — mais on le DIT, une fois : sans registre les corps
    // mobiles ne bloquent rien, et une plateforme qu'on traverse en silence se
    // cherche pendant une heure.
    if (!c.corps) {
      if (!this.registreManquantDit) {
        this.registreManquantDit = true
        console.warn(
          'peuplement : le contexte ne porte pas de registre de corps mobiles — '
          + 'les plateformes et les caisses ne bloqueront rien',
        )
      }
      return
    }
    const vus = new Set<string>()
    for (const v of this.vivantes.values()) {
      const e = v.espece
      if (e.matiereCorps === 0) continue
      vus.add(v.noeud.id)
      const b = e.boite
      const t = e.trajet
      let nx = v.noeud.x
      let ny = v.noeud.y
      if (t.duree > 0 && (t.dx !== 0 || t.dy !== 0)) {
        const cycle = 2 * t.duree + 2 * t.pause
        v.phase = (v.phase + dtMs) % cycle
        const p = avancementTrajet(v.phase, t.duree, t.pause)
        // Arrondi : la plateforme se pose sur la grille de pixels comme tout
        // le reste. Une plateforme en sous-pixel ferait vibrer son passager.
        nx = v.origine.x + Math.round(t.dx * p)
        ny = v.origine.y + Math.round(t.dy * p)
      }
      const dx = nx - v.noeud.x
      const dy = ny - v.noeud.y
      const passagers = dx !== 0 || dy !== 0 ? this.passagersDe(v) : []
      v.noeud.x = nx
      v.noeud.y = ny
      c.corps.poser(v.noeud.id, nx + b.x, ny + b.y, b.l, b.h, e.matiereCorps)
      this.corpsInscrits.add(v.noeud.id)
      const vie = this.combat.vies.get(v.noeud.id)
      if (vie) { vie.x = nx; vie.y = ny }
      for (const w of passagers) {
        const wb = w.espece.boite
        const boite = rect(w.noeud.x + wb.x, w.noeud.y + wb.y, wb.l, wb.h)
        const fait = porter(c.grille, boite, dx, dy)
        w.noeud.x += fait.dx
        w.noeud.y += fait.dy
        const vw = this.combat.vies.get(w.noeud.id)
        if (vw) { vw.x = w.noeud.x; vw.y = w.noeud.y }
      }
    }
    // Un corps dont l'entite a disparu doit disparaitre aussi, sinon le monde
    // garde un obstacle invisible. On ne retire que ce qu'on a inscrit : le
    // registre appartient au jeu, pas au peuplement.
    for (const id of [...this.corpsInscrits]) {
      if (vus.has(id)) continue
      c.corps.retirer(id)
      this.corpsInscrits.delete(id)
    }
  }

  /** Les entites qui reposent sur le dessus de ce corps mobile. */
  private passagersDe(porteurEntite: Vivante): Vivante[] {
    const b = porteurEntite.espece.boite
    const hx = porteurEntite.noeud.x + b.x
    const hy = porteurEntite.noeud.y + b.y
    const sur: Vivante[] = []
    for (const w of this.vivantes.values()) {
      // Une plateforme ne porte pas une plateforme : empiler des corps mobiles
      // demande de les ordonner, et un cycle entre deux d'entre eux n'aurait
      // pas de reponse. On le refuse au lieu de le rendre imprevisible.
      if (w === porteurEntite || w.espece.matiereCorps !== 0) continue
      const wb = w.espece.boite
      if (w.noeud.y + wb.y + wb.h !== hy) continue
      const x0 = w.noeud.x + wb.x
      if (x0 < hx + b.l && x0 + wb.l > hx) sur.push(w)
    }
    return sur
  }

  /**
   * Sauter sur une tete : la frappe et le rebond.
   *
   * ## Pourquoi une passe a part
   *
   * Le pietinement et les degats de contact se disputent le meme instant. Les
   * laisser dans la meme boucle ferait dependre le vainqueur de l'ordre des
   * noeuds dans la scene — le heros mange la gelee s'il vient avant, la gelee
   * mange le heros s'il vient apres. Ce n'est pas une regle, c'est un tirage
   * au sort. La passe separee tranche : le pied passe avant la dent.
   *
   * ## Pourquoi il faut descendre
   *
   * `vy > 0` seulement. Sans cette condition, longer une creature en montant
   * la tuerait, et le joueur apprendrait un geste qui n'existe pas.
   */
  private resoudrePietinements(): void {
    for (const v of this.vivantes.values()) v.pietinee = false
    for (const v of this.vivantes.values()) {
      const p = v.plateformeur
      if (!p || p.vy <= 0) continue
      const b = v.espece.boite
      const pieds = rect(
        v.noeud.x + b.x, v.noeud.y + b.y + b.h - BANDE_PIETINEMENT,
        b.l, BANDE_PIETINEMENT + 1,
      )
      for (const w of this.vivantes.values()) {
        if (w === v || w.espece.degatsPietinement <= 0) continue
        if (w.espece.camp === v.espece.camp) continue
        const vw = this.combat.vies.get(w.noeud.id)
        if (!vw || vw.mort || vw.invulnerable > 0) continue
        const wb = w.espece.boite
        const tete = rect(w.noeud.x + wb.x, w.noeud.y + wb.y, wb.l, BANDE_PIETINEMENT)
        if (!seChevauchent(pieds, tete)) continue
        // Une frappe ordinaire, du camp du pietineur : l'invulnerabilite, la
        // poussee et le compte des abattus fonctionnent sans rien reecrire.
        this.combat.frapper(v.espece.camp, tete, w.espece.degatsPietinement, 1, 0, 0, 0)
        w.pietinee = true
        p.rebondir(w.espece.rebondPietinement)
        break
      }
    }
  }

  /**
   * Fait vivre la machine a etats d'une entite.
   *
   * Les conditions de distance passent AVANT la duree : un ennemi qui remarque
   * sa cible doit sortir de son guet tout de suite, pas a la fin du cycle
   * d'animation en cours.
   */
  private avancerEtat(v: Vivante, distance: number, dtMs: number): void {
    const e = v.etat as EtatEspece
    v.depuis += dtMs
    let vers: string | null = null
    if (e.siProche && distance < e.siProche.distance) vers = e.siProche.vers
    else if (e.siLoin && distance > e.siLoin.distance) vers = e.siLoin.vers
    else if (e.duree > 0 && v.depuis >= e.duree) vers = e.suivant
    if (!vers || vers === e.nom) return
    const suivant = v.espece.etats.find((q) => q.nom === vers)
    if (!suivant) return
    v.etat = suivant
    v.depuis = 0
    // `forcer` : on redemande peut-etre le meme clip pour un autre etat, et il
    // doit repartir de sa premiere image — c'est tout l'interet d'un temps
    // d'anticipation.
    v.lecteur.jouer(suivant.clip, true)
  }

  /** Ce qu'un evenement d'animation declenche dans l'etat courant. */
  private declencher(v: Vivante, evenement: string, dx: number, dy: number): void {
    const d = v.etat?.declencheurs?.filter((q) => q.evenement === evenement)
    if (!d || d.length === 0) return
    const n = Math.hypot(dx, dy) || 1
    const ux = dx / n
    const uy = dy / n
    for (const q of d) {
      if (q.frappe) {
        const f = q.frappe
        const b = v.espece.boite
        const centreY = v.noeud.y + b.y + b.h / 2
        // La boite part du CORPS et s'etend vers l'avant : posee a distance,
        // elle raterait ce qui est colle — c'est-a-dire ce qui vient de mordre.
        const horizontal = Math.abs(ux) >= Math.abs(uy)
        const sens = horizontal ? (Math.sign(ux) || 1) : (Math.sign(uy) || 1)
        const boite = horizontal
          ? rect(sens > 0 ? v.noeud.x : v.noeud.x - f.portee,
            centreY - f.epaisseur / 2, f.portee, f.epaisseur)
          : rect(v.noeud.x - f.epaisseur / 2,
            sens > 0 ? centreY : centreY - f.portee, f.epaisseur, f.portee)
        this.combat.frapper(v.espece.camp, boite, f.degats, f.dureeMs, f.poussee,
          horizontal ? sens : 0, horizontal ? 0 : sens)
      }
      if (q.tir) {
        const t = q.tir
        const combien = Math.max(1, t.nombre ?? 1)
        const ecart = ((t.ecart ?? 0) * Math.PI) / 180
        const base = Math.atan2(uy, ux)
        for (let k = 0; k < combien; k++) {
          // La salve s'ouvre autour de la direction visee, symetriquement :
          // un eventail qui part d'un cote donnerait un tir qui rate quand on
          // vise juste.
          const a = base + (k - (combien - 1) / 2) * ecart
          this.lancer(t.espece, v.noeud.x, v.noeud.y + v.espece.boite.y + v.espece.boite.h / 2,
            Math.cos(a), Math.sin(a), v.espece.camp)
        }
      }
    }
  }

  /** Retire une entite : noeud, vitalite et etat vivant d'un seul geste. */
  tuer(id: string): boolean {
    const v = this.vivantes.get(id)
    if (!v) return false
    this.vivantes.delete(id)
    this.combat.retirer(id)
    retirerDe(this.racine, v.noeud)
    return true
  }

  /**
   * Les entites que ce rectangle du monde touche.
   *
   * Elle regarde la SCENE et non les seules entites vivantes : l'editeur doit
   * pouvoir designer une entite posee pendant que le jeu est arrete, donc
   * jamais adoptee.
   */
  quiTouche(x: number, y: number, l: number, h: number): NoeudSprite[] {
    const touches: NoeudSprite[] = []
    const parcourir = (n: Noeud): void => {
      const id = (n as unknown as { espece?: string }).espece
      const e = typeof id === 'string' ? this.catalogue.get(id) : null
      if (e && n.type === 'sprite') {
        const bx = n.x + e.boite.x
        const by = n.y + e.boite.y
        if (bx < x + l && bx + e.boite.l > x && by < y + h && by + e.boite.h > y) {
          touches.push(n as NoeudSprite)
        }
      }
      for (const f of n.enfants) parcourir(f)
    }
    parcourir(this.racine)
    return touches
  }

  /** L'espece d'une entite vivante, ou null. */
  especeDeNoeud(id: string): Espece | null {
    return this.vivantes.get(id)?.espece ?? null
  }

  /** Retire de la scene toutes les entites posees. */
  vider(): void {
    for (const id of [...this.vivantes.keys()]) this.tuer(id)
  }

  /**
   * L'entite dont la boite couvre ce point du monde, ou null.
   *
   * Elle cherche dans la SCENE et non parmi les entites vivantes : une entite
   * posee pendant que le jeu est arrete n'a pas encore ete adoptee, et
   * l'editeur doit pouvoir la retirer tout de suite. La derniere trouvee
   * l'emporte — c'est celle du dessus, donc celle qu'on croit viser.
   */
  sous(x: number, y: number): NoeudSprite | null {
    let trouvee: NoeudSprite | null = null
    const parcourir = (n: Noeud): void => {
      const id = (n as unknown as { espece?: string }).espece
      const e = typeof id === 'string' ? this.catalogue.get(id) : null
      if (e && n.type === 'sprite') {
        const b = e.boite
        if (x >= n.x + b.x && x < n.x + b.x + b.l && y >= n.y + b.y && y < n.y + b.y + b.h) {
          trouvee = n as NoeudSprite
        }
      }
      for (const f of n.enfants) parcourir(f)
    }
    parcourir(this.racine)
    return trouvee
  }

  positions(): { x: number; y: number; espece: string }[] {
    return [...this.vivantes.values()].map((v) => ({ x: v.noeud.x, y: v.noeud.y, espece: v.espece.id }))
  }

  /**
   * L'etat vivant du peuplement, celui qui ne s'ecrit pas dans un fichier.
   *
   * ## Pourquoi il ne contient pas les noeuds
   *
   * Un noeud appartient a la SCENE, et la scene est instantanee a part —
   * autrement chaque entite serait copiee deux fois, et les deux copies
   * finiraient par diverger. Ici on ne garde que ce que le peuplement sait et
   * que personne d'autre ne sait : le cap d'une patrouille, le compteur d'un
   * bond, l'etat d'une machine, la position de lecture d'une animation, la
   * phase d'un porteur.
   *
   * ## Pourquoi le controleur de plateforme en fait partie
   *
   * C'est LUI qui porte la vitesse, le coyote, le tampon et la fraction de
   * pixel en attente. Un rembobinage qui les perd fait repartir le heros
   * immobile au milieu d'un saut — et le joueur voit sauter son personnage
   * sans avoir rien fait.
   */
  instantane(): unknown {
    return [...this.vivantes].map(([id, v]) => [id, {
      cap: v.cap,
      attente: v.attente,
      etat: v.etat?.nom ?? '',
      depuis: v.depuis,
      vx: v.vx,
      vy: v.vy,
      restant: v.restant,
      phase: v.phase,
      pietinee: v.pietinee,
      regard: { ...v.regard },
      lecteur: v.lecteur.instantane(),
      plateformeur: v.plateformeur ? v.plateformeur.instantane() : null,
    }])
  }

  restaurer(e: unknown): void {
    const liste = e as [string, {
      cap: number; attente: number; etat: string; depuis: number
      vx: number; vy: number; restant: number; phase: number; pietinee: boolean
      regard: { x: number; y: number }
      lecteur: [string, number, number, number]
      plateformeur: number[] | null
    }][]
    for (const [id, q] of liste) {
      const v = this.vivantes.get(id)
      // Une entite absente est normale : l'instantane peut venir d'un pas ou
      // elle vivait encore. On l'ignore au lieu de la recreer — la scene, elle,
      // sait qui existe, et c'est elle qui fait autorite.
      if (!v) continue
      v.cap = q.cap
      v.attente = q.attente
      v.etat = q.etat ? (v.espece.etats.find((x) => x.nom === q.etat) ?? v.etat) : null
      v.depuis = q.depuis
      v.vx = q.vx
      v.vy = q.vy
      v.restant = q.restant
      v.phase = q.phase
      v.pietinee = q.pietinee
      v.regard = { ...q.regard }
      v.lecteur.restaurer(q.lecteur)
      if (v.plateformeur && q.plateformeur) v.plateformeur.restaurer(q.plateformeur)
    }
  }

  /** Oublie tout l'etat vivant, sans toucher a la scene. */
  oublier(): void {
    for (const id of this.vivantes.keys()) this.combat.retirer(id)
    this.vivantes.clear()
  }
}

/** Retire un noeud de l'arbre, ou qu'il soit. */
export function retirerDe(racine: Noeud, cible: Noeud): boolean {
  const i = racine.enfants.indexOf(cible)
  if (i >= 0) { racine.enfants.splice(i, 1); return true }
  for (const e of racine.enfants) if (retirerDe(e, cible)) return true
  return false
}

/**
 * Cette entite-la a-t-elle a la fois la RAISON et le MOYEN de contourner ?
 *
 * ## La raison
 *
 * Poursuivre. Une patrouille qui n'a rien remarque, un projectile, un porteur
 * n'ont aucune cible a rejoindre : leur chercher un itineraire serait payer un
 * calcul a chaque pas pour n'en rien faire.
 *
 * ## Le moyen
 *
 * Le champ de navigation suppose qu'on peut aller dans les huit directions.
 * C'est vrai vu de dessus, et vrai d'une creature qui VOLE. Ca ne l'est pas
 * d'une creature pesante dans un monde vu de cote : elle marche, et un
 * itineraire qui passe par les airs l'enverrait droit dans un mur — en
 * S'ELOIGNANT de sa cible, ce qui est pire que l'entetement qu'on corrigeait.
 * Elle garde donc la ligne droite, c'est-a-dire ce qu'elle faisait avant que
 * la navigation existe : on ne peut rien lui faire perdre.
 *
 * C'est le meme mot que pour la pesanteur, et ce n'est pas un hasard :
 * `pesante` dit « ce monde a un bas, et je lui obeis ».
 *
 * ## Pourquoi c'est une fonction et non trois lignes dans la boucle
 *
 * Parce que c'est une REGLE, et qu'une regle doit pouvoir etre interrogee
 * seule. Ecrite dans la boucle, on ne pouvait l'eprouver qu'en observant une
 * creature pendant quelques secondes et en devinant pourquoi elle avait fait
 * ce qu'elle avait fait.
 */
export function peutContourner(
  intention: string, espece: Espece, projection: Projection, distance: number,
): boolean {
  const poursuit = intention === 'poursuite'
    || (intention === 'patrouille' && espece.vigilance > 0 && distance < espece.vigilance)
  if (!poursuit) return false
  return projection.regard !== 'cote' || !espece.pesante
}

/**
 * Ce que fait une entite, selon son intention.
 *
 * Les quatre tiennent dans une fonction parce qu'elles partagent tout sauf
 * trois lignes. Les separer en quatre classes ferait quatre endroits ou
 * oublier de normaliser une diagonale.
 */
function agir(
  v: Vivante, c: ContexteJeu, dx: number, dy: number, distance: number, dtMs: number,
  projection: Projection, tuile: number,
  /**
   * Ou aller pour contourner ce qui bloque, ou null pour la ligne droite.
   *
   * Elle est passee en argument et non lue depuis le peuplement : `agir` est
   * une fonction libre, et lui donner acces au peuplement entier pour un
   * vecteur ferait d'elle une methode qui s'ignore.
   */
  contournement: { x: number; y: number } | null = null,
): boolean {
  const e = v.espece
  // La pesanteur AVANT l'intention : une creature qui vient de tomber d'un
  // rebord doit decider ou aller depuis la place ou elle est.
  if (e.pesante && projection.regard === 'cote') tomber(v, c)
  const remarque = e.vigilance > 0 && distance < e.vigilance
  // L'intention de l'ETAT l'emporte sur celle de l'espece : c'est tout
  // l'interet d'avoir des etats. Sans etats, l'espece decide seule.
  const intention = v.etat ? v.etat.intention : e.comportement

  // Un porteur ne « fait » rien ici : son mouvement appartient a la passe des
  // corps mobiles, qui doit s'executer avant que quiconque ne decide ou il va.
  if (intention === 'porteur') return false
  if (intention === 'projectile') return avancerProjectile(v, c)
  if (intention === 'joueur') { dirigerVuDeDessus(v, c, projection, tuile); return false }
  if (intention === 'plateformeur') { dirigerDeCote(v, c); return false }
  if (intention === 'immobile') return false

  if (intention === 'poursuite' || (remarque && intention === 'patrouille')) {
    if (!remarque && intention === 'poursuite' && e.vigilance > 0) {
      patrouiller(v, c)
      return false
    }
    // Le contournement quand il y en a un, la ligne droite sinon. La ligne
    // droite reste le cas ordinaire : en salle ouverte, rien ne change.
    const n = distance || 1
    const ux = contournement ? contournement.x : dx / n
    const uy = contournement ? contournement.y : dy / n
    c.bouger(v.corps, ux * e.vitesse * c.dt, uy * e.vitesse * c.dt)
    return false
  }

  if (intention === 'bond') {
    // Le compteur descend en permanence. Au-dessus de zero elle se repose, en
    // dessous elle bondit ; passe le temps du bond, il remonte. Un seul nombre
    // pour les deux phases, donc aucun etat a garder coherent.
    v.attente -= dtMs
    if (v.attente <= 0) {
      const ax = remarque ? Math.sign(dx) : v.cap
      const ay = remarque ? Math.sign(dy) : 0
      const n = Math.hypot(ax, ay) || 1
      const r = c.bouger(v.corps, (ax / n) * e.vitesse * c.dt, (ay / n) * e.vitesse * c.dt)
      if (r.bloque) v.cap = -v.cap
      if (v.attente <= -DUREE_BOND) v.attente = DUREE_REPOS
    }
    return false
  }

  patrouiller(v, c)
  return false
}

/**
 * Ou en est l'aller-retour, de 0 a 1.
 *
 * Le cycle a quatre temps : aller, pause, retour, pause. Le mouvement est
 * LINEAIRE et non adouci — une plateforme adoucie est plus jolie et moins
 * lisible : on ne sait plus quand elle repart, donc on rate le saut. Ce qui
 * demande un rythme particulier s'ecrit dans l'atelier de scripts.
 */
export function avancementTrajet(phase: number, duree: number, pause: number): number {
  if (duree <= 0) return 0
  if (phase < duree) return phase / duree
  if (phase < duree + pause) return 1
  if (phase < 2 * duree + pause) return 1 - (phase - duree - pause) / duree
  return 0
}

/**
 * Un projectile : il va tout droit, et meurt sur ce qu'il touche.
 *
 * Il meurt sur le DECOR et non sur ce qu'il blesse : c'est sa frappe de
 * contact qui s'en charge, et faire mourir le tir a l'impact demanderait au
 * projectile de savoir qui il a touche — donc de dupliquer le systeme de
 * combat pour un cas particulier.
 */
function avancerProjectile(v: Vivante, c: ContexteJeu): boolean {
  const fait = c.bouger(v.corps, v.vx * c.dt, v.vy * c.dt)
  return fait.bloque
}

/**
 * La chute d'une creature ordinaire.
 *
 * Le compteur se remet a zero des qu'elle bute : garder la vitesse acquise
 * contre le sol la ferait s'enfoncer d'un coup au moment ou le sol disparait,
 * ce qui est le meme defaut que l'accumulateur bloque du controleur.
 */
function tomber(v: Vivante, c: ContexteJeu): void {
  v.vy = Math.min(CHUTE_MAX_ENTITE, v.vy + PESANTEUR_ENTITE * c.dt)
  const r = c.bouger(v.corps, 0, v.vy * c.dt)
  if (r.bloque) v.vy = 0
}

function patrouiller(v: Vivante, c: ContexteJeu): void {
  const r = c.bouger(v.corps, v.cap * v.espece.vitesse * c.dt, 0)
  if (r.bloque) v.cap = -v.cap
  v.noeud.miroir = v.cap < 0
}

/**
 * Les entrees qui appartiennent a CETTE entite.
 *
 * ## Pourquoi le nom du noeud
 *
 * Une entite dirigee doit lire ses propres touches, pas celles de tout le
 * monde. En solo il n'y a qu'un jeu d'entrees et la question ne se pose pas ;
 * a deux, les deux personnages lisaient les MEMES touches et bougeaient
 * ensemble — le defaut le plus previsible d'un multijoueur ajoute apres coup.
 *
 * Le nom du noeud sert d'identifiant de joueur. On aurait pu ajouter un champ
 * « joueur » a l'espece : ce serait faux, une espece decrit un TYPE de
 * creature et deux joueurs peuvent diriger la meme. Le noeud, lui, est unique.
 *
 * Un contexte qui ne connait pas la notion de joueur rend les entrees
 * communes : le solo ne paie rien.
 */
function entreesDe(v: Vivante, c: ContexteJeu): ContexteJeu['entrees'] {
  return c.entreesDe ? c.entreesDe(v.noeud.nom) : c.entrees
}

/**
 * Le personnage dirige au clavier, vu de dessus.
 *
 * La direction demandee est celle de l'ECRAN : on la ramene dans le monde
 * avant de l'employer. Sans cette conversion, appuyer sur « droite » dans une
 * vue isometrique deplace en diagonale — le defaut qui rend injouable la
 * moitie des jeux isometriques amateurs. Puis on la normalise : sans cela on
 * avance 1,41 fois plus vite en biais, ce qui est le defaut le plus repandu
 * des jeux vus de dessus.
 */
function dirigerVuDeDessus(
  v: Vivante, c: ContexteJeu, projection: Projection, tuile: number,
): void {
  const a = entreesDe(v, c).axe()
  if (a.x || a.y) {
    const d = deprojeter(projection, a.x, a.y, tuile)
    const n = Math.hypot(d.x, d.y) || 1
    c.bouger(v.corps, (d.x / n) * v.espece.vitesse * c.dt, (d.y / n) * v.espece.vitesse * c.dt)
    v.regard = { x: a.x, y: a.y }
  }
  jouerClipDirige(v, a.x !== 0 || a.y !== 0)
}

/** Le personnage dirige au clavier, vu de cote : c'est le controleur complet. */
function dirigerDeCote(v: Vivante, c: ContexteJeu): void {
  const p = v.plateformeur
  if (!p) return
  const e = lireEntrees(entreesDe(v, c))
  const b = { x: v.corps.boiteX, y: v.corps.boiteY, l: v.corps.boiteL, h: v.corps.boiteH }
  const mobile = { x: v.noeud.x, y: v.noeud.y, boite: b }
  // `c.grille` et non `c.carte` : c'est ce qui fait qu'on se tient sur une
  // plateforme mobile au lieu de la traverser.
  p.avancer(c.grille, mobile, c.dt, e.dirX, e.sauteDemande, e.sauteTenu, e.dash, e.dirY)
  v.noeud.x = mobile.x
  v.noeud.y = mobile.y
  if (e.dirX) { v.noeud.miroir = e.dirX < 0; v.regard = { x: e.dirX, y: 0 } }
  // C'est l'ETAT du controleur qui choisit le clip, jamais les touches : on
  // appuie sur « droite » aussi bien au sol qu'en plein vol.
  const d = p.diagnostic()
  const essais = !d.auSol
    ? (d.vy < 0 ? ['saut'] : ['chute'])
    : (Math.abs(d.vx) > 4
      ? [v.espece.clip, 'marche-cote']
      : ['repos-cote', 'repos', v.espece.clip])
  for (const nom of essais) {
    if (v.lecteur.clips.has(nom)) { v.lecteur.jouer(nom); return }
  }
  v.lecteur.jouer(v.espece.clip)
}

/**
 * Choisit le clip selon la direction, quand l'espece en a plusieurs.
 *
 * La direction verticale l'emporte : de dos ou de face se lit mieux qu'un
 * profil, et en diagonale on veut voir le visage.
 */
function jouerClipDirige(v: Vivante, bouge: boolean): void {
  const e = v.espece
  if (!e.clipsDiriges) { v.lecteur.jouer(e.clip); return }
  const a = v.regard
  const cote = a.y > 0 ? 'bas' : (a.y < 0 ? 'haut' : 'cote')
  v.noeud.miroir = a.y === 0 && a.x < 0
  const nom = `${bouge ? e.clip : 'repos'}-${cote}`
  if (v.lecteur.clips.has(nom)) v.lecteur.jouer(nom)
  else v.lecteur.jouer(e.clip)
}

/**
 * Les matieres que ce rectangle du monde touche, reunies.
 *
 * On reunit au lieu de rendre la premiere : une boite a cheval sur du sol et
 * sur une pointe touche bien la pointe, et prendre la case du coin haut-gauche
 * ferait dependre les degats de la facon dont on est arrive.
 */
export function matieresSous(
  g: {
    tuile: number
    matiere?(cx: number, cy: number): number
    solide(cx: number, cy: number): boolean
  },
  r: { x: number; y: number; w: number; h: number },
): number {
  // Une grille qui ne connait que le solide reste valable : c'est ce que
  // rendent les bancs les plus anciens, et une carte importee d'ailleurs.
  const lire = g.matiere
    ? (cx: number, cy: number): number => (g.matiere as (a: number, b: number) => number)(cx, cy)
    : (cx: number, cy: number): number => (g.solide(cx, cy) ? 1 : 0)
  let m = 0
  const x0 = Math.floor(r.x / g.tuile)
  const y0 = Math.floor(r.y / g.tuile)
  const x1 = Math.floor((r.x + r.w - 1) / g.tuile)
  const y1 = Math.floor((r.y + r.h - 1) / g.tuile)
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) m |= lire(cx, cy)
  }
  return m
}
