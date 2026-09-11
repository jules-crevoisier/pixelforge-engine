/**
 * La console : ce que l'editeur savait et ne disait a personne.
 *
 * ## Ce qui manquait
 *
 * Un projet dont trois scripts sont refuses affichait « 3 script(s)
 * refuse(s) » dans un coin de la barre d'etat. Pas lesquels, pas pourquoi.
 * Une erreur de script pendant que le jeu tourne s'ecrivait dans le panneau
 * de l'atelier — visible seulement s'il etait ouvert, et sur le noeud qu'on
 * y avait choisi. Une erreur du moteur lui-meme partait dans la console du
 * navigateur, que personne n'ouvre. Et tout le reste — un import refuse, deux
 * salles qui se recouvrent, un fichier qu'on ne sait pas lire — passait par la
 * barre d'etat, qui ne garde qu'un message a la fois : le suivant efface le
 * precedent, et l'on n'a jamais eu le temps de lire.
 *
 * Un moteur dit ce qui ne va pas, le garde, et compte les repetitions.
 *
 * ## Pourquoi les messages identiques se COMPTENT au lieu de s'empiler
 *
 * Un script qui echoue echoue soixante fois par seconde. Empiler soixante
 * lignes par seconde rend la console illisible en trois secondes, et pousse
 * hors de l'ecran la seule ligne qui explique. Un message identique au dernier
 * du meme genre incremente donc son compteur — « ×214 » — et remonte a sa
 * place. C'est la regle de toutes les consoles qui servent a quelque chose.
 */
export type GenreMessage = 'faute' | 'avertissement' | 'note'

export interface Message {
  genre: GenreMessage
  texte: string
  /** D'ou cela vient : « script », « moteur », « projet », « fichier »… */
  source: string
  /** Combien de fois de suite. Un seul : 1. */
  compte: number
  /** L'heure du dernier, en millisecondes depuis le demarrage de la page. */
  quand: number
}

export interface AttachesConsole {
  panneau: HTMLElement
  corps: HTMLElement
  bascule: HTMLButtonElement
  fermer: HTMLButtonElement
  vider: HTMLButtonElement
}

/** Ce que la console garde. Au-dela, les plus vieux messages s'oublient. */
export const MESSAGES_GARDES = 200

export class PanneauConsole {
  private a: AttachesConsole
  private messages: Message[] = []
  /**
   * Les fautes non lues.
   *
   * Le compte vit sur le BOUTON : une console fermee qui se remplit d'erreurs
   * sans rien dire ne vaut pas mieux que pas de console du tout. Il retombe a
   * zero quand on l'ouvre — on a vu.
   */
  private nonLues = 0

  constructor(attaches: AttachesConsole) {
    this.a = attaches
    this.a.bascule.addEventListener('click', () => this.basculer())
    this.a.fermer.addEventListener('click', () => this.basculer(false))
    this.a.vider.addEventListener('click', () => {
      this.messages = []
      this.nonLues = 0
      this.montrer()
    })
    this.montrer()
  }

  get ouvert(): boolean { return !this.a.panneau.hidden }
  /** Ce que la console a retenu — le banc le lit. */
  get contenu(): readonly Message[] { return this.messages }

  basculer(vers = !this.ouvert): void {
    this.a.panneau.hidden = !vers
    this.a.bascule.classList.toggle('actif', vers)
    if (vers) this.nonLues = 0
    this.montrer()
  }

  /**
   * Ecrit une ligne.
   *
   * Rend `true` si c'est une ligne NEUVE, `false` si elle n'a fait
   * qu'incrementer un compteur. L'appelant s'en sert pour decider s'il vaut
   * la peine d'ouvrir la console : la premiere faute merite qu'on la montre,
   * la deux-centieme identique, non.
   */
  dire(genre: GenreMessage, texte: string, source = ''): boolean {
    const dernier = this.messages[this.messages.length - 1]
    if (dernier && dernier.texte === texte && dernier.genre === genre && dernier.source === source) {
      dernier.compte++
      dernier.quand = performance.now()
      this.montrer()
      return false
    }
    this.messages.push({ genre, texte, source, compte: 1, quand: performance.now() })
    if (this.messages.length > MESSAGES_GARDES) this.messages.shift()
    if (genre === 'faute' && !this.ouvert) this.nonLues++
    this.montrer()
    return true
  }

  private montrer(): void {
    const fautes = this.messages.filter((m) => m.genre === 'faute')
      .reduce((t, m) => t + m.compte, 0)
    this.a.bascule.textContent = this.nonLues ? `Console (${this.nonLues})` : 'Console'
    this.a.bascule.classList.toggle('alerte', this.nonLues > 0)
    this.a.bascule.title = fautes
      ? `${fautes} erreur(s) — scripts refusés, exceptions, avertissements`
      : 'Ce que l’éditeur a à dire : scripts refusés, exceptions, traces'
    if (!this.ouvert) return

    this.a.corps.innerHTML = ''
    if (!this.messages.length) {
      const vide = document.createElement('p')
      vide.className = 'ligne menu'
      vide.textContent = 'Rien à signaler. Les scripts refusés, les exceptions du moteur et '
        + 'ce qu’un script écrit avec c.tracer(…) arrivent ici.'
      this.a.corps.appendChild(vide)
      return
    }
    const liste = document.createElement('div')
    liste.className = 'liste'
    // Le plus RECENT en haut : on ouvre la console pour voir ce qui vient
    // d'arriver, pas pour faire defiler deux cents lignes.
    for (const m of [...this.messages].reverse()) {
      const ligne = document.createElement('div')
      ligne.className = `ligne console-${m.genre}`
      const marque = document.createElement('span')
      marque.className = 'menu'
      marque.textContent = m.genre === 'faute' ? '✕' : (m.genre === 'avertissement' ? '⚠' : '·')
      const texte = document.createElement('span')
      texte.className = 'nom'
      texte.textContent = m.texte
      texte.title = m.texte
      ligne.append(marque, texte)
      if (m.source) {
        const src = document.createElement('span')
        src.className = 'menu'
        src.textContent = m.source
        ligne.appendChild(src)
      }
      if (m.compte > 1) {
        const n = document.createElement('span')
        n.className = 'menu console-compte'
        n.textContent = `×${m.compte}`
        ligne.appendChild(n)
      }
      liste.appendChild(ligne)
    }
    this.a.corps.appendChild(liste)
  }
}
