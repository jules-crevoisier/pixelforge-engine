import type { ProjetSerialise } from '../export/format.ts'
import type { OngletProjet } from './projet-panneau.ts'

/**
 * Le panneau des fichiers : ce qu'un moteur montre toujours, et qu'on cachait.
 *
 * ## Pourquoi il existe
 *
 * « Compare a Godot, il me manque tout le systeme de fichiers, l'importation
 * des assets » — et c'etait vrai, mais pas comme on le croit. Tout existait :
 * le dossier de travail, l'import d'images, les exports. Tout etait CACHE —
 * un bouton ici, un autre au fond d'un onglet — et un moteur dont on ne voit
 * pas les fichiers ne donne pas l'impression d'en avoir. Ce panneau rend
 * visible ce qui etait epars : le dossier de travail a gauche du disque, et
 * l'inventaire du projet, cliquable, chaque entree menant a SON editeur.
 *
 * ## Ce qu'il n'est pas
 *
 * Ce n'est pas un explorateur generique. Un projet PixelForge tient dans UN
 * fichier — c'est un choix, celui qui permet d'ouvrir un jeu en le deposant
 * sur la page — et le panneau ne fait pas semblant du contraire : la colonne
 * « dans le projet » montre le contenu du fichier, pas des sous-dossiers
 * inventes. Le dossier de travail, lui, est un vrai dossier du disque : ce
 * qu'on y voit est ce que l'explorateur du systeme y verrait.
 */

/** Ce que le panneau sait faire — fourni par main.ts, qui tient tout. */
export interface CrochetsFichiers {
  /** Le projet courant, pour l'inventaire. */
  projet(): ProjetSerialise
  /** Le nom du dossier de travail, ou null. */
  nomDossier(): string | null
  /** L'API des dossiers existe-t-elle dans ce navigateur ? */
  apiDossier(): boolean
  /** Ouvre le selecteur de dossier du navigateur. */
  choisirDossier(): Promise<void>
  /** Tous les fichiers du dossier de travail. */
  listerDossier(): Promise<string[]>
  /** Un fichier du dossier, en octets — pour une image. */
  lireFichier(nom: string): Promise<File | null>
  /** Un fichier du dossier, en texte — pour un projet. */
  lireTexte(nom: string): Promise<string | null>
  /** Relit un projet .json et ouvre l'editeur dessus. */
  ouvrirProjet(texte: string, nom: string): void
  /** Importe une image ou un .pixelforge en planche. */
  importerAsset(f: File): Promise<void>
  /** Ouvre le panneau Projet sur un onglet, et une cible nommee. */
  ouvrirProjetPanneau(onglet: OngletProjet, cible?: string): void
  /** Met la carte nommee sous le pinceau. */
  editerCarte(nom: string): void
  dire(m: string): void
}

/** Les extensions d'image que l'import sait decouper en planche. */
export const EXTENSIONS_IMAGE = ['.png', '.gif', '.webp', '.jpg', '.jpeg', '.bmp']

export type GenreFichier = 'projet' | 'image' | 'sprites' | 'son' | 'archive' | 'autre'

/** Ce qu'un nom de fichier permet d'en faire. */
export function genreDe(nom: string): GenreFichier {
  const bas = nom.toLowerCase()
  // .tmj (Tiled) et .ldtk sont du JSON : le meme aiguillage les recoit, et
  // c'est le CONTENU qui decide — un .json peut etre du Tiled exporte.
  if (bas.endsWith('.json') || bas.endsWith('.tmj') || bas.endsWith('.ldtk')) return 'projet'
  if (EXTENSIONS_IMAGE.some((e) => bas.endsWith(e))) return 'image'
  if (bas.endsWith('.pixelforge')) return 'sprites'
  if (bas.endsWith('.wav')) return 'son'
  if (bas.endsWith('.zip')) return 'archive'
  return 'autre'
}

const ICONES: Record<GenreFichier, string> = {
  projet: '📄', image: '🖼', sprites: '🎞', son: '🔊', archive: '📦', autre: '·',
}

export class PanneauFichiers {
  private panneau: HTMLElement
  private corps: HTMLElement
  private bascule: HTMLButtonElement
  private crochets: CrochetsFichiers
  /** La derniere liste du dossier, pour redessiner sans relister. */
  private fichiers: string[] = []

  constructor(
    elements: {
      panneau: HTMLElement; corps: HTMLElement
      bascule: HTMLButtonElement; fermer: HTMLButtonElement
    },
    crochets: CrochetsFichiers,
  ) {
    this.panneau = elements.panneau
    this.corps = elements.corps
    this.bascule = elements.bascule
    this.crochets = crochets
    elements.bascule.addEventListener('click', () => {
      if (this.panneau.hidden) this.ouvrir()
      else this.fermer()
    })
    elements.fermer.addEventListener('click', () => this.fermer())
  }

  get ouvert(): boolean { return !this.panneau.hidden }

  ouvrir(): void {
    this.panneau.hidden = false
    this.bascule.classList.add('actif')
    this.montrer()
    void this.rafraichir()
  }

  fermer(): void {
    this.panneau.hidden = true
    this.bascule.classList.remove('actif')
  }

  /** Reliste le dossier de travail, puis redessine. */
  async rafraichir(): Promise<void> {
    this.fichiers = this.crochets.nomDossier() ? await this.crochets.listerDossier() : []
    this.montrer()
  }

  /** Refait le panneau — projet ET dossier — depuis l'etat courant. */
  montrer(): void {
    if (!this.ouvert) return
    this.corps.textContent = ''
    this.blocDossier()
    this.blocProjet()
  }

  /* ---------------------------------------------------------------- */
  /* Le dossier de travail                                             */
  /* ---------------------------------------------------------------- */

  private blocDossier(): void {
    const d = this.bloc('Dossier de travail')
    const nom = this.crochets.nomDossier()

    if (!this.crochets.apiDossier()) {
      const note = document.createElement('p')
      note.className = 'ligne menu'
      note.textContent = 'Ce navigateur ne donne pas accès aux dossiers du disque. '
        + 'Glissez-déposez vos fichiers sur la page : une image devient une planche, '
        + 'un .json s’ouvre comme projet.'
      d.appendChild(note)
      return
    }

    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(
      this.bouton(nom ? 'Changer…' : 'Choisir un dossier…',
        'Le dossier du disque où le projet s’enregistre et où vivent vos assets',
        () => { void this.crochets.choisirDossier().then(() => this.rafraichir()) }),
    )
    if (nom) {
      actions.append(this.bouton('Rafraîchir', 'Relire le contenu du dossier',
        () => { void this.rafraichir() }))
    }
    d.appendChild(actions)

    if (!nom) {
      const note = document.createElement('p')
      note.className = 'ligne menu'
      note.textContent = 'Aucun dossier choisi : l’enregistrement passe par un téléchargement. '
        + 'Avec un dossier, vos projets, images et exports vivent au même endroit — '
        + 'et cette liste les montre.'
      d.appendChild(note)
      return
    }

    const titre = document.createElement('p')
    titre.className = 'ligne menu'
    titre.textContent = `📁 ${nom} · ${this.fichiers.length} fichier(s)`
    d.appendChild(titre)

    const liste = document.createElement('div')
    liste.className = 'liste'
    for (const f of this.fichiers) {
      const genre = genreDe(f)
      const ligne = document.createElement('div')
      ligne.className = 'ligne'
      const etiquette = document.createElement('span')
      etiquette.className = 'nom'
      etiquette.textContent = `${ICONES[genre]} ${f}`
      ligne.appendChild(etiquette)
      if (genre === 'projet') {
        ligne.appendChild(this.bouton('Ouvrir', 'Relire ce projet dans l’éditeur', () => {
          void this.crochets.lireTexte(f).then((texte) => {
            if (texte === null) { this.crochets.dire(`« ${f} » est illisible.`); return }
            this.crochets.ouvrirProjet(texte, f)
          })
        }))
      } else if (genre === 'image' || genre === 'sprites' || genre === 'son') {
        const aide = genre === 'son'
          ? 'Faire de ce WAV un son du projet'
          : 'Découper cette image en planche du projet'
        ligne.appendChild(this.bouton('Importer', aide, () => {
          void this.crochets.lireFichier(f).then(async (fichier) => {
            if (!fichier) { this.crochets.dire(`« ${f} » est illisible.`); return }
            await this.crochets.importerAsset(fichier)
          })
        }))
      } else {
        // Un .zip : le panneau le MONTRE — c'est souvent l'export du projet —
        // sans pretendre savoir le rouvrir.
        etiquette.classList.add('menu')
      }
      liste.appendChild(ligne)
    }
    if (this.fichiers.length === 0) {
      const vide = document.createElement('p')
      vide.className = 'ligne menu'
      vide.textContent = 'Le dossier est vide. Enregistrer y écrira le projet ; '
        + 'Exporter y déposera les archives.'
      liste.appendChild(vide)
    }
    d.appendChild(liste)
  }

  /* ---------------------------------------------------------------- */
  /* L'inventaire du projet                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Tout ce que le fichier de projet contient, en categories cliquables.
   * Chaque entree ouvre l'editeur DE la chose — c'est ce qui fait d'une
   * liste un systeme de fichiers : le clic mene quelque part.
   */
  private blocProjet(): void {
    const p = this.crochets.projet()
    const d = this.bloc('Dans le projet')

    const categorie = (
      titre: string, entrees: { nom: string; detail?: string; aller?: () => void }[],
    ): void => {
      const t = document.createElement('p')
      t.className = 'ligne menu'
      t.textContent = `${titre} (${entrees.length})`
      d.appendChild(t)
      if (!entrees.length) return
      const liste = document.createElement('div')
      liste.className = 'liste'
      for (const e of entrees) {
        const ligne = document.createElement('div')
        ligne.className = 'ligne'
        const nom = document.createElement('span')
        nom.className = 'nom'
        nom.textContent = e.detail ? `${e.nom} · ${e.detail}` : e.nom
        ligne.appendChild(nom)
        if (e.aller) {
          const aller = e.aller
          ligne.appendChild(this.bouton('→', 'Ouvrir dans son éditeur', aller))
          ligne.style.cursor = 'pointer'
          ligne.addEventListener('dblclick', aller)
        }
        liste.appendChild(ligne)
      }
      d.appendChild(liste)
    }

    const ouvre = this.crochets.ouvrirProjetPanneau
    categorie('Cartes', p.cartes.map((c) => ({
      nom: c.nom,
      detail: `${c.largeur}×${c.hauteur}`,
      aller: () => this.crochets.editerCarte(c.nom),
    })))
    const compteNoeuds = (n: { enfants: unknown[] }): number =>
      1 + (n.enfants as { enfants: unknown[] }[]).reduce((t, e) => t + compteNoeuds(e), 0)
    categorie('Scènes', p.scenes.map((q) => ({
      nom: q.nom,
      detail: `${compteNoeuds(q.racine) - 1} nœud(s)`,
      aller: () => ouvre('scene', q.nom),
    })))
    categorie('Planches', p.planches.map((t) => ({
      nom: t.nom,
      detail: `${t.dessins.length} case(s)`,
      aller: () => ouvre('dessin', t.nom),
    })))
    categorie('Espèces', p.especes.map((e) => ({
      nom: e.id,
      detail: e.comportement,
      aller: () => ouvre('especes', e.id),
    })))
    categorie('Animations', (p.animations ?? []).map((a) => ({
      nom: a.nom,
      detail: `${a.images.length} image(s)`,
      aller: () => ouvre('animations', a.nom),
    })))
    categorie('Sons', (p.sons ?? []).map((q) => ({
      nom: q.nom,
      detail: `${q.duree} ms`,
      aller: () => ouvre('sons', q.nom),
    })))
    categorie('Musiques', (p.musiques ?? []).map((m) => ({
      nom: m.nom,
      detail: `${m.tempo} bpm`,
      aller: () => ouvre('sons'),
    })))
    categorie('Dialogues', (p.dialogues ?? []).map((q) => ({
      nom: q.nom,
      detail: `${q.repliques.length} réplique(s)`,
      aller: () => ouvre('textes'),
    })))
    categorie('Déclencheurs', (p.declencheurs ?? []).map((q) => ({
      nom: q.nom,
      detail: q.quand,
      aller: () => ouvre('jeu'),
    })))
  }

  /* ---------------------------------------------------------------- */
  /* Le meme vocabulaire de DOM que le panneau Projet                  */
  /* ---------------------------------------------------------------- */

  private bloc(titre: string): HTMLElement {
    const d = document.createElement('div')
    d.className = 'bloc'
    const h = document.createElement('h3')
    h.textContent = titre
    d.appendChild(h)
    this.corps.appendChild(d)
    return d
  }

  private bouton(texte: string, titre: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.textContent = texte
    b.title = titre
    b.addEventListener('click', action)
    return b
  }
}
