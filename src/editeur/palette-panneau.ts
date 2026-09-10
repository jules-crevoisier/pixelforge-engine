import type { Jeu } from '../runtime/jeu.ts'
import type { Atlas } from '../runtime/atlas.ts'
import { rectDeTuile } from '../runtime/atlas.ts'
import type { Espece, Peuplement } from '../runtime/entites.ts'
import { MATIERES, FORMES_PENTE_NOMMEES, PENTE, BLESSANTE } from '../tuiles/tilemap.ts'
import type { Outil } from './edition.ts'

/**
 * La palette de l'outil courant.
 *
 * ## Pourquoi elle montre des DESSINS et non des noms
 *
 * Une liste « gelee, chauve-souris, coeur » demande de savoir a quoi
 * ressemblent une gelee et un coeur. Une planche de vignettes ne le demande
 * pas. Sur un editeur de pixel art, montrer le pixel est toujours la bonne
 * reponse — c'est la matiere du travail.
 *
 * ## Pourquoi une vignette est un canevas et non une image
 *
 * On decoupe une case dans une planche deja peinte. Passer par un `data:` URL
 * demanderait un encodage PNG par vignette, a chaque changement de monde, pour
 * un resultat identique. Un canevas de seize pixels agrandi au facteur entier
 * coute un `drawImage`.
 */
export interface AttachesPalette {
  panneau: HTMLElement
  titre: HTMLElement
  grille: HTMLElement
  note: HTMLElement
}

/** Agrandissement des vignettes. Entier, comme tout le reste. */
const ZOOM = 2

function vignette(atlas: Atlas, index: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = atlas.largeur * ZOOM
  c.height = atlas.hauteur * ZOOM
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    const { sx, sy } = rectDeTuile(atlas, index)
    ctx.drawImage(atlas.canevas as CanvasImageSource, sx, sy, atlas.largeur, atlas.hauteur,
      0, 0, c.width, c.height)
  }
  return c
}

export class Palette {
  private a: AttachesPalette
  private jeu: () => Jeu
  private choix: (v: { espece?: string; tuile?: number; calque?: string; matiere?: number }) => void

  constructor(
    attaches: AttachesPalette, jeu: () => Jeu,
    choix: (v: { espece?: string; tuile?: number; calque?: string; matiere?: number }) => void,
  ) {
    this.a = attaches
    this.jeu = jeu
    this.choix = choix
  }

  /** Remplit la palette pour cet outil, ou la cache si l'outil n'en a pas. */
  montrer(
    outil: Outil, especes: Espece[], peuplement: Peuplement | null,
    actuel: { espece: string | null; tuile: number; calque: string | null; matiere: number },
  ): void {
    this.a.grille.innerHTML = ''
    if (outil === 'entite') { this.remplirEspeces(especes, peuplement, actuel.espece); return }
    if (outil === 'tuile') { this.remplirTuiles(actuel); return }
    if (outil === 'collision') { this.remplirMatieres(actuel.matiere); return }
    this.a.panneau.hidden = true
  }

  /**
   * Les matieres : des cases a cocher, PUIS une forme de pente exclusive.
   *
   * Les cinq matieres se combinent — une pointe peut etre solide, de l'eau
   * peut blesser. Les six formes de pente, non : une case n'a qu'une surface,
   * et le format ne sait pas ecrire « monte a droite » et « solide » ensemble.
   * Les proposer comme des cases a cocher laisserait composer ce que
   * l'enregistrement perdrait — et c'est exactement le genre de perte qu'on
   * ne remarque qu'en rouvrant le projet.
   *
   * Choisir une pente efface donc les matieres qui la contrediraient, en
   * gardant « blessante » : une rampe herissee de pointes existe.
   */
  private remplirMatieres(matiere: number): void {
    this.a.panneau.hidden = false
    this.a.titre.textContent = 'Matière'
    let courante = matiere
    const dire = (): void => {
      const forme = FORMES_PENTE_NOMMEES.find((f) => (courante & PENTE) === f.drapeaux)
      const noms = MATIERES.filter((m) => (courante & m.drapeau) !== 0).map((m) => m.nom)
      if (forme) noms.unshift(forme.nom)
      this.a.note.textContent = noms.length
        ? `${noms.join(' + ')}${forme ? ' — une pente n’est jamais solide.' : ' — les drapeaux se combinent.'}`
        : 'Aucun drapeau : la case ne fait rien. Clic droit efface aussi.'
    }
    const boutons: { rafraichir: () => void }[] = []
    const poser = (v: number): void => {
      courante = v
      for (const b of boutons) b.rafraichir()
      this.choix({ matiere: courante })
      dire()
    }
    for (const m of MATIERES) {
      const b = document.createElement('button')
      b.className = 'matiere'
      b.textContent = m.nom
      b.title = m.aide
      b.addEventListener('click', () => {
        // Cocher une matiere pleine retire la pente : les deux decrivent le
        // meme sol, et le fichier ne peut en porter qu'un.
        const sansPente = m.drapeau === BLESSANTE ? courante : courante & ~PENTE
        poser(sansPente ^ m.drapeau)
      })
      boutons.push({ rafraichir: () => b.classList.toggle('actif', (courante & m.drapeau) !== 0) })
      this.a.grille.appendChild(b)
    }
    for (const f of FORMES_PENTE_NOMMEES) {
      const b = document.createElement('button')
      b.className = 'matiere pente'
      b.textContent = f.nom
      b.title = f.aide
      b.addEventListener('click', () => {
        // Recliquer la forme choisie la retire : sans cela on ne pourrait
        // plus revenir a une case plate sans passer par le clic droit.
        const deja = (courante & PENTE) === f.drapeaux
        poser(deja ? courante & ~PENTE : (courante & BLESSANTE) | f.drapeaux)
      })
      boutons.push({ rafraichir: () => b.classList.toggle('actif', (courante & PENTE) === f.drapeaux) })
      this.a.grille.appendChild(b)
    }
    for (const b of boutons) b.rafraichir()
    dire()
  }

  private remplirEspeces(
    especes: Espece[], peuplement: Peuplement | null, choisie: string | null,
  ): void {
    this.a.panneau.hidden = false
    this.a.titre.textContent = 'Entités'
    if (especes.length === 0) {
      this.a.note.textContent = 'Ce monde n’a pas de catalogue d’espèces.'
      return
    }
    for (const e of especes) {
      const atlas = this.jeu().sprites.get(e.planche)
      const b = document.createElement('button')
      b.title = `${e.nom} — ${e.comportement}, ${e.pv} pv`
        + (e.degats ? `, ${e.degats} dégât${e.degats > 1 ? 's' : ''}` : '')
        + (e.soigne ? `, rend ${e.soigne}` : '')
      b.classList.toggle('actif', e.id === choisie)
      // La vignette est la premiere image du clip de l'espece, et non la case
      // zero de sa planche : celle-la est du sol ou un morceau de mur.
      if (atlas) b.appendChild(vignette(atlas, peuplement?.premiereImage(e) ?? 0))
      else b.textContent = e.nom
      b.addEventListener('click', () => {
        this.choix({ espece: e.id })
        for (const q of this.a.grille.querySelectorAll('button')) q.classList.remove('actif')
        b.classList.add('actif')
      })
      this.a.grille.appendChild(b)
    }
    this.a.note.textContent = 'Clic pour poser, clic droit pour retirer. '
      + 'Une entité posée part dans le fichier de projet.'
  }

  private remplirTuiles(actuel: { tuile: number; calque: string | null }): void {
    this.a.panneau.hidden = false
    this.a.titre.textContent = 'Tuiles'
    const jeu = this.jeu()
    // La planche de la carte affichee : c'est celle dont on peint les tuiles.
    const paire = [...jeu.cartes.values()][0]
    const atlas = paire?.atlas
    if (!atlas) {
      this.a.note.textContent = 'Aucune planche chargée.'
      return
    }
    const cases = atlas.cases
    for (let i = 0; i < cases; i++) {
      const b = document.createElement('button')
      b.title = `Tuile ${i}`
      b.classList.toggle('actif', i === actuel.tuile)
      b.appendChild(vignette(atlas, i))
      b.addEventListener('click', () => {
        this.choix({ tuile: i })
        for (const q of this.a.grille.querySelectorAll('button')) q.classList.remove('actif')
        b.classList.add('actif')
      })
      this.a.grille.appendChild(b)
    }
    this.a.note.textContent = 'Pose la tuile telle quelle, sans autotiling : '
      + 'pour les cas où le voisinage ne sait pas deviner.'
  }
}
