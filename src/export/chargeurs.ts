import type { ProjetSerialise } from './format.ts'

/**
 * Les chargeurs generes, un par langage.
 *
 * ## Ce que « marche avec tous les langages » veut dire, honnetement
 *
 * Un onglet de navigateur ne peut pas executer du C++ ni du Rust, et pretendre
 * le contraire serait un mensonge. Ce qu'il peut faire, c'est produire des
 * DONNEES que n'importe quel langage lit, et LE CODE POUR LES LIRE.
 *
 * Le chargeur genere n'est pas un moteur : c'est la structure de donnees du
 * projet, ecrite dans la langue de la cible, plus la lecture du JSON. Le
 * gameplay reste ecrit par la personne, dans son langage, avec ses outils. Ce
 * qu'on lui epargne, c'est de retaper a la main la forme de chaque carte et de
 * chaque noeud — et de se tromper d'un index en le faisant.
 *
 * ## Pourquoi generer plutot que fournir une bibliotheque
 *
 * Une bibliotheque par langage, c'est six depots a maintenir, six versions qui
 * se desynchronisent, et six occasions qu'un champ ajoute ici manque la-bas.
 * Un generateur n'a qu'une source : le format. Ajouter un champ le fait
 * apparaitre dans les six chargeurs le jour meme.
 */
export type Cible = 'typescript' | 'csharp' | 'gdscript' | 'rust' | 'lua' | 'python'

export const CIBLES: { id: Cible; nom: string; fichier: string; note: string }[] = [
  { id: 'typescript', nom: 'TypeScript', fichier: 'projet.ts',
    note: 'Types stricts, lecture directe du JSON.' },
  { id: 'csharp', nom: 'C# (Unity)', fichier: 'Projet.cs',
    note: 'Classes serialisables, lisibles par JsonUtility ou System.Text.Json.' },
  { id: 'gdscript', nom: 'GDScript (Godot)', fichier: 'projet.gd',
    note: 'Un RefCounted par structure, charge avec JSON.parse_string.' },
  { id: 'rust', nom: 'Rust', fichier: 'projet.rs',
    note: 'Structures derivant Deserialize, pour serde_json.' },
  { id: 'lua', nom: 'Lua (LÖVE)', fichier: 'projet.lua',
    note: 'Table simple ; le decodage JSON reste a votre charge.' },
  { id: 'python', nom: 'Python', fichier: 'projet.py',
    note: 'Dataclasses, construites depuis json.load.' },
]

const ENTETE = (langue: string, commentaire: string): string =>
  `${commentaire} Genere par PixelForge Engine — ne pas modifier a la main.\n`
  + `${commentaire} Ce fichier decrit la FORME du projet, pas son contenu :\n`
  + `${commentaire} il se regenere quand le format change, et vos donnees ne\n`
  + `${commentaire} bougent pas. Le gameplay reste a vous, en ${langue}.\n\n`

/** Le chargeur, dans la langue demandee. */
export function chargeur(cible: Cible, p: ProjetSerialise): string {
  switch (cible) {
    case 'typescript': return chargeurTypeScript()
    case 'csharp': return chargeurCSharp()
    case 'gdscript': return chargeurGDScript()
    case 'rust': return chargeurRust()
    case 'lua': return chargeurLua(p)
    case 'python': return chargeurPython()
  }
}

function chargeurTypeScript(): string {
  return `${ENTETE('TypeScript', '//')}export interface Calque {
  nom: string
  visible: boolean
  devant: boolean
  /** Une chaine par rangee, index de tuile separes par des virgules. */
  cases: string[]
  terrain: { tuileDepart: number; jeu: string; dehorsEstPlein: boolean } | null
  presence: string[] | null
  /**
   * De combien ce calque suit la camera, par axe.
   *
   * Un pour le monde reel. Un demi pour un fond lointain : il defile deux
   * fois moins vite, et la profondeur apparait. Zero pour un ciel fixe.
   * Absent dans un fichier d'avant la version 9 : c'est alors un.
   */
  parallaxe?: { x: number; y: number }
  /**
   * Le calque se repete-t-il indefiniment ?
   *
   * Sans cela la parallaxe est inutilisable : a mi-vitesse un fond couvre
   * deux fois moins de monde, et le vide apparait au bord de la carte.
   */
  repete?: boolean
}

export interface Carte {
  nom: string
  largeur: number
  hauteur: number
  tuile: number
  calques: Calque[]
  /** Une chaine par rangee, 0 ou 1 colles. */
  solides: string[]
}

export interface Noeud {
  id: string
  nom: string
  type: string
  x: number
  y: number
  visible: boolean
  script: string | null
  /** L'espece de ce noeud, ou null. C'est ce qui fait d'un sprite une entite. */
  espece: string | null
  /** L'image de planche qu'il montre. */
  image: number
  proprietes: Record<string, unknown>
  enfants: Noeud[]
}

export interface ImageAnim {
  index: number
  duree: number
  decalageX: number
  decalageY: number
}

export interface EvenementAnim {
  /** Rang de l'image dans le clip, et non index de planche : un meme dessin
   *  peut revenir deux fois dans un cycle. */
  image: number
  nom: string
}

export interface Clip {
  nom: string
  /** 'boucle', 'unique' ou 'aller-retour'. */
  boucle: string
  suite: string | null
  images: ImageAnim[]
  evenements: EvenementAnim[]
}

/**
 * Une planche de dessins, en lettres : une couleur par caractere, le point
 * pour le vide. C'est ce qui rend un projet lisible dans un diff — et
 * autonome : sans les planches, un fichier decrit une carte sans dire a quoi
 * ses tuiles ressemblent.
 */
export interface Planche {
  nom: string
  largeurCase: number
  hauteurCase: number
  colonnes: number
  cle: Record<string, string>
  dessins: string[][]
}

/**
 * Comment le monde se montre.
 *
 * Le mode vaut 'orthogonale', 'isometrique', 'iso-decalee' ou 'hexagonale' ;
 * le regard vaut 'dessus' ou 'cote'. Les deux sont independants : la meme
 * grille orthogonale sert a un Zelda et a un Mario, et ce qui les separe est
 * le tri en profondeur et la gravite, pas la geometrie.
 */
export interface Projection {
  mode: string
  regard: string
  largeurTuile: number
  hauteurTuile: number
  hauteurBloc: number
}

export interface Boite { x: number; y: number; l: number; h: number }

/**
 * Une espece : ce qu'une entite EST, entierement en donnees.
 *
 * L'intention est un nom — 'immobile', 'patrouille', 'poursuite', 'bond',
 * 'joueur', 'plateformeur'. Un fichier ne peut pas contenir de fonction ; un
 * nom, si. Un noeud de la scene dont les proprietes portent une espece designe
 * l'une d'elles.
 */
export interface Espece {
  id: string
  nom: string
  planche: string
  clip: string
  camp: string
  pv: number
  vitesse: number
  degats: number
  soigne: number
  /** Toucher cette entite deplace le point de reprise. */
  reprise: boolean
  comportement: string
  vigilance: number
  boite: Boite
  ancreX: number
  ancreY: number
  invulnerabiliteMs: number
  clipsDiriges: boolean
  /**
   * Reglages du controleur, pour une espece de comportement 'plateformeur'.
   * Ce qui n'y figure pas garde la valeur par defaut du moteur.
   */
  plateforme: Record<string, number>
  /**
   * Les etats, quand l'espece en a. Un ennemi qui compte ANNONCE son coup :
   * il se ramasse, il frappe, il se decouvre. Ces trois temps sont ce qui rend
   * un combat lisible.
   *
   * Un declencheur se pose sur un EVENEMENT du clip, pas sur un temps : « le
   * coup porte a la troisieme image » ne peut pas s'ecrire en millisecondes.
   */
  etats: EtatEspece[]
  etatInitial: string
  /** Duree de vie, en millisecondes. Zero : elle ne meurt pas d'elle-meme. */
  duree: number
  /**
   * Ce que cette entite oppose aux autres corps : 0 rien, 1 solide,
   * 2 plateforme a sens unique. Ce sont les drapeaux des cases, et ce n'est
   * pas une coincidence : du point de vue de qui se cogne dedans, un obstacle
   * mobile est du decor.
   */
  matiereCorps: number
  /** L'aller-retour d'un corps porteur, en pixels et millisecondes. */
  trajet: { dx: number; dy: number; duree: number; pause: number }
  /** Degats subis quand on lui saute sur la tete. Zero : on ne la pietine pas. */
  degatsPietinement: number
  /** Hauteur du rebond apres pietinement, en pixels. */
  rebondPietinement: number
  /** Elle tombe. Sans effet dans un monde vu de dessus. */
  pesante: boolean
}

export interface Son {
  nom: string
  /** 'carre', 'triangle', 'scie' ou 'bruit'. */
  forme: string
  frequence: number
  frequenceFin: number
  duree: number
  volume: number
  attaque: number
  chute: number
  /** Quantification en demi-tons. Zero : glissando continu. */
  paliers: number
}

export interface Voie {
  /**
   * Le timbre de la voie : un son COMPLET, pose ici et non nomme.
   *
   * Un renvoi vers le catalogue economiserait quelques octets et creerait une
   * reference qui peut pendre : une musique dont le timbre a ete renomme
   * jouerait silencieusement. Le timbre voyage donc avec la voie.
   */
  timbre: Son
  /**
   * Les notes, une par temps. 'la4' est le la 440 ; '.' est un silence ;
   * '-' PROLONGE la note precedente au lieu de la rejouer.
   */
  notes: string[]
  volume: number
}

/**
 * Une musique, ecrite en notes et non en fichier d'onde.
 *
 * Le paquet exporte porte AUSSI le rendu en .wav, pour qui ne veut pas
 * synthetiser. Les deux disent la meme chose ; celle-ci pese cent fois moins.
 */
export interface Musique {
  nom: string
  /** Temps par minute. La duree d'un temps vaut 60000 / tempo. */
  tempo: number
  voies: Voie[]
  boucle: boolean
}

export interface Replique {
  qui: string
  texte: string
  choix: { texte: string; valeur: string }[]
}

export interface EtatEspece {
  nom: string
  clip: string
  intention: string
  duree: number
  suivant: string
  siProche?: { distance: number; vers: string }
  siLoin?: { distance: number; vers: string }
  declencheurs?: {
    evenement: string
    frappe?: { degats: number; portee: number; epaisseur: number; dureeMs: number; poussee: number }
    tir?: { espece: string; vitesse: number; nombre?: number; ecart?: number }
  }[]
}

export interface Projet {
  version: number
  nom: string
  vue: { largeur: number; hauteur: number }
  palette: { nom: string; couleurs: string[] }
  cartes: Carte[]
  scenes: { nom: string; racine: Noeud }[]
  animations: Clip[]
  planches: Planche[]
  projection: Projection
  especes: Espece[]
  /** Les sons, decrits en donnees : six nombres, pas un fichier d'onde. */
  sons: Son[]
  /** Les suites de repliques. Le texte d'un jeu est du contenu, pas du code. */
  dialogues: { nom: string; repliques: Replique[] }[]
  /** Les musiques, en notes. Voir la structure Musique. */
  musiques: Musique[]
  /** Action -> touches. Ce qu'un joueur a remappe voyage avec le projet. */
  touches: Record<string, string[]>
  /**
   * Langue -> clef -> texte. La clef est l'index, PAS la phrase francaise :
   * corriger une faute de frappe en francais ne doit pas orphelinner les
   * onze autres langues.
   */
  textes: Record<string, Record<string, string>>
  /**
   * Le decoupage du niveau en salles, en CASES. Vide : monde continu.
   *
   * La forme d'une salle dit trois choses : ou la camera s'arrete, ou l'on
   * reapparait quand on meurt, et quand on change de tableau.
   */
  salles: Salle[]
  /**
   * Les declencheurs : « a l'entree de ce tableau », « au contact de cette
   * zone », joue ce script. La source du script est du TEXTE : un moteur
   * d'accueil qui ne sait pas l'executer sait au moins dire qu'il y en a un.
   */
  declencheurs: Declencheur[]
}

export interface Declencheur {
  nom: string
  /** « salle » : l'entree d'un tableau. « zone » : le contact d'un rectangle. */
  quand: 'salle' | 'zone'
  salle: string
  /** En cases. A zero quand le « quand » ne s'en sert pas. */
  zone: { x: number; y: number; l: number; h: number }
  /** Le noeud qui doit entrer. Vide : celui que la camera suit. */
  qui: string
  unefois: boolean
  script: string
}

/** Un tableau du niveau, en cases. Voir les fonctions plus bas. */
export interface Salle {
  nom: string
  x: number
  y: number
  largeur: number
  hauteur: number
  /** Ou l'on reapparait. Null : la ou l'on est entre. */
  reprise?: { x: number; y: number } | null
}

/**
 * Case -> coin haut-gauche de son dessin, en pixels.
 *
 * C'est la fonction que tout moteur d'accueil doit avoir juste, et celle ou
 * les portages divergent. En isometrique, la transformation donne le SOMMET du
 * losange ; on rend le coin de sa boite, une demi-largeur a gauche. Rendre le
 * sommet fait pointer l'editeur sur une case pendant que le jeu en dessine une
 * autre.
 */
export function caseVersMonde(p: Projection, cx: number, cy: number): { x: number; y: number } {
  const l = p.largeurTuile
  const h = p.hauteurTuile
  switch (p.mode) {
    case 'isometrique':
      return { x: (cx - cy) * (l / 2) - l / 2, y: (cx + cy) * (h / 2) }
    case 'iso-decalee':
      return { x: cx * l + (cy % 2 ? l / 2 : 0), y: cy * (h / 2) }
    case 'hexagonale':
      return { x: cx * Math.floor(l * 0.75), y: cy * h + (cx % 2 ? Math.floor(h / 2) : 0) }
    default:
      return { x: cx * l, y: cy * h }
  }
}

/** Une case vide. Zero est une vraie tuile : ne pas les confondre. */
export const VIDE = -1

export function chargerProjet(texte: string): Projet {
  return JSON.parse(texte) as Projet
}

/** Deplie un calque en tableau plat, indexe par y * largeur + x. */
export function deplierCases(c: Carte, calque: Calque): Int32Array {
  const out = new Int32Array(c.largeur * c.hauteur)
  calque.cases.forEach((ligne, y) => {
    const vals = ligne.length ? ligne.split(',') : []
    for (let x = 0; x < vals.length; x++) out[y * c.largeur + x] = Number(vals[x])
  })
  return out
}

/**
 * Les matieres, en drapeaux.
 *
 * SOLIDE, PLATEFORME, BLESSANTE, ECHELLE et LIQUIDE se combinent librement.
 * Les pentes sont a part : une pente n'est jamais solide — marquee solide,
 * elle bloque comme un mur et l'on se cogne dans le bas de la cote au lieu de
 * la monter.
 */
export const SOLIDE = 1
export const PLATEFORME = 2
export const BLESSANTE = 4
export const ECHELLE = 8
export const LIQUIDE = 16
export const PENTE_DROITE = 32
export const PENTE_GAUCHE = 64
/** Deux cases pour monter d'une, au lieu d'une seule. */
export const PENTE_DEMI = 128
/** Parmi les deux cases d'une demi-pente, celle du haut. */
export const PENTE_HAUTE = 256

/**
 * L'alphabet d'une case de collision : un caractere, une matiere.
 *
 * Les trente-deux premieres valeurs sont les cinq matieres combinees, ecrites
 * comme en base trente-six. A partir de trente-deux, le caractere designe une
 * FORME de pente, avec ou sans « blessante » — une rampe herissee de pointes
 * existe, les autres combinaisons n'ont pas de sens sur une pente.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const FORMES_PENTE = [
  PENTE_DROITE,
  PENTE_GAUCHE,
  PENTE_DROITE | PENTE_DEMI,
  PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
  PENTE_GAUCHE | PENTE_DEMI,
  PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
]
const BASE_PENTE = 32

/** Les drapeaux d'un caractere de la grille. Dehors : SOLIDE. */
export function matiereDeCase(c: Carte, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= c.largeur || cy >= c.hauteur) return SOLIDE
  const ligne = c.solides[cy]
  if (!ligne || cx >= ligne.length) return SOLIDE
  const v = ALPHABET.indexOf(ligne[cx]!)
  if (v < 0) return 0
  if (v < BASE_PENTE) return v
  const rang = v - BASE_PENTE
  const forme = FORMES_PENTE[rang % FORMES_PENTE.length]
  if (forme === undefined) return 0
  return forme | (rang >= FORMES_PENTE.length ? BLESSANTE : 0)
}

/**
 * Vrai si la case bloque le passage.
 *
 * On teste le DRAPEAU, pas le caractere. Comparer a « 1 » — ce que faisait ce
 * chargeur — rendait faux pour un mur herisse de pointes, qui vaut cinq :
 * le mur devenait traversable dans le jeu porte, et nulle part ailleurs.
 */
export function estSolide(c: Carte, cx: number, cy: number): boolean {
  return (matiereDeCase(c, cx, cy) & SOLIDE) !== 0
}

/**
 * La hauteur du sol dans une case, pour une colonne de pixels.
 *
 * Comptee depuis le HAUT de la case : zero veut dire « le sol est au sommet
 * de la case », la taille d'une tuile veut dire « il n'y a pas de sol ici ».
 * C'est la fonction qu'un moteur d'accueil doit avoir juste pour que les
 * pentes se marchent, et celle ou deux portages divergent d'un pixel sans que
 * personne ne sache lequel a tort.
 */
export function hauteurSol(matiere: number, x: number, tuile: number): number {
  const versDroite = (matiere & PENTE_DROITE) !== 0
  if (!versDroite && (matiere & PENTE_GAUCHE) === 0) {
    return (matiere & SOLIDE) !== 0 ? 0 : tuile
  }
  // L'avancee LE LONG de la montee : on lit la case a l'envers quand elle
  // monte vers la gauche, ce qui evite d'ecrire deux fois la meme formule.
  const u = versDroite ? x : tuile - 1 - x
  const demi = (matiere & PENTE_DEMI) !== 0
  const depart = demi && (matiere & PENTE_HAUTE) !== 0 ? (tuile >> 1) - 1 : tuile - 1
  return depart - (demi ? u >> 1 : u)
}

/** Un plan de la collision, un octet de drapeaux par case. */
export function deplierSolides(c: Carte): Uint8Array {
  const out = new Uint8Array(c.largeur * c.hauteur)
  for (let y = 0; y < c.hauteur; y++) {
    for (let x = 0; x < c.largeur; x++) out[y * c.largeur + x] = matiereDeCase(c, x, y)
  }
  return out
}

/**
 * L'ordre de lecture d'un clip.
 *
 * L'aller-retour ne repete PAS ses extremites : quatre dessins donnent
 * 1 2 3 4 3 2, six pas et non huit. Les repeter ferait tenir la premiere et la
 * derniere pose deux fois plus longtemps que les autres.
 */
export function ordreDeLecture(c: Clip): number[] {
  const n = c.images.length
  const ordre = c.images.map((_, i) => i)
  if (c.boucle !== 'aller-retour' || n <= 2) return ordre
  for (let i = n - 2; i >= 1; i--) ordre.push(i)
  return ordre
}

/** Duree d'un tour de clip, en millisecondes. */
export function dureeDeClip(c: Clip): number {
  return ordreDeLecture(c).reduce((s, i) => s + Math.max(1, c.images[i].duree), 0)
}

/**
 * L'image de planche a dessiner apres ms millisecondes.
 *
 * Sans etat : c'est ce qui permet a ce portage de rendre exactement la meme
 * image que le moteur, et au banc de le verifier d'un langage a l'autre.
 */
export function imageA(c: Clip, ms: number): number {
  const ordre = ordreDeLecture(c)
  if (ordre.length === 0) return VIDE
  const dernier = c.images[ordre[ordre.length - 1]].index
  const total = dureeDeClip(c)
  let t = ms < 0 ? 0 : ms
  if (c.boucle === 'unique') {
    if (t >= total) return dernier
  } else {
    t %= total
  }
  for (const rang of ordre) {
    const d = Math.max(1, c.images[rang].duree)
    if (t < d) return c.images[rang].index
    t -= d
  }
  return dernier
}

export function clipNomme(p: Projet, nom: string): Clip | null {
  return p.animations.find((a) => a.nom === nom) ?? null
}

export function plancheNommee(p: Projet, nom: string): Planche | null {
  return p.planches.find((t) => t.nom === nom) ?? null
}

export function especeNommee(p: Projet, id: string): Espece | null {
  return p.especes.find((e) => e.id === id) ?? null
}

/** L'espece d'un noeud de la scene, s'il en porte une. */
export function especeDuNoeud(p: Projet, n: Noeud): Espece | null {
  return n.espece ? especeNommee(p, n.espece) : null
}

/**
 * Le decalage a l'ecran d'un calque, pour une position de camera.
 *
 * C'est LA fonction qu'un moteur d'accueil doit avoir juste pour que la
 * parallaxe ressemble a quelque chose. On ARRONDIT ici, et pas plus tard : un
 * calque a 0,4 de parallaxe tomberait sur 12,4 pixels, le moteur
 * l'echantillonnerait entre deux pixels, et l'on aurait un fond flou au
 * milieu d'un jeu net — le pire defaut qu'un rendu pixel puisse avoir.
 */
export function decalageCalque(c: Calque, camX: number, camY: number): { x: number; y: number } {
  const fx = c.parallaxe?.x ?? 1
  const fy = c.parallaxe?.y ?? 1
  return { x: Math.round(camX * fx), y: Math.round(camY * fy) }
}

/**
 * La case a lire, pour un calque qui se repete ou non.
 *
 * Rend null en dehors d'un calque ordinaire ; ramene dans la carte pour un
 * calque repete, ou la case -3 vaut la case largeur-3.
 */
export function caseDeCalque(
  c: Calque, carte: Carte, cx: number, cy: number,
): { x: number; y: number } | null {
  if (!c.repete) {
    if (cx < 0 || cy < 0 || cx >= carte.largeur || cy >= carte.hauteur) return null
    return { x: cx, y: cy }
  }
  return {
    x: ((cx % carte.largeur) + carte.largeur) % carte.largeur,
    y: ((cy % carte.hauteur) + carte.hauteur) % carte.hauteur,
  }
}

/** Les bornes d'une salle en pixels du monde. */
export function bornesDeSalle(
  s: Salle, tuile: number,
): { x: number; y: number; l: number; h: number } {
  return { x: s.x * tuile, y: s.y * tuile, l: s.largeur * tuile, h: s.hauteur * tuile }
}

/**
 * La salle qui contient ce point du monde, ou null.
 *
 * C'est la fonction dont depend tout le reste : la camera s'y borne, la mort
 * y renvoie, et le changement de tableau s'en deduit. Deux salles qui se
 * chevauchent la rendent ambigue — l'ordre de la liste tranche, donc rien.
 */
export function salleEn(p: Projet, tuile: number, x: number, y: number): Salle | null {
  for (const s of p.salles ?? []) {
    const b = bornesDeSalle(s, tuile)
    if (x >= b.x && y >= b.y && x < b.x + b.l && y < b.y + b.h) return s
  }
  return null
}

export function musiqueNommee(p: Projet, nom: string): Musique | null {
  return p.musiques.find((m) => m.nom === nom) ?? null
}

/** Les declencheurs qui tirent a l'entree de ce tableau, dans l'ordre. */
export function declencheursDeSalle(p: Projet, salle: string): Declencheur[] {
  return (p.declencheurs ?? []).filter((d) => d.quand === 'salle' && d.salle === salle)
}

/** Les declencheurs de zone dont le rectangle contient ce point du monde. */
export function declencheursEn(p: Projet, tuile: number, x: number, y: number): Declencheur[] {
  const cx = Math.floor(x / tuile)
  const cy = Math.floor(y / tuile)
  return (p.declencheurs ?? []).filter((d) => d.quand === 'zone'
    && cx >= d.zone.x && cx < d.zone.x + d.zone.l
    && cy >= d.zone.y && cy < d.zone.y + d.zone.h)
}

/** La duree d'un temps, en millisecondes. */
export function dureeTemps(m: Musique): number {
  return 60000 / Math.max(1, m.tempo)
}

/** La duree de la musique entiere : sa voie la plus longue. */
export function dureeDeMusique(m: Musique): number {
  const temps = m.voies.reduce((n, v) => Math.max(n, v.notes.length), 0)
  return temps * dureeTemps(m)
}

const DEMI_TONS: Record<string, number> = {
  do: 0, 'do#': 1, re: 2, 're#': 3, mi: 4, fa: 5, 'fa#': 6,
  sol: 7, 'sol#': 8, la: 9, 'la#': 10, si: 11,
}

/**
 * 'la4' -> 440. Un silence ou une note inconnue rend zero.
 *
 * La note s'ecrit en solfege latin parce que le reste du format l'est ; un
 * moteur d'accueil qui prefere A4 n'a qu'a traduire ici, en un seul endroit.
 */
export function frequenceDe(note: string): number {
  const m = /^([a-z]+#?)(-?\\d+)$/.exec(note.trim().toLowerCase())
  if (!m) return 0
  const demi = DEMI_TONS[m[1]!]
  if (demi === undefined) return 0
  const octave = Number(m[2])
  return 440 * Math.pow(2, (demi - 9) / 12 + (octave - 4))
}

/**
 * Le texte d'une clef, dans une langue.
 *
 * Une clef absente rend LA CLEF, jamais une chaine vide : un texte manquant
 * doit se voir a l'ecran pendant le developpement, pas laisser un trou muet
 * que personne ne remarque avant la sortie.
 */
export function texteDe(
  p: Projet, clef: string, langue: string,
  valeurs: Record<string, string | number> = {},
): string {
  const brut = p.textes[langue]?.[clef] ?? clef
  return brut.replace(/\\{(\\w+)\\}/g, (t, k: string) =>
    k in valeurs ? String(valeurs[k]) : t)
}

/** Les clefs que la langue demandee n'a pas et que la reference a. */
export function trousDeLangue(p: Projet, langue: string, reference = 'fr'): string[] {
  const cible = p.textes[langue] ?? {}
  return Object.keys(p.textes[reference] ?? {}).filter((c) => !(c in cible)).sort()
}

/**
 * La couleur d'un pixel d'une case de planche, ou null pour le vide.
 *
 * C'est le seul acces dont un moteur d'accueil a besoin : a partir de la il
 * peint dans sa propre texture, avec ses propres outils.
 */
export function pixelDePlanche(
  t: Planche, index: number, x: number, y: number,
): string | null {
  const d = t.dessins[index]
  if (!d) return null
  const ligne = d[y]
  if (!ligne) return null
  const c = ligne[x]
  if (!c || c === '.') return null
  return t.cle[c] ?? null
}
`
}

function chargeurCSharp(): string {
  return `${ENTETE('C#', '//')}using System;
using System.Collections.Generic;

namespace PixelForge
{
    [Serializable]
    public class Calque
    {
        public string nom;
        public bool visible;
        public bool devant;
        /// <summary>Une chaine par rangee, index separes par des virgules.</summary>
        public List<string> cases;
        public Terrain terrain;
        public List<string> presence;
        /// <summary>
        /// De combien ce calque suit la camera, par axe. Un : comme le monde.
        /// Un demi : deux fois moins vite, donc plus loin. Zero : un ciel fixe.
        /// </summary>
        public Parallaxe parallaxe;
        /// <summary>Le calque se repete-t-il indefiniment ? Voir parallaxe.</summary>
        public bool repete;

        /// <summary>
        /// Le decalage a l'ecran de ce calque. On ARRONDIT ici : un calque a
        /// 0,4 de parallaxe tomberait entre deux pixels, et l'on aurait un
        /// fond flou au milieu d'un jeu net.
        /// </summary>
        public void Decalage(float camX, float camY, out int dx, out int dy)
        {
            float fx = parallaxe != null ? parallaxe.x : 1f;
            float fy = parallaxe != null ? parallaxe.y : 1f;
            dx = (int)Math.Round(camX * fx);
            dy = (int)Math.Round(camY * fy);
        }
    }

    /// <summary>Un tableau du niveau, en cases.</summary>
    [Serializable]
    public class Salle
    {
        public string nom;
        public int x;
        public int y;
        public int largeur;
        public int hauteur;
        /// <summary>Ou l'on reapparait. Null : la ou l'on est entre.</summary>
        public Point reprise;

        /// <summary>Les bornes de la salle en pixels du monde.</summary>
        public void Bornes(int tuile, out int bx, out int by, out int bl, out int bh)
        {
            bx = x * tuile; by = y * tuile; bl = largeur * tuile; bh = hauteur * tuile;
        }
    }

    [Serializable]
    public class Point
    {
        public float x;
        public float y;
    }

    /// <summary>Un rectangle de cases, pour les declencheurs de zone.</summary>
    [Serializable]
    public class Zone
    {
        public int x;
        public int y;
        public int l;
        public int h;
    }

    /// <summary>
    /// « Quand ceci arrive, joue ce script. » La source du script est du
    /// texte : un moteur qui ne sait pas l'executer sait au moins le dire.
    /// </summary>
    [Serializable]
    public class Declencheur
    {
        public string nom;
        /// <summary>« salle » : l'entree d'un tableau. « zone » : un rectangle.</summary>
        public string quand;
        public string salle;
        /// <summary>En cases. A zero quand le « quand » ne s'en sert pas.</summary>
        public Zone zone;
        /// <summary>Le noeud qui doit entrer. Vide : celui que la camera suit.</summary>
        public string qui;
        public bool unefois;
        public string script;
    }

    /// <summary>Les deux facteurs de parallaxe d'un calque.</summary>
    [Serializable]
    public class Parallaxe
    {
        public float x = 1f;
        public float y = 1f;
    }

    [Serializable]
    public class Terrain
    {
        public int tuileDepart;
        public string jeu;
        public bool dehorsEstPlein;
    }

    [Serializable]
    public class Carte
    {
        public string nom;
        public int largeur;
        public int hauteur;
        public int tuile;
        public List<Calque> calques;
        /// <summary>Une chaine par rangee, 0 ou 1 colles.</summary>
        public List<string> solides;

        /// <summary>Deplie un calque en tableau plat, indexe par y * largeur + x.</summary>
        public int[] DeplierCases(Calque calque)
        {
            var sortie = new int[largeur * hauteur];
            for (int y = 0; y < calque.cases.Count; y++)
            {
                var ligne = calque.cases[y];
                if (ligne.Length == 0) continue;
                var parts = ligne.Split(',');
                for (int x = 0; x < parts.Length; x++)
                    sortie[y * largeur + x] = int.Parse(parts[x]);
            }
            return sortie;
        }

        /// <summary>
        /// Les drapeaux d'une case de collision. Dehors : SOLIDE.
        ///
        /// Un caractere, une matiere. Les trente-deux premieres valeurs sont
        /// les cinq matieres combinees ; a partir de trente-deux, le
        /// caractere designe une FORME de pente.
        /// </summary>
        public int Matiere(int cx, int cy)
        {
            if (cx < 0 || cy < 0 || cx >= largeur || cy >= hauteur) return Matieres.SOLIDE;
            if (solides == null || cy >= solides.Count) return Matieres.SOLIDE;
            var ligne = solides[cy];
            if (cx >= ligne.Length) return Matieres.SOLIDE;
            return Matieres.DuCaractere(ligne[cx]);
        }

        /// <summary>
        /// Vrai si la case bloque le passage.
        ///
        /// On teste le DRAPEAU, pas le caractere. Comparer a « 1 » rendait
        /// faux pour un mur herisse de pointes, qui vaut cinq : le mur
        /// devenait traversable dans le jeu porte, et nulle part ailleurs.
        /// </summary>
        public bool Solide(int cx, int cy)
        {
            return (Matiere(cx, cy) & Matieres.SOLIDE) != 0;
        }
    }

    /// <summary>Les matieres d'une case, et la lecture des pentes.</summary>
    public static class Matieres
    {
        public const int SOLIDE = 1;
        public const int PLATEFORME = 2;
        public const int BLESSANTE = 4;
        public const int ECHELLE = 8;
        public const int LIQUIDE = 16;
        public const int PENTE_DROITE = 32;
        public const int PENTE_GAUCHE = 64;
        /// <summary>Deux cases pour monter d'une, au lieu d'une seule.</summary>
        public const int PENTE_DEMI = 128;
        /// <summary>Parmi les deux cases d'une demi-pente, celle du haut.</summary>
        public const int PENTE_HAUTE = 256;

        const string ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const int BASE_PENTE = 32;
        static readonly int[] FORMES_PENTE = {
            PENTE_DROITE,
            PENTE_GAUCHE,
            PENTE_DROITE | PENTE_DEMI,
            PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
            PENTE_GAUCHE | PENTE_DEMI,
            PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
        };

        public static int DuCaractere(char c)
        {
            int v = ALPHABET.IndexOf(c);
            if (v < 0) return 0;
            if (v < BASE_PENTE) return v;
            int rang = v - BASE_PENTE;
            int forme = FORMES_PENTE[rang % FORMES_PENTE.Length];
            return forme | (rang >= FORMES_PENTE.Length ? BLESSANTE : 0);
        }

        /// <summary>
        /// La hauteur du sol dans une case, pour une colonne de pixels.
        /// Comptee depuis le HAUT de la case.
        /// </summary>
        public static int HauteurSol(int matiere, int x, int tuile)
        {
            bool versDroite = (matiere & PENTE_DROITE) != 0;
            if (!versDroite && (matiere & PENTE_GAUCHE) == 0)
            {
                return (matiere & SOLIDE) != 0 ? 0 : tuile;
            }
            // L'avancee LE LONG de la montee : on lit la case a l'envers quand
            // elle monte vers la gauche, ce qui evite la meme formule ecrite
            // deux fois — donc corrigee une seule.
            int u = versDroite ? x : tuile - 1 - x;
            bool demi = (matiere & PENTE_DEMI) != 0;
            int depart = demi && (matiere & PENTE_HAUTE) != 0 ? (tuile >> 1) - 1 : tuile - 1;
            return depart - (demi ? u >> 1 : u);
        }
    }

    [Serializable]
    public class Noeud
    {
        public string id;
        public string nom;
        public string type;
        public int x;
        public int y;
        public bool visible;
        public string script;
        /// <summary>L'espece de ce noeud. C'est ce qui fait d'un sprite une entite.</summary>
        public string espece;
        /// <summary>L'image de planche qu'il montre.</summary>
        public int image;
        public List<Noeud> enfants;
    }

    [Serializable]
    public class Scene
    {
        public string nom;
        public Noeud racine;
    }

    [Serializable]
    public class Palette
    {
        public string nom;
        public List<string> couleurs;
    }

    [Serializable]
    public class Vue
    {
        public int largeur;
        public int hauteur;
    }

    [Serializable]
    public class ImageAnim
    {
        public int index;
        /// <summary>Duree d'affichage, en millisecondes.</summary>
        public int duree;
        public int decalageX;
        public int decalageY;
    }

    [Serializable]
    public class EvenementAnim
    {
        /// <summary>Rang de l'image dans le clip, et non index de planche.</summary>
        public int image;
        public string nom;
    }

    [Serializable]
    public class Clip
    {
        public string nom;
        /// <summary>"boucle", "unique" ou "aller-retour".</summary>
        public string boucle;
        public string suite;
        public List<ImageAnim> images;
        public List<EvenementAnim> evenements;

        /// <summary>L'aller-retour ne repete pas ses extremites : 0 1 2 3 2 1.</summary>
        public List<int> OrdreDeLecture()
        {
            var ordre = new List<int>();
            for (int i = 0; i < images.Count; i++) ordre.Add(i);
            if (boucle != "aller-retour" || images.Count <= 2) return ordre;
            for (int i = images.Count - 2; i >= 1; i--) ordre.Add(i);
            return ordre;
        }

        public int Duree()
        {
            int total = 0;
            foreach (var i in OrdreDeLecture()) total += Math.Max(1, images[i].duree);
            return total;
        }

        /// <summary>L'image de planche apres ms millisecondes. Sans etat.</summary>
        public int ImageA(int ms)
        {
            var ordre = OrdreDeLecture();
            if (ordre.Count == 0) return Projet.VIDE;
            int dernier = images[ordre[ordre.Count - 1]].index;
            int total = Duree();
            int t = Math.Max(0, ms);
            if (boucle == "unique")
            {
                if (t >= total) return dernier;
            }
            else
            {
                t %= total;
            }
            foreach (var rang in ordre)
            {
                int d = Math.Max(1, images[rang].duree);
                if (t < d) return images[rang].index;
                t -= d;
            }
            return dernier;
        }
    }

    [Serializable]
    public class Boite
    {
        public float x;
        public float y;
        public float l;
        public float h;
    }

    /// <summary>Ce qu'une entite EST, entierement en donnees. L'intention est un nom.</summary>
    [Serializable]
    public class Espece
    {
        public string id;
        public string nom;
        public string planche;
        public string clip;
        public string camp;
        public int pv;
        public float vitesse;
        public int degats;
        public int soigne;
        /// <summary>Toucher cette entite deplace le point de reprise.</summary>
        public bool reprise;
        public string comportement;
        public float vigilance;
        public Boite boite;
        public int ancreX;
        public int ancreY;
        public int invulnerabiliteMs;
        public bool clipsDiriges;
        public Dictionary<string, float> plateforme;
        public List<EtatEspece> etats;
        public string etatInitial;
        /// <summary>Duree de vie, en millisecondes. Zero : elle ne meurt pas d'elle-meme.</summary>
        public int duree;
        /// <summary>0 rien, 1 solide, 2 plateforme a sens unique.</summary>
        public int matiereCorps;
        public Trajet trajet;
        /// <summary>Degats subis quand on lui saute sur la tete.</summary>
        public int degatsPietinement;
        /// <summary>Hauteur du rebond apres pietinement, en pixels.</summary>
        public int rebondPietinement;
        /// <summary>Elle tombe. Sans effet dans un monde vu de dessus.</summary>
        public bool pesante;
    }

    /// <summary>L'aller-retour d'un corps porteur, en pixels et millisecondes.</summary>
    [Serializable]
    public class Trajet
    {
        public int dx;
        public int dy;
        public int duree;
        public int pause;
    }

    /// <summary>Un etat d'une espece : ce qu'elle fait, et pendant combien de temps.</summary>
    [Serializable]
    public class EtatEspece
    {
        public string nom;
        public string clip;
        public string intention;
        public int duree;
        public string suivant;
    }

    /// <summary>Un son, decrit en donnees.</summary>
    [Serializable]
    public class Son
    {
        public string nom;
        public string forme;
        public float frequence;
        public float frequenceFin;
        public int duree;
        public float volume;
        public int attaque;
        public int chute;
        public int paliers;
    }

    /// <summary>Une voie d'une musique : un timbre et ses notes.</summary>
    [Serializable]
    public class Voie
    {
        /// <summary>
        /// Le timbre de la voie : un son COMPLET, pose ici et non nomme. Un
        /// renvoi vers le catalogue creerait une reference qui peut pendre.
        /// </summary>
        public Son timbre;
        /// <summary>Une note par temps. '.' est un silence, '-' prolonge la precedente.</summary>
        public List<string> notes;
        public float volume;
    }

    /// <summary>Une musique, ecrite en notes et non en fichier d'onde.</summary>
    [Serializable]
    public class Musique
    {
        public string nom;
        /// <summary>Temps par minute. Un temps dure 60000 / tempo millisecondes.</summary>
        public int tempo;
        public List<Voie> voies;
        public bool boucle;

        public float DureeTemps() { return 60000f / Math.Max(1, tempo); }

        /// <summary>La duree totale : la voie la plus longue.</summary>
        public float Duree()
        {
            int temps = 0;
            if (voies != null)
                foreach (var v in voies)
                    if (v.notes != null && v.notes.Count > temps) temps = v.notes.Count;
            return temps * DureeTemps();
        }

        static readonly string[] NOMS =
            { "do", "do#", "re", "re#", "mi", "fa", "fa#", "sol", "sol#", "la", "la#", "si" };

        /// <summary>« la4 » rend 440. Un silence ou une note inconnue rend zero.</summary>
        public static float FrequenceDe(string note)
        {
            if (string.IsNullOrEmpty(note)) return 0f;
            var n = note.Trim().ToLowerInvariant();
            int coupe = n.Length;
            while (coupe > 0 && (char.IsDigit(n[coupe - 1]) || n[coupe - 1] == '-')) coupe--;
            if (coupe == 0 || coupe == n.Length) return 0f;
            var lettres = n.Substring(0, coupe);
            int demi = Array.IndexOf(NOMS, lettres);
            int octave;
            if (demi < 0 || !int.TryParse(n.Substring(coupe), out octave)) return 0f;
            return 440f * (float)Math.Pow(2.0, (demi - 9) / 12.0 + (octave - 4));
        }
    }

    /// <summary>Une replique de dialogue.</summary>
    [Serializable]
    public class Replique
    {
        public string qui;
        public string texte;
    }

    /// <summary>Une suite de repliques, nommee.</summary>
    [Serializable]
    public class Dialogue
    {
        public string nom;
        public List<Replique> repliques;
    }

    /// <summary>Comment le monde se montre. Le mode et le regard sont independants.</summary>
    [Serializable]
    public class Projection
    {
        public string mode;
        public string regard;
        public int largeurTuile;
        public int hauteurTuile;
        public int hauteurBloc;

        /// <summary>Case -> coin haut-gauche de son dessin, en pixels.</summary>
        public void CaseVersMonde(int cx, int cy, out double x, out double y)
        {
            double l = largeurTuile;
            double h = hauteurTuile;
            switch (mode)
            {
                case "isometrique":
                    x = (cx - cy) * (l / 2.0) - l / 2.0;
                    y = (cx + cy) * (h / 2.0);
                    return;
                case "iso-decalee":
                    x = cx * l + (cy % 2 != 0 ? l / 2.0 : 0.0);
                    y = cy * (h / 2.0);
                    return;
                case "hexagonale":
                    x = cx * Math.Floor(l * 0.75);
                    y = cy * h + (cx % 2 != 0 ? Math.Floor(h / 2.0) : 0.0);
                    return;
                default:
                    x = cx * l;
                    y = cy * h;
                    return;
            }
        }
    }

    /// <summary>Une planche de dessins, en lettres : une couleur par caractere.</summary>
    [Serializable]
    public class Planche
    {
        public string nom;
        public int largeurCase;
        public int hauteurCase;
        public int colonnes;
        public Dictionary<string, string> cle;
        public List<List<string>> dessins;

        /// <summary>La couleur d'un pixel, ou null pour le vide.</summary>
        public string Pixel(int index, int x, int y)
        {
            if (dessins == null || index < 0 || index >= dessins.Count) return null;
            var dessin = dessins[index];
            if (y < 0 || y >= dessin.Count) return null;
            var ligne = dessin[y];
            if (x < 0 || x >= ligne.Length || ligne[x] == '.') return null;
            string couleur;
            return cle != null && cle.TryGetValue(ligne[x].ToString(), out couleur) ? couleur : null;
        }
    }

    [Serializable]
    public class Projet
    {
        public int version;
        public string nom;
        public Vue vue;
        public Palette palette;
        public List<Carte> cartes;
        public List<Scene> scenes;
        public List<Clip> animations;
        public List<Planche> planches;
        public Projection projection;
        public List<Espece> especes;
        public List<Son> sons;
        public List<Dialogue> dialogues;
        public List<Musique> musiques;
        /// <summary>Action -> touches. Ce qu'un joueur a remappe voyage avec le projet.</summary>
        public Dictionary<string, List<string>> touches;
        /// <summary>Langue -> clef -> texte. La clef est l'index, pas la phrase.</summary>
        public Dictionary<string, Dictionary<string, string>> textes;
        /// <summary>Le decoupage du niveau en salles, en cases. Vide : monde continu.</summary>
        public List<Salle> salles;
        /// <summary>Les declencheurs du niveau. Vide : rien ne tire.</summary>
        public List<Declencheur> declencheurs;

        /// <summary>Une case vide. Zero est une vraie tuile.</summary>
        public const int VIDE = -1;

        public Clip Clip(string nomClip)
        {
            if (animations == null) return null;
            foreach (var a in animations) if (a.nom == nomClip) return a;
            return null;
        }

        public Planche Planche(string nomPlanche)
        {
            if (planches == null) return null;
            foreach (var t in planches) if (t.nom == nomPlanche) return t;
            return null;
        }

        public Espece Espece(string idEspece)
        {
            if (especes == null) return null;
            foreach (var e in especes) if (e.id == idEspece) return e;
            return null;
        }

        /// <summary>Les declencheurs qui tirent a l'entree de ce tableau.</summary>
        public List<Declencheur> DeclencheursDeSalle(string salle)
        {
            var sortie = new List<Declencheur>();
            if (declencheurs == null) return sortie;
            foreach (var d in declencheurs)
                if (d.quand == "salle" && d.salle == salle) sortie.Add(d);
            return sortie;
        }

        /// <summary>Les declencheurs de zone dont le rectangle contient ce point.</summary>
        public List<Declencheur> DeclencheursEn(int tuile, float x, float y)
        {
            var sortie = new List<Declencheur>();
            if (declencheurs == null) return sortie;
            int cx = (int)Math.Floor(x / tuile);
            int cy = (int)Math.Floor(y / tuile);
            foreach (var d in declencheurs)
            {
                if (d.quand != "zone" || d.zone == null) continue;
                if (cx >= d.zone.x && cx < d.zone.x + d.zone.l
                    && cy >= d.zone.y && cy < d.zone.y + d.zone.h) sortie.Add(d);
            }
            return sortie;
        }

        /// <summary>
        /// La salle qui contient ce point du monde, ou null.
        ///
        /// La camera s'y borne, la mort y renvoie, et le changement de
        /// tableau s'en deduit.
        /// </summary>
        public Salle SalleEn(int tuile, float x, float y)
        {
            if (salles == null) return null;
            foreach (var s in salles)
            {
                if (x >= s.x * tuile && y >= s.y * tuile
                    && x < (s.x + s.largeur) * tuile && y < (s.y + s.hauteur) * tuile) return s;
            }
            return null;
        }

        public Musique Musique(string nomMusique)
        {
            if (musiques == null) return null;
            foreach (var m in musiques) if (m.nom == nomMusique) return m;
            return null;
        }

        /// <summary>
        /// Le texte d'une clef, dans une langue.
        ///
        /// Une clef absente rend LA CLEF, jamais une chaine vide : un texte
        /// manquant doit se voir a l'ecran pendant le developpement.
        /// </summary>
        public string Texte(string clef, string langue)
        {
            Dictionary<string, string> table;
            string valeur;
            if (textes != null && textes.TryGetValue(langue, out table)
                && table != null && table.TryGetValue(clef, out valeur)) return valeur;
            return clef;
        }

        /// <summary>Les clefs que la langue demandee n'a pas et que la reference a.</summary>
        public List<string> TrousDeLangue(string langue, string reference)
        {
            var trous = new List<string>();
            Dictionary<string, string> source;
            if (textes == null || !textes.TryGetValue(reference, out source)) return trous;
            Dictionary<string, string> cible;
            textes.TryGetValue(langue, out cible);
            foreach (var clef in source.Keys)
                if (cible == null || !cible.ContainsKey(clef)) trous.Add(clef);
            trous.Sort(StringComparer.Ordinal);
            return trous;
        }
    }
}
`
}

function chargeurGDScript(): string {
  return `${ENTETE('GDScript', '#')}extends RefCounted
class_name ProjetPixelForge

## Une case vide. Zero est une vraie tuile : ne pas les confondre.
const VIDE := -1

var version: int = 0
var nom: String = ""
var vue: Dictionary = {}
var palette: Dictionary = {}
var cartes: Array = []
var scenes: Array = []
var animations: Array = []
var planches: Array = []
var projection: Dictionary = {}
var especes: Array = []
var sons: Array = []
var dialogues: Array = []
var musiques: Array = []
## Action -> touches. Ce qu'un joueur a remappe voyage avec le projet.
var touches: Dictionary = {}
## Langue -> clef -> texte. La clef est l'index, PAS la phrase francaise.
var textes: Dictionary = {}
## Le decoupage du niveau en salles, en cases. Vide : monde continu.
var salles: Array = []
## Les declencheurs du niveau : « a l'entree de ce tableau », « au contact de
## cette zone », joue ce script. La source du script est du texte.
var declencheurs: Array = []

static func charger(chemin: String) -> ProjetPixelForge:
	var f := FileAccess.open(chemin, FileAccess.READ)
	if f == null:
		push_error("Projet introuvable : %s" % chemin)
		return null
	var brut = JSON.parse_string(f.get_as_text())
	if typeof(brut) != TYPE_DICTIONARY:
		push_error("Projet illisible : %s" % chemin)
		return null
	var p := ProjetPixelForge.new()
	p.version = brut.get("version", 0)
	p.nom = brut.get("nom", "")
	p.vue = brut.get("vue", {})
	p.palette = brut.get("palette", {})
	p.cartes = brut.get("cartes", [])
	p.scenes = brut.get("scenes", [])
	p.animations = brut.get("animations", [])
	p.planches = brut.get("planches", [])
	p.projection = brut.get("projection", {})
	p.especes = brut.get("especes", [])
	p.sons = brut.get("sons", [])
	p.dialogues = brut.get("dialogues", [])
	p.musiques = brut.get("musiques", [])
	p.touches = brut.get("touches", {})
	p.textes = brut.get("textes", {})
	p.salles = brut.get("salles", [])
	p.declencheurs = brut.get("declencheurs", [])
	return p

## Les bornes d'une salle en pixels du monde.
static func bornes_de_salle(s: Dictionary, tuile: int) -> Rect2i:
	return Rect2i(s.get("x", 0) * tuile, s.get("y", 0) * tuile,
		s.get("largeur", 0) * tuile, s.get("hauteur", 0) * tuile)

## La salle qui contient ce point du monde, ou un dictionnaire vide.
##
## La camera s'y borne, la mort y renvoie, et le changement de tableau s'en
## deduit. Deux salles qui se chevauchent la rendent ambigue.
func salle_en(tuile: int, x: float, y: float) -> Dictionary:
	for s in salles:
		var b := bornes_de_salle(s, tuile)
		if b.has_point(Vector2i(int(x), int(y))):
			return s
	return {}

## Les declencheurs qui tirent a l'entree de ce tableau, dans l'ordre.
func declencheurs_de_salle(nom_salle: String) -> Array:
	var sortie: Array = []
	for d in declencheurs:
		if d.get("quand", "") == "salle" and d.get("salle", "") == nom_salle:
			sortie.append(d)
	return sortie

## Les declencheurs de zone dont le rectangle contient ce point du monde.
func declencheurs_en(tuile: int, x: float, y: float) -> Array:
	var sortie: Array = []
	var cx := int(floor(x / tuile))
	var cy := int(floor(y / tuile))
	for d in declencheurs:
		if d.get("quand", "") != "zone":
			continue
		var z: Dictionary = d.get("zone", {})
		if cx >= int(z.get("x", 0)) and cx < int(z.get("x", 0)) + int(z.get("l", 0)) \
				and cy >= int(z.get("y", 0)) and cy < int(z.get("y", 0)) + int(z.get("h", 0)):
			sortie.append(d)
	return sortie

## La musique portant ce nom, ou un dictionnaire vide.
func musique(nom_musique: String) -> Dictionary:
	for m in musiques:
		if m.get("nom", "") == nom_musique:
			return m
	return {}

## La duree d'un temps, en millisecondes.
static func duree_temps(une_musique: Dictionary) -> float:
	return 60000.0 / float(max(1, int(une_musique.get("tempo", 120))))

## La duree de la musique entiere : sa voie la plus longue.
static func duree_de_musique(une_musique: Dictionary) -> float:
	var temps := 0
	for v in une_musique.get("voies", []):
		temps = max(temps, (v.get("notes", []) as Array).size())
	return temps * duree_temps(une_musique)

const NOMS_NOTES := ["do", "do#", "re", "re#", "mi", "fa", "fa#", "sol", "sol#", "la", "la#", "si"]

## « la4 » rend 440. Un silence ou une note inconnue rend zero.
static func frequence_de(note: String) -> float:
	var n := note.strip_edges().to_lower()
	var coupe := n.length()
	while coupe > 0 and (n[coupe - 1].is_valid_int() or n[coupe - 1] == "-"):
		coupe -= 1
	if coupe == 0 or coupe == n.length():
		return 0.0
	var demi := NOMS_NOTES.find(n.substr(0, coupe))
	if demi < 0:
		return 0.0
	var octave := int(n.substr(coupe))
	return 440.0 * pow(2.0, (demi - 9) / 12.0 + (octave - 4))

## Le texte d'une clef, dans une langue.
##
## Une clef absente rend LA CLEF, jamais une chaine vide : un texte manquant
## doit se voir a l'ecran pendant le developpement, pas laisser un trou muet.
func texte(clef: String, langue: String) -> String:
	var table = textes.get(langue, {})
	return table.get(clef, clef)

## Les clefs que la langue demandee n'a pas et que la reference a.
func trous_de_langue(langue: String, reference: String = "fr") -> Array:
	var cible = textes.get(langue, {})
	var trous := []
	for clef in (textes.get(reference, {}) as Dictionary).keys():
		if not cible.has(clef):
			trous.append(clef)
	trous.sort()
	return trous

## L'espece portant cet identifiant, ou un dictionnaire vide.
## L'intention y est un NOM : "immobile", "patrouille", "poursuite", "bond",
## "joueur", "plateformeur". Un fichier ne peut pas porter de fonction.
func espece(id_espece: String) -> Dictionary:
	for e in especes:
		if e.get("id", "") == id_espece:
			return e
	return {}

## Le comportement d'une espece. Une espece sans intention declaree ne bouge
## pas : c'est le seul defaut qui ne surprend personne.
static func comportement_de(une_espece: Dictionary) -> String:
	return une_espece.get("comportement", "immobile")

## L'espece que porte un noeud de la scene, ou un dictionnaire vide.
func espece_du_noeud(noeud: Dictionary) -> Dictionary:
	var id = noeud.get("espece", "")
	return espece(id) if typeof(id) == TYPE_STRING and id != "" else {}

## Le clip portant ce nom, ou un dictionnaire vide.
func clip(nom_clip: String) -> Dictionary:
	for a in animations:
		if a.get("nom", "") == nom_clip:
			return a
	return {}

## La planche portant ce nom, ou un dictionnaire vide.
func planche(nom_planche: String) -> Dictionary:
	for t in planches:
		if t.get("nom", "") == nom_planche:
			return t
	return {}

## Case -> coin haut-gauche de son dessin, en pixels.
## C'est la fonction que tout moteur d'accueil doit avoir juste, et celle ou
## les portages divergent : en isometrique, on rend le coin de la boite du
## losange et non son sommet.
static func case_vers_monde(proj: Dictionary, cx: int, cy: int) -> Vector2:
	var l: float = float(proj.get("largeurTuile", 16))
	var h: float = float(proj.get("hauteurTuile", 16))
	var mode: String = proj.get("mode", "orthogonale")
	if mode == "isometrique":
		return Vector2((cx - cy) * (l / 2.0) - l / 2.0, (cx + cy) * (h / 2.0))
	if mode == "iso-decalee":
		return Vector2(cx * l + (l / 2.0 if cy % 2 != 0 else 0.0), cy * (h / 2.0))
	if mode == "hexagonale":
		return Vector2(cx * floor(l * 0.75), cy * h + (floor(h / 2.0) if cx % 2 != 0 else 0.0))
	return Vector2(cx * l, cy * h)

## La couleur d'un pixel d'une planche, ou une chaine vide pour le vide.
static func pixel_de_planche(planche_: Dictionary, index: int, x: int, y: int) -> String:
	var dessins: Array = planche_.get("dessins", [])
	if index < 0 or index >= dessins.size():
		return ""
	var dessin: Array = dessins[index]
	if y < 0 or y >= dessin.size():
		return ""
	var ligne: String = dessin[y]
	if x < 0 or x >= ligne.length() or ligne[x] == ".":
		return ""
	return planche_.get("cle", {}).get(ligne[x], "")

## Deplie un calque en PackedInt32Array, indexe par y * largeur + x.
## Le decalage a l'ecran d'un calque, pour une position de camera.
##
## On ARRONDIT ici, et pas plus tard : un calque a 0,4 de parallaxe tomberait
## sur 12,4 pixels, Godot l'echantillonnerait entre deux pixels, et l'on aurait
## un fond flou au milieu d'un jeu net — le pire defaut d'un rendu pixel.
static func decalage_calque(calque: Dictionary, cam_x: float, cam_y: float) -> Vector2i:
	var p: Dictionary = calque.get("parallaxe", {})
	return Vector2i(roundi(cam_x * p.get("x", 1.0)), roundi(cam_y * p.get("y", 1.0)))

## La case a lire, pour un calque qui se repete ou non. Rend Vector2i(-1, -1)
## en dehors d'un calque ordinaire.
static func case_de_calque(calque: Dictionary, carte: Dictionary, cx: int, cy: int) -> Vector2i:
	var largeur: int = carte.get("largeur", 0)
	var hauteur: int = carte.get("hauteur", 0)
	if not calque.get("repete", false):
		if cx < 0 or cy < 0 or cx >= largeur or cy >= hauteur:
			return Vector2i(-1, -1)
		return Vector2i(cx, cy)
	return Vector2i(posmod(cx, largeur), posmod(cy, hauteur))

static func deplier_cases(carte: Dictionary, calque: Dictionary) -> PackedInt32Array:
	var largeur: int = carte.get("largeur", 0)
	var hauteur: int = carte.get("hauteur", 0)
	var sortie := PackedInt32Array()
	sortie.resize(largeur * hauteur)
	var lignes: Array = calque.get("cases", [])
	for y in range(min(lignes.size(), hauteur)):
		var ligne: String = lignes[y]
		if ligne.is_empty():
			continue
		var parts := ligne.split(",")
		for x in range(min(parts.size(), largeur)):
			sortie[y * largeur + x] = int(parts[x])
	return sortie

const SOLIDE := 1
const PLATEFORME := 2
const BLESSANTE := 4
const ECHELLE := 8
const LIQUIDE := 16
const PENTE_DROITE := 32
const PENTE_GAUCHE := 64
## Deux cases pour monter d'une, au lieu d'une seule.
const PENTE_DEMI := 128
## Parmi les deux cases d'une demi-pente, celle du haut.
const PENTE_HAUTE := 256

const ALPHABET_MATIERE := "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const BASE_PENTE := 32
const FORMES_PENTE := [
	PENTE_DROITE,
	PENTE_GAUCHE,
	PENTE_DROITE | PENTE_DEMI,
	PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
	PENTE_GAUCHE | PENTE_DEMI,
	PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
]

## Les drapeaux d'une case de collision. Dehors : SOLIDE.
static func matiere_de_case(carte: Dictionary, cx: int, cy: int) -> int:
	var largeur: int = carte.get("largeur", 0)
	var hauteur: int = carte.get("hauteur", 0)
	if cx < 0 or cy < 0 or cx >= largeur or cy >= hauteur:
		return SOLIDE
	var lignes: Array = carte.get("solides", [])
	if cy >= lignes.size():
		return SOLIDE
	var ligne: String = lignes[cy]
	if cx >= ligne.length():
		return SOLIDE
	var v := ALPHABET_MATIERE.find(ligne[cx])
	if v < 0:
		return 0
	if v < BASE_PENTE:
		return v
	var rang := v - BASE_PENTE
	var forme: int = FORMES_PENTE[rang % FORMES_PENTE.size()]
	return forme | (BLESSANTE if rang >= FORMES_PENTE.size() else 0)

## Vrai si la case bloque le passage.
##
## On teste le DRAPEAU, pas le caractere. Comparer a « 1 » rendait faux pour un
## mur herisse de pointes, qui vaut cinq : le mur devenait traversable dans le
## jeu porte, et nulle part ailleurs.
static func est_solide(carte: Dictionary, cx: int, cy: int) -> bool:
	return (matiere_de_case(carte, cx, cy) & SOLIDE) != 0

## La hauteur du sol dans une case, pour une colonne de pixels. Comptee depuis
## le HAUT : zero veut dire « au sommet de la case », la taille d'une tuile
## veut dire « pas de sol ici ».
static func hauteur_sol(matiere: int, x: int, tuile: int) -> int:
	var vers_droite := (matiere & PENTE_DROITE) != 0
	if not vers_droite and (matiere & PENTE_GAUCHE) == 0:
		return 0 if (matiere & SOLIDE) != 0 else tuile
	# L'avancee LE LONG de la montee : on lit la case a l'envers quand elle
	# monte vers la gauche, ce qui evite d'ecrire deux fois la meme formule.
	var u := x if vers_droite else tuile - 1 - x
	var demi := (matiere & PENTE_DEMI) != 0
	var depart := (tuile >> 1) - 1 if demi and (matiere & PENTE_HAUTE) != 0 else tuile - 1
	return depart - ((u >> 1) if demi else u)

## L'ordre de lecture d'un clip.
## L'aller-retour ne repete PAS ses extremites : 0 1 2 3 2 1, six pas et non
## huit. Les repeter ferait tenir les deux bouts deux fois plus longtemps.
static func ordre_de_lecture(clip: Dictionary) -> Array:
	var images: Array = clip.get("images", [])
	var n := images.size()
	var ordre := []
	for i in range(n):
		ordre.append(i)
	if clip.get("boucle", "boucle") != "aller-retour" or n <= 2:
		return ordre
	for i in range(n - 2, 0, -1):
		ordre.append(i)
	return ordre

## Duree d'un tour de clip, en millisecondes.
static func duree_de_clip(clip: Dictionary) -> int:
	var images: Array = clip.get("images", [])
	var total := 0
	for i in ordre_de_lecture(clip):
		total += max(1, int(images[i].get("duree", 1)))
	return total

## L'image de planche apres ms millisecondes. Sans etat.
static func image_a(clip: Dictionary, ms: int) -> int:
	var images: Array = clip.get("images", [])
	var ordre := ordre_de_lecture(clip)
	if ordre.is_empty():
		return VIDE
	var dernier := int(images[ordre[ordre.size() - 1]].get("index", VIDE))
	var total := duree_de_clip(clip)
	var t: int = max(0, ms)
	if clip.get("boucle", "boucle") == "unique":
		if t >= total:
			return dernier
	else:
		t = t % total
	for rang in ordre:
		var d: int = max(1, int(images[rang].get("duree", 1)))
		if t < d:
			return int(images[rang].get("index", VIDE))
		t -= d
	return dernier
`
}

function chargeurRust(): string {
  return `${ENTETE('Rust', '//')}use serde::Deserialize;

/// Une case vide. Zero est une vraie tuile : ne pas les confondre.
pub const VIDE: i32 = -1;

// Le renommage n'est pas une coquetterie : le format ecrit tuileDepart en
// camel, et Rust nomme ses champs en serpent. Sans lui, serde cherche un champ
// tuile_depart qui n'existe nulle part dans le fichier, et le chargement
// echoue a la premiere carte qui porte un terrain.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Terrain {
    pub tuile_depart: i32,
    pub jeu: String,
    pub dehors_est_plein: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Calque {
    pub nom: String,
    pub visible: bool,
    pub devant: bool,
    /// Une chaine par rangee, index separes par des virgules.
    pub cases: Vec<String>,
    pub terrain: Option<Terrain>,
    pub presence: Option<Vec<String>>,
    /// De combien ce calque suit la camera, par axe. Un : comme le monde.
    /// Un demi : deux fois moins vite, donc plus loin. Zero : un ciel fixe.
    #[serde(default)]
    pub parallaxe: Option<Parallaxe>,
    /// Le calque se repete-t-il indefiniment ? Sans cela la parallaxe laisse
    /// le vide apparaitre au bord de la carte.
    #[serde(default)]
    pub repete: bool,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Parallaxe {
    pub x: f64,
    pub y: f64,
}

impl Calque {
    /// Le decalage a l'ecran de ce calque, arrondi au pixel.
    ///
    /// On arrondit ICI et pas plus tard : un calque a 0,4 de parallaxe
    /// tomberait entre deux pixels, et l'on aurait un fond flou au milieu
    /// d'un jeu net.
    pub fn decalage(&self, cam_x: f64, cam_y: f64) -> (i32, i32) {
        let (fx, fy) = match self.parallaxe {
            Some(p) => (p.x, p.y),
            None => (1.0, 1.0),
        };
        ((cam_x * fx).round() as i32, (cam_y * fy).round() as i32)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Carte {
    pub nom: String,
    pub largeur: i32,
    pub hauteur: i32,
    pub tuile: i32,
    pub calques: Vec<Calque>,
    /// Une chaine par rangee, 0 ou 1 colles.
    pub solides: Vec<String>,
}

impl Carte {
    /// Deplie un calque en vecteur plat, indexe par y * largeur + x.
    pub fn deplier_cases(&self, calque: &Calque) -> Vec<i32> {
        let mut sortie = vec![VIDE; (self.largeur * self.hauteur) as usize];
        for (y, ligne) in calque.cases.iter().enumerate() {
            if ligne.is_empty() {
                continue;
            }
            for (x, v) in ligne.split(',').enumerate() {
                if x < self.largeur as usize {
                    sortie[y * self.largeur as usize + x] = v.parse().unwrap_or(VIDE);
                }
            }
        }
        sortie
    }

    /// Les drapeaux d'une case de collision. Dehors : SOLIDE.
    pub fn matiere(&self, cx: i32, cy: i32) -> i32 {
        if cx < 0 || cy < 0 || cx >= self.largeur || cy >= self.hauteur {
            return SOLIDE;
        }
        match self
            .solides
            .get(cy as usize)
            .and_then(|l| l.chars().nth(cx as usize))
        {
            Some(c) => matiere_du_caractere(c),
            None => SOLIDE,
        }
    }

    /// Vrai si la case bloque le passage.
    ///
    /// On teste le DRAPEAU, pas le caractere. Comparer au chiffre un rendait
    /// faux pour un mur herisse de pointes, qui vaut cinq : le mur devenait
    /// traversable dans le jeu porte, et nulle part ailleurs.
    pub fn est_solide(&self, cx: i32, cy: i32) -> bool {
        self.matiere(cx, cy) & SOLIDE != 0
    }
}

pub const SOLIDE: i32 = 1;
pub const PLATEFORME: i32 = 2;
pub const BLESSANTE: i32 = 4;
pub const ECHELLE: i32 = 8;
pub const LIQUIDE: i32 = 16;
pub const PENTE_DROITE: i32 = 32;
pub const PENTE_GAUCHE: i32 = 64;
/// Deux cases pour monter d'une, au lieu d'une seule.
pub const PENTE_DEMI: i32 = 128;
/// Parmi les deux cases d'une demi-pente, celle du haut.
pub const PENTE_HAUTE: i32 = 256;

const ALPHABET_MATIERE: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE_PENTE: usize = 32;
const FORMES_PENTE: [i32; 6] = [
    PENTE_DROITE,
    PENTE_GAUCHE,
    PENTE_DROITE | PENTE_DEMI,
    PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
    PENTE_GAUCHE | PENTE_DEMI,
    PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
];

/// Un caractere de la grille de collision vers ses drapeaux.
pub fn matiere_du_caractere(c: char) -> i32 {
    let v = match ALPHABET_MATIERE.chars().position(|a| a == c) {
        Some(v) => v,
        None => return 0,
    };
    if v < BASE_PENTE {
        return v as i32;
    }
    let rang = v - BASE_PENTE;
    let forme = FORMES_PENTE[rang % FORMES_PENTE.len()];
    forme | if rang >= FORMES_PENTE.len() { BLESSANTE } else { 0 }
}

/// La hauteur du sol dans une case, pour une colonne de pixels. Comptee depuis
/// le HAUT : zero veut dire « au sommet de la case », la taille d'une tuile
/// veut dire « pas de sol ici ».
pub fn hauteur_sol(matiere: i32, x: i32, tuile: i32) -> i32 {
    let vers_droite = matiere & PENTE_DROITE != 0;
    if !vers_droite && matiere & PENTE_GAUCHE == 0 {
        return if matiere & SOLIDE != 0 { 0 } else { tuile };
    }
    // L'avancee LE LONG de la montee : on lit la case a l'envers quand elle
    // monte vers la gauche, ce qui evite d'ecrire deux fois la meme formule.
    let u = if vers_droite { x } else { tuile - 1 - x };
    let demi = matiere & PENTE_DEMI != 0;
    let depart = if demi && matiere & PENTE_HAUTE != 0 { (tuile >> 1) - 1 } else { tuile - 1 };
    depart - if demi { u >> 1 } else { u }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Noeud {
    pub id: String,
    pub nom: String,
    #[serde(rename = "type")]
    pub type_noeud: String,
    pub x: i32,
    pub y: i32,
    pub visible: bool,
    pub script: Option<String>,
    /// L'espece de ce noeud. C'est ce qui fait d'un sprite une entite.
    pub espece: Option<String>,
    /// L'image de planche qu'il montre.
    pub image: i32,
    pub enfants: Vec<Noeud>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Scene {
    pub nom: String,
    pub racine: Noeud,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Vue {
    pub largeur: i32,
    pub hauteur: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Palette {
    pub nom: String,
    pub couleurs: Vec<String>,
}

/// Une image d'un clip. La duree est en millisecondes.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAnim {
    pub index: i32,
    pub duree: i64,
    pub decalage_x: i32,
    pub decalage_y: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EvenementAnim {
    /// Rang de l'image dans le clip, et non index de planche.
    pub image: usize,
    pub nom: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Clip {
    pub nom: String,
    /// "boucle", "unique" ou "aller-retour".
    pub boucle: String,
    pub suite: Option<String>,
    pub images: Vec<ImageAnim>,
    pub evenements: Vec<EvenementAnim>,
}

impl Clip {
    /// L'aller-retour ne repete pas ses extremites : 0 1 2 3 2 1.
    pub fn ordre_de_lecture(&self) -> Vec<usize> {
        let n = self.images.len();
        let mut ordre: Vec<usize> = (0..n).collect();
        if self.boucle != "aller-retour" || n <= 2 {
            return ordre;
        }
        for i in (1..n - 1).rev() {
            ordre.push(i);
        }
        ordre
    }

    pub fn duree(&self) -> i64 {
        self.ordre_de_lecture()
            .iter()
            .map(|i| self.images[*i].duree.max(1))
            .sum()
    }

    /// L'image de planche apres ms millisecondes. Sans etat.
    pub fn image_a(&self, ms: i64) -> i32 {
        let ordre = self.ordre_de_lecture();
        if ordre.is_empty() {
            return VIDE;
        }
        let dernier = self.images[ordre[ordre.len() - 1]].index;
        let total = self.duree();
        let mut t = ms.max(0);
        if self.boucle == "unique" {
            if t >= total {
                return dernier;
            }
        } else {
            t %= total;
        }
        for rang in ordre {
            let d = self.images[rang].duree.max(1);
            if t < d {
                return self.images[rang].index;
            }
            t -= d;
        }
        dernier
    }
}

/// Une planche de dessins, en lettres : une couleur par caractere, le point
/// pour le vide. C'est ce qui rend un projet autonome et lisible dans un diff.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Planche {
    pub nom: String,
    pub largeur_case: i32,
    pub hauteur_case: i32,
    pub colonnes: i32,
    pub cle: std::collections::HashMap<String, String>,
    pub dessins: Vec<Vec<String>>,
}

impl Planche {
    /// La couleur d'un pixel, ou None pour le vide.
    pub fn pixel(&self, index: usize, x: usize, y: usize) -> Option<&String> {
        let dessin = self.dessins.get(index)?;
        let ligne = dessin.get(y)?;
        let c = ligne.chars().nth(x)?;
        if c == '.' {
            return None;
        }
        self.cle.get(&c.to_string())
    }
}

/// Comment le monde se montre. Le mode et le regard sont independants.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Projection {
    pub mode: String,
    pub regard: String,
    pub largeur_tuile: i32,
    pub hauteur_tuile: i32,
    pub hauteur_bloc: i32,
}

impl Projection {
    /// Case -> coin haut-gauche de son dessin, en pixels.
    pub fn case_vers_monde(&self, cx: i32, cy: i32) -> (f64, f64) {
        let l = self.largeur_tuile as f64;
        let h = self.hauteur_tuile as f64;
        let (cxf, cyf) = (cx as f64, cy as f64);
        match self.mode.as_str() {
            "isometrique" => ((cxf - cyf) * (l / 2.0) - l / 2.0, (cxf + cyf) * (h / 2.0)),
            "iso-decalee" => (
                cxf * l + if cy % 2 != 0 { l / 2.0 } else { 0.0 },
                cyf * (h / 2.0),
            ),
            "hexagonale" => (
                cxf * (l * 0.75).floor(),
                cyf * h + if cx % 2 != 0 { (h / 2.0).floor() } else { 0.0 },
            ),
            _ => (cxf * l, cyf * h),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Boite {
    pub x: f64,
    pub y: f64,
    pub l: f64,
    pub h: f64,
}

/// Ce qu'une entite EST, entierement en donnees. L'intention est un nom :
/// "immobile", "patrouille", "poursuite", "bond", "joueur", "plateformeur".
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Espece {
    pub id: String,
    pub nom: String,
    pub planche: String,
    pub clip: String,
    pub camp: String,
    pub pv: i32,
    pub vitesse: f64,
    pub degats: i32,
    pub soigne: i32,
    /// Toucher cette entite deplace le point de reprise.
    pub reprise: bool,
    pub comportement: String,
    pub vigilance: f64,
    pub boite: Boite,
    pub ancre_x: i32,
    pub ancre_y: i32,
    pub invulnerabilite_ms: i64,
    pub clips_diriges: bool,
    pub plateforme: std::collections::HashMap<String, f64>,
    pub etats: Vec<EtatEspece>,
    pub etat_initial: String,
    /// Duree de vie, en millisecondes. Zero : elle ne meurt pas d'elle-meme.
    pub duree: i64,
    /// 0 rien, 1 solide, 2 plateforme a sens unique.
    #[serde(default)]
    pub matiere_corps: i32,
    #[serde(default)]
    pub trajet: Trajet,
    /// Degats subis quand on lui saute sur la tete.
    #[serde(default)]
    pub degats_pietinement: i32,
    /// Hauteur du rebond apres pietinement, en pixels.
    #[serde(default)]
    pub rebond_pietinement: i32,
    /// Elle tombe. Sans effet dans un monde vu de dessus.
    #[serde(default)]
    pub pesante: bool,
}

/// L'aller-retour d'un corps porteur, en pixels et millisecondes.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Trajet {
    #[serde(default)]
    pub dx: i32,
    #[serde(default)]
    pub dy: i32,
    #[serde(default)]
    pub duree: i64,
    #[serde(default)]
    pub pause: i64,
}

/// Un son, decrit en donnees : six nombres et une forme d'onde.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Son {
    pub nom: String,
    pub forme: String,
    pub frequence: f64,
    pub frequence_fin: f64,
    pub duree: i64,
    pub volume: f64,
    pub attaque: i64,
    pub chute: i64,
    #[serde(default)]
    pub paliers: i32,
}

/// Une voie d'une musique : un timbre du catalogue et ses notes.
///
/// Une note par temps. '.' est un silence ; '-' PROLONGE la note precedente
/// au lieu de la rejouer.
#[derive(Debug, Clone, Deserialize)]
pub struct Voie {
    /// Le timbre de la voie : un son COMPLET, pose ici et non nomme. Un renvoi
    /// vers le catalogue creerait une reference qui peut pendre.
    pub timbre: Son,
    pub notes: Vec<String>,
    pub volume: f64,
}

/// Une musique, ecrite en notes et non en fichier d'onde. Le paquet exporte
/// porte AUSSI son rendu en .wav, pour qui ne veut pas synthetiser.
#[derive(Debug, Clone, Deserialize)]
pub struct Musique {
    pub nom: String,
    /// Temps par minute. Un temps dure 60000 / tempo millisecondes.
    pub tempo: i32,
    pub voies: Vec<Voie>,
    #[serde(default)]
    pub boucle: bool,
}

const NOMS_NOTES: [&str; 12] = [
    "do", "do#", "re", "re#", "mi", "fa", "fa#", "sol", "sol#", "la", "la#", "si",
];

impl Musique {
    /// La duree d'un temps, en millisecondes.
    pub fn duree_temps(&self) -> f64 {
        60000.0 / self.tempo.max(1) as f64
    }

    /// La duree totale : la voie la plus longue.
    pub fn duree(&self) -> f64 {
        let temps = self.voies.iter().map(|v| v.notes.len()).max().unwrap_or(0);
        temps as f64 * self.duree_temps()
    }

    /// « la4 » rend 440. Un silence ou une note inconnue rend zero.
    pub fn frequence_de(note: &str) -> f64 {
        let n = note.trim().to_lowercase();
        let coupe = n
            .char_indices()
            .rev()
            .take_while(|(_, c)| c.is_ascii_digit() || *c == '-')
            .last()
            .map(|(i, _)| i)
            .unwrap_or(n.len());
        if coupe == 0 || coupe == n.len() {
            return 0.0;
        }
        let demi = match NOMS_NOTES.iter().position(|m| *m == &n[..coupe]) {
            Some(d) => d as f64,
            None => return 0.0,
        };
        let octave: f64 = match n[coupe..].parse() {
            Ok(o) => o,
            Err(_) => return 0.0,
        };
        440.0 * 2f64.powf((demi - 9.0) / 12.0 + (octave - 4.0))
    }
}

/// Une replique de dialogue.
#[derive(Debug, Clone, Deserialize)]
pub struct Replique {
    pub qui: String,
    pub texte: String,
}

/// Un etat d'une espece. Un declencheur se pose sur un EVENEMENT du clip et
/// non sur un temps : « le coup porte a la troisieme image » ne peut pas
/// s'ecrire en millisecondes.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EtatEspece {
    pub nom: String,
    pub clip: String,
    pub intention: String,
    pub duree: i64,
    pub suivant: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Projet {
    pub version: i32,
    pub nom: String,
    pub vue: Vue,
    pub palette: Palette,
    pub cartes: Vec<Carte>,
    pub scenes: Vec<Scene>,
    pub animations: Vec<Clip>,
    pub planches: Vec<Planche>,
    pub projection: Projection,
    pub especes: Vec<Espece>,
    #[serde(default)]
    pub sons: Vec<Son>,
    #[serde(default)]
    pub dialogues: Vec<Dialogue>,
    #[serde(default)]
    pub musiques: Vec<Musique>,
    /// Action -> touches. Ce qu'un joueur a remappe voyage avec le projet.
    #[serde(default)]
    pub touches: std::collections::HashMap<String, Vec<String>>,
    /// Langue -> clef -> texte. La clef est l'index, PAS la phrase francaise.
    #[serde(default)]
    pub textes: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    /// Le decoupage du niveau en salles, en cases. Vide : monde continu.
    #[serde(default)]
    pub salles: Vec<Salle>,
    /// Les declencheurs du niveau. Vide : rien ne tire. La source du script
    /// est du texte : un moteur qui ne l'execute pas sait au moins le dire.
    #[serde(default)]
    pub declencheurs: Vec<Declencheur>,
}

/// « Quand ceci arrive, joue ce script. »
#[derive(Debug, Clone, Deserialize)]
pub struct Declencheur {
    pub nom: String,
    /// « salle » : l'entree d'un tableau. « zone » : le contact d'un rectangle.
    pub quand: String,
    #[serde(default)]
    pub salle: String,
    /// En cases. A zero quand le « quand » ne s'en sert pas.
    #[serde(default)]
    pub zone: ZoneCases,
    /// Le noeud qui doit entrer. Vide : celui que la camera suit.
    #[serde(default)]
    pub qui: String,
    #[serde(default)]
    pub unefois: bool,
    pub script: String,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
pub struct ZoneCases {
    pub x: i32,
    pub y: i32,
    pub l: i32,
    pub h: i32,
}

/// Un tableau du niveau, en cases.
#[derive(Debug, Clone, Deserialize)]
pub struct Salle {
    pub nom: String,
    pub x: i32,
    pub y: i32,
    pub largeur: i32,
    pub hauteur: i32,
    /// Ou l'on reapparait. Absent : la ou l'on est entre.
    #[serde(default)]
    pub reprise: Option<PointMonde>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct PointMonde {
    pub x: f64,
    pub y: f64,
}

impl Salle {
    /// Les bornes de la salle en pixels du monde.
    pub fn bornes(&self, tuile: i32) -> (i32, i32, i32, i32) {
        (self.x * tuile, self.y * tuile, self.largeur * tuile, self.hauteur * tuile)
    }
}

/// Une suite de repliques, nommee.
#[derive(Debug, Clone, Deserialize)]
pub struct Dialogue {
    pub nom: String,
    pub repliques: Vec<Replique>,
}

impl Projet {
    pub fn charger(texte: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(texte)
    }

    pub fn clip(&self, nom: &str) -> Option<&Clip> {
        self.animations.iter().find(|c| c.nom == nom)
    }

    pub fn planche(&self, nom: &str) -> Option<&Planche> {
        self.planches.iter().find(|p| p.nom == nom)
    }

    pub fn espece(&self, id: &str) -> Option<&Espece> {
        self.especes.iter().find(|e| e.id == id)
    }

    /// La salle qui contient ce point du monde.
    ///
    /// La camera s'y borne, la mort y renvoie, et le changement de tableau
    /// s'en deduit.
    pub fn salle_en(&self, tuile: i32, x: f64, y: f64) -> Option<&Salle> {
        self.salles.iter().find(|s| {
            let (bx, by, bl, bh) = s.bornes(tuile);
            x >= bx as f64 && y >= by as f64
                && x < (bx + bl) as f64 && y < (by + bh) as f64
        })
    }

    /// Les declencheurs qui tirent a l'entree de ce tableau, dans l'ordre.
    pub fn declencheurs_de_salle(&self, salle: &str) -> Vec<&Declencheur> {
        self.declencheurs.iter()
            .filter(|d| d.quand == "salle" && d.salle == salle)
            .collect()
    }

    /// Les declencheurs de zone dont le rectangle contient ce point du monde.
    pub fn declencheurs_en(&self, tuile: i32, x: f64, y: f64) -> Vec<&Declencheur> {
        let cx = (x / tuile as f64).floor() as i32;
        let cy = (y / tuile as f64).floor() as i32;
        self.declencheurs.iter()
            .filter(|d| d.quand == "zone"
                && cx >= d.zone.x && cx < d.zone.x + d.zone.l
                && cy >= d.zone.y && cy < d.zone.y + d.zone.h)
            .collect()
    }

    pub fn musique(&self, nom: &str) -> Option<&Musique> {
        self.musiques.iter().find(|m| m.nom == nom)
    }

    /// Le texte d'une clef, dans une langue.
    ///
    /// Une clef absente rend LA CLEF, jamais une chaine vide : un texte
    /// manquant doit se voir a l'ecran pendant le developpement, pas laisser
    /// un trou muet que personne ne remarque avant la sortie.
    pub fn texte<'a>(&'a self, clef: &'a str, langue: &str) -> &'a str {
        self.textes
            .get(langue)
            .and_then(|t| t.get(clef))
            .map(|s| s.as_str())
            .unwrap_or(clef)
    }

    /// Les clefs que la langue demandee n'a pas et que la reference a.
    pub fn trous_de_langue(&self, langue: &str, reference: &str) -> Vec<&str> {
        let cible = self.textes.get(langue);
        let mut trous: Vec<&str> = self
            .textes
            .get(reference)
            .map(|t| {
                t.keys()
                    .filter(|c| !cible.map_or(false, |v| v.contains_key(*c)))
                    .map(|c| c.as_str())
                    .collect()
            })
            .unwrap_or_default();
        trous.sort_unstable();
        trous
    }
}
`
}

function chargeurLua(p: ProjetSerialise): string {
  return `${ENTETE('Lua', '--')}-- Ce chargeur attend une table deja decodee depuis le JSON.
-- LOVE n'embarque pas de decodeur : prenez dkjson, rxi/json.lua, ou celui
-- de votre choix. On ne le fournit pas ici pour ne pas vous imposer une
-- dependance que vous avez peut-etre deja.

local Projet = {}
Projet.__index = Projet

-- Une case vide. Zero est une vraie tuile : ne pas les confondre.
Projet.VIDE = -1
Projet.VERSION_ATTENDUE = ${p.version}

function Projet.depuis(donnees)
  local self = setmetatable({}, Projet)
  self.version = donnees.version or 0
  self.nom = donnees.nom or ""
  self.vue = donnees.vue or { largeur = 320, hauteur = 180 }
  self.palette = donnees.palette or { nom = "", couleurs = {} }
  self.cartes = donnees.cartes or {}
  self.scenes = donnees.scenes or {}
  self.animations = donnees.animations or {}
  self.planches = donnees.planches or {}
  self.projection = donnees.projection or {
    mode = "orthogonale", regard = "dessus",
    largeurTuile = 16, hauteurTuile = 16, hauteurBloc = 0,
  }
  self.especes = donnees.especes or {}
  self.sons = donnees.sons or {}
  self.dialogues = donnees.dialogues or {}
  self.musiques = donnees.musiques or {}
  -- Action -> touches. Ce qu'un joueur a remappe voyage avec le projet.
  self.touches = donnees.touches or {}
  -- Langue -> clef -> texte. La clef est l'index, PAS la phrase francaise.
  self.textes = donnees.textes or {}
  -- Le decoupage du niveau en salles, en cases. Vide : monde continu.
  self.salles = donnees.salles or {}
  -- Les declencheurs du niveau. Vide : rien ne tire. La source du script est
  -- du texte : un moteur qui ne l'execute pas sait au moins le dire.
  self.declencheurs = donnees.declencheurs or {}
  if self.version ~= Projet.VERSION_ATTENDUE then
    print(("PixelForge : projet en version %d, chargeur en version %d")
      :format(self.version, Projet.VERSION_ATTENDUE))
  end
  return self
end

-- Deplie un calque en table plate, indexee de 1 a largeur * hauteur.
-- Le decalage a l'ecran d'un calque, pour une position de camera.
--
-- On ARRONDIT ici, et pas plus tard : un calque a 0,4 de parallaxe tomberait
-- sur 12,4 pixels, LOVE l'echantillonnerait entre deux pixels, et l'on aurait
-- un fond flou au milieu d'un jeu net.
function Projet.decalage_calque(calque, cam_x, cam_y)
  local p = calque.parallaxe or {}
  local fx = p.x or 1
  local fy = p.y or 1
  return math.floor(cam_x * fx + 0.5), math.floor(cam_y * fy + 0.5)
end

-- La case a lire, pour un calque qui se repete ou non. Rend nil en dehors
-- d'un calque ordinaire.
function Projet.case_de_calque(calque, carte, cx, cy)
  if not calque.repete then
    if cx < 0 or cy < 0 or cx >= carte.largeur or cy >= carte.hauteur then return nil end
    return cx, cy
  end
  return cx % carte.largeur, cy % carte.hauteur
end

function Projet.deplier_cases(carte, calque)
  local sortie = {}
  for i = 1, carte.largeur * carte.hauteur do sortie[i] = Projet.VIDE end
  for y, ligne in ipairs(calque.cases or {}) do
    local x = 0
    for v in tostring(ligne):gmatch("[^,]+") do
      if x < carte.largeur then
        sortie[(y - 1) * carte.largeur + x + 1] = tonumber(v) or Projet.VIDE
      end
      x = x + 1
    end
  end
  return sortie
end

Projet.SOLIDE = 1
Projet.PLATEFORME = 2
Projet.BLESSANTE = 4
Projet.ECHELLE = 8
Projet.LIQUIDE = 16
Projet.PENTE_DROITE = 32
Projet.PENTE_GAUCHE = 64
-- Deux cases pour monter d'une, au lieu d'une seule.
Projet.PENTE_DEMI = 128
-- Parmi les deux cases d'une demi-pente, celle du haut.
Projet.PENTE_HAUTE = 256

Projet.ALPHABET_MATIERE = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
Projet.BASE_PENTE = 32
Projet.FORMES_PENTE = {
  Projet.PENTE_DROITE,
  Projet.PENTE_GAUCHE,
  Projet.PENTE_DROITE + Projet.PENTE_DEMI,
  Projet.PENTE_DROITE + Projet.PENTE_DEMI + Projet.PENTE_HAUTE,
  Projet.PENTE_GAUCHE + Projet.PENTE_DEMI,
  Projet.PENTE_GAUCHE + Projet.PENTE_DEMI + Projet.PENTE_HAUTE,
}

-- Un caractere de la grille de collision vers ses drapeaux.
--
-- On ADDITIONNE au lieu d'un « ou » binaire, et l'on divise au lieu d'un
-- masque : Lua 5.1 et LuaJIT n'ont pas d'operateurs binaires. Les drapeaux
-- d'une meme matiere sont deux a deux disjoints, la somme est donc exacte.
function Projet.matiere_du_caractere(c)
  local v = Projet.ALPHABET_MATIERE:find(c, 1, true)
  if not v then return 0 end
  v = v - 1
  if v < Projet.BASE_PENTE then return v end
  local rang = v - Projet.BASE_PENTE
  local n = #Projet.FORMES_PENTE
  local forme = Projet.FORMES_PENTE[(rang % n) + 1]
  if rang >= n then return forme + Projet.BLESSANTE end
  return forme
end

-- Les drapeaux d'une case de collision. Dehors : SOLIDE.
function Projet.matiere_de_case(carte, cx, cy)
  if cx < 0 or cy < 0 or cx >= carte.largeur or cy >= carte.hauteur then
    return Projet.SOLIDE
  end
  local ligne = (carte.solides or {})[cy + 1]
  if not ligne or cx >= #ligne then return Projet.SOLIDE end
  return Projet.matiere_du_caractere(ligne:sub(cx + 1, cx + 1))
end

-- Vrai si la case bloque le passage.
--
-- On teste le DRAPEAU, pas le caractere. Comparer au chiffre un rendait faux
-- pour un mur herisse de pointes, qui vaut cinq : le mur devenait traversable
-- dans le jeu porte, et nulle part ailleurs.
function Projet.est_solide(carte, cx, cy)
  return Projet.matiere_de_case(carte, cx, cy) % 2 == 1
end

-- Vrai si ce drapeau-ci est pose dans cette matiere.
function Projet.a_matiere(matiere, drapeau)
  return math.floor(matiere / drapeau) % 2 == 1
end

-- La hauteur du sol dans une case, pour une colonne de pixels. Comptee depuis
-- le HAUT : zero veut dire « au sommet de la case », la taille d'une tuile
-- veut dire « pas de sol ici ».
function Projet.hauteur_sol(matiere, x, tuile)
  local vers_droite = Projet.a_matiere(matiere, Projet.PENTE_DROITE)
  local vers_gauche = Projet.a_matiere(matiere, Projet.PENTE_GAUCHE)
  if not vers_droite and not vers_gauche then
    if matiere % 2 == 1 then return 0 end
    return tuile
  end
  -- L'avancee LE LONG de la montee : on lit la case a l'envers quand elle
  -- monte vers la gauche, ce qui evite d'ecrire deux fois la meme formule.
  local u = vers_droite and x or (tuile - 1 - x)
  local demi = Projet.a_matiere(matiere, Projet.PENTE_DEMI)
  local haute = Projet.a_matiere(matiere, Projet.PENTE_HAUTE)
  local depart = (demi and haute) and (math.floor(tuile / 2) - 1) or (tuile - 1)
  return depart - (demi and math.floor(u / 2) or u)
end

-- Le clip portant ce nom, ou nil.
function Projet:clip(nom)
  for _, a in ipairs(self.animations or {}) do
    if a.nom == nom then return a end
  end
  return nil
end

-- L'espece portant cet identifiant, ou nil. L'intention y est un NOM :
-- "immobile", "patrouille", "poursuite", "bond", "joueur", "plateformeur".
function Projet:espece(id)
  for _, e in ipairs(self.especes or {}) do
    if e.id == id then return e end
  end
  return nil
end

-- Le comportement d'une espece. Une espece sans intention declaree ne bouge
-- pas : c'est le seul defaut qui ne surprend personne.
function Projet.comportement_de(espece)
  return espece.comportement or "immobile"
end

-- Case -> coin haut-gauche de son dessin, en pixels.
-- C'est la fonction que tout moteur d'accueil doit avoir juste : en
-- isometrique on rend le coin de la boite du losange, pas son sommet.
function Projet.case_vers_monde(proj, cx, cy)
  local l = proj.largeurTuile or 16
  local h = proj.hauteurTuile or 16
  local mode = proj.mode or "orthogonale"
  if mode == "isometrique" then
    return (cx - cy) * (l / 2) - l / 2, (cx + cy) * (h / 2)
  elseif mode == "iso-decalee" then
    return cx * l + (cy % 2 ~= 0 and l / 2 or 0), cy * (h / 2)
  elseif mode == "hexagonale" then
    return cx * math.floor(l * 0.75), cy * h + (cx % 2 ~= 0 and math.floor(h / 2) or 0)
  end
  return cx * l, cy * h
end

-- La planche portant ce nom, ou nil.
function Projet:planche(nom)
  for _, t in ipairs(self.planches or {}) do
    if t.nom == nom then return t end
  end
  return nil
end

-- La couleur d'un pixel d'une planche, ou nil pour le vide. Les index de
-- dessin et de rangee sont ceux du FORMAT, donc a partir de zero ; les tables
-- Lua commencent a un. C'est la seule difference avec les autres portages, et
-- c'est celle qu'on oublie.
function Projet.pixel_de_planche(planche, index, x, y)
  local dessin = (planche.dessins or {})[index + 1]
  if not dessin then return nil end
  local ligne = dessin[y + 1]
  if not ligne then return nil end
  local c = ligne:sub(x + 1, x + 1)
  if c == "" or c == "." then return nil end
  return (planche.cle or {})[c]
end

-- L'ordre de lecture. Les rangs sont des index de tableau Lua, donc a partir
-- de 1 : c'est la seule difference avec les autres portages, et c'est celle
-- qu'on oublie.
-- L'aller-retour ne repete pas ses extremites : 1 2 3 4 3 2, six pas et non
-- huit. Les repeter ferait tenir les deux bouts deux fois plus longtemps.
function Projet.ordre_de_lecture(clip)
  local images = clip.images or {}
  local n = #images
  local ordre = {}
  for i = 1, n do ordre[#ordre + 1] = i end
  if (clip.boucle or "boucle") ~= "aller-retour" or n <= 2 then return ordre end
  for i = n - 1, 2, -1 do ordre[#ordre + 1] = i end
  return ordre
end

-- Duree d'un tour de clip, en millisecondes.
function Projet.duree_de_clip(clip)
  local images = clip.images or {}
  local total = 0
  for _, i in ipairs(Projet.ordre_de_lecture(clip)) do
    total = total + math.max(1, images[i].duree or 1)
  end
  return total
end

-- L'image de planche apres ms millisecondes. Sans etat.
function Projet.image_a(clip, ms)
  local images = clip.images or {}
  local ordre = Projet.ordre_de_lecture(clip)
  if #ordre == 0 then return Projet.VIDE end
  local dernier = images[ordre[#ordre]].index
  local total = Projet.duree_de_clip(clip)
  local t = math.max(0, ms)
  if (clip.boucle or "boucle") == "unique" then
    if t >= total then return dernier end
  else
    t = t % total
  end
  for _, rang in ipairs(ordre) do
    local d = math.max(1, images[rang].duree or 1)
    if t < d then return images[rang].index end
    t = t - d
  end
  return dernier
end

-- Les bornes d'une salle en pixels du monde.
function Projet.bornes_de_salle(s, tuile)
  return s.x * tuile, s.y * tuile, s.largeur * tuile, s.hauteur * tuile
end

-- La salle qui contient ce point du monde, ou nil.
--
-- La camera s'y borne, la mort y renvoie, et le changement de tableau s'en
-- deduit. Deux salles qui se chevauchent la rendent ambigue.
function Projet:salle_en(tuile, x, y)
  for _, s in ipairs(self.salles or {}) do
    local bx, by, bl, bh = Projet.bornes_de_salle(s, tuile)
    if x >= bx and y >= by and x < bx + bl and y < by + bh then return s end
  end
  return nil
end

-- Les declencheurs qui tirent a l'entree de ce tableau, dans l'ordre.
function Projet:declencheurs_de_salle(salle)
  local sortie = {}
  for _, d in ipairs(self.declencheurs or {}) do
    if d.quand == "salle" and d.salle == salle then sortie[#sortie + 1] = d end
  end
  return sortie
end

-- Les declencheurs de zone dont le rectangle contient ce point du monde.
function Projet:declencheurs_en(tuile, x, y)
  local sortie = {}
  local cx = math.floor(x / tuile)
  local cy = math.floor(y / tuile)
  for _, d in ipairs(self.declencheurs or {}) do
    local z = d.zone or { x = 0, y = 0, l = 0, h = 0 }
    if d.quand == "zone"
        and cx >= z.x and cx < z.x + z.l
        and cy >= z.y and cy < z.y + z.h then
      sortie[#sortie + 1] = d
    end
  end
  return sortie
end

-- La musique portant ce nom, ou nil.
function Projet:musique(nom)
  for _, m in ipairs(self.musiques or {}) do
    if m.nom == nom then return m end
  end
  return nil
end

-- La duree d'un temps, en millisecondes.
function Projet.duree_temps(musique)
  return 60000 / math.max(1, musique.tempo or 120)
end

-- La duree de la musique entiere : sa voie la plus longue.
function Projet.duree_de_musique(musique)
  local temps = 0
  for _, v in ipairs(musique.voies or {}) do
    temps = math.max(temps, #(v.notes or {}))
  end
  return temps * Projet.duree_temps(musique)
end

Projet.NOMS_NOTES = {
  ["do"] = 0, ["do#"] = 1, ["re"] = 2, ["re#"] = 3, ["mi"] = 4, ["fa"] = 5,
  ["fa#"] = 6, ["sol"] = 7, ["sol#"] = 8, ["la"] = 9, ["la#"] = 10, ["si"] = 11,
}

-- « la4 » rend 440. Un silence ou une note inconnue rend zero.
function Projet.frequence_de(note)
  local lettres, octave = tostring(note):lower():match("^%s*(%a+#?)(%-?%d+)%s*$")
  if not lettres then return 0 end
  local demi = Projet.NOMS_NOTES[lettres]
  if not demi then return 0 end
  return 440 * 2 ^ ((demi - 9) / 12 + (tonumber(octave) - 4))
end

-- Le texte d'une clef, dans une langue.
--
-- Une clef absente rend LA CLEF, jamais une chaine vide : un texte manquant
-- doit se voir a l'ecran pendant le developpement, pas laisser un trou muet
-- que personne ne remarque avant la sortie.
function Projet:texte(clef, langue)
  local table_langue = (self.textes or {})[langue]
  if table_langue and table_langue[clef] then return table_langue[clef] end
  return clef
end

-- Les clefs que la langue demandee n'a pas et que la reference a.
function Projet:trous_de_langue(langue, reference)
  local cible = (self.textes or {})[langue] or {}
  local trous = {}
  for clef in pairs((self.textes or {})[reference or "fr"] or {}) do
    if cible[clef] == nil then trous[#trous + 1] = clef end
  end
  table.sort(trous)
  return trous
end

return Projet
`
}

function chargeurPython(): string {
  return `${ENTETE('Python', '#')}from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from typing import Any

# Une case vide. Zero est une vraie tuile : ne pas les confondre.
VIDE = -1

#: Les matieres d'une case. Les cinq premieres se combinent librement ; une
#: pente n'est jamais solide — marquee solide, elle bloque comme un mur et
#: l'on se cogne dans le bas de la cote au lieu de la monter.
SOLIDE = 1
PLATEFORME = 2
BLESSANTE = 4
ECHELLE = 8
LIQUIDE = 16
PENTE_DROITE = 32
PENTE_GAUCHE = 64
#: Deux cases pour monter d'une, au lieu d'une seule.
PENTE_DEMI = 128
#: Parmi les deux cases d'une demi-pente, celle du haut.
PENTE_HAUTE = 256

_ALPHABET_MATIERE = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
_BASE_PENTE = 32
_FORMES_PENTE = [
    PENTE_DROITE,
    PENTE_GAUCHE,
    PENTE_DROITE | PENTE_DEMI,
    PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
    PENTE_GAUCHE | PENTE_DEMI,
    PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
]


def matiere_du_caractere(c: str) -> int:
    """Un caractere de la grille de collision vers ses drapeaux."""
    v = _ALPHABET_MATIERE.find(c)
    if v < 0:
        return 0
    if v < _BASE_PENTE:
        return v
    rang = v - _BASE_PENTE
    forme = _FORMES_PENTE[rang % len(_FORMES_PENTE)]
    return forme | (BLESSANTE if rang >= len(_FORMES_PENTE) else 0)


def hauteur_sol(matiere: int, x: int, tuile: int) -> int:
    """La hauteur du sol dans une case, pour une colonne de pixels.

    Comptee depuis le HAUT : zero veut dire « au sommet de la case », la
    taille d'une tuile veut dire « pas de sol ici ».
    """
    vers_droite = bool(matiere & PENTE_DROITE)
    if not vers_droite and not matiere & PENTE_GAUCHE:
        return 0 if matiere & SOLIDE else tuile
    # L'avancee LE LONG de la montee : on lit la case a l'envers quand elle
    # monte vers la gauche, ce qui evite d'ecrire deux fois la meme formule.
    u = x if vers_droite else tuile - 1 - x
    demi = bool(matiere & PENTE_DEMI)
    depart = (tuile >> 1) - 1 if demi and matiere & PENTE_HAUTE else tuile - 1
    return depart - (u >> 1 if demi else u)


@dataclass
class Terrain:
    tuileDepart: int
    jeu: str
    dehorsEstPlein: bool


@dataclass
class Calque:
    nom: str
    visible: bool
    devant: bool
    cases: list[str]
    terrain: Terrain | None = None
    presence: list[str] | None = None
    #: De combien ce calque suit la camera, par axe. Un : comme le monde.
    #: Un demi : deux fois moins vite, donc plus loin. Zero : un ciel fixe.
    parallaxe: dict[str, float] | None = None
    #: Le calque se repete-t-il indefiniment ? Voir parallaxe.
    repete: bool = False

    def decalage(self, cam_x: float, cam_y: float) -> tuple[int, int]:
        """Le decalage a l'ecran de ce calque, arrondi au pixel.

        On arrondit ICI et pas plus tard : un calque a 0,4 de parallaxe
        tomberait entre deux pixels, et l'on aurait un fond flou au milieu
        d'un jeu net.
        """
        p = self.parallaxe or {}
        return (round(cam_x * p.get(\"x\", 1.0)), round(cam_y * p.get(\"y\", 1.0)))


@dataclass
class Carte:
    nom: str
    largeur: int
    hauteur: int
    tuile: int
    calques: list[Calque] = field(default_factory=list)
    solides: list[str] = field(default_factory=list)

    def deplier_cases(self, calque: Calque) -> list[int]:
        """Deplie un calque en liste plate, indexee par y * largeur + x."""
        sortie = [VIDE] * (self.largeur * self.hauteur)
        for y, ligne in enumerate(calque.cases):
            if not ligne:
                continue
            for x, v in enumerate(ligne.split(",")):
                if x < self.largeur:
                    sortie[y * self.largeur + x] = int(v)
        return sortie

    def matiere(self, cx: int, cy: int) -> int:
        """Les drapeaux d'une case de collision. Dehors : SOLIDE."""
        if cx < 0 or cy < 0 or cx >= self.largeur or cy >= self.hauteur:
            return SOLIDE
        if cy >= len(self.solides):
            return SOLIDE
        ligne = self.solides[cy]
        if cx >= len(ligne):
            return SOLIDE
        return matiere_du_caractere(ligne[cx])

    def est_solide(self, cx: int, cy: int) -> bool:
        """Vrai si la case bloque le passage.

        On teste le DRAPEAU, pas le caractere. Comparer au chiffre un rendait
        faux pour un mur herisse de pointes, qui vaut cinq : le mur devenait
        traversable dans le jeu porte, et nulle part ailleurs.
        """
        return bool(self.matiere(cx, cy) & SOLIDE)


@dataclass
class Noeud:
    id: str
    nom: str
    type: str
    x: int
    y: int
    visible: bool
    script: str | None = None
    espece: str | None = None
    image: int = 0
    proprietes: dict[str, Any] = field(default_factory=dict)
    enfants: list["Noeud"] = field(default_factory=list)


def _noeud(d: dict[str, Any]) -> Noeud:
    return Noeud(
        id=d["id"], nom=d["nom"], type=d["type"], x=d["x"], y=d["y"],
        visible=d["visible"], script=d.get("script"),
        espece=d.get("espece"), image=d.get("image", 0),
        proprietes=d.get("proprietes", {}),
        enfants=[_noeud(e) for e in d.get("enfants", [])],
    )


@dataclass
class ImageAnim:
    index: int
    duree: int
    decalageX: int = 0
    decalageY: int = 0


@dataclass
class Clip:
    """Un clip d'animation. Les durees sont en millisecondes."""

    nom: str
    boucle: str = "boucle"
    suite: str | None = None
    images: list[ImageAnim] = field(default_factory=list)
    evenements: list[dict[str, Any]] = field(default_factory=list)

    def ordre_de_lecture(self) -> list[int]:
        """L'aller-retour ne repete pas ses extremites : 0 1 2 3 2 1."""
        n = len(self.images)
        ordre = list(range(n))
        if self.boucle != "aller-retour" or n <= 2:
            return ordre
        return ordre + list(range(n - 2, 0, -1))

    def duree(self) -> int:
        return sum(max(1, self.images[i].duree) for i in self.ordre_de_lecture())

    def image_a(self, ms: int) -> int:
        """L'image de planche apres ms millisecondes. Sans etat."""
        ordre = self.ordre_de_lecture()
        if not ordre:
            return VIDE
        dernier = self.images[ordre[-1]].index
        total = self.duree()
        t = max(0, ms)
        if self.boucle == "unique":
            if t >= total:
                return dernier
        else:
            t %= total
        for rang in ordre:
            d = max(1, self.images[rang].duree)
            if t < d:
                return self.images[rang].index
            t -= d
        return dernier


@dataclass
class Projection:
    """Comment le monde se montre. Le mode et le regard sont independants."""

    mode: str = "orthogonale"
    regard: str = "dessus"
    largeurTuile: int = 16
    hauteurTuile: int = 16
    hauteurBloc: int = 0

    def case_vers_monde(self, cx: int, cy: int) -> tuple[float, float]:
        """Case -> coin haut-gauche de son dessin, en pixels."""
        l, h = self.largeurTuile, self.hauteurTuile
        if self.mode == "isometrique":
            return ((cx - cy) * (l / 2) - l / 2, (cx + cy) * (h / 2))
        if self.mode == "iso-decalee":
            return (cx * l + (l / 2 if cy % 2 else 0), cy * (h / 2))
        if self.mode == "hexagonale":
            return (cx * (l * 3 // 4), cy * h + (h // 2 if cx % 2 else 0))
        return (cx * l, cy * h)


@dataclass
class Planche:
    """Une planche de dessins, en lettres : une couleur par caractere."""

    nom: str
    largeurCase: int
    hauteurCase: int
    colonnes: int
    cle: dict[str, str] = field(default_factory=dict)
    dessins: list[list[str]] = field(default_factory=list)

    def pixel(self, index: int, x: int, y: int) -> str | None:
        """La couleur d'un pixel, ou None pour le vide."""
        if index < 0 or index >= len(self.dessins):
            return None
        dessin = self.dessins[index]
        if y < 0 or y >= len(dessin):
            return None
        ligne = dessin[y]
        if x < 0 or x >= len(ligne) or ligne[x] == ".":
            return None
        return self.cle.get(ligne[x])


@dataclass
class Espece:
    """Ce qu'une entite EST, entierement en donnees. L'intention est un nom."""

    id: str
    nom: str = ""
    planche: str = "creatures"
    clip: str = ""
    camp: str = "ennemi"
    pv: int = 1
    vitesse: float = 0.0
    degats: int = 0
    soigne: int = 0
    reprise: bool = False
    comportement: str = "immobile"
    vigilance: float = 0.0
    boite: dict[str, float] = field(default_factory=dict)
    ancreX: int = 8
    ancreY: int = 16
    invulnerabiliteMs: int = 220
    clipsDiriges: bool = False
    plateforme: dict[str, float] = field(default_factory=dict)
    etats: list[dict[str, Any]] = field(default_factory=list)
    etatInitial: str = ""
    duree: int = 0
    matiereCorps: int = 0
    trajet: dict[str, float] = field(default_factory=dict)
    degatsPietinement: int = 0
    rebondPietinement: int = 0
    pesante: bool = False

    def etat(self, nom: str) -> dict[str, Any] | None:
        """L'etat portant ce nom, ou None."""
        for e in self.etats:
            if e.get("nom") == nom:
                return e
        return None


@dataclass
class Projet:
    version: int
    nom: str
    vue: dict[str, int]
    palette: dict[str, Any]
    cartes: list[Carte] = field(default_factory=list)
    scenes: list[dict[str, Any]] = field(default_factory=list)
    animations: list[Clip] = field(default_factory=list)
    planches: list[Planche] = field(default_factory=list)
    projection: Projection = field(default_factory=Projection)
    especes: list[Espece] = field(default_factory=list)
    sons: list[dict[str, Any]] = field(default_factory=list)
    dialogues: list[dict[str, Any]] = field(default_factory=list)
    musiques: list[dict[str, Any]] = field(default_factory=list)
    #: Action -> touches. Ce qu'un joueur a remappe voyage avec le projet.
    touches: dict[str, list[str]] = field(default_factory=dict)
    #: Langue -> clef -> texte. La clef est l'index, PAS la phrase francaise.
    textes: dict[str, dict[str, str]] = field(default_factory=dict)
    #: Le decoupage du niveau en salles, en cases. Vide : monde continu.
    salles: list[dict[str, Any]] = field(default_factory=list)
    #: Les declencheurs du niveau. Vide : rien ne tire. La source du script
    #: est du texte : un moteur qui ne l'execute pas sait au moins le dire.
    declencheurs: list[dict[str, Any]] = field(default_factory=list)

    def clip(self, nom: str) -> Clip | None:
        for a in self.animations:
            if a.nom == nom:
                return a
        return None

    def planche(self, nom: str) -> Planche | None:
        for t in self.planches:
            if t.nom == nom:
                return t
        return None

    def espece(self, ident: str) -> Espece | None:
        for e in self.especes:
            if e.id == ident:
                return e
        return None

    def espece_du_noeud(self, noeud: Noeud) -> Espece | None:
        return self.espece(noeud.espece) if noeud.espece else None

    def salle_en(self, tuile: int, x: float, y: float) -> dict[str, Any] | None:
        """La salle qui contient ce point du monde, ou None.

        La camera s'y borne, la mort y renvoie, et le changement de tableau
        s'en deduit. Deux salles qui se chevauchent la rendent ambigue.
        """
        for s in self.salles:
            bx, by = s[\"x\"] * tuile, s[\"y\"] * tuile
            if bx <= x < bx + s[\"largeur\"] * tuile and by <= y < by + s[\"hauteur\"] * tuile:
                return s
        return None

    def musique(self, nom: str) -> dict[str, Any] | None:
        for m in self.musiques:
            if m.get("nom") == nom:
                return m
        return None

    def declencheurs_de_salle(self, salle: str) -> list[dict[str, Any]]:
        \"\"\"Les declencheurs qui tirent a l'entree de ce tableau, dans l'ordre.\"\"\"
        return [d for d in self.declencheurs
                if d.get("quand") == "salle" and d.get("salle") == salle]

    def declencheurs_en(self, tuile: int, x: float, y: float) -> list[dict[str, Any]]:
        \"\"\"Les declencheurs de zone dont le rectangle contient ce point du monde.\"\"\"
        cx, cy = math.floor(x / tuile), math.floor(y / tuile)
        sortie = []
        for d in self.declencheurs:
            if d.get("quand") != "zone":
                continue
            z = d.get("zone") or {"x": 0, "y": 0, "l": 0, "h": 0}
            if z["x"] <= cx < z["x"] + z["l"] and z["y"] <= cy < z["y"] + z["h"]:
                sortie.append(d)
        return sortie

    def texte(self, clef: str, langue: str, **valeurs: Any) -> str:
        \"\"\"Le texte d'une clef, dans une langue.

        Une clef absente rend LA CLEF, jamais une chaine vide : un texte
        manquant doit se voir a l'ecran pendant le developpement, pas laisser
        un trou muet que personne ne remarque avant la sortie.
        \"\"\"
        brut = self.textes.get(langue, {}).get(clef, clef)
        return re.sub(
            r"\\{(\\w+)\\}",
            lambda m: str(valeurs[m.group(1)]) if m.group(1) in valeurs else m.group(0),
            brut,
        )

    def trous_de_langue(self, langue: str, reference: str = "fr") -> list[str]:
        \"\"\"Les clefs que la langue demandee n'a pas et que la reference a.\"\"\"
        cible = self.textes.get(langue, {})
        return sorted(c for c in self.textes.get(reference, {}) if c not in cible)

    @staticmethod
    def charger(chemin: str) -> "Projet":
        with open(chemin, encoding="utf-8") as f:
            d = json.load(f)
        cartes = [
            Carte(
                nom=c["nom"], largeur=c["largeur"], hauteur=c["hauteur"], tuile=c["tuile"],
                calques=[
                    Calque(
                        nom=l["nom"], visible=l["visible"], devant=l["devant"],
                        cases=l["cases"],
                        terrain=Terrain(**l["terrain"]) if l.get("terrain") else None,
                        presence=l.get("presence"),
                        parallaxe=l.get("parallaxe"),
                        repete=l.get("repete", False),
                    )
                    for l in c["calques"]
                ],
                solides=c["solides"],
            )
            for c in d.get("cartes", [])
        ]
        scenes = [{"nom": s["nom"], "racine": _noeud(s["racine"])} for s in d.get("scenes", [])]
        animations = [
            Clip(
                nom=a["nom"], boucle=a["boucle"], suite=a.get("suite"),
                images=[ImageAnim(**i) for i in a.get("images", [])],
                evenements=a.get("evenements", []),
            )
            for a in d.get("animations", [])
        ]
        planches = [Planche(**t) for t in d.get("planches", [])]
        projection = Projection(**d["projection"]) if d.get("projection") else Projection()
        especes = [Espece(**e) for e in d.get("especes", [])]
        return Projet(
            version=d["version"], nom=d["nom"], vue=d["vue"], palette=d["palette"],
            cartes=cartes, scenes=scenes, animations=animations, planches=planches,
            projection=projection, especes=especes,
            sons=d.get("sons", []), dialogues=d.get("dialogues", []),
            musiques=d.get("musiques", []), touches=d.get("touches", {}),
            textes=d.get("textes", {}), salles=d.get("salles", []),
            declencheurs=d.get("declencheurs", []),
        )
#: « la4 » rend 440. Un silence ou une note inconnue rend zero.
_DEMI_TONS = {
    "do": 0, "do#": 1, "re": 2, "re#": 3, "mi": 4, "fa": 5,
    "fa#": 6, "sol": 7, "sol#": 8, "la": 9, "la#": 10, "si": 11,
}


def frequence_de(note: str) -> float:
    m = re.match(r"^([a-z]+#?)(-?\\d+)$", note.strip().lower())
    if not m or m.group(1) not in _DEMI_TONS:
        return 0.0
    return 440.0 * 2 ** ((_DEMI_TONS[m.group(1)] - 9) / 12 + (int(m.group(2)) - 4))


def duree_temps(musique: dict[str, Any]) -> float:
    \"\"\"La duree d'un temps, en millisecondes.\"\"\"
    return 60000.0 / max(1, musique.get("tempo", 120))


def duree_de_musique(musique: dict[str, Any]) -> float:
    \"\"\"La duree totale : la voie la plus longue.\"\"\"
    temps = max((len(v.get("notes", [])) for v in musique.get("voies", [])), default=0)
    return temps * duree_temps(musique)
`
}
