import type { ProjetSerialise } from '../export/format.ts'

/**
 * Les scripts du projet, en VRAIS fichiers dans le dossier de travail.
 *
 * ## Pourquoi
 *
 * Un textarea n'est pas un editeur de code. Celui qui a VS Code veut sa
 * coloration, sa recherche, son historique — et il a raison. A chaque
 * enregistrement, les scripts du projet s'ecrivent donc en fichiers
 * `scripts/*.js` a cote du `projet.json` ; a chaque « Jouer », l'editeur les
 * relit, et ce qui a change dans le dossier ENTRE dans le projet. La boucle
 * devient : editer dans son editeur, appuyer sur Jouer ici.
 *
 * ## La regle de verite
 *
 * Au moment de Jouer, le FICHIER a raison : c'est lui qu'on vient de
 * modifier dehors. Entre deux Jouer, le panneau a raison : c'est lui qu'on
 * vient de taper. Le contenu part VERBATIM — pas d'en-tete ajoute, pas de
 * marqueur — parce que tout ce qu'on ajoute a l'ecriture, il faudrait le
 * retirer a la lecture, et le premier decalage fabriquerait des doublons.
 * Le contrat (c, n, pas de DOM) tient dans un LISEZMOI a cote, qui n'est
 * jamais relu.
 */

export interface FichierScript { nom: string; contenu: string }

/** Un nom de fichier sur, quel que soit l'identifiant. */
const surnom = (s: string): string => s.replace(/[^a-zA-Z0-9._-]/g, '-')

export const LISEZMOI_SCRIPTS = `Les scripts du projet, un fichier par script.

- espece-<id>.js       : le pas d'une espece a l'intention « script »
- declencheur-<nom>.js : le script d'un declencheur

Chaque script recoit « c » (le contexte : c.dt, c.entrees, c.bouger,
c.jouer, c.dire, c.poser…) et « n » (son nœud : n.x, n.y, n.etat…).
Ce qui touche a la page — document, fetch, window — est refuse :
un script n'est exportable que s'il ne parle qu'a c et n.

Ces fichiers sont REECRITS a chaque enregistrement depuis l'editeur,
et RELUS a chaque « Jouer » : ce que vous changez ici entre dans le
projet, ce que vous tapez dans l'editeur ressort ici.
`

/** Les fichiers a ecrire pour ce projet. Le LISEZMOI n'est jamais relu. */
export function scriptsVersFichiers(p: ProjetSerialise): FichierScript[] {
  const fichiers: FichierScript[] = []
  for (const e of p.especes ?? []) {
    if (e.comportement !== 'script' || !e.script?.trim()) continue
    fichiers.push({ nom: `espece-${surnom(e.id)}.js`, contenu: e.script })
  }
  for (const d of p.declencheurs ?? []) {
    if (!d.script?.trim()) continue
    fichiers.push({ nom: `declencheur-${surnom(d.nom)}.js`, contenu: d.script })
  }
  if (fichiers.length) fichiers.push({ nom: 'LISEZMOI.txt', contenu: LISEZMOI_SCRIPTS })
  return fichiers
}

export interface RelectureScripts {
  projet: ProjetSerialise
  /** Ce qui a ete adopte depuis le dossier : « espèce gardien », ... */
  adoptes: string[]
  /** Ce qu'on a laisse de cote, et pourquoi. */
  notes: string[]
}

/**
 * Fait entrer les fichiers du dossier dans le projet.
 *
 * Seul ce qui DIFFERE est adopte — et dit. Un fichier qui ne correspond a
 * rien est note, pas jete en silence : un `espece-gardein.js` mal orthographie
 * qui ne ferait rien du tout serait introuvable autrement.
 */
export function appliquerFichiersScripts(
  p: ProjetSerialise, fichiers: FichierScript[],
): RelectureScripts {
  const adoptes: string[] = []
  const notes: string[] = []
  let projet = p

  for (const f of fichiers) {
    if (f.nom === 'LISEZMOI.txt') continue
    const espece = /^espece-(.+)\.js$/.exec(f.nom)
    if (espece) {
      const cible = (p.especes ?? []).find((e) => surnom(e.id) === espece[1])
      if (!cible) { notes.push(`${f.nom} : aucune espèce « ${espece[1]} »`); continue }
      if (cible.script === f.contenu) continue
      projet = {
        ...projet,
        especes: projet.especes.map((e) => (e.id === cible.id ? { ...e, script: f.contenu } : e)),
      }
      adoptes.push(`espèce ${cible.id}`)
      continue
    }
    const declencheur = /^declencheur-(.+)\.js$/.exec(f.nom)
    if (declencheur) {
      const cible = (p.declencheurs ?? []).find((d) => surnom(d.nom) === declencheur[1])
      if (!cible) { notes.push(`${f.nom} : aucun déclencheur « ${declencheur[1]} »`); continue }
      if (cible.script === f.contenu) continue
      projet = {
        ...projet,
        declencheurs: (projet.declencheurs ?? []).map((d) => (
          d.nom === cible.nom ? { ...d, script: f.contenu } : d
        )),
      }
      adoptes.push(`déclencheur ${cible.nom}`)
      continue
    }
    notes.push(`${f.nom} : ni espece-*.js ni declencheur-*.js, laissé tel quel`)
  }
  return { projet, adoptes, notes }
}
