import { Jeu } from '../runtime/jeu.ts'
import { Palette, depuisHex } from '../noyau/palette.ts'
import { atlasDepuisLettres } from '../runtime/atlas.ts'
import { contourDeCase } from '../noyau/projection.ts'
import { Edition, type Outil } from './edition.ts'
import { serialiserProjet, versTexte, VERSION_FORMAT } from '../export/format.ts'
import { chargeur, CIBLES, type Cible } from '../export/chargeurs.ts'
import { paquetGodot, paquetUnity, PAQUETS } from '../export/moteurs.ts'
import { zipper } from '../export/paquet.ts'
import { MONDES, type Monde } from '../demo/mondes.ts'
import { Atelier } from './atelier-panneau.ts'
import { mondeDepuisProjet } from './monde-projet.ts'
import { Palette as PalettePanneau } from './palette-panneau.ts'
import { retirerDe } from '../runtime/entites.ts'
import * as dossier from '../io/dossier.ts'

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
  () => { if (!jeu.tourne) { jeu.dessiner(); dessinerCollision() } },
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
        // On passe par la scene si `tuer` ne connait pas l'entite : elle peut
        // n'avoir jamais ete adoptee — posee pendant que le jeu est arrete.
        if (!peuplement.tuer(n.id)) retirerDe(monde.racine, n)
      }
      majEtat()
      return
    }
    if (!edition.etat.espece) return
    // Les pieds au bas de la case : c'est la convention d'ancrage de tout le
    // moteur, et c'est ce qui aligne l'entite sur le sol qu'elle foule.
    peuplement.poser(edition.etat.espece, cx * t + t / 2, cy * t + t)
    majEtat()
  }

  choisirOutil(outilPrecedent)

  jeu.cadrer()
  jeu.dessiner()
  dessinerCollision()

  atelier.reinitialiser()
  aide.textContent = monde.aide
  info.textContent = `${monde.vue.largeur}×${monde.vue.hauteur} · ${monde.carte.largeur}×${monde.carte.hauteur} · ${monde.projection.mode}, ${monde.projection.regard}`
  majEtat()
  majMesure()
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

boutonDossier.addEventListener('click', async () => {
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
})

/** Le projet courant, tel qu'il partira dans le fichier. */
function projetCourant() {
  return serialiserProjet(
    monde.id.startsWith('projet:') ? monde.id.slice(7) : monde.id,
    jeu.ecran.vue, palette,
    [{ nom: monde.id.startsWith('projet:') ? 'carte' : monde.id, carte: monde.carte }],
    [{ nom: 'principale', racine: monde.racine }],
    monde.animations,
    monde.planches,
    monde.projection,
    monde.especes,
  )
}

async function enregistrer(): Promise<void> {
  const p = projetCourant()
  const nom = `${p.nom}.json`
  const texte = versTexte(p)
  if (travail) {
    try {
      await dossier.ecrire(travail, nom, texte)
      verdict.textContent = `Enregistré : ${travail.name}/${nom} (${Math.round(texte.length / 1024)} Ko)`
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
    if (v.espece !== undefined) edition.etat.espece = v.espece
    if (v.tuile !== undefined) edition.etat.tuileChoisie = v.tuile
    if (v.calque !== undefined) edition.etat.calqueChoisi = v.calque
  },
)

function choisirOutil(o: Outil): void {
  edition.etat.outil = o
  for (const b of outils.querySelectorAll('button')) {
    b.classList.toggle('actif', (b as HTMLElement).dataset.outil === o)
  }
  canevas.classList.toggle('main', o === 'main')
  palettePanneau.montrer(o, monde.especes, monde.peuplement ?? null, {
    espece: edition.etat.espece,
    tuile: edition.etat.tuileChoisie,
    calque: edition.etat.calqueChoisi,
  })
  if (!jeu.tourne) { jeu.dessiner(); dessinerCollision() }
}
outils.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button')
  if (b?.dataset.outil) choisirOutil(b.dataset.outil as Outil)
})

voirCollision.addEventListener('change', () => {
  edition.etat.montrerCollision = voirCollision.checked
  jeu.dessiner()
  dessinerCollision()
})

// Le menu contextuel du navigateur volerait le clic droit, qui sert a retirer.
canevas.addEventListener('contextmenu', (e) => e.preventDefault())

canevas.addEventListener('pointerdown', (e) => {
  if (jeu.tourne) return
  canevas.setPointerCapture(e.pointerId)
  edition.commencer(e.clientX, e.clientY, e.button)
  dessinerCollision()
  majEtat()
})
canevas.addEventListener('pointermove', (e) => {
  if (jeu.tourne) return
  edition.bouger(e.clientX, e.clientY)
  dessinerCollision()
})
canevas.addEventListener('pointerup', () => { edition.finir(); majEtat() })

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

function majEtat(): void {
  const c = edition.compter()
  const entites = compterEntites(monde.racine)
  verdict.textContent = `${palette.taille} couleurs · ${c.terrain} posées`
    + ` · ${c.solides} solides${entites ? ` · ${entites} entité(s)` : ''}`
}

/** Les noeuds de la scene qui portent une espece. */
function compterEntites(n: { enfants: unknown[] }): number {
  let total = (n as { espece?: string }).espece ? 1 : 0
  for (const e of n.enfants) total += compterEntites(e as { enfants: unknown[] })
  return total
}

/* ------------------------------------------------------------------ */
/* Jouer, arreter                                                      */
/* ------------------------------------------------------------------ */

boutonJouer.addEventListener('click', () => {
  jeu.demarrer()
  boutonJouer.disabled = true
  boutonArreter.disabled = false
  canevas.classList.add('jeu')
  canevas.focus()
})

function arreter(): void {
  jeu.arreter()
  boutonJouer.disabled = false
  boutonArreter.disabled = true
  canevas.classList.remove('jeu')
  // On repose le heros a son depart : essayer une salle puis la modifier avec
  // le personnage coince dans un mur qu'on vient de peindre serait absurde.
  monde.reinitialiser()
  jeu.cadrer()
  jeu.dessiner()
  dessinerCollision()
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
  dessinerCollision()
})
