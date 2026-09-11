import type { ProjetSerialise, NoeudSerialise } from '../export/format.ts'
import type { OngletProjet } from './projet-panneau.ts'

/**
 * TROUVER : une seule question pour tout ce qu'un projet contient.
 *
 * ## Pourquoi ce n'est pas un filtre dans l'arbre
 *
 * Un filtre dans l'arbre aurait repondu a « ou est le gardien de la crypte ? »
 * a condition d'avoir d'abord ouvert le panneau Projet, choisi l'onglet Scene,
 * puis la bonne scene — c'est-a-dire a condition de savoir deja ou il est. Et
 * il n'aurait rien dit des especes, des planches, des sons, des salles ou des
 * declencheurs, qui vivent dans six autres onglets.
 *
 * Un projet est un ensemble de choses NOMMEES. La recherche porte donc sur
 * toutes, d'un seul champ, et chaque resultat sait ou il habite : la carte a
 * mettre sous le pinceau, l'onglet a ouvrir, le point a viser.
 *
 * ## Pourquoi le classement compte plus que la recherche
 *
 * Taper « gel » dans un projet qui a une gelee, une espece « gelee-bleue »,
 * un son « gel » et trois entites posees rend huit resultats. S'ils arrivent
 * dans l'ordre du fichier, on les lit tous ; s'ils arrivent par pertinence —
 * le nom exact, puis ce qui commence par, puis ce qui contient —, le premier
 * est presque toujours le bon, et Entree suffit.
 */
export type GenreTrouvaille =
  | 'noeud' | 'carte' | 'espece' | 'planche' | 'son' | 'musique'
  | 'dialogue' | 'animation' | 'declencheur' | 'salle' | 'assemblage'

export interface Trouvaille {
  genre: GenreTrouvaille
  /** Ce qu'on lit dans la liste. */
  nom: string
  /** Ce qui situe : la scene, l'espece, le nombre de cases… */
  detail: string
  /** L'onglet du panneau Projet qui montre cette chose, s'il y en a un. */
  onglet?: OngletProjet | undefined
  /** La cible dans cet onglet — un nom d'espece, de son, de clip… */
  cible?: string | undefined
  /** La carte a mettre sous le pinceau pour voir cette chose. */
  carte?: string | undefined
  /** Pour un noeud : son identifiant, et ou il se trouve dans le monde. */
  id?: string | undefined
  x?: number | undefined
  y?: number | undefined
  /** Le rang de pertinence : 0 exact, 1 commence par, 2 contient. */
  rang: number
}

/**
 * Compare sans accents ni majuscules.
 *
 * Chercher « gelee » doit trouver « Gelée ». Sans cela, la recherche punit
 * l'ecriture correcte — et c'est justement celle qu'on emploie pour nommer
 * les choses d'un jeu francais.
 */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Le rang de pertinence, ou -1 si cela ne correspond pas du tout. */
function rangDe(nom: string, requete: string): number {
  const a = normaliser(nom)
  const b = normaliser(requete)
  if (!b) return -1
  if (a === b) return 0
  if (a.startsWith(b)) return 1
  return a.includes(b) ? 2 : -1
}

/** Combien de resultats on rend. Au-dela, la liste ne se lit plus. */
export const TROUVAILLES_MAX = 40

export function chercherDansProjet(p: ProjetSerialise, requete: string): Trouvaille[] {
  const out: Trouvaille[] = []
  const q = requete.trim()
  if (!q) return out

  const ajouter = (t: Omit<Trouvaille, 'rang'>, ...mots: string[]): void => {
    // Le MEILLEUR rang parmi ce qui designe la chose : une entite nommee
    // « garde-1 » d'espece « gardien » doit se trouver par les deux.
    let rang = -1
    for (const m of mots) {
      const r = rangDe(m, q)
      if (r >= 0 && (rang < 0 || r < rang)) rang = r
    }
    if (rang < 0) return
    out.push({ ...t, rang })
  }

  for (const c of p.cartes) {
    ajouter({
      genre: 'carte', nom: c.nom, detail: `${c.largeur}×${c.hauteur}`,
      onglet: 'carte', carte: c.nom,
    }, c.nom)
  }

  /*
   * Les noeuds de TOUTES les scenes, avec leur position ABSOLUE : c'est elle
   * qu'il faut pour viser. Un noeud enfant porte une position relative a son
   * parent, et viser celle-la ferait regarder le coin de la carte.
   */
  for (const s of p.scenes) {
    const parcourir = (n: NoeudSerialise, ax: number, ay: number): void => {
      const x = ax + n.x
      const y = ay + n.y
      ajouter({
        genre: 'noeud', nom: n.nom,
        detail: `${n.espece ? `${n.espece} · ` : ''}scène ${s.nom}`,
        onglet: 'scene', cible: s.nom, carte: s.nom, id: n.id, x, y,
      }, n.nom, n.espece ?? '')
      for (const e of n.enfants) parcourir(e, x, y)
    }
    parcourir(s.racine, 0, 0)
  }

  for (const e of p.especes) {
    ajouter({
      genre: 'espece', nom: e.id, detail: `${e.nom} · ${e.comportement} · ${e.pv} pv`,
      onglet: 'especes', cible: e.id,
    }, e.id, e.nom)
  }
  for (const t of p.planches) {
    ajouter({
      genre: 'planche', nom: t.nom, detail: `${t.dessins.length} case(s)`,
      onglet: 'dessin', cible: t.nom,
    }, t.nom)
  }
  for (const a of p.animations) {
    ajouter({
      genre: 'animation', nom: a.nom, detail: `${a.images.length} image(s)`,
      onglet: 'animations', cible: a.nom,
    }, a.nom)
  }
  for (const s of p.sons ?? []) {
    ajouter({ genre: 'son', nom: s.nom, detail: 'son', onglet: 'sons', cible: s.nom }, s.nom)
  }
  for (const m of p.musiques ?? []) {
    ajouter({
      genre: 'musique', nom: m.nom, detail: `${m.voies.length} voie(s)`,
      onglet: 'sons', cible: m.nom,
    }, m.nom)
  }
  for (const d of p.dialogues ?? []) {
    ajouter({
      genre: 'dialogue', nom: d.nom, detail: `${d.repliques.length} réplique(s)`,
      onglet: 'textes', cible: d.nom,
    }, d.nom)
  }
  for (const d of p.declencheurs ?? []) {
    ajouter({
      genre: 'declencheur', nom: d.nom,
      detail: `${d.quand}${d.carte ? ` · ${d.carte}` : ''}`,
      onglet: 'carte', carte: d.carte ?? '',
    }, d.nom)
  }
  for (const s of p.salles ?? []) {
    ajouter({
      genre: 'salle', nom: s.nom, detail: `${s.largeur}×${s.hauteur}${s.carte ? ` · ${s.carte}` : ''}`,
      onglet: 'carte', carte: s.carte ?? '',
      // Le centre de la salle, en pixels : c'est la qu'on veut regarder.
      x: (s.x + s.largeur / 2) * (p.cartes.find((c) => c.nom === s.carte)?.tuile ?? 16),
      y: (s.y + s.hauteur / 2) * (p.cartes.find((c) => c.nom === s.carte)?.tuile ?? 16),
    }, s.nom)
  }
  for (const a of p.assemblages ?? []) {
    ajouter({
      genre: 'assemblage', nom: a.nom, detail: 'modèle', onglet: 'scene',
    }, a.nom)
  }

  // Par pertinence, puis par genre, puis par nom : deux recherches identiques
  // doivent rendre le meme ordre — sinon Entree ne veut rien dire.
  out.sort((a, b) => a.rang - b.rang
    || a.genre.localeCompare(b.genre)
    || a.nom.localeCompare(b.nom))
  return out.slice(0, TROUVAILLES_MAX)
}
