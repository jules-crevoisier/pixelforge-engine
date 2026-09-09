import type { Carte } from '../tuiles/tilemap.ts'
import { VIDE } from '../tuiles/tilemap.ts'
import type { Noeud } from '../scene/noeud.ts'
import type { Palette } from '../noyau/palette.ts'
import { versHex } from '../noyau/palette.ts'
import type { Clip } from '../runtime/animation.ts'

/**
 * Le format de projet : ce que TOUS les langages liront.
 *
 * ## Les trois regles qui le gouvernent
 *
 * **Du texte.** Un format binaire serait plus petit et illisible dans un diff.
 * Un projet de jeu vit dans un depot ; savoir ce qu'un collegue a change dans
 * une salle vaut plus que quelques kilo-octets.
 *
 * **Rien d'implicite.** Aucune valeur par defaut cachee dans le lecteur : tout
 * ce que le moteur emploie est ecrit. Un chargeur ecrit dans un autre langage
 * ne peut pas deviner ce que le notre suppose, et c'est exactement la que les
 * portages divergent.
 *
 * **Une version.** Elle est ecrite des le premier jour, quand il n'y a rien a
 * migrer. L'ajouter plus tard oblige a traiter « pas de version » comme un cas
 * particulier, pour toujours.
 *
 * ## Les tuiles en texte, et pourquoi
 *
 * Un calque de dix mille cases pourrait s'ecrire en base64 : plus compact,
 * illisible. On l'ecrit en nombres separes par des virgules, une ligne par
 * rangee de la carte. Le fichier est plus gros, il se relit, et un diff montre
 * la rangee qui a change au lieu d'un pate de caracteres.
 *
 * ## L'histoire des versions
 *
 * **2** — les animations. Elles auraient pu etre un champ optionnel, que les
 * anciens chargeurs auraient ignore sans rien casser. On a quand meme monte la
 * version : un chargeur ecrit dans un autre langage doit pouvoir DIRE qu'il ne
 * comprend pas ce qu'on lui donne, et un champ silencieusement absent ne le
 * lui permet pas. C'est la meme raison qui avait fait ecrire une version des
 * le premier jour, quand il n'y avait rien a migrer.
 *
 * **1** — la premiere.
 */
export const VERSION_FORMAT = 2

export interface ProjetSerialise {
  version: number
  nom: string
  /** Resolution virtuelle du jeu. */
  vue: { largeur: number; hauteur: number }
  /** Palette du projet, en hexadecimal. */
  palette: { nom: string; couleurs: string[] }
  cartes: CarteSerialisee[]
  scenes: SceneSerialisee[]
  /** Les clips d'animation du projet, partages par tous les sprites. */
  animations: AnimationSerialisee[]
}

/**
 * Un clip, tel qu'il traverse la frontiere des langages.
 *
 * Les durees sont en millisecondes — voir `runtime/animation.ts`. Les
 * evenements designent le RANG de l'image dans le clip et non son index de
 * planche : le meme dessin peut revenir deux fois dans un cycle, et poser
 * l'evenement sur l'index le declencherait aux deux passages.
 */
export interface AnimationSerialisee {
  nom: string
  boucle: string
  suite: string | null
  images: { index: number; duree: number; decalageX: number; decalageY: number }[]
  evenements: { image: number; nom: string }[]
}

export function serialiserAnimation(c: Clip): AnimationSerialisee {
  return {
    nom: c.nom,
    boucle: c.boucle,
    suite: c.suite,
    images: c.images.map((i) => ({
      index: i.index,
      duree: i.duree,
      // Rien d'implicite : un decalage absent serait un defaut cache dans le
      // lecteur, et chaque port en choisirait un different.
      decalageX: i.decalageX ?? 0,
      decalageY: i.decalageY ?? 0,
    })),
    evenements: c.evenements.map((e) => ({ ...e })),
  }
}

export interface CarteSerialisee {
  nom: string
  largeur: number
  hauteur: number
  tuile: number
  calques: {
    nom: string
    visible: boolean
    devant: boolean
    /** Une ligne de texte par rangee, index separes par des virgules. */
    cases: string[]
    terrain: { tuileDepart: number; jeu: string; dehorsEstPlein: boolean } | null
    presence: string[] | null
  }[]
  /** Grille de collision, une ligne par rangee, en 0 et 1 colles. */
  solides: string[]
}

export interface SceneSerialisee {
  nom: string
  racine: NoeudSerialise
}

export interface NoeudSerialise {
  id: string
  nom: string
  type: string
  x: number
  y: number
  visible: boolean
  script: string | null
  /** Les champs propres au type, tels quels. */
  proprietes: Record<string, unknown>
  enfants: NoeudSerialise[]
}

const CHAMPS_COMMUNS = new Set(['id', 'nom', 'type', 'x', 'y', 'visible', 'enfants', 'script', 'etat'])

export function serialiserNoeud(n: Noeud): NoeudSerialise {
  const proprietes: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(n)) {
    if (CHAMPS_COMMUNS.has(k)) continue
    proprietes[k] = v
  }
  return {
    id: n.id, nom: n.nom, type: n.type, x: n.x, y: n.y, visible: n.visible,
    script: n.script, proprietes,
    enfants: n.enfants.map(serialiserNoeud),
  }
}

const ligneDe = (a: ArrayLike<number>, largeur: number, y: number, sep = ','): string => {
  const out: string[] = []
  for (let x = 0; x < largeur; x++) out.push(String(a[y * largeur + x]))
  return out.join(sep)
}

export function serialiserCarte(nom: string, c: Carte): CarteSerialisee {
  const lignes = (a: ArrayLike<number>, sep = ','): string[] =>
    Array.from({ length: c.hauteur }, (_, y) => ligneDe(a, c.largeur, y, sep))
  return {
    nom,
    largeur: c.largeur,
    hauteur: c.hauteur,
    tuile: c.tuile,
    calques: c.calques.map((l) => ({
      nom: l.nom,
      visible: l.visible,
      devant: l.devant,
      cases: lignes(l.cases),
      terrain: l.terrain ? { ...l.terrain } : null,
      presence: l.presence ? lignes(l.presence, '') : null,
    })),
    solides: lignes(c.solides, ''),
  }
}

export function serialiserProjet(
  nom: string, vue: { largeur: number; hauteur: number }, palette: Palette,
  cartes: { nom: string; carte: Carte }[], scenes: { nom: string; racine: Noeud }[],
  animations: Clip[] = [],
): ProjetSerialise {
  return {
    version: VERSION_FORMAT,
    nom,
    vue: { ...vue },
    palette: { nom: palette.nom, couleurs: palette.couleurs.map(versHex) },
    cartes: cartes.map((c) => serialiserCarte(c.nom, c.carte)),
    scenes: scenes.map((s) => ({ nom: s.nom, racine: serialiserNoeud(s.racine) })),
    animations: animations.map(serialiserAnimation),
  }
}

/** Le projet en JSON indente : c'est un fichier qu'on relit et qu'on diffe. */
export function versTexte(p: ProjetSerialise): string {
  return `${JSON.stringify(p, null, 2)}\n`
}

/* ------------------------------------------------------------------ */
/* La relecture                                                        */
/* ------------------------------------------------------------------ */

const depuisLigne = (l: string, sep: string): number[] =>
  sep === '' ? [...l].map(Number) : (l === '' ? [] : l.split(sep).map(Number))

export function relireCarte(s: CarteSerialisee, fabrique: (l: number, h: number, t: number) => Carte): Carte {
  const c = fabrique(s.largeur, s.hauteur, s.tuile)
  c.calques = []
  for (const l of s.calques) {
    const calque = c.ajouterCalque(l.nom, {
      visible: l.visible,
      devant: l.devant,
      terrain: l.terrain
        ? { tuileDepart: l.terrain.tuileDepart, jeu: l.terrain.jeu as 'blob47' | 'bord16',
            dehorsEstPlein: l.terrain.dehorsEstPlein }
        : null,
    })
    s.calques.length && l.cases.forEach((ligne, y) => {
      depuisLigne(ligne, ',').forEach((v, x) => { calque.cases[c.index(x, y)] = v })
    })
    if (l.presence && calque.presence) {
      l.presence.forEach((ligne, y) => {
        depuisLigne(ligne, '').forEach((v, x) => { calque.presence![c.index(x, y)] = v })
      })
    }
  }
  s.solides.forEach((ligne, y) => {
    depuisLigne(ligne, '').forEach((v, x) => { c.solides[c.index(x, y)] = v })
  })
  return c
}

/** Vrai si le calque n'a que du vide : utile pour un rapport d'import. */
export function calqueVide(cases: ArrayLike<number>): boolean {
  for (let i = 0; i < cases.length; i++) if (cases[i] !== VIDE) return false
  return true
}
