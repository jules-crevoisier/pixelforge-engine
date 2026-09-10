import type { Jeu, Script } from '../runtime/jeu.ts'
import type { Noeud } from '../scene/noeud.ts'
import { compiler, AIDE_SCRIPT, ERREURS_AVANT_SOMMEIL, type Rapport } from '../script/atelier.ts'

/**
 * Le panneau de scripts : ecrire le comportement d'un noeud, dans l'editeur.
 *
 * ## Pourquoi la scene garde le texte et non la fonction
 *
 * Le noeud porte la SOURCE, pas le resultat de sa compilation. C'est ce qui
 * permet au script de partir dans le fichier de projet, d'etre relu par un
 * autre, de figurer dans un diff. Une fonction compilee ne serait qu'un objet
 * de plus en memoire, perdu au premier rechargement.
 *
 * ## Pourquoi on peut rétablir
 *
 * Les mondes de demonstration arrivent avec leurs propres scripts, ecrits en
 * TypeScript et compiles avec le moteur. Les remplacer doit rester un geste
 * reversible : sans cela, essayer une idee sur le heros casserait la
 * demonstration jusqu'au rechargement de la page, et l'on n'essaierait plus.
 */
const EXEMPLE = `// Ce nœud décrit un cercle autour de l'endroit où il était.
// « n.etat » est à vous : le moteur n'y touche jamais.
n.etat.x0 ??= n.x
n.etat.y0 ??= n.y
n.etat.t = (n.etat.t ?? 0) + c.dt

n.x = n.etat.x0 + Math.round(Math.cos(n.etat.t * 2) * 24)
n.y = n.etat.y0 + Math.round(Math.sin(n.etat.t * 2) * 12)
`

export interface AttachesAtelier {
  panneau: HTMLElement
  bascule: HTMLButtonElement
  selection: HTMLSelectElement
  source: HTMLTextAreaElement
  appliquer: HTMLButtonElement
  retablir: HTMLButtonElement
  fermer: HTMLButtonElement
  message: HTMLElement
  aide: HTMLElement
}

export class Atelier {
  private a: AttachesAtelier
  private jeu: () => Jeu
  private racine: () => Noeud
  /** Les scripts d'origine, pour pouvoir revenir en arriere. */
  private origines = new Map<string, Script | undefined>()
  private surChangement: () => void

  constructor(
    attaches: AttachesAtelier, jeu: () => Jeu, racine: () => Noeud,
    surChangement: () => void = () => {},
  ) {
    this.a = attaches
    this.jeu = jeu
    this.racine = racine
    this.surChangement = surChangement
    this.a.aide.textContent = AIDE_SCRIPT

    this.a.bascule.addEventListener('click', () => this.basculer())
    this.a.fermer.addEventListener('click', () => this.basculer(false))
    this.a.selection.addEventListener('change', () => this.charger())
    this.a.appliquer.addEventListener('click', () => this.appliquer())
    this.a.retablir.addEventListener('click', () => this.retablir())
    // Ctrl+Entree : le raccourci de tous les editeurs qui evaluent. Sans lui on
    // vise un bouton apres chaque essai, et l'on essaie moins.
    this.a.source.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.appliquer() }
      // Tabulation : elle indente, elle ne quitte pas le champ. Perdre son
      // texte de vue au premier alinea est une facon sure de ne plus s'en servir.
      if (e.key === 'Tab') {
        e.preventDefault()
        const t = this.a.source
        const d = t.selectionStart
        t.value = `${t.value.slice(0, d)}  ${t.value.slice(t.selectionEnd)}`
        t.selectionStart = t.selectionEnd = d + 2
      }
    })
  }

  get ouvert(): boolean { return !this.a.panneau.hidden }

  basculer(vers = !this.ouvert): void {
    this.a.panneau.hidden = !vers
    this.a.bascule.classList.toggle('actif', vers)
    if (vers) {
      this.recenser()
      this.a.source.focus()
    }
    this.surChangement()
  }

  /** Refait la liste des noeuds. A appeler quand le monde change. */
  recenser(): void {
    const noms: string[] = []
    const parcourir = (n: Noeud): void => {
      if (n.nom) noms.push(n.nom)
      for (const e of n.enfants) parcourir(e)
    }
    parcourir(this.racine())
    const avant = this.a.selection.value
    this.a.selection.innerHTML = ''
    for (const nom of noms) {
      const o = document.createElement('option')
      o.value = nom
      o.textContent = nom
      this.a.selection.appendChild(o)
    }
    if (noms.includes(avant)) this.a.selection.value = avant
    this.charger()
  }

  /** Le monde a change : les scripts d'origine ne sont plus les memes. */
  reinitialiser(): void {
    this.origines.clear()
    if (this.ouvert) this.recenser()
  }

  private noeudChoisi(): Noeud | null {
    const nom = this.a.selection.value
    const chercher = (n: Noeud): Noeud | null => {
      if (n.nom === nom) return n
      for (const e of n.enfants) { const r = chercher(e); if (r) return r }
      return null
    }
    return chercher(this.racine())
  }

  private charger(): void {
    const n = this.noeudChoisi()
    this.a.source.value = n?.script ?? EXEMPLE
    this.a.retablir.disabled = !this.origines.has(this.a.selection.value)
    this.dire('', '')
  }

  private appliquer(): void {
    const nom = this.a.selection.value
    const noeud = this.noeudChoisi()
    if (!noeud) { this.dire('Aucun nœud de ce nom dans la scène.', 'faute'); return }

    const c = compiler(this.a.source.value, (r: Rapport) => this.rapporter(nom, r))
    if (!c.ok || !c.script) { this.dire(c.erreur ?? 'Erreur inconnue.', 'faute'); return }

    if (!this.origines.has(nom)) this.origines.set(nom, this.jeu().scripts.get(nom))
    // La SOURCE va sur le noeud : c'est elle qui part dans le fichier de projet.
    noeud.script = this.a.source.value
    this.jeu().scripts.set(nom, c.script)
    this.a.retablir.disabled = false

    const avert = c.avertissements.length ? ` — ${c.avertissements.join(' ')}` : ''
    this.dire(`Appliqué à « ${nom} ».${avert}`, c.avertissements.length ? 'avertissement' : 'bien')
    if (!this.jeu().tourne) this.jeu().dessiner()
  }

  private retablir(): void {
    const nom = this.a.selection.value
    if (!this.origines.has(nom)) return
    const origine = this.origines.get(nom)
    if (origine) this.jeu().scripts.set(nom, origine)
    else this.jeu().scripts.delete(nom)
    this.origines.delete(nom)
    const n = this.noeudChoisi()
    if (n) n.script = null
    this.a.retablir.disabled = true
    this.a.source.value = EXEMPLE
    this.dire(`« ${nom} » a retrouvé son script d'origine.`, 'bien')
  }

  private rapporter(nom: string, r: Rapport): void {
    // On ne montre que la premiere et la derniere : repeter la meme exception
    // soixante fois par seconde n'apprend rien et rend la page illisible.
    if (r.compte !== 1 && !r.endormi) return
    this.dire(
      r.endormi
        ? `« ${nom} » a échoué ${ERREURS_AVANT_SOMMEIL} fois et se met en sommeil. ${r.erreur}`
        : `« ${nom} » : ${r.erreur}`,
      'faute',
    )
  }

  private dire(texte: string, genre: string): void {
    this.a.message.textContent = texte
    this.a.message.className = `atelier-message ${genre}`
  }
}
