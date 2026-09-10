import {
  Carte, VIDE, SOLIDE, BLESSANTE, PLATEFORME,
  PENTE_DROITE, PENTE_GAUCHE, PENTE_DEMI, PENTE_HAUTE,
} from '../tuiles/tilemap.ts'
import { creerNoeud, type Noeud, type NoeudSprite, type NoeudCorps } from '../scene/noeud.ts'
import type { Vue } from '../runtime/ecran.ts'
import type { Jeu, ContexteJeu } from '../runtime/jeu.ts'
import { atlasDepuisLettres, couleursDe } from '../runtime/atlas.ts'
import {
  type Projection, ORTHO_DESSUS, ORTHO_COTE, ISO,
} from '../noyau/projection.ts'
import { REGLAGES_DEFAUT } from '../runtime/plateforme.ts'
import {
  TUILE, CLE_DONJON, CLE_HEROS, PLANCHE_DONJON, PLANCHE_HEROS, COLONNES_HEROS,
  DIR_BAS, DIR_DROITE, TEMPS_REPOS, imageHeros,
} from './art.ts'
import type { Clip } from '../runtime/animation.ts'
import {
  CLE_CAVERNE, PLANCHE_CAVERNE, TUILE_FOND, TUILE_LANTERNE,
  TUILE_POINTES, TUILE_PASSERELLE,
  TUILE_PENTE_D, TUILE_PENTE_G,
  TUILE_DEMI_D_BAS, TUILE_DEMI_D_HAUT, TUILE_DEMI_G_BAS, TUILE_DEMI_G_HAUT,
  TUILE_LOINTAIN, LOINTAIN_NOMBRE,
} from './art-cote.ts'
import {
  CLE_ISO, PLANCHE_ISO, LARGEUR_ISO, HAUTEUR_ISO, HAUTEUR_DESSIN_ISO,
  ISO_SOL, ISO_HERBE, ISO_EAU, ISO_MUR, ISO_CAISSE, ISO_SORTIE,
} from './art-iso.ts'
import { construireDonjon } from './donjon.ts'
import { decrirePlanche, type PlancheSerialisee } from '../export/format.ts'
import { Peuplement, type Espece as EspeceJeu } from '../runtime/entites.ts'
import { Combat } from '../runtime/combat.ts'
import { ESPECES_DEMO, clipsDemo } from './especes-demo.ts'
import { engendrerPlan, Hasard, type SallePlan } from '../niveau/plan.ts'
import { Aventure } from './aventure.ts'
import { PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES } from './art-creatures.ts'
import { MODELES_DEMO, SYMBOLES_DEMO } from './salles-demo.ts'
import { SONS_DEMO, brancherAudio } from './sons-demo.ts'
import { MUSIQUES_DEMO, brancherMusique } from './musiques-demo.ts'
import { TEXTES_DEMO, LANGUES_DEMO } from './textes-demo.ts'
import { Musicien, rendreMusique, type Musique as MusiqueJeu } from '../runtime/musique.ts'
import { Traduction } from '../runtime/traduction.ts'
import { rendre as rendreSon, type Son as SonJeu } from '../runtime/son.ts'
import { Dialogue, replique, type Replique as RepliqueJeu } from '../runtime/dialogue.ts'
import { Menu, entree } from '../runtime/menu.ts'
import { dessinerDialogue, dessinerMenu, ecrireCentre } from '../runtime/rendu-texte.ts'
import { assemblerEtage } from '../niveau/assemblage.ts'
import { TUILE_SOL, TUILE_SORTIE } from './art.ts'

/**
 * Les mondes de demonstration : un par REGARD.
 *
 * ## Pourquoi trois mondes et non trois options d'un seul
 *
 * Un moteur qui annonce « il fait aussi l'isometrique » sans qu'on puisse
 * l'essayer n'annonce rien du tout. Les trois modes existaient deja dans le
 * code — la projection, le controleur de plateforme, le tri en profondeur — et
 * aucun n'etait ATTEIGNABLE depuis l'editeur : il chargeait un donjon vu de
 * dessus, en dur. Un mode qu'on ne peut pas lancer est un mode qu'on ne peut
 * pas contredire, donc un mode dont on ne sait rien.
 *
 * Les trois partagent tout ce qui compte : la meme grille carree, le meme
 * moteur de collision, le meme heros, le meme contrat de pixel. Ce qui change
 * tient en trois lignes de declaration — une projection, un script, une
 * planche. C'est la preuve que le decoupage etait le bon.
 */
export interface Monde {
  readonly id: string
  readonly nom: string
  readonly aide: string
  readonly vue: Vue
  readonly projection: Projection
  readonly carte: Carte
  readonly racine: Noeud
  readonly heros: NoeudSprite
  readonly depart: { x: number; y: number }
  /** Les couleurs des planches, pour la palette du projet. */
  readonly couleurs: string[]
  /** Les clips d'animation, pour que l'export les emporte avec le reste. */
  readonly animations: Clip[]
  /** Le catalogue des especes, pour que l'export et l'editeur les connaissent. */
  readonly especes: EspeceJeu[]
  /**
   * Les sons et les dialogues du monde.
   *
   * Ils sont ici pour la meme raison que les planches : ce qui n'est pas dans
   * le fichier de projet n'existe pas. Un monde qui garde ses sons dans son
   * code se rouvre muet, et s'exporte muet.
   */
  readonly sons?: SonJeu[]
  readonly dialogues?: { nom: string; repliques: RepliqueJeu[] }[]
  /** Les musiques du monde, en notes. Meme raison que les sons. */
  readonly musiques?: MusiqueJeu[]
  /**
   * Les textes du monde, par langue puis par clef.
   *
   * Un jeu dont les libelles vivent dans le code se traduit en recompilant, et
   * ne se traduit donc pas. Ils partent dans le fichier de projet avec le
   * reste, et les six chargeurs les retrouvent.
   */
  readonly textes?: Record<string, Record<string, string>>
  /**
   * Le peuplement, quand le monde en a un.
   *
   * C'est par lui que l'editeur pose et retire des entites. Un monde sans
   * peuplement — il n'y en a plus — se contenterait de ne pas proposer l'outil.
   */
  readonly peuplement?: Peuplement
  /**
   * Les planches de dessins.
   *
   * Elles partent dans le fichier de projet avec tout le reste. Un projet qui
   * decrit une carte sans dire a quoi ses tuiles ressemblent n'est lisible que
   * par le programme qui l'a ecrit — donc l'enregistrer ne sert a rien.
   */
  readonly planches: PlancheSerialisee[]
  /** Tuile posee par le pinceau quand le calque n'a pas de terrain. */
  readonly tuilePinceau: number
  /** Branche planches et scripts sur un jeu. */
  installer(jeu: Jeu): void
  /** Remet le monde a son depart, quand on arrete de jouer. */
  reinitialiser(): void
  /** Ce que la barre d'etat montre pendant la partie. */
  etat(): string
  /**
   * Ce que les bancs et la console peuvent inspecter.
   *
   * Un monde qu'on ne peut interroger que par sa barre d'etat s'observe comme
   * un poisson dans un bocal : on voit qu'il tourne, on ne sait pas pourquoi.
   * La sonde n'est jamais lue par le jeu lui-meme.
   */
  sonde?(): Record<string, unknown>
}

/**
 * Le script unique qui fait vivre tout un peuplement.
 *
 * Un script PAR entite obligerait a en poser un a chaque fois qu'on en ajoute
 * une dans l'editeur — et a l'oublier une fois sur deux. Celui-ci est pose sur
 * la racine de la scene et suffit a tous : il accorde le peuplement sur ce que
 * porte la scene, le fait avancer, et retire ce qui meurt.
 */
function scriptPeuplement(
  peuplement: Peuplement, combat: Combat, cible: () => { x: number; y: number },
  surEvenement: (nom: string) => void = () => {},
): (c: ContexteJeu) => void {
  return (c) => {
    const dtMs = c.dt * 1000
    peuplement.synchroniser()
    for (const e of peuplement.avancer(c, cible(), dtMs)) surEvenement(e.nom)
    for (const impact of combat.avancer(dtMs)) {
      if (impact.fatal) peuplement.tuer(impact.cible)
    }
  }
}

/* ------------------------------------------------------------------ */
/* 1. Le donjon : vu de dessus, orthogonal                             */
/* ------------------------------------------------------------------ */

/**
 * Le heros marche a soixante-dix pixels par seconde, et cela ne s'ecrit plus
 * ici : c'est une valeur du catalogue des especes. Voir `especes-demo.ts`.
 */

export function mondeDonjon(): Monde {
  const d = construireDonjon()
  const projection = ORTHO_DESSUS(TUILE)
  const animations = clipsDemo()
  const combat = new Combat()
  const peuplement = new Peuplement(d.racine, combat, ESPECES_DEMO, animations, projection, TUILE)
  // Le heros est une ENTITE, comme tout le reste. C'est ce qui lui permet de
  // survivre a un enregistrement : le fichier dit « ce noeud est un heros », et
  // le catalogue dit ce qu'un heros sait faire.
  ;(d.heros as unknown as { espece: string }).espece = 'heros'
  let pas = 0
  return {
    id: 'donjon',
    nom: 'Donjon — vue de dessus',
    aide: 'Flèches ou ZQSD pour marcher. La diagonale est normalisée : on n’avance pas plus vite en biais.',
    vue: { largeur: 320, hauteur: 180 },
    projection,
    carte: d.carte,
    racine: d.racine,
    heros: d.heros,
    depart: d.depart,
    couleurs: [...couleursDe(CLE_DONJON), ...couleursDe(CLE_HEROS), ...couleursDe(CLE_CREATURES)],
    animations,
    planches: [
      decrirePlanche('donjon', PLANCHE_DONJON, CLE_DONJON, 8, TUILE),
      decrirePlanche('heros', PLANCHE_HEROS, CLE_HEROS, COLONNES_HEROS, TUILE),
      decrirePlanche('creatures', PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES, TUILE),
    ],
    especes: ESPECES_DEMO,
    sons: SONS_DEMO,
    musiques: MUSIQUES_DEMO,
    textes: TEXTES_DEMO,
    peuplement,
    tuilePinceau: 0,
    installer(jeu) {
      jeu.cartes.set('salle', { carte: d.carte, atlas: atlasDepuisLettres(PLANCHE_DONJON, CLE_DONJON, TUILE, 8) })
      jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, COLONNES_HEROS))
      // Les evenements de l'animation servent ici a compter les pas ; dans un
      // vrai jeu ils declencheraient un bruit et une trace au sol. Le lecteur
      // ne les appelle pas lui-meme : il les REND, et c'est ce qui lui permet
      // d'etre eprouve au banc sans navigateur.
      jeu.scripts.set(d.racine.nom, scriptPeuplement(
        peuplement, combat, () => d.heros, (e) => { if (e === 'pas') pas++ },
      ))
      jeu.suivreNoeud('heros')
      jeu.margeCamera = { x: 32, y: 20 }
    },
    reinitialiser() {
      d.heros.x = d.depart.x
      d.heros.y = d.depart.y
      d.heros.image = imageHeros(DIR_BAS, TEMPS_REPOS)
      d.heros.miroir = false
      combat.reinitialiser()
      peuplement.oublier()
      pas = 0
    },
    etat: () => `vue de dessus · tri par y · ${peuplement.nombre} entité(s) · ${pas} pas`,
  }
}

/* ------------------------------------------------------------------ */
/* 2. La caverne : vue de cote, avec gravite                           */
/* ------------------------------------------------------------------ */

/**
 * Le plan de la caverne.
 *
 * Il se lit comme une route : on part en bas a gauche, on franchit deux
 * fosses, on remonte le puits de droite en sautant d'une paroi a l'autre, et
 * l'on repart vers la gauche par le couloir bas jusqu'a la lanterne. Chaque
 * obstacle est la pour eprouver une technique precise du controleur — le
 * ressaut pour la correction de coin, les fosses pour la portee du saut, le
 * puits pour la glissade et le saut mural.
 *
 * Les distances ne sont pas choisies a vue : le banc verifie qu'aucune fosse
 * ne depasse la portee reelle du saut, calculee depuis les reglages. Un niveau
 * infranchissable est le genre de faute qu'on ne decouvre qu'en jouant, et
 * seulement si l'on va jusque-la.
 */
const PLAN_CAVERNE = [
  '###########################################',
  '#.........................................#',
  '#.........................................#',
  '#.......#######################...........#',
  '#.........................................#',
  '#....L....!.........###..../###%..pP##Qq..#',
  '#...####################################..#',
  '#......................................#..#',
  '#......................................#..#',
  '#..........===........===..............#..#',
  '#......................................#..#',
  '#.........~............................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#............................##....!...#..#',
  '#......................_...............#..#',
  '#..@..............###.g...!...o...g.......#',
  '############...#########..#################',
  '############^^^#########^^#################',
  '###########################################',
  '###########################################',
]

/**
 * Les cotes du plan : le caractere, sa tuile et sa matiere.
 *
 * `/` et `%` montent a quarante-cinq degres — la barre inverse demanderait
 * d'echapper un echappement dans un fichier qui decrit deja des dessins.
 * `p` puis `P` sont les deux cases d'une demi-pente montant a droite ; `Q`
 * puis `q` celles d'une demi-pente montant a gauche, dans l'ordre ou on les
 * rencontre en allant vers la droite.
 *
 * Les lettres sont choisies pour ne rencontrer aucune de celles qui posent une
 * entite : `g` designe une gelee, et une cote qui fait apparaitre une creature
 * est le genre de surprise qu'on met une heure a comprendre.
 */
const COTES_CAVERNE: Record<string, { tuile: number; matiere: number }> = {
  '/': { tuile: TUILE_PENTE_D, matiere: PENTE_DROITE },
  '%': { tuile: TUILE_PENTE_G, matiere: PENTE_GAUCHE },
  p: { tuile: TUILE_DEMI_D_BAS, matiere: PENTE_DROITE | PENTE_DEMI },
  P: { tuile: TUILE_DEMI_D_HAUT, matiere: PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE },
  Q: { tuile: TUILE_DEMI_G_HAUT, matiere: PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE },
  q: { tuile: TUILE_DEMI_G_BAS, matiere: PENTE_GAUCHE | PENTE_DEMI },
}

/**
 * Ce que les lettres du plan posent comme entites.
 *
 * Une table et non une suite de `if` : ajouter une creature au niveau devient
 * une ligne de donnees, et l'on voit d'un coup d'oeil tout ce que le plan sait
 * poser. C'est le meme principe que pour les especes elles-memes.
 */
const ENTITES_CAVERNE: Record<string, string> = {
  '!': 'balise',
  '~': 'plateforme-mobile',
  _: 'ascenseur',
  o: 'caisse',
  g: 'gelee',
}

/**
 * La pause : un menu par-dessus le jeu.
 *
 * ## Pourquoi elle arrete le monde
 *
 * Un menu ouvert pendant que le jeu continue fait mourir pendant qu'on lit,
 * ce qui est la faute la plus injuste qu'un jeu puisse commettre. La pause ne
 * met donc pas le jeu « en sourdine » : elle prend la main entierement, et le
 * script du monde rend la main avant d'avancer quoi que ce soit.
 *
 * ## Pourquoi elle vit ici et non dans le moteur
 *
 * Ce qu'un menu de pause PROPOSE appartient au jeu : reprendre, recommencer,
 * couper le son. Le moteur fournit le menu, la navigation, le dessin — il n'a
 * pas a decider qu'un jeu se met en pause, ni avec quelles entrees.
 */
class Pause {
  readonly menu: Menu
  /**
   * La traduction du menu.
   *
   * Elle est ICI et pas dans le moteur : ce qu'un menu de pause dit appartient
   * au jeu, la table qui le traduit aussi. Le moteur ne fournit que la regle —
   * une clef absente rend la clef.
   */
  readonly tr = new Traduction(TEXTES_DEMO, LANGUES_DEMO[0])
  /** Ce qui joue la musique. Absent tant qu'on n'a pas installe le monde. */
  musicien: Musicien | null = null

  private ouvert = false
  private surRecommencer: () => void
  private volumeSon = 0.6

  constructor(surRecommencer: () => void) {
    this.surRecommencer = surRecommencer
    this.menu = new Menu(this.entrees())
  }

  /**
   * Les lignes du menu, refaites a chaque changement.
   *
   * Elles sont RECALCULEES et non modifiees en place : le libelle depend de la
   * langue ET de l'etat de deux interrupteurs, et tenir trois sources a jour
   * separement est le moyen le plus sur de les faire diverger.
   */
  private entrees(): ReturnType<typeof entree>[] {
    const etat = (actif: boolean): string => this.tr.t(actif ? 'etat.oui' : 'etat.non')
    return [
      entree(this.tr.t('menu.reprendre'), 'reprendre'),
      entree(this.tr.t('menu.recommencer'), 'recommencer'),
      entree(this.tr.t('menu.son', { etat: etat(this.volumeSon > 0) }), 'son'),
      entree(this.tr.t('menu.musique', { etat: etat((this.musicien?.volume ?? 0) > 0) }), 'musique'),
      entree(this.tr.t('menu.langue', { langue: this.tr.t(`langue.${this.tr.langue}`) }), 'langue'),
    ]
  }

  /**
   * Refait les libelles.
   *
   * `remplacer` garde la selection par VALEUR et non par rang : c'est ce qui
   * fait que basculer la langue ne renvoie pas le curseur en haut du menu,
   * alors que les cinq libelles ont change en meme temps.
   */
  private rafraichir(): void { this.menu.remplacer(this.entrees()) }

  get ouverte(): boolean { return this.ouvert }
  ouvrir(): void { this.ouvert = true }
  fermer(): void { this.ouvert = false }

  avancer(c: ContexteJeu, sonneur: { volume: number }, pas: number): void {
    const bouger = (d: number): void => {
      if (this.menu.deplacer(d)) {
        ;(sonneur as unknown as { evenement(p: number, s: string, n: string): boolean })
          .evenement(pas, 'menu', 'menu')
      }
    }
    if (c.entrees.consommer('haut')) bouger(-1)
    if (c.entrees.consommer('bas')) bouger(1)
    if (c.entrees.consommer('annuler')) { this.fermer(); return }
    if (!c.entrees.consommer('action') && !c.entrees.consommer('saut')) return
    ;(sonneur as unknown as { evenement(p: number, s: string, n: string): boolean })
      .evenement(pas, 'menu', 'valider')
    const quoi = this.menu.valider()
    if (quoi === 'reprendre') this.fermer()
    else if (quoi === 'recommencer') { this.surRecommencer(); this.fermer() }
    else if (quoi === 'son') {
      // Le volume bascule, et l'entree DIT dans quel etat elle est. Un
      // interrupteur qui ne montre pas son etat se teste en appuyant dessus,
      // c'est-a-dire en subissant ce qu'on voulait eviter.
      this.volumeSon = this.volumeSon > 0 ? 0 : 0.6
      sonneur.volume = this.volumeSon
      this.rafraichir()
    } else if (quoi === 'musique') {
      // Couper la musique l'ARRETE au lieu de la jouer a volume zero : une
      // source muette continue de tourner, et sur une machine modeste elle
      // coute autant qu'une source audible.
      const m = this.musicien
      if (m) {
        if (m.volume > 0) { m.volume = 0; m.arreter() } else { m.volume = 0.4; m.jouer('caverne') }
      }
      this.rafraichir()
    } else if (quoi === 'langue') {
      const i = LANGUES_DEMO.indexOf(this.tr.langue)
      this.tr.langue = LANGUES_DEMO[(i + 1) % LANGUES_DEMO.length]
      this.rafraichir()
    }
  }
}

/**
 * Donne une musique au menu de pause, et la lance.
 *
 * Le musicien est cree ICI et non dans la pause : un monde sans musique doit
 * pouvoir ouvrir sa pause sans en fabriquer une. `musicien` reste donc nul
 * tant que personne n'appelle cette fonction, et l'entree « Musique » du menu
 * ne fait rien plutot que de planter.
 */
function installerMusique(pause: Pause): void {
  const musicien = new Musicien(MUSIQUES_DEMO)
  brancherMusique(musicien, rendreMusique)
  pause.musicien = musicien
  // On lance sans attendre : le navigateur refusera peut-etre tant que
  // personne n'a clique, mais le pont reprend le contexte suspendu au premier
  // son suivant. Attendre un clic ici demanderait au monde de savoir ce qu'est
  // un clic, ce qu'il n'a pas a savoir.
  musicien.jouer('caverne')
}

export function mondeCaverne(): Monde {
  const largeur = PLAN_CAVERNE[0].length
  const hauteur = PLAN_CAVERNE.length
  const carte = new Carte(largeur, hauteur, TUILE)
  /*
   * Le lointain, DEVANT tout le reste dans l'ordre des calques et derriere
   * tout le reste a l'ecran — c'est le premier calque, donc le premier
   * dessine.
   *
   * Il defile a 40 % horizontalement et a 25 % verticalement, et pas au meme
   * rythme sur les deux axes : un fond de cavernes fuit sur les cotes quand on
   * court, et bouge a peine quand on saute. Un facteur unique obligerait a
   * choisir entre les deux, et le mauvais choix se voit a chaque saut.
   *
   * Il SE REPETE, sans quoi la parallaxe ne servirait a rien : a 40 %, il
   * couvre deux fois et demie moins de monde que le sol, et le vide
   * apparaitrait des qu'on s'eloigne du depart.
   */
  const lointain = carte.ajouterCalque('lointain', {
    parallaxe: { x: 0.4, y: 0.25 },
    repete: true,
  })
  const fond = carte.ajouterCalque('fond', { presence: new Uint8Array(largeur * hauteur) })
  const roche = carte.ajouterCalque('roche', {
    terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: true },
  })
  // Pointes et passerelles vont sur leur propre calque : elles ne suivent
  // aucun voisinage, et les melanger au terrain ferait recalculer leur dessin
  // a chaque coup de pinceau sur la roche d'a cote.
  const decor = carte.ajouterCalque('pieges', { presence: new Uint8Array(largeur * hauteur) })

  let depart = { x: TUILE, y: TUILE }
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const c = PLAN_CAVERNE[y][x]
      const i = carte.index(x, y)
      /*
       * Le calque « fond » ne porte plus QUE la lanterne.
       *
       * Il pavait toute la salle d'une tuile opaque, ce qui recouvrait le
       * lointain : la parallaxe existait, defilait, et ne se voyait nulle
       * part. Le fond d'une salle, c'est ce qu'on voit au loin — pas un aplat
       * pose devant.
       */
      if (c === 'L') {
        fond.cases[i] = TUILE_LANTERNE
        if (fond.presence) fond.presence[i] = 1
      }
      // Le lointain ne suit pas le plan : il pave, et sa tuile depend de la
      // case. Un motif regulier se lirait comme un papier peint ; on melange
      // donc les deux axes pour que la periode ne saute pas aux yeux.
      lointain.cases[i] = TUILE_LOINTAIN + ((x * 3 + y * 5) % LOINTAIN_NOMBRE)
      if (c === '#') {
        if (roche.presence) roche.presence[i] = 1
        carte.solides[i] = SOLIDE
      }
      // Les pointes ne sont PAS solides : on tombe dedans, on ne s'y cogne
      // pas. Une pointe solide arrete la chute et laisse vivant, ce qui est
      // exactement le contraire de ce qu'on en attend.
      if (c === '^') {
        decor.cases[i] = TUILE_POINTES
        carte.solides[i] = BLESSANTE
      }
      // La passerelle, elle, ne bloque que ce qui tombe dessus.
      if (c === '=') {
        decor.cases[i] = TUILE_PASSERELLE
        carte.solides[i] = PLATEFORME
      }
      /*
       * Les cotes.
       *
       * Elles vont sur le calque des pieges et non sur la roche : la roche est
       * un calque de TERRAIN, dont chaque case se recalcule depuis ses
       * voisines. Une pente n'a pas de voisinage — sa forme lui appartient —
       * et la poser sur le terrain la ferait remplacer par un bloc au premier
       * coup de pinceau d'a cote.
       *
       * Une pente n'est PAS solide : marquee solide, elle bloque comme un mur
       * et l'on se cogne dans le bas de la cote au lieu de la monter.
       */
      const cote = COTES_CAVERNE[c]
      if (cote) {
        decor.cases[i] = cote.tuile
        carte.solides[i] = cote.matiere
      }
      if (c === '@') depart = { x: x * TUILE + TUILE / 2, y: y * TUILE + TUILE }
    }
  }
  carte.rafraichirTout(roche)
  for (let i = 0; i < roche.cases.length; i++) if (!roche.presence?.[i]) roche.cases[i] = VIDE

  const racine = creerNoeud('noeud', 'caverne')
  const noeudCarte = creerNoeud('carte', 'decor') as Noeud & { source: string }
  noeudCarte.source = 'caverne'
  racine.enfants.push(noeudCarte)

  const heros = creerNoeud('sprite', 'heros') as NoeudSprite
  heros.source = 'heros'
  heros.image = imageHeros(DIR_DROITE, TEMPS_REPOS)
  heros.ancreX = TUILE / 2
  heros.ancreY = TUILE
  heros.x = depart.x
  heros.y = depart.y

  const corps = creerNoeud('corps', 'corps') as NoeudCorps
  // Une boite etroite et haute : c'est une silhouette debout, pas une paire de
  // pieds. Vue de cote, la largeur decide de ce qui accroche aux murs et la
  // hauteur de ce qui passe sous un plafond.
  corps.boiteX = -4
  corps.boiteY = -14
  corps.boiteL = 8
  corps.boiteH = 14
  heros.enfants.push(corps)
  racine.enfants.push(heros)

  const projection = ORTHO_COTE(TUILE)
  const animations = clipsDemo()
  ;(heros as unknown as { espece: string }).espece = 'heros-cote'
  // Un seul point de vie : une pointe tue. C'est le contrat de Celeste, et il
  // ne tient que parce que la reapparition est immediate — mourir mille fois
  // n'est supportable que si mourir est bref.
  const aventure = new Aventure(racine, heros, {
    pvHeros: 1, clips: animations, projection, tuile: TUILE, reapparitionMs: 450,
  })
  const peuplement = aventure.peuplement
  let pas = 0

  /**
   * Le mot d'accueil. Il dit ce que la barre d'aide dit deja — et ce n'est pas
   * un doublon : personne ne lit une barre d'etat en commencant a jouer.
   */
  const dialogue = new Dialogue({ largeur: 320 - 8 - 10, vitesse: 42, lignes: 3 })
  /**
   * Le mot d'accueil, en DONNEES.
   *
   * Il pourrait etre ecrit dans le script juste en dessous ; il serait alors
   * hors du fichier de projet, donc absent d'un export, et une faute
   * d'orthographe demanderait de recompiler. Le texte d'un jeu est du contenu,
   * exactement comme une carte.
   */
  const ACCUEIL: RepliqueJeu[] = [
    replique('Cette caverne éprouve le contrôleur : le ressaut, les fosses,'
      + ' et le puits qui se remonte de paroi en paroi.', { qui: 'Pixl' }),
    replique('Espace pour sauter, Maj pour le dash. Bas + Espace descend'
      + ' d’une passerelle. On saute sur la tête des gelées.', { qui: 'Pixl' }),
    replique('Tu veux essayer ?', {
      qui: 'Pixl',
      choix: [
        { texte: 'Oui, j’y vais', valeur: 'oui' },
        { texte: 'Redis-moi ça', valeur: 'encore' },
      ],
    }),
  ]
  const ouvrirAccueil = (): void => { dialogue.ouvrir(ACCUEIL) }
  const pause = new Pause(() => { aventure.reinitialiser(); ouvrirAccueil() })

  /** Ce que le plan pose : balises, plateformes, caisses, creatures. */
  const poserEntites = (): void => {
    for (let y = 0; y < hauteur; y++) {
      for (let x = 0; x < largeur; x++) {
        const id = ENTITES_CAVERNE[PLAN_CAVERNE[y][x]]
        if (id) peuplement.poser(id, x * TUILE + TUILE / 2, y * TUILE + TUILE)
      }
    }
  }
  poserEntites()

  return {
    id: 'caverne',
    nom: 'Caverne — vue de côté',
    aide: 'Flèches pour courir, Espace pour sauter, Maj pour le dash, Bas + Espace pour descendre d’une passerelle. On saute sur la tête des gelées. Les pointes tuent ; on repart à la dernière balise.',
    vue: { largeur: 320, hauteur: 180 },
    projection,
    carte,
    racine,
    heros,
    depart,
    couleurs: [...couleursDe(CLE_CAVERNE), ...couleursDe(CLE_HEROS), ...couleursDe(CLE_CREATURES)],
    animations,
    planches: [
      decrirePlanche('caverne', PLANCHE_CAVERNE, CLE_CAVERNE, 8, TUILE),
      decrirePlanche('heros', PLANCHE_HEROS, CLE_HEROS, COLONNES_HEROS, TUILE),
      decrirePlanche('creatures', PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES, TUILE),
    ],
    especes: ESPECES_DEMO,
    sons: SONS_DEMO,
    musiques: MUSIQUES_DEMO,
    textes: TEXTES_DEMO,
    dialogues: [{ nom: 'accueil', repliques: ACCUEIL }],
    peuplement,
    tuilePinceau: TUILE_FOND,
    installer(jeu) {
      // Le son : la banque, puis le pont vers l'audio du navigateur. Le pont
      // ne contient aucune decision — la synthese est ailleurs, et c'est elle
      // qui est eprouvee.
      aventure.sonneur.ajouter(...SONS_DEMO)
      brancherAudio(aventure.sonneur, rendreSon)
      // La musique : meme montage que le son, meme separation. Le musicien
      // decide QUOI joue ; le pont sait seulement fabriquer du bruit. Elle est
      // hors de la simulation par construction — un rembobinage reseau ne peut
      // donc pas la faire redemarrer.
      installerMusique(pause)
      jeu.cartes.set('caverne', { carte, atlas: atlasDepuisLettres(PLANCHE_CAVERNE, CLE_CAVERNE, TUILE, 8) })
      jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, COLONNES_HEROS))
      jeu.suivreNoeud('heros')
      // Une marge morte plus haute que large : en courant on veut voir loin
      // devant, en tombant on veut voir arriver le sol. C'est le reglage de
      // camera qui distingue le plus un jeu de plateforme d'une vue de dessus.
      jeu.margeCamera = { x: 24, y: 34 }
      // Le heros est une entite de comportement « plateformeur » : tout le
      // controleur — coyote, tampon, hauteur variable, saut mural, dash —
      // vient du catalogue, et un projet enregistre le retrouve. L'aventure,
      // elle, s'occupe de ce que le catalogue ne dit pas : la mort, la
      // reprise, les balises.
      jeu.scripts.set(racine.nom, (c) => {
        // Le dialogue et la pause d'abord : quand l'un des deux est ouvert, le
        // monde ne bouge plus. Laisser courir le jeu derriere une boite de
        // texte fait mourir pendant qu'on lit — la faute la plus injuste qu'un
        // jeu puisse commettre.
        if (pause.ouverte) { pause.avancer(c, aventure.sonneur, c.pas); return }
        if (c.entrees.consommer('annuler')) { pause.ouvrir(); return }
        if (dialogue.ouvert) {
          dialogue.avancerTemps(c.dt * 1000)
          if (!dialogue.complet && c.pas % 3 === 0) {
            aventure.sonneur.evenement(c.pas, 'dialogue', 'texte')
          }
          const a = c.entrees.axe()
          if (c.entrees.consommer('haut')) dialogue.deplacer(-1)
          if (c.entrees.consommer('bas')) dialogue.deplacer(1)
          void a
          if (c.entrees.consommer('action') || c.entrees.consommer('saut')) {
            const quoi = dialogue.valider()
            if (quoi !== 'rien') aventure.sonneur.evenement(c.pas, 'dialogue', 'valider')
            // « Redis-moi ça » relit tout : c'est le seul choix qui a un effet
            // ici, et il sert a montrer qu'un choix EN A un.
            if (quoi === 'ferme' && dialogue.derniereValeur === 'encore') ouvrirAccueil()
          }
          return
        }
        aventure.avancer(c, peuplement.regardDe(heros.id))
      })
      aventure.installerEcran(jeu)
      // L'interface se dessine APRES tout le reste, et donc par-dessus. On
      // enchaine sur ce que l'aventure a pose au lieu de le remplacer : sans
      // cela, brancher le dialogue ferait disparaitre les coeurs.
      const dessinAventure = jeu.apresDessin
      jeu.apresDessin = (ctx, ecran) => {
        dessinAventure?.(ctx, ecran)
        dessinerDialogue(ecran, dialogue, {
          fond: '#12101c', bord: '#7fd4a8', ombre: '#12101c',
        })
        if (pause.ouverte) {
          // Un voile plutot qu'un fond opaque : on garde le jeu sous les yeux,
          // ce qui rappelle qu'il est en pause et non quitte.
          ctx.fillStyle = 'rgba(10, 12, 18, 0.72)'
          ctx.fillRect(0, 0, ecran.vue.largeur, ecran.vue.hauteur)
          ecrireCentre(ecran, 'PAUSE', 40, { couleur: '#7fd4a8', ombre: '#12101c' })
          dessinerMenu(ecran, pause.menu, 116, 66, { ombre: '#12101c' })
        }
      }
      ouvrirAccueil()
      void pas
    },
    reinitialiser() {
      heros.x = depart.x
      heros.y = depart.y
      heros.image = imageHeros(DIR_DROITE, TEMPS_REPOS)
      heros.miroir = false
      heros.visible = true
      aventure.reinitialiser()
      aventure.reapparition = { ...depart }
      poserEntites()
      pause.fermer()
      ouvrirAccueil()
      pas = 0
    },
    /**
     * Ce que le banc peut interroger sans navigateur… et avec.
     *
     * Un monde qu'on ne peut observer que par sa barre d'etat s'observe comme
     * un poisson dans un bocal : on voit qu'il tourne, on ne sait pas
     * pourquoi. La sonde n'est jamais lue par le jeu lui-meme.
     */
    sonde: () => ({
      dialogue: dialogue.ouvert,
      complet: dialogue.complet,
      lettres: dialogue.lignesVisibles().join('').length,
      pause: pause.ouverte,
      menu: pause.menu.curseur,
      sons: aventure.sonneur.joue,
      particules: aventure.particules.nombre,
    }),
    etat: () => {
      const d = peuplement.diagnosticDe(heros.id)
      const compte = `${aventure.morts} mort${aventure.morts > 1 ? 's' : ''}`
        + ` · ${aventure.balisesAtteintes} balise${aventure.balisesAtteintes > 1 ? 's' : ''}`
      if (!d) return `arrêté · ${compte}`
      return `${d.etat} · vx ${Math.round(d.vx)} · vy ${Math.round(d.vy)} · ${compte}`
        + `${d.coinCorrige ? ' · coin corrigé' : ''}`
    },
  }
}


/* ------------------------------------------------------------------ */
/* 3. La citadelle : isometrique                                       */
/* ------------------------------------------------------------------ */

const PLAN_CITADELLE = [
  '######################',
  '#....................#',
  '#.@v..............vv.#',
  '#.v..............c...#',
  '#...#########........#',
  '#...#.......#........#',
  '#...#.......#.cc.....#',
  '#...#..cc...#........#',
  '#...#..c....#........#',
  '#...#.......#........#',
  '#...#................#',
  '#...#................#',
  '#...######...........#',
  '#....................#',
  '#..............~~~~~.#',
  '#..............~~~~~.#',
  '#........c.....~~~~~.#',
  '#.v.......c....~~~~~.#',
  '#.vv...........~~~~~.#',
  '#..................S.#',
  '#....................#',
  '######################',
]

export function mondeCitadelle(): Monde {
  const largeur = PLAN_CITADELLE[0].length
  const hauteur = PLAN_CITADELLE.length
  // La carte reste une grille CARREE de seize pixels : c'est le monde ou le
  // gameplay vit. Le losange n'existe qu'au dessin.
  const carte = new Carte(largeur, hauteur, TUILE)
  const sol = carte.ajouterCalque('sol', { presence: new Uint8Array(largeur * hauteur) })
  const blocs = carte.ajouterCalque('blocs', { presence: new Uint8Array(largeur * hauteur) })

  let depart = { x: TUILE, y: TUILE }
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const c = PLAN_CITADELLE[y][x]
      const i = carte.index(x, y)
      sol.cases[i] = c === 'v' ? ISO_HERBE : c === '~' ? ISO_EAU : ISO_SOL
      if (sol.presence) sol.presence[i] = 1
      const bloc = c === '#' ? ISO_MUR : c === 'c' ? ISO_CAISSE : c === 'S' ? ISO_SORTIE : VIDE
      blocs.cases[i] = bloc
      if (bloc !== VIDE) {
        if (blocs.presence) blocs.presence[i] = 1
        // La sortie est un but, pas un obstacle : on doit pouvoir l'atteindre.
        if (c !== 'S') carte.solides[i] = 1
      }
      // L'eau bloque sans rien poser sur le calque des blocs : la collision est
      // sa propre grille, et c'est exactement a cela qu'elle sert.
      if (c === '~') carte.solides[i] = 1
      if (c === '@') depart = { x: x * TUILE + TUILE / 2, y: y * TUILE + TUILE / 2 }
    }
  }

  const racine = creerNoeud('noeud', 'citadelle')
  const noeudCarte = creerNoeud('carte', 'decor') as Noeud & { source: string }
  noeudCarte.source = 'citadelle'
  racine.enfants.push(noeudCarte)

  const heros = creerNoeud('sprite', 'heros') as NoeudSprite
  heros.source = 'heros'
  // L'ancre est aux pieds : le point du dessin qui doit tomber sur le centre
  // du losange. Ancrer ailleurs ferait flotter le personnage au-dessus de sa
  // case ou l'enfoncerait dedans, et l'ecart grandirait avec la taille du
  // dessin.
  heros.ancreX = TUILE / 2
  heros.ancreY = TUILE
  heros.x = depart.x
  heros.y = depart.y

  const corps = creerNoeud('corps', 'corps') as NoeudCorps
  // La boite est centree sur la case, et non posee sous les pieds : en
  // isometrique le personnage est repere par le CENTRE du losange qu'il
  // occupe.
  corps.boiteX = -4
  corps.boiteY = -4
  corps.boiteL = 8
  corps.boiteH = 8
  heros.enfants.push(corps)
  racine.enfants.push(heros)

  const projection = ISO(LARGEUR_ISO, HAUTEUR_DESSIN_ISO - HAUTEUR_ISO)
  const animations = clipsDemo()
  const combat = new Combat()
  const peuplement = new Peuplement(racine, combat, ESPECES_DEMO, animations, projection, TUILE)
  ;(heros as unknown as { espece: string }).espece = 'heros'
  let pas = 0

  return {
    id: 'citadelle',
    nom: 'Citadelle — isométrique',
    aide: 'Flèches ou ZQSD : la direction du clavier est celle de l’écran, pas celle de la grille. Les murs passent devant ou derrière selon la case.',
    vue: { largeur: 320, hauteur: 180 },
    projection,
    carte,
    racine,
    heros,
    depart,
    couleurs: [...couleursDe(CLE_ISO), ...couleursDe(CLE_HEROS), ...couleursDe(CLE_CREATURES)],
    animations,
    planches: [
      decrirePlanche('citadelle', PLANCHE_ISO, CLE_ISO, 6, LARGEUR_ISO, HAUTEUR_DESSIN_ISO),
      decrirePlanche('heros', PLANCHE_HEROS, CLE_HEROS, COLONNES_HEROS, TUILE),
      decrirePlanche('creatures', PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES, TUILE),
    ],
    especes: ESPECES_DEMO,
    sons: SONS_DEMO,
    musiques: MUSIQUES_DEMO,
    textes: TEXTES_DEMO,
    peuplement,
    tuilePinceau: ISO_MUR,
    installer(jeu) {
      jeu.cartes.set('citadelle', {
        carte,
        atlas: atlasDepuisLettres(PLANCHE_ISO, CLE_ISO, LARGEUR_ISO, 6, HAUTEUR_DESSIN_ISO),
      })
      jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, COLONNES_HEROS))
      jeu.scripts.set(racine.nom, scriptPeuplement(
        peuplement, combat, () => heros, (e) => { if (e === 'pas') pas++ },
      ))
      jeu.suivreNoeud('heros')
      jeu.margeCamera = { x: 40, y: 24 }
    },
    reinitialiser() {
      heros.x = depart.x
      heros.y = depart.y
      heros.image = imageHeros(DIR_BAS, TEMPS_REPOS)
      heros.miroir = false
      combat.reinitialiser()
      peuplement.oublier()
      pas = 0
    },
    etat: () => `isométrique · tri par cx + cy · ${peuplement.nombre} entité(s) · ${pas} pas`,
  }
}

/**
 * Les plans et les reglages, exportes pour le banc.
 *
 * Un niveau infranchissable ne se decouvre qu'en jouant, et seulement si l'on
 * va jusque-la. Le banc, lui, mesure la portee du saut depuis les reglages et
 * la compare a chaque fosse du plan — a chaque execution, sans navigateur.
 */
export { PLAN_CAVERNE, PLAN_CITADELLE, REGLAGES_DEFAUT }

/* ------------------------------------------------------------------ */
/* 4. L'etage : des salles engendrees, camera verrouillee              */
/* ------------------------------------------------------------------ */

const NOM_ROLE: Record<string, string> = {
  depart: 'départ', commune: 'salle', tresor: 'trésor', boutique: 'boutique', boss: 'boss',
}

/**
 * Un etage engendre, a la maniere d'Isaac.
 *
 * Le monde est le meme que le donjon — vue de dessus, meme heros, meme
 * collision. Ce qui change tient en deux choses : le niveau est ENGENDRE
 * depuis une graine au lieu d'etre ecrit a la main, et la camera est
 * verrouillee sur la salle au lieu de suivre le personnage. La deuxieme est ce
 * qui fait le genre : on ne voit jamais la salle suivante avant d'y entrer.
 */
export function mondeEtage(graine = 1): Monde {
  const plan = engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 })
  const etage = assemblerEtage(plan, {
    largeurSalle: 20, hauteurSalle: 11, tuile: TUILE,
    tuileSol: TUILE_SOL, tuileMarque: TUILE_SORTIE,
    modeles: MODELES_DEMO, symboles: SYMBOLES_DEMO,
  })
  // Un modele fautif ne doit pas passer inapercu : il ne fait pas tomber le
  // jeu — la salle retombe sur les amas tires au sort — mais le taire
  // reviendrait a livrer un dessin qui n'a jamais servi sans que personne ne
  // le sache.
  for (const plainte of etage.plaintes) console.warn(`modèle de salle refusé : ${plainte}`)
  const projection = ORTHO_DESSUS(TUILE)
  const animations = clipsDemo()

  const racine = creerNoeud('noeud', 'etage')
  const noeudCarte = creerNoeud('carte', 'decor') as Noeud & { source: string }
  noeudCarte.source = 'etage'
  racine.enfants.push(noeudCarte)

  const heros = creerNoeud('sprite', 'heros') as NoeudSprite
  heros.source = 'heros'
  heros.ancreX = TUILE / 2
  heros.ancreY = TUILE
  heros.x = etage.depart.x
  heros.y = etage.depart.y

  const corps = creerNoeud('corps', 'corps') as NoeudCorps
  corps.boiteX = -4
  corps.boiteY = -6
  corps.boiteL = 8
  corps.boiteH = 6
  heros.enfants.push(corps)
  racine.enfants.push(heros)

  let visitees = new Set<SallePlan>([plan.depart])
  const aventure = new Aventure(racine, heros, {
    pvHeros: 5, clips: animations, projection, tuile: TUILE,
  })
  ;(heros as unknown as { espece: string }).espece = 'heros'

  /**
   * Peuple l'etage.
   *
   * Chaque salle sauf le depart recoit une a trois creatures, posees sur des
   * cases libres et tirees de la meme graine que l'etage : le meme etage porte
   * donc toujours les memes creatures aux memes endroits. Un niveau
   * reproductible dont le contenu ne l'est pas ne se corrige pas mieux qu'un
   * niveau qui ne l'est pas du tout.
   */
  const peupler = (): void => {
    // Ce que les salles DESSINEES demandent, d'abord. L'assemblage ne les pose
    // pas lui-meme : il ne connait ni le peuplement ni le catalogue.
    for (const e of etage.entites) aventure.peuplement.poser(e.espece, e.x, e.y)
    const h = new Hasard((graine ^ 0x9e37) >>> 0)
    for (const s of plan.salles) {
      // Une salle dessinee dit deja ce qu'elle contient. Y ajouter des
      // creatures tirees au sort reviendrait a defaire la composition qu'on
      // vient d'ecrire.
      if (s.role === 'depart' || etage.modeleDe.has(s)) continue
      const o = etage.coinDe(s)
      const combien = s.role === 'boss' ? 4 : 1 + h.entier(2)
      for (let n = 0; n < combien; n++) {
        let pose = false
        for (let essai = 0; essai < 20 && !pose; essai++) {
          const cx = o.x + 2 + h.entier(etage.largeurSalle - 4)
          const cy = o.y + 2 + h.entier(etage.hauteurSalle - 4)
          if (etage.carte.solide(cx, cy)) continue
          // Poser une creature, c'est ajouter un NOEUD a la scene. Elle part
          // donc dans le fichier de projet avec tout le reste, et l'editeur
          // peut en poser d'autres par le meme chemin.
          const tirage = h.entier(12)
          const quoi = tirage === 0 ? 'coeur'
            : tirage < 3 ? 'tourelle'
              : tirage < 6 ? 'chauve-souris' : 'gelee'
          aventure.peuplement.poser(quoi, cx * TUILE + TUILE / 2, cy * TUILE + TUILE)
          pose = true
        }
      }
    }
  }
  peupler()

  /** La derniere direction regardee : c'est elle qui place le coup. */
  let regard = { x: 0, y: 1 }

  return {
    id: 'etage',
    nom: `Étage engendré — graine ${graine}`,
    aide: 'Flèches ou ZQSD pour marcher, Espace ou E pour frapper. La caméra est verrouillée sur la salle : on ne voit la suivante qu’en y entrant.',
    // La vue fait EXACTEMENT une salle : 20 x 11 cases de seize pixels. Une vue
    // plus grande montrerait le mur de la salle d'a cote, une plus petite
    // couperait la salle en deux.
    vue: { largeur: 20 * TUILE, hauteur: 11 * TUILE },
    projection,
    carte: etage.carte,
    racine,
    heros,
    depart: etage.depart,
    couleurs: [...couleursDe(CLE_DONJON), ...couleursDe(CLE_HEROS), ...couleursDe(CLE_CREATURES)],
    animations,
    planches: [
      decrirePlanche('donjon', PLANCHE_DONJON, CLE_DONJON, 8, TUILE),
      decrirePlanche('heros', PLANCHE_HEROS, CLE_HEROS, COLONNES_HEROS, TUILE),
      decrirePlanche('creatures', PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES, TUILE),
    ],
    especes: ESPECES_DEMO,
    sons: SONS_DEMO,
    musiques: MUSIQUES_DEMO,
    textes: TEXTES_DEMO,
    peuplement: aventure.peuplement,
    tuilePinceau: 0,
    installer(jeu) {
      jeu.cartes.set('etage', {
        carte: etage.carte,
        atlas: atlasDepuisLettres(PLANCHE_DONJON, CLE_DONJON, TUILE, 8),
      })
      jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, COLONNES_HEROS))
      jeu.sprites.set('creatures',
        atlasDepuisLettres(PLANCHE_CREATURES, CLE_CREATURES, TUILE, COLONNES_CREATURES))
      // Le heros marche parce qu'il est une entite de comportement « joueur » ;
      // l'aventure, elle, ne s'occupe que de ce qui n'est pas dans le
      // catalogue : l'epee, les coeurs, la mort.
      jeu.scripts.set('heros', (c) => {
        regard = aventure.peuplement.regardDe(heros.id)
        aventure.avancer(c, regard)
      })
      jeu.suivreNoeud('heros')
      jeu.cameraParSalle = { largeur: etage.largeurSalle, hauteur: etage.hauteurSalle }
      jeu.scripts.set('etage', () => {
        const s = etage.salleEn(heros.x, heros.y)
        if (!s) return
        if (!visitees.has(s)) {
          visitees.add(s)
          // On repart la ou l'on est ENTRE dans la salle, et non au depart de
          // l'etage : c'est la regle d'Isaac, et c'est celle qui rend la mort
          // instructive au lieu d'etre punitive.
          aventure.reapparition = { x: heros.x, y: heros.y }
        }
      })
      aventure.sonneur.ajouter(...SONS_DEMO)
      brancherAudio(aventure.sonneur, rendreSon)
      // Pas de musique ici : cet etage n'a pas de menu de pause, donc pas
      // d'interrupteur pour la couper. Une musique qu'on ne peut pas eteindre
      // est pire que pas de musique du tout.
      aventure.installerEcran(jeu)
      const dessinEtage = jeu.apresDessin
      jeu.apresDessin = (ctx, ecran) => {
        dessinEtage?.(ctx, ecran)
        // Le nom de la salle, en haut a droite : c'est ce qui manque le plus
        // dans un etage engendre, ou toutes les salles se ressemblent.
        const s = etage.salleEn(heros.x, heros.y)
        if (s) {
          ecrireCentre(ecran, (NOM_ROLE[s.role] ?? s.role).toUpperCase(), 4, {
            couleur: s.role === 'commune' ? '#5a5f70' : '#f0c860', ombre: '#12101c',
          })
        }
      }
    },
    reinitialiser() {
      heros.x = etage.depart.x
      heros.y = etage.depart.y
      heros.image = imageHeros(DIR_BAS, TEMPS_REPOS)
      heros.miroir = false
      heros.visible = true
      visitees = new Set([plan.depart])
      regard = { x: 0, y: 1 }
      aventure.reinitialiser()
      peupler()
    },
    sonde: () => ({
      pv: aventure.pv,
      mort: aventure.mort,
      frappes: aventure.combat.frappes.length,
      frappesHeros: aventure.combat.frappes.filter((f) => f.camp === 'heros').length,
      creatures: aventure.peuplement.nombre,
      abattus: aventure.abattus,
      ramasses: aventure.ramasses,
      regard,
      heros: { x: heros.x, y: heros.y },
      creaturesProches: aventure.peuplement.positions()
        .filter((q) => Math.hypot(q.x - heros.x, q.y - heros.y) < 60).length,
    }),
    etat: () => {
      const s = etage.salleEn(heros.x, heros.y)
      return `${aventure.mort ? '☠ mort' : `${aventure.pv}/${aventure.max} ♥`}`
        + ` · ${NOM_ROLE[s?.role ?? 'commune']} · ${visitees.size}/${plan.salles.length} salles`
        + ` · ${aventure.peuplement.nombre} entités, ${aventure.abattus} abattues`
        + ` · boss à ${plan.boss.distance} salles`
    },
  }
}

export const MONDES: { id: string; nom: string; construire: () => Monde }[] = [
  { id: 'donjon', nom: 'Donjon (dessus)', construire: mondeDonjon },
  { id: 'caverne', nom: 'Caverne (côté)', construire: mondeCaverne },
  { id: 'citadelle', nom: 'Citadelle (iso)', construire: mondeCitadelle },
  // La graine est fixe pour que la demonstration soit la meme pour tout le
  // monde : un bogue vu chez quelqu'un doit pouvoir etre revu ici.
  { id: 'etage', nom: 'Étage engendré (salles)', construire: () => mondeEtage(7) },
]
