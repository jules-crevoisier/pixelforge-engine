import type { ProjetSerialise, PlancheSerialisee } from '../export/format.ts'
import type { Son } from '../runtime/son.ts'
import { FORMES, rendre as rendreSon } from '../runtime/son.ts'
import type { AnimationSerialisee } from '../export/format.ts'
import { COMPORTEMENTS, type Comportement, type Espece } from '../runtime/entites.ts'
import { REGLAGES_DEFAUT, type ReglagesPlateforme } from '../runtime/plateforme.ts'
import {
  PROJECTIONS, projetNeuf, redimensionnerProjet, ajouterCalqueProjet,
  retirerCalqueProjet, modifierCalqueProjet, poserEspeceProjet, retirerEspeceProjet,
  ajouterPlancheProjet,
  changerVueProjet,
  renommerSalleProjet, reglerSalleProjet, retirerSalleProjet,
  ajouterDeclencheurProjet, reglerDeclencheurProjet, retirerDeclencheurProjet,
  ajouterCarteProjet, renommerCarteProjet, retirerCarteProjet, reglerDerouleProjet,
  reglerAmbianteCarteProjet,
  ajouterDialogueProjet, reglerDialogueProjet, retirerDialogueProjet,
  ajouterMusiqueProjet, reglerMusiqueProjet, retirerMusiqueProjet,
  ajouterSonProjet, retirerSonProjet, ajouterAnimationProjet, retirerAnimationProjet,
  reglerReglesProjet,
} from './projet-neuf.ts'
import { compiler } from '../script/atelier.ts'
import { chevauchements } from '../niveau/salles.ts'
import {
  plancheDepuisImage, plancheDepuisSprite, type ImageBrute,
} from './importer.ts'

/**
 * Le panneau Projet : ce qu'on ne peut pas faire au pinceau.
 *
 * ## Pourquoi il ne modifie jamais le monde
 *
 * Chaque bouton d'ici transforme le PROJET SERIALISE et redemande a l'editeur
 * de le relire. Le panneau ne touche donc ni a la carte vivante, ni au
 * peuplement, ni a l'atlas — voir `projet-neuf.ts` pour la raison. Ce qu'il
 * faut retenir a la lecture : ce fichier ne connait que des chaines et des
 * nombres, et un bogue de structure ne peut pas naitre ici.
 *
 * ## Pourquoi tout est reconstruit a chaque fois
 *
 * `montrer()` refait le panneau entier. On pourrait mettre a jour la ligne qui
 * a change ; c'est plus rapide et c'est la porte ouverte a un panneau qui ne
 * dit plus la verite — la liste des calques affiche l'ancien nom, le champ de
 * largeur garde la valeur d'avant. Un panneau de structure se lit rarement et
 * doit toujours etre exact ; on paie donc quelques dizaines de noeuds DOM.
 */
export interface CrochetsProjet {
  /** Le projet tel qu'il est maintenant. */
  projet(): ProjetSerialise
  /** Relit un projet transforme, et rouvre l'editeur dessus. */
  appliquer(p: ProjetSerialise, quoi: string): void
  /** Dit quelque chose dans la barre du panneau. */
  dire(message: string): void
  /** Le nom de la carte sous le pinceau. Vide : la premiere. */
  carteActive(): string
  /** Met cette carte-la sous le pinceau, sans rien perdre des autres. */
  editerCarte(nom: string): void
  /**
   * Les planches du monde EN COURS, modifiables sur place.
   *
   * Dessiner ne passe pas par la reconstruction du projet, contrairement aux
   * gestes de structure : on peint un pixel soixante fois par seconde en
   * glissant la souris, et reconstruire le monde a chaque pixel serait
   * inutilisable. On modifie donc la planche vivante, et l'appelant refait
   * l'atlas — ce qui est cent fois moins cher.
   */
  planches(): PlancheSerialisee[]
  /** A appeler quand une planche a change : refait l'atlas et redessine. */
  planchesChangees(): void
  /** Les clips du monde en cours, modifiables sur place. */
  animations(): AnimationSerialisee[]
  /** Les sons du monde en cours. */
  sons(): Son[]
  /** Fait entendre un son. */
  ecouter(s: Son): void
  /** Joue une musique entiere, une fois, pour l'oreille de qui l'ecrit. */
  ecouterMusique(m: import('../runtime/musique.ts').Musique): void
}

const bouton = (texte: string, titre: string, action: () => void): HTMLButtonElement => {
  const b = document.createElement('button')
  b.textContent = texte
  b.title = titre
  b.addEventListener('click', action)
  return b
}

const champ = (
  parent: HTMLElement, etiquette: string, valeur: string | number,
  type = 'text',
): HTMLInputElement => {
  const l = document.createElement('label')
  l.textContent = etiquette
  const i = document.createElement('input')
  i.type = type
  i.value = String(valeur)
  parent.append(l, i)
  return i
}

const choix = (
  parent: HTMLElement, etiquette: string, options: { valeur: string; nom: string }[],
  actuel: string,
): HTMLSelectElement => {
  const l = document.createElement('label')
  l.textContent = etiquette
  const s = document.createElement('select')
  for (const o of options) {
    const opt = document.createElement('option')
    opt.value = o.valeur
    opt.textContent = o.nom
    s.appendChild(opt)
  }
  s.value = actuel
  parent.append(l, s)
  return s
}

function bloc(parent: HTMLElement, titre: string): HTMLElement {
  const d = document.createElement('div')
  d.className = 'bloc'
  const h = document.createElement('h3')
  h.textContent = titre
  d.appendChild(h)
  parent.appendChild(d)
  return d
}

export class PanneauProjet {
  private panneau: HTMLElement
  private corps: HTMLElement
  private message: HTMLElement
  private bascule: HTMLButtonElement
  private crochets: CrochetsProjet
  /**
   * La taille de case demandee au prochain import d'image.
   *
   * Elle se regle a cote du bouton : une feuille de sprites 16x16 et une
   * feuille 32x32 sont toutes les deux courantes, et deviner se tromperait
   * une fois sur deux. Un `.pixelforge` n'en a pas besoin — il connait sa
   * taille d'image.
   */
  private tailleImport = { x: 16, y: 16 }

  /** L'espece en cours d'edition, par son identifiant. Vide : une neuve. */
  private especeEditee = ''
  /**
   * L'onglet ouvert.
   *
   * Un panneau de sept sections empilees demande de defiler pour trouver
   * quoi que ce soit, et l'on finit par ne plus se servir des trois du bas.
   * Des onglets rendent chaque section atteignable en un clic — au prix d'un
   * clic de plus pour celle qu'on regardait.
   */
  private onglet: 'carte' | 'jeu' | 'dessin' | 'animations' | 'sons' | 'textes' | 'especes' = 'carte'
  /** La planche et la case qu'on dessine. */
  private plancheEditee = 0
  private caseEditee = 0
  private lettreEditee = ''
  private clipEdite = ''
  private sonEdite = ''

  constructor(
    elements: {
      panneau: HTMLElement; corps: HTMLElement; message: HTMLElement
      bascule: HTMLButtonElement; fermer: HTMLButtonElement
    },
    crochets: CrochetsProjet,
  ) {
    this.panneau = elements.panneau
    this.corps = elements.corps
    this.message = elements.message
    this.bascule = elements.bascule
    this.crochets = crochets
    elements.bascule.addEventListener('click', () => this.basculer())
    elements.fermer.addEventListener('click', () => this.fermer())
  }

  get ouvert(): boolean { return !this.panneau.hidden }

  basculer(): void { if (this.ouvert) this.fermer(); else this.ouvrir() }

  ouvrir(): void {
    this.panneau.hidden = false
    this.bascule.classList.add('actif')
    this.montrer()
  }

  fermer(): void {
    this.panneau.hidden = true
    this.bascule.classList.remove('actif')
  }

  dire(m: string): void { this.message.textContent = m }

  /** Refait le panneau depuis le projet courant. */
  montrer(): void {
    if (!this.ouvert) return
    const p = this.crochets.projet()
    this.corps.textContent = ''
    this.onglets()
    if (this.onglet === 'carte') {
      // La STRUCTURE : les cartes, leur taille, leurs calques, leurs salles.
      this.blocCartes(p); this.blocCarte(p); this.blocCalques(p); this.blocSalles(p)
      this.blocNeuf()
    } else if (this.onglet === 'jeu') {
      // Le JEU : ce qui fait d'une liste de cartes une partie — le titre et
      // l'ordre, les declencheurs, la lumiere. Empile sous « Carte », tout
      // cela noyait la taille de la carte sous sept blocs.
      this.blocDeroule(p); this.blocRegles(p); this.blocDeclencheurs(p); this.blocLumiere(p)
    }
    else if (this.onglet === 'especes') this.blocEspeces(p)
    else if (this.onglet === 'dessin') this.blocDessin()
    else if (this.onglet === 'animations') this.blocAnimations()
    else if (this.onglet === 'textes') this.blocDialogues(p)
    else { this.blocSons(); this.blocMusiques(p) }
  }

  private onglets(): void {
    const barre = document.createElement('div')
    barre.className = 'onglets'
    const items: [typeof this.onglet, string][] = [
      ['carte', 'Carte'], ['jeu', 'Jeu'], ['dessin', 'Dessin'], ['animations', 'Animations'],
      ['sons', 'Sons'], ['textes', 'Textes'], ['especes', 'Espèces'],
    ]
    for (const [id, nom] of items) {
      const b = bouton(nom, nom, () => { this.onglet = id; this.montrer() })
      if (this.onglet === id) b.classList.add('actif')
      barre.appendChild(b)
    }
    this.corps.appendChild(barre)
  }

  /**
   * Le projet MAINTENANT, et non celui d'il y a trois gestes.
   *
   * Chaque bouton doit relire le projet a l'instant ou on le presse. Un bouton
   * qui garde le projet capture au moment ou le panneau a ete dessine agit sur
   * une photographie perimee : on ouvre le panneau, on peint dix cases, on
   * redimensionne — et les dix cases ont disparu, parce que le
   * redimensionnement s'est applique a l'etat d'avant.
   *
   * C'est exactement ce qui est arrive a la premiere version, et aucun banc ne
   * pouvait le dire : ils appellent `redimensionnerProjet` sur un projet qu'ils
   * viennent de fabriquer, ou la question du « quand » ne se pose pas. Il a
   * fallu le parcours complet dans un vrai navigateur — creer, peindre,
   * redimensionner — pour que le trou apparaisse.
   */
  private frais(): ProjetSerialise { return this.crochets.projet() }

  /** La carte sous le pinceau, dans ce projet-la. */
  private carteEditee(p: ProjetSerialise) {
    const nom = this.crochets.carteActive()
    return p.cartes.find((c) => c.nom === nom) ?? p.cartes[0]
  }

  private appliquer(p: ProjetSerialise, quoi: string): void {
    this.crochets.appliquer(p, quoi)
    this.montrer()
    this.dire(quoi)
  }

  /**
   * Les cartes : les niveaux du projet.
   *
   * ## Pourquoi « editer » RECONSTRUIT le monde
   *
   * La carte sous le pinceau est celle que le monde vivant porte. En changer
   * demande de relire le projet avec l'autre paire carte-scene active — le
   * meme chemin que tous les gestes de structure, et le seul qui garantisse
   * que rien de ce qu'on vient de peindre n'est perdu : la serialisation
   * emporte TOUTES les cartes, pas seulement l'affichee.
   */
  private blocCartes(p: ProjetSerialise): void {
    const d = bloc(this.corps, 'Cartes')
    const active = this.carteEditee(p)?.nom ?? ''
    const liste = document.createElement('div')
    liste.className = 'liste'
    for (const c of p.cartes) {
      const ligne = document.createElement('div')
      ligne.className = 'ligne'
      const nom = document.createElement('input')
      nom.value = c.nom
      nom.style.width = '104px'
      nom.title = 'Le nom de la carte. Sa scène, son décor et le déroulé la suivent.'
      nom.addEventListener('change', () => {
        const voulu = nom.value.trim()
        if (!voulu || p.cartes.some((q) => q !== c && q.nom === voulu)) { this.montrer(); return }
        this.appliquer(renommerCarteProjet(this.frais(), c.nom, voulu), `Carte « ${voulu} »`)
      })
      const taille = document.createElement('span')
      taille.className = 'menu'
      taille.textContent = `${c.largeur}×${c.hauteur}`
      // La lumiere de CETTE carte. Vide : celle du projet — la nuit d'un jeu
      // peut s'epaissir en descendant, carte par carte.
      const nuit = document.createElement('input')
      nuit.type = 'number'
      nuit.step = '0.05'
      nuit.min = '0'
      nuit.max = '1'
      nuit.placeholder = '☀'
      nuit.style.width = '52px'
      nuit.value = c.ambiante === null || c.ambiante === undefined ? '' : String(c.ambiante)
      nuit.title = 'La lumière ambiante de cette carte, de 0 à 1. Vide : celle du projet.'
      nuit.addEventListener('change', () => {
        const brut = nuit.value.trim()
        const v = brut === '' ? null : Number(brut)
        this.appliquer(reglerAmbianteCarteProjet(this.frais(), c.nom, v),
          v === null ? `« ${c.nom} » : lumière du projet` : `« ${c.nom} » : ambiante ${v}`)
      })
      ligne.append(nom, taille, nuit)
      if (c.nom === active) {
        const marque = document.createElement('span')
        marque.className = 'menu'
        marque.textContent = '✎ sous le pinceau'
        ligne.appendChild(marque)
      } else {
        ligne.appendChild(bouton('Éditer', 'Met cette carte sous le pinceau. Rien n’est perdu : toutes les cartes partent dans le fichier.',
          () => this.crochets.editerCarte(c.nom)))
      }
      if (p.cartes.length > 1) {
        ligne.appendChild(bouton('✕', 'Retire cette carte et sa scène.', () => {
          if (!window.confirm(`Retirer la carte « ${c.nom} » et sa scène ?`)) return
          this.appliquer(retirerCarteProjet(this.frais(), c.nom), `Carte « ${c.nom} » retirée`)
        }))
      }
      liste.appendChild(ligne)
    }
    d.appendChild(liste)
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(bouton('+ Carte',
      'Un niveau de plus : une carte vide de la même taille, avec sa scène et son héros.',
      () => this.appliquer(ajouterCarteProjet(this.frais()), 'Carte ajoutée — son nom la retrouve dans le déroulé')))
    d.appendChild(actions)
  }

  /**
   * Le deroule : le titre du jeu, et l'ordre des niveaux.
   *
   * L'ordre par defaut est celui des cartes — c'est pour cela qu'il n'y a
   * pas de champ « ordre » tant qu'on n'en a pas besoin : un champ de plus
   * qui repete ce que la liste au-dessus montre deja serait du bruit.
   */
  private blocDeroule(p: ProjetSerialise): void {
    const d = bloc(this.corps, 'Déroulé')
    const g = document.createElement('div')
    g.className = 'champs'
    const titre = champ(g, 'Titre du jeu', p.deroule?.titre ?? '', 'text')
    titre.placeholder = 'vide : pas d’écran-titre'
    titre.addEventListener('change', () => {
      this.appliquer(reglerDerouleProjet(this.frais(), { titre: titre.value.trim() }),
        titre.value.trim() ? `Titre : « ${titre.value.trim()} »` : 'Pas d’écran-titre')
    })
    d.appendChild(g)
    const note = document.createElement('p')
    note.className = 'dos-vide'
    note.textContent = 'Un titre ouvre le jeu sur un écran-titre ; Espace le passe. '
      + 'Les niveaux s’enchaînent dans l’ordre des cartes — c.niveauSuivant() dans un déclencheur passe au suivant, '
      + 'c.aller(\'nom\') va où l’on veut.'
    d.appendChild(note)
  }

  /**
   * La lumiere du monde.
   *
   * Un seul reglage, l'ambiante : la nuit est une decision de PROJET. Les
   * sources, elles, sont des especes — une torche est une entite dont la
   * description porte un rayon de lueur, et elle se pose avec l'outil Entite
   * comme tout le reste.
   */
  /**
   * Les regles du jeu : ce que le moteur OFFRAIT, et qu'on peut refuser.
   *
   * L'epee et les coeurs etaient cables — un jeu de plateforme pur avait
   * quand meme une frappe sur Espace, un die-and-retry affichait une jauge.
   * Un moteur qui decide a la place du createur n'est pas un moteur : ces
   * quatre reglages sont des donnees du projet, format 16.
   */
  private blocRegles(p: ProjetSerialise): void {
    const d = bloc(this.corps, 'Règles')
    const r = p.regles ?? { epee: true, coeurs: true, reapparitionMs: 700, degatsPointes: 1 }
    const g = document.createElement('div')
    g.className = 'champs'
    const caseACocher = (etiquette: string, valeur: boolean, titre: string,
      surChangement: (v: boolean) => void): void => {
      const l = document.createElement('label')
      l.textContent = etiquette
      const i = document.createElement('input')
      i.type = 'checkbox'
      i.checked = valeur
      i.title = titre
      i.addEventListener('change', () => surChangement(i.checked))
      g.append(l, i)
    }
    caseACocher('Épée', r.epee,
      'La frappe sur la touche action. Décochée : la touche reste entière pour vos scripts.',
      (v) => this.appliquer(reglerReglesProjet(this.frais(), { epee: v }),
        v ? 'L’épée est au héros' : 'Pas d’épée — la touche action est à vous'))
    caseACocher('Cœurs à l’écran', r.coeurs,
      'La jauge de vie dessinée pendant le jeu. Un die-and-retry n’en veut pas.',
      (v) => this.appliquer(reglerReglesProjet(this.frais(), { coeurs: v }),
        v ? 'Les cœurs s’affichent' : 'Pas de jauge à l’écran'))
    const reprise = champ(g, 'Réapparition (ms)', r.reapparitionMs, 'number')
    reprise.title = 'Le délai avant de reprendre après la mort. Celeste : presque zéro.'
    reprise.addEventListener('change', () => {
      this.appliquer(reglerReglesProjet(this.frais(), { reapparitionMs: Number(reprise.value) }),
        `Réapparition : ${reprise.value} ms`)
    })
    const pointes = champ(g, 'Dégâts des pointes', r.degatsPointes, 'number')
    pointes.title = 'Ce qu’une case blessante retire. Zéro : les pointes deviennent du décor.'
    pointes.addEventListener('change', () => {
      this.appliquer(reglerReglesProjet(this.frais(), { degatsPointes: Number(pointes.value) }),
        `Pointes : ${pointes.value} dégât(s)`)
    })
    d.appendChild(g)
  }

  private blocLumiere(p: ProjetSerialise): void {
    const d = bloc(this.corps, 'Lumière')
    const g = document.createElement('div')
    g.className = 'champs'
    const ambiante = champ(g, 'Ambiante (0 à 1)', p.lumiere?.ambiante ?? 1, 'number')
    ambiante.step = '0.05'
    ambiante.min = '0'
    ambiante.max = '1'
    ambiante.addEventListener('change', () => {
      const v = Math.max(0, Math.min(1, Number(ambiante.value)))
      this.appliquer({ ...this.frais(), lumiere: { ambiante: Number.isFinite(v) ? v : 1 } },
        v >= 1 ? 'Plein jour — l’éclairage ne coûte rien'
          : `Ambiante ${v} — les espèces à lueur percent la nuit`)
    })
    d.appendChild(g)
    const note = document.createElement('p')
    note.className = 'dos-vide'
    note.textContent = 'La nuit n’emploie QUE les couleurs de la palette : chaque pixel assombri '
      + 'est remplacé par la couleur de la palette la plus proche. Une palette sans tons sombres '
      + 'reste claire — c’est elle qui décide. Le champ « Lueur » d’une espèce en fait une source.'
    d.appendChild(note)
  }

  private blocCarte(p: ProjetSerialise): void {
    const c = this.carteEditee(p)
    const d = bloc(this.corps, 'Carte')
    if (!c) { d.append('Ce projet n’a pas de carte.'); return }
    const g = document.createElement('div')
    g.className = 'champs'
    const l = champ(g, 'Largeur (cases)', c.largeur, 'number')
    const h = champ(g, 'Hauteur (cases)', c.hauteur, 'number')
    const vl = champ(g, 'Vue (px)', p.vue.largeur, 'number')
    const vh = champ(g, 'Vue hauteur', p.vue.hauteur, 'number')
    d.appendChild(g)
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(
      bouton('Redimensionner',
        'Ce qui dépasse est perdu. L’ancrage est le coin haut-gauche.',
        () => {
          const nl = Number(l.value)
          const nh = Number(h.value)
          if (!Number.isFinite(nl) || !Number.isFinite(nh)) { this.dire('Il faut deux nombres.'); return }
          const perdu = nl < c.largeur || nh < c.hauteur
          if (perdu && !window.confirm(
            `Réduire ${c.largeur}×${c.hauteur} en ${nl}×${nh} perdra ce qui dépasse. Continuer ?`,
          )) return
          this.appliquer(redimensionnerProjet(this.frais(), nl, nh, c.nom),
            `Carte : ${c.largeur}×${c.hauteur} → ${Math.max(4, Math.round(nl))}×${Math.max(4, Math.round(nh))}`)
        }),
      bouton('Changer la vue',
        'La résolution virtuelle du jeu. Elle décide de ce qu’on voit en jouant, pas de la taille de la fenêtre.',
        () => this.appliquer(changerVueProjet(this.frais(), Number(vl.value), Number(vh.value)),
          `Vue : ${Math.max(32, Math.round(Number(vl.value)))}×${Math.max(32, Math.round(Number(vh.value)))}`)),
    )
    d.appendChild(actions)
    const note = document.createElement('p')
    note.className = 'ligne menu'
    note.style.marginTop = '8px'
    note.textContent = `${c.tuile} px par case · projection ${p.projection.mode}, ${p.projection.regard}`
      + ' · un geste de structure ne se défait pas au Ctrl+Z'
    d.appendChild(note)
  }

  /**
   * Les salles : les tableaux du niveau.
   *
   * ## Pourquoi elles se nomment et se retaillent ICI
   *
   * On les TIRE a la souris, ce qui est le bon geste pour dessiner un
   * rectangle et le mauvais pour le regler au demi-pixel. Le panneau donne
   * les quatre nombres et le nom : c'est la ou l'on dit « ce tableau fait
   * exactement un ecran » plutot que de viser a la main.
   *
   * ## Pourquoi le recouvrement est marque sur la LIGNE
   *
   * Deux salles qui se recouvrent rendent « dans quelle salle suis-je ? »
   * sans reponse. La barre d'etat le dit deja, mais elle ne dit pas
   * lesquelles : ici, on voit laquelle corriger.
   */
  private blocSalles(p: ProjetSerialise): void {
    const salles = p.salles ?? []
    const d = bloc(this.corps, 'Salles')
    const note = (texte: string): HTMLParagraphElement => {
      const q = document.createElement('p')
      q.className = 'dos-vide'
      q.textContent = texte
      return q
    }
    if (!salles.length) {
      d.appendChild(note('Aucune salle : le monde est continu, la caméra suit le héros partout. '
        + 'L’outil « Salle » en pose une en tirant un rectangle.'))
      return
    }
    const croise = new Set(chevauchements(salles).flat())
    const liste = document.createElement('div')
    liste.className = 'liste'
    for (const s of salles) {
      const ligne = document.createElement('div')
      ligne.className = `ligne${croise.has(s.nom) ? ' faute' : ''}`
      const nom = document.createElement('input')
      nom.value = s.nom
      nom.style.width = '76px'
      nom.title = croise.has(s.nom)
        ? 'Cette salle en recouvre une autre : la caméra ne saurait pas laquelle choisir.'
        : 'Le nom de la salle. Il sert à la retrouver, et deux salles ne peuvent pas le partager.'
      nom.addEventListener('change', () => {
        const voulu = nom.value.trim()
        // Un nom vide ou deja pris ne se prend pas : c'est par lui qu'on
        // retrouve une salle.
        if (!voulu || salles.some((q) => q !== s && q.nom === voulu)) { this.montrer(); return }
        this.appliquer(renommerSalleProjet(this.frais(), s.nom, voulu), `Salle « ${voulu} »`)
      })
      const champ = (clef: 'x' | 'y' | 'largeur' | 'hauteur', titre: string): HTMLInputElement => {
        const e = document.createElement('input')
        e.type = 'number'
        e.value = String(s[clef])
        e.style.width = '46px'
        e.title = titre
        e.addEventListener('change', () => {
          this.appliquer(
            reglerSalleProjet(this.frais(), s.nom, { [clef]: Number(e.value) }),
            `Salle « ${s.nom} » : ${clef} ${e.value}`,
          )
        })
        return e
      }
      const oter = bouton('✕', 'Retirer cette salle', () => {
        this.appliquer(retirerSalleProjet(this.frais(), s.nom), `Salle « ${s.nom} » retirée`)
      })
      // La carte de la salle : une salle est en cases, et deux cartes ont
      // les memes cases — voir les declencheurs, meme regle, meme raison.
      const surCarte = document.createElement('select')
      const toutes = document.createElement('option')
      toutes.value = ''
      toutes.textContent = 'toutes'
      surCarte.appendChild(toutes)
      for (const cc of p.cartes) {
        const o = document.createElement('option')
        o.value = cc.nom
        o.textContent = cc.nom
        if ((s.carte ?? '') === cc.nom) o.selected = true
        surCarte.appendChild(o)
      }
      surCarte.title = 'La carte sur laquelle cette salle découpe. « Toutes » : partout.'
      surCarte.addEventListener('change', () => {
        this.appliquer(reglerSalleProjet(this.frais(), s.nom, { carte: surCarte.value }),
          `Salle « ${s.nom} » : ${surCarte.value || 'toutes les cartes'}`)
      })
      ligne.append(nom, champ('x', 'Colonne du coin haut-gauche, en cases'),
        champ('y', 'Rangée du coin haut-gauche, en cases'),
        champ('largeur', 'Largeur en cases'), champ('hauteur', 'Hauteur en cases'),
        surCarte, oter)
      liste.appendChild(ligne)
    }
    d.appendChild(liste)
    d.appendChild(note('Chaque salle borne la caméra et sert de point de reprise : '
      + 'mourir y renvoie, pas au départ du niveau.'))
  }

  /**
   * Les declencheurs : « quand ceci arrive, joue ce script ».
   *
   * ## Pourquoi le script se verifie EN TAPANT
   *
   * Un declencheur ne se voit pas dans la scene : un script refuse en
   * silence ne tirerait jamais, et l'on chercherait la faute dans le niveau.
   * L'atelier compile donc a chaque changement, et la faute s'affiche sur la
   * ligne — la meme regle que pour les scripts des noeuds, au meme endroit.
   */
  private blocDeclencheurs(p: ProjetSerialise): void {
    const liste = p.declencheurs ?? []
    const d = bloc(this.corps, 'Déclencheurs')
    const note = (texte: string): HTMLParagraphElement => {
      const q = document.createElement('p')
      q.className = 'dos-vide'
      q.textContent = texte
      return q
    }
    for (const q of liste) {
      const carte = document.createElement('div')
      carte.className = 'ligne'
      carte.style.flexWrap = 'wrap'
      const nom = document.createElement('input')
      nom.value = q.nom
      nom.style.width = '104px'
      nom.title = 'Le nom du déclencheur. Il sert à le retrouver, deux ne peuvent pas le partager.'
      nom.addEventListener('change', () => {
        const voulu = nom.value.trim()
        if (!voulu || liste.some((r) => r !== q && r.nom === voulu)) { this.montrer(); return }
        this.appliquer(reglerDeclencheurProjet(this.frais(), q.nom, { nom: voulu }),
          `Déclencheur « ${voulu} »`)
      })
      const quand = document.createElement('select')
      for (const [v, t] of [['zone', 'au contact d’une zone'], ['salle', 'à l’entrée d’une salle']]) {
        const o = document.createElement('option')
        o.value = v
        o.textContent = t
        if (q.quand === v) o.selected = true
        quand.appendChild(o)
      }
      quand.title = 'Ce qui tire le script : franchir un rectangle de cases, ou entrer dans un tableau.'
      quand.addEventListener('change', () => {
        this.appliquer(reglerDeclencheurProjet(this.frais(), q.nom,
          { quand: quand.value as 'salle' | 'zone' }), `Déclencheur « ${q.nom} » : ${quand.value}`)
      })
      const unefois = document.createElement('input')
      unefois.type = 'checkbox'
      unefois.checked = q.unefois
      unefois.title = 'Coché : le déclencheur s’éteint après le premier tir, jusqu’à « Rejouer ».'
      unefois.addEventListener('change', () => {
        this.appliquer(reglerDeclencheurProjet(this.frais(), q.nom, { unefois: unefois.checked }),
          `Déclencheur « ${q.nom} » : ${unefois.checked ? 'une fois' : 'à chaque entrée'}`)
      })
      const oter = bouton('✕', 'Retirer ce déclencheur', () => {
        this.appliquer(retirerDeclencheurProjet(this.frais(), q.nom),
          `Déclencheur « ${q.nom} » retiré`)
      })
      // Sur quelle carte il vit. Une zone est en cases, et deux cartes ont
      // les memes cases : sans ce choix, la sortie du niveau un tirerait
      // aussi au niveau deux.
      const surCarte = document.createElement('select')
      const toutes = document.createElement('option')
      toutes.value = ''
      toutes.textContent = 'toutes les cartes'
      surCarte.appendChild(toutes)
      for (const cc of p.cartes) {
        const o = document.createElement('option')
        o.value = cc.nom
        o.textContent = cc.nom
        if (q.carte === cc.nom) o.selected = true
        surCarte.appendChild(o)
      }
      surCarte.title = 'La carte sur laquelle ce déclencheur vit. « Toutes » : partout.'
      surCarte.addEventListener('change', () => {
        this.appliquer(reglerDeclencheurProjet(this.frais(), q.nom, { carte: surCarte.value }),
          `Déclencheur « ${q.nom} » : ${surCarte.value || 'toutes les cartes'}`)
      })
      carte.append(nom, quand, surCarte, unefois, oter)

      if (q.quand === 'salle') {
        const salle = document.createElement('select')
        const vide = document.createElement('option')
        vide.value = ''
        vide.textContent = '— choisir un tableau —'
        salle.appendChild(vide)
        for (const s of p.salles ?? []) {
          const o = document.createElement('option')
          o.value = s.nom
          o.textContent = s.nom
          if (q.salle === s.nom) o.selected = true
          salle.appendChild(o)
        }
        salle.title = 'Le tableau dont l’entrée tire le script.'
        salle.addEventListener('change', () => {
          this.appliquer(reglerDeclencheurProjet(this.frais(), q.nom, { salle: salle.value }),
            `Déclencheur « ${q.nom} » : salle « ${salle.value} »`)
        })
        carte.appendChild(salle)
      } else {
        const champZone = (clef: 'x' | 'y' | 'l' | 'h', titre: string): HTMLInputElement => {
          const e = document.createElement('input')
          e.type = 'number'
          e.value = String(q.zone[clef])
          e.style.width = '46px'
          e.title = titre
          e.addEventListener('change', () => {
            this.appliquer(reglerDeclencheurProjet(this.frais(), q.nom,
              { zone: { ...q.zone, [clef]: Math.max(0, Math.round(Number(e.value) || 0)) } }),
              `Déclencheur « ${q.nom} » : zone ${clef} ${e.value}`)
          })
          return e
        }
        carte.append(champZone('x', 'Colonne du coin haut-gauche, en cases'),
          champZone('y', 'Rangée du coin haut-gauche, en cases'),
          champZone('l', 'Largeur en cases'), champZone('h', 'Hauteur en cases'))
      }

      const script = document.createElement('textarea')
      script.value = q.script
      script.rows = 3
      script.style.width = '100%'
      script.spellcheck = false
      script.title = 'Le script, avec les mêmes « c » et « n » que l’atelier. « n » est le nœud qui est entré.'
      const faute = document.createElement('p')
      faute.className = 'dos-vide'
      const verifier = (): void => {
        const r = compiler(script.value)
        carte.classList.toggle('faute', !r.ok)
        faute.textContent = r.ok ? '' : (r.erreur ?? 'refusé')
      }
      verifier()
      script.addEventListener('input', verifier)
      script.addEventListener('change', () => {
        // On enregistre meme un script refuse : perdre trois lignes tapees
        // parce qu'il manque une parenthese serait pire que garder la faute —
        // elle est marquee ici ET comptee a la relecture.
        this.appliquer(reglerDeclencheurProjet(this.frais(), q.nom, { script: script.value }),
          `Déclencheur « ${q.nom} » : script enregistré`)
      })
      carte.append(script, faute)
      d.appendChild(carte)
    }
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(bouton('+ Déclencheur',
      'Ajoute un déclencheur : « quand ceci arrive, joue ce script ».',
      () => this.appliquer(ajouterDeclencheurProjet(this.frais()), 'Déclencheur ajouté')))
    d.appendChild(actions)
    if (!liste.length) {
      d.appendChild(note('« À l’entrée de ce tableau, lance la musique. » « Au contact de cette zone, '
        + 'ouvre le dialogue. » Le script reçoit c et n, comme dans l’atelier.'))
    }
  }

  private blocCalques(p: ProjetSerialise): void {
    const c = this.carteEditee(p)
    const d = bloc(this.corps, 'Calques')
    if (!c) return
    const liste = document.createElement('div')
    liste.className = 'liste'
    c.calques.forEach((q, i) => {
      const ligne = document.createElement('div')
      ligne.className = 'ligne'
      const oeil = bouton(q.visible ? '👁' : '·', 'Montrer ou cacher ce calque',
        () => this.appliquer(modifierCalqueProjet(this.frais(), q.nom, { visible: !q.visible }, c.nom),
          `Calque « ${q.nom} » ${q.visible ? 'caché' : 'montré'}`))
      const nom = document.createElement('span')
      nom.className = 'nom'
      nom.textContent = q.nom + (q.terrain ? ' · terrain' : '')
      const monter = bouton('↑', 'Passer sous le calque précédent',
        () => this.appliquer(modifierCalqueProjet(this.frais(), q.nom, { decaler: -1 }, c.nom), `Calque « ${q.nom} » descendu`))
      const descendre = bouton('↓', 'Passer par-dessus le calque suivant',
        () => this.appliquer(modifierCalqueProjet(this.frais(), q.nom, { decaler: 1 }, c.nom), `Calque « ${q.nom} » monté`))
      monter.disabled = i === 0
      descendre.disabled = i === c.calques.length - 1
      const oter = bouton('✕', c.calques.length <= 1
        ? 'Le dernier calque ne se retire pas : une carte sans calque ne se dessine plus.'
        : 'Retirer ce calque et tout ce qu’il porte',
      () => {
        if (!window.confirm(`Retirer le calque « ${q.nom} » et tout ce qu’il porte ?`)) return
        this.appliquer(retirerCalqueProjet(this.frais(), q.nom, c.nom), `Calque « ${q.nom} » retiré`)
      })
      oter.disabled = c.calques.length <= 1
      /*
       * La parallaxe : deux nombres et une case a cocher, sur la ligne du
       * calque.
       *
       * Deux champs et non un : un fond de montagnes defile sur les cotes et
       * ne monte pas quand on saute. Un facteur unique obligerait a choisir
       * entre les deux, et le mauvais choix se voit a chaque saut.
       */
      const par = q.parallaxe ?? { x: 1, y: 1 }
      const champ = (axe: 'x' | 'y'): HTMLInputElement => {
        const e = document.createElement('input')
        e.type = 'number'
        e.step = '0.05'
        e.min = '0'
        e.max = '4'
        e.value = String(par[axe])
        e.style.width = '52px'
        e.title = axe === 'x'
          ? 'Défilement horizontal : 1 comme le monde, 0,5 deux fois moins vite, 0 fixe.'
          : 'Défilement vertical. Un fond lointain monte moins que le sol quand on saute.'
        e.addEventListener('change', () => {
          const v = { ...par, [axe]: Number(e.value) }
          this.appliquer(
            modifierCalqueProjet(this.frais(), q.nom, { parallaxe: v }, c.nom),
            `Calque « ${q.nom} » : parallaxe ${v.x} / ${v.y}`,
          )
        })
        return e
      }
      const boucle = bouton(q.repete ? '∞' : '—', q.repete
        ? 'Ce calque se répète. Sans répétition, un fond plus lent laisse voir le vide au bord.'
        : 'Répéter ce calque indéfiniment — indispensable dès que la parallaxe n’est pas 1.',
      () => this.appliquer(
        modifierCalqueProjet(this.frais(), q.nom, { repete: !q.repete }, c.nom),
        `Calque « ${q.nom} » ${q.repete ? 'ne se répète plus' : 'se répète'}`,
      ))
      ligne.append(oeil, nom, champ('x'), champ('y'), boucle, monter, descendre, oter)
      liste.appendChild(ligne)
    })
    d.appendChild(liste)
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    const nom = document.createElement('input')
    nom.placeholder = 'nom du calque'
    actions.append(
      nom,
      bouton('+ Décor', 'Un calque de dessin libre : on y pose des tuiles une par une.',
        () => this.appliquer(ajouterCalqueProjet(this.frais(), nom.value || 'décor', false, c.nom),
          `Calque « ${nom.value || 'décor'} » ajouté`)),
      bouton('+ Terrain', 'Un calque à autotiling : on peint « ici il y a du mur » et la tuile se déduit.',
        () => this.appliquer(ajouterCalqueProjet(this.frais(), nom.value || 'terrain', true, c.nom),
          `Calque de terrain « ${nom.value || 'terrain'} » ajouté`)),
    )
    d.appendChild(actions)
  }

  private blocEspeces(p: ProjetSerialise): void {
    const d = bloc(this.corps, 'Espèces')
    const liste = document.createElement('div')
    liste.className = 'liste'
    for (const e of p.especes) {
      const ligne = document.createElement('div')
      ligne.className = `ligne${e.id === this.especeEditee ? ' actif' : ''}`
      const nom = document.createElement('span')
      nom.className = 'nom'
      nom.textContent = `${e.nom} · ${e.comportement} · ${e.pv} pv`
      ligne.append(
        nom,
        bouton('✎', 'Modifier cette espèce', () => { this.especeEditee = e.id; this.montrer() }),
        bouton('✕', 'Retirer l’espèce ET les entités posées qui la portaient', () => {
          if (!window.confirm(
            `Retirer « ${e.nom} » ? Les entités déjà posées qui la portent disparaîtront aussi.`,
          )) return
          if (this.especeEditee === e.id) this.especeEditee = ''
          this.appliquer(retirerEspeceProjet(this.frais(), e.id), `Espèce « ${e.nom} » retirée`)
        }),
      )
      liste.appendChild(ligne)
    }
    d.appendChild(liste)

    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(
      bouton(this.especeEditee ? 'Nouvelle espèce' : '＋ Nouvelle espèce',
        'Repartir d’un formulaire vide', () => { this.especeEditee = ''; this.montrer() }),
    )
    d.appendChild(actions)
    this.formulaireEspece(d, p)
  }

  /**
   * Le formulaire d'une espece.
   *
   * Il ne montre pas les trente champs d'une espece : il montre les DOUZE dont
   * on a besoin pour qu'une creature existe et se comporte. Le reste prend la
   * valeur par defaut du moteur — et comme le formulaire passe par la meme
   * fabrique que le catalogue de demonstration, une espece creee ici a
   * exactement la meme forme qu'une espece ecrite en TypeScript.
   */
  private formulaireEspece(d: HTMLElement, p: ProjetSerialise): void {
    const source = p.especes.find((e) => e.id === this.especeEditee)
    const planches = p.planches.map((t) => ({ valeur: t.nom, nom: t.nom }))
    const clips = p.animations.map((a) => ({ valeur: a.nom, nom: a.nom }))
    const g = document.createElement('div')
    g.className = 'champs'
    g.style.marginTop = '10px'
    const id = champ(g, 'Identifiant', source?.id ?? '')
    id.disabled = !!source
    id.placeholder = 'sans espace'
    const nom = champ(g, 'Nom', source?.nom ?? '')
    const planche = choix(g, 'Planche', planches, source?.planche ?? planches[0]?.valeur ?? '')
    const clip = choix(g, 'Clip', clips.length ? clips : [{ valeur: '', nom: '(aucun)' }],
      source?.clip ?? clips[0]?.valeur ?? '')
    const camp = choix(g, 'Camp', [
      { valeur: 'heros', nom: 'héros' }, { valeur: 'ennemi', nom: 'ennemi' },
      { valeur: 'neutre', nom: 'neutre' }, { valeur: 'decor', nom: 'décor' },
    ], source?.camp ?? 'ennemi')
    const comportement = choix(g, 'Intention',
      COMPORTEMENTS.map((c) => ({ valeur: c, nom: c })), source?.comportement ?? 'patrouille')
    const pv = champ(g, 'Points de vie', source?.pv ?? 1, 'number')
    const vitesse = champ(g, 'Vitesse (px/s)', source?.vitesse ?? 40, 'number')
    const degats = champ(g, 'Dégâts au contact', source?.degats ?? 1, 'number')
    const vigilance = champ(g, 'Vigilance (px)', source?.vigilance ?? 0, 'number')
    const soigne = champ(g, 'Soigne de', source?.soigne ?? 0, 'number')
    const boiteL = champ(g, 'Boîte largeur', source?.boite.l ?? 10, 'number')
    const boiteH = champ(g, 'Boîte hauteur', source?.boite.h ?? 8, 'number')
    const pesante = choix(g, 'Tombe (vue de côté)',
      [{ valeur: 'non', nom: 'non' }, { valeur: 'oui', nom: 'oui' }],
      source?.pesante ? 'oui' : 'non')
    const pietinable = champ(g, 'Piétinement (dégâts)', source?.degatsPietinement ?? 0, 'number')
    const lueur = champ(g, 'Lueur (px)', source?.lueur ?? 0, 'number')
    lueur.title = 'Rayon de la lumière qu’elle émet quand la nuit tombe. Zéro : elle n’éclaire pas.'
    d.appendChild(g)

    /*
     * Le script de l'espece : l'intention qui appartient a la personne.
     *
     * Les huit intentions de la liste sont un DEPART ; « script » est la
     * sortie du plafond — on ecrit ce que la creature fait, chaque pas, avec
     * le meme « c » et le meme « n » que l'atelier. Il se verifie EN TAPANT,
     * comme les declencheurs, et pour la meme raison : un refus silencieux
     * donnerait une creature immobile sans explication.
     */
    const scriptEspece = document.createElement('textarea')
    scriptEspece.value = source?.script ?? ''
    scriptEspece.rows = 4
    scriptEspece.style.width = '100%'
    scriptEspece.spellcheck = false
    scriptEspece.placeholder = "Intention « script » : écrivez ce qu'elle fait, chaque pas.\n"
      + "Ex. : n.etat.t = (n.etat.t ?? 0) + c.dt\n"
      + 'const corps = n.enfants.find((e) => e.type === \'corps\')\n'
      + 'c.bouger(corps, Math.sin(n.etat.t * 3) * 40 * c.dt, 0)'
    scriptEspece.title = 'Le script de l’espèce, exécuté chaque pas pour chaque créature qui la porte. « n » est SA créature.'
    const fauteEspece = document.createElement('p')
    fauteEspece.className = 'dos-vide'
    const verifierEspece = (): void => {
      if (!scriptEspece.value.trim()) { fauteEspece.textContent = ''; return }
      const r = compiler(scriptEspece.value)
      fauteEspece.textContent = r.ok ? '' : (r.erreur ?? 'refusé')
    }
    verifierEspece()
    scriptEspece.addEventListener('input', verifierEspece)
    const majVisibiliteScript = (): void => {
      const visible = comportement.value === 'script'
      scriptEspece.style.display = visible ? '' : 'none'
      fauteEspece.style.display = visible ? '' : 'none'
    }
    majVisibiliteScript()
    comportement.addEventListener('change', majVisibiliteScript)
    d.append(scriptEspece, fauteEspece)

    /*
     * LA PHYSIQUE A SOI. Le controleur de plateforme — saut, coyote, dash —
     * tournait sur ses reglages d'usine : le « game feel » d'un jeu, la
     * seule chose qu'un createur regle cent fois, n'etait pas reglable. Ces
     * champs ecrivent le Partial<ReglagesPlateforme> que le format porte
     * depuis toujours ; vide, le reglage d'usine — et le champ MONTRE cette
     * valeur d'usine, pour qu'on regle en connaissance.
     */
    const physique = document.createElement('details')
    const resume = document.createElement('summary')
    resume.textContent = 'Physique de plateforme (vue de côté)'
    resume.style.cursor = 'pointer'
    resume.style.color = 'var(--dim)'
    resume.style.fontSize = '12px'
    resume.style.padding = '6px 0'
    physique.appendChild(resume)
    const gp = document.createElement('div')
    gp.className = 'champs'
    const REGLAGES_EXPOSES: [keyof ReglagesPlateforme, string, string][] = [
      ['vitesse', 'Vitesse (px/s)', 'La pointe horizontale.'],
      ['hauteurSaut', 'Saut (px)', 'La hauteur au sommet. La gravité s’en déduit.'],
      ['tempsMontee', 'Montée (s)', 'Le temps pour atteindre le sommet du saut.'],
      ['controleEnLair', 'Contrôle en l’air (0-1)', 'La part du contrôle gardée en vol.'],
      ['coyote', 'Coyote (s)', 'Sauter encore, juste après le bord.'],
      ['tampon', 'Tampon de saut (s)', 'Appuyer un peu trop tôt compte quand même.'],
      ['chuteMax', 'Chute max (px/s)', 'La vitesse de chute plafonnée.'],
      ['vitesseDash', 'Dash (px/s)', 'La vitesse du dash. Zéro : pas de dash.'],
    ]
    const champsPhysique = REGLAGES_EXPOSES.map(([cle, etiquette, titre]) => {
      const i = champ(gp, etiquette, source?.plateforme?.[cle] ?? '', 'number')
      i.placeholder = String(REGLAGES_DEFAUT[cle])
      i.title = `${titre} Vide : le réglage d’usine (${REGLAGES_DEFAUT[cle]}).`
      i.step = 'any'
      return [cle, i] as const
    })
    physique.appendChild(gp)
    d.appendChild(physique)

    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.appendChild(bouton(source ? 'Enregistrer l’espèce' : 'Créer l’espèce',
      'Elle rejoint le catalogue du projet, et la palette de l’outil Entité', () => {
        const identifiant = (source?.id ?? id.value).trim().replace(/\s+/g, '-')
        if (!identifiant) { this.dire('Une espèce a besoin d’un identifiant.'); return }
        if (!source && this.frais().especes.some((e) => e.id === identifiant)) {
          this.dire(`« ${identifiant} » existe déjà. Modifiez-la, ou changez d’identifiant.`)
          return
        }
        const l = Math.max(1, Math.round(Number(boiteL.value) || 10))
        const h = Math.max(1, Math.round(Number(boiteH.value) || 8))
        const champs: Partial<Espece> = {
          nom: nom.value.trim() || identifiant,
          planche: planche.value,
          clip: clip.value,
          camp: camp.value as Espece['camp'],
          comportement: comportement.value as Comportement,
          pv: Math.max(1, Math.round(Number(pv.value) || 1)),
          vitesse: Math.max(0, Number(vitesse.value) || 0),
          degats: Math.max(0, Math.round(Number(degats.value) || 0)),
          vigilance: Math.max(0, Number(vigilance.value) || 0),
          soigne: Math.max(0, Math.round(Number(soigne.value) || 0)),
          // La boite est centree en largeur et posee sur les PIEDS : c'est
          // l'ancrage de tout le moteur, et le formulaire ne demande donc que
          // deux nombres au lieu de quatre.
          boite: { x: -Math.floor(l / 2), y: -h, l, h },
          pesante: pesante.value === 'oui',
          degatsPietinement: Math.max(0, Math.round(Number(pietinable.value) || 0)),
          rebondPietinement: Number(pietinable.value) > 0 ? 30 : 0,
          lueur: Math.max(0, Math.round(Number(lueur.value) || 0)),
          script: scriptEspece.value,
          // Seuls les reglages REMPLIS partent : le fichier ne porte que ce
          // qu'on a decide, et l'usine reste l'usine pour le reste.
          plateforme: Object.fromEntries(champsPhysique
            .filter(([, i]) => i.value.trim() !== '' && Number.isFinite(Number(i.value)))
            .map(([cle, i]) => [cle, Number(i.value)])),
        }
        this.especeEditee = identifiant
        this.appliquer(poserEspeceProjet(this.frais(), identifiant, champs),
          `Espèce « ${champs.nom} » ${source ? 'modifiée' : 'créée'}`)
      }))
    d.appendChild(actions)
  }

  /**
   * L'atelier de dessin : peindre une case de planche, pixel par pixel.
   *
   * ## Pourquoi il ne passe pas par la reconstruction du projet
   *
   * Tous les autres gestes du panneau transforment le fichier et relisent le
   * monde. Celui-ci ne peut pas : on peint soixante pixels par seconde en
   * glissant la souris, et reconstruire la scene, les atlas et le peuplement a
   * chaque pixel rendrait le pinceau inutilisable. On modifie donc la planche
   * VIVANTE et l'on refait l'atlas — ce qui est cent fois moins cher, et sans
   * risque : une planche ne porte aucune reference vers autre chose.
   *
   * ## Pourquoi une lettre et non une couleur
   *
   * Un dessin est une grille de LETTRES, et la cle dit quelle couleur chaque
   * lettre porte. Peindre une couleur directement obligerait a inventer une
   * lettre a chaque teinte, et la planche gagnerait quarante lettres pour
   * quarante nuances de gris. On peint donc une lettre de la cle — ce qui
   * garantit au passage qu'un dessin ne peut pas sortir de la palette.
   */
  /**
   * Le bouton d'import : la porte d'entree de l'art dessine ailleurs.
   *
   * Une image devient une planche decoupee en cases ; un projet de l'editeur
   * de sprites (`.pixelforge`) devient une planche dont chaque image
   * d'animation est une case. Les avertissements de l'import — echelle
   * ramenee, transparence aplatie, fusion simplifiee — sont DITS : chacun est
   * une transformation du dessin de quelqu'un, et une transformation muette
   * est une trahison.
   */
  private boutonImporter(d: HTMLElement): void {
    const entree = document.createElement('input')
    entree.type = 'file'
    entree.accept = '.png,.gif,.webp,.jpg,.jpeg,.bmp,.pixelforge'
    entree.style.display = 'none'
    const b = bouton('Importer une image…',
      'Une image (PNG, GIF…) découpée en cases, ou un projet de l’éditeur de sprites '
      + '(.pixelforge) dont chaque image d’animation devient une case.',
      () => entree.click())
    entree.addEventListener('change', () => {
      const f = entree.files?.[0]
      entree.value = ''
      if (f) void this.importerFichier(f)
    })
    const taille = (axe: 'x' | 'y', titre: string): HTMLInputElement => {
      const e = document.createElement('input')
      e.type = 'number'
      e.value = String(this.tailleImport[axe])
      e.style.width = '52px'
      e.title = titre
      e.addEventListener('change', () => {
        this.tailleImport[axe] = Math.max(1, Math.round(Number(e.value)) || 16)
      })
      return e
    }
    const rangee = document.createElement('div')
    rangee.className = 'bloc-actions'
    rangee.append(b,
      taille('x', 'Largeur d’une case de l’image importée, en pixels'),
      taille('y', 'Hauteur d’une case de l’image importée, en pixels'),
      entree)
    d.appendChild(rangee)
  }

  private async importerFichier(f: File): Promise<void> {
    try {
      const nom = f.name.replace(/\.[^.]+$/, '')
      const brut = f.name.toLowerCase().endsWith('.pixelforge')
        ? await plancheDepuisSprite(await f.text(), decoderPngNavigateur, nom)
        : plancheDepuisImage(await imageBruteDe(f), nom,
          this.tailleImport.x, this.tailleImport.y)
      this.appliquer(ajouterPlancheProjet(this.frais(), brut.planche),
        `Planche « ${brut.planche.nom} » importée : ${brut.planche.dessins.length} case(s)`)
      // La planche importee devient celle qu'on regarde : on importe pour la
      // voir, pas pour la chercher dans une liste.
      this.plancheEditee = this.crochets.planches().length - 1
      this.caseEditee = 0
      this.montrer()
      if (brut.avertissements.length) this.crochets.dire(brut.avertissements.join(' '))
    } catch (e) {
      this.crochets.dire(`Import refusé : ${(e as Error).message}`)
    }
  }

  private blocDessin(): void {
    const planches = this.crochets.planches()
    const d = bloc(this.corps, 'Dessin')
    this.boutonImporter(d)
    if (planches.length === 0) {
      d.append('Ce projet n’a pas de planche — importez une image, ou dessinez-en une.')
      return
    }
    this.plancheEditee = Math.min(this.plancheEditee, planches.length - 1)
    const planche = planches[this.plancheEditee]
    this.caseEditee = Math.min(this.caseEditee, Math.max(0, planche.dessins.length - 1))
    const lettres = Object.keys(planche.cle)
    if (!lettres.includes(this.lettreEditee)) this.lettreEditee = lettres[0] ?? '.'

    const g = document.createElement('div')
    g.className = 'champs'
    const quelle = choix(g, 'Planche',
      planches.map((q, i) => ({ valeur: String(i), nom: q.nom })), String(this.plancheEditee))
    quelle.addEventListener('change', () => {
      this.plancheEditee = Number(quelle.value)
      this.caseEditee = 0
      this.montrer()
    })
    const quelleCase = champ(g, 'Case', this.caseEditee, 'number')
    quelleCase.addEventListener('change', () => {
      this.caseEditee = Math.max(0, Math.min(planche.dessins.length - 1, Number(quelleCase.value)))
      this.montrer()
    })
    d.appendChild(g)

    /*
     * La bande de VIGNETTES : chaque case de la planche, en vrai, cliquable.
     *
     * On naviguait par un champ « Case : 7 » — un numero pour designer un
     * DESSIN, a la personne qui justement dessine. La bande montre les cases
     * telles qu'elles sont ; le champ reste pour sauter loin d'un coup.
     */
    const bande = document.createElement('div')
    bande.className = 'vignettes'
    planche.dessins.forEach((cases, i) => {
      const b = document.createElement('button')
      b.className = i === this.caseEditee ? 'actif' : ''
      b.title = `case ${i}`
      const c = document.createElement('canvas')
      const h2 = cases.length
      const l2 = cases[0]?.length ?? 0
      const z = Math.max(1, Math.floor(26 / Math.max(1, Math.max(l2, h2))))
      c.width = l2 * z
      c.height = h2 * z
      const cx2 = c.getContext('2d')
      if (cx2) {
        for (let y = 0; y < h2; y++) {
          for (let x = 0; x < l2; x++) {
            const lettre = cases[y][x]
            if (lettre === '.') continue
            cx2.fillStyle = planche.cle[lettre] ?? '#000'
            cx2.fillRect(x * z, y * z, z, z)
          }
        }
      }
      b.appendChild(c)
      b.addEventListener('click', () => { this.caseEditee = i; this.montrer() })
      bande.appendChild(b)
    })
    d.appendChild(bande)

    // Les couleurs de la planche. Le point est toujours le vide, et il figure
    // en premier : c'est la gomme, et une gomme qu'on cherche est une gomme
    // qu'on n'emploie pas.
    const nuancier = document.createElement('div')
    nuancier.className = 'nuancier'
    const poser = (l: string): void => { this.lettreEditee = l; this.montrer() }
    for (const l of ['.', ...lettres.filter((q) => q !== '.')]) {
      const b = document.createElement('button')
      b.className = `pastille${l === this.lettreEditee ? ' actif' : ''}`
      b.title = l === '.' ? 'Vide (gomme)' : `${l} · ${planche.cle[l]}`
      b.style.background = l === '.' ? 'transparent' : (planche.cle[l] ?? '#000')
      if (l === '.') b.textContent = '⌫'
      b.addEventListener('click', () => poser(l))
      nuancier.appendChild(b)
    }
    d.appendChild(nuancier)

    // La grille de pixels. Un canevas et non des boutons : une case de
    // trente-deux sur trente-deux ferait mille boutons, et le navigateur
    // ralentit bien avant qu'on ait fini de dessiner.
    const dessin = planche.dessins[this.caseEditee] ?? []
    const hauteur = dessin.length
    const largeur = dessin[0]?.length ?? 0
    const zoom = Math.max(4, Math.min(16, Math.floor(260 / Math.max(1, largeur))))
    const toile = document.createElement('canvas')
    toile.className = 'toile'
    toile.width = largeur * zoom
    toile.height = hauteur * zoom
    const ctx = toile.getContext('2d')
    const repeindre = (): void => {
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      for (let y = 0; y < hauteur; y++) {
        for (let x = 0; x < largeur; x++) {
          const l = dessin[y][x]
          // Le damier sous le vide : sans lui, une case vide et une case noire
          // se ressemblent, et l'on peint du noir en croyant gommer.
          ctx.fillStyle = l === '.'
            ? ((x + y) % 2 === 0 ? '#20242e' : '#171a22')
            : (planche.cle[l] ?? '#ff00ff')
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom)
        }
      }
    }
    repeindre()

    let peint = false
    const viser = (e: PointerEvent): void => {
      const b = toile.getBoundingClientRect()
      const x = Math.floor(((e.clientX - b.left) / b.width) * largeur)
      const y = Math.floor(((e.clientY - b.top) / b.height) * hauteur)
      if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return
      const lettre = e.buttons === 2 ? '.' : this.lettreEditee
      const ligne = dessin[y]
      if (ligne[x] === lettre) return
      dessin[y] = ligne.slice(0, x) + lettre + ligne.slice(x + 1)
      repeindre()
      this.crochets.planchesChangees()
    }
    toile.addEventListener('contextmenu', (e) => e.preventDefault())
    toile.addEventListener('pointerdown', (e) => {
      peint = true
      toile.setPointerCapture(e.pointerId)
      viser(e)
    })
    toile.addEventListener('pointermove', (e) => { if (peint) viser(e) })
    toile.addEventListener('pointerup', () => { peint = false })
    d.appendChild(toile)

    const note = document.createElement('p')
    note.className = 'ligne menu'
    note.textContent = `${largeur}×${hauteur} px · case ${this.caseEditee} sur `
      + `${planche.dessins.length} · clic droit pour effacer`
    d.appendChild(note)

    // Ajouter une couleur a la planche. Sans cela on ne peut dessiner qu'avec
    // ce que quelqu'un d'autre a choisi.
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    const teinte = document.createElement('input')
    teinte.type = 'color'
    teinte.value = '#7fd4a8'
    actions.append(
      teinte,
      bouton('+ Couleur', 'Ajoute une teinte à la clé de cette planche', () => {
        // La lettre est la premiere libre : les lettres sont un DETAIL de
        // rangement, et demander laquelle employer serait demander de choisir
        // ce dont on se moque.
        const prises = new Set(Object.keys(planche.cle))
        const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        const libre = [...alphabet].find((c) => !prises.has(c))
        if (!libre) { this.dire('Cette planche n’a plus de lettre libre.'); return }
        planche.cle[libre] = teinte.value
        this.lettreEditee = libre
        this.crochets.planchesChangees()
        this.montrer()
        this.dire(`Couleur « ${libre} » ajoutée : ${teinte.value}`)
      }),
      bouton('+ Case', 'Ajoute une case vide à la fin de la planche', () => {
        planche.dessins.push(Array.from({ length: hauteur }, () => '.'.repeat(largeur)))
        this.caseEditee = planche.dessins.length - 1
        this.crochets.planchesChangees()
        this.montrer()
      }),
    )
    d.appendChild(actions)
  }

  /**
   * Les animations : des rangs, des durees, une boucle, des evenements.
   *
   * ## Pourquoi on montre les EVENEMENTS
   *
   * C'est ce qui distingue ce monteur d'un simple diaporama. Un evenement dit
   * « le pied touche ici » ou « le coup porte la » ; c'est lui qui declenche
   * un son ou une frappe, et c'est la seule facon d'accorder le geste au
   * dessin. Les cacher ferait regler les sons en millisecondes, ce que tout le
   * moteur existe pour eviter.
   */
  private blocAnimations(): void {
    const clips = this.crochets.animations()
    const d = bloc(this.corps, 'Animations')
    const liste = document.createElement('div')
    liste.className = 'liste'
    for (const c of clips) {
      const ligne = document.createElement('div')
      ligne.className = `ligne${c.nom === this.clipEdite ? ' actif' : ''}`
      const nom = document.createElement('span')
      nom.className = 'nom'
      const duree = c.images.reduce((t, i) => t + i.duree, 0)
      nom.textContent = `${c.nom} · ${c.images.length} images · ${duree} ms · ${c.boucle}`
      ligne.append(nom, bouton('✎', 'Monter cette animation',
        () => { this.clipEdite = c.nom; this.montrer() }))
      liste.appendChild(ligne)
    }
    d.appendChild(liste)

    // Comme « + Son » : sans ce bouton, un projet parti en feuille blanche
    // ne pouvait pas avoir d'animation a lui.
    const naissance = document.createElement('div')
    naissance.className = 'bloc-actions'
    naissance.appendChild(bouton('+ Animation', 'Un clip neuf : deux images, un rythme lent', () => {
      this.appliquer(ajouterAnimationProjet(this.frais()),
        'Animation ajoutée — ✎ pour choisir ses images')
    }))
    d.appendChild(naissance)

    const clip = clips.find((c) => c.nom === this.clipEdite)
    if (!clip) {
      const note = document.createElement('p')
      note.className = 'ligne menu'
      note.textContent = 'Choisissez une animation pour la monter.'
      d.appendChild(note)
      return
    }

    const g = document.createElement('div')
    g.className = 'champs'
    const boucle = choix(g, 'Bouclage', [
      { valeur: 'boucle', nom: 'boucle' },
      { valeur: 'aller-retour', nom: 'aller-retour' },
      { valeur: 'unique', nom: 'unique' },
    ], clip.boucle)
    boucle.addEventListener('change', () => {
      clip.boucle = boucle.value as typeof clip.boucle
      this.dire(`« ${clip.nom} » : ${clip.boucle}`)
    })
    d.appendChild(g)

    const images = document.createElement('div')
    images.className = 'liste'
    clip.images.forEach((im, i) => {
      const ligne = document.createElement('div')
      ligne.className = 'ligne'
      const rang = document.createElement('span')
      rang.className = 'menu'
      rang.textContent = `#${i}`
      const index = document.createElement('input')
      index.type = 'number'
      index.value = String(im.index)
      index.title = 'Case de la planche'
      index.style.width = '54px'
      index.addEventListener('change', () => { im.index = Number(index.value) })
      const ms = document.createElement('input')
      ms.type = 'number'
      ms.value = String(im.duree)
      ms.title = 'Durée en millisecondes'
      ms.style.width = '62px'
      ms.addEventListener('change', () => { im.duree = Math.max(1, Number(ms.value)) })
      const ev = clip.evenements.find((q) => q.image === i)
      const nomEv = document.createElement('input')
      nomEv.value = ev?.nom ?? ''
      nomEv.placeholder = 'événement'
      nomEv.title = 'Ce que cette image déclenche : un son, une frappe'
      nomEv.addEventListener('change', () => {
        const autres = clip.evenements.filter((q) => q.image !== i)
        clip.evenements.length = 0
        clip.evenements.push(...autres)
        if (nomEv.value.trim()) clip.evenements.push({ image: i, nom: nomEv.value.trim() })
        this.dire(nomEv.value.trim()
          ? `Image ${i} déclenche « ${nomEv.value.trim() }»`
          : `Image ${i} ne déclenche plus rien`)
      })
      const oter = bouton('✕', 'Retirer cette image', () => {
        clip.images.splice(i, 1)
        // Les evenements designent un RANG : retirer une image decale ceux
        // d'apres. Ne pas les decaler ferait sonner le pas a la mauvaise image
        // sans que rien ne le signale.
        clip.evenements = clip.evenements
          .filter((q) => q.image !== i)
          .map((q) => (q.image > i ? { ...q, image: q.image - 1 } : q))
        this.montrer()
      })
      ligne.append(rang, index, ms, nomEv, oter)
      images.appendChild(ligne)
    })
    d.appendChild(images)

    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(
      bouton('+ Image', 'Ajoute une image à la fin', () => {
        const derniere = clip.images[clip.images.length - 1]
        clip.images.push({
          index: derniere?.index ?? 0, duree: derniere?.duree ?? 120,
          decalageX: 0, decalageY: 0,
        })
        this.montrer()
      }),
      bouton('Retirer', 'Une espèce qui le joue gardera sa dernière image', () => {
        if (!window.confirm(`Retirer l’animation « ${clip.nom} » ?`)) return
        this.clipEdite = ''
        this.appliquer(retirerAnimationProjet(this.frais(), clip.nom),
          `Animation « ${clip.nom} » retirée`)
      }),
    )
    d.appendChild(actions)
  }

  /**
   * Les sons : six nombres, et un bouton pour ecouter.
   *
   * ## Pourquoi l'ecoute immediate n'est pas un agrement
   *
   * Un son ne se regle pas par le raisonnement. On change une frequence de
   * cinquante hertz, on ecoute, on recommence — c'est la seule methode, et
   * sans le bouton il faudrait relancer le jeu et provoquer l'evenement pour
   * entendre chaque essai. Le reglage deviendrait si penible que personne ne
   * toucherait aux sons livres.
   */
  /**
   * Les musiques du projet, en notes — enfin editables la ou tout le reste
   * s'edite. Elles vivaient dans le fichier et se jouaient, mais ne
   * s'ecrivaient qu'a la main : la derniere ligne du carnet du jeu-temoin.
   *
   * ## Pourquoi les notes s'editent en TEXTE
   *
   * « do4 - mi4 - sol4 » se lit, se copie, se transpose a l'oeil. Un piano
   * dessine serait plus seduisant et dix fois plus de code pour ecrire les
   * memes huit notes — et il faudrait quand meme du texte pour les partager.
   */
  private blocMusiques(p: ProjetSerialise): void {
    const d = bloc(this.corps, 'Musiques')
    const liste = document.createElement('div')
    liste.className = 'liste'
    for (const m of p.musiques ?? []) {
      const carte = document.createElement('div')
      carte.className = 'ligne'
      carte.style.flexWrap = 'wrap'
      const nom = document.createElement('input')
      nom.value = m.nom
      nom.style.width = '92px'
      nom.title = 'Le nom de la musique : c.musique(nom) la lance.'
      nom.addEventListener('change', () => {
        const voulu = nom.value.trim()
        if (!voulu || (p.musiques ?? []).some((q) => q !== m && q.nom === voulu)) { this.montrer(); return }
        this.appliquer(reglerMusiqueProjet(this.frais(), m.nom, { nom: voulu }), `Musique « ${voulu} »`)
      })
      const tempo = document.createElement('input')
      tempo.type = 'number'
      tempo.value = String(m.tempo)
      tempo.style.width = '56px'
      tempo.title = 'Temps par minute.'
      tempo.addEventListener('change', () => {
        this.appliquer(reglerMusiqueProjet(this.frais(), m.nom, { tempo: Number(tempo.value) }),
          `« ${m.nom} » : ${tempo.value} bpm`)
      })
      const boucle = document.createElement('input')
      boucle.type = 'checkbox'
      boucle.checked = m.boucle
      boucle.title = 'Cochée : elle reprend au début à la fin. Une victoire ne boucle pas.'
      boucle.addEventListener('change', () => {
        this.appliquer(reglerMusiqueProjet(this.frais(), m.nom, { boucle: boucle.checked }),
          `« ${m.nom} » : ${boucle.checked ? 'en boucle' : 'une fois'}`)
      })
      carte.append(nom, tempo, boucle,
        bouton('▶', 'Écouter la musique entière', () => this.crochets.ecouterMusique(m)),
        bouton('✕', 'Retirer cette musique', () => {
          this.appliquer(retirerMusiqueProjet(this.frais(), m.nom), `Musique « ${m.nom} » retirée`)
        }))
      m.voies.forEach((v, iv) => {
        const notes = document.createElement('input')
        notes.value = v.notes.join(' ')
        notes.style.width = '100%'
        notes.spellcheck = false
        notes.title = 'Les notes, séparées par des espaces. « . » : silence. « - » : la note se prolonge.'
        notes.addEventListener('change', () => {
          const voies = m.voies.map((q, j) => (j === iv
            ? { ...q, notes: notes.value.trim().split(/\s+/).filter(Boolean) } : q))
          this.appliquer(reglerMusiqueProjet(this.frais(), m.nom, { voies }),
            `« ${m.nom} » : voie ${iv + 1} réécrite`)
        })
        carte.appendChild(notes)
      })
      liste.appendChild(carte)
    }
    d.appendChild(liste)
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(bouton('+ Musique',
      'Une musique de plus, avec une voie qui joue déjà — c’est en écoutant qu’on écrit la suite.',
      () => this.appliquer(ajouterMusiqueProjet(this.frais()), 'Musique ajoutée')))
    d.appendChild(actions)
  }

  /**
   * Les dialogues : le TEXTE du jeu, la ou tout le reste s'edite.
   *
   * Une replique par champ, dans l'ordre ou elles se lisent. Le « qui »
   * reste vide pour un narrateur — c'est le cas de loin le plus courant.
   */
  private blocDialogues(p: ProjetSerialise): void {
    const d = bloc(this.corps, 'Dialogues')
    for (const q of p.dialogues ?? []) {
      const carte = document.createElement('div')
      carte.className = 'ligne'
      carte.style.flexWrap = 'wrap'
      const nom = document.createElement('input')
      nom.value = q.nom
      nom.style.width = '104px'
      nom.title = 'Le nom de la suite : c.dire(nom) l’ouvre.'
      nom.addEventListener('change', () => {
        const voulu = nom.value.trim()
        if (!voulu || (p.dialogues ?? []).some((r) => r !== q && r.nom === voulu)) { this.montrer(); return }
        this.appliquer(reglerDialogueProjet(this.frais(), q.nom, { nom: voulu }), `Dialogue « ${voulu} »`)
      })
      carte.append(nom,
        bouton('+ Réplique', 'Une réplique de plus, à la fin', () => {
          const repliques = [...q.repliques, { qui: '', texte: '', choix: [] as never[] }]
          this.appliquer(reglerDialogueProjet(this.frais(), q.nom,
            { repliques: repliques as never }), `« ${q.nom} » : réplique ajoutée`)
        }),
        bouton('✕', 'Retirer ce dialogue', () => {
          this.appliquer(retirerDialogueProjet(this.frais(), q.nom), `Dialogue « ${q.nom} » retiré`)
        }))
      q.repliques.forEach((r, ir) => {
        const ligne = document.createElement('div')
        ligne.style.display = 'flex'
        ligne.style.width = '100%'
        ligne.style.gap = '4px'
        const texte = document.createElement('input')
        texte.value = r.texte
        texte.style.flex = '1'
        texte.title = `Réplique ${ir + 1}. Un appui l’affiche en entier, un autre passe à la suite.`
        texte.addEventListener('change', () => {
          const repliques = q.repliques.map((r2, j) => (j === ir ? { ...r2, texte: texte.value } : r2))
          this.appliquer(reglerDialogueProjet(this.frais(), q.nom,
            { repliques: repliques as never }), `« ${q.nom} » : réplique ${ir + 1}`)
        })
        const oterR = bouton('✕', 'Retirer cette réplique', () => {
          const repliques = q.repliques.filter((_r2, j) => j !== ir)
          this.appliquer(reglerDialogueProjet(this.frais(), q.nom,
            { repliques: repliques as never }), `« ${q.nom} » : réplique retirée`)
        })
        ligne.append(texte, oterR)
        carte.appendChild(ligne)
      })
      d.appendChild(carte)
    }
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(bouton('+ Dialogue',
      'Une suite de répliques de plus. c.dire(son nom) l’ouvrira.',
      () => this.appliquer(ajouterDialogueProjet(this.frais()), 'Dialogue ajouté')))
    d.appendChild(actions)
    if (!(p.dialogues ?? []).length) {
      const note = document.createElement('p')
      note.className = 'dos-vide'
      note.textContent = 'Le texte du jeu est du contenu, comme une carte : il vit dans le fichier, '
        + 'pas dans le code. c.dire(’nom’) ouvre une suite ; le monde s’arrête pendant qu’on lit.'
      d.appendChild(note)
    }
  }

  private blocSons(): void {
    const sons = this.crochets.sons()
    const d = bloc(this.corps, 'Sons')
    const liste = document.createElement('div')
    liste.className = 'liste'
    for (const q of sons) {
      const ligne = document.createElement('div')
      ligne.className = `ligne${q.nom === this.sonEdite ? ' actif' : ''}`
      const nom = document.createElement('span')
      nom.className = 'nom'
      nom.textContent = `${q.nom} · ${q.forme} · ${q.duree} ms`
      ligne.append(
        nom,
        bouton('▶', 'Écouter', () => this.crochets.ecouter(q)),
        bouton('✎', 'Régler', () => { this.sonEdite = q.nom; this.montrer() }),
      )
      liste.appendChild(ligne)
    }
    d.appendChild(liste)

    // « + Son » manquait, et son absence fermait une porte : un projet parti
    // en feuille blanche n'avait AUCUN moyen d'avoir un son a soi.
    const naissance = document.createElement('div')
    naissance.className = 'bloc-actions'
    naissance.appendChild(bouton('+ Son', 'Un son neuf, qui s’entend déjà', () => {
      this.appliquer(ajouterSonProjet(this.frais()),
        'Son ajouté — ▶ pour l’entendre, ✎ pour le régler')
    }))
    d.appendChild(naissance)

    const s = sons.find((q) => q.nom === this.sonEdite)
    if (!s) {
      const note = document.createElement('p')
      note.className = 'ligne menu'
      note.textContent = 'Choisissez un son pour le régler.'
      d.appendChild(note)
      return
    }
    const g = document.createElement('div')
    g.className = 'champs'
    const forme = choix(g, 'Forme',
      FORMES.map((f) => ({ valeur: f, nom: f })), s.forme)
    const nombres: [string, keyof Son, number][] = [
      ['Fréquence (Hz)', 'frequence', 1],
      ['Fréquence finale', 'frequenceFin', 1],
      ['Durée (ms)', 'duree', 1],
      ['Volume (0 à 1)', 'volume', 0.01],
      ['Attaque (ms)', 'attaque', 1],
      ['Chute (ms)', 'chute', 1],
      ['Paliers (demi-tons)', 'paliers', 1],
    ]
    const champsNombres = nombres.map(([etiquette, cle, pas]) => {
      const i = champ(g, etiquette, s[cle] as number, 'number')
      i.step = String(pas)
      return [cle, i] as const
    })
    d.appendChild(g)

    const appliquer = (): void => {
      s.forme = forme.value as Son['forme']
      for (const [cle, i] of champsNombres) {
        const v = Number(i.value)
        if (Number.isFinite(v)) (s as unknown as Record<string, number>)[cle] = v
      }
    }
    forme.addEventListener('change', appliquer)
    for (const [, i] of champsNombres) i.addEventListener('change', appliquer)

    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.append(
      bouton('▶ Écouter', 'Régler un son sans l’entendre est impossible', () => {
        appliquer()
        this.crochets.ecouter(s)
        const e = rendreSon(s, 8000)
        this.dire(`« ${s.nom} » · ${e.length} échantillons · pointe `
          + `${Math.max(...e).toFixed(2)}`)
      }),
      bouton('Retirer', 'Un script qui le joue jouera le silence', () => {
        if (!window.confirm(`Retirer le son « ${s.nom} » ?`)) return
        this.sonEdite = ''
        this.appliquer(retirerSonProjet(this.frais(), s.nom), `Son « ${s.nom} » retiré`)
      }),
    )
    d.appendChild(actions)
  }

  private blocNeuf(): void {
    const d = bloc(this.corps, 'Nouveau projet')
    const g = document.createElement('div')
    g.className = 'champs'
    const nom = champ(g, 'Nom', 'projet')
    const l = champ(g, 'Largeur (cases)', 40, 'number')
    const h = champ(g, 'Hauteur (cases)', 24, 'number')
    const t = champ(g, 'Case (px)', 16, 'number')
    const proj = choix(g, 'Projection',
      PROJECTIONS.map((q) => ({ valeur: q.id, nom: q.nom })), 'dessus')
    // La feuille blanche d'abord : celui qui vient creer SON jeu ne veut pas
    // repartir du donjon de demonstration. La demo reste a un clic, pour
    // ceux qui veulent des creatures toutes faites a etudier.
    const depart = choix(g, 'Départ', [
      { valeur: 'vierge', nom: 'Feuille blanche — vos dessins' },
      { valeur: 'demo', nom: 'Avec les assets de la démo' },
    ], 'vierge')
    d.appendChild(g)
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.appendChild(bouton('Créer', 'Remplace ce qui est à l’écran. Enregistrez d’abord.', () => {
      if (!window.confirm('Créer un projet vide ? Ce qui est à l’écran sera remplacé.')) return
      this.especeEditee = ''
      this.appliquer(projetNeuf({
        nom: nom.value, largeur: Number(l.value), hauteur: Number(h.value),
        tuile: Number(t.value), projection: proj.value,
        depart: depart.value as 'demo' | 'vierge',
      }), `Projet « ${nom.value || 'projet'} » créé`)
    }))
    d.appendChild(actions)
  }
}

/* ------------------------------------------------------------------ */
/* Ce que seul le navigateur sait faire : decoder une image            */
/* ------------------------------------------------------------------ */

/** Les pixels d'un fichier image, par le decodeur du navigateur. */
async function imageBruteDe(f: File): Promise<ImageBrute> {
  const bitmap = await createImageBitmap(f)
  const c = document.createElement('canvas')
  c.width = bitmap.width
  c.height = bitmap.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canevas 2D indisponible')
  ctx.drawImage(bitmap, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  return { largeur: d.width, hauteur: d.height, donnees: d.data }
}

/** Les pixels d'un PNG en base64 — les cels d'un projet de sprites. */
async function decoderPngNavigateur(base64: string): Promise<ImageBrute> {
  const img = new Image()
  await new Promise<void>((ok, ko) => {
    img.onload = () => ok()
    img.onerror = () => ko(new Error('cel illisible'))
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
  })
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canevas 2D indisponible')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  return { largeur: d.width, hauteur: d.height, donnees: d.data }
}
