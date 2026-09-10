import {
  projetNeuf, poserEspeceProjet, reglerDerouleProjet,
} from '../editeur/projet-neuf.ts'
import type {
  ProjetSerialise, CarteSerialisee, NoeudSerialise, DeclencheurSerialise,
} from '../export/format.ts'
import { SOLIDE, PLATEFORME, BLESSANTE, VIDE, matiereEnCaractere } from '../tuiles/tilemap.ts'
import { musique, voie } from '../runtime/musique.ts'
import { replique } from '../runtime/dialogue.ts'

/**
 * « Le Gouffre » : le jeu-temoin.
 *
 * ## Ce que ce fichier prouve, et ce qu'il ne prouve pas
 *
 * C'est un jeu complet — trois niveaux, un titre, des dialogues, une musique,
 * la nuit et ses lanternes, une fin — ecrit SANS UNE LIGNE DE CODE MOTEUR :
 * tout passe par les memes fonctions pures que les boutons de l'editeur, et
 * le resultat est un fichier de projet ordinaire, que « Ouvrir… » relit.
 * C'est la preuve que le format et l'editeur suffisent a faire un jeu, pas
 * seulement un niveau.
 *
 * Il ne prouve PAS que le jeu est bon — c'est un temoin, pas une oeuvre. Sa
 * valeur est ailleurs : chaque manque rencontre en l'ecrivant est devenu soit
 * une correction (la carte d'un declencheur, version 14), soit une ligne du
 * carnet de ce qui reste a faire, dans le README.
 *
 * ## Comment les niveaux sont dessines
 *
 * En ASCII, un caractere par case — la meme technique que les mondes de
 * demonstration, parce qu'un niveau qu'on ne peut pas RELIRE ne se corrige
 * pas. `#` est un mur, `=` une plateforme, `^` une pointe, `.` du vide.
 * Chaque niveau est concu pour se traverser en tenant droite et en
 * sautillant : un banc le VERIFIE avec le vrai controleur — un jeu-temoin
 * infranchissable ne temoignerait de rien.
 */

export const LARGEUR = 60
export const HAUTEUR = 16
export const TUILE = 16

/** Les trois niveaux. 60 colonnes, 16 rangees, la sortie a droite. */
export const PLANS: Record<string, string[]> = {
  clairiere: [
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '..........................=====............................',
    '............................................................',
    '............................................................',
    '....................##......................##..............',
    '..............######################........################',
    '#####################................#######................',
    '############################################################',
  ],
  caverne: [
    '############################################################',
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '.................====........====...........................',
    '............................................................',
    '............................................................',
    '............................................................',
    '.............##..........................##................',
    '..........#####..........................#####..............',
    '........#....................##..............#..............',
    '......###..............######################...############',
    '####################....^^..................................',
    '############################################################',
  ],
  gouffre: [
    '############################################################',
    '#...........................................................',
    '#...........................................................',
    '............................................................',
    '............................................................',
    '............................................................',
    '..............=====..............=====......................',
    '............................................................',
    '............................................................',
    '............................................................',
    '............##..............................................',
    '..........####..............##..............##.............',
    '........###...........######################.....###########',
    '......###.............^^....................................',
    '######.......................................###...........',
    '############################################################',
  ],
}

const CAR_VIDE = matiereEnCaractere(VIDE)
const CAR_SOLIDE = matiereEnCaractere(SOLIDE)
const CAR_PLATEFORME = matiereEnCaractere(PLATEFORME)
const CAR_POINTE = matiereEnCaractere(BLESSANTE)

/** Un plan ASCII devient une carte du format — collision ET dessin. */
export function carteDepuisPlan(nom: string, plan: string[]): CarteSerialisee {
  const solides = plan.map((ligne) => [...ligne].map((c) => (
    c === '#' ? CAR_SOLIDE : c === '=' ? CAR_PLATEFORME : c === '^' ? CAR_POINTE : CAR_VIDE
  )).join(''))
  // Le dessin : une tuile de la planche « carte » par matiere. Le choix des
  // index est esthetique, pas mecanique — la collision vient de `solides`.
  const tuileDe = (c: string): number => (c === '#' ? 1 : c === '=' ? 2 : c === '^' ? 3 : VIDE)
  const cases = plan.map((ligne) => [...ligne].map(tuileDe).join(','))
  return {
    nom,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    tuile: TUILE,
    calques: [{
      nom: 'mur', visible: true, devant: false, terrain: null,
      cases,
      presence: plan.map((ligne) => [...ligne].map((c) => (c === '.' ? '0' : '1')).join('')),
      parallaxe: { x: 1, y: 1 },
      repete: false,
    }],
    solides,
  }
}

/** Un noeud d'entite, dans la forme que la scene attend. */
function entite(id: string, espece: string, cx: number, cy: number): NoeudSerialise {
  return {
    id, nom: id, type: 'sprite',
    x: cx * TUILE + TUILE / 2, y: cy * TUILE,
    visible: true, script: null, espece, image: 0,
    proprietes: { source: 'creatures', ancreX: TUILE / 2, ancreY: TUILE, miroir: false },
    enfants: [],
  }
}

/** La scene d'un niveau : son decor, son heros, ses creatures. */
function scene(
  nomCarte: string, herosModele: NoeudSerialise, entites: NoeudSerialise[],
): { nom: string; racine: NoeudSerialise } {
  return {
    nom: nomCarte,
    racine: {
      id: `scene-${nomCarte}`, nom: 'scene', type: 'noeud', x: 0, y: 0, visible: true,
      script: null, espece: null, image: 0, proprietes: {},
      enfants: [
        {
          id: `decor-${nomCarte}`, nom: 'decor', type: 'carte', x: 0, y: 0, visible: true,
          script: null, espece: null, image: 0,
          proprietes: { source: nomCarte }, enfants: [],
        },
        // Le heros de CE niveau : chaque scene a le sien, au meme nom — c'est
        // lui que la camera suit quand on arrive.
        { ...structuredClone(herosModele), id: `heros-${nomCarte}`, x: 2 * TUILE + 8, y: 14 * TUILE },
        ...entites,
      ],
    },
  }
}

/** Un declencheur, avec tous ses champs — rien d'implicite. */
function declencheur(
  nom: string, carte: string, zone: { x: number; y: number; l: number; h: number },
  script: string, unefois = true,
): DeclencheurSerialise {
  return { nom, quand: 'zone', carte, salle: '', zone, qui: '', unefois, script }
}

/** La zone de sortie d'un niveau : le bord droit, sur toute la hauteur du chemin. */
const SORTIE = { x: 57, y: 8, l: 2, h: 7 }

export function projetGouffre(): ProjetSerialise {
  let p = projetNeuf({
    nom: 'le-gouffre', projection: 'cote', largeur: LARGEUR, hauteur: HAUTEUR,
  })

  // Le heros du modele : celui que projetNeuf a pose, avec son corps.
  const herosModele = p.scenes[0].racine.enfants.find((n) => n.espece) as NoeudSerialise

  const cartes = [
    carteDepuisPlan('clairiere', PLANS.clairiere),
    carteDepuisPlan('caverne', PLANS.caverne),
    carteDepuisPlan('gouffre', PLANS.gouffre),
  ]
  const scenes = [
    scene('clairiere', herosModele, [
      entite('lanterne-c1', 'lanterne', 10, 14),
      entite('coeur-c1', 'coeur', 26, 13),
      entite('gelee-c1', 'gelee', 40, 14),
      entite('lanterne-c2', 'lanterne', 34, 13),
      entite('lanterne-c3', 'lanterne', 52, 13),
    ]),
    scene('caverne', herosModele, [
      entite('lanterne-v1', 'lanterne', 12, 14),
      entite('balise-v1', 'balise', 30, 13),
      entite('gelee-v1', 'gelee', 26, 13),
      entite('gelee-v2', 'gelee', 52, 13),
      entite('lanterne-v2', 'lanterne', 40, 13),
      entite('coeur-v1', 'coeur', 50, 13),
      entite('lanterne-v3', 'lanterne', 56, 13),
    ]),
    scene('gouffre', herosModele, [
      entite('lanterne-g1', 'lanterne', 4, 14),
      entite('chauve-g1', 'chauve-souris', 30, 8),
      entite('balise-g1', 'balise', 24, 12),
      entite('gelee-g1', 'gelee', 36, 12),
      entite('lanterne-g2', 'lanterne', 32, 12),
      entite('coeur-g1', 'coeur', 40, 12),
      entite('lanterne-g3', 'lanterne', 52, 12),
    ]),
  ]
  p = { ...p, cartes, scenes }

  /*
   * Les especes PROPRES au jeu, posees comme le panneau les pose.
   *
   * La lanterne est le temoin de la version 13 : une source de lumiere est
   * une espece dont la description porte un rayon. Et le heros du Gouffre
   * porte sa propre lueur — sans elle, la nuit le mangerait entre deux
   * lanternes, et l'on ne saurait plus ou l'on est.
   */
  p = poserEspeceProjet(p, 'lanterne', {
    nom: 'Lanterne', planche: 'creatures', clip: 'balise', camp: 'decor',
    pv: 9999, vitesse: 0, degats: 0, comportement: 'immobile',
    boite: { x: -5, y: -12, l: 10, h: 12 }, lueur: 64,
  })
  p = poserEspeceProjet(p, 'heros-cote', { lueur: 44 })

  /*
   * LE DEROULE ET LES DECLENCHEURS : tout l'enchainement du jeu, en donnees.
   *
   * La sortie d'un niveau est un declencheur d'une ligne. Chacun NOMME sa
   * carte — c'est ce jeu qui a impose le champ : sans lui, la sortie de la
   * clairiere tirait aussi dans la caverne, aux memes cases.
   */
  p = reglerDerouleProjet(p, { titre: 'Le Gouffre', ordre: ['clairiere', 'caverne', 'gouffre'] })
  p = {
    ...p,
    lumiere: { ambiante: 0.5 },
    declencheurs: [
      declencheur('ouverture', 'clairiere', { x: 0, y: 8, l: 6, h: 7 },
        "c.musique('descente')\nc.dire('accueil')"),
      declencheur('sortie-clairiere', 'clairiere', SORTIE,
        "if (c.niveauSuivant()) c.jouer('valider')", false),
      declencheur('entree-caverne', 'caverne', { x: 0, y: 8, l: 6, h: 7 },
        "c.dire('caverne')"),
      declencheur('sortie-caverne', 'caverne', SORTIE,
        "if (c.niveauSuivant()) c.jouer('valider')", false),
      declencheur('fond-du-gouffre', 'gouffre', SORTIE,
        // La fin se DEMANDE dans le meme souffle que le dernier dialogue :
        // le moteur attend qu'il soit lu avant d'ouvrir l'ecran de fin.
        "c.musique('victoire')\nc.jouer('ramasse')\nc.dire('fin')\nc.fin()"),
    ],
    dialogues: [
      {
        nom: 'accueil',
        repliques: [
          replique('Le Gouffre avale la lumière depuis cent ans.'),
          replique('Suis les lanternes. Elles savent le chemin.'),
        ],
      },
      {
        nom: 'caverne',
        repliques: [
          replique('La caverne. Les pointes n’ont jamais pardonné.'),
        ],
      },
      {
        nom: 'fin',
        repliques: [
          replique('Le fond du Gouffre. La lumière y dormait.'),
          replique('Merci d’être descendu la réveiller.'),
        ],
      },
    ],
    musiques: [
      musique('descente', {
        tempo: 96,
        voies: [
          voie(['la2', '-', 'do3', '-', 'mi3', '-', 'do3', '-',
            'fa2', '-', 'la2', '-', 'do3', '-', 'la2', '-'], { volume: 0.4 }),
          voie(['la1', '-', '-', '-', 'fa1', '-', '-', '-',
            'sol1', '-', '-', '-', 'mi1', '-', '-', '-'], { volume: 0.32 }),
        ],
      }),
      musique('victoire', {
        tempo: 132,
        boucle: false,
        voies: [voie(['do4', 'mi4', 'sol4', 'do5', '-', '-', 'sol4', 'do5', '-', '-'], { volume: 0.45 })],
      }),
    ],
  }
  return p
}
