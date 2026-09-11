import {
  VERSION_FORMAT, decrirePlanche, serialiserAnimation, serialiserCarte, serialiserNoeud,
  type ProjetSerialise, type CarteSerialisee, type NoeudSerialise, type PlancheSerialisee,
  type DeclencheurSerialise,
} from '../export/format.ts'
import { matiereEnCaractere, caractereEnMatiere, VIDE } from '../tuiles/tilemap.ts'
import { creerNoeud } from '../scene/noeud.ts'
import { ORTHO_DESSUS, ORTHO_COTE, ISO, type Projection } from '../noyau/projection.ts'
import { espece, type Espece } from '../runtime/entites.ts'
import { musique as musiqueFabrique, voie as voieFabrique, type Voie } from '../runtime/musique.ts'
import { TUILE, TUILE_SOL, CLE_DONJON, PLANCHE_DONJON, CLE_HEROS, PLANCHE_HEROS, COLONNES_HEROS } from '../demo/art.ts'
import {
  MASQUES_BLOB47, HAUT, BAS, GAUCHE, DROITE,
  HAUT_DROITE, BAS_DROITE, BAS_GAUCHE, HAUT_GAUCHE,
} from '../tuiles/terrain.ts'
import { son as sonFabrique } from '../runtime/son.ts'
import { clipRegulier } from '../runtime/animation.ts'
import { PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES } from '../demo/art-creatures.ts'
import { ESPECES_DEMO, clipsDemo } from '../demo/especes-demo.ts'
import { SONS_DEMO } from '../demo/sons-demo.ts'
import { replique } from '../runtime/dialogue.ts'
import { Entrees } from '../runtime/entree.ts'

/**
 * Ce qu'on ne peut pas faire au pinceau : creer, redimensionner, ajouter.
 *
 * ## Pourquoi tout passe par le FICHIER de projet
 *
 * Redimensionner une carte, ajouter un calque, creer une espece, partir de
 * zero : ces quatre gestes touchent a la STRUCTURE et non au contenu. On
 * pourrait les faire en place — agrandir les tableaux, pousser un calque,
 * ajouter une entree au catalogue — et c'est ce qu'on ecrit d'abord. Chacun
 * oblige alors a se souvenir de tout ce qui depend de la chose changee : la
 * grille de collision, la presence de chaque calque, l'atlas, la camera, le
 * peuplement deja adopte, l'historique qui pointe sur des index devenus faux.
 * Le premier oubli ne se voit pas, et le deuxieme se voit trois gestes plus
 * tard.
 *
 * Ici, chaque geste transforme le PROJET SERIALISE, et l'editeur relit le
 * resultat par le chemin qui sert deja a rouvrir un fichier. Ce chemin est
 * eprouve a chaque banc, il reconstruit tout, et il ne peut rien oublier
 * puisqu'il ne garde rien. Le prix est une reconstruction de quelques
 * millisecondes, et le fait qu'un geste de structure ne se defait pas au
 * Ctrl+Z — ce qu'on dit au lieu de le cacher.
 *
 * Le gain second n'est pas mince : ces gestes EPROUVENT le format. Un champ
 * que la relecture perdrait se verrait tout de suite, dans l'editeur, au lieu
 * d'attendre le jour ou quelqu'un rouvre un vieux fichier.
 */

/** Les projections qu'un projet neuf peut prendre, et leur nom lisible. */
export const PROJECTIONS: { id: string; nom: string; faire: (t: number) => Projection }[] = [
  { id: 'dessus', nom: 'Vue de dessus', faire: (t) => ORTHO_DESSUS(t) },
  { id: 'cote', nom: 'Vue de côté (gravité)', faire: (t) => ORTHO_COTE(t) },
  { id: 'iso', nom: 'Isométrique', faire: (t) => ISO(t * 2, t) },
]

export interface OptionsProjetNeuf {
  nom?: string
  largeur?: number
  hauteur?: number
  tuile?: number
  /** Un des identifiants de `PROJECTIONS`. */
  projection?: string
  vue?: { largeur: number; hauteur: number }
  /**
   * « demo » : les dessins, especes, sons et dialogues de la demonstration.
   * « vierge » : la feuille blanche — des tuiles neutres, un heros neutre,
   * et RIEN d'autre. Voir `projetNeuf`.
   */
  depart?: 'demo' | 'vierge'
}

/* ------------------------------------------------------------------ */
/* La feuille blanche                                                  */
/* ------------------------------------------------------------------ */

/*
 * Le depart « vierge » repond a une critique precise : un projet neuf qui
 * arrive avec le donjon, le heros roux, les gelees et les sons de la
 * demonstration ne donne pas l'impression de COMMENCER un jeu — il donne
 * l'impression d'en modifier un. La feuille blanche ne transporte aucun asset
 * de demonstration : des tuiles neutres generees, un heros en deux couleurs,
 * pas un son, pas un dialogue, pas un clip. Tout ce qui s'y voit est la pour
 * etre remplace, et rien n'y raconte une histoire qui n'est pas la votre.
 *
 * Elle reste JOUABLE des la premiere seconde — sol pre-peint, heros pose,
 * murs qui s'autotilent — parce qu'un depart casse ne donne pas envie de
 * dessiner : les memes raisons que pour le depart de demonstration.
 */

/**
 * La cle de couleurs neutre. Des gris bleutes, du sombre au clair : assez de
 * tons pour que la nuit (l'ambiante) ait de la matiere a eteindre, aucun qui
 * impose un style. « o » est l'encre des bords, « f » le corps du heros.
 */
export const CLE_NEUTRE: Record<string, string> = {
  o: '#161821',
  c: '#262a34',
  C: '#303546',
  a: '#454c5e',
  f: '#e8e4d8',
}

/**
 * Une tuile de mur neutre : un aplat, et un lisere d'encre du seul cote ou il
 * n'y a pas de voisin — les memes regles d'angles que la planche de
 * demonstration, parce que ce sont celles de l'autotiling, pas d'un style.
 */
function murNeutre(masque: number): string[] {
  const n = (bit: number): boolean => (masque & bit) !== 0
  const g: string[][] = Array.from({ length: TUILE },
    () => Array.from({ length: TUILE }, () => 'a'))
  const bord = (x: number, y: number): void => { g[y][x] = 'o' }
  if (!n(HAUT)) for (let x = 0; x < TUILE; x++) bord(x, 0)
  if (!n(BAS)) for (let x = 0; x < TUILE; x++) bord(x, TUILE - 1)
  if (!n(GAUCHE)) for (let y = 0; y < TUILE; y++) bord(0, y)
  if (!n(DROITE)) for (let y = 0; y < TUILE; y++) bord(TUILE - 1, y)
  // Les angles rentrants : deux cotes pleins, la diagonale vide.
  if (n(HAUT) && n(DROITE) && !n(HAUT_DROITE)) bord(TUILE - 1, 0)
  if (n(BAS) && n(DROITE) && !n(BAS_DROITE)) bord(TUILE - 1, TUILE - 1)
  if (n(BAS) && n(GAUCHE) && !n(BAS_GAUCHE)) bord(0, TUILE - 1)
  if (n(HAUT) && n(GAUCHE) && !n(HAUT_GAUCHE)) bord(0, 0)
  return g.map((l) => l.join(''))
}

/**
 * Le sol neutre : presque uni, avec quelques eclats deterministes. Un sol
 * parfaitement uni ne donne aucun retour de mouvement en vue de dessus — on
 * ne voit pas qu'on avance. Cinq pixels suffisent, et le tirage est calcule
 * pour que deux projets vierges soient identiques au banc.
 */
const SOL_NEUTRE: string[] = Array.from({ length: TUILE }, (_q, y) =>
  Array.from({ length: TUILE }, (_r, x) =>
    ((x * 7 + y * 13) % 53 === 0 ? 'C' : 'c')).join(''))

/**
 * La planche neutre : les 47 murs dans l'ordre de `MASQUES_BLOB47`, puis le
 * sol — le meme index `TUILE_SOL` que la planche de demonstration, pour que
 * le pre-peint et l'autotiling n'aient pas deux cas.
 */
export const PLANCHE_NEUTRE: string[][] = [
  ...MASQUES_BLOB47.map(murNeutre),
  SOL_NEUTRE,
]

/**
 * Le heros neutre : une silhouette en DEUX couleurs, les pieds au bas de la
 * case — la convention d'ancrage du moteur. Deux couleurs et pas treize :
 * c'est un heros qu'on remplace en cinq minutes dans l'onglet Dessin, pas un
 * personnage auquel s'attacher.
 */
export const HEROS_NEUTRE: string[] = [
  '................',
  '................',
  '.....oooooo.....',
  '....offffffo....',
  '....offffffo....',
  '....ofoffofo....',
  '....offffffo....',
  '.....offffo.....',
  '....offffffo....',
  '...offffffffo...',
  '...offffffffo...',
  '....offffffo....',
  '.....offffo.....',
  '.....of..fo.....',
  '.....of..fo.....',
  '.....oo..oo.....',
]

/**
 * Le catalogue vierge : les deux heros, et RIEN d'autre. Pas de clip — le
 * dessin unique de la planche sert tel quel, et un clip introuvable n'efface
 * jamais l'image. Trois points de vie : assez pour comprendre les degats,
 * a regler dans l'onglet Especes.
 */
const especesVierges = (): Espece[] => [
  espece('heros', {
    nom: 'Héros (dessus)',
    planche: 'heros',
    clip: '',
    camp: 'heros',
    pv: 3,
    vitesse: 70,
    degats: 0,
    comportement: 'joueur',
    boite: { x: -4, y: -6, l: 8, h: 6 },
    invulnerabiliteMs: 600,
  }),
  espece('heros-cote', {
    nom: 'Héros (côté)',
    planche: 'heros',
    clip: '',
    camp: 'heros',
    pv: 3,
    vitesse: 0,
    degats: 0,
    comportement: 'plateformeur',
    boite: { x: -4, y: -14, l: 8, h: 14 },
    invulnerabiliteMs: 600,
  }),
]

/** Une rangee de cases vides, dans la forme que le format attend. */
const rangeeVide = (largeur: number): string =>
  Array.from({ length: largeur }, () => String(VIDE)).join(',')

const rangeeZeros = (largeur: number): string => '0'.repeat(largeur)

/**
 * Un projet vide, mais JOUABLE.
 *
 * Vide et jouable ne se contredisent pas : il y a une carte, deux calques, un
 * heros pose au milieu, les planches et le catalogue d'especes. Ce qui manque,
 * c'est le decor — et c'est justement ce qu'on vient dessiner.
 *
 * Un projet neuf sans heros s'ouvrirait sur un rectangle noir ou « Jouer » ne
 * ferait rien, et la premiere impression serait « c'est casse ». Un heros au
 * milieu d'une salle vide dit en une seconde ce que l'editeur est.
 */
export function projetNeuf(o: OptionsProjetNeuf = {}): ProjetSerialise {
  const nom = o.nom?.trim() || 'projet'
  const largeur = Math.max(4, Math.round(o.largeur ?? 40))
  const hauteur = Math.max(4, Math.round(o.hauteur ?? 24))
  const tuile = Math.max(4, Math.round(o.tuile ?? TUILE))
  const choix = PROJECTIONS.find((p) => p.id === o.projection) ?? PROJECTIONS[0]
  const projection = choix.faire(tuile)
  const vue = o.vue ?? { largeur: 320, hauteur: 180 }
  const vierge = o.depart === 'vierge'

  const carte: CarteSerialisee = {
    nom: 'carte',
    largeur,
    hauteur,
    tuile,
    // Null : la lumiere du projet. Une carte ne contredit que si on lui demande.
    ambiante: null,
    calques: [
      {
        nom: 'sol', visible: true, devant: false, terrain: null,
        /*
         * Le sol est PRE-PEINT sur toute la carte. Un projet neuf s'ouvrait
         * sur un rectangle noir — pas de grille, pas de bord, un heros
         * minuscule sur du vide — et la premiere impression etait « je ne
         * vois rien, je ne sais pas ou peindre ». Un sol partout dit d'un
         * coup ou est la carte, ou elle s'arrete, et ce que « peindre du
         * mur » va recouvrir. La gomme le retire si on veut du vide.
         */
        cases: Array.from({ length: hauteur },
          (_q, y) => Array.from({ length: largeur },
            // En vue de cote, seul le BAS est du sol : un plafond carrele
            // n'aurait pas de sens, et l'oeil doit lire « ici on marche ».
            () => String(choix.id === 'cote' && y < hauteur - 2 ? VIDE : TUILE_SOL)).join(',')),
        presence: Array.from({ length: hauteur }, () => rangeeZeros(largeur)),
      },
      {
        nom: 'mur', visible: true, devant: false,
        terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: true },
        cases: Array.from({ length: hauteur }, () => rangeeVide(largeur)),
        presence: Array.from({ length: hauteur }, () => rangeeZeros(largeur)),
      },
    ],
    /*
     * En vue de cote, le sol du bas est SOLIDE des la naissance : un projet
     * plateforme qui s'ouvre sur un heros en chute libre dans le vide ne dit
     * pas « editeur », il dit « casse ». En vue de dessus, rien n'est solide
     * — on marche partout, et l'on peint ses murs.
     */
    solides: Array.from({ length: hauteur }, (_q, y) =>
      (choix.id === 'cote' && y >= hauteur - 2
        ? matiereEnCaractere(1).repeat(largeur)
        : rangeeZeros(largeur))),
  }

  // Le heros au milieu, les pieds au bas de sa case. C'est la convention
  // d'ancrage de tout le moteur ; s'en ecarter ici le ferait flotter.
  const cxMilieu = Math.floor(largeur / 2)
  // En vue de cote, les pieds sur le sol pre-peint ; sinon au milieu.
  const cyMilieu = choix.id === 'cote' ? hauteur - 3 : Math.floor(hauteur / 2)
  const espèceHeros = choix.id === 'cote' ? 'heros-cote' : 'heros'
  const heros: NoeudSerialise = {
    id: 'heros', nom: 'heros', type: 'sprite',
    x: cxMilieu * tuile + tuile / 2, y: cyMilieu * tuile + tuile,
    visible: true, script: null, espece: espèceHeros, image: 0,
    proprietes: { source: 'heros', ancreX: tuile / 2, ancreY: tuile, miroir: false },
    enfants: [{
      id: 'heros-corps', nom: 'corps', type: 'corps', x: 0, y: 0, visible: true,
      script: null, espece: null, image: 0,
      proprietes: choix.id === 'cote'
        ? { boiteX: -4, boiteY: -14, boiteL: 8, boiteH: 14 }
        : { boiteX: -4, boiteY: -6, boiteL: 8, boiteH: 6 },
      enfants: [],
    }],
  }

  const planches = vierge
    ? [
      decrirePlanche('carte', PLANCHE_NEUTRE, CLE_NEUTRE, 8, tuile),
      decrirePlanche('heros', [HEROS_NEUTRE], CLE_NEUTRE, 1, TUILE),
    ]
    : [
      decrirePlanche('carte', PLANCHE_DONJON, CLE_DONJON, 8, tuile),
      decrirePlanche('heros', PLANCHE_HEROS, CLE_HEROS, COLONNES_HEROS, TUILE),
      decrirePlanche('creatures', PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES, TUILE),
    ]
  // La palette vierge ajoute deux clairs que les planches n'emploient pas :
  // une palette reduite a ce qui est deja peint n'invite pas a peindre.
  const couleurs = vierge
    ? [...new Set([...Object.values(CLE_NEUTRE), '#7d8699', '#aeb6c6'])]
    : [
      ...new Set([
        ...Object.values(CLE_DONJON), ...Object.values(CLE_HEROS), ...Object.values(CLE_CREATURES),
      ]),
    ]

  return {
    version: VERSION_FORMAT,
    nom,
    vue,
    palette: { nom, couleurs },
    cartes: [carte],
    scenes: [{
      nom: 'principale',
      racine: {
        id: 'scene', nom: 'scene', type: 'noeud', x: 0, y: 0, visible: true,
        script: null, espece: null, image: 0, proprietes: {},
        enfants: [
          {
            id: 'decor', nom: 'decor', type: 'carte', x: 0, y: 0, visible: true,
            script: null, espece: null, image: 0,
            proprietes: { source: 'carte' }, enfants: [],
          },
          heros,
        ],
      },
    }],
    animations: vierge ? [] : clipsDemo().map(serialiserAnimation),
    planches,
    projection,
    // Le catalogue de demonstration, et non un catalogue vide : une palette
    // d'entites sans entite ne s'explique pas, et l'on ne saurait pas par ou
    // commencer. On les remplace ensuite, une par une. La feuille blanche,
    // elle, ne garde que les deux heros — le reste est a soi.
    especes: vierge ? especesVierges() : ESPECES_DEMO.map((e) => ({ ...e, boite: { ...e.boite } })),
    // Les sons partent avec le projet, comme les planches. Un projet neuf
    // muet ferait croire que le moteur n'a pas de son. En vierge : aucun,
    // et le bouton « + Son » du panneau en fabrique.
    sons: vierge ? [] : SONS_DEMO.map((q) => ({ ...q })),
    // Le plan de touches part avec le projet : un jeu qu'on ne peut pas
    // remapper est injouable pour une partie des gens, en silence.
    touches: new Entrees().planCourant(),
    musiques: [],
    // Pas de salles : un projet neuf est un monde continu, ou la camera suit
    // le heros partout. Le decoupage en tableaux est une decision de niveau,
    // et l'imposer d'entree ferait croire qu'on ne peut pas s'en passer.
    salles: [],
    // Pas de declencheurs non plus : ils s'ecrivent quand le niveau existe.
    declencheurs: [],
    // Ni de deroule : un projet neuf est un seul niveau sans ecran-titre.
    // L'ordre vide veut dire « l'ordre des cartes », et c'est le bon defaut.
    deroule: { titre: '', ordre: [] },
    // Plein jour : la nuit est une decision de projet, pas un defaut.
    lumiere: { ambiante: 1 },
    // Les regles d'usine : epee et coeurs. On les COUPE dans l'onglet Jeu.
    // La feuille blanche part SANS epee : c'est la regle la plus typee — un
    // jeu de plateforme ou d'enigmes n'en veut pas, et l'allumer est un clic.
    regles: { epee: !vierge, coeurs: true, reapparitionMs: 700, degatsPointes: 1 },
    // Une table par langue, vide au depart : ce qui compte est que le CHEMIN
    // existe des le premier jour. Ajouter la traduction apres coup oblige a
    // reprendre chaque texte ecrit en dur entre-temps.
    textes: { fr: {} },
    dialogues: vierge ? [] : [{
      nom: 'accueil',
      repliques: [replique(
        'Peignez du mur, posez des créatures, appuyez sur Jouer.',
        { qui: 'Pixl' },
      )],
    }],
  }
}

/**
 * Redimensionne la premiere carte d'un projet, en gardant ce qui rentre.
 *
 * L'ancrage est le coin HAUT-GAUCHE : c'est le seul qui ne deplace rien de ce
 * qu'on a deja dessine. Un ancrage centre paraitrait plus poli et decalerait
 * toutes les entites d'un demi-ecart, sans que rien ne le dise.
 */
/**
 * L'index de la carte visee par un geste de structure.
 *
 * Les gestes du panneau — redimensionner, ajouter un calque — visaient tous
 * la PREMIERE carte, ce qui allait tant qu'il n'y en avait qu'une. Avec
 * plusieurs, chaque geste dit sur laquelle il porte ; sans nom, la premiere,
 * pour que tout ce qui existait continue de faire ce qu'il faisait.
 */
const indexCarte = (p: ProjetSerialise, nomCarte?: string): number => {
  if (!nomCarte) return 0
  const i = p.cartes.findIndex((c) => c.nom === nomCarte)
  return i < 0 ? 0 : i
}

export function redimensionnerProjet(
  p: ProjetSerialise, largeur: number, hauteur: number, nomCarte?: string,
): ProjetSerialise {
  const l = Math.max(4, Math.round(largeur))
  const h = Math.max(4, Math.round(hauteur))
  const vise = indexCarte(p, nomCarte)
  const cartes = p.cartes.map((c, index) => {
    if (index !== vise) return c
    const ajuster = (lignes: string[], vide: string, sep: string): string[] =>
      Array.from({ length: h }, (_, y) => {
        const source = lignes[y]
        if (source === undefined) return vide
        const cases = sep ? source.split(sep) : [...source]
        const garde = Array.from({ length: l }, (_, x) => cases[x] ?? (sep ? String(VIDE) : '0'))
        return garde.join(sep)
      })
    return {
      ...c,
      largeur: l,
      hauteur: h,
      calques: c.calques.map((q) => ({
        ...q,
        cases: ajuster(q.cases, rangeeVide(l), ','),
        presence: q.presence ? ajuster(q.presence, rangeeZeros(l), '') : null,
      })),
      solides: ajuster(c.solides, rangeeZeros(l), ''),
    }
  })
  return { ...p, cartes }
}

/**
 * Ajoute un calque a la premiere carte.
 *
 * Il est pousse a la FIN, donc dessine par-dessus les autres. Un calque neuf
 * qu'on ne voit pas parce qu'il est dessous ferait croire que le bouton n'a
 * rien fait — et l'on cliquerait trois fois.
 */
export function ajouterCalqueProjet(
  p: ProjetSerialise, nom: string, avecTerrain: boolean, nomCarte?: string,
): ProjetSerialise {
  const vise = indexCarte(p, nomCarte)
  const c = p.cartes[vise]
  if (!c) return p
  let propre = nom.trim() || 'calque'
  let n = 2
  while (c.calques.some((q) => q.nom === propre)) propre = `${nom.trim() || 'calque'} ${n++}`
  const calque = {
    nom: propre,
    visible: true,
    devant: false,
    terrain: avecTerrain ? { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: false } : null,
    cases: Array.from({ length: c.hauteur }, () => rangeeVide(c.largeur)),
    presence: Array.from({ length: c.hauteur }, () => rangeeZeros(c.largeur)),
  }
  return {
    ...p,
    cartes: p.cartes.map((q, i) => (i === vise ? { ...q, calques: [...q.calques, calque] } : q)),
  }
}

/**
 * Retire un calque. Le dernier ne se retire pas.
 *
 * Une carte sans calque ne se dessine pas et ne se repeint pas : l'editeur
 * s'ouvrirait sur un rectangle noir sans rien dire. On refuse le geste plutot
 * que d'avoir a expliquer l'ecran noir.
 */
export function retirerCalqueProjet(
  p: ProjetSerialise, nom: string, nomCarte?: string,
): ProjetSerialise {
  const vise = indexCarte(p, nomCarte)
  const c = p.cartes[vise]
  if (!c || c.calques.length <= 1) return p
  return {
    ...p,
    cartes: p.cartes.map((q, i) => (
      i === vise ? { ...q, calques: q.calques.filter((l) => l.nom !== nom) } : q
    )),
  }
}

/** Change le nom, la visibilite ou le rang d'un calque. */
/** La parallaxe tient entre zero et quatre. Voir `modifierCalqueProjet`. */
const borner = (v: number): number =>
  (Number.isFinite(v) ? Math.max(0, Math.min(4, Math.round(v * 100) / 100)) : 1)

export function modifierCalqueProjet(
  p: ProjetSerialise, nom: string,
  changements: {
    nom?: string; visible?: boolean; devant?: boolean; decaler?: number
    parallaxe?: { x: number; y: number }; repete?: boolean
  },
  nomCarte?: string,
): ProjetSerialise {
  const vise = indexCarte(p, nomCarte)
  const c = p.cartes[vise]
  if (!c) return p
  const calques = c.calques.map((q) => (q.nom === nom
    ? {
      ...q,
      nom: changements.nom?.trim() || q.nom,
      visible: changements.visible ?? q.visible,
      devant: changements.devant ?? q.devant,
      // On BORNE la parallaxe au lieu de la refuser : une valeur negative
      // ferait defiler le fond a contresens, ce qui donne le mal de mer et
      // ne sert a rien ; au-dela de quatre, le premier plan file si vite
      // qu'on ne voit plus ce qu'il montre.
      parallaxe: changements.parallaxe
        ? { x: borner(changements.parallaxe.x), y: borner(changements.parallaxe.y) }
        : (q.parallaxe ?? { x: 1, y: 1 }),
      repete: changements.repete ?? q.repete ?? false,
    }
    : q))
  if (changements.decaler) {
    const i = calques.findIndex((q) => q.nom === nom)
    const j = Math.max(0, Math.min(calques.length - 1, i + changements.decaler))
    if (i >= 0 && i !== j) {
      const [pris] = calques.splice(i, 1)
      calques.splice(j, 0, pris)
    }
  }
  return { ...p, cartes: p.cartes.map((q, i) => (i === vise ? { ...q, calques } : q)) }
}

/**
 * Ajoute une planche au projet — celle qu'on vient d'importer.
 *
 * Le nom est dedouble s'il est pris : deux planches du meme nom rendraient
 * « laquelle ? » sans reponse partout ou une espece ou une carte designe la
 * sienne. On numerote au lieu d'ecraser — ecraser detruirait un dessin
 * existant pour une collision de nom, ce qui est la pire reponse possible.
 */
export function ajouterPlancheProjet(
  p: ProjetSerialise, planche: PlancheSerialisee,
): ProjetSerialise {
  let nom = planche.nom.trim() || 'importee'
  let n = 2
  while (p.planches.some((q) => q.nom === nom)) nom = `${planche.nom}-${n++}`
  return { ...p, planches: [...p.planches, { ...planche, nom }] }
}

/* ------------------------------------------------------------------ */
/* Les salles                                                          */
/* ------------------------------------------------------------------ */

/**
 * Renomme une salle.
 *
 * Le nom sert a la RETROUVER — dans le panneau, dans l'instantane du reseau,
 * dans le fichier. Deux salles du meme nom rendraient « laquelle ? » sans
 * reponse ; l'appelant verifie avant, et l'on ne double pas la verification
 * ici : deux endroits qui decident de la meme regle finissent par en decider
 * deux differentes.
 */
export function renommerSalleProjet(
  p: ProjetSerialise, nom: string, neuf: string,
): ProjetSerialise {
  return {
    ...p,
    salles: (p.salles ?? []).map((s) => (s.nom === nom ? { ...s, nom: neuf } : s)),
  }
}

/**
 * Regle un des quatre nombres d'une salle.
 *
 * Les valeurs sont BORNEES et non refusees : un champ qu'on vide au clavier
 * rend une chaine vide, donc NaN, et refuser laisserait le champ dans un etat
 * que rien ne rattrape. Une salle de moins d'une case n'existe pas ; une
 * salle a coordonnee negative sortirait de la carte et ne contiendrait
 * jamais personne.
 */
export function reglerSalleProjet(
  p: ProjetSerialise, nom: string,
  changements: Partial<{ x: number; y: number; largeur: number; hauteur: number; carte: string }>,
): ProjetSerialise {
  const entier = (v: number | undefined, mini: number, defaut: number): number =>
    (Number.isFinite(v) ? Math.max(mini, Math.round(v as number)) : defaut)
  return {
    ...p,
    salles: (p.salles ?? []).map((s) => (s.nom === nom ? {
      ...s,
      x: entier(changements.x, 0, s.x),
      y: entier(changements.y, 0, s.y),
      largeur: entier(changements.largeur, 1, s.largeur),
      hauteur: entier(changements.hauteur, 1, s.hauteur),
      carte: changements.carte ?? s.carte ?? '',
    } : s)),
  }
}

/**
 * Regle la lumiere ambiante d'UNE carte. Null : celle du projet.
 *
 * La nuit s'epaissit en descendant : une surface claire et une grotte noire
 * dans le meme jeu — c'est le cas que la version 15 ajoute.
 */
export function reglerAmbianteCarteProjet(
  p: ProjetSerialise, nomCarte: string, ambiante: number | null,
): ProjetSerialise {
  const bornee = ambiante === null || !Number.isFinite(ambiante)
    ? null
    : Math.max(0, Math.min(1, ambiante))
  return {
    ...p,
    cartes: p.cartes.map((c) => (c.nom === nomCarte ? { ...c, ambiante: bornee } : c)),
  }
}

export function retirerSalleProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  return { ...p, salles: (p.salles ?? []).filter((s) => s.nom !== nom) }
}

/**
 * Ajoute ou remplace une espece dans le catalogue.
 *
 * Elle passe par `espece()`, la meme fabrique que le catalogue de
 * demonstration : tout champ qu'on ne remplit pas prend la valeur par defaut
 * du moteur, et une espece creee a la main a exactement la meme forme qu'une
 * espece ecrite en TypeScript. Sans quoi une espece de l'editeur serait
 * une espece de deuxieme classe, a qui il manquerait le champ qu'on vient
 * d'ajouter.
 */
export function poserEspeceProjet(
  p: ProjetSerialise, id: string, champs: Partial<Espece>,
): ProjetSerialise {
  const propre = id.trim()
  if (!propre) return p
  const ancienne = p.especes.find((e) => e.id === propre)
  const neuve = espece(propre, { ...(ancienne ?? {}), ...champs })
  const especes = ancienne
    ? p.especes.map((e) => (e.id === propre ? neuve : e))
    : [...p.especes, neuve]
  return { ...p, especes }
}

/**
 * Retire une espece, ET les entites de la scene qui la portaient.
 *
 * Les laisser ferait des noeuds qui designent une espece absente : ils ne se
 * dessinent plus, ne bougent plus, et restent la a occuper une case qu'on ne
 * peut plus viser. Un catalogue et une scene qui se contredisent est le pire
 * des deux mondes.
 */
export function retirerEspeceProjet(p: ProjetSerialise, id: string): ProjetSerialise {
  const nettoyer = (n: NoeudSerialise): NoeudSerialise => ({
    ...n,
    enfants: n.enfants.filter((e) => e.espece !== id).map(nettoyer),
  })
  return {
    ...p,
    especes: p.especes.filter((e) => e.id !== id),
    scenes: p.scenes.map((s) => ({ ...s, racine: nettoyer(s.racine) })),
  }
}

/** Change la resolution virtuelle du projet. */
export function changerVueProjet(
  p: ProjetSerialise, largeur: number, hauteur: number,
): ProjetSerialise {
  return {
    ...p,
    vue: {
      largeur: Math.max(32, Math.round(largeur)),
      hauteur: Math.max(32, Math.round(hauteur)),
    },
  }
}

/** Les matieres lisibles d'une carte serialisee, pour un rapport. */
export function compterMatieres(c: CarteSerialisee): Map<number, number> {
  const compte = new Map<number, number>()
  for (const ligne of c.solides) {
    for (const car of ligne) {
      const m = caractereEnMatiere(car)
      compte.set(m, (compte.get(m) ?? 0) + 1)
    }
  }
  return compte
}

export { matiereEnCaractere }

/* ------------------------------------------------------------------ */
/* Les declencheurs                                                    */
/* ------------------------------------------------------------------ */

/**
 * Ajoute un declencheur neuf, nomme d'office.
 *
 * Il nait en « zone » de deux cases sur deux, au coin de la carte, avec un
 * script qui ne fait rien mais MONTRE les verbes : la page blanche est le
 * vrai obstacle, pas la syntaxe. « unefois » nait vrai — c'est le cas de
 * loin le plus courant, et un dialogue qui se rouvre en boucle est la faute
 * qu'on decouvre en jouant, trop tard.
 */
export function ajouterDeclencheurProjet(p: ProjetSerialise): ProjetSerialise {
  const liste = p.declencheurs ?? []
  let n = liste.length + 1
  while (liste.some((d) => d.nom === `declencheur${n}`)) n++
  return {
    ...p,
    declencheurs: [...liste, {
      nom: `declencheur${n}`,
      quand: 'zone',
      carte: '',
      salle: '',
      zone: { x: 0, y: 0, l: 2, h: 2 },
      qui: '',
      unefois: true,
      script: "// À vous : c.dire('accueil'), c.musique('boss'), c.jouer('coup'),\n"
        + '// c.secouer(3, 200), c.poser(\'slime\', n.x, n.y - 20)…\n',
    }],
  }
}

/**
 * Regle un declencheur, y compris son nom.
 *
 * Le rename passe par `nom` dans les changements ; l'appelant verifie que le
 * nouveau nom est libre, comme pour les salles, et pour la meme raison.
 */
export function reglerDeclencheurProjet(
  p: ProjetSerialise, nom: string, changements: Partial<DeclencheurSerialise>,
): ProjetSerialise {
  return {
    ...p,
    declencheurs: (p.declencheurs ?? []).map((d) => (d.nom === nom
      ? { ...d, ...changements, zone: { ...d.zone, ...(changements.zone ?? {}) } }
      : d)),
  }
}

export function retirerDeclencheurProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  return { ...p, declencheurs: (p.declencheurs ?? []).filter((d) => d.nom !== nom) }
}

/* ------------------------------------------------------------------ */
/* Les cartes multiples, et le deroule                                 */
/* ------------------------------------------------------------------ */

/**
 * Ajoute une carte neuve, et LA SCENE DU MEME NOM.
 *
 * C'est l'appariement qui porte tout le multi-cartes : une carte sans scene
 * n'aurait ni heros ni creatures, et l'on tomberait dans un niveau vide sans
 * comprendre pourquoi. La scene neuve recoit une copie du heros de la
 * premiere scene — meme espece, meme nom — posee pres du coin : un niveau
 * doit etre jouable des sa creation, et c'est le nom du heros que la camera
 * suit d'un niveau a l'autre.
 */
export function ajouterCarteProjet(p: ProjetSerialise): ProjetSerialise {
  const modele = p.cartes[0]
  if (!modele) return p
  let n = p.cartes.length + 1
  while (p.cartes.some((c) => c.nom === `niveau${n}`)) n++
  const nom = `niveau${n}`
  const vides = () => Array.from({ length: modele.hauteur }, () => rangeeVide(modele.largeur))
  const zeros = () => rangeeZeros(modele.largeur)
  const carte: CarteSerialisee = {
    nom,
    largeur: modele.largeur,
    hauteur: modele.hauteur,
    tuile: modele.tuile,
    ambiante: null,
    // Les MEMES calques que la premiere carte, vides : un niveau deux qui
    // n'aurait pas le calque « décor » ferait echouer les gestes qui le
    // nomment, et personne ne saurait pourquoi le niveau un les accepte.
    calques: modele.calques.map((q) => ({
      nom: q.nom,
      visible: q.visible,
      devant: q.devant,
      terrain: q.terrain ? { ...q.terrain } : null,
      cases: vides(),
      presence: q.presence ? Array.from({ length: modele.hauteur }, zeros) : null,
      parallaxe: q.parallaxe ? { ...q.parallaxe } : { x: 1, y: 1 },
      repete: q.repete ?? false,
    })),
    solides: Array.from({ length: modele.hauteur }, () => matiereEnCaractere(VIDE).repeat(modele.largeur)),
  }
  const scene = sceneAppariee(p, nom, modele.tuile)
  return { ...p, cartes: [...p.cartes, carte], scenes: [...p.scenes, scene] }
}

/**
 * La scene du meme nom qu'une carte neuve, avec une copie du heros de la
 * premiere scene, posee pres du coin. C'est le contrat du multi-cartes —
 * carte et scene vont par paires — et « + Carte » comme l'import Tiled
 * passent par ICI : deux fabriques de scene finiraient par diverger.
 */
function sceneAppariee(
  p: ProjetSerialise, nom: string, tuile: number,
): ProjetSerialise['scenes'][number] {
  const heros = chercherHeros(p.scenes[0]?.racine)
  return {
    nom,
    racine: {
      id: `scene-${nom}`, nom: 'scene', type: 'noeud' as const, x: 0, y: 0, visible: true,
      script: null, espece: null, image: 0, proprietes: {},
      enfants: [
        {
          id: `decor-${nom}`, nom: 'decor', type: 'carte' as const, x: 0, y: 0, visible: true,
          script: null, espece: null, image: 0,
          proprietes: { source: nom }, enfants: [],
        },
        ...(heros ? [{
          ...structuredClone(heros),
          id: `heros-${nom}`,
          x: tuile * 3,
          y: tuile * 3,
        }] : []),
      ],
    },
  }
}

/**
 * Ajoute une carte IMPORTEE — venue de Tiled ou de LDtk — et sa scene.
 *
 * La carte arrive telle que l'autre outil l'a faite : ses calques, ses
 * solides, sa taille de case. Elle recoit un nom libre derive du sien, une
 * scene appariee avec le heros — un niveau importe doit etre JOUABLE, pas
 * seulement visible — et l'ambiante reste celle du projet.
 */
export function ajouterCarteImporteeProjet(
  p: ProjetSerialise, nomVoulu: string, carte: import('../tuiles/tilemap.ts').Carte,
): ProjetSerialise {
  const base = nomVoulu.replace(/\.[^.]+$/, '').trim() || 'importee'
  let nom = base
  let n = 2
  while (p.cartes.some((c) => c.nom === nom)) nom = `${base}-${n++}`
  const serialisee: CarteSerialisee = { ...serialiserCarte(nom, carte), nom }
  return {
    ...p,
    cartes: [...p.cartes, serialisee],
    scenes: [...p.scenes, sceneAppariee(p, nom, carte.tuile)],
  }
}

/** Le premier noeud qui porte une espece : le heros a copier. */
function chercherHeros(racine?: NoeudSerialise): NoeudSerialise | null {
  if (!racine) return null
  if (racine.espece) return racine
  for (const e of racine.enfants) {
    const t = chercherHeros(e)
    if (t) return t
  }
  return null
}

/**
 * Renomme une carte, sa scene, et tout ce qui la nommait.
 *
 * Le decor de sa scene la designe par `source`, et le deroule par son nom :
 * renommer sans les suivre casserait le niveau en silence — il se
 * dessinerait avec la mauvaise carte, ou sortirait du deroule.
 */
export function renommerCarteProjet(
  p: ProjetSerialise, nom: string, neuf: string,
): ProjetSerialise {
  /*
   * Le noeud de DECOR seulement.
   *
   * `source` veut dire deux choses selon le type : pour un noeud de carte,
   * c'est le nom d'une carte ; pour un sprite, c'est le nom d'une planche.
   * Renommer les deux faisait qu'une planche appelee comme une carte changeait
   * de nom en meme temps qu'elle — et les creatures qui la dessinaient
   * devenaient invisibles.
   */
  const renommerSource = (n: NoeudSerialise): NoeudSerialise => ({
    ...n,
    proprietes: n.type === 'carte' && n.proprietes?.source === nom
      ? { ...n.proprietes, source: neuf } : n.proprietes,
    enfants: n.enfants.map(renommerSource),
  })
  return {
    ...p,
    cartes: p.cartes.map((c) => (c.nom === nom ? { ...c, nom: neuf } : c)),
    scenes: p.scenes.map((s) => ({
      ...s,
      nom: s.nom === nom ? neuf : s.nom,
      racine: renommerSource(s.racine),
    })),
    // Les SALLES et les DECLENCHEURS portent le nom de leur carte depuis les
    // versions 15 et 14 du format, et le renommage ne les suivait pas : une
    // carte renommee perdait ses tableaux et ses declenchements, en silence.
    // C'est exactement le genre de perte qui ne se decouvre qu'en jouant.
    salles: (p.salles ?? []).map((q) => (q.carte === nom ? { ...q, carte: neuf } : q)),
    declencheurs: (p.declencheurs ?? []).map(
      (q) => (q.carte === nom ? { ...q, carte: neuf } : q)),
    deroule: {
      titre: p.deroule?.titre ?? '',
      ordre: (p.deroule?.ordre ?? []).map((q) => (q === nom ? neuf : q)),
    },
  }
}

/* ------------------------------------------------------------------ */
/* Renommer, et suivre les references                                  */
/* ------------------------------------------------------------------ */

/**
 * Renommer, dans un projet ou tout se designe par son NOM.
 *
 * ## Pourquoi c'est un geste a part, et pas un champ de texte
 *
 * Le format ne connait pas de references : une espece est nommee « gelee »
 * dans le catalogue, et chaque entite posee porte la CHAINE « gelee ». C'est
 * ce qui rend le fichier lisible par six langages sans table d'indirection —
 * et c'est ce qui fait qu'un renommage naif casse tout ce qui renvoyait a
 * l'ancien nom, sans une erreur, sans un mot. Les creatures posees
 * disparaissent simplement du jeu.
 *
 * L'identifiant d'une espece etait donc en lecture seule : on ne renommait
 * pas, parce que renommer aurait ete faux. Le geste existe maintenant, et il
 * SUIT les references — c'est la seule maniere honnete de l'offrir.
 *
 * ## Ce qu'il ne peut pas suivre
 *
 * Un script qui ecrit `c.poser('gelee', x, y)` nomme l'espece dans du TEXTE.
 * Reecrire ce texte demanderait de comprendre le programme — de distinguer la
 * chaine qui designe l'espece de celle qui n'en parle pas. On ne le fait donc
 * pas : on le DIT. Voir `scriptsQuiNomment`.
 */
function renommerEspeceDansNoeud(n: NoeudSerialise, id: string, neuf: string): NoeudSerialise {
  return {
    ...n,
    espece: n.espece === id ? neuf : n.espece,
    enfants: n.enfants.map((e) => renommerEspeceDansNoeud(e, id, neuf)),
  }
}

export function renommerEspeceProjet(
  p: ProjetSerialise, id: string, voulu: string,
): ProjetSerialise {
  const neuf = voulu.trim()
  // Un nom deja pris ferait deux especes indiscernables, et un nom vide une
  // espece qu'aucune entite ne peut nommer. On rend le projet tel quel : le
  // panneau le voit, et le dit.
  if (!neuf || neuf === id || p.especes.some((e) => e.id === neuf)) return p
  if (!p.especes.some((e) => e.id === id)) return p
  return {
    ...p,
    especes: p.especes.map((e) => (e.id === id ? { ...e, id: neuf } : e)),
    scenes: p.scenes.map((s) => ({ ...s, racine: renommerEspeceDansNoeud(s.racine, id, neuf) })),
    // Les assemblages portent des noeuds eux aussi : un modele qui garderait
    // l'ancien nom poserait des copies invisibles.
    assemblages: (p.assemblages ?? []).map(
      (a) => ({ ...a, racine: renommerEspeceDansNoeud(a.racine, id, neuf) })),
  }
}

/** La planche d'un SPRITE — voir `renommerCarteProjet` pour l'ambiguite. */
function renommerPlancheDansNoeud(n: NoeudSerialise, nom: string, neuf: string): NoeudSerialise {
  return {
    ...n,
    proprietes: n.type === 'sprite' && n.proprietes?.source === nom
      ? { ...n.proprietes, source: neuf } : n.proprietes,
    enfants: n.enfants.map((e) => renommerPlancheDansNoeud(e, nom, neuf)),
  }
}

export function renommerPlancheProjet(
  p: ProjetSerialise, nom: string, voulu: string,
): ProjetSerialise {
  const neuf = voulu.trim()
  if (!neuf || neuf === nom || p.planches.some((q) => q.nom === neuf)) return p
  if (!p.planches.some((q) => q.nom === nom)) return p
  return {
    ...p,
    planches: p.planches.map((q) => (q.nom === nom ? { ...q, nom: neuf } : q)),
    // Une espece dit OU piocher ses dessins : sans cette ligne, toutes les
    // creatures de la planche renommee cessent de se dessiner.
    especes: p.especes.map((e) => (e.planche === nom ? { ...e, planche: neuf } : e)),
    scenes: p.scenes.map((s) => ({ ...s, racine: renommerPlancheDansNoeud(s.racine, nom, neuf) })),
    assemblages: (p.assemblages ?? []).map(
      (a) => ({ ...a, racine: renommerPlancheDansNoeud(a.racine, nom, neuf) })),
  }
}

/**
 * Ce qui nomme encore l'ancien nom DANS DU TEXTE — et qu'on ne reecrit pas.
 *
 * Un script, un declencheur : la chaine y est du programme, et la reecrire
 * demanderait de comprendre ce programme. On rend donc la liste de ce qui
 * mentionne le mot, pour que le renommage puisse le DIRE. Un renommage qui se
 * tait sur ce qu'il n'a pas su suivre est un renommage qui ment.
 */
export function scriptsQuiNomment(p: ProjetSerialise, mot: string): string[] {
  const dedans = (texte: string | null | undefined): boolean =>
    !!texte && new RegExp(`['"\`]${mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(texte)
  const out: string[] = []
  for (const e of p.especes) if (dedans(e.script)) out.push(`espèce ${e.id}`)
  for (const d of p.declencheurs ?? []) if (dedans(d.script)) out.push(`déclencheur ${d.nom}`)
  const parcourir = (n: NoeudSerialise, ou: string): void => {
    if (dedans(n.script)) out.push(`${ou} · ${n.nom}`)
    n.enfants.forEach((q) => parcourir(q, ou))
  }
  for (const s of p.scenes) parcourir(s.racine, `scène ${s.nom}`)
  return out
}

/**
 * Retire une carte et sa scene. La derniere ne se retire pas.
 *
 * Un projet sans carte ne s'edite pas et ne se joue pas : on refuse le geste
 * plutot que d'avoir a expliquer l'ecran noir — la meme regle que pour le
 * dernier calque.
 */
export function retirerCarteProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  if (p.cartes.length <= 1 || !p.cartes.some((c) => c.nom === nom)) return p
  return {
    ...p,
    cartes: p.cartes.filter((c) => c.nom !== nom),
    scenes: p.scenes.filter((s) => s.nom !== nom),
    deroule: {
      titre: p.deroule?.titre ?? '',
      ordre: (p.deroule?.ordre ?? []).filter((q) => q !== nom),
    },
  }
}

/** Regle le titre du deroule. Vide : pas d'ecran-titre. */
export function reglerDerouleProjet(
  p: ProjetSerialise, changements: Partial<{ titre: string; ordre: string[] }>,
): ProjetSerialise {
  return {
    ...p,
    deroule: {
      titre: changements.titre ?? p.deroule?.titre ?? '',
      ordre: changements.ordre ?? p.deroule?.ordre ?? [],
    },
  }
}

/* ------------------------------------------------------------------ */
/* Les dialogues et les musiques                                       */
/* ------------------------------------------------------------------ */

/**
 * Ajoute une suite de repliques, nommee d'office.
 *
 * Elle nait avec UNE replique montrant la forme : la page blanche est le
 * vrai obstacle. C'est par son nom qu'un script l'ouvre — c.dire('nom') —
 * et c'est pour cela que deux dialogues ne peuvent pas le partager.
 */
export function ajouterDialogueProjet(p: ProjetSerialise): ProjetSerialise {
  const liste = p.dialogues ?? []
  let n = liste.length + 1
  while (liste.some((d) => d.nom === `dialogue${n}`)) n++
  return {
    ...p,
    dialogues: [...liste, {
      nom: `dialogue${n}`,
      repliques: [{ qui: '', texte: 'À vous : c.dire(’' + `dialogue${n}` + '’) l’ouvrira.', choix: [] }],
    }],
  }
}

export function reglerDialogueProjet(
  p: ProjetSerialise, nom: string,
  changements: Partial<{ nom: string; repliques: { qui: string; texte: string; choix: never[] }[] }>,
): ProjetSerialise {
  return {
    ...p,
    dialogues: (p.dialogues ?? []).map((d) => (d.nom === nom ? {
      nom: changements.nom?.trim() || d.nom,
      repliques: changements.repliques ?? d.repliques,
    } : d)),
  }
}

export function retirerDialogueProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  return { ...p, dialogues: (p.dialogues ?? []).filter((d) => d.nom !== nom) }
}

/**
 * Ajoute une musique, nommee d'office, avec une voie qui joue deja.
 *
 * Quatre notes et non le silence : une musique vide ne s'ecoute pas, et
 * c'est en ECOUTANT qu'on ecrit la suite — la meme raison qui met un bouton
 * « Écouter » a cote de chaque son.
 */
export function ajouterMusiqueProjet(p: ProjetSerialise): ProjetSerialise {
  const liste = p.musiques ?? []
  let n = liste.length + 1
  while (liste.some((m) => m.nom === `musique${n}`)) n++
  return {
    ...p,
    musiques: [...liste, musiqueFabrique(`musique${n}`, {
      tempo: 120,
      voies: [voieFabrique(['do4', '-', 'mi4', '-', 'sol4', '-', 'mi4', '-'])],
    })],
  }
}

export function reglerMusiqueProjet(
  p: ProjetSerialise, nom: string,
  changements: Partial<{ nom: string; tempo: number; boucle: boolean; voies: Voie[] }>,
): ProjetSerialise {
  return {
    ...p,
    musiques: (p.musiques ?? []).map((m) => (m.nom === nom ? {
      ...m,
      nom: changements.nom?.trim() || m.nom,
      tempo: Number.isFinite(changements.tempo) ? Math.max(1, Math.round(changements.tempo as number)) : m.tempo,
      boucle: changements.boucle ?? m.boucle,
      voies: changements.voies ?? m.voies,
    } : m)),
  }
}

export function retirerMusiqueProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  return { ...p, musiques: (p.musiques ?? []).filter((m) => m.nom !== nom) }
}

/* ------------------------------------------------------------------ */
/* Les noeuds d'une scene                                              */
/* ------------------------------------------------------------------ */

/*
 * L'arbre de scene se modifie par les MEMES gestes de structure que tout le
 * reste : transformer le projet serialise, relire. Un noeud est designe par
 * son identifiant — le nom, lui, se renomme, et deux noeuds peuvent en
 * partager un.
 */

const surNoeud = (
  n: NoeudSerialise, id: string, f: (q: NoeudSerialise) => NoeudSerialise,
): NoeudSerialise => (n.id === id
  ? f(n)
  : { ...n, enfants: n.enfants.map((e) => surNoeud(e, id, f)) })

const surScene = (
  p: ProjetSerialise, nomScene: string, f: (racine: NoeudSerialise) => NoeudSerialise,
): ProjetSerialise => ({
  ...p,
  scenes: p.scenes.map((s) => (s.nom === nomScene ? { ...s, racine: f(s.racine) } : s)),
})

/**
 * Regle ce qu'un noeud de scene porte.
 *
 * ## Pourquoi les proprietes libres passent par ici aussi
 *
 * Un noeud a quatre champs que tout le monde comprend — nom, visible, x, y —
 * et un sac de proprietes propres a son type : la boite d'un corps, le role
 * d'une zone, la marge d'une camera. L'inspecteur les montre toutes, sans en
 * connaitre une seule : il lit le sac et deduit le champ de la VALEUR. Un
 * geste qui ne saurait regler que les quatre champs communs obligerait a
 * ecrire un formulaire par type de noeud, et le prochain type ajoute au
 * moteur naitrait sans formulaire.
 *
 * Les proprietes se FONDENT au lieu de remplacer le sac : l'inspecteur
 * n'envoie que celle qu'on vient de changer, et tout envoyer ferait qu'un
 * champ rendu vide effacerait les autres.
 */
export function reglerNoeudProjet(
  p: ProjetSerialise, nomScene: string, id: string,
  changements: Partial<{
    nom: string
    visible: boolean
    x: number
    y: number
    espece: string | null
    image: number
    script: string | null
    proprietes: Record<string, unknown>
  }>,
): ProjetSerialise {
  return surScene(p, nomScene, (racine) => surNoeud(racine, id, (n) => ({
    ...n,
    nom: changements.nom?.trim() || n.nom,
    visible: changements.visible ?? n.visible,
    x: Number.isFinite(changements.x) ? (changements.x as number) : n.x,
    y: Number.isFinite(changements.y) ? (changements.y as number) : n.y,
    // `undefined` veut dire « ne touche pas » ; `null` veut dire « plus
    // d'espece ». Les confondre rendrait impossible d'en retirer une.
    espece: changements.espece === undefined ? n.espece : changements.espece,
    image: Number.isFinite(changements.image) ? (changements.image as number) : n.image,
    script: changements.script === undefined ? n.script : changements.script,
    proprietes: changements.proprietes
      ? { ...n.proprietes, ...changements.proprietes }
      : n.proprietes,
  })))
}

/**
 * Les types de noeud qu'on peut ajouter a la main, et ce qu'ils font.
 *
 * Ils existent tous dans le moteur depuis longtemps ; ce qui manquait, c'est
 * de pouvoir en CREER un. L'arbre ne recevait que ce que la palette y posait
 * — des entites —, si bien qu'un projet ne pouvait pas avoir un noeud de
 * groupe pour ranger ses pieges, ni une zone posee a la main, ni une camera a
 * soi. Un arbre de scene qui ne compose pas n'est pas un arbre de scene.
 */
export const TYPES_NOEUD = [
  { id: 'noeud', nom: 'Nœud', note: 'Un nœud nu : il ne dessine rien, il RANGE. Le déplacer déplace tout ce qu’il porte.' },
  { id: 'sprite', nom: 'Sprite', note: 'Un dessin d’une planche, animable.' },
  { id: 'corps', nom: 'Corps', note: 'Une boîte de collision : c’est elle qui se cogne au décor.' },
  { id: 'zone', nom: 'Zone', note: 'Un rectangle qui se sait touché — un rôle, pas un dessin.' },
  { id: 'camera', nom: 'Caméra', note: 'Un point de vue, avec ses marges.' },
] as const

/** Ajoute un noeud neuf sous un parent. Le parent inconnu : sous la racine. */
export function ajouterNoeudProjet(
  p: ProjetSerialise, nomScene: string, idParent: string, type: string, nom: string,
): ProjetSerialise {
  const propre = nom.trim() || type
  // Le squelette vient du MOTEUR et non d'une table ecrite ici : les valeurs
  // par defaut d'un corps — sa boite de huit pixels — vivent dans
  // `creerNoeud`, et les recopier ferait deux verites pour une.
  const neuf = serialiserNoeud(creerNoeud(type as Parameters<typeof creerNoeud>[0], propre))
  const sous = (n: NoeudSerialise): NoeudSerialise => (n.id === idParent
    ? { ...n, enfants: [...n.enfants, neuf] }
    : { ...n, enfants: n.enfants.map(sous) })
  return surScene(p, nomScene, (racine) => (
    idParent && trouverDans(racine, idParent) ? sous(racine)
      : { ...racine, enfants: [...racine.enfants, neuf] }))
}

/** Le noeud d'un arbre serialise portant cet identifiant, ou null. */
function trouverDans(n: NoeudSerialise, id: string): NoeudSerialise | null {
  if (n.id === id) return n
  for (const e of n.enfants) { const r = trouverDans(e, id); if (r) return r }
  return null
}

/** Vrai si `id` est quelque part SOUS `n` — lui-meme compris. */
function contient(n: NoeudSerialise, id: string): boolean {
  return trouverDans(n, id) !== null
}

/**
 * Change le PARENT d'un noeud : le geste qui fait d'un arbre un arbre.
 *
 * ## Ce qui est refuse, et pourquoi
 *
 * Deposer un noeud sur lui-meme, ou sur l'un de ses propres descendants,
 * detacherait tout le sous-arbre de la scene : il deviendrait son propre
 * ancetre, et le parcours qui le dessine tournerait en rond jusqu'a epuiser
 * la pile. Le geste ne fait alors RIEN — mieux vaut un glisser sans effet
 * qu'une scene qu'on ne peut plus ouvrir.
 *
 * La racine ne se reparente pas non plus : elle est la scene.
 */
export function reparenterNoeudProjet(
  p: ProjetSerialise, nomScene: string, id: string, idParent: string,
): ProjetSerialise {
  const scene = p.scenes.find((q) => q.nom === nomScene)
  if (!scene || id === idParent || id === scene.racine.id) return p
  const noeud = trouverDans(scene.racine, id)
  const parent = trouverDans(scene.racine, idParent)
  if (!noeud || !parent) return p
  // Son propre descendant : voir plus haut.
  if (contient(noeud, idParent)) return p
  // Deja son parent : rien a faire, et surtout pas un geste dans le journal.
  if (parent.enfants.some((e) => e.id === id)) return p
  const copie = structuredClone(noeud)
  const elaguer = (n: NoeudSerialise): NoeudSerialise => ({
    ...n,
    enfants: n.enfants.filter((e) => e.id !== id).map(elaguer),
  })
  const greffer = (n: NoeudSerialise): NoeudSerialise => (n.id === idParent
    ? { ...n, enfants: [...n.enfants, copie] }
    : { ...n, enfants: n.enfants.map(greffer) })
  return surScene(p, nomScene, (racine) => greffer(elaguer(racine)))
}

/**
 * Retire un noeud — et tout ce qu'il porte. La racine ne se retire pas :
 * une scene sans racine n'est pas une scene vide, c'est un fichier invalide.
 */
export function retirerNoeudProjet(
  p: ProjetSerialise, nomScene: string, id: string,
): ProjetSerialise {
  const elaguer = (n: NoeudSerialise): NoeudSerialise => ({
    ...n,
    enfants: n.enfants.filter((e) => e.id !== id).map(elaguer),
  })
  return surScene(p, nomScene, elaguer)
}

/**
 * Decale un noeud parmi ses freres. L'ordre des freres est l'ordre de
 * DESSIN : le dernier se dessine par-dessus — c'est la meme regle que les
 * calques, et c'est pour cela que le geste existe.
 */
export function decalerNoeudProjet(
  p: ProjetSerialise, nomScene: string, id: string, delta: number,
): ProjetSerialise {
  const bouger = (n: NoeudSerialise): NoeudSerialise => {
    const i = n.enfants.findIndex((e) => e.id === id)
    if (i < 0) return { ...n, enfants: n.enfants.map(bouger) }
    const j = Math.max(0, Math.min(n.enfants.length - 1, i + delta))
    if (i === j) return n
    const enfants = [...n.enfants]
    const [pris] = enfants.splice(i, 1)
    enfants.splice(j, 0, pris)
    return { ...n, enfants }
  }
  return surScene(p, nomScene, bouger)
}

/**
 * Duplique un noeud — lui et tout ce qu'il porte — a cote de l'original.
 *
 * Chaque copie recoit un identifiant NEUF : deux noeuds du meme identifiant
 * rendraient tous les gestes par identifiant ambigus, a commencer par ceux
 * de l'arbre. Le nom, lui, est garde tel quel — c'est l'usage des noms ici,
 * et la copie d'une « lanterne » reste une lanterne.
 */
/**
 * Une copie d'un sous-arbre, avec des identifiants que personne ne porte.
 *
 * Deux noeuds du meme identifiant rendent « lequel ? » sans reponse : le
 * journal ne saurait plus lequel defaire, l'arbre en surlignerait deux, et
 * l'inspecteur montrerait le premier trouve. C'est la seule regle qui compte
 * ici, et elle vaut pour dupliquer comme pour coller — d'ou la fonction
 * partagee.
 */
export function copieAIdentifiantsNeufs(
  racine: NoeudSerialise, noeud: NoeudSerialise,
): NoeudSerialise {
  const pris = new Set<string>()
  const ramasser = (n: NoeudSerialise): void => {
    pris.add(n.id)
    n.enfants.forEach(ramasser)
  }
  ramasser(racine)
  const libre = (base: string): string => {
    let candidat = `${base}-2`
    let n = 3
    while (pris.has(candidat)) candidat = `${base}-${n++}`
    pris.add(candidat)
    return candidat
  }
  const copier = (n: NoeudSerialise): NoeudSerialise => ({
    ...structuredClone(n),
    id: libre(n.id),
    enfants: n.enfants.map(copier),
  })
  return copier(noeud)
}

/**
 * COLLE une description de noeud sous un parent.
 *
 * La description vient d'ailleurs — d'une autre scene, d'un autre moment — et
 * l'on ne peut donc rien supposer de ses identifiants : ils sont refaits.
 * C'est ce qui permet de coller deux fois de suite, ou de coller dans la
 * scene d'ou l'on vient de copier.
 */
export function collerNoeudProjet(
  p: ProjetSerialise, nomScene: string, idParent: string, description: NoeudSerialise,
): { projet: ProjetSerialise; id: string } {
  const scene = p.scenes.find((q) => q.nom === nomScene)
  if (!scene) return { projet: p, id: '' }
  const copie = copieAIdentifiantsNeufs(scene.racine, description)
  const sous = (n: NoeudSerialise): NoeudSerialise => (n.id === idParent
    ? { ...n, enfants: [...n.enfants, copie] }
    : { ...n, enfants: n.enfants.map(sous) })
  const cible = trouverDans(scene.racine, idParent) ? idParent : scene.racine.id
  return {
    projet: surScene(p, nomScene, (racine) => (cible === racine.id
      ? { ...racine, enfants: [...racine.enfants, copie] }
      : sous(racine))),
    id: copie.id,
  }
}

export function dupliquerNoeudProjet(
  p: ProjetSerialise, nomScene: string, id: string,
): ProjetSerialise {
  const scene = p.scenes.find((q) => q.nom === nomScene)
  if (!scene) return p
  const copier = (n: NoeudSerialise): NoeudSerialise =>
    copieAIdentifiantsNeufs(scene.racine, n)
  const inserer = (n: NoeudSerialise): NoeudSerialise => {
    const i = n.enfants.findIndex((e) => e.id === id)
    if (i < 0) return { ...n, enfants: n.enfants.map(inserer) }
    const copie = copier(n.enfants[i])
    // Decalee d'une case : une copie exactement dessous se confond avec
    // l'original, et l'on croit que le bouton n'a rien fait.
    copie.x += 16
    const enfants = [...n.enfants]
    enfants.splice(i + 1, 0, copie)
    return { ...n, enfants }
  }
  return surScene(p, nomScene, inserer)
}

/* ------------------------------------------------------------------ */
/* Les assemblages                                                     */
/* ------------------------------------------------------------------ */

/**
 * Enregistre un noeud — et tout ce qu'il porte — comme ASSEMBLAGE : un
 * modele nomme, que la palette propose ensuite a cote des especes. C'est le
 * prefab des autres moteurs. Le modele est une COPIE : retoucher l'original
 * dans la scene ne change pas le modele, et c'est dit plutot que subi.
 */
export function poserAssemblageProjet(
  p: ProjetSerialise, nom: string, racine: NoeudSerialise,
): ProjetSerialise {
  const base = nom.trim() || racine.nom || 'assemblage'
  const liste = p.assemblages ?? []
  let propre = base
  let n = 2
  while (liste.some((a) => a.nom === propre)) propre = `${base}-${n++}`
  return {
    ...p,
    assemblages: [...liste, { nom: propre, racine: structuredClone(racine) }],
  }
}

export function retirerAssemblageProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  return { ...p, assemblages: (p.assemblages ?? []).filter((a) => a.nom !== nom) }
}

/* ------------------------------------------------------------------ */
/* Les sons et les animations                                          */
/* ------------------------------------------------------------------ */

/**
 * Ajoute un son, nomme d'office, qui S'ENTEND deja : une descente de 440 a
 * 220 hertz. Un son muet ou plat ne donne rien a regler ; celui-ci a une
 * direction, et chaque champ du panneau la change de facon audible.
 *
 * Sans ce bouton, la feuille blanche etait une impasse : un projet parti
 * sans les sons de la demonstration n'avait AUCUN moyen d'en avoir un.
 */
export function ajouterSonProjet(p: ProjetSerialise): ProjetSerialise {
  const liste = p.sons ?? []
  let n = liste.length + 1
  while (liste.some((s) => s.nom === `son${n}`)) n++
  return {
    ...p,
    sons: [...liste, sonFabrique(`son${n}`, { frequence: 440, frequenceFin: 220, duree: 160 })],
  }
}

export function retirerSonProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  return { ...p, sons: (p.sons ?? []).filter((s) => s.nom !== nom) }
}

/**
 * Ajoute un son IMPORTE — un fichier WAV en base64, nomme d'apres le
 * fichier. La duree vient du fichier : c'est elle que le panneau montre, et
 * un son importe qui afficherait « 120 ms » de defaut mentirait.
 */
export function ajouterSonImporteProjet(
  p: ProjetSerialise, nomFichier: string, wav: string, dureeMs: number,
): ProjetSerialise {
  const liste = p.sons ?? []
  const base = nomFichier.replace(/\.[^.]+$/, '').trim() || 'son'
  let nom = base
  let n = 2
  while (liste.some((s) => s.nom === nom)) nom = `${base}-${n++}`
  return {
    ...p,
    sons: [...liste, sonFabrique(nom, {
      wav,
      duree: Math.max(1, Math.round(dureeMs)),
    })],
  }
}

/**
 * Ajoute une animation, nommee d'office : deux images de la planche du
 * heros, un rythme lent. Deux images et non une — une animation d'une image
 * ne bouge pas, et l'on croirait le lecteur casse. C'est dans le panneau
 * qu'on choisit ensuite les vraies cases.
 */
export function ajouterAnimationProjet(p: ProjetSerialise): ProjetSerialise {
  const liste = p.animations ?? []
  let n = liste.length + 1
  while (liste.some((a) => a.nom === `clip${n}`)) n++
  return {
    ...p,
    animations: [...liste, serialiserAnimation(clipRegulier(`clip${n}`, [0, 1], 200))],
  }
}

export function retirerAnimationProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  return { ...p, animations: (p.animations ?? []).filter((a) => a.nom !== nom) }
}

/** Regle les regles du jeu — epee, coeurs, reprise, pointes. Bornees, jamais refusees. */
export function reglerReglesProjet(
  p: ProjetSerialise, changements: Partial<import('../export/format.ts').ReglesJeu>,
): ProjetSerialise {
  const base = p.regles ?? { epee: true, coeurs: true, reapparitionMs: 700, degatsPointes: 1 }
  return {
    ...p,
    regles: {
      epee: changements.epee ?? base.epee,
      coeurs: changements.coeurs ?? base.coeurs,
      reapparitionMs: Number.isFinite(changements.reapparitionMs)
        ? Math.max(0, Math.round(changements.reapparitionMs as number)) : base.reapparitionMs,
      degatsPointes: Number.isFinite(changements.degatsPointes)
        ? Math.max(0, Math.round(changements.degatsPointes as number)) : base.degatsPointes,
    },
  }
}
