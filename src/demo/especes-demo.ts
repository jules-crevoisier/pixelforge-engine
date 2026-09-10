import { espece, type Espece } from '../runtime/entites.ts'
import { clipRegulier, type Clip } from '../runtime/animation.ts'
import { GELEE, CHAUVE_SOURIS, TAILLADE, COEUR_PLEIN } from './art-creatures.ts'
import { DIR_BAS, DIR_HAUT, DIR_DROITE, TEMPS_REPOS, TEMPS_MARCHE, imageHeros } from './art.ts'

/**
 * Le catalogue des especes de la demonstration.
 *
 * Tout y est en donnees : la vie, la vitesse, les degats, la boite, et
 * l'intention sous forme de nom. Rien ici n'est du code — c'est ce qui permet
 * a ce catalogue de partir dans le fichier de projet, et a l'editeur d'en
 * proposer la liste sans rien savoir de ce qu'elles font.
 */
export const ESPECES_DEMO: Espece[] = [
  espece('heros', {
    nom: 'Héros (dessus)',
    planche: 'heros',
    // « marche » n'est pas un clip : c'est un PREFIXE. Avec `clipsDiriges`,
    // l'entite joue marche-bas, marche-haut ou marche-cote selon ou elle va,
    // et repos-... quand elle s'arrete.
    clip: 'marche',
    clipsDiriges: true,
    camp: 'heros',
    pv: 5,
    vitesse: 70,
    degats: 0,
    comportement: 'joueur',
    boite: { x: -4, y: -6, l: 8, h: 6 },
    invulnerabiliteMs: 600,
  }),
  espece('heros-cote', {
    nom: 'Héros (côté)',
    planche: 'heros',
    clip: 'marche-cote',
    camp: 'heros',
    pv: 5,
    vitesse: 0,
    degats: 0,
    // Toute la vitesse, le saut, le dash viennent des reglages du controleur :
    // la vitesse de l'espece ne sert pas ici.
    comportement: 'plateformeur',
    boite: { x: -4, y: -14, l: 8, h: 14 },
    invulnerabiliteMs: 600,
  }),
  espece('gelee', {
    nom: 'Gelée',
    clip: 'gelee',
    pv: 2,
    vitesse: 34,
    degats: 1,
    // Elle bondit par a-coups : un poursuivant lent mais continu est plus
    // injuste qu'un poursuivant rapide qu'on peut contourner.
    comportement: 'bond',
    vigilance: 90,
    boite: { x: -5, y: -7, l: 10, h: 7 },
  }),
  espece('chauve-souris', {
    nom: 'Chauve-souris',
    clip: 'chauve-souris',
    pv: 1,
    vitesse: 52,
    degats: 1,
    // Elle fonce, toujours. Une chauve-souris qui hesite n'en est plus une.
    comportement: 'poursuite',
    vigilance: 400,
    boite: { x: -5, y: -12, l: 10, h: 8 },
  }),
  espece('coeur', {
    nom: 'Cœur',
    clip: 'coeur',
    camp: 'neutre',
    pv: 1,
    vitesse: 0,
    degats: 0,
    soigne: 1,
    comportement: 'immobile',
    boite: { x: -5, y: -11, l: 10, h: 10 },
  }),
]

/**
 * Les clips du heros : un repos et une marche par direction.
 *
 * Les evenements « pas » sont poses sur les deux CONTACTS du cycle, ceux ou le
 * pied touche vraiment le sol — rangs 0 et 2. C'est la que va le bruit de pas,
 * la poussiere, la trace. Les poser sur les passages donnerait un bruit de pas
 * au moment ou le pied est en l'air, et personne ne saurait dire pourquoi la
 * marche sonne faux.
 */
export function clipsHeros(): Clip[] {
  const clips: Clip[] = []
  const pas = [{ image: 0, nom: 'pas' }, { image: 2, nom: 'pas' }]
  for (const [nom, dir] of [['bas', DIR_BAS], ['cote', DIR_DROITE], ['haut', DIR_HAUT]] as const) {
    clips.push(clipRegulier(`repos-${nom}`, [imageHeros(dir, TEMPS_REPOS)], 1000))
    clips.push(clipRegulier(`marche-${nom}`, TEMPS_MARCHE.map((t) => imageHeros(dir, t)), 130,
      { evenements: pas }))
  }
  // En l'air, on tient une pose : jambes ecartees a la montee, ramassees a la
  // descente. Deux dessins suffisent a rendre un saut lisible, et une marche
  // qui continue en plein vol est le defaut qui trahit le plus vite un
  // controleur branche a la va-vite.
  clips.push(clipRegulier('saut', [imageHeros(DIR_DROITE, 1)], 1000))
  clips.push(clipRegulier('chute', [imageHeros(DIR_DROITE, 3)], 1000))
  clips.push(clipRegulier('mur', [imageHeros(DIR_DROITE, TEMPS_REPOS)], 1000))
  return clips
}

/**
 * Tous les clips de la demonstration : ceux du heros et ceux des creatures.
 *
 * Un seul jeu de clips pour tout le monde. Les separer obligerait chaque monde
 * a se souvenir de fournir les deux, et le premier oubli donne une entite sans
 * animation — qui se dessine avec la case moins un de sa planche, c'est-a-dire
 * rien du tout.
 */
export function clipsDemo(): Clip[] {
  return [...clipsHeros(), ...clipsCreatures()]
}

/** Les clips que les especes de la demonstration emploient. */
export function clipsCreatures(): Clip[] {
  return [
    // La gelee respire en aller-retour : les quatre temps sont deja un cycle
    // ferme, et le lire en boucle ferait sauter du dernier au premier.
    clipRegulier('gelee', GELEE, 160, { boucle: 'aller-retour' }),
    clipRegulier('chauve-souris', CHAUVE_SOURIS, 110),
    clipRegulier('taillade', TAILLADE, 60, { boucle: 'unique' }),
    clipRegulier('coeur', [COEUR_PLEIN], 1000),
  ]
}
