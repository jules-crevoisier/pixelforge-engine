import type { Noeud, NoeudSprite, NoeudCorps } from '../scene/noeud.ts'
import { creerNoeud } from '../scene/noeud.ts'
import type { ContexteJeu } from './jeu.ts'
import { Combat, visibleSousInvulnerabilite, type Camp } from './combat.ts'
import { Lecteur, type Clip } from './animation.ts'
import { rect } from '../noyau/pixel.ts'
import { BLESSANTE } from '../tuiles/tilemap.ts'
import { type Projection, ORTHO_DESSUS, deprojeter } from '../noyau/projection.ts'
import { Plateformeur, lireEntrees, type ReglagesPlateforme } from './plateforme.ts'

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
  | 'projectile'

export const COMPORTEMENTS: Comportement[] = [
  'immobile', 'patrouille', 'poursuite', 'bond', 'joueur', 'plateformeur',
  'projectile',
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

/** Ce qu'une case blessante retire, par defaut. */
export const DEGATS_MATIERE = 1

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
    n.image = lecteur.image
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
  avancer(
    c: ContexteJeu, cible: { x: number; y: number }, dtMs: number,
  ): { id: string; nom: string }[] {
    const evenements: { id: string; nom: string }[] = []
    const aRetirer: string[] = []
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

      const fini = agir(v, c, dx, dy, distance, dtMs, this.projection, this.tuile)
      if (fini) { aRetirer.push(v.noeud.id); continue }

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
      v.noeud.image = v.lecteur.image

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

      // Le contact blesse par une frappe d'une seule image, refaite a chaque
      // pas. Une « zone qui blesse en permanence » serait un deuxieme
      // mecanisme a cote des frappes, avec ses propres regles de repetition —
      // donc deux endroits ou se tromper.
      if (v.espece.degats > 0 && !dirigee) {
        this.combat.frapper(v.espece.camp, rect(
          v.noeud.x + v.espece.boite.x, v.noeud.y + v.espece.boite.y,
          v.espece.boite.l, v.espece.boite.h,
        ), v.espece.degats, 1, 150, dx, dy)
      }
    }
    for (const id of aRetirer) this.tuer(id)
    return evenements
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
 * Ce que fait une entite, selon son intention.
 *
 * Les quatre tiennent dans une fonction parce qu'elles partagent tout sauf
 * trois lignes. Les separer en quatre classes ferait quatre endroits ou
 * oublier de normaliser une diagonale.
 */
function agir(
  v: Vivante, c: ContexteJeu, dx: number, dy: number, distance: number, dtMs: number,
  projection: Projection, tuile: number,
): boolean {
  const e = v.espece
  const remarque = e.vigilance > 0 && distance < e.vigilance
  // L'intention de l'ETAT l'emporte sur celle de l'espece : c'est tout
  // l'interet d'avoir des etats. Sans etats, l'espece decide seule.
  const intention = v.etat ? v.etat.intention : e.comportement

  if (intention === 'projectile') return avancerProjectile(v, c)
  if (intention === 'joueur') { dirigerVuDeDessus(v, c, projection, tuile); return false }
  if (intention === 'plateformeur') { dirigerDeCote(v, c); return false }
  if (intention === 'immobile') return false

  if (intention === 'poursuite' || (remarque && intention === 'patrouille')) {
    if (!remarque && intention === 'poursuite' && e.vigilance > 0) {
      patrouiller(v, c)
      return false
    }
    const n = distance || 1
    c.bouger(v.corps, (dx / n) * e.vitesse * c.dt, (dy / n) * e.vitesse * c.dt)
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

function patrouiller(v: Vivante, c: ContexteJeu): void {
  const r = c.bouger(v.corps, v.cap * v.espece.vitesse * c.dt, 0)
  if (r.bloque) v.cap = -v.cap
  v.noeud.miroir = v.cap < 0
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
  const a = c.entrees.axe()
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
  const e = lireEntrees(c.entrees)
  const b = { x: v.corps.boiteX, y: v.corps.boiteY, l: v.corps.boiteL, h: v.corps.boiteH }
  const mobile = { x: v.noeud.x, y: v.noeud.y, boite: b }
  p.avancer(c.carte, mobile, c.dt, e.dirX, e.sauteDemande, e.sauteTenu, e.dash, e.dirY)
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
