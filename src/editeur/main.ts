import { Jeu } from '../runtime/jeu.ts'
import { Palette, depuisHex } from '../noyau/palette.ts'
import { atlasDepuisLettres } from '../runtime/atlas.ts'
import { contourDeCase } from '../noyau/projection.ts'
import { Edition, type Outil, type Trace } from './edition.ts'
import { Historique, type TableauCarte, type Geste } from './historique.ts'
import { positionMonde, type Noeud } from '../scene/noeud.ts'
import {
  serialiserProjet, versTexte, VERSION_FORMAT, relireNoeud, serialiserNoeud,
  type NoeudSerialise as NoeudSerialiseType,
} from '../export/format.ts'
import { chargeur, CIBLES, type Cible } from '../export/chargeurs.ts'
import { paquetGodot, paquetUnity, PAQUETS } from '../export/moteurs.ts'
import { pageDeJeu, paquetBureau } from '../export/jeu-web.ts'
import { zipper } from '../export/paquet.ts'
import { MONDES, type Monde } from '../demo/mondes.ts'
import { Atelier } from './atelier-panneau.ts'
import { mondeDepuisProjet } from './monde-projet.ts'
import { Palette as PalettePanneau } from './palette-panneau.ts'
import { PanneauProjet } from './projet-panneau.ts'
import {
  projetNeuf, ajouterSonImporteProjet, ajouterCarteImporteeProjet,
  retirerNoeudProjet, dupliquerNoeudProjet, collerNoeudProjet,
} from './projet-neuf.ts'
import { scriptsVersFichiers, appliquerFichiersScripts } from './scripts-dossier.ts'
import { depuisTiled, estDuTiled } from '../export/tiled.ts'
import { depuisLdtk, estDuLdtk } from '../export/ldtk.ts'
import { PanneauFichiers, genreDe } from './fichiers-panneau.ts'
import { PanneauConsole, type GenreMessage } from './console-panneau.ts'
import { chercherDansProjet, type Trouvaille } from './trouver.ts'
import { rendre as rendreSon, dechiffrerWav, base64DepuisOctets } from '../runtime/son.ts'
import { rendreMusique } from '../runtime/musique.ts'
import type { ProjetSerialise } from '../export/format.ts'
import { retirerDe } from '../runtime/entites.ts'
import * as dossier from '../io/dossier.ts'
import { ecrire } from '../runtime/rendu-texte.ts'
import {
  salle as salleNeuve, chevauchements, type Salle as SalleJeu,
} from '../niveau/salles.ts'

/**
 * L'editeur.
 *
 * L'ordre des travaux est deliberé. Un editeur qui sait poser des tuiles mais
 * dont on ne peut pas essayer le resultat ne dit rien de ce que le jeu vaut ;
 * un moteur qui fait tourner quelque chose de jouable dit tout de suite si le
 * contrat de pixel tient, si les collisions accrochent, si la camera tremble.
 * On commence donc par « Jouer », et les outils d'edition viennent se brancher
 * sur une chose qui vit.
 *
 * Depuis, trois mondes s'y chargent au lieu d'un : vue de dessus, vue de cote
 * avec gravite, isometrique. Ils partagent tout — la grille, les collisions,
 * le heros, le contrat de pixel — et ne different que par une projection et un
 * script. C'est la seule facon de verifier qu'un mode marche : le lancer.
 */
const canevas = document.getElementById('vue') as HTMLCanvasElement
const boutonJouer = document.getElementById('jouer') as HTMLButtonElement
const boutonArreter = document.getElementById('arreter') as HTMLButtonElement
const boutonPause = document.getElementById('pause') as HTMLButtonElement
const boutonUnPas = document.getElementById('unPas') as HTMLButtonElement
const info = document.getElementById('info') as HTMLElement
const verdict = document.getElementById('verdict') as HTMLElement
const mesure = document.getElementById('mesure') as HTMLElement
const aide = document.getElementById('aide') as HTMLElement
const selectMonde = document.getElementById('monde') as HTMLSelectElement
const outils = document.getElementById('outils') as HTMLElement
const voirCollision = document.getElementById('voirCollision') as HTMLInputElement

for (const m of MONDES) {
  const o = document.createElement('option')
  o.value = m.id
  o.textContent = m.nom
  selectMonde.appendChild(o)
}

/* ------------------------------------------------------------------ */
/* La console : ce que l'editeur a a dire                              */
/* ------------------------------------------------------------------ */

/**
 * Elle nait AVANT tout le reste.
 *
 * La premiere faute est souvent celle du premier chargement — un projet dont
 * un script ne compile pas, un monde d'exemple casse par une modification.
 * Une console construite apres le chargement ne l'aurait pas entendue.
 */
const consolePanneau = new PanneauConsole({
  panneau: document.getElementById('console') as HTMLElement,
  corps: document.getElementById('consoleCorps') as HTMLElement,
  bascule: document.getElementById('basculeConsole') as HTMLButtonElement,
  fermer: document.getElementById('fermerConsole') as HTMLButtonElement,
  vider: document.getElementById('viderConsole') as HTMLButtonElement,
})

/** Ecrit une ligne dans la console. Rend vrai si la ligne est neuve. */
function signaler(genre: GenreMessage, texte: string, source = ''): boolean {
  return consolePanneau.dire(genre, texte, source)
}

/**
 * Dit quelque chose qui ne va pas : dans la barre d'etat ET dans la console.
 *
 * La barre d'etat ne garde qu'un message a la fois — le suivant efface le
 * precedent, et l'on n'a souvent pas le temps de lire. Ce qui s'y dit de
 * grave doit donc rester quelque part.
 */
function avertir(texte: string, source = ''): void {
  verdict.textContent = texte
  signaler('avertissement', texte, source)
}

/*
 * LES EXCEPTIONS DU MOTEUR LUI-MEME.
 *
 * Elles partaient dans la console du navigateur, que personne n'ouvre — et
 * l'editeur continuait comme si de rien n'etait, l'air cassé sans dire un
 * mot. Elles arrivent maintenant la ou l'on regarde.
 */
window.addEventListener('error', (e) => {
  signaler('faute', e.message || String(e.error), 'moteur')
})
window.addEventListener('unhandledrejection', (e) => {
  signaler('faute', `promesse rejetée : ${String(e.reason)}`, 'moteur')
})

let monde: Monde
let jeu: Jeu
/** D'ou vient l'entite qu'on traine : c'est ce que « defaire » remettra. */
let depart: { x: number; y: number } | null = null
/** Le rectangle d'une salle AVANT qu'on la tire. Meme role que `depart`. */
let tireeDepart: { x: number; y: number; largeur: number; hauteur: number } | null = null
let palette: Palette
let edition: Edition

/**
 * LE JOURNAL DE LA SEANCE.
 *
 * ## Pourquoi il vit ici et non dans l'Edition
 *
 * Il y vivait, et c'etait le defaut le plus couteux de l'editeur : une
 * Edition neuve nait a chaque reconstruction du monde — et le monde est
 * reconstruit par CHAQUE geste de structure. Redimensionner une carte,
 * ajouter un calque, importer une planche effacaient donc tout ce qu'on
 * pouvait defaire, sans un mot. On a longtemps ecrit dans l'aide que « ces
 * gestes-la ne se defont pas » ; c'etait honnete, et c'etait la premiere
 * chose qu'un moteur doit savoir faire.
 *
 * Le journal traverse donc la seance. Pour qu'il le puisse, aucun geste ne
 * garde de reference vivante : un coup de pinceau garde l'ADRESSE de ses
 * tableaux (voir `historique.ts`), une entite garde son identifiant et sa
 * description, un geste de structure garde deux photographies du projet. Tout
 * ce qui est resolu l'est au moment de defaire, dans le projet d'alors.
 */
const journal = new Historique()

/**
 * Retrouve un tableau de carte par son adresse, dans le projet vivant.
 *
 * Toutes les cartes, pas seulement celle qu'on regarde : defaire un coup de
 * pinceau donne sur le niveau deux doit le defaire meme si l'on edite le
 * niveau un — et `defaire` ramenera ensuite le niveau deux sous les yeux.
 */
function resoudreTableau(cible: string): TableauCarte | null {
  const m = /^carte:(.*?)\/(?:calque:(.*?)\/)?(solides|cases|presence)$/.exec(cible)
  if (!m) return null
  const [, nomCarte, nomCalque, quoi] = m
  const cartes = monde.cartes ?? [{ nom: monde.carteActive ?? '', carte: monde.carte }]
  const c = cartes.find((q) => q.nom === nomCarte)?.carte
    ?? (nomCarte === (monde.carteActive ?? '') ? monde.carte : null)
  if (!c) return null
  if (quoi === 'solides') return c.solides
  const calque = c.calques.find((q) => q.nom === nomCalque)
  if (!calque) return null
  return quoi === 'cases' ? calque.cases : (calque.presence ?? null)
}

/**
 * L'atelier de scripts.
 *
 * Il recoit des accesseurs et non des objets : le jeu et la scene sont
 * reconstruits a chaque changement de monde, et lui garder une reference
 * signifierait piloter le monde precedent sans s'en apercevoir.
 */
const atelier = new Atelier(
  {
    panneau: document.getElementById('atelier') as HTMLElement,
    bascule: document.getElementById('basculeAtelier') as HTMLButtonElement,
    selection: document.getElementById('scriptNoeud') as HTMLSelectElement,
    source: document.getElementById('scriptSource') as HTMLTextAreaElement,
    appliquer: document.getElementById('appliquerScript') as HTMLButtonElement,
    retablir: document.getElementById('retablirScript') as HTMLButtonElement,
    fermer: document.getElementById('fermerAtelier') as HTMLButtonElement,
    message: document.getElementById('scriptMessage') as HTMLElement,
    aide: document.getElementById('scriptAide') as HTMLElement,
  },
  () => jeu,
  () => monde.racine,
  () => { if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() } },
  // Ce que l'atelier dit, la console le garde : une exception levee soixante
  // fois par seconde par un noeud qu'on ne regarde pas ne paraissait nulle
  // part.
  (genre, texte) => {
    signaler(genre === 'faute' ? 'faute' : (genre === 'avertissement' ? 'avertissement' : 'note'),
      texte, 'script')
  },
)

/**
 * Charge un monde.
 *
 * Le jeu est reconstruit et non reconfigure. On pourrait garder l'instance et
 * lui echanger sa scene, sa carte, sa projection et ses scripts ; il resterait
 * l'etat qu'on aurait oublie de remettre — un accumulateur a mi-pixel, une
 * camera hors bornes, un script de l'ancien monde toujours abonne. Reconstruire
 * coute quelques millisecondes une fois par changement de mode, et supprime
 * toute une classe de bogues qui ne se voient qu'au deuxieme changement.
 */
function charger(id: string): void {
  const relu = projetsRelus.get(id)
  installer(relu ? relu() : (MONDES.find((m) => m.id === id) ?? MONDES[0]).construire())
}

/** Les projets relus depuis un fichier, ajoutes a la liste des mondes. */
const projetsRelus = new Map<string, () => Monde>()

function installer(nouveau: Monde): void {
  if (jeu?.tourne) arreter()
  monde = nouveau
  jeu = new Jeu(canevas, monde.racine, monde.carte, {
    vue: monde.vue,
    projection: monde.projection,
  })
  monde.installer(jeu)
  // Toute planche du projet devient une source de sprites, meme si le monde ne
  // l'a pas branchee lui-meme. Sans cela, une entite posee dans l'editeur avec
  // une planche que le monde n'employait pas ne se dessine pas — et l'on croit
  // que le clic n'a rien fait.
  for (const t of monde.planches) {
    if (jeu.sprites.has(t.nom)) continue
    jeu.sprites.set(t.nom,
      atlasDepuisLettres(t.dessins, t.cle, t.largeurCase, t.colonnes, t.hauteurCase))
  }
  palette = new Palette(monde.id, monde.couleurs.map(depuisHex))

  const outilPrecedent = edition?.etat.outil ?? 'terrain'
  edition = new Edition(jeu, monde.carte, {
    // Le MEME journal d'un monde a l'autre : voir sa declaration.
    historique: journal,
    resoudre: resoudreTableau,
    nomCarte: monde.carteActive ?? '',
    // Le redessin passe par les variables du module, jamais par celles
    // capturees a la naissance du geste : trois reconstructions plus tard,
    // celles-la peindraient un ecran abandonne.
    redessiner: () => { if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() } },
  })
  edition.etat.montrerCollision = voirCollision.checked
  edition.changerCarte(monde.carte, monde.tuilePinceau, monde.carteActive ?? '')
  edition.etat.espece = monde.especes.find((e) => e.degats > 0)?.id
    ?? monde.especes[0]?.id ?? null
  edition.etat.calqueChoisi = monde.carte.calques[monde.carte.calques.length - 1]?.nom ?? null

  /**
   * Poser et retirer une SALLE.
   *
   * Une salle n'est pas un dessin : c'est un rectangle qui dit ou la camera
   * s'arrete, ou l'on reapparait et quand on change de tableau. Elle n'a donc
   * ni calque ni tuile, et l'editeur la traite a part.
   *
   * Les salles vivent sur le MONDE et non dans l'historique du dessin : les
   * melanger ferait qu'un « defaire » sur un coup de pinceau retirerait aussi
   * une salle posee entre-temps, ce que personne n'attend.
   */
  // Les salles VISIBLES sont celles de la carte sous le pinceau : une salle
  // du niveau deux dessinee sur le niveau un semblerait poser un tableau
  // fantome — et le clic droit le retirerait sans qu'on comprenne quoi.
  const sallesIci = (): SalleJeu[] => (monde.salles ?? []).filter(
    (q) => !(q.carte ?? '') || q.carte === (monde.carteActive ?? ''))
  /*
   * Les salles se defont, elles aussi.
   *
   * Elles n'entraient dans aucun historique : « elles vivent sur le monde »,
   * disait le commentaire, « les melanger au dessin ferait qu'un defaire sur
   * un coup de pinceau retirerait une salle ». C'etait vrai du temps ou
   * l'historique photographiait des tableaux de cases. Depuis que le journal
   * accepte n'importe quel geste, une salle y a sa place comme le reste — et
   * un rectangle tire de travers se rattrape au Ctrl+Z au lieu de demander un
   * clic droit bien vise.
   *
   * Le geste garde la salle par sa VALEUR et non par sa reference : le projet
   * est reconstruit a chaque geste de structure, et la salle d'alors ne sera
   * plus le meme objet.
   */
  const posesSalle = (s: SalleJeu): void => {
    const m = monde as Monde & { salles?: SalleJeu[] }
    if (!m.salles) m.salles = []
    if (m.salles.some((q) => q.nom === s.nom)) return
    m.salles.push(structuredClone(s))
    panneauProjet?.montrer()
    majEtat()
  }
  const otesSalle = (nom: string): SalleJeu | null => {
    const m = monde as Monde & { salles?: SalleJeu[] }
    if (!m.salles) return null
    const i = m.salles.findIndex((q) => q.nom === nom)
    if (i < 0) return null
    const [partie] = m.salles.splice(i, 1)
    panneauProjet?.montrer()
    majEtat()
    return partie
  }
  edition.surSalle = {
    liste: () => sallesIci() as { nom: string; x: number; y: number; largeur: number; hauteur: number }[],
    poser: (x, y, largeur, hauteur) => {
      const m = monde as Monde & { salles?: SalleJeu[] }
      if (!m.salles) m.salles = []
      // Un nom qui ne se repete pas : c'est par lui qu'on retrouve une salle,
      // et deux salles du meme nom rendraient « laquelle ? » sans reponse.
      let n = m.salles.length + 1
      while (m.salles.some((q) => q.nom === `salle${n}`)) n++
      // La salle nait sur la carte SOUS LE PINCEAU : c'est la qu'on la voit
      // naitre, c'est la qu'elle doit vivre — voir le format v15.
      const neuve = salleNeuve(`salle${n}`, { x, y, largeur, hauteur, carte: monde.carteActive ?? '' })
      posesSalle(neuve)
      journal.poser({
        nom: 'salle posée',
        carte: monde.carteActive ?? '',
        defaire: () => { otesSalle(neuve.nom) },
        refaire: () => posesSalle(neuve),
      })
      majHistorique()
      // Le compte et l'avertissement vont dans la barre d'etat, qui les
      // GARDE : voir `majEtat`.
      panneauProjet?.montrer()
    },
    retirer: (nom) => {
      const partie = otesSalle(nom)
      if (!partie) return
      journal.poser({
        nom: 'salle retirée',
        carte: partie.carte ?? (monde.carteActive ?? ''),
        defaire: () => posesSalle(partie),
        refaire: () => { otesSalle(nom) },
      })
      majHistorique()
    },
    /*
     * Tirer une salle : la deplacer, ou la retailler par un bord.
     *
     * Pendant le geste on ecrit DIRECTEMENT dans la salle vivante — soixante
     * fois par seconde, il n'est pas question de reconstruire quoi que ce
     * soit. Le journal ne recoit qu'a la fin, et il garde les deux
     * rectangles : le geste se defait alors d'un coup, au lieu de rejouer
     * trente cases traversees.
     */
    tirer: (nom, rect, fini) => {
      const m = monde as Monde & { salles?: SalleJeu[] }
      const s2 = m.salles?.find((q) => q.nom === nom)
      if (!s2) return
      if (!fini) {
        if (!tireeDepart) {
          tireeDepart = { x: s2.x, y: s2.y, largeur: s2.largeur, hauteur: s2.hauteur }
        }
        Object.assign(s2, rect)
        panneauProjet?.montrer()
        majEtat()
        return
      }
      const avant = tireeDepart
      tireeDepart = null
      if (!avant) return
      const apres = { x: rect.x, y: rect.y, largeur: rect.largeur, hauteur: rect.hauteur }
      if (avant.x === apres.x && avant.y === apres.y
        && avant.largeur === apres.largeur && avant.hauteur === apres.hauteur) return
      const poser = (ou: typeof apres) => (): void => {
        const vive = (monde as Monde & { salles?: SalleJeu[] }).salles?.find((q) => q.nom === nom)
        if (!vive) return
        Object.assign(vive, ou)
        panneauProjet?.montrer()
        majEtat()
        if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
      }
      const quoi = apres.largeur === avant.largeur && apres.hauteur === avant.hauteur
        ? `salle « ${nom} » déplacée` : `salle « ${nom} » retaillée`
      journal.poser({
        nom: quoi,
        carte: s2.carte ?? (monde.carteActive ?? ''),
        defaire: poser(avant),
        refaire: poser(apres),
      })
      majHistorique()
      // Le MEME mot que dans le journal : ce qu'on lit dans la barre d'etat
      // doit etre ce qu'on retrouvera dans l'infobulle du « défaire ».
      verdict.textContent = `${quoi} : ${apres.largeur}×${apres.hauteur} `
        + `en ${apres.x},${apres.y} — Ctrl+Z la remet`
    },
  }

  /**
   * Poser et retirer une entite.
   *
   * Poser, c'est ajouter un NOEUD a la scene ; retirer, c'est l'en oter. Le
   * peuplement s'accorde tout seul au pas suivant — c'est ce qui permet
   * d'editer pendant que le jeu tourne sans rien avoir a prevenir.
   */
  edition.surEntite = (cx, cy, retirer) => {
    const peuplement = monde.peuplement
    if (!peuplement) { verdict.textContent = 'Ce monde n’accueille pas d’entités.'; return }
    const t = monde.carte.tuile
    if (retirer) {
      // Tout ce que la CASE recouvre, et non ce qui touche un point : une
      // entite est ancree a ses pieds, et le point vise tombe sur le bord de sa
      // boite ou juste a cote.
      const dedans = peuplement.quiTouche(cx * t, cy * t, t, t)
      const n = dedans[dedans.length - 1] ?? peuplement.sous(cx * t + t / 2, cy * t + t - 1)
      if (n) {
        const parent = parentDe(monde.racine, n) ?? monde.racine
        // On passe par la scene si `tuer` ne connait pas l'entite : elle peut
        // n'avoir jamais ete adoptee — posee pendant que le jeu est arrete.
        if (!peuplement.tuer(n.id)) retirerDe(monde.racine, n)
        monde.oublierDepart?.(n)
        edition.historique.poser(gesteEntite('retrait d’entité', parent, n))
      }
      majEtat()
      majHistorique()
      return
    }
    if (edition.etat.assemblage) {
      /*
       * Poser un ASSEMBLAGE : une copie du modele, identifiants neufs, la
       * racine aux pieds de la case — la meme ancre qu'une entite. La copie
       * s'attache VIVANTE a la scene, comme une entite posee : le peuplement
       * l'adopte au pas suivant, et le geste se defait au Ctrl+Z.
       */
      const modele = (monde.assemblages ?? []).find((a) => a.nom === edition.etat.assemblage)
      if (!modele) return
      const pris = new Set<string>()
      const ramasser = (q: { id: string; enfants: { id: string; enfants: unknown[] }[] }): void => {
        pris.add(q.id)
        q.enfants.forEach((e) => ramasser(e as never))
      }
      ramasser(monde.racine as never)
      const libre = (base: string): string => {
        let candidat = `${base}-2`
        let n2 = 3
        while (pris.has(candidat)) candidat = `${base}-${n2++}`
        pris.add(candidat)
        return candidat
      }
      const copie = structuredClone(modele.racine)
      const renommer = (q: typeof copie): void => {
        q.id = libre(q.id)
        q.enfants.forEach(renommer)
      }
      renommer(copie)
      copie.x = cx * t + t / 2
      copie.y = cy * t + t
      const noeud = relireNoeud(copie)
      monde.racine.enfants.push(noeud)
      monde.retenirDepart?.(noeud, monde.racine)
      edition.historique.poser(gesteEntite('assemblage posé', monde.racine, noeud, true))
      verdict.textContent = `« ${modele.nom} » posé — des identifiants neufs, le modèle intact`
      majEtat()
      majHistorique()
      return
    }
    if (!edition.etat.espece) return
    // Les pieds au bas de la case : c'est la convention d'ancrage de tout le
    // moteur, et c'est ce qui aligne l'entite sur le sol qu'elle foule.
    const pose = peuplement.poser(edition.etat.espece, cx * t + t / 2, cy * t + t)
    if (pose) {
      monde.retenirDepart?.(pose, monde.racine)
      edition.historique.poser(gesteEntite('entité posée', monde.racine, pose, true))
    }
    majEtat()
    majHistorique()
  }

  /**
   * Deplacer une entite deja posee.
   *
   * On la SAISIT au clic gauche, on la traine, on la lache. Sans ce geste il
   * fallait retirer et reposer — deux clics, un identifiant perdu, et tout ce
   * qui renvoyait a l'entite pointait dans le vide. Le noeud reste le meme
   * d'un bout a l'autre : seules ses coordonnees changent.
   */
  edition.surDeplacement = {
    saisir: (cx, cy) => {
      const peuplement = monde.peuplement
      if (!peuplement) return null
      const t = monde.carte.tuile
      const dedans = peuplement.quiTouche(cx * t, cy * t, t, t)
      const n = dedans[dedans.length - 1] ?? null
      if (!n) return null
      depart = { x: n.x, y: n.y }
      // La moitie vue→arbre du dialogue : l'arbre surligne qui l'on tient,
      // l'inspecteur montre ce qu'il porte, et la vue l'entoure.
      choisirSeul(n.id)
      return n.id
    },
    poser: (id, cx, cy) => {
      const n = trouverEntite(monde.racine, id)
      if (!n) return
      const t = monde.carte.tuile
      n.x = cx * t + t / 2
      n.y = cy * t + t
      majEtat()
    },
    finir: (id) => {
      const n = trouverEntite(monde.racine, id)
      if (!n || !depart) return
      const avant = depart
      const apres = { x: n.x, y: n.y }
      depart = null
      if (avant.x === apres.x && avant.y === apres.y) return
      // Le geste ne garde ni le noeud ni la scene, mais leurs NOMS : trois
      // reconstructions plus tard, il retrouvera l'entite d'aujourd'hui au
      // lieu d'ecrire dans le fantome de celle d'hier.
      const scene = sceneActive()
      const poser = (ou: { x: number; y: number }) => (): void => {
        const cible = trouverEntite(racineDeScene(scene), id)
        if (!cible) return
        cible.x = ou.x
        cible.y = ou.y
        // Le depart SUIT l'entite deplacee — sinon le premier arret la
        // renverrait la ou elle etait avant le geste.
        monde.retenirDepart?.(cible, parentDe(racineDeScene(scene), cible) ?? racineDeScene(scene))
        if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
      }
      poser(apres)()
      edition.historique.poser({
        nom: 'entité déplacée',
        defaire: poser(avant),
        refaire: poser(apres),
      })
      majHistorique()
      verdict.textContent = `entité déplacée en ${apres.x},${apres.y}`
    },
  }

  /*
   * Maj + glisser : un rectangle qui CHOISIT tout ce qu'il couvre.
   *
   * On parcourt la SCENE et non le peuplement. Le peuplement est la liste des
   * entites que le jeu a adoptees, et il est vide tant qu'on n'a pas joue :
   * un rectangle tire sur une carte fraichement ouverte n'aurait rien choisi
   * du tout — c'est le banc qui l'a montre, en tirant sur six creatures
   * visibles a l'ecran et en n'en obtenant aucune.
   *
   * La CASE de l'entite decide, comme partout ailleurs : l'editeur pose les
   * entites par les pieds, au bas d'une case, et c'est cette case qu'on vise
   * en cliquant.
   */
  edition.surSelectionRect = (cx0, cy0, cx1, cy1) => {
    const t = monde.carte.tuile
    const pris: string[] = []
    const parcourir = (n: Noeud, ax: number, ay: number): void => {
      const x = ax + n.x
      const y = ay + n.y
      if ((n as unknown as { espece?: string }).espece) {
        const cx = Math.floor(x / t)
        const cy = Math.floor((y - 1) / t)
        if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) pris.push(n.id)
      }
      for (const e of n.enfants) parcourir(e, x, y)
    }
    parcourir(monde.racine, 0, 0)
    selection = pris
    panneauProjet.designerNoeuds(selection)
    jeu.dessiner()
    redessinerEdition()
    verdict.textContent = selection.length
      ? `${selection.length} nœud(s) choisi(s) — flèches, Suppr, Ctrl+D, Ctrl+C agissent sur tous`
      : 'Rien dans ce rectangle.'
  }

  choisirOutil(outilPrecedent)
  majHistorique()

  jeu.cadrer()
  jeu.dessiner()
  redessinerEdition()

  /*
   * Ce qu'un script ecrit avec `c.tracer` arrive dans la console. Le crochet
   * se rebranche a chaque monde : le jeu est neuf, le sien serait nul.
   */
  jeu.surTrace = (ligne) => { signaler('note', ligne, 'script') }
  // Et ce que le monde a REFUSE de compiler, en clair — le compte de la barre
  // d'etat ne disait ni lesquels ni pourquoi.
  for (const f of monde.fautesScripts ?? []) signaler('faute', f, 'projet')

  atelier.reinitialiser()
  // L'aide du pied montre L'OUTIL courant, pas la fiche du monde : c'est la
  // question qu'on se pose en editant. La fiche du monde vit derriere « ? ».
  aide.textContent = AIDE_OUTILS[edition.etat.outil] ?? monde.aide
  info.textContent = `${monde.vue.largeur}×${monde.vue.hauteur} · ${monde.carte.largeur}×${monde.carte.hauteur} · ${monde.projection.mode}, ${monde.projection.regard}`
  majEtat()
  majMesure()
  appliquerCadre()
  panneauProjet?.montrer()
  ;(window as unknown as { pfe: unknown }).pfe = {
    jeu, monde, palette, edition, journal, console: consolePanneau,
    // Ce qui est choisi : le banc le lit, et c'est le seul moyen de verifier
    // qu'un rectangle a designe ce qu'il recouvrait.
    selection: () => [...selection],
    // Le banc a besoin de declencher un brouillon sans attendre 45 secondes.
    brouillon: () => deposerBrouillon(),
  }
}

/* ------------------------------------------------------------------ */
/* Le dossier de travail, l'enregistrement et la relecture             */
/* ------------------------------------------------------------------ */

const boutonDossier = document.getElementById('dossier') as HTMLButtonElement
let travail: dossier.PoigneeDossier | null = null

function direDossier(): void {
  boutonDossier.textContent = travail ? `📁 ${travail.name}` : 'Dossier…'
  boutonDossier.title = travail
    ? `Dossier de travail : ${travail.name}. Cliquer pour en choisir un autre.`
    : (dossier.disponible()
      ? 'Choisir le dossier de travail du projet'
      : 'Ce navigateur ne sait pas ouvrir un dossier : l’enregistrement passera par un téléchargement.')
}

async function choisirDossierTravail(): Promise<void> {
  if (!dossier.disponible()) {
    verdict.textContent = 'Ce navigateur ne donne pas accès à un dossier. '
      + 'Enregistrer téléchargera le fichier, Ouvrir demandera à le choisir.'
    return
  }
  const d = await dossier.choisirDossier()
  if (!d) return
  travail = d
  await dossier.memoriser(d)
  direDossier()
  verdict.textContent = `Dossier de travail : ${d.name}`
}

boutonDossier.addEventListener('click', () => { void choisirDossierTravail() })

/** Le projet courant, tel qu'il partira dans le fichier. */
function projetCourant() {
  return serialiserProjet(
    monde.id.startsWith('projet:') ? monde.id.slice(7) : monde.id,
    // La vue du MONDE, jamais celle de l'ecran : pendant l'edition, l'ecran
    // porte le cadre d'edition — la vue du jeu multipliee par le zoom. La
    // serialiser gonflait la vue du projet a CHAQUE geste du panneau fait en
    // zoom arriere : dix-sept gestes a 1,5 et le projet demandait un tampon
    // de trois cent mille pixels de large. C'est la fumee qui l'a trouve, en
    // mesurant un ecran noir la ou la nuit aurait du tomber.
    monde.vue, palette,
    // TOUTES les cartes et TOUTES les scenes quand le monde les porte : avant
    // cela, enregistrer un projet de trois niveaux n'en gardait qu'un — en
    // silence. La paire active est la MEME reference que dans la liste, donc
    // ce qu'on vient de peindre part avec.
    monde.cartes ?? [{ nom: monde.id.startsWith('projet:') ? 'carte' : monde.id, carte: monde.carte }],
    monde.scenes ?? [{ nom: 'principale', racine: monde.racine }],
    monde.animations,
    monde.planches,
    monde.projection,
    monde.especes,
    monde.sons ?? [],
    monde.dialogues ?? [],
    // Le plan de touches part avec le reste : un joueur qui a remappe son
    // saut ne doit pas le reperdre parce que le remappage vivait en memoire.
    jeu.entrees.planCourant(),
    monde.musiques ?? [],
    monde.textes ?? {},
    monde.salles ?? [],
    monde.declencheurs ?? [],
    monde.deroule ?? { titre: '', ordre: [] },
    monde.lumiere ?? { ambiante: 1 },
    monde.regles ?? { epee: true, coeurs: true, reapparitionMs: 700, degatsPointes: 1 },
    monde.assemblages ?? [],
  )
}

async function enregistrer(): Promise<void> {
  const p = projetCourant()
  const nom = `${p.nom}.json`
  const texte = versTexte(p)
  if (travail) {
    try {
      await dossier.ecrire(travail, nom, texte)
      /*
       * Les scripts, en VRAIS fichiers a cote : scripts/espece-*.js,
       * scripts/declencheur-*.js. C'est la qu'on les edite avec son propre
       * editeur — et « Jouer » les relira. Voir scripts-dossier.ts.
       */
      const fichiers = scriptsVersFichiers(p)
      for (const f of fichiers) await dossier.ecrireSous(travail, 'scripts', f.nom, f.contenu)
      const combien = Math.max(0, fichiers.length - 1)
      verdict.textContent = `Enregistré : ${travail.name}/${nom} (${Math.round(texte.length / 1024)} Ko)`
        + (combien ? ` · scripts/ : ${combien} fichier(s) à éditer avec votre éditeur` : '')
      return
    } catch (e) {
      avertir(e instanceof Error ? e.message : String(e), 'fichier')
      return
    }
  }
  dossier.telecharger(nom, texte)
  verdict.textContent = `Téléchargé : ${nom}. Choisissez un dossier pour enregistrer sur place.`
}

function relire(texte: string, nomFichier: string): void {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch (e) {
    avertir(`« ${nomFichier} » n’est pas du JSON valide : ${e instanceof Error ? e.message : e}`, 'fichier')
    return
  }
  const p = brut as ReturnType<typeof projetCourant>
  if (!p || typeof p.version !== 'number' || !Array.isArray(p.cartes)) {
    avertir(`« ${nomFichier} » n’a pas la forme d’un projet PixelForge.`, 'fichier')
    return
  }
  // On lit une version plus recente sans faire semblant de la comprendre.
  const avertissement = p.version > VERSION_FORMAT
    ? ` (fichier en version ${p.version}, lecteur en version ${VERSION_FORMAT} : `
      + 'ce qu’il porte en plus est ignoré)'
    : ''
  const id = `projet:${nomFichier}`
  projetsRelus.set(id, () => mondeDepuisProjet(p, nomFichier))
  if (!Array.from(selectMonde.options).some((o) => o.value === id)) {
    const o = document.createElement('option')
    o.value = id
    o.textContent = `📄 ${nomFichier}`
    selectMonde.appendChild(o)
  }
  selectMonde.value = id
  // Un AUTRE projet commence : ce qu'on pouvait defaire dans le precedent
  // n'a plus de sens ici, et le garder ferait qu'un Ctrl+Z de trop
  // reinstallerait le projet d'avant a la place de celui qu'on vient
  // d'ouvrir.
  journal.vider()
  charger(id)
  majHistorique()
  verdict.textContent = `Relu : ${nomFichier}${avertissement}`
}

/**
 * Relit un projet transforme et rouvre l'editeur dessus.
 *
 * C'est le SEUL chemin par lequel la structure change — taille de carte,
 * calques, catalogue d'especes, projet neuf. Voir `projet-neuf.ts` : le geste
 * transforme le fichier, et l'editeur le relit comme il relirait un fichier
 * venu du disque. Rien n'est mis a jour en place, donc rien ne peut etre
 * oublie.
 */
function installerProjet(p: ProjetSerialise, nom: string, carteVoulue = ''): void {
  const id = `projet:${nom}`
  projetsRelus.set(id, () => mondeDepuisProjet(p, nom, carteVoulue))
  if (!Array.from(selectMonde.options).some((o) => o.value === id)) {
    const o = document.createElement('option')
    o.value = id
    o.textContent = `📄 ${nom}`
    selectMonde.appendChild(o)
  } else {
    const o = Array.from(selectMonde.options).find((q) => q.value === id)
    if (o) o.textContent = `📄 ${nom}`
  }
  selectMonde.value = id
  charger(id)
  // Le panneau des fichiers montre l'inventaire du projet : un geste de
  // structure vient peut-etre de le changer.
  panneauxAPrevenir.forEach((f) => f())
}

/** Ce que installerProjet previent — rempli plus bas, une fois les panneaux nes. */
const panneauxAPrevenir: (() => void)[] = []

/** Change la carte sous le pinceau, sans rien changer au projet. */
function editerCarte(nom: string): void {
  installerProjet(projetCourant(),
    monde.id.startsWith('projet:') ? monde.id.slice(7) : monde.id, nom)
}

/**
 * Un geste de STRUCTURE, et son annulation.
 *
 * ## Pourquoi deux photographies du projet entier
 *
 * Un geste de structure ne touche pas une case : il change la forme du projet
 * — une carte plus grande, un calque de moins, une espece de plus, un noeud
 * deplace dans l'arbre. Ecrire l'inverse de chacun de ces gestes, un par un,
 * c'est trente inverses a tenir a jour, et le premier oubli fait un « defaire »
 * qui ne defait pas tout : le pire des defauts, parce qu'on ne s'en apercoit
 * que trois gestes plus tard. C'est deja l'argument qui a fait photographier
 * les cases plutot que les coups de pinceau ; il vaut ici a plus forte raison.
 *
 * On photographie donc le projet AVANT et APRES, sous sa forme de texte —
 * celle qui ne garde aucune reference vivante, et qui se mesure en octets,
 * ce que le journal compte pour ne pas manger la memoire de l'onglet.
 *
 * Le prix est connu : un aller-retour par le serialiseur a chaque geste de
 * structure. C'est le prix d'un enregistrement, une fois par geste rare.
 */
function gesteStructure(nom: string, apres: ProjetSerialise, carteApres?: string): void {
  const carteAvant = monde.carteActive ?? ''
  // AVANT toute modification : `apres` a ete calcule sur une copie, le monde
  // vivant est encore celui d'avant le geste.
  const avantTexte = versTexte(projetCourant())
  const apresTexte = versTexte(apres)
  const ou = carteApres ?? carteAvant
  installerProjet(apres, apres.nom, ou)
  const remettre = (texte: string, carte: string) => (): void => {
    const p = JSON.parse(texte) as ProjetSerialise
    installerProjet(p, p.nom, carte)
  }
  journal.poser({
    nom,
    poids: avantTexte.length + apresTexte.length,
    defaire: remettre(avantTexte, carteAvant),
    refaire: remettre(apresTexte, ou),
  })
  majHistorique()
}

const panneauProjet = new PanneauProjet(
  {
    panneau: document.getElementById('projet') as HTMLElement,
    corps: document.getElementById('projetCorps') as HTMLElement,
    message: document.getElementById('projetMessage') as HTMLElement,
    bascule: document.getElementById('basculeProjet') as HTMLButtonElement,
    fermer: document.getElementById('fermerProjet') as HTMLButtonElement,
  },
  {
    projet: () => projetCourant(),
    appliquer: (p, quoi) => {
      // Un geste du panneau ne change pas de carte : redimensionner le
      // niveau deux doit laisser le niveau deux sous le pinceau.
      //
      // Et il passe par le JOURNAL : c'est ici que se joue le « Ctrl+Z sur
      // tout ». Tous les gestes de structure du panneau — taille de carte,
      // calques, especes, arbre de scene, assemblages, planches — arrivent
      // par cette unique porte, donc un seul appel les rend tous defaisables.
      gesteStructure(quoi, p, monde.carteActive ?? '')
      verdict.textContent = quoi
    },
    carteActive: () => monde.carteActive ?? '',
    /*
     * Centrer la vue d'edition sur un point : le bouton « voir » de
     * l'arbre. La camera d'edition est celle que l'outil Main deplace —
     * on la pose, on redessine, et le cadre d'edition suit.
     */
    viser: (x, y) => {
      jeu.camera.x = Math.round(x - jeu.ecran.vue.largeur / 2)
      jeu.camera.y = Math.round(y - jeu.ecran.vue.hauteur / 2)
      jeu.dessiner()
      redessinerEdition()
    },
    editerCarte: (nom) => {
      editerCarte(nom)
      verdict.textContent = `Carte « ${nom} » sous le pinceau`
    },
    dire: (m) => { verdict.textContent = m },
    planches: () => monde.planches,
    /**
     * Une planche a change : on refait son atlas, et l'on redessine.
     *
     * Refaire l'atlas et non le monde. Un atlas est un canevas hors ecran
     * reconstruit en quelques millisecondes ; le monde, lui, emporte la scene,
     * le peuplement et l'historique. Les confondre rendrait le pinceau
     * inutilisable des le deuxieme pixel.
     */
    planchesChangees: () => {
      for (const t of monde.planches) {
        const atlas = atlasDepuisLettres(t.dessins, t.cle, t.largeurCase, t.colonnes, t.hauteurCase)
        jeu.sprites.set(t.nom, atlas)
        const carte = jeu.cartes.get(t.nom)
        if (carte) jeu.cartes.set(t.nom, { carte: carte.carte, atlas })
      }
      // La carte du monde peut porter un autre nom que sa planche : on refait
      // aussi la sienne, sinon le decor garde l'ancien dessin.
      for (const [nom, c] of jeu.cartes) {
        const propre = jeu.sprites.get(nom) ?? jeu.sprites.get(monde.planches[0]?.nom ?? '')
        if (propre) jeu.cartes.set(nom, { carte: c.carte, atlas: propre })
      }
      if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
    },
    animations: () => monde.animations as unknown as never,
    sons: () => (monde.sons ?? []) as never,
    ecouter: (s) => ecouterSon(s),
    ecouterMusique: (m) => ecouterMusique(m),
    /*
     * L'inspecteur envoie ecrire : il ouvre l'atelier SUR le noeud. Sans
     * cela, « ce noeud a un script » se lisait dans l'inspecteur et se
     * modifiait dans un autre panneau, ou il fallait le retrouver dans une
     * liste de quinze noms.
     */
    editerScript: (nom) => {
      if (!atelier.ouvert) atelier.basculer(true)
      atelier.viser(nom)
    },
    surChoixNoeud: (id, ajouter) => {
      if (ajouter) basculerChoix(id)
      else choisirSeul(id)
    },
  },
)

/* ------------------------------------------------------------------ */
/* Le panneau des fichiers, et le depot d'assets                       */
/* ------------------------------------------------------------------ */

/**
 * Route un fichier vers ce qu'il EST : un .json s'ouvre comme projet, une
 * image devient une planche. C'est le meme aiguillage pour le panneau des
 * fichiers et pour le glisser-deposer — deux portes, une seule regle, sinon
 * les deux finissent par diverger.
 */
async function routerFichier(f: File): Promise<void> {
  const genre = genreDe(f.name)
  if (genre === 'projet') {
    const texte = await f.text()
    /*
     * Le contenu decide, jamais l'extension : un niveau Tiled s'exporte
     * souvent en `.json`, et un projet PixelForge pourrait s'appeler
     * `.tmj` par accident. On lit, on regarde, on route — et ce qui n'est
     * ni l'un ni l'autre part vers `relire`, qui sait DIRE ce qui cloche.
     */
    let brut: unknown = null
    try { brut = JSON.parse(texte) } catch { /* relire expliquera */ }
    if (estDuTiled(brut)) {
      const r = depuisTiled(brut)
      const p2 = ajouterCarteImporteeProjet(projetCourant(), f.name, r.carte)
      const nomCarte = p2.cartes[p2.cartes.length - 1].nom
      // Un import est un geste comme un autre : il se defait. Deposer le
      // mauvais fichier ne doit pas couter un « annuler tout, rouvrir ».
      gesteStructure(`carte Tiled « ${nomCarte} » importée`, p2, nomCarte)
      panneauProjet.ouvrirSur('carte')
      verdict.textContent = `Carte Tiled « ${nomCarte} » importée : ${r.calquesLus} calque(s), `
        + `${r.objetsLus} objet(s)${r.avertissements.length ? ` · ${r.avertissements.join(' · ')}` : ''}`
      return
    }
    if (estDuLdtk(brut)) {
      const r = depuisLdtk(brut)
      if (!r.cartes.length) {
        avertir(`« ${f.name} » : ${r.avertissements.join(' · ') || 'aucun niveau'}`, 'fichier')
        return
      }
      let p2 = projetCourant()
      let derniere = ''
      for (const c of r.cartes) {
        p2 = ajouterCarteImporteeProjet(p2, c.nom, c.carte)
        derniere = p2.cartes[p2.cartes.length - 1].nom
      }
      gesteStructure(`${r.cartes.length} niveau(x) LDtk importé(s)`, p2, derniere)
      panneauProjet.ouvrirSur('carte')
      verdict.textContent = `${r.cartes.length} niveau(x) LDtk importé(s)`
        + `${r.avertissements.length ? ` · ${r.avertissements.join(' · ')}` : ''}`
      return
    }
    relire(texte, f.name)
    return
  }
  if (genre === 'image' || genre === 'sprites') {
    await panneauProjet.importerFichier(f)
    panneauProjet.ouvrirSur('dessin')
    return
  }
  if (genre === 'son') {
    const octets = new Uint8Array(await f.arrayBuffer())
    const brut = dechiffrerWav(octets)
    if (!brut) {
      avertir(`« ${f.name} » n’est pas un WAV PCM 16 bits. `
        + 'Exportez-le sans compression — c’est le seul format que tout moteur lit.', 'fichier')
      return
    }
    const dureeMs = (brut.echantillons.length / brut.taux) * 1000
    const p2 = ajouterSonImporteProjet(
      projetCourant(), f.name, base64DepuisOctets(octets), dureeMs,
    )
    const nomSon = p2.sons[p2.sons.length - 1].nom
    gesteStructure(`son « ${nomSon} » importé`, p2)
    panneauProjet.ouvrirSur('sons', nomSon)
    verdict.textContent = `Son « ${nomSon} » importé : ${Math.round(dureeMs)} ms à ${brut.taux} Hz. `
      + 'Un script le joue par c.jouer, une animation par son événement.'
    return
  }
  avertir(`« ${f.name} » : rien à en faire ici. `
    + 'Une image devient une planche, un .json s’ouvre comme projet, un .wav devient un son, '
    + 'un niveau Tiled ou LDtk devient une carte.', 'fichier')
}

const panneauFichiers = new PanneauFichiers(
  {
    panneau: document.getElementById('fichiers') as HTMLElement,
    corps: document.getElementById('fichiersCorps') as HTMLElement,
    bascule: document.getElementById('basculeFichiers') as HTMLButtonElement,
    fermer: document.getElementById('fermerFichiers') as HTMLButtonElement,
  },
  {
    projet: () => projetCourant(),
    nomDossier: () => travail?.name ?? null,
    apiDossier: () => dossier.disponible(),
    choisirDossier: () => choisirDossierTravail(),
    listerDossier: () => (travail ? dossier.lister(travail, '') : Promise.resolve([])),
    lireFichier: (nom) => (travail ? dossier.lireFichier(travail, nom) : Promise.resolve(null)),
    lireTexte: (nom) => (travail ? dossier.lire(travail, nom) : Promise.resolve(null)),
    ouvrirProjet: (texte, nom) => relire(texte, nom),
    brouillons: () => brouillonsConnus,
    oublierBrouillons: () => {
      brouillonsConnus = []
      void dossier.oublierBrouillons()
    },
    importerAsset: (f) => routerFichier(f),
    ouvrirProjetPanneau: (onglet, cible) => panneauProjet.ouvrirSur(onglet, cible),
    editerCarte: (nom) => {
      editerCarte(nom)
      verdict.textContent = `Carte « ${nom} » sous le pinceau`
    },
    dire: (m) => { verdict.textContent = m },
  },
)

/*
 * Le DEPOT : deposer un fichier n'importe ou sur la page.
 *
 * C'est le geste que tous les moteurs ont appris a leurs usagers, et le
 * navigateur le detourne par defaut — il OUVRIRAIT l'image a la place de la
 * page. Le voile ne s'affiche que pendant qu'un fichier survole la fenetre,
 * et dit ce que chaque type deviendra : un depot muet obligerait a essayer
 * pour savoir.
 */
{
  const voile = document.getElementById('depot') as HTMLElement
  let profondeur = 0
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    profondeur++
    voile.hidden = false
  })
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  })
  window.addEventListener('dragleave', () => {
    // dragleave tire a chaque changement d'element : on compte les entrees
    // et les sorties, sinon le voile clignote en traversant la page.
    profondeur = Math.max(0, profondeur - 1)
    if (profondeur === 0) voile.hidden = true
  })
  window.addEventListener('drop', (e) => {
    e.preventDefault()
    profondeur = 0
    voile.hidden = true
    const fichiers = [...(e.dataTransfer?.files ?? [])]
    if (!fichiers.length) return
    void (async () => {
      for (const f of fichiers) await routerFichier(f)
      panneauFichiers.montrer()
    })()
  })
}
panneauxAPrevenir.push(() => { if (panneauFichiers.ouvert) panneauFichiers.montrer() })

/**
 * Faire entendre un son dans l'editeur.
 *
 * Le contexte est cree au PREMIER son et non au chargement : un navigateur
 * refuse d'ouvrir l'audio avant qu'on ait clique quelque part, et un contexte
 * ouvert trop tot reste suspendu pour toujours sans rien dire.
 */
let audio: AudioContext | null = null
/** Joue une musique entiere, une fois — le meme chemin que les sons. */
function ecouterMusique(m: Parameters<typeof rendreMusique>[0]): void {
  type Fabrique = new () => AudioContext
  const F = globalThis as unknown as { AudioContext?: Fabrique; webkitAudioContext?: Fabrique }
  const Classe = F.AudioContext ?? F.webkitAudioContext
  if (!Classe) { verdict.textContent = 'Ce navigateur ne sait pas jouer de son.'; return }
  if (!audio) audio = new Classe()
  if (audio.state === 'suspended') void audio.resume()
  const echantillons = rendreMusique(m, audio.sampleRate)
  const tampon = audio.createBuffer(1, echantillons.length, audio.sampleRate)
  tampon.getChannelData(0).set(echantillons)
  const source = audio.createBufferSource()
  source.buffer = tampon
  source.connect(audio.destination)
  source.start()
  verdict.textContent = `« ${m.nom} » · ${m.voies.length} voie(s) · ${Math.round(echantillons.length / audio.sampleRate * 1000)} ms`
}

function ecouterSon(s: Parameters<typeof rendreSon>[0]): void {
  type Fabrique = new () => AudioContext
  const F = globalThis as unknown as { AudioContext?: Fabrique; webkitAudioContext?: Fabrique }
  const Classe = F.AudioContext ?? F.webkitAudioContext
  if (!Classe) { verdict.textContent = 'Ce navigateur ne sait pas jouer de son.'; return }
  if (!audio) audio = new Classe()
  if (audio.state === 'suspended') void audio.resume()
  const echantillons = rendreSon(s, audio.sampleRate)
  const tampon = audio.createBuffer(1, echantillons.length, audio.sampleRate)
  tampon.getChannelData(0).set(echantillons)
  const source = audio.createBufferSource()
  source.buffer = tampon
  source.connect(audio.destination)
  source.start()
}

/* ------------------------------------------------------------------ */
/* Le brouillon : le filet, pas le plancher                            */
/* ------------------------------------------------------------------ */

/**
 * L'editeur garde un etat du projet toutes les quarante-cinq secondes.
 *
 * ## Pourquoi c'est un filet et non un enregistrement
 *
 * Un enregistrement va dans un fichier, dans un dossier a soi, et survit a
 * tout. Un brouillon vit dans la base locale de ce navigateur, et l'editeur
 * ne le rouvre JAMAIS tout seul — il le propose a l'accueil, et on decide.
 * Le presenter comme une sauvegarde ferait qu'on cesserait d'enregistrer, et
 * le jour ou quelqu'un vide les donnees du site, le projet de trois semaines
 * part avec.
 *
 * ## Pourquoi seulement quand on a fait quelque chose
 *
 * Le journal compte les gestes. Sans geste, il n'y a rien a sauver — et
 * proposer « reprendre le brouillon du monde de demonstration » a quelqu'un
 * qui vient d'ouvrir la page serait une porte de plus a refermer.
 */
const BROUILLON_MS = 45_000
let dernierBrouillon = ''
/**
 * Les brouillons connus, en memoire.
 *
 * Le panneau des fichiers se dessine d'un coup et sans attendre ; lui faire
 * lire la base a chaque affichage l'obligerait a etre asynchrone pour une
 * liste de trois lignes. On garde donc la liste ici, et on la rafraichit
 * quand elle change.
 */
let brouillonsConnus: dossier.Brouillon[] = []

async function deposerBrouillon(): Promise<void> {
  if (!monde || !jeu || jeu.tourne) return
  // Rien fait : rien a garder. Voir plus haut.
  if (journal.taille === 0) return
  let texte = ''
  try {
    texte = versTexte(projetCourant())
  } catch {
    return
  }
  // Inchange depuis le dernier : on ne recopie pas un mega-octet pour rien.
  if (texte === dernierBrouillon) return
  dernierBrouillon = texte
  const nom = monde.id.startsWith('projet:') ? monde.id.slice(7) : monde.id
  const b = { nom, quand: Date.now(), texte }
  brouillonsConnus = [...brouillonsConnus, b].slice(-dossier.BROUILLONS_GARDES)
  const pose = await dossier.poserBrouillon(b)
  if (!pose) {
    signaler('avertissement',
      'Le brouillon n’a pas pu être gardé : la base locale du navigateur refuse d’écrire. '
      + 'Enregistrez dans un dossier — c’est de toute façon le seul vrai filet.', 'brouillon')
  }
}

setInterval(() => { void deposerBrouillon() }, BROUILLON_MS)

/** Depuis combien de temps, en clair. */
function ilYA(quand: number): string {
  const s = Math.max(0, Math.round((Date.now() - quand) / 1000))
  if (s < 90) return `il y a ${s} s`
  const m = Math.round(s / 60)
  if (m < 90) return `il y a ${m} min`
  return `il y a ${Math.round(m / 60)} h`
}

/*
 * L'ACCUEIL. On lancait l'editeur sur un monde de demonstration, sans un mot :
 * la premiere impression etait « je ne comprends rien ». Trois choix, une
 * phrase — et l'on sait quoi faire avant d'avoir rien appris.
 */
const accueil = document.getElementById('accueil') as HTMLElement
const fermerAccueil = (): void => { accueil.hidden = true }
const demarrerProjet = (projection: 'cote' | 'dessus'): void => {
  fermerAccueil()
  // La FEUILLE BLANCHE : des tuiles neutres, un heros neutre, rien de la
  // demonstration. Celui qui clique ici vient creer SON jeu — lui donner le
  // donjon et les gelees de la demo ferait croire que le moteur impose son
  // univers. La demo reste a un clic : « un jeu fini » et les mondes
  // d'exemple.
  const pj = projetNeuf({ nom: 'mon-jeu', projection, depart: 'vierge' })
  journal.vider()
  installerProjet(pj, pj.nom)
  majHistorique()
  verdict.textContent = projection === 'cote'
    ? 'Feuille blanche. Peignez du mur (1), redessinez le héros (onglet Dessin), ▶ Jouer.'
    : 'Feuille blanche, vue de dessus. Peignez du mur (1), redessinez le héros (onglet Dessin), ▶ Jouer.'
}
document.getElementById('accueilPlateforme')?.addEventListener('click', () => demarrerProjet('cote'))
document.getElementById('accueilDessus')?.addEventListener('click', () => demarrerProjet('dessus'))
document.getElementById('accueilOuvrir')?.addEventListener('click', () => {
  fermerAccueil()
  ;(document.getElementById('ouvrir') as HTMLButtonElement).click()
})
document.getElementById('accueilGouffre')?.addEventListener('click', () => {
  fermerAccueil()
  // Le jeu-temoin : un projet ORDINAIRE, relu par le meme chemin qu'un
  // fichier a soi. C'est toute sa valeur de vitrine — rien de special.
  void fetch('exemples/le-gouffre.json')
    .then((r) => r.text())
    .then((texte) => { relire(texte, 'le-gouffre.json') })
    .catch(() => { verdict.textContent = 'L’exemple n’a pas pu être chargé.' })
})
document.getElementById('accueilExemples')?.addEventListener('click', fermerAccueil)

/*
 * Le brouillon PROPOSE, a l'accueil, et nulle part ailleurs.
 *
 * La carte n'apparait que s'il y a quelque chose a reprendre : une carte
 * grisee « aucun brouillon » serait une ligne de plus a lire chaque fois.
 */
void (async () => {
  brouillonsConnus = await dossier.listerBrouillons()
  const dernier = brouillonsConnus[brouillonsConnus.length - 1]
  if (!dernier) return
  const carte = document.createElement('button')
  carte.className = 'accueil-carte'
  carte.id = 'accueilBrouillon'
  const icone = document.createElement('span')
  icone.className = 'accueil-icone'
  icone.textContent = '⏳'
  const titre = document.createElement('b')
  titre.textContent = 'Reprendre'
  const note = document.createElement('span')
  note.innerHTML = `« ${dernier.nom} », ${ilYA(dernier.quand)}.<br/>`
    + 'Un brouillon gardé par ce navigateur.'
  carte.append(icone, titre, note)
  carte.addEventListener('click', () => {
    fermerAccueil()
    relire(dernier.texte, dernier.nom)
    verdict.textContent = `Brouillon repris : « ${dernier.nom} », ${ilYA(dernier.quand)}. `
      + 'Enregistrez-le dans un dossier — un brouillon ne vit que dans ce navigateur.'
  })
  document.querySelector('.accueil-cartes')?.appendChild(carte)
})()
accueil.addEventListener('click', (e) => { if (e.target === accueil) fermerAccueil() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !accueil.hidden) fermerAccueil() })
// Il se montre au demarrage, et seulement la : le rouvrir a chaque geste
// serait un tourniquet a l'entree de l'atelier.
accueil.hidden = false

document.getElementById('nouveau')?.addEventListener('click', () => {
  if (!window.confirm('Créer un projet vide ? Ce qui est à l’écran sera remplacé.')) return
  const p = projetNeuf()
  journal.vider()
  installerProjet(p, p.nom)
  majHistorique()
  panneauProjet.ouvrir()
  verdict.textContent = 'Projet vide. Peignez du mur, posez des entités, appuyez sur Jouer.'
})

document.getElementById('enregistrer')?.addEventListener('click', () => { void enregistrer() })

document.getElementById('ouvrir')?.addEventListener('click', async () => {
  if (travail) {
    const fichiers = await dossier.lister(travail, '.json')
    if (fichiers.length === 0) {
      verdict.textContent = `Aucun projet dans « ${travail.name} ».`
      return
    }
    // Un seul fichier : on l'ouvre. Plusieurs : on demande, sans inventer un
    // dialogue de plus — la liste tient dans une invite.
    const nom = fichiers.length === 1
      ? fichiers[0]
      : window.prompt(`Quel projet ouvrir ?\n${fichiers.join('\n')}`, fichiers[0])
    if (!nom) return
    const texte = await dossier.lire(travail, nom)
    if (texte === null) { verdict.textContent = `« ${nom} » est illisible.`; return }
    relire(texte, nom)
    return
  }
  const f = await dossier.demanderFichier('.json')
  if (f) relire(f.texte, f.nom)
})

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void enregistrer()
  }
})

// Le dossier choisi la derniere fois. On ne rouvre RIEN tout seul : rouvrir un
// projet a l'ouverture ferait perdre le monde de demonstration a quelqu'un qui
// venait juste regarder.
void (async () => {
  travail = await dossier.rappeler()
  direDossier()
})()

selectMonde.addEventListener('change', () => {
  // Changer de monde, c'est changer de projet : meme raison que dans `relire`.
  journal.vider()
  charger(selectMonde.value)
  majHistorique()
})

/* ------------------------------------------------------------------ */
/* L'edition                                                           */
/* ------------------------------------------------------------------ */

/** La palette de l'outil courant : especes a poser, tuiles a peindre. */
const palettePanneau = new PalettePanneau(
  {
    panneau: document.getElementById('palette') as HTMLElement,
    titre: document.getElementById('paletteTitre') as HTMLElement,
    grille: document.getElementById('paletteGrille') as HTMLElement,
    note: document.getElementById('paletteNote') as HTMLElement,
  },
  () => jeu,
  (v) => {
    if (v.espece !== undefined) { edition.etat.espece = v.espece; edition.etat.assemblage = null }
    if (v.assemblage !== undefined) { edition.etat.assemblage = v.assemblage; edition.etat.espece = null }
    if (v.tuile !== undefined) edition.etat.tuileChoisie = v.tuile
    if (v.calque !== undefined) edition.etat.calqueChoisi = v.calque
    if (v.matiere !== undefined) edition.etat.matiere = v.matiere
  },
)

/** Ce que chaque outil fait, dit la ou l'oeil tombe quand il hesite. */
const AIDE_OUTILS: Record<string, string> = {
  terrain: 'Mur — clic gauche : poser · clic droit ou Gomme : effacer · il se dessine et bloque',
  gomme: 'Gomme — efface le dessin et la collision de la case',
  collision: 'Collision — peint ce que la case FAIT (solide, pointe, échelle…) sans toucher au dessin',
  tuile: 'Tuile — choisissez une case de la planche à gauche, puis peignez-la',
  entite: 'Entité — clic : poser · clic droit : retirer · tirer : déplacer · Maj+tirer : choisir un rectangle',
  salle: 'Salle — tirez un rectangle pour en créer une (Maj pour en poser une par-dessus) · tirez son intérieur pour la déplacer, son bord pour la retailler · clic droit pour retirer',
  main: 'Main — tirez pour déplacer la vue',
}

function choisirOutil(o: Outil): void {
  edition.etat.outil = o
  aide.textContent = AIDE_OUTILS[o] ?? ''
  // L'outil Collision peint une chose invisible tant que sa surcouche est
  // eteinte : on peindrait dans le noir sans le savoir. La choisir allume
  // donc la surcouche — et la case a cocher suit, pour que l'etat reste
  // celui qu'on voit.
  if (o === 'collision' && !voirCollision.checked) {
    voirCollision.checked = true
    edition.etat.montrerCollision = true
  }
  for (const b of outils.querySelectorAll('button')) {
    b.classList.toggle('actif', (b as HTMLElement).dataset.outil === o)
  }
  canevas.classList.toggle('main', o === 'main')
  palettePanneau.montrer(o, monde.especes, monde.peuplement ?? null, {
    espece: edition.etat.espece,
    assemblage: edition.etat.assemblage ?? null,
    tuile: edition.etat.tuileChoisie,
    calque: edition.etat.calqueChoisi,
    matiere: edition.etat.matiere,
  }, monde.assemblages ?? [])
  if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
}
outils.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button')
  if (b?.dataset.outil) choisirOutil(b.dataset.outil as Outil)
})

/*
 * Le trace : a main levee, en rectangle, ou par remplissage.
 *
 * C'est un reglage de l'outil courant et non un outil de plus. Un rectangle
 * de mur, un rectangle de collision et un rectangle de tuile sont le meme
 * geste sur trois matieres ; en faire des outils separes ferait quinze
 * boutons pour trois idees.
 */
const traces = document.getElementById('traces') as HTMLElement
traces.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button')
  const t = b?.dataset.trace as Trace | undefined
  if (!t) return
  edition.etat.trace = t
  for (const q of traces.querySelectorAll('button')) {
    q.classList.toggle('actif', (q as HTMLElement).dataset.trace === t)
  }
})

voirCollision.addEventListener('change', () => {
  edition.etat.montrerCollision = voirCollision.checked
  jeu.dessiner()
  redessinerEdition()
})

// Le menu contextuel du navigateur volerait le clic droit, qui sert a retirer.
canevas.addEventListener('contextmenu', (e) => e.preventDefault())

/*
 * La molette regle le cadre d'edition. C'est le PREMIER geste que tout le
 * monde essaie devant une carte — avant meme de chercher un bouton — et un
 * editeur qui ne repond pas a la molette a l'air fige. Ctrl+molette est
 * laisse au navigateur : c'est le zoom d'accessibilite, il ne nous
 * appartient pas.
 */
canevas.addEventListener('wheel', (e) => {
  if (jeu.tourne || e.ctrlKey) return
  e.preventDefault()
  decalerCadre(e.deltaY > 0 ? 1 : -1)
}, { passive: false })

canevas.addEventListener('pointerdown', (e) => {
  if (jeu.tourne) return
  canevas.setPointerCapture(e.pointerId)
  edition.commencer(e.clientX, e.clientY, e.button, e.shiftKey)
  redessinerEdition()
  majEtat()
})
canevas.addEventListener('pointermove', (e) => {
  if (jeu.tourne) return
  edition.bouger(e.clientX, e.clientY)
  caseSurvolee = edition.caseSous(e.clientX, e.clientY)
  // La surcouche se redessine sur le DERNIER rendu du jeu : sans redessiner
  // la scene, la case survolee laisserait une trainee de lisere.
  jeu.dessiner()
  redessinerEdition()
})
canevas.addEventListener('pointerleave', () => {
  if (jeu.tourne) return
  caseSurvolee = null
  jeu.dessiner()
  redessinerEdition()
})
canevas.addEventListener('pointerup', () => {
  /*
   * CE QUE LE GESTE A DIT SURVIT AU COMPTE QUI SUIT.
   *
   * `majEtat` ecrit le compte des cases dans la barre d'etat — au meme
   * endroit que les messages. Un geste qui vient de dire « salle retaillée :
   * 12×6 » se faisait donc effacer par « 35 couleurs · 114 posées » dans la
   * milliseconde : le message existait, personne ne l'a jamais lu.
   */
  const avant = verdict.textContent
  edition.finir()
  const dit = verdict.textContent
  redessinerEdition()
  majEtat()
  majHistorique()
  if (dit && dit !== avant) verdict.textContent = dit
})

/**
 * Le cadre d'edition : le bord de la carte, sa grille, la case survolee.
 *
 * ## Pourquoi il existe
 *
 * Un projet s'ouvrait sur un rectangle noir sans bord ni grille : on ne
 * savait ni ou etait la carte, ni ou elle s'arretait, ni sur quelle case le
 * prochain clic tomberait. C'est une capture d'ecran qui l'a montre — pas un
 * banc : les bancs lisent le modele, jamais ce que l'oeil recoit.
 *
 * Tout se dessine dans le TAMPON du jeu, comme les salles : un pixel de
 * lisere doit faire un pixel de jeu. Et seulement a l'arret — en jouant, on
 * voit ce que le joueur verra, rien d'autre.
 */
let caseSurvolee: { cx: number; cy: number } | null = null
/**
 * LES NOEUDS CHOISIS.
 *
 * ## Pourquoi une liste et non un identifiant
 *
 * Deplacer six plateformes de deux cases, retirer une rangee de pointes,
 * dupliquer un groupe de trois lanternes : ce sont des gestes ordinaires de
 * level design, et il fallait les faire un par un — six fois le meme
 * mouvement, en esperant ne pas se tromper d'une case entre deux.
 *
 * Le DERNIER choisi est le principal : c'est lui que l'inspecteur montre, et
 * c'est la convention de tous les editeurs — le dernier clic decide de ce
 * qu'on regarde. Les touches, elles, agissent sur toute la liste.
 *
 * Elle vit ici et non dans le panneau parce que la vue doit les entourer :
 * choisir dans l'arbre sans que rien ne bouge a l'ecran laisse chercher
 * lequel des quatre gardiens on vient de choisir.
 */
let selection: string[] = []

/** Le noeud principal : le dernier choisi. Vide si rien n'est choisi. */
function noeudDesigneId(): string { return selection[selection.length - 1] ?? '' }

/** Choisit UN noeud, et lui seul. Le geste ordinaire : un clic. */
function choisirSeul(id: string): void {
  selection = id ? [id] : []
  panneauProjet.designerNoeuds(selection)
  if (!jeu.tourne || jeu.enPause) { jeu.dessiner(); redessinerEdition() }
}

/**
 * Ajoute ou retire un noeud de la liste — le Ctrl+clic.
 *
 * Le remettre le fait passer EN TETE plutot que de le retirer quand il est
 * deja la mais n'etait pas le principal : sans cela, Ctrl+cliquer un noeud
 * deja choisi pour en faire celui qu'on inspecte le deselectionnerait.
 */
function basculerChoix(id: string): void {
  if (!id) return
  if (selection[selection.length - 1] === id) selection = selection.filter((q) => q !== id)
  else selection = [...selection.filter((q) => q !== id), id]
  panneauProjet.designerNoeuds(selection)
  if (!jeu.tourne || jeu.enPause) { jeu.dessiner(); redessinerEdition() }
}
function dessinerCadreEdition(): void {
  if (jeu.tourne && !jeu.enPause) return
  const ctx = jeu.ecran.ctx
  const t = monde.carte.tuile
  const ox = -Math.round(jeu.camera.x)
  const oy = -Math.round(jeu.camera.y)
  const L = monde.carte.largeur
  const H = monde.carte.hauteur
  if (monde.projection.mode !== 'orthogonale') {
    // En isometrique, la grille rectangulaire mentirait : on trace juste le
    // pourtour de la carte, par ses quatre coins projetes.
    return
  }
  // La grille, une ligne sur deux teintes tres discretes : elle situe les
  // cases sans manger le dessin.
  ctx.strokeStyle = 'rgba(160, 170, 200, 0.10)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let cx = 1; cx < L; cx++) {
    ctx.moveTo(cx * t + ox + 0.5, oy)
    ctx.lineTo(cx * t + ox + 0.5, H * t + oy)
  }
  for (let cy = 1; cy < H; cy++) {
    ctx.moveTo(ox, cy * t + oy + 0.5)
    ctx.lineTo(L * t + ox, cy * t + oy + 0.5)
  }
  ctx.stroke()
  // Le BORD de la carte, net : c'est lui qui repond « ou s'arrete le monde ».
  ctx.strokeStyle = 'rgba(127, 212, 168, 0.8)'
  ctx.strokeRect(ox + 0.5, oy + 0.5, L * t - 1, H * t - 1)
  // La case sous le curseur : le prochain clic tombera LA.
  if (caseSurvolee && edition.etat.outil !== 'main') {
    ctx.strokeStyle = '#e8ecf4'
    ctx.strokeRect(caseSurvolee.cx * t + ox + 0.5, caseSurvolee.cy * t + oy + 0.5, t - 1, t - 1)
  }
  jeu.ecran.presenter()
}

/**
 * Le noeud choisi, entoure dans la vue.
 *
 * On entoure LA CASE qu'il occupe et non sa boite de dessin : l'editeur pose
 * les entites par les pieds, au bas d'une case, et c'est cette case-la qu'on
 * vise en cliquant. Un cadre a la taille du sprite serait plus joli et
 * designerait autre chose que ce que le prochain clic prendra.
 *
 * Les angles seuls plutot qu'un rectangle plein : un rectangle de plus sur
 * une case deja bordee par la grille et parfois par une salle ferait trois
 * traits pour trois choses differentes.
 */
function dessinerSelection(): void {
  if (jeu.tourne && !jeu.enPause) return
  for (const id of selection) entourer(id, id === noeudDesigneId())
  jeu.ecran.presenter()
}

/**
 * Entoure un noeud choisi. Le PRINCIPAL est plus vif que les autres : c'est
 * lui que l'inspecteur montre, et savoir lequel evite de regler la mauvaise
 * creature.
 */
function entourer(id: string, principal: boolean): void {
  const n = trouverEntite(monde.racine, id)
  if (!n) return
  const ou = positionMonde(monde.racine, n.id)
  if (!ou) return
  const t = monde.carte.tuile
  const ctx = jeu.ecran.ctx
  const x = Math.round(ou.x - t / 2 - Math.round(jeu.camera.x))
  const y = Math.round(ou.y - t - Math.round(jeu.camera.y))
  const c = Math.max(3, Math.round(t / 3))
  ctx.strokeStyle = principal ? '#ffd479' : 'rgba(255, 212, 121, 0.55)'
  ctx.lineWidth = 1
  // Le demi-pixel : un trait d'un pixel pose sur un entier deborde des deux
  // cotes et se dessine sur deux pixels gris. C'est la meme regle que partout
  // ailleurs dans les surcouches.
  const x0 = x + 0.5
  const y0 = y + 0.5
  const x1 = x + t - 0.5
  const y1 = y + t - 0.5
  ctx.beginPath()
  ctx.moveTo(x0, y0 + c); ctx.lineTo(x0, y0); ctx.lineTo(x0 + c, y0)
  ctx.moveTo(x1 - c, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + c)
  ctx.moveTo(x0, y1 - c); ctx.lineTo(x0, y1); ctx.lineTo(x0 + c, y1)
  ctx.moveTo(x1 - c, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - c)
  ctx.stroke()
}

/** Les surcouches de l'editeur, dans l'ordre ou elles se posent. */
function redessinerEdition(): void {
  dessinerCadreEdition()
  dessinerCollision()
  dessinerSalles()
  dessinerSelection()
}

/* ------------------------------------------------------------------ */
/* Defaire et refaire                                                  */
/* ------------------------------------------------------------------ */

const boutonDefaire = document.getElementById('defaire') as HTMLButtonElement
const boutonRefaire = document.getElementById('refaire') as HTMLButtonElement

function majHistorique(): void {
  boutonDefaire.disabled = !journal.peutDefaire
  boutonRefaire.disabled = !journal.peutRefaire
  // Les trois derniers gestes dans l'infobulle, et non le seul suivant :
  // savoir qu'a trois Ctrl+Z de la il y a « carte redimensionnée » evite
  // d'appuyer a l'aveugle pour voir ou l'on retombe. C'est ce que le journal
  // d'un moteur montre dans un panneau ; ici il tient dans une infobulle.
  const derniers = journal.derniers.slice(0, 3)
  boutonDefaire.title = journal.peutDefaire
    ? `Défaire (Ctrl+Z) : ${derniers.join(' ← ')}` : 'Rien à défaire'
  boutonRefaire.title = journal.peutRefaire
    ? `Refaire : ${journal.nomRefaire} (Ctrl+Maj+Z)` : 'Rien à refaire'
}

/**
 * Defaire, refaire.
 *
 * Le geste rendu porte parfois le nom d'une CARTE : un coup de pinceau donne
 * sur le niveau deux se defait meme si l'on regarde le niveau un — et il faut
 * alors ramener le niveau deux sous les yeux, sinon le Ctrl+Z a l'air de
 * n'avoir rien fait alors qu'il vient de modifier ailleurs.
 */
function apresJournal(g: Geste | null, quoi: string): void {
  if (!g) return
  if (g.carte && g.carte !== (monde.carteActive ?? '')) editerCarte(g.carte)
  jeu.dessiner()
  redessinerEdition()
  majEtat()
  majHistorique()
  // Apres `majEtat`, qui ecrit dans le meme endroit : dire ce qu'on vient de
  // faire compte plus que le compte des cases, pendant une seconde.
  verdict.textContent = `${quoi} : ${g.nom}`
    + (g.carte && g.carte !== (monde.carteActive ?? '') ? ` — sur la carte « ${g.carte} »` : '')
}

function defaire(): void {
  apresJournal(journal.defaire(), 'défait')
}

function refaire(): void {
  apresJournal(journal.refaire(), 'refait')
}

boutonDefaire.addEventListener('click', defaire)
boutonRefaire.addEventListener('click', refaire)

window.addEventListener('keydown', (e) => {
  // Pas pendant qu'on ecrit un script : Ctrl+Z appartient alors au champ de
  // texte, et le lui prendre ferait perdre ce qu'on vient de taper.
  const dansUnChamp = (e.target as HTMLElement)?.tagName === 'TEXTAREA'
    || (e.target as HTMLElement)?.tagName === 'INPUT'
  if (dansUnChamp) return
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
  e.preventDefault()
  if (e.shiftKey) refaire()
  else defaire()
})

/* ------------------------------------------------------------------ */
/* Le noeud choisi, au clavier                                         */
/* ------------------------------------------------------------------ */

/**
 * Ce que la main sait deja faire, venue d'ailleurs.
 *
 * Un editeur de scene se juge a ce qu'on peut faire SANS quitter la vue.
 * Jusqu'ici, deplacer une entite d'un pixel demandait de la saisir a la
 * souris — donc de viser — ou d'ouvrir un panneau et de taper un nombre ; la
 * retirer demandait un clic droit bien vise ; la dupliquer, d'aller chercher
 * un bouton dans l'arbre. Ce sont les quatre gestes que tout le monde a dans
 * les doigts : les fleches, Suppr, Ctrl+D, F.
 *
 * Ils agissent sur le noeud CHOISI, celui que l'inspecteur montre et que la
 * vue entoure. Sans selection visible, une touche qui agit sur « quelque
 * chose » est une touche qu'on n'ose pas presser.
 */

/** Le noeud principal, vivant dans la scene — ou null. */
function noeudChoisi(): Noeud | null {
  const id = noeudDesigneId()
  return id ? trouverEntite(monde.racine, id) : null
}

/** Tous les noeuds choisis, vivants. Ceux qui ont disparu sont ignores. */
function noeudsChoisis(): Noeud[] {
  return selection
    .map((id) => trouverEntite(monde.racine, id))
    .filter((n): n is Noeud => !!n)
}

/**
 * Le deplacement au clavier, FUSIONNE.
 *
 * Trente pressions sur une fleche sont un seul deplacement. Poser un geste
 * par pression remplirait le journal de trente lignes et demanderait trente
 * Ctrl+Z pour revenir — ce qui revient a ne pas pouvoir revenir. Tant que
 * personne d'autre n'a pose de geste entre-temps ET que la selection n'a pas
 * change, on prolonge donc le precedent au lieu d'en poser un neuf.
 *
 * Le geste garde les positions de DEPART et un ecart cumule, jamais les
 * noeuds : le projet peut etre reconstruit entre-temps, et l'ecart se rejoue
 * alors sur les noeuds d'aujourd'hui, retrouves par leur identifiant.
 */
let fusionDeplacement: {
  cle: string
  geste: Geste
  etat: { scene: string; departs: { id: string; x: number; y: number }[]; delta: { x: number; y: number } }
} | null = null

function deplacerChoisi(dx: number, dy: number): void {
  const noeuds = noeudsChoisis()
  if (!noeuds.length) {
    // Sans selection, les fleches deplacent la VUE : c'est ce qu'elles font
    // dans tout editeur de carte, et ne rien faire du tout donnerait
    // l'impression d'un clavier mort.
    //
    // `dx` est deja en PIXELS — le pas a ete choisi par l'appelant. Le
    // remultiplier par la taille de tuile faisait bondir la vue de seize
    // cases par pression : c'est le banc qui l'a vu, en comparant le
    // deplacement attendu a celui qu'il mesurait.
    jeu.camera.x += dx
    jeu.camera.y += dy
    jeu.dessiner()
    redessinerEdition()
    return
  }
  const cle = selection.join(',')
  const prolonge = fusionDeplacement?.cle === cle
    && journal.dernier === fusionDeplacement.geste
  const etat = prolonge && fusionDeplacement
    ? fusionDeplacement.etat
    : {
      scene: sceneActive(),
      departs: noeuds.map((n) => ({ id: n.id, x: n.x, y: n.y })),
      delta: { x: 0, y: 0 },
    }
  const appliquer = (ecart: { x: number; y: number }) => (): void => {
    const racine = racineDeScene(etat.scene)
    for (const d of etat.departs) {
      const cible = trouverEntite(racine, d.id)
      if (!cible) continue
      cible.x = d.x + ecart.x
      cible.y = d.y + ecart.y
      monde.retenirDepart?.(cible, parentDe(racine, cible) ?? racine)
    }
    if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
    panneauProjet.designerNoeuds(selection)
  }
  etat.delta.x += dx
  etat.delta.y += dy
  appliquer(etat.delta)()
  if (!prolonge) {
    const geste: Geste = {
      nom: noeuds.length > 1 ? `${noeuds.length} nœuds déplacés` : 'entité déplacée (clavier)',
      defaire: appliquer({ x: 0, y: 0 }),
      // L'ecart est LU au moment de refaire : la fusion le fait grandir
      // apres que le geste a ete pose.
      refaire: () => appliquer(etat.delta)(),
    }
    fusionDeplacement = { cle, geste, etat }
    journal.poser(geste)
    majHistorique()
  }
  verdict.textContent = noeuds.length > 1
    ? `${noeuds.length} nœuds déplacés de ${etat.delta.x},${etat.delta.y}`
    : `« ${noeuds[0].nom} » en ${noeuds[0].x},${noeuds[0].y}`
}

/** Retire les noeuds choisis. Sans confirmation : ils se remettent au Ctrl+Z. */
function retirerChoisi(): void {
  const noeuds = noeudsChoisis().filter((n) => n !== monde.racine)
  if (!noeuds.length) return
  const scene = sceneActive()
  // UN SEUL geste pour les N : sinon retirer six pointes demanderait six
  // Ctrl+Z, et l'on s'arreterait au troisieme en se demandant ce qui reste.
  let p2 = projetCourant()
  for (const n of noeuds) p2 = retirerNoeudProjet(p2, scene, n.id)
  const quoi = noeuds.length > 1
    ? `${noeuds.length} nœuds retirés`
    : `Nœud « ${noeuds[0].nom} » retiré`
  gesteStructure(quoi, p2, monde.carteActive ?? '')
  /*
   * Le choix n'est PAS efface.
   *
   * Il ne designe pas des objets mais des identifiants : les noeuds retires,
   * plus rien ne repond — l'inspecteur dit « aucun noeud choisi » et la vue
   * n'entoure rien, ce qui est exact. Et au Ctrl+Z, ils reviennent avec les
   * memes identifiants : ils sont de nouveau choisis, tout seuls.
   */
  verdict.textContent = `${quoi} — Ctrl+Z les remet`
}

/** Duplique les noeuds choisis, et CHOISIT les copies : on vient de les faire naitre. */
function dupliquerChoisi(): void {
  const noeuds = noeudsChoisis().filter((n) => n !== monde.racine)
  if (!noeuds.length) return
  const scene = sceneActive()
  /*
   * Les copies se trouvent en comparant le projet SERIALISE d'avant a celui
   * d'apres, et non les deux arbres vivants.
   *
   * La scene vivante porte des noeuds EPHEMERES — la taillade de l'epee, par
   * exemple — que la serialisation laisse dehors parce qu'ils appartiennent a
   * l'execution. Comparer les arbres vivants les comptait donc comme des
   * nouveautes, et l'editeur choisissait fierement une taillade a la place de
   * la copie qu'on venait de faire. C'est le banc qui l'a vu, en demandant a
   * l'inspecteur ce qu'il montrait.
   */
  const p1 = projetCourant()
  const avant = new Set<string>()
  const ramasser = (n: NoeudSerialiseType): void => {
    avant.add(n.id)
    n.enfants.forEach(ramasser)
  }
  const sceneAvant = p1.scenes.find((q) => q.nom === scene) ?? p1.scenes[0]
  if (sceneAvant) ramasser(sceneAvant.racine)
  let p2 = p1
  for (const n of noeuds) p2 = dupliquerNoeudProjet(p2, scene, n.id)
  // Les RACINES des copies : un noeud neuf dont le parent, lui, existait
  // deja. Les enfants des copies sont neufs aussi, et les choisir tous
  // designerait des corps de collision au lieu des creatures.
  const racinesCopies: string[] = []
  const sceneApres = p2.scenes.find((q) => q.nom === scene) ?? p2.scenes[0]
  const chercher = (n: NoeudSerialiseType, parentConnu: boolean): void => {
    if (!avant.has(n.id) && parentConnu) racinesCopies.push(n.id)
    n.enfants.forEach((e) => chercher(e, avant.has(n.id)))
  }
  if (sceneApres) chercher(sceneApres.racine, false)
  gesteStructure(noeuds.length > 1
    ? `${noeuds.length} nœuds dupliqués, une case à côté`
    : `« ${noeuds[0].nom} » dupliqué, une case à côté`, p2, monde.carteActive ?? '')
  if (racinesCopies.length) {
    selection = racinesCopies
    panneauProjet.designerNoeuds(selection)
    if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
  }
}

/**
 * LE PRESSE-PAPIERS DE L'EDITEUR.
 *
 * ## Pourquoi il n'est pas celui du systeme
 *
 * Le presse-papiers du navigateur ne rend son contenu qu'apres une permission
 * et un geste de l'usager, et ce qu'on y met est du TEXTE : on y ecrirait du
 * JSON, qu'un collage dans un traitement de texte transformerait en pate
 * illisible. Celui-ci vit dans l'onglet, garde des DESCRIPTIONS de noeuds, et
 * traverse ce qui compte : d'une scene a l'autre, d'une carte a l'autre, tant
 * que l'editeur est ouvert.
 */
let pressePapiers: ReturnType<typeof serialiserNoeud>[] = []

/**
 * Ou colle-t-on ?
 *
 * Sous le noeud choisi s'il est STRUCTUREL — un noeud nu, un groupe : on l'a
 * justement cree pour y ranger des choses. A COTE s'il porte une espece :
 * copier une creature et la coller sous elle-meme ferait un empilement que
 * personne ne demande. C'est la meme regle que partout ailleurs ici : ce que
 * la chose EST decide, pas un reglage.
 */
function collerIci(): void {
  if (!pressePapiers.length) { verdict.textContent = 'Rien à coller.'; return }
  const scene = sceneActive()
  const racine = racineDeScene(scene)
  const choisi = noeudChoisi()
  const structurel = choisi && !(choisi as unknown as { espece?: string }).espece
    && choisi.type !== 'sprite'
  const parent = !choisi ? racine
    : (structurel ? choisi : (parentDe(racine, choisi) ?? racine))
  const t = monde.carte.tuile
  let p2 = projetCourant()
  const neufs: string[] = []
  for (const modele of pressePapiers) {
    // Une case a cote : une copie exactement dessous se confond avec
    // l'original, et l'on croit que le geste n'a rien fait.
    const description = { ...modele, x: modele.x + (structurel ? 0 : t) }
    const r = collerNoeudProjet(p2, scene, parent.id, description)
    if (!r.id) continue
    p2 = r.projet
    neufs.push(r.id)
  }
  if (!neufs.length) return
  const quoi = neufs.length > 1
    ? `${neufs.length} nœuds collés sous « ${parent.nom} »`
    : `« ${pressePapiers[0].nom} » collé sous « ${parent.nom} »`
  gesteStructure(quoi, p2, monde.carteActive ?? '')
  selection = neufs
  panneauProjet.designerNoeuds(selection)
  if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
  verdict.textContent = `${quoi} — Ctrl+Z les reprend`
}

window.addEventListener('keydown', (e) => {
  // Pendant que le jeu tourne, les fleches appartiennent au JOUEUR.
  if (jeu?.tourne) return
  const cible = e.target as HTMLElement | null
  if (cible?.tagName === 'TEXTAREA' || cible?.tagName === 'INPUT' || cible?.tagName === 'SELECT') return
  const pas = e.shiftKey ? 1 : (monde?.carte.tuile ?? 16)
  const fleches: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  }
  const f = fleches[e.key]
  if (f && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    // Une case par defaut, un PIXEL avec Maj : on cadre a la case neuf fois
    // sur dix, et l'on ajuste au pixel la dixieme.
    deplacerChoisi(f[0] * pas, f[1] * pas)
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
    e.preventDefault()
    retirerChoisi()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selection.length) {
    e.preventDefault()
    dupliquerChoisi()
    return
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')
    && selection.length) {
    const noeuds = noeudsChoisis()
    if (!noeuds.length) return
    e.preventDefault()
    pressePapiers = noeuds.map(serialiserNoeud)
    const coupe = e.key.toLowerCase() === 'x'
    if (coupe) retirerChoisi()
    verdict.textContent = (noeuds.length > 1
      ? `${noeuds.length} nœuds${coupe ? ' coupés' : ' copiés'}`
      : `« ${noeuds[0].nom} »${coupe ? ' coupé' : ' copié'}`)
      + ' — Ctrl+V les colle, ici ou dans une autre scène'
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && pressePapiers.length) {
    e.preventDefault()
    collerIci()
    return
  }
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && selection.length) {
    const n = noeudChoisi()
    const ou = n ? positionMonde(monde.racine, n.id) : null
    if (ou) {
      e.preventDefault()
      jeu.camera.x = Math.round(ou.x - jeu.ecran.vue.largeur / 2)
      jeu.camera.y = Math.round(ou.y - jeu.ecran.vue.hauteur / 2)
      jeu.dessiner()
      redessinerEdition()
      verdict.textContent = `vue centrée sur « ${n?.nom ?? ''} »`
    }
    return
  }
  if (e.key === 'Escape' && selection.length && accueil.hidden) {
    selection = []
    panneauProjet.designerNoeuds(selection)
    panneauProjet.designerNoeud('')
    jeu.dessiner()
    redessinerEdition()
  }
})

/**
 * La grille de collision, par-dessus le decor.
 *
 * Elle se dessine dans le tampon du jeu puis on represente : c'est le seul
 * moyen qu'elle suive exactement l'echelle entiere, au lieu d'etre posee en
 * pixels d'ecran et de baver a la premiere fraction.
 *
 * Et elle suit le CONTOUR de la case, pas un rectangle : un rectangle rouge
 * sur une carte isometrique designerait quatre cases a la fois et n'en
 * designerait aucune. C'est la marque des editeurs ou l'isometrique a ete
 * ajoute apres coup.
 */
function dessinerCollision(): void {
  // En PAUSE, elle revient : c'est tout l'interet de figer une image — voir
  // ce que le decor fait, la ou le heros vient de passer au travers.
  if (!edition.etat.montrerCollision || (jeu.tourne && !jeu.enPause)) return
  const ctx = jeu.ecran.ctx
  const ox = -Math.round(jeu.camera.x)
  const oy = -Math.round(jeu.camera.y)
  ctx.fillStyle = 'rgba(255, 90, 90, 0.28)'
  for (let cy = 0; cy < monde.carte.hauteur; cy++) {
    for (let cx = 0; cx < monde.carte.largeur; cx++) {
      if (!monde.carte.solides[monde.carte.index(cx, cy)]) continue
      const pts = contourDeCase(monde.projection, cx, cy)
      ctx.beginPath()
      ctx.moveTo(pts[0].x + ox, pts[0].y + oy)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy)
      ctx.closePath()
      ctx.fill()
    }
  }
  jeu.ecran.presenter()
}

/**
 * Les salles, et l'apercu du geste en cours.
 *
 * Elles se dessinent DANS le tampon du jeu et non en HTML par-dessus : le
 * cadre du jeu est agrandi d'un facteur entier, et un rectangle HTML pose
 * au-dessus aurait des bords a une autre echelle que tout le reste. Un liseré
 * d'un pixel de jeu doit faire un pixel de jeu.
 */
function dessinerSalles(): void {
  if (jeu.tourne && !jeu.enPause) return
  const ctx = jeu.ecran.ctx
  const t = monde.carte.tuile
  const ox = -Math.round(jeu.camera.x)
  const oy = -Math.round(jeu.camera.y)
  const enSalle = edition.etat.outil === 'salle'

  for (const s of (monde.salles ?? []).filter(
    (q) => !(q.carte ?? '') || q.carte === (monde.carteActive ?? ''))) {
    const x = s.x * t + ox
    const y = s.y * t + oy
    const l = s.largeur * t
    const h = s.hauteur * t
    // Hors de l'outil « salle », un liseré discret : on veut savoir ou sont
    // les tableaux en dessinant le decor, pas les avoir dans l'oeil.
    ctx.strokeStyle = enSalle ? '#7fd4a8' : 'rgba(127, 212, 168, 0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, l - 1, h - 1)
    if (!enSalle) continue
    ctx.fillStyle = 'rgba(127, 212, 168, 0.10)'
    ctx.fillRect(x, y, l, h)
    // Le nom, dans la fonte du jeu : la meme taille de pixel que tout le reste.
    ecrire(jeu.ecran, s.nom, x + 3, y + 3, { couleur: '#7fd4a8', ombre: '#12101c' })
  }

  const r = edition.rectangle
  if (r) {
    const x0 = Math.min(r.x0, r.x1) * t + ox
    const y0 = Math.min(r.y0, r.y1) * t + oy
    const l = (Math.abs(r.x1 - r.x0) + 1) * t
    const h = (Math.abs(r.y1 - r.y0) + 1) * t
    ctx.fillStyle = 'rgba(232, 236, 244, 0.18)'
    ctx.fillRect(x0, y0, l, h)
    ctx.strokeStyle = '#e8ecf4'
    ctx.lineWidth = 1
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, l - 1, h - 1)
  }
  jeu.ecran.presenter()
}

/** Le dernier etat de recouvrement signale : voir `majEtat`. */
let dernierCroisement = ''

function majEtat(): void {
  const c = edition.compter()
  const entites = compterEntites(monde.racine)
  const salles = monde.salles ?? []
  /*
   * LE RECOUVREMENT SE DIT ICI, ET NON EN MESSAGE PASSAGER.
   *
   * Deux salles qui se recouvrent rendent « dans quelle salle suis-je ? » sans
   * reponse. Ce n'est pas un evenement — c'est un ETAT du niveau, qui dure
   * tant qu'on ne l'a pas corrige. Un message qui disparait au clic suivant
   * l'annoncerait une fois, a quelqu'un qui regarde ailleurs.
   */
  const croise = salles.length ? chevauchements(salles) : []
  /*
   * Le recouvrement part AUSSI a la console, et une seule fois par etat :
   * `majEtat` passe a chaque mouvement de souris, et signaler a chaque fois
   * ferait un compteur a quatre chiffres pour une seule faute.
   */
  const signature = croise.map((c) => c.join('+')).join(' ')
  if (signature !== dernierCroisement) {
    dernierCroisement = signature
    if (signature) {
      signaler('avertissement',
        `Salles qui se recouvrent : ${croise.map((c) => `« ${c[0]} » et « ${c[1]} »`).join(', ')}`
        + ' — la caméra ne saurait pas laquelle choisir.', 'projet')
    }
  }
  verdict.textContent = `${palette.taille} couleurs · ${c.terrain} posées`
    + ` · ${c.solides} solides${entites ? ` · ${entites} entité(s)` : ''}`
    + (salles.length ? ` · ${salles.length} salle(s)` : '')
    + (croise.length ? ` · ⚠ « ${croise[0][0]} » et « ${croise[0][1]} » se recouvrent` : '')
}

/** Le nom de la scene qu'on edite, dans la liste des scenes du projet. */
function sceneActive(): string {
  return (monde.scenes ?? []).find((s) => s.racine === monde.racine)?.nom ?? ''
}

/** La racine d'une scene nommee, ou celle qu'on edite. */
function racineDeScene(nom: string): Noeud {
  return (monde.scenes ?? []).find((s) => s.nom === nom)?.racine ?? monde.racine
}

/**
 * Poser ou retirer une entite, en un geste qu'on peut defaire.
 *
 * ## Pourquoi une DESCRIPTION et non le noeud lui-meme
 *
 * On gardait le noeud vivant, et c'etait juste : le remettre en place rendait
 * la meme entite, avec son identifiant, et tout ce qui y renvoyait continuait
 * de pointer quelque part. Cela ne tenait qu'a une condition — que la scene
 * ne soit pas reconstruite entre-temps. Or elle l'est a chaque geste de
 * structure, et le noeud garde devenait alors un orphelin : on le rattachait
 * a une scene qui ne le dessinait plus, ou l'on cherchait a le retirer d'une
 * racine ou il n'avait jamais ete.
 *
 * Le geste garde donc une ADRESSE — la scene, l'identifiant du parent — et
 * une DESCRIPTION serialisee. L'identifiant, lui, survit a la relecture
 * depuis qu'`adopterId` existe : c'est ce qui rend l'entite reellement la
 * meme d'un bout a l'autre, et non une copie qui lui ressemble.
 *
 * La description est REPRISE a chaque retrait : une entite posee, deplacee,
 * puis retiree doit revenir la ou elle etait au moment du retrait, et non la
 * ou elle etait nee.
 */
function gesteEntite(nom: string, parent: Noeud, n: Noeud, pose = false) {
  const scene = sceneActive()
  const idParent = parent.id
  let description = serialiserNoeud(n)

  // Chaque sens du geste tient les DEPARTS a jour : un arret raccroche les
  // departs, donc un noeud present sans depart disparait au premier arret,
  // et un depart sans noeud fait une revenante. Voir monde-projet.
  const ajouter = (): void => {
    const racine = racineDeScene(scene)
    // Deja la : un journal qui rejoue deux fois le meme ajout ferait des
    // jumeaux qu'aucun « defaire » ne saurait departager.
    if (trouverEntite(racine, description.id)) return
    const pere = trouverEntite(racine, idParent) ?? racine
    const neuf = relireNoeud(description)
    pere.enfants.push(neuf)
    monde.retenirDepart?.(neuf, pere)
  }
  const oter = (): void => {
    const racine = racineDeScene(scene)
    const vivant = trouverEntite(racine, description.id)
    if (!vivant) return
    // On photographie AVANT de retirer : c'est l'etat de cet instant que le
    // prochain « defaire » devra rendre.
    description = serialiserNoeud(vivant)
    if (!monde.peuplement?.tuer(vivant.id)) retirerDe(racine, vivant)
    monde.oublierDepart?.(vivant)
  }
  return {
    nom,
    defaire: () => { if (pose) oter(); else ajouter() },
    refaire: () => { if (pose) ajouter(); else oter() },
  }
}

/** Le parent d'un noeud dans la scene, ou null. */
function parentDe(racine: Noeud, cible: Noeud): Noeud | null {
  for (const e of racine.enfants) {
    if (e === cible) return racine
    const r = parentDe(e, cible)
    if (r) return r
  }
  return null
}

/** Le noeud d'entite portant cet identifiant, ou null. */
function trouverEntite(racine: Noeud, id: string): Noeud | null {
  if (racine.id === id) return racine
  for (const e of racine.enfants) {
    const r = trouverEntite(e, id)
    if (r) return r
  }
  return null
}

/** Les noeuds de la scene qui portent une espece. */
function compterEntites(n: { enfants: unknown[] }): number {
  let total = (n as { espece?: string }).espece ? 1 : 0
  for (const e of n.enfants) total += compterEntites(e as { enfants: unknown[] })
  return total
}

/* ------------------------------------------------------------------ */
/* Trouver                                                             */
/* ------------------------------------------------------------------ */

/**
 * Un seul champ pour tout ce que le projet nomme.
 *
 * ## Pourquoi une recherche et non un filtre dans l'arbre
 *
 * Un filtre dans l'arbre repond a « ou est le gardien de la crypte ? » a
 * condition d'avoir deja ouvert le panneau, choisi l'onglet Scene et la bonne
 * scene — c'est-a-dire de savoir deja ou il est. Et il ne dit rien des
 * especes, des planches, des sons, des salles ni des declencheurs, qui vivent
 * dans six autres onglets.
 *
 * Chaque resultat sait ou il HABITE : la carte a mettre sous le pinceau,
 * l'onglet a ouvrir, le point a viser. Le choisir fait le trajet entier.
 */
{
  const boite = document.getElementById('trouverBoite') as HTMLDialogElement
  const champ = document.getElementById('trouverChamp') as HTMLInputElement
  const liste = document.getElementById('trouverListe') as HTMLElement
  let resultats: Trouvaille[] = []
  let choisi = 0

  const ETIQUETTES: Record<string, string> = {
    noeud: 'nœud', carte: 'carte', espece: 'espèce', planche: 'planche',
    son: 'son', musique: 'musique', dialogue: 'dialogue', animation: 'animation',
    declencheur: 'déclencheur', salle: 'salle', assemblage: 'assemblage',
  }

  /**
   * Va voir.
   *
   * L'ordre compte : la carte D'ABORD, parce que la mettre sous le pinceau
   * reconstruit le monde — viser ou surligner avant cela designerait des
   * objets que la reconstruction remplace aussitot.
   */
  const aller = (t: Trouvaille): void => {
    boite.close()
    if (t.carte && t.carte !== (monde.carteActive ?? '')
      && (monde.cartes ?? []).some((c) => c.nom === t.carte)) {
      editerCarte(t.carte)
    }
    if (t.id) {
      selection = [t.id]
      panneauProjet.designerNoeuds(selection)
    }
    if (typeof t.x === 'number' && typeof t.y === 'number') {
      jeu.camera.x = Math.round(t.x - jeu.ecran.vue.largeur / 2)
      jeu.camera.y = Math.round(t.y - jeu.ecran.vue.hauteur / 2)
    }
    if (t.onglet) panneauProjet.ouvrirSur(t.onglet, t.cible ?? '')
    if (!jeu.tourne) { jeu.dessiner(); redessinerEdition() }
    verdict.textContent = `${ETIQUETTES[t.genre] ?? t.genre} « ${t.nom} » — ${t.detail}`
  }

  const dessiner = (): void => {
    liste.textContent = ''
    if (!resultats.length) {
      const vide = document.createElement('p')
      vide.className = 'ligne menu'
      vide.textContent = champ.value.trim()
        ? `Rien qui ressemble à « ${champ.value.trim()} » dans ce projet.`
        : 'Tapez : les nœuds de toutes les scènes, les cartes, les espèces, les planches, '
          + 'les sons, les musiques, les dialogues, les animations, les déclencheurs, '
          + 'les salles et les assemblages répondent.'
      liste.appendChild(vide)
      return
    }
    resultats.forEach((t, i) => {
      const b = document.createElement('button')
      b.className = `trouvaille${i === choisi ? ' actif' : ''}`
      const genre = document.createElement('span')
      genre.className = 'genre'
      genre.textContent = ETIQUETTES[t.genre] ?? t.genre
      const nom = document.createElement('span')
      nom.className = 'nom'
      nom.textContent = t.nom
      const detail = document.createElement('span')
      detail.className = 'detail'
      detail.textContent = t.detail
      b.append(genre, nom, detail)
      b.addEventListener('click', () => aller(t))
      liste.appendChild(b)
    })
  }

  const chercher = (): void => {
    resultats = chercherDansProjet(projetCourant(), champ.value)
    choisi = 0
    dessiner()
  }

  champ.addEventListener('input', chercher)
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      choisi = Math.min(resultats.length - 1, choisi + 1)
      dessiner()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      choisi = Math.max(0, choisi - 1)
      dessiner()
    } else if (e.key === 'Enter' && resultats[choisi]) {
      e.preventDefault()
      aller(resultats[choisi])
    } else if (e.key === 'Escape') {
      /*
       * Echap ferme la boite, et non le champ.
       *
       * Un `input` de type « search » avale la premiere pression pour vider
       * son contenu : la boite restait ouverte, et il fallait appuyer deux
       * fois. C'est le banc qui l'a vu — personne ne verifie a la main qu'une
       * touche d'echappement echappe.
       */
      e.preventDefault()
      boite.close()
    }
  })

  const ouvrirTrouver = (): void => {
    boite.showModal()
    champ.select()
    chercher()
  }
  document.getElementById('basculeTrouver')?.addEventListener('click', ouvrirTrouver)
  document.getElementById('fermerTrouver')?.addEventListener('click', () => boite.close())
  boite.addEventListener('click', (e) => { if (e.target === boite) boite.close() })
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return
    // Ctrl+F du navigateur cherche dans la PAGE : sur un editeur dont le
    // contenu est dans un canevas, il ne trouve jamais rien. On le prend.
    e.preventDefault()
    ouvrirTrouver()
  })
  ;(window as unknown as { pfeTrouver: unknown }).pfeTrouver = {
    ouvrir: ouvrirTrouver,
    chercher: (q: string) => chercherDansProjet(projetCourant(), q),
  }
}

/* ------------------------------------------------------------------ */
/* L'aide                                                              */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'on lit une fois, et qui evite trois quarts d'heure de tatonnement.
 *
 * Elle est ECRITE ici et non dans le HTML pour une raison simple : la moitie
 * de ce qu'elle dit — les outils, les raccourcis — existe deja dans le code,
 * et deux endroits pour la meme verite est un jour ou les deux ne disent plus
 * la meme chose. Ce qui est ici est ce que le code ne dit nulle part : l'ordre
 * dans lequel s'y prendre.
 */
const AIDE = `
<p>Un projet PixelForge tient dans un seul fichier : la carte, les dessins, les
animations, la scène, le catalogue des espèces. Il se rouvre, il se joue, il
s’exporte vers Godot ou Unity.</p>

<h4>Commencer</h4>
<p>L’accueil propose deux départs : <b>jeu de plateforme</b> (vue de côté,
gravité, un sol déjà posé) ou <b>vue de dessus</b> (on marche dans les quatre
sens). <b>Nouveau…</b> refait ce départ à tout moment. Les outils vivent dans
le <b>dock de gauche</b> — un chiffre par outil, de <kbd>1</kbd> à
<kbd>7</kbd> — et le bas de l’écran explique toujours l’outil courant.
<b>Dossier…</b> choisit où le projet s’enregistre ; sans dossier,
<b>Enregistrer</b> télécharge le fichier.</p>

<p>L’éditeur garde de lui-même un <b>brouillon</b> toutes les 45 secondes, dès
que vous avez fait quelque chose : si l’onglet se ferme, l’accueil proposera de
le reprendre. Ce n’est <i>pas</i> un enregistrement — il vit dans ce navigateur
seulement, et vider les données du site l’emporte.</p>

<h4>Dessiner</h4>
<p><b>Mur</b> peint du terrain : on dit « ici il y a du mur » et la bonne tuile
parmi 47 se déduit du voisinage. <b>Gomme</b> efface. <b>Tuile</b> pose une
tuile précise, pour ce que l’autotiling ne sait pas deviner.
<b>Collision</b> corrige ce qu’une case <i>fait</i> — solide, plateforme
traversable par en dessous, blessante, échelle, liquide — indépendamment de ce
qu’elle montre. Clic droit pour retirer, partout.</p>

<p>Le <b>tracé</b> vaut pour l’outil choisi, quel qu’il soit. <b>Libre</b> peint
case par case. <b>Rect</b> se tire d’un coin à l’autre et ne pose rien avant
qu’on lâche — un rectangle qu’on retaille ne laisse donc rien derrière lui.
<b>Remplir</b> couvre la zone d’un seul tenant sous le curseur, en s’arrêtant
aux murs et sans se faufiler entre deux coins. Dans les trois cas, le premier
appui décide : commencer sur une case déjà peinte <i>efface</i> le rectangle
ou la zone au lieu de la remplir.</p>

<h4>Peupler</h4>
<p><b>Entité</b> pose une créature au clic gauche, la retire au clic droit, et
la <b>déplace en la faisant glisser</b>. Poser une entité, c’est ajouter un
nœud à la scène : elle part dans le fichier avec le reste.</p>

<p><b>Plusieurs à la fois</b> : <kbd>Maj</kbd>+glisser dans la vue avec l’outil
Entité tire un rectangle qui choisit tout ce qu’il couvre, et
<kbd>Ctrl</kbd>+clic sur un nom de l’arbre ajoute ou retire ce nœud de la
sélection. Les touches agissent alors sur tous ; l’inspecteur, lui, règle le
<i>dernier</i> choisi — c’est celui que la vue entoure le plus vivement.</p>

<p>Saisir une entité la <b>choisit</b> : la vue l’entoure de quatre angles, et
l’onglet <b>Scène</b> ouvre dessous l’<b>inspecteur</b> — sa position, son
espèce, sa boîte, tout ce qu’elle porte. Une fois un nœud choisi, le clavier
suffit : <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> le déplacent d’une
case (<kbd>Maj</kbd> : d’un pixel), <kbd>Suppr</kbd> le retire,
<kbd>Ctrl</kbd>+<kbd>D</kbd> le duplique, <kbd>F</kbd> centre la vue dessus,
<kbd>Échap</kbd> le désélectionne. Sans rien de choisi, les flèches déplacent
la vue.</p>

<p><kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>Ctrl</kbd>+<kbd>X</kbd> et
<kbd>Ctrl</kbd>+<kbd>V</kbd> font ce qu’on attend — et le collage traverse les
<b>scènes</b> : copiez un lampadaire dans la clairière, changez de carte,
collez. Le collage va <i>sous</i> le nœud choisi s’il est structurel (un nœud
nu, un groupe : on l’a créé pour y ranger des choses) et <i>à côté</i> s’il
porte une espèce — coller une créature sous elle-même ferait un empilement que
personne ne demande.</p>

<h4>Découper en tableaux</h4>
<p><b>Salle</b> pose un tableau en tirant un rectangle, et le retire au clic
droit. Tirer son <b>intérieur</b> la déplace, tirer un de ses <b>bords ou
coins</b> la retaille — <kbd>Maj</kbd> force la création d’une nouvelle salle
par-dessus une autre. Une salle borne la caméra — elle ne montre jamais le tableau d’à côté —
et sert de point de reprise : mourir y renvoie, pas au départ du niveau. C’est
le découpage de Celeste. Sans aucune salle, le monde reste continu et la caméra
suit le héros partout. Deux salles qui se recouvrent sont signalées dans la
barre d’état : la caméra ne saurait pas laquelle choisir. Leur nom et leurs
quatre nombres se règlent aussi dans <b>Projet</b>, au pixel près.</p>

<h4>Ranger la scène</h4>
<p>L’onglet <b>Scène</b> du panneau Projet montre l’arbre entier. Cliquer un nom
choisit le nœud ; <b>glisser une ligne sur une autre</b> lui donne ce nœud pour
enfant — c’est ainsi qu’on attache un corps à un sprite, ou qu’on range douze
pièges sous un nœud « pièges », créé avec <b>+ Nœud</b>. <b>☆</b> fait d’un nœud
un <b>assemblage</b> : un modèle nommé que la palette de l’outil Entité propose,
et dont chaque clic pose une copie.</p>

<p><b>Renommer</b> une espèce ou une planche <i>suit les références</i> : les
entités déjà posées, les espèces qui piochent dans la planche, tout change de
nom en même temps. Ce que le renommage ne sait pas suivre — un script qui écrit
<code>c.poser('gelee', x, y)</code> — il le dit.</p>

<h4>Changer la structure</h4>
<p><b>Projet</b> ouvre ce que le pinceau ne sait pas faire : redimensionner la
carte, ajouter ou retirer un calque, créer une espèce sans écrire une ligne de
code. Ces gestes-là <b>se défont comme les autres</b> : le
<kbd>Ctrl</kbd>+<kbd>Z</kbd> ne connaît qu'un seul journal, qu'on ait peint une
case, posé une salle, déplacé un nœud dans l'arbre, importé un niveau Tiled ou
redimensionné la carte. L'infobulle du bouton <b>↶</b> dit les trois derniers
gestes, pour qu'on sache où l'on retombe avant d'appuyer.</p>

<h4>Essayer</h4>
<p><b>Jouer</b> lance le jeu dans le cadre réel, celui que le joueur verra.
<b>⏸</b> le <b>fige</b> sans le perdre, et <b>⏭</b> l’avance d’<i>un seul pas
de simulation</i> : c’est ainsi qu’on voit un saut qui accroche ou une boîte
qui passe au travers — cela se produit sur une image, à soixante par seconde.
Pendant la pause, les surcouches de l’éditeur reviennent par-dessus l’instant
figé : cochez <b>Collisions</b> et vous voyez ce que le décor <i>fait</i>, là
où le héros vient de passer. <b>Arrêter</b> remet tout le monde à sa place. Les boutons <b>−</b> et <b>+</b>
changent seulement le cadre d’<i>édition</i> : voir plus de carte, ou de plus
près.</p>

<h4>Écrire</h4>
<p>La <b>Console</b> garde ce que l’éditeur a à dire : les scripts refusés et
<i>pourquoi</i>, les exceptions levées pendant que le jeu tourne, les fichiers
qu’on n’a pas su lire, et ce qu’un script écrit avec <code>c.tracer(…)</code>.
Un message identique se compte au lieu de s’empiler — une erreur levée soixante
fois par seconde reste une ligne. Le compte sur le bouton dit les fautes qu’on
n’a pas encore lues.</p>

<p><b>Script</b> ouvre l’atelier : on choisit un nœud, on écrit son
comportement, <kbd>Ctrl</kbd>+<kbd>Entrée</kbd>, et ça tourne pendant que le jeu
joue. Un script ne parle qu’à <code>c</code>, le contexte de jeu, et
<code>n</code>, son nœud — pour qu’il traverse l’export.</p>

<h4>Les raccourcis</h4>
<p><kbd>Ctrl</kbd>+<kbd>F</kbd> <b>trouve</b> n’importe quoi dans le projet —
un nœud de n’importe quelle scène, une carte, une espèce, une planche, un son,
une musique, un dialogue, une animation, un déclencheur, une salle, un
assemblage. Le choisir fait le trajet : la bonne carte sous le pinceau, la vue
centrée, le bon onglet ouvert.</p>

<p><kbd>1</kbd>…<kbd>7</kbd> les outils du dock · <kbd>Ctrl</kbd>+<kbd>S</kbd>
enregistrer · <kbd>Ctrl</kbd>+<kbd>Z</kbd> défaire <i>n'importe quel geste</i> ·
<kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd> refaire · <kbd>+</kbd> /
<kbd>−</kbd> ou la <b>molette</b> pour le cadre d’édition · molette du milieu
ou outil <b>Main</b> pour déplacer la vue · sur le nœud choisi :
<b>flèches</b>, <kbd>Suppr</kbd>, <kbd>Ctrl</kbd>+<kbd>D</kbd>, <kbd>F</kbd>,
<kbd>Échap</kbd>.</p>
`

{
  const boite = document.getElementById('aideBoite') as HTMLDialogElement
  const corps = document.getElementById('aideCorps') as HTMLElement
  corps.innerHTML = AIDE
  document.getElementById('basculeAide')?.addEventListener('click', () => boite.showModal())
  document.getElementById('fermerAide')?.addEventListener('click', () => boite.close())
  boite.addEventListener('click', (e) => { if (e.target === boite) boite.close() })
}

/* ------------------------------------------------------------------ */
/* Jouer, arreter                                                      */
/* ------------------------------------------------------------------ */

/**
 * Le cadre d'edition : voir plus de carte, ou de plus pres.
 *
 * ## Pourquoi ce n'est pas un « zoom » d'ecran
 *
 * L'echelle a l'ecran est ENTIERE, toujours, et deduite de la fenetre : c'est
 * le contrat qui empeche la grille d'onduler. Un zoom qui la multiplierait par
 * 1,5 casserait ce contrat a la premiere molette.
 *
 * Ce reglage change donc la RESOLUTION VIRTUELLE pendant l'edition : un cadre
 * deux fois plus large montre deux fois plus de carte, avec des pixels deux
 * fois plus petits a l'ecran — et l'echelle reste entiere. Le cadre du JEU,
 * lui, ne bouge jamais : il est remis a celui du monde des qu'on appuie sur
 * Jouer. Sans quoi on reglerait la difficulte du jeu avec un bouton de zoom,
 * en voyant arriver ce que le joueur ne verra pas.
 */
const CADRES = [0.5, 1, 1.5, 2, 3, 4]
let cadre = 1
const zoomTexte = document.getElementById('zoomTexte') as HTMLElement

function appliquerCadre(): void {
  if (!jeu || jeu.tourne) return
  const v = {
    largeur: Math.max(64, Math.round(monde.vue.largeur * cadre)),
    hauteur: Math.max(36, Math.round(monde.vue.hauteur * cadre)),
  }
  jeu.ecran.redimensionner(v)
  zoomTexte.textContent = `${v.largeur}×${v.hauteur}`
  zoomTexte.title = cadre === 1
    ? 'Le cadre du jeu lui-même'
    : `${cadre > 1 ? 'Plus de carte' : 'De plus près'} que le cadre du jeu (${monde.vue.largeur}×${monde.vue.hauteur})`
  jeu.cadrer()
  jeu.dessiner()
  redessinerEdition()
}

function decalerCadre(pas: number): void {
  const i = CADRES.indexOf(cadre)
  const j = Math.max(0, Math.min(CADRES.length - 1, (i < 0 ? 1 : i) + pas))
  if (CADRES[j] === cadre) return
  cadre = CADRES[j]
  appliquerCadre()
}

document.getElementById('zoomPlus')?.addEventListener('click', () => decalerCadre(-1))
document.getElementById('zoomMoins')?.addEventListener('click', () => decalerCadre(1))
window.addEventListener('keydown', (e) => {
  const dansUnChamp = (e.target as HTMLElement)?.tagName === 'TEXTAREA'
    || (e.target as HTMLElement)?.tagName === 'INPUT'
  if (dansUnChamp || e.ctrlKey || e.metaKey) return
  if (e.key === '+' || e.key === '=') { e.preventDefault(); decalerCadre(-1) }
  if (e.key === '-') { e.preventDefault(); decalerCadre(1) }
  // Un chiffre par outil, dans l'ordre du dock : la main gauche choisit,
  // la droite peint — le geste de tous les logiciels de dessin.
  const ORDRE_OUTILS: Outil[] = ['terrain', 'gomme', 'collision', 'tuile', 'entite', 'salle', 'main']
  const n = Number(e.key)
  if (n >= 1 && n <= ORDRE_OUTILS.length && !jeu.tourne) {
    e.preventDefault()
    choisirOutil(ORDRE_OUTILS[n - 1])
  }
})

boutonJouer.addEventListener('click', () => { void jouerMaintenant() })
async function jouerMaintenant(): Promise<void> {
  /*
   * La boucle de l'editeur EXTERNE : avant de jouer, relire les scripts du
   * dossier de travail. Celui qui edite espece-gardien.js dans VS Code
   * appuie sur Jouer ici, et c'est SA version qui court — a ce moment-la,
   * le fichier a raison, puisqu'il vient d'etre modifie dehors.
   */
  if (travail) {
    try {
      const noms = await dossier.listerSous(travail, 'scripts', '.js')
      const fichiers: { nom: string; contenu: string }[] = []
      for (const n of noms) {
        const t = await dossier.lireSous(travail, 'scripts', n)
        if (t !== null) fichiers.push({ nom: n, contenu: t })
      }
      if (fichiers.length) {
        const r = appliquerFichiersScripts(projetCourant(), fichiers)
        if (r.adoptes.length) {
          installerProjet(r.projet,
            monde.id.startsWith('projet:') ? monde.id.slice(7) : monde.id,
            monde.carteActive ?? '')
          verdict.textContent = `Relu du dossier : ${r.adoptes.join(', ')}`
            + (r.notes.length ? ` · ${r.notes.join(' · ')}` : '')
        }
      }
    } catch { /* un dossier debranche n'empeche pas de jouer */ }
  }
  // Le cadre du jeu, et rien d'autre : on joue ce que le joueur verra.
  jeu.ecran.redimensionner(monde.vue)
  jeu.cadrer()
  jeu.demarrer()
  boutonJouer.disabled = true
  boutonArreter.disabled = false
  majPause()
  canevas.classList.add('jeu')
  canevas.focus()
}

/**
 * Figer, et avancer d'un pas.
 *
 * ## Pourquoi un moteur de jeu de precision en a besoin
 *
 * Un saut qui accroche, une boite qui passe au travers, une creature qui
 * traverse un mur : cela se produit sur UNE image, a soixante par seconde. On
 * ne le voit pas ; on le devine, et l'on modifie au hasard. Figer la partie
 * puis l'avancer d'un pas montre exactement ce qui se passe, image par image.
 *
 * Pendant la pause, les surcouches de l'editeur reviennent — la grille de
 * collision par-dessus l'instant fige. C'est la reunion des deux moities :
 * l'etat vivant du jeu, et ce que l'editeur sait en dire.
 */
function majPause(): void {
  const vit = jeu.tourne
  boutonPause.disabled = !vit
  boutonUnPas.disabled = !vit || !jeu.enPause
  boutonPause.textContent = jeu.enPause ? '▶▶' : '⏸'
  boutonPause.title = jeu.enPause
    ? 'Reprendre la partie là où elle est figée'
    : 'Figer la partie sans la perdre — puis l’avancer d’un pas'
  canevas.classList.toggle('fige', jeu.enPause)
}

boutonPause.addEventListener('click', () => {
  if (!jeu.tourne) return
  if (jeu.enPause) {
    jeu.reprendre()
    verdict.textContent = 'partie reprise'
  } else {
    jeu.pause()
    // Le dessin ET les surcouches : on fige pour REGARDER, et ce qu'il y a a
    // regarder est en partie ce que l'editeur sait montrer.
    jeu.dessiner()
    redessinerEdition()
    verdict.textContent = `figé au pas ${jeu.pas} — ⏭ avance d’une image`
  }
  majPause()
})

boutonUnPas.addEventListener('click', () => {
  if (!jeu.unPas()) return
  redessinerEdition()
  verdict.textContent = `pas ${jeu.pas}`
})

function arreter(): void {
  jeu.arreter()
  boutonJouer.disabled = false
  boutonArreter.disabled = true
  majPause()
  canevas.classList.remove('jeu')
  // On repose le heros a son depart : essayer une salle puis la modifier avec
  // le personnage coince dans un mur qu'on vient de peindre serait absurde.
  monde.reinitialiser()
  appliquerCadre()
  jeu.cadrer()
  jeu.dessiner()
  redessinerEdition()
}
boutonArreter.addEventListener('click', arreter)

/* ------------------------------------------------------------------ */
/* L'export                                                            */
/* ------------------------------------------------------------------ */

const selectCible = document.getElementById('cible') as HTMLSelectElement
{
  // Deux familles, et on le dit : d'un cote un chargeur a brancher dans son
  // propre programme, de l'autre un projet qui s'ouvre. Melanger les deux dans
  // une liste plate ferait choisir « C# » a qui voulait un projet Unity.
  const paquets = document.createElement('optgroup')
  paquets.label = 'Un projet qui s’ouvre'
  for (const c of PAQUETS) {
    const o = document.createElement('option')
    o.value = `paquet:${c.id}`
    o.textContent = c.nom
    o.title = c.note
    paquets.appendChild(o)
  }
  selectCible.appendChild(paquets)

  const codes = document.createElement('optgroup')
  codes.label = 'Un chargeur à brancher'
  for (const c of CIBLES) {
    const o = document.createElement('option')
    o.value = c.id
    o.textContent = c.nom
    o.title = c.note
    codes.appendChild(o)
  }
  selectCible.appendChild(codes)
}

/**
 * Telecharge un fichier. Deux appels plutot qu'une archive : produire un zip
 * demanderait une dependance pour compresser deux fichiers texte, et le
 * navigateur sait tres bien enregistrer deux fois.
 */
function telecharger(nom: string, contenu: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  // Le revoquer tout de suite annulerait le telechargement dans certains
  // navigateurs : on laisse passer un tour de boucle.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

document.getElementById('exporter')?.addEventListener('click', () => { void exporter() })

/**
 * Exporte.
 *
 * Un paquet part en une seule archive : un projet Godot fait neuf fichiers, et
 * les telecharger un par un donnerait neuf confirmations. Un chargeur, lui,
 * part avec les donnees qu'il sait lire — deux fichiers, et c'est tout.
 */
async function exporter(): Promise<void> {
  const choix = selectCible.value
  const p = projetCourant()

  if (choix === 'paquet:web' || choix === 'paquet:bureau') {
    /*
     * Le jeu web et le paquet de bureau emballent la MEME page : le
     * gabarit autoporteur, projet inline — l'injection vit dans
     * export/jeu-web.ts, une fois pour les deux.
     */
    const r = await fetch('jeu/gabarit.html')
    if (!r.ok) {
      avertir('Le gabarit du jeu web manque : lancez `npm run joueur` et redéployez.', 'export')
      return
    }
    const page = pageDeJeu(await r.text(), p)
    if (page === null) {
      avertir('Le gabarit n’a pas l’emplacement du projet : refaites `npm run joueur`.', 'export')
      return
    }
    if (choix === 'paquet:bureau') {
      const entrees = paquetBureau(p, page)
      const nomZip = `${p.nom.replace(/\.json$/i, '')}-bureau.zip`
      const octets = zipper(entrees)
      if (travail) {
        try {
          await dossier.ecrireOctets(travail, nomZip, octets)
          verdict.textContent = `${travail.name}/${nomZip} — décompressez, npm install, `
            + 'npm run construire : les binaires Linux/Windows/macOS sortent chez vous.'
          return
        } catch (e) {
          avertir(e instanceof Error ? e.message : String(e), 'fichier')
          return
        }
      }
      dossier.telechargerOctets(nomZip, octets)
      verdict.textContent = `${nomZip} — décompressez, npm install, npm run construire : `
        + 'les binaires Linux/Windows/macOS sortent chez vous.'
      return
    }
    // Un projet relu s'appelle souvent « mon-jeu.json » : on ne livre pas
    // un « mon-jeu.json.html ».
    const nomPage = `${p.nom.replace(/\.json$/i, '')}.html`
    if (travail) {
      try {
        await dossier.ecrire(travail, nomPage, page)
        verdict.textContent = `${travail.name}/${nomPage} — le jeu, jouable en un fichier `
          + `(${Math.round(page.length / 1024)} Ko). Double-clic, ou itch.io.`
        return
      } catch (e) {
        avertir(e instanceof Error ? e.message : String(e), 'fichier')
        return
      }
    }
    telecharger(nomPage, page, 'text/html')
    verdict.textContent = `${nomPage} — le jeu, jouable en un fichier `
      + `(${Math.round(page.length / 1024)} Ko). Double-clic, ou itch.io.`
    return
  }

  if (choix.startsWith('paquet:')) {
    const id = choix.slice(7)
    const entrees = id === 'godot' ? paquetGodot(p) : paquetUnity(p)
    const nom = `${p.nom}-${id}.zip`
    const octets = zipper(entrees)
    if (travail) {
      try {
        await dossier.ecrireOctets(travail, nom, octets)
        verdict.textContent = `${travail.name}/${nom} — ${entrees.length} fichiers,`
          + ` ${Math.round(octets.length / 1024)} Ko`
        return
      } catch (e) {
        avertir(e instanceof Error ? e.message : String(e), 'fichier')
        return
      }
    }
    dossier.telechargerOctets(nom, octets)
    verdict.textContent = `${nom} — ${entrees.length} fichiers,`
      + ` ${Math.round(octets.length / 1024)} Ko`
    return
  }

  const cible = choix as Cible
  telecharger(`${p.nom}.json`, versTexte(p), 'application/json')
  const fichier = CIBLES.find((c) => c.id === cible)?.fichier ?? 'projet.txt'
  telecharger(fichier, chargeur(cible, p), 'text/plain')
  verdict.textContent = `exporté : ${p.nom}.json + ${fichier}`
}

/* ------------------------------------------------------------------ */
/* La mesure, et le premier chargement                                 */
/* ------------------------------------------------------------------ */

let derniere = performance.now()
let images = 0
let fps = 0
function majMesure(): void {
  mesure.textContent = jeu.enPause
    ? `figé · pas ${jeu.pas} · ×${jeu.ecran.echelle} · ${monde.etat()}`
    : (jeu.tourne
      ? `${fps} img/s · pas ${jeu.pas} · ×${jeu.ecran.echelle} · ${monde.etat()}`
      : `arrêté · ×${jeu.ecran.echelle} · ${monde.etat()}`)
}
const rafraichirMesure = (): void => {
  images++
  const t = performance.now()
  if (t - derniere >= 500) {
    fps = Math.round((images * 1000) / (t - derniere))
    derniere = t
    images = 0
  }
  majMesure()
  requestAnimationFrame(rafraichirMesure)
}
// Le chargement vient APRES les compteurs : il les lit pour remplir la barre
// d'etat, et une variable declaree plus bas serait encore dans sa zone morte.
charger(MONDES[0].id)
requestAnimationFrame(rafraichirMesure)

window.addEventListener('resize', () => {
  if (jeu.tourne) return
  jeu.dessiner()
  redessinerEdition()
})
