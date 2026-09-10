import { espece, type Espece } from '../runtime/entites.ts'
import { clipRegulier, type Clip } from '../runtime/animation.ts'
import {
  GELEE, CHAUVE_SOURIS, TAILLADE, COEUR_PLEIN, BALISE,
  TOURELLE_REPOS, TOURELLE_ANTICIPE, TOURELLE_TIRE, LARME,
  DALLE_MOBILE, CAISSE_INDEX,
} from './art-creatures.ts'
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
  /**
   * Le meme heros, mais qui meurt d'un coup.
   *
   * C'est le contrat de Celeste, et il tient a DEUX chiffres qui vont
   * ensemble : un point de vie, et une reapparition presque immediate. Une
   * pointe qui tue net dans un jeu ou l'on remarche trente secondes est
   * insupportable ; la meme pointe dans un jeu ou l'on repart en un tiers de
   * seconde est ce qui rend un chapitre difficile jouable.
   *
   * Et l'invulnerabilite tombe a zero : elle n'a plus de sens. Elle sert a
   * survivre a un coup de trop quand on a plusieurs points de vie ; avec un
   * seul, elle ne ferait que retarder une mort deja decidee.
   */
  espece('heros-ascension', {
    nom: 'Héros (tableaux)',
    planche: 'heros',
    clip: 'marche-cote',
    camp: 'heros',
    pv: 1,
    vitesse: 0,
    degats: 0,
    comportement: 'plateformeur',
    boite: { x: -4, y: -14, l: 8, h: 14 },
    invulnerabiliteMs: 0,
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
    // On lui saute dessus. C'est le verbe le plus universel du genre, et il
    // vaut ici deux points de vie : la gelee en a deux, donc un pietinement
    // suffit. Un ennemi qu'on doit pietiner deux fois apprend au joueur a
    // rester en l'air au-dessus d'une chose qui bouge, ce qui est un mauvais
    // reflexe.
    degatsPietinement: 2,
    rebondPietinement: 30,
    // Elle tombe, dans un monde qui a un bas. La chauve-souris juste en
    // dessous ne le fait pas : c'est le seul mot qui les separe.
    pesante: true,
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
  espece('tourelle', {
    nom: 'Tourelle',
    clip: 'tourelle-repos',
    pv: 3,
    vitesse: 0,
    // Elle ne blesse pas au contact : c'est son TIR qui blesse. Une tourelle
    // qui fait mal quand on la touche punit deux fois pour un seul defaut.
    degats: 0,
    vigilance: 150,
    comportement: 'immobile',
    boite: { x: -6, y: -14, l: 12, h: 14 },
    etatInitial: 'guet',
    // Guet, anticipation, tir, repos. Les quatre temps d'un ennemi lisible :
    // sans l'anticipation, le tir est imparable et l'on n'apprend rien.
    etats: [
      {
        nom: 'guet',
        clip: 'tourelle-repos',
        intention: 'immobile',
        duree: 0,
        suivant: 'guet',
        siProche: { distance: 150, vers: 'anticipe' },
      },
      {
        nom: 'anticipe',
        clip: 'tourelle-anticipe',
        intention: 'immobile',
        duree: 420,
        suivant: 'tire',
      },
      {
        nom: 'tire',
        clip: 'tourelle-tire',
        intention: 'immobile',
        duree: 300,
        suivant: 'repos',
        // Le declencheur se pose sur un EVENEMENT du clip. Changer la duree
        // d'un dessin ne decale donc pas le tir.
        declencheurs: [{ evenement: 'tir', tir: { espece: 'larme', vitesse: 130 } }],
      },
      {
        nom: 'repos',
        clip: 'tourelle-repos',
        intention: 'immobile',
        duree: 900,
        suivant: 'guet',
      },
    ],
  }),
  espece('larme', {
    nom: 'Larme',
    clip: 'larme',
    pv: 1,
    vitesse: 130,
    degats: 1,
    comportement: 'projectile',
    // Elle finit par tomber : un tir qui ne rencontre rien traverserait
    // l'etage entier et continuerait de blesser deux salles plus loin.
    duree: 1600,
    boite: { x: -3, y: -11, l: 6, h: 6 },
    invulnerabiliteMs: 0,
  }),
  espece('balise', {
    nom: 'Balise de reprise',
    clip: 'balise',
    camp: 'neutre',
    pv: 9999,
    vitesse: 0,
    degats: 0,
    reprise: true,
    comportement: 'immobile',
    boite: { x: -6, y: -16, l: 12, h: 16 },
  }),
  espece('plateforme-mobile', {
    nom: 'Plateforme mobile',
    clip: 'dalle',
    camp: 'decor',
    pv: 9999,
    vitesse: 0,
    degats: 0,
    // « porteur » : elle ne decide de rien, son mouvement appartient a la passe
    // des corps mobiles, qui tourne avant que quiconque ne decide ou il va.
    comportement: 'porteur',
    // 1 : solide. Une dalle pleine, qu'on ne traverse pas par en dessous.
    matiereCorps: 1,
    // Un aller-retour de trois cases en une seconde et demie, avec une demi-
    // seconde d'arret a chaque bout. L'arret n'est pas decoratif : c'est lui
    // qui donne au joueur le temps de monter.
    trajet: { dx: 48, dy: 0, duree: 1500, pause: 500 },
    // La boite EST la dalle qu'on voit : seize de large, six de haut, posee au
    // bas de la case comme le dessin.
    boite: { x: -8, y: -6, l: 16, h: 6 },
    invulnerabiliteMs: 0,
  }),
  espece('ascenseur', {
    nom: 'Ascenseur',
    clip: 'dalle',
    camp: 'decor',
    pv: 9999,
    vitesse: 0,
    degats: 0,
    comportement: 'porteur',
    matiereCorps: 1,
    trajet: { dx: 0, dy: -64, duree: 2000, pause: 700 },
    boite: { x: -8, y: -6, l: 16, h: 6 },
    invulnerabiliteMs: 0,
  }),
  espece('caisse', {
    nom: 'Caisse',
    clip: 'caisse',
    camp: 'decor',
    pv: 9999,
    vitesse: 0,
    degats: 0,
    comportement: 'porteur',
    matiereCorps: 1,
    // Pas de trajet : elle ne bouge pas. Un obstacle mobile immobile n'est pas
    // une contradiction — c'est un mur qu'on pose a la souris, hors de la
    // grille, et qu'un script pourra pousser un jour.
    boite: { x: -7, y: -14, l: 14, h: 14 },
    invulnerabiliteMs: 0,
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
    // La balise clignote doucement : allumee, eteinte, allumee. Un point de
    // reprise immobile se confond avec le decor.
    clipRegulier('balise', BALISE, 520, { boucle: 'aller-retour' }),
    clipRegulier('tourelle-repos', [TOURELLE_REPOS], 1000),
    clipRegulier('tourelle-anticipe', [TOURELLE_ANTICIPE], 1000),
    // Deux images, et l'evenement sur la SECONDE : un evenement pose sur la
    // premiere ne se declenche jamais, puisqu'on y arrive en demarrant le clip
    // et non en le faisant avancer.
    // « unique » et non « boucle » : un geste qui ne se fait qu'une fois doit
    // avoir une animation qui ne se rejoue pas. En boucle, l'evenement repasse
    // et la tourelle tirait deux fois par cycle — une salve qu'on n'avait pas
    // demandee, et qu'on aurait fini par prendre pour une intention.
    clipRegulier('tourelle-tire', [TOURELLE_ANTICIPE, TOURELLE_TIRE], 90, {
      boucle: 'unique',
      evenements: [{ image: 1, nom: 'tir' }],
    }),
    clipRegulier('larme', [LARME], 1000),
    clipRegulier('dalle', [DALLE_MOBILE], 1000),
    clipRegulier('caisse', [CAISSE_INDEX], 1000),
  ]
}
