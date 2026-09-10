/**
 * Les modeles de salle : des salles DESSINEES a la main, que le tirage pioche.
 *
 * ## Ce que le hasard ne sait pas faire
 *
 * Le generateur pose des amas de blocs a des places tirees au sort. C'est
 * suffisant pour prouver qu'un etage tient debout, et ce n'est pas un jeu :
 * personne ne se souvient d'une salle tiree au sort. On se souvient de la
 * salle aux quatre piliers, de celle ou deux tourelles se font face, de celle
 * qui est vide et ou l'on comprend que quelque chose va tomber du plafond. Ces
 * salles-la sont ECRITES, et le tirage ne fait que choisir laquelle.
 *
 * C'est ce que font Isaac, Dead Cells et Spelunky : le hasard decide de la
 * FORME de l'etage, la main decide du contenu de chaque piece. Un generateur
 * qui invente aussi le contenu produit une variete sans intention — beaucoup
 * de salles differentes, aucune memorable.
 *
 * ## Pourquoi un modele ne decrit que l'interieur
 *
 * Le pourtour appartient a l'assemblage : c'est lui qui sait quelles portes
 * percer, et il ne le sait qu'apres avoir relie toutes les salles. Un modele
 * qui dessinerait ses propres murs devrait donc etre repris apres coup, et une
 * porte percee dans un mur dessine a la main rouvrirait la question a chaque
 * modele. L'interieur seul, et le pourtour reste au moteur.
 *
 * ## Pourquoi un modele n'a pas a connaitre ses portes
 *
 * Isaac range ses salles par configuration de portes — une salle a porte nord,
 * une salle a portes nord et est, et ainsi de suite jusqu'a quinze familles.
 * C'est beaucoup de dessins pour une propriete qui se garantit autrement : si
 * la CROIX centrale reste libre, les quatre portes possibles sont reliees
 * entre elles quelle que soit la configuration. Un modele est alors valable
 * partout, et quatre dessins valent quinze.
 *
 * Cette croix n'est pas une convention polie : elle est VERIFIEE. Un modele
 * qui la barre est refuse a la construction, avec la case fautive. Refuser
 * tot vaut mieux que decouvrir en jouant qu'une salle sur douze est close.
 */

/** Ce qu'une lettre de modele veut dire. */
export interface Symboles {
  /**
   * Les lettres qui posent un bloc solide.
   *
   * Une chaine et non un tableau : on ecrit `'#O'` et l'on voit d'un coup ce
   * qui bloque.
   */
  blocs: string
  /** Lettre vers identifiant d'espece. */
  entites: Record<string, string>
}

export const SYMBOLES_VIDE: Symboles = { blocs: '#', entites: {} }

export interface ModeleSalle {
  nom: string
  /**
   * Les roles auxquels ce modele convient. Vide : tous sauf le depart.
   *
   * Le depart est exclu par principe et non par oubli : on ne veut ni bloc ni
   * creature a l'endroit exact ou le joueur apparait, et l'exception est plus
   * courte a ecrire ici qu'a repeter dans chaque modele.
   */
  roles: string[]
  /** Le dessin de l'INTERIEUR, une lettre par case. */
  plan: string[]
  /** Poids du tirage. Un modele deux fois plus lourd sort deux fois plus. */
  poids: number
}

export function modele(nom: string, plan: string[], p: Partial<ModeleSalle> = {}): ModeleSalle {
  return { nom, plan, roles: p.roles ?? [], poids: p.poids ?? 1 }
}

/**
 * La croix libre d'une salle, en coordonnees de MODELE.
 *
 * L'assemblage raisonne en coordonnees de salle, pourtour compris ; un modele
 * commence a la premiere case interieure. Le decalage d'une case entre les
 * deux est exactement le genre de detail qui se paie en salles closes, donc il
 * se calcule ici, une fois.
 */
export function croixLibre(
  largeurSalle: number, hauteurSalle: number, largeurPorte: number, hauteurPorte: number,
): { x0: number; x1: number; y0: number; y1: number } {
  const bx = Math.floor((largeurSalle - largeurPorte) / 2) - 1
  const by = Math.floor((hauteurSalle - hauteurPorte) / 2) - 1
  return { x0: bx, x1: bx + largeurPorte - 1, y0: by, y1: by + hauteurPorte - 1 }
}

/**
 * Ce qui ne va pas dans un modele. Liste vide : il est bon.
 *
 * Elle rend des PHRASES et non un booleen : un modele refuse sans la case
 * fautive envoie chercher a la main dans dix-huit colonnes sur neuf.
 */
export function verifierModele(
  m: ModeleSalle, largeur: number, hauteur: number,
  symboles: Symboles, croix: { x0: number; x1: number; y0: number; y1: number },
): string[] {
  const plaintes: string[] = []
  if (m.plan.length !== hauteur) {
    plaintes.push(`« ${m.nom} » a ${m.plan.length} rangees, il en faut ${hauteur}`)
  }
  m.plan.forEach((ligne, y) => {
    if (ligne.length !== largeur) {
      plaintes.push(`« ${m.nom} » rangee ${y} : ${ligne.length} cases, il en faut ${largeur}`)
    }
    for (let x = 0; x < ligne.length; x++) {
      const c = ligne[x]
      if (c === '.') continue
      const bloc = symboles.blocs.includes(c)
      if (!bloc && !symboles.entites[c]) {
        plaintes.push(`« ${m.nom} » case ${x},${y} : la lettre « ${c} » ne veut rien dire`)
        continue
      }
      // La croix relie les quatre portes possibles. La barrer ferme la salle
      // pour certaines configurations seulement — donc une fois sur douze, et
      // seulement chez le joueur.
      if (!bloc) continue
      const dansBande = (x >= croix.x0 && x <= croix.x1) || (y >= croix.y0 && y <= croix.y1)
      if (dansBande) {
        plaintes.push(`« ${m.nom} » case ${x},${y} : un bloc barre la croix des portes`)
      }
    }
  })
  if (m.poids <= 0) plaintes.push(`« ${m.nom} » a un poids nul : il ne sortira jamais`)
  return plaintes
}

/**
 * Un modele lu a l'endroit, ou retourne.
 *
 * Le retournement quadruple la variete sans un dessin de plus, et il est SUR :
 * la croix libre est centree, donc symetrique sur les deux axes, donc un
 * modele valable le reste retourne. Ce n'est pas un hasard heureux, c'est la
 * raison pour laquelle la croix est centree.
 */
export function lireModele(
  m: ModeleSalle, x: number, y: number, miroirX: boolean, miroirY: boolean,
  largeur: number, hauteur: number,
): string {
  const lx = miroirX ? largeur - 1 - x : x
  const ly = miroirY ? hauteur - 1 - y : y
  return m.plan[ly]?.[lx] ?? '.'
}

/**
 * Choisit un modele pour ce role, par tirage pondere.
 *
 * Rend `null` quand aucun ne convient — et c'est un cas normal, pas une
 * erreur : une salle sans modele retombe sur les amas tires au sort, ce qui
 * permet d'ajouter des modeles un par un au lieu d'avoir a couvrir tous les
 * roles avant que le premier ne serve.
 */
export function choisirModele(
  modeles: ModeleSalle[], role: string, tirage: () => number,
): ModeleSalle | null {
  const bons = modeles.filter((m) => m.roles.length === 0 || m.roles.includes(role))
  if (bons.length === 0) return null
  const total = bons.reduce((s, m) => s + m.poids, 0)
  if (total <= 0) return null
  let n = tirage() * total
  for (const m of bons) {
    n -= m.poids
    if (n < 0) return m
  }
  return bons[bons.length - 1]
}
