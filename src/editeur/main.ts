import { Jeu } from '../runtime/jeu.ts'
import { Palette, depuisHex } from '../noyau/palette.ts'
import { atlasDepuisLettres } from '../runtime/atlas.ts'
import { contourDeCase } from '../noyau/projection.ts'
import { Edition, type Outil, type Trace } from './edition.ts'
import type { Noeud } from '../scene/noeud.ts'
import { serialiserProjet, versTexte, VERSION_FORMAT, relireNoeud } from '../export/format.ts'
import { chargeur, CIBLES, type Cible } from '../export/chargeurs.ts'
import { paquetGodot, paquetUnity, PAQUETS } from '../export/moteurs.ts'
import { pageDeJeu, paquetBureau } from '../export/jeu-web.ts'
import { zipper } from '../export/paquet.ts'
import { MONDES, type Monde } from '../demo/mondes.ts'
import { Atelier } from './atelier-panneau.ts'
import { mondeDepuisProjet } from './monde-projet.ts'
import { Palette as PalettePanneau } from './palette-panneau.ts'
import { PanneauProjet } from './projet-panneau.ts'
import { projetNeuf, ajouterSonImporteProjet, ajouterCarteImporteeProjet } from './projet-neuf.ts'
import { scriptsVersFichiers, appliquerFichiersScripts } from './scripts-dossier.ts'
import { depuisTiled, estDuTiled } from '../export/tiled.ts'
import { depuisLdtk, estDuLdtk } from '../export/ldtk.ts'
import { PanneauFichiers, genreDe } from './fichiers-panneau.ts'
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

let monde: Monde
let jeu: Jeu
/** D'ou vient l'entite qu'on traine : c'est ce que « defaire » remettra. */
let depart: { x: number; y: number } | null = null
let palette: Palette
let edition: Edition

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
  edition = new Edition(jeu, monde.carte)
  edition.etat.montrerCollision = voirCollision.checked
  edition.changerCarte(monde.carte, monde.tuilePinceau)
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
      m.salles.push(salleNeuve(`salle${n}`, { x, y, largeur, hauteur, carte: monde.carteActive ?? '' }))
      // Le compte et l'avertissement vont dans la barre d'etat, qui les
      // GARDE : voir `majEtat`.
      panneauProjet?.montrer()
    },
    retirer: (nom) => {
      const m = monde as Monde & { salles?: SalleJeu[] }
      if (!m.salles) return
      const i = m.salles.findIndex((q) => q.nom === nom)
      if (i < 0) return
      m.salles.splice(i, 1)
      panneauProjet?.montrer()
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
      // La moitie vue→arbre du dialogue : l'arbre surligne qui l'on tient.
      panneauProjet.designerNoeud(n.id)
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
      // Le depart SUIT l'entite deplacee — sinon le premier arret la
      // renverrait la ou elle etait avant le geste.
      const retenirIci = (): void => {
        monde.retenirDepart?.(n, parentDe(monde.racine, n) ?? monde.racine)
      }
      retenirIci()
      edition.historique.poser({
        nom: 'entité déplacée',
        defaire: () => { n.x = avant.x; n.y = avant.y; retenirIci(); jeu.dessiner() },
        refaire: () => { n.x = apres.x; n.y = apres.y; retenirIci(); jeu.dessiner() },
      })
      majHistorique()
      verdict.textContent = `entité déplacée en ${apres.x},${apres.y}`
    },
  }

  choisirOutil(outilPrecedent)
  majHistorique()

  jeu.cadrer()
  jeu.dessiner()
  redessinerEdition()

  atelier.reinitialiser()
  // L'aide du pied montre L'OUTIL courant, pas la fiche du monde : c'est la
  // question qu'on se pose en editant. La fiche du monde vit derriere « ? ».
  aide.textContent = AIDE_OUTILS[edition.etat.outil] ?? monde.aide
  info.textContent = `${monde.vue.largeur}×${monde.vue.hauteur} · ${monde.carte.largeur}×${monde.carte.hauteur} · ${monde.projection.mode}, ${monde.projection.regard}`
  majEtat()
  majMesure()
  appliquerCadre()
  panneauProjet?.montrer()
  ;(window as unknown as { pfe: unknown }).pfe = { jeu, monde, palette, edition }
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
      verdict.textContent = e instanceof Error ? e.message : String(e)
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
    verdict.textContent = `« ${nomFichier} » n’est pas du JSON valide : ${e instanceof Error ? e.message : e}`
    return
  }
  const p = brut as ReturnType<typeof projetCourant>
  if (!p || typeof p.version !== 'number' || !Array.isArray(p.cartes)) {
    verdict.textContent = `« ${nomFichier} » n’a pas la forme d’un projet PixelForge.`
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
  charger(id)
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
      installerProjet(p, p.nom, monde.carteActive ?? '')
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
      installerProjet(projetCourant(), monde.id.startsWith('projet:') ? monde.id.slice(7) : monde.id, nom)
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
      installerProjet(p2, p2.nom, nomCarte)
      panneauProjet.ouvrirSur('carte')
      verdict.textContent = `Carte Tiled « ${nomCarte} » importée : ${r.calquesLus} calque(s), `
        + `${r.objetsLus} objet(s)${r.avertissements.length ? ` · ${r.avertissements.join(' · ')}` : ''}`
      return
    }
    if (estDuLdtk(brut)) {
      const r = depuisLdtk(brut)
      if (!r.cartes.length) {
        verdict.textContent = `« ${f.name} » : ${r.avertissements.join(' · ') || 'aucun niveau'}`
        return
      }
      let p2 = projetCourant()
      let derniere = ''
      for (const c of r.cartes) {
        p2 = ajouterCarteImporteeProjet(p2, c.nom, c.carte)
        derniere = p2.cartes[p2.cartes.length - 1].nom
      }
      installerProjet(p2, p2.nom, derniere)
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
      verdict.textContent = `« ${f.name} » n’est pas un WAV PCM 16 bits. `
        + 'Exportez-le sans compression — c’est le seul format que tout moteur lit.'
      return
    }
    const dureeMs = (brut.echantillons.length / brut.taux) * 1000
    const p2 = ajouterSonImporteProjet(
      projetCourant(), f.name, base64DepuisOctets(octets), dureeMs,
    )
    const nomSon = p2.sons[p2.sons.length - 1].nom
    installerProjet(p2, p2.nom)
    panneauProjet.ouvrirSur('sons', nomSon)
    verdict.textContent = `Son « ${nomSon} » importé : ${Math.round(dureeMs)} ms à ${brut.taux} Hz. `
      + 'Un script le joue par c.jouer, une animation par son événement.'
    return
  }
  verdict.textContent = `« ${f.name} » : rien à en faire ici. `
    + 'Une image devient une planche, un .json s’ouvre comme projet, un .wav devient un son, '
    + 'un niveau Tiled ou LDtk devient une carte.'
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
    importerAsset: (f) => routerFichier(f),
    ouvrirProjetPanneau: (onglet, cible) => panneauProjet.ouvrirSur(onglet, cible),
    editerCarte: (nom) => {
      installerProjet(projetCourant(), monde.id.startsWith('projet:') ? monde.id.slice(7) : monde.id, nom)
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
  installerProjet(pj, pj.nom)
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
accueil.addEventListener('click', (e) => { if (e.target === accueil) fermerAccueil() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !accueil.hidden) fermerAccueil() })
// Il se montre au demarrage, et seulement la : le rouvrir a chaque geste
// serait un tourniquet a l'entree de l'atelier.
accueil.hidden = false

document.getElementById('nouveau')?.addEventListener('click', () => {
  if (!window.confirm('Créer un projet vide ? Ce qui est à l’écran sera remplacé.')) return
  const p = projetNeuf()
  installerProjet(p, p.nom)
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

selectMonde.addEventListener('change', () => charger(selectMonde.value))

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
  entite: 'Entité — choisissez une créature à gauche, clic pour poser, clic droit pour retirer, tirer pour déplacer',
  salle: 'Salle — tirez un rectangle : la caméra s’y bornera, on y réapparaîtra',
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
  edition.commencer(e.clientX, e.clientY, e.button)
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
  edition.finir()
  redessinerEdition()
  majEtat()
  majHistorique()
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
function dessinerCadreEdition(): void {
  if (jeu.tourne) return
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

/** Les surcouches de l'editeur, dans l'ordre ou elles se posent. */
function redessinerEdition(): void {
  dessinerCadreEdition()
  dessinerCollision()
  dessinerSalles()
}

/* ------------------------------------------------------------------ */
/* Defaire et refaire                                                  */
/* ------------------------------------------------------------------ */

const boutonDefaire = document.getElementById('defaire') as HTMLButtonElement
const boutonRefaire = document.getElementById('refaire') as HTMLButtonElement

function majHistorique(): void {
  boutonDefaire.disabled = !edition.historique.peutDefaire
  boutonRefaire.disabled = !edition.historique.peutRefaire
  boutonDefaire.title = edition.historique.peutDefaire
    ? `Défaire : ${edition.historique.nomDefaire} (Ctrl+Z)` : 'Rien à défaire'
  boutonRefaire.title = edition.historique.peutRefaire
    ? `Refaire : ${edition.historique.nomRefaire} (Ctrl+Maj+Z)` : 'Rien à refaire'
}

function defaire(): void {
  const nom = edition.historique.defaire()
  jeu.dessiner()
  redessinerEdition()
  majEtat()
  majHistorique()
  // Apres `majEtat`, qui ecrit dans le meme endroit : dire ce qu'on vient de
  // faire compte plus que le compte des cases, pendant une seconde.
  if (nom) verdict.textContent = `défait : ${nom}`
}

function refaire(): void {
  const nom = edition.historique.refaire()
  jeu.dessiner()
  redessinerEdition()
  majEtat()
  majHistorique()
  // Apres `majEtat`, qui ecrit dans le meme endroit : dire ce qu'on vient de
  // faire compte plus que le compte des cases, pendant une seconde.
  if (nom) verdict.textContent = `refait : ${nom}`
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
  if (!edition.etat.montrerCollision || jeu.tourne) return
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
  if (jeu.tourne) return
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
  verdict.textContent = `${palette.taille} couleurs · ${c.terrain} posées`
    + ` · ${c.solides} solides${entites ? ` · ${entites} entité(s)` : ''}`
    + (salles.length ? ` · ${salles.length} salle(s)` : '')
    + (croise.length ? ` · ⚠ « ${croise[0][0]} » et « ${croise[0][1]} » se recouvrent` : '')
}

/**
 * Poser ou retirer une entite, en un geste qu'on peut defaire.
 *
 * Le noeud lui-meme est garde, pas une description : le remettre en place doit
 * rendre la MEME entite, avec son identifiant. Un noeud recree porterait un
 * autre identifiant, et tout ce qui y renvoyait — une vitalite, un script —
 * pointerait dans le vide.
 */
function gesteEntite(nom: string, parent: Noeud, n: Noeud, pose = false) {
  // Chaque sens du geste tient les DEPARTS a jour : un arret raccroche les
  // departs, donc un noeud present sans depart disparait au premier arret,
  // et un depart sans noeud fait une revenante. Voir monde-projet.
  const ajouter = (): void => {
    if (!parent.enfants.includes(n)) parent.enfants.push(n)
    monde.retenirDepart?.(n, parent)
  }
  const oter = (): void => {
    retirerDe(monde.racine, n)
    monde.oublierDepart?.(n)
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

<h4>Découper en tableaux</h4>
<p><b>Salle</b> pose un tableau en tirant un rectangle, et le retire au clic
droit. Une salle borne la caméra — elle ne montre jamais le tableau d’à côté —
et sert de point de reprise : mourir y renvoie, pas au départ du niveau. C’est
le découpage de Celeste. Sans aucune salle, le monde reste continu et la caméra
suit le héros partout. Deux salles qui se recouvrent sont signalées dans la
barre d’état : la caméra ne saurait pas laquelle choisir. Leurs quatre nombres
et leur nom se règlent dans <b>Projet</b>.</p>

<h4>Changer la structure</h4>
<p><b>Projet</b> ouvre ce que le pinceau ne sait pas faire : redimensionner la
carte, ajouter ou retirer un calque, créer une espèce sans écrire une ligne de
code. Ces gestes-là reconstruisent le projet et <b>ne se défont pas</b> au
Ctrl+Z — enregistrez avant, si vous hésitez.</p>

<h4>Essayer</h4>
<p><b>Jouer</b> lance le jeu dans le cadre réel, celui que le joueur verra.
<b>Arrêter</b> remet tout le monde à sa place. Les boutons <b>−</b> et <b>+</b>
changent seulement le cadre d’<i>édition</i> : voir plus de carte, ou de plus
près.</p>

<h4>Écrire</h4>
<p><b>Script</b> ouvre l’atelier : on choisit un nœud, on écrit son
comportement, <kbd>Ctrl</kbd>+<kbd>Entrée</kbd>, et ça tourne pendant que le jeu
joue. Un script ne parle qu’à <code>c</code>, le contexte de jeu, et
<code>n</code>, son nœud — pour qu’il traverse l’export.</p>

<h4>Les raccourcis</h4>
<p><kbd>1</kbd>…<kbd>7</kbd> les outils du dock · <kbd>Ctrl</kbd>+<kbd>S</kbd>
enregistrer · <kbd>Ctrl</kbd>+<kbd>Z</kbd> défaire ·
<kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd> refaire · <kbd>+</kbd> /
<kbd>−</kbd> ou la <b>molette</b> pour le cadre d’édition · molette du milieu
ou outil <b>Main</b> pour déplacer la vue.</p>
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
  canevas.classList.add('jeu')
  canevas.focus()
}

function arreter(): void {
  jeu.arreter()
  boutonJouer.disabled = false
  boutonArreter.disabled = true
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
      verdict.textContent = 'Le gabarit du jeu web manque : lancez `npm run joueur` et redéployez.'
      return
    }
    const page = pageDeJeu(await r.text(), p)
    if (page === null) {
      verdict.textContent = 'Le gabarit n’a pas l’emplacement du projet : refaites `npm run joueur`.'
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
          verdict.textContent = e instanceof Error ? e.message : String(e)
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
        verdict.textContent = e instanceof Error ? e.message : String(e)
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
        verdict.textContent = e instanceof Error ? e.message : String(e)
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
  mesure.textContent = jeu.tourne
    ? `${fps} img/s · pas ${jeu.pas} · ×${jeu.ecran.echelle} · ${monde.etat()}`
    : `arrêté · ×${jeu.ecran.echelle} · ${monde.etat()}`
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
