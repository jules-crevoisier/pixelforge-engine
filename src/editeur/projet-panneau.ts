import type { ProjetSerialise } from '../export/format.ts'
import { COMPORTEMENTS, type Comportement, type Espece } from '../runtime/entites.ts'
import {
  PROJECTIONS, projetNeuf, redimensionnerProjet, ajouterCalqueProjet,
  retirerCalqueProjet, modifierCalqueProjet, poserEspeceProjet, retirerEspeceProjet,
  changerVueProjet,
} from './projet-neuf.ts'

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
  /** L'espece en cours d'edition, par son identifiant. Vide : une neuve. */
  private especeEditee = ''

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
    this.blocCarte(p)
    this.blocCalques(p)
    this.blocEspeces(p)
    this.blocNeuf()
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

  private appliquer(p: ProjetSerialise, quoi: string): void {
    this.crochets.appliquer(p, quoi)
    this.montrer()
    this.dire(quoi)
  }

  private blocCarte(p: ProjetSerialise): void {
    const c = p.cartes[0]
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
          this.appliquer(redimensionnerProjet(this.frais(), nl, nh),
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

  private blocCalques(p: ProjetSerialise): void {
    const c = p.cartes[0]
    const d = bloc(this.corps, 'Calques')
    if (!c) return
    const liste = document.createElement('div')
    liste.className = 'liste'
    c.calques.forEach((q, i) => {
      const ligne = document.createElement('div')
      ligne.className = 'ligne'
      const oeil = bouton(q.visible ? '👁' : '·', 'Montrer ou cacher ce calque',
        () => this.appliquer(modifierCalqueProjet(this.frais(), q.nom, { visible: !q.visible }),
          `Calque « ${q.nom} » ${q.visible ? 'caché' : 'montré'}`))
      const nom = document.createElement('span')
      nom.className = 'nom'
      nom.textContent = q.nom + (q.terrain ? ' · terrain' : '')
      const monter = bouton('↑', 'Passer sous le calque précédent',
        () => this.appliquer(modifierCalqueProjet(this.frais(), q.nom, { decaler: -1 }), `Calque « ${q.nom} » descendu`))
      const descendre = bouton('↓', 'Passer par-dessus le calque suivant',
        () => this.appliquer(modifierCalqueProjet(this.frais(), q.nom, { decaler: 1 }), `Calque « ${q.nom} » monté`))
      monter.disabled = i === 0
      descendre.disabled = i === c.calques.length - 1
      const oter = bouton('✕', c.calques.length <= 1
        ? 'Le dernier calque ne se retire pas : une carte sans calque ne se dessine plus.'
        : 'Retirer ce calque et tout ce qu’il porte',
      () => {
        if (!window.confirm(`Retirer le calque « ${q.nom} » et tout ce qu’il porte ?`)) return
        this.appliquer(retirerCalqueProjet(this.frais(), q.nom), `Calque « ${q.nom} » retiré`)
      })
      oter.disabled = c.calques.length <= 1
      ligne.append(oeil, nom, monter, descendre, oter)
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
        () => this.appliquer(ajouterCalqueProjet(this.frais(), nom.value || 'décor', false),
          `Calque « ${nom.value || 'décor'} » ajouté`)),
      bouton('+ Terrain', 'Un calque à autotiling : on peint « ici il y a du mur » et la tuile se déduit.',
        () => this.appliquer(ajouterCalqueProjet(this.frais(), nom.value || 'terrain', true),
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
    d.appendChild(g)

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
        }
        this.especeEditee = identifiant
        this.appliquer(poserEspeceProjet(this.frais(), identifiant, champs),
          `Espèce « ${champs.nom} » ${source ? 'modifiée' : 'créée'}`)
      }))
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
    d.appendChild(g)
    const actions = document.createElement('div')
    actions.className = 'bloc-actions'
    actions.appendChild(bouton('Créer', 'Remplace ce qui est à l’écran. Enregistrez d’abord.', () => {
      if (!window.confirm('Créer un projet vide ? Ce qui est à l’écran sera remplacé.')) return
      this.especeEditee = ''
      this.appliquer(projetNeuf({
        nom: nom.value, largeur: Number(l.value), hauteur: Number(h.value),
        tuile: Number(t.value), projection: proj.value,
      }), `Projet « ${nom.value || 'projet'} » créé`)
    }))
    d.appendChild(actions)
  }
}
