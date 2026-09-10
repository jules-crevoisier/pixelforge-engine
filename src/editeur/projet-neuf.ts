import {
  VERSION_FORMAT, decrirePlanche, serialiserAnimation,
  type ProjetSerialise, type CarteSerialisee, type NoeudSerialise, type PlancheSerialisee,
  type DeclencheurSerialise,
} from '../export/format.ts'
import { matiereEnCaractere, caractereEnMatiere, VIDE } from '../tuiles/tilemap.ts'
import { ORTHO_DESSUS, ORTHO_COTE, ISO, type Projection } from '../noyau/projection.ts'
import { espece, type Espece } from '../runtime/entites.ts'
import { musique as musiqueFabrique, voie as voieFabrique, type Voie } from '../runtime/musique.ts'
import { TUILE, CLE_DONJON, PLANCHE_DONJON, CLE_HEROS, PLANCHE_HEROS, COLONNES_HEROS } from '../demo/art.ts'
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
}

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
        cases: Array.from({ length: hauteur }, () => rangeeVide(largeur)),
        presence: Array.from({ length: hauteur }, () => rangeeZeros(largeur)),
      },
      {
        nom: 'mur', visible: true, devant: false,
        terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: true },
        cases: Array.from({ length: hauteur }, () => rangeeVide(largeur)),
        presence: Array.from({ length: hauteur }, () => rangeeZeros(largeur)),
      },
    ],
    solides: Array.from({ length: hauteur }, () => rangeeZeros(largeur)),
  }

  // Le heros au milieu, les pieds au bas de sa case. C'est la convention
  // d'ancrage de tout le moteur ; s'en ecarter ici le ferait flotter.
  const cxMilieu = Math.floor(largeur / 2)
  const cyMilieu = Math.floor(hauteur / 2)
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

  const planches = [
    decrirePlanche('carte', PLANCHE_DONJON, CLE_DONJON, 8, tuile),
    decrirePlanche('heros', PLANCHE_HEROS, CLE_HEROS, COLONNES_HEROS, TUILE),
    decrirePlanche('creatures', PLANCHE_CREATURES, CLE_CREATURES, COLONNES_CREATURES, TUILE),
  ]
  const couleurs = [
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
    animations: clipsDemo().map(serialiserAnimation),
    planches,
    projection,
    // Le catalogue de demonstration, et non un catalogue vide : une palette
    // d'entites sans entite ne s'explique pas, et l'on ne saurait pas par ou
    // commencer. On les remplace ensuite, une par une.
    especes: ESPECES_DEMO.map((e) => ({ ...e, boite: { ...e.boite } })),
    // Les sons partent avec le projet, comme les planches. Un projet neuf
    // muet ferait croire que le moteur n'a pas de son.
    sons: SONS_DEMO.map((q) => ({ ...q })),
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
    // Une table par langue, vide au depart : ce qui compte est que le CHEMIN
    // existe des le premier jour. Ajouter la traduction apres coup oblige a
    // reprendre chaque texte ecrit en dur entre-temps.
    textes: { fr: {} },
    dialogues: [{
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
  const heros = chercherHeros(p.scenes[0]?.racine)
  const scene = {
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
          x: modele.tuile * 3,
          y: modele.tuile * 3,
        }] : []),
      ],
    },
  }
  return { ...p, cartes: [...p.cartes, carte], scenes: [...p.scenes, scene] }
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
  const renommerSource = (n: NoeudSerialise): NoeudSerialise => ({
    ...n,
    proprietes: n.proprietes?.source === nom
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
    deroule: {
      titre: p.deroule?.titre ?? '',
      ordre: (p.deroule?.ordre ?? []).map((q) => (q === nom ? neuf : q)),
    },
  }
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
