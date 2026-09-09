import { Carte, VIDE } from '../tuiles/tilemap.ts'
import { creerNoeud, type Noeud, type NoeudSprite, type NoeudCorps } from '../scene/noeud.ts'
import type { Vue } from '../runtime/ecran.ts'
import type { Jeu, ContexteJeu } from '../runtime/jeu.ts'
import { atlasDepuisLettres, couleursDe } from '../runtime/atlas.ts'
import {
  type Projection, ORTHO_DESSUS, ORTHO_COTE, ISO, deprojeter,
} from '../noyau/projection.ts'
import { Plateformeur, REGLAGES_DEFAUT, lireEntrees } from '../runtime/plateforme.ts'
import {
  TUILE, CLE_DONJON, CLE_HEROS, PLANCHE_DONJON, PLANCHE_HEROS,
  DIR_BAS, DIR_HAUT, DIR_DROITE, DIR_GAUCHE,
} from './art.ts'
import { CLE_CAVERNE, PLANCHE_CAVERNE, TUILE_FOND, TUILE_LANTERNE } from './art-cote.ts'
import {
  CLE_ISO, PLANCHE_ISO, LARGEUR_ISO, HAUTEUR_ISO, HAUTEUR_DESSIN_ISO,
  ISO_SOL, ISO_HERBE, ISO_EAU, ISO_MUR, ISO_CAISSE, ISO_SORTIE,
} from './art-iso.ts'
import { construireDonjon } from './donjon.ts'

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
  /** Tuile posee par le pinceau quand le calque n'a pas de terrain. */
  readonly tuilePinceau: number
  /** Branche planches et scripts sur un jeu. */
  installer(jeu: Jeu): void
  /** Remet le monde a son depart, quand on arrete de jouer. */
  reinitialiser(): void
  /** Ce que la barre d'etat montre pendant la partie. */
  etat(): string
}

/* ------------------------------------------------------------------ */
/* 1. Le donjon : vu de dessus, orthogonal                             */
/* ------------------------------------------------------------------ */

const VITESSE_DESSUS = 70

/**
 * Le script du heros vu de dessus.
 *
 * Il est ecrit une seule fois et sert AUSSI a la citadelle isometrique : la
 * seule difference est que la direction demandee au clavier y est d'abord
 * ramenee dans le monde orthogonal. Sans cette conversion, appuyer sur
 * « droite » dans une vue isometrique deplace en diagonale a l'ecran — le
 * defaut qui rend injouable la moitie des jeux isometriques amateurs.
 */
function scriptDessus(p: Projection, tuile: number, vitesse: number) {
  return (c: ContexteJeu, n: Noeud): void => {
    const sprite = n as NoeudSprite
    const corps = n.enfants.find((e) => e.type === 'corps') as NoeudCorps | undefined
    if (!corps) return

    const a = c.entrees.axe()
    if (a.x || a.y) {
      // La direction du clavier est celle de l'ECRAN. On la ramene dans le
      // monde, puis on la normalise : sans cela on avance 1,41 fois plus vite
      // en biais, ce qui est le defaut le plus repandu des jeux vus de dessus.
      const d = deprojeter(p, a.x, a.y, tuile)
      const norme = Math.hypot(d.x, d.y) || 1
      c.bouger(corps, (d.x / norme) * vitesse * c.dt, (d.y / norme) * vitesse * c.dt)

      // La direction verticale l'emporte : de dos ou de face se lit mieux
      // qu'un profil, et en diagonale on veut voir le visage.
      if (a.y > 0) sprite.image = DIR_BAS
      else if (a.y < 0) sprite.image = DIR_HAUT
      else sprite.image = a.x > 0 ? DIR_DROITE : DIR_GAUCHE
      sprite.miroir = sprite.image === DIR_GAUCHE
      if (sprite.image === DIR_GAUCHE) sprite.image = DIR_DROITE
    }
  }
}

export function mondeDonjon(): Monde {
  const d = construireDonjon()
  const projection = ORTHO_DESSUS(TUILE)
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
    couleurs: [...couleursDe(CLE_DONJON), ...couleursDe(CLE_HEROS)],
    tuilePinceau: 0,
    installer(jeu) {
      jeu.cartes.set('salle', { carte: d.carte, atlas: atlasDepuisLettres(PLANCHE_DONJON, CLE_DONJON, TUILE, 8) })
      jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, 4))
      jeu.scripts.set('heros', scriptDessus(projection, TUILE, VITESSE_DESSUS))
      jeu.suivreNoeud('heros')
      jeu.margeCamera = { x: 32, y: 20 }
    },
    reinitialiser() {
      d.heros.x = d.depart.x
      d.heros.y = d.depart.y
      d.heros.image = DIR_BAS
      d.heros.miroir = false
    },
    etat: () => 'vue de dessus · tri par y',
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
  '#....L..............###...................#',
  '#...####################################..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#......................................#..#',
  '#............................##........#..#',
  '#......................................#..#',
  '#..@..............###.....................#',
  '############...#########..#################',
  '############...#########..#################',
  '###########################################',
  '###########################################',
]

export function mondeCaverne(): Monde {
  const largeur = PLAN_CAVERNE[0].length
  const hauteur = PLAN_CAVERNE.length
  const carte = new Carte(largeur, hauteur, TUILE)
  const fond = carte.ajouterCalque('fond', { presence: new Uint8Array(largeur * hauteur) })
  const roche = carte.ajouterCalque('roche', {
    terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: true },
  })

  let depart = { x: TUILE, y: TUILE }
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const c = PLAN_CAVERNE[y][x]
      const i = carte.index(x, y)
      fond.cases[i] = c === 'L' ? TUILE_LANTERNE : TUILE_FOND
      if (fond.presence) fond.presence[i] = 1
      if (c === '#') {
        if (roche.presence) roche.presence[i] = 1
        carte.solides[i] = 1
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
  heros.image = DIR_DROITE
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

  const controleur = new Plateformeur()
  const projection = ORTHO_COTE(TUILE)
  let dernier = controleur.diagnostic()

  return {
    id: 'caverne',
    nom: 'Caverne — vue de côté',
    aide: 'Flèches pour courir, Espace pour sauter, Maj pour le dash. Le puits de droite se remonte en sautant d’une paroi à l’autre.',
    vue: { largeur: 320, hauteur: 180 },
    projection,
    carte,
    racine,
    heros,
    depart,
    couleurs: [...couleursDe(CLE_CAVERNE), ...couleursDe(CLE_HEROS)],
    tuilePinceau: TUILE_FOND,
    installer(jeu) {
      jeu.cartes.set('caverne', { carte, atlas: atlasDepuisLettres(PLANCHE_CAVERNE, CLE_CAVERNE, TUILE, 8) })
      jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, 4))
      jeu.suivreNoeud('heros')
      // Une marge morte plus haute que large : en courant on veut voir loin
      // devant, en tombant on veut voir arriver le sol. C'est le reglage de
      // camera qui distingue le plus un jeu de plateforme d'une vue de dessus.
      jeu.margeCamera = { x: 24, y: 34 }
      jeu.scripts.set('heros', (c, n) => {
        const sprite = n as NoeudSprite
        const e = lireEntrees(c.entrees)
        // Le controleur ne connait ni la scene ni les noeuds : il recoit une
        // grille solide et un corps. C'est ce qui permet de l'eprouver au banc
        // sans navigateur, et de le reutiliser tel quel dans un export.
        const boite = { x: corps.boiteX, y: corps.boiteY, l: corps.boiteL, h: corps.boiteH }
        const mobile = { x: sprite.x, y: sprite.y, boite }
        controleur.avancer(carte, mobile, c.dt, e.dirX, e.sauteDemande, e.sauteTenu, e.dash, e.dirY)
        sprite.x = mobile.x
        sprite.y = mobile.y
        if (e.dirX) sprite.miroir = e.dirX < 0
        sprite.image = DIR_DROITE
        dernier = controleur.diagnostic()
      })
    },
    reinitialiser() {
      heros.x = depart.x
      heros.y = depart.y
      heros.miroir = false
      controleur.reinitialiser()
      dernier = controleur.diagnostic()
    },
    etat: () =>
      `${dernier.etat} · vx ${Math.round(dernier.vx)} · vy ${Math.round(dernier.vy)}`
      + `${dernier.coinCorrige ? ' · coin corrigé' : ''}`,
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
    couleurs: [...couleursDe(CLE_ISO), ...couleursDe(CLE_HEROS)],
    tuilePinceau: ISO_MUR,
    installer(jeu) {
      jeu.cartes.set('citadelle', {
        carte,
        atlas: atlasDepuisLettres(PLANCHE_ISO, CLE_ISO, LARGEUR_ISO, 6, HAUTEUR_DESSIN_ISO),
      })
      jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, 4))
      jeu.scripts.set('heros', scriptDessus(projection, TUILE, VITESSE_DESSUS))
      jeu.suivreNoeud('heros')
      jeu.margeCamera = { x: 40, y: 24 }
    },
    reinitialiser() {
      heros.x = depart.x
      heros.y = depart.y
      heros.image = DIR_BAS
      heros.miroir = false
    },
    etat: () => 'isométrique · tri par cx + cy, tuiles et personnages mêlés',
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

export const MONDES: { id: string; nom: string; construire: () => Monde }[] = [
  { id: 'donjon', nom: 'Donjon (dessus)', construire: mondeDonjon },
  { id: 'caverne', nom: 'Caverne (côté)', construire: mondeCaverne },
  { id: 'citadelle', nom: 'Citadelle (iso)', construire: mondeCitadelle },
]
