import type { Carte } from '../tuiles/tilemap.ts'
import { VIDE } from '../tuiles/tilemap.ts'
import type { Noeud } from '../scene/noeud.ts'
import type { Palette } from '../noyau/palette.ts'
import { versHex } from '../noyau/palette.ts'
import type { Clip } from '../runtime/animation.ts'
import type { Projection } from '../noyau/projection.ts'
import type { Espece } from '../runtime/entites.ts'
import { creerNoeud, type TypeNoeud } from '../scene/noeud.ts'

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
 * **5** — les matieres. La grille de collision ne disait qu'un bit : ca bloque
 * ou ca ne bloque pas. Elle porte maintenant des drapeaux — solide,
 * plateforme, blessante, echelle, liquide — et s'ecrit donc en base
 * trente-six, un caractere par case comme avant. Les anciens fichiers, faits
 * de zeros et de uns, se relisent tels quels : zero vaut RIEN et un vaut
 * SOLIDE dans les deux lectures. C'est ce qui permet de monter la version sans
 * ecrire une seule ligne de migration.
 *
 * **4** — les especes. Une carte et une scene disaient OU se trouvent les
 * creatures, jamais ce qu'elles sont : leur vie, leur vitesse et leur
 * intention vivaient dans le code du moteur. Un projet relu redevenait une
 * salle vide. Les especes sont entierement des donnees — l'intention y est un
 * NOM pris dans une liste courte et documentee — et c'est ce qui rend un
 * projet enregistre reellement jouable.
 *
 * **3** — les planches de dessins, et la projection. Sans les planches, un
 * fichier decrivait une carte sans dire a quoi ses tuiles ressemblent ; sans la
 * projection, un projet isometrique se rouvrait orthogonal — la carte etait
 * juste, et tout etait dessine de travers.
 *
 * **3, suite** — les planches de dessins. Sans elles, un fichier de projet decrivait
 * une carte de tuiles sans dire a quoi ces tuiles ressemblent : il n'etait
 * lisible que par le programme qui l'avait ecrit, et qui gardait les dessins
 * dans son propre code. Un projet doit se suffire a lui-meme, sinon
 * l'enregistrer ne sert a rien.
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
export const VERSION_FORMAT = 5

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
  /** Les planches de dessins : ce a quoi ressemblent les tuiles et les sprites. */
  planches: PlancheSerialisee[]
  /** Comment le monde se montre : orthogonal, isometrique, hexagonal. */
  projection: Projection
  /**
   * Le catalogue des especes.
   *
   * Un noeud de la scene qui porte une propriete `espece` designe l'une
   * d'elles ; tout ce qu'elle est — vie, vitesse, degats, boite, intention —
   * se lit ici. L'intention est un nom : un fichier ne peut pas contenir de
   * fonction, et un nom se porte dans les six langages.
   */
  especes: Espece[]
}

/**
 * Une planche de dessins, en texte.
 *
 * ## Pourquoi des lettres et non une image
 *
 * Une planche pourrait s'ecrire en PNG encode en base64 : plus compact, et
 * lisible par n'importe quel outil. Elle serait aussi opaque dans un depot —
 * un diff dirait « l'image a change », et rien de plus.
 *
 * En lettres, une couleur par caractere et le point pour le vide, un diff
 * montre le pixel qui a bouge. Sur un projet ou plusieurs personnes touchent
 * aux memes sprites, c'est la difference entre relire un changement et le
 * croire sur parole. Le prix est un fichier plus gros ; il se compresse tres
 * bien, et un depot compresse ses objets.
 *
 * La cle est portee par la planche et non par le projet : deux planches
 * peuvent employer la meme lettre pour deux couleurs differentes, et les
 * forcer a s'accorder obligerait a repeindre l'une des deux a chaque ajout.
 */
export interface PlancheSerialisee {
  nom: string
  /** Taille d'une case de la planche, en pixels. */
  largeurCase: number
  hauteurCase: number
  /** Cases par rangee. */
  colonnes: number
  /** Lettre -> couleur hexadecimale. Le point est toujours le vide. */
  cle: Record<string, string>
  /** Un dessin par case, une chaine par rangee de pixels. */
  dessins: string[][]
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
  /**
   * Ce que chaque case fait, une ligne par rangee, un caractere par case.
   *
   * En base trente-six, donc lisible : `0` ne fait rien, `1` est solide, `2`
   * est une plateforme, `4` blesse, `5` est une plateforme qui blesse. Un
   * diff montre toujours la case qui a change.
   */
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
  /**
   * L'espece de ce noeud, et l'image qu'il montre.
   *
   * Ces deux-la sont REMONTES a cote des champs communs au lieu de rester dans
   * le sac des proprietes, et ce n'est pas un caprice : ce sont exactement les
   * deux valeurs qu'il faut pour dessiner une entite, et beaucoup de lecteurs
   * ne savent pas lire un dictionnaire libre. `JsonUtility`, celui d'Unity,
   * n'en lit aucun ; une structure Rust non plus, sans travail
   * supplementaire. Les remonter fait que le paquet Unity marche sans qu'on
   * ait a livrer un analyseur JSON complet avec.
   *
   * Ils ne sont PAS dupliques dans les proprietes : deux endroits pour une
   * meme valeur, c'est un jour ou les deux ne disent pas la meme chose.
   */
  espece: string | null
  image: number
  /** Les autres champs propres au type, tels quels. */
  proprietes: Record<string, unknown>
  enfants: NoeudSerialise[]
}

const CHAMPS_COMMUNS = new Set([
  'id', 'nom', 'type', 'x', 'y', 'visible', 'enfants', 'script', 'etat',
  'espece', 'image',
])

export function serialiserNoeud(n: Noeud): NoeudSerialise {
  const proprietes: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(n)) {
    if (CHAMPS_COMMUNS.has(k)) continue
    proprietes[k] = v
  }
  const brut = n as unknown as { espece?: string; image?: number }
  return {
    id: n.id, nom: n.nom, type: n.type, x: n.x, y: n.y, visible: n.visible,
    script: n.script,
    espece: typeof brut.espece === 'string' ? brut.espece : null,
    image: typeof brut.image === 'number' ? brut.image : 0,
    proprietes,
    enfants: n.enfants.map(serialiserNoeud),
  }
}

const ligneDe = (a: ArrayLike<number>, largeur: number, y: number, sep = ','): string => {
  const out: string[] = []
  for (let x = 0; x < largeur; x++) {
    const v = a[y * largeur + x]
    // Sans separateur, une case doit tenir en UN caractere : la base
    // trente-six va jusqu'a trente-cinq, ce qui couvre tous les drapeaux.
    // Ecrire « 16 » en decimal decalerait toute la rangee d'un cran.
    //
    // On BORNE, on ne masque pas. Un « et » binaire avec trente-cinq semble
    // faire la meme chose et n'en fait rien : trente-cinq vaut 100011 en
    // binaire, donc le drapeau quatre en sort a zero. La faute passait
    // inapercue sur les valeurs zero, un et deux — c'est-a-dire sur tout ce
    // qui existait avant les matieres.
    out.push(sep === '' ? Math.min(35, Math.max(0, v)).toString(36) : String(v))
  }
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
  planches: PlancheSerialisee[] = [],
  projection: Projection = {
    mode: 'orthogonale', regard: 'dessus', largeurTuile: 16, hauteurTuile: 16, hauteurBloc: 0,
  },
  especes: Espece[] = [],
): ProjetSerialise {
  return {
    version: VERSION_FORMAT,
    nom,
    vue: { ...vue },
    palette: { nom: palette.nom, couleurs: palette.couleurs.map(versHex) },
    cartes: cartes.map((c) => serialiserCarte(c.nom, c.carte)),
    scenes: scenes.map((s) => ({ nom: s.nom, racine: serialiserNoeud(s.racine) })),
    animations: animations.map(serialiserAnimation),
    planches: planches.map((p) => ({ ...p, cle: { ...p.cle }, dessins: p.dessins.map((d) => [...d]) })),
    projection: { ...projection },
    especes: especes.map((e) => ({ ...e, boite: { ...e.boite }, plateforme: { ...e.plateforme } })),
  }
}

/** Construit la description d'une planche depuis des dessins en lettres. */
export function decrirePlanche(
  nom: string, dessins: string[][], cle: Record<string, string>,
  colonnes: number, largeurCase: number, hauteurCase = largeurCase,
): PlancheSerialisee {
  return { nom, largeurCase, hauteurCase, colonnes, cle: { ...cle }, dessins }
}

/** Le projet en JSON indente : c'est un fichier qu'on relit et qu'on diffe. */
export function versTexte(p: ProjetSerialise): string {
  return `${JSON.stringify(p, null, 2)}\n`
}

/* ------------------------------------------------------------------ */
/* La relecture                                                        */
/* ------------------------------------------------------------------ */

const depuisLigne = (l: string, sep: string): number[] =>
  sep === ''
    ? [...l].map((c) => { const n = parseInt(c, 36); return Number.isNaN(n) ? 0 : n })
    : (l === '' ? [] : l.split(sep).map(Number))

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
      // La presence d'un calque SANS terrain doit revenir elle aussi. Elle ne
      // revenait pas : `ajouterCalque` n'en cree que pour les calques de
      // terrain, et l'on ne lui passait rien. Le fichier l'ecrivait, le
      // lecteur la jetait — une perte silencieuse, c'est-a-dire le pire des
      // defauts, et celui que le commentaire d'a cote dit refuser.
      presence: l.presence ? new Uint8Array(s.largeur * s.hauteur) : null,
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

/**
 * Reconstruit un noeud depuis sa forme serialisee.
 *
 * Les champs propres au type sont recopies tels quels : le format les a ecrits
 * sans les interpreter, on les relit sans les interpreter. Une liste blanche
 * par type serait plus stricte — et il faudrait la tenir a jour a chaque
 * nouveau champ, sous peine de perdre silencieusement des donnees a la
 * relecture. Perdre en silence est le pire des deux defauts.
 */
export function relireNoeud(s: NoeudSerialise): Noeud {
  const n = creerNoeud(s.type as TypeNoeud, s.nom)
  n.x = s.x
  n.y = s.y
  n.visible = s.visible
  n.script = s.script
  Object.assign(n, s.proprietes)
  if (s.espece) (n as unknown as { espece: string }).espece = s.espece
  if (typeof s.image === 'number') (n as unknown as { image: number }).image = s.image
  n.enfants = (s.enfants ?? []).map(relireNoeud)
  return n
}

/** Vrai si le calque n'a que du vide : utile pour un rapport d'import. */
export function calqueVide(cases: ArrayLike<number>): boolean {
  for (let i = 0; i < cases.length; i++) if (cases[i] !== VIDE) return false
  return true
}
