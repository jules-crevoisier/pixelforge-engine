import {
  VERSION_FORMAT, decrirePlanche, serialiserAnimation,
  type ProjetSerialise, type CarteSerialisee, type NoeudSerialise,
} from '../export/format.ts'
import { matiereEnCaractere, caractereEnMatiere, VIDE } from '../tuiles/tilemap.ts'
import { ORTHO_DESSUS, ORTHO_COTE, ISO, type Projection } from '../noyau/projection.ts'
import { espece, type Espece } from '../runtime/entites.ts'
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
export function redimensionnerProjet(
  p: ProjetSerialise, largeur: number, hauteur: number,
): ProjetSerialise {
  const l = Math.max(4, Math.round(largeur))
  const h = Math.max(4, Math.round(hauteur))
  const cartes = p.cartes.map((c, index) => {
    if (index !== 0) return c
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
  p: ProjetSerialise, nom: string, avecTerrain: boolean,
): ProjetSerialise {
  const c = p.cartes[0]
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
    cartes: p.cartes.map((q, i) => (i === 0 ? { ...q, calques: [...q.calques, calque] } : q)),
  }
}

/**
 * Retire un calque. Le dernier ne se retire pas.
 *
 * Une carte sans calque ne se dessine pas et ne se repeint pas : l'editeur
 * s'ouvrirait sur un rectangle noir sans rien dire. On refuse le geste plutot
 * que d'avoir a expliquer l'ecran noir.
 */
export function retirerCalqueProjet(p: ProjetSerialise, nom: string): ProjetSerialise {
  const c = p.cartes[0]
  if (!c || c.calques.length <= 1) return p
  return {
    ...p,
    cartes: p.cartes.map((q, i) => (
      i === 0 ? { ...q, calques: q.calques.filter((l) => l.nom !== nom) } : q
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
): ProjetSerialise {
  const c = p.cartes[0]
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
  return { ...p, cartes: p.cartes.map((q, i) => (i === 0 ? { ...q, calques } : q)) }
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
