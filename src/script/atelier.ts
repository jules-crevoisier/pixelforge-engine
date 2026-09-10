import type { Script } from '../runtime/jeu.ts'

/**
 * L'atelier : ce qui transforme un texte en script attache a un noeud.
 *
 * ## Ce que c'est, et ce que ce n'est pas
 *
 * Ce n'est PAS un bac a sable de securite. Le code vient de la personne qui
 * l'ecrit, il tourne dans son propre navigateur, et rien ici ne l'empecherait
 * de joindre le monde exterieur si elle le voulait vraiment — `new Function`
 * n'isole rien.
 *
 * C'est une contrainte de CONCEPTION, et elle a une raison precise : un script
 * qui touche au DOM, au reseau ou au systeme de fichiers n'est plus exportable.
 * Le projet promet de tourner ailleurs — en Python, en Rust, dans Godot — et
 * cette promesse ne tient que si les scripts ne parlent qu'a `c` et `n`. La
 * regle refuse donc ce qui ne passerait pas la frontiere, et elle le DIT au
 * lieu de laisser decouvrir le probleme le jour de l'export.
 *
 * ## Pourquoi les erreurs n'arretent pas le jeu
 *
 * Un script rate est la chose la plus normale du monde pendant qu'on l'ecrit.
 * S'il faisait tomber la boucle, on perdrait la scene a chaque faute de frappe.
 * Il est donc entoure d'un filet : la premiere erreur est rapportee, et apres
 * quelques-unes le script se met en sommeil — repeter la meme exception
 * soixante fois par seconde ne dit rien de plus et rend la page inutilisable.
 */

/** Ce qu'un script ne peut pas nommer, parce que cela ne s'exporte pas. */
export const INTERDITS = [
  'window', 'document', 'globalThis', 'self', 'top', 'parent',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'SharedWorker',
  'eval', 'Function', 'import', 'require', 'process',
  'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location',
  'alert', 'confirm', 'prompt',
]

export interface Compilation {
  ok: boolean
  script: Script | null
  /** Message a montrer, ou null. */
  erreur: string | null
  /** Avertissements : cela compile, mais cela merite un mot. */
  avertissements: string[]
}

/**
 * Retire chaines et commentaires, en gardant la longueur.
 *
 * L'analyse qui suit cherche des identifiants. Sans ce nettoyage, le mot
 * « document » dans un commentaire ou dans un message ferait refuser un script
 * parfaitement portable — et refuser a tort est pire que ne rien verifier,
 * parce qu'on cesse alors de croire la regle.
 */
export function sansChainesNiCommentaires(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const d = source[i + 1]
    if (c === '/' && d === '/') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && d === '*') {
      out += '  '
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      out += '  '
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const guillemet = c
      out += ' '
      i++
      while (i < source.length && source[i] !== guillemet) {
        if (source[i] === '\\') { out += '  '; i += 2; continue }
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      out += ' '
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

/** Les noms interdits employes par ce source, dans l'ordre. */
export function nomsInterdits(source: string): string[] {
  const nu = sansChainesNiCommentaires(source)
  const trouves: string[] = []
  for (const mot of INTERDITS) {
    // Pas apres un point : `n.document` est une propriete du noeud, pas le DOM.
    const re = new RegExp(`(^|[^.\\w$])${mot}\\b`)
    if (re.test(nu)) trouves.push(mot)
  }
  return trouves
}

/** Les boucles dont on ne peut pas prouver qu'elles s'arretent. */
export function bouclesSansFin(source: string): boolean {
  const nu = sansChainesNiCommentaires(source)
  return /while\s*\(\s*(true|1)\s*\)/.test(nu) || /for\s*\(\s*;\s*;\s*\)/.test(nu)
}

/** Combien de fois un script peut echouer avant d'etre mis en sommeil. */
export const ERREURS_AVANT_SOMMEIL = 5

export interface Rapport {
  /** Derniere erreur rencontree a l'execution, ou null. */
  erreur: string | null
  /** Nombre d'erreurs depuis la compilation. */
  compte: number
  endormi: boolean
}

/**
 * Compile un script.
 *
 * `surErreur` recoit le rapport a chaque echec d'execution : c'est ainsi que
 * l'editeur affiche la faute sans que l'atelier ait besoin de connaitre son
 * interface.
 */
export function compiler(source: string, surErreur?: (r: Rapport) => void): Compilation {
  const avertissements: string[] = []
  const interdits = nomsInterdits(source)
  if (interdits.length) {
    return {
      ok: false,
      script: null,
      erreur: `Ce script emploie ${interdits.join(', ')}. Un script ne parle qu'à `
        + `« c » (le contexte) et « n » (son nœud) : c'est ce qui lui permet d'être `
        + `exporté vers un autre langage. Ce qui touche à la page ne passerait pas la frontière.`,
      avertissements,
    }
  }
  if (bouclesSansFin(source)) {
    // Un refus et non un avertissement. On ne peut pas interrompre du
    // JavaScript en cours : appliquer un script dont on SAIT qu'il fige
    // l'onglet reviendrait a fermer la porte derriere la personne. Et un
    // script est appele une fois par pas — une boucle sur le temps n'y a
    // aucune raison d'etre.
    return {
      ok: false,
      script: null,
      erreur: 'Cette boucle n\'a pas de condition de sortie : elle figerait l\'onglet, '
        + 'et rien ici ne pourrait l\'interrompre. Un script est appelé une fois par pas — '
        + 'c\'est le moteur qui boucle, pas vous.',
      avertissements,
    }
  }

  let brut: (c: unknown, n: unknown) => void
  try {
    // eslint-disable-next-line no-new-func
    brut = new Function('c', 'n', `"use strict";\n${source}`) as (c: unknown, n: unknown) => void
  } catch (e) {
    return {
      ok: false,
      script: null,
      erreur: e instanceof Error ? `${e.name} : ${e.message}` : String(e),
      avertissements,
    }
  }

  const rapport: Rapport = { erreur: null, compte: 0, endormi: false }
  const script: Script = (c, n) => {
    if (rapport.endormi) return
    try {
      brut(c, n)
    } catch (e) {
      rapport.compte++
      rapport.erreur = e instanceof Error ? `${e.name} : ${e.message}` : String(e)
      if (rapport.compte >= ERREURS_AVANT_SOMMEIL) rapport.endormi = true
      surErreur?.(rapport)
    }
  }

  return { ok: true, script, erreur: null, avertissements }
}

/** Le pense-bete montre a cote de l'editeur. */
export const AIDE_SCRIPT = `c.dt              le pas, en secondes (fixe)
c.pas             numéro du pas depuis « Jouer »
c.entrees.axe()   { x, y } en -1, 0, 1
c.entrees.tenue('saut')      touche maintenue ?
c.entrees.consommer('action')  appui, servi une fois
c.bouger(corps, dx, dy)      déplace contre le décor
c.trouver('nom')  un nœud de la scène
c.carte.solide(cx, cy)       la case bloque-t-elle ?

c.jouer('coup')   un son du projet, par son nom
c.musique('boss') lance une musique — la même : rien
c.dire('accueil') ouvre une suite de répliques
c.secouer(3, 200) secousse de caméra (pixels, ms)
c.geler(50)       gèle la simulation (hit-stop)
c.salle           le nom du tableau où l'on est
c.poser('slime', x, y)       une entité du catalogue
c.retirer(noeud)  l'enlève de la scène

n.x, n.y          position du nœud
n.image           image de la planche
n.miroir          retourné ?
n.visible
n.etat            à vous : le moteur n'y touche pas
n.enfants         dont le corps de collision`
