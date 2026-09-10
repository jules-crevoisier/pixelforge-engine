import type { Carte } from '../tuiles/tilemap.ts'
import { VIDE, matiereEnCaractere, caractereEnMatiere } from '../tuiles/tilemap.ts'
import type { Noeud } from '../scene/noeud.ts'
import type { Palette } from '../noyau/palette.ts'
import { versHex } from '../noyau/palette.ts'
import type { Clip } from '../runtime/animation.ts'
import type { Projection } from '../noyau/projection.ts'
import type { Espece } from '../runtime/entites.ts'
import type { Son } from '../runtime/son.ts'
import type { Replique } from '../runtime/dialogue.ts'
import type { Musique } from '../runtime/musique.ts'
import type { Salle } from '../niveau/salles.ts'
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
 * **10** — les salles. Un chapitre a la Celeste n'est pas une grande carte
 * qu'on parcourt : c'est une suite de TABLEAUX poses a la main, de tailles
 * differentes, dont la forme dit ou la camera s'arrete, ou l'on reapparait et
 * quand on change d'ecran. Le moteur savait deja verrouiller la camera sur
 * une grille reguliere — le decoupage d'Isaac, qui convient a des salles
 * engendrees. Une grille ne peut pas exprimer un couloir de deux ecrans de
 * large et d'un demi de haut, et l'on ne peut donc pas faire un Celeste avec.
 * Un fichier sans salles se relit : le monde reste continu, comme avant.
 *
 * **9** — la parallaxe et la repetition des calques. Un fond qui defile
 * moins vite que le sol donne la profondeur, et il ne sert a rien sans la
 * repetition : a mi-vitesse, il couvre deux fois moins de monde, et le vide
 * apparait au bord de la carte des qu'on s'eloigne. Les deux vont ensemble
 * ou ne vont pas. Un fichier d'avant se relit : un calque sans parallaxe vaut
 * un, et un calque sans repetition ne se repete pas — ce que faisaient tous
 * les calques jusqu'ici.
 *
 * **8** — les demi-pentes, et la reparation de l'ecriture des matieres. La
 * grille de collision s'ecrivait en base trente-six, avec une borne a
 * trente-cinq « pour que rien ne casse en silence » : une pente montant a
 * GAUCHE vaut soixante-quatre, sortait « z », et se relisait en mur. Toute
 * colline tournee vers la gauche se rouvrait fausse. L'alphabet passe a
 * soixante-deux caracteres, une case tient toujours en UN, et les
 * trente-deux premieres valeurs ne bougent pas — un fichier d'avant se relit
 * sans migration. Les caracteres 32 et au-dela designent desormais une FORME
 * de pente et non une somme de drapeaux : « w » valait une pente montant a
 * droite et la vaut toujours, les suivants changent de sens. Les six
 * chargeurs lisent la meme table, et un banc verifie qu'ils repondent tous
 * la meme chose, colonne par colonne.
 *
 * **7** — les musiques, les textes traduits et le plan de touches. Meme regle
 * que la version 6, appliquee a ce qui restait dehors : ce qui n'est pas dans
 * le fichier n'existe pas.
 *
 * **6** — les sons et les dialogues. Ils existaient, ils marchaient, et ils
 * n'etaient PAS dans le fichier : un projet enregistre se rouvrait muet, et un
 * export ne contenait pas un octet de son. C'est exactement la faute que la
 * version 3 avait corrigee pour les dessins, refaite pour le son — et elle
 * s'est glissee sans que rien ne la signale, parce qu'aucune verification ne
 * demandait « et cela traverse-t-il l'enregistrement ». La regle vaut pour
 * tout ce qu'un jeu contient, sans exception : ce qui n'est pas dans le
 * fichier n'existe pas.
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
 * fichier decrivait une carte de tuiles sans dire a quoi ces tuiles
 * ressemblent : il n'etait lisible que par le programme qui l'avait ecrit, et
 * qui gardait les dessins dans son propre code. Sans la projection, un projet
 * isometrique se rouvrait orthogonal — la carte etait juste, et tout etait
 * dessine de travers. Un projet doit se suffire a lui-meme, sinon
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
export const VERSION_FORMAT = 10

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
  /**
   * Les sons, decrits en donnees. Voir `runtime/son.ts`.
   *
   * Six nombres par son, pas un fichier d'onde : c'est ce qui permet a un
   * projet de tenir dans un seul fichier lisible, et a un diff de montrer
   * qu'une frequence a change.
   */
  sons: Son[]
  /**
   * Les suites de repliques, par nom.
   *
   * Le texte d'un jeu est du CONTENU, au meme titre qu'une carte. Le laisser
   * dans le code oblige a recompiler pour corriger une faute d'orthographe, et
   * interdit toute traduction.
   */
  dialogues: { nom: string; repliques: Replique[] }[]
  /**
   * Le plan de touches : action vers codes de touches.
   *
   * Il est dans le fichier pour la meme raison que le reste : un joueur
   * gaucher, une personne qui ne peut pas atteindre la barre d'espace, un
   * clavier qui n'est pas azerty. Un plan fige dans le code rend le jeu
   * injouable pour une partie des gens, en silence.
   */
  touches: Record<string, string[]>
  /** Les musiques, en notes. Voir `runtime/musique.ts`. */
  musiques: Musique[]
  /**
   * Le decoupage du niveau en salles, en CASES.
   *
   * Vide : le monde est continu et la camera suit le heros dans toute la
   * carte. C'est ce que faisaient tous les projets avant la version 10.
   */
  salles: Salle[]
  /**
   * Les textes du jeu, par langue puis par clef.
   *
   * Une clef et non le texte francais comme index : le francais changera, et
   * l'on ne veut pas que corriger une virgule invalide toutes les traductions.
   * La langue vide est la langue d'origine.
   */
  textes: Record<string, Record<string, string>>
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
    /**
     * De combien ce calque suit la camera, par axe. Un : comme le monde.
     * Un demi : deux fois moins vite, donc plus loin. Zero : un ciel fixe.
     */
    parallaxe?: { x: number; y: number }
    /** Le calque se repete-t-il indefiniment ? Voir `parallaxe`. */
    repete?: boolean
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
    // Sans separateur, une case doit tenir en UN caractere : ecrire « 16 » en
    // decimal decalerait toute la rangee d'un cran. C'est le cas du masque de
    // presence, dont les valeurs sont zero ou un.
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
      parallaxe: { x: l.parallaxe.x, y: l.parallaxe.y },
      repete: l.repete,
    })),
    // Les matieres passent par LEUR ecriture, celle de `tuiles/tilemap.ts`, et
    // non par la base trente-six d'a cote. Les deux ont diverge : la seconde
    // bornait a trente-cinq, si bien qu'une pente montant a gauche —
    // soixante-quatre — sortait « z » et se relisait en mur. Une valeur, un
    // seul endroit qui sait l'ecrire.
    solides: Array.from({ length: c.hauteur }, (_, y) =>
      Array.from({ length: c.largeur }, (_, x) =>
        matiereEnCaractere(c.solides[y * c.largeur + x])).join('')),
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
  sons: Son[] = [],
  dialogues: { nom: string; repliques: Replique[] }[] = [],
  touches: Record<string, string[]> = {},
  musiques: Musique[] = [],
  textes: Record<string, Record<string, string>> = {},
  salles: Salle[] = [],
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
    sons: sons.map((q) => ({ ...q })),
    dialogues: dialogues.map((d) => ({
      nom: d.nom,
      repliques: d.repliques.map((r) => ({ ...r, choix: r.choix.map((c) => ({ ...c })) })),
    })),
    touches: Object.fromEntries(Object.entries(touches).map(([a, k]) => [a, [...k]])),
    musiques: musiques.map((m) => ({
      ...m, voies: m.voies.map((v) => ({ ...v, timbre: { ...v.timbre }, notes: [...v.notes] })),
    })),
    textes: Object.fromEntries(
      Object.entries(textes).map(([l, t]) => [l, { ...t }]),
    ),
    salles: salles.map((s) => ({
      ...s, reprise: s.reprise ? { ...s.reprise } : null,
    })),
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
      // Un fichier d'avant la version 9 n'a pas ces champs : le calque suit
      // le monde et ne se repete pas, ce que faisaient tous les calques.
      parallaxe: l.parallaxe ? { x: l.parallaxe.x, y: l.parallaxe.y } : { x: 1, y: 1 },
      repete: l.repete ?? false,
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
    [...ligne].forEach((car, x) => {
      if (x < c.largeur) c.solides[c.index(x, y)] = caractereEnMatiere(car)
    })
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
