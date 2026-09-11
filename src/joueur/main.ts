import { Jeu } from '../runtime/jeu.ts'
import { mondeDepuisProjet } from '../editeur/monde-projet.ts'
import { atlasDepuisLettres } from '../runtime/atlas.ts'
import type { ProjetSerialise } from '../export/format.ts'

/**
 * Le joueur autonome : la page qui JOUE un projet, et rien d'autre.
 *
 * ## Pourquoi elle existe
 *
 * Un moteur qui ne sait pas LIVRER n'est pas un moteur : creer un jeu, c'est
 * pour le donner a jouer. Cette page est ce que l'export « Jeu web » emballe —
 * le meme runtime que l'editeur, le meme chemin de relecture qu'un fichier
 * ouvert, sans un bouton d'edition. Si le jeu se comporte autrement ici que
 * sous « Jouer », c'est un bug : il n'y a qu'un seul chemin.
 *
 * ## D'ou vient le projet
 *
 * D'abord du <script id="projet"> que l'export inline — c'est ce qui rend le
 * fichier exporte AUTOPORTEUR : il s'ouvre en double-clic, sans serveur.
 * Sinon, de `./projet.json` a cote de la page : c'est le mode de
 * developpement, et celui d'un dossier decompresse qu'on prefere garder en
 * deux fichiers.
 */
async function projetDe(): Promise<ProjetSerialise | null> {
  const inline = document.getElementById('projet')?.textContent?.trim()
  if (inline) {
    try { return JSON.parse(inline) as ProjetSerialise } catch { /* on essaie le fichier */ }
  }
  try {
    const r = await fetch('./projet.json')
    if (r.ok) return await r.json() as ProjetSerialise
  } catch { /* pas de fichier non plus */ }
  return null
}

const canevas = document.getElementById('vue') as HTMLCanvasElement

function dire(message: string): void {
  const p = document.createElement('p')
  p.style.cssText = 'color:#aeb6c6;font:14px system-ui;max-width:40em;text-align:center'
  p.textContent = message
  canevas.replaceWith(p)
}

// Pas d'await au sommet du module : la cible de build de l'editeur ne le
// permet pas, et une fonction lancee tout de suite fait le meme travail.
void (async () => {
const projet = await projetDe()
if (!projet || typeof projet.version !== 'number') {
  dire('Aucun projet à jouer : cette page attend un projet inline, ou un projet.json à côté d’elle. '
    + 'Exportez « Jeu web » depuis l’éditeur.')
} else {
  document.title = projet.nom || 'PixelForge'
  const monde = mondeDepuisProjet(projet, projet.nom)
  const jeu = new Jeu(canevas, monde.racine, monde.carte, {
    vue: monde.vue,
    projection: monde.projection,
  })
  monde.installer(jeu)
  // Toute planche devient une source de sprites — la meme regle que
  // l'editeur, pour la meme raison : rien ne doit dependre de qui a branche.
  for (const t of monde.planches) {
    if (jeu.sprites.has(t.nom)) continue
    jeu.sprites.set(t.nom,
      atlasDepuisLettres(t.dessins, t.cle, t.largeurCase, t.colonnes, t.hauteurCase))
  }
  jeu.ecran.redimensionner(monde.vue)
  jeu.cadrer()
  jeu.demarrer()
  canevas.focus()
  // Recuperer le focus au clic : sans lui, les fleches defilent la page
  // hote — le premier bug de tout jeu embarque dans un site.
  canevas.addEventListener('pointerdown', () => canevas.focus())
  // La sonde du banc : le meme usage que window.pfe dans l'editeur.
  ;(window as unknown as { pfj: unknown }).pfj = { jeu, monde }
}
})()
