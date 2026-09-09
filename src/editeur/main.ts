import { Jeu } from '../runtime/jeu.ts'
import { atlasDepuisLettres, couleursDe } from '../runtime/atlas.ts'
import { construireDonjon } from '../demo/donjon.ts'
import {
  TUILE, CLE_DONJON, CLE_HEROS, PLANCHE_DONJON, PLANCHE_HEROS,
  DIR_BAS, DIR_HAUT, DIR_DROITE, DIR_GAUCHE,
} from '../demo/art.ts'
import { Palette, depuisHex } from '../noyau/palette.ts'
import type { NoeudCorps, NoeudSprite } from '../scene/noeud.ts'
import { Edition, type Outil } from './edition.ts'
import { serialiserProjet, versTexte } from '../export/format.ts'
import { chargeur, CIBLES, type Cible } from '../export/chargeurs.ts'

/**
 * L'editeur, premiere version : il montre une scene et il la fait tourner.
 *
 * L'ordre des travaux est deliberé. Un editeur qui sait poser des tuiles mais
 * dont on ne peut pas essayer le resultat ne dit rien de ce que le jeu vaut ;
 * un moteur qui fait tourner quelque chose de jouable dit tout de suite si le
 * contrat de pixel tient, si les collisions accrochent, si la camera tremble.
 * On commence donc par « Jouer », et les outils d'edition viennent se brancher
 * sur une chose qui vit.
 */
const canevas = document.getElementById('vue') as HTMLCanvasElement
const boutonJouer = document.getElementById('jouer') as HTMLButtonElement
const boutonArreter = document.getElementById('arreter') as HTMLButtonElement
const info = document.getElementById('info') as HTMLElement
const verdict = document.getElementById('verdict') as HTMLElement
const mesure = document.getElementById('mesure') as HTMLElement

const donjon = construireDonjon()
const jeu = new Jeu(canevas, donjon.racine, donjon.carte, { vue: { largeur: 320, hauteur: 180 } })

jeu.cartes.set('salle', {
  carte: donjon.carte,
  atlas: atlasDepuisLettres(PLANCHE_DONJON, CLE_DONJON, TUILE, 8),
})
jeu.sprites.set('heros', atlasDepuisLettres(PLANCHE_HEROS, CLE_HEROS, TUILE, 4))
jeu.suivreNoeud('heros')

/** La palette du projet : elle se deduit des dessins, pour n'exister qu'une fois. */
const palette = new Palette('donjon',
  [...couleursDe(CLE_DONJON), ...couleursDe(CLE_HEROS)].map(depuisHex))

/**
 * Le script du heros.
 *
 * C'est exactement la forme qu'aura un script ecrit dans l'editeur : il recoit
 * le contexte et son noeud, et il n'a acces a rien d'autre. Il ne touche
 * jamais `x` directement — `bouger` passe par l'accumulateur, qui garde la
 * fraction et rend un pas entier.
 */
const VITESSE = 70

jeu.scripts.set('heros', (c, n) => {
  const sprite = n as NoeudSprite
  const corps = n.enfants.find((e) => e.type === 'corps') as NoeudCorps | undefined
  if (!corps) return

  const a = c.entrees.axe()
  // La diagonale est normalisee : sans cela on avance 1,41 fois plus vite en
  // biais, ce qui est le defaut le plus repandu des jeux vus de dessus.
  const norme = a.x && a.y ? Math.SQRT1_2 : 1
  c.bouger(corps, a.x * VITESSE * norme * c.dt, a.y * VITESSE * norme * c.dt)

  if (a.x || a.y) {
    // La direction verticale l'emporte : de dos ou de face se lit mieux qu'un
    // profil, et en diagonale on veut voir le visage.
    if (a.y > 0) sprite.image = DIR_BAS
    else if (a.y < 0) sprite.image = DIR_HAUT
    else sprite.image = a.x > 0 ? DIR_DROITE : DIR_GAUCHE
    sprite.miroir = sprite.image === DIR_GAUCHE
    if (sprite.image === DIR_GAUCHE) sprite.image = DIR_DROITE
  }
})

/* ------------------------------------------------------------------ */
/* L'edition                                                           */
/* ------------------------------------------------------------------ */

const edition = new Edition(jeu, donjon.carte)
const outils = document.getElementById('outils') as HTMLElement
const voirCollision = document.getElementById('voirCollision') as HTMLInputElement

const choisirOutil = (o: Outil): void => {
  edition.etat.outil = o
  for (const b of outils.querySelectorAll('button')) {
    b.classList.toggle('actif', (b as HTMLElement).dataset.outil === o)
  }
  canevas.classList.toggle('main', o === 'main')
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
 */
function dessinerCollision(): void {
  if (!edition.etat.montrerCollision || jeu.tourne) return
  const ctx = jeu.ecran.ctx
  const t = donjon.carte.tuile
  ctx.fillStyle = 'rgba(255, 90, 90, 0.28)'
  for (let cy = 0; cy < donjon.carte.hauteur; cy++) {
    for (let cx = 0; cx < donjon.carte.largeur; cx++) {
      if (!donjon.carte.solides[donjon.carte.index(cx, cy)]) continue
      ctx.fillRect(cx * t - Math.round(jeu.camera.x), cy * t - Math.round(jeu.camera.y), t, t)
    }
  }
  jeu.ecran.presenter()
}

function majEtat(): void {
  const c = edition.compter()
  verdict.textContent = `palette : ${palette.taille} couleurs · ${c.terrain} murs · ${c.solides} cases solides`
}

boutonJouer.addEventListener('click', () => {
  jeu.demarrer()
  boutonJouer.disabled = true
  boutonArreter.disabled = false
  canevas.classList.add('jeu')
  canevas.focus()
})
boutonArreter.addEventListener('click', () => {
  jeu.arreter()
  boutonJouer.disabled = false
  boutonArreter.disabled = true
  canevas.classList.remove('jeu')
  // On repose le heros a son depart : essayer une salle puis la modifier avec
  // le personnage coince dans un mur qu'on vient de peindre serait absurde.
  donjon.heros.x = donjon.depart.x
  donjon.heros.y = donjon.depart.y
  jeu.camera.x = 0
  jeu.camera.y = 0
  jeu.dessiner()
  dessinerCollision()
})

/* ------------------------------------------------------------------ */
/* L'export                                                            */
/* ------------------------------------------------------------------ */

const selectCible = document.getElementById('cible') as HTMLSelectElement
for (const c of CIBLES) {
  const o = document.createElement('option')
  o.value = c.id
  o.textContent = c.nom
  o.title = c.note
  selectCible.appendChild(o)
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

document.getElementById('exporter')?.addEventListener('click', () => {
  const cible = selectCible.value as Cible
  const p = serialiserProjet(
    'donjon', jeu.ecran.vue, palette,
    [{ nom: 'salle', carte: donjon.carte }],
    [{ nom: 'principale', racine: donjon.racine }],
  )
  telecharger('projet.json', versTexte(p), 'application/json')
  const fichier = CIBLES.find((c) => c.id === cible)?.fichier ?? 'projet.txt'
  telecharger(fichier, chargeur(cible, p), 'text/plain')
  verdict.textContent = `exporte : projet.json + ${fichier}`
})

// Une premiere image des l'ouverture : un ecran noir ne dit pas si la scene
// est chargee ou si quelque chose a echoue.
jeu.dessiner()

info.textContent = `320×180 · ×${jeu.ecran.echelle} · ${donjon.carte.largeur}×${donjon.carte.hauteur} tuiles`
majEtat()

let derniere = performance.now()
let images = 0
const rafraichirMesure = (): void => {
  images++
  const t = performance.now()
  if (t - derniere >= 500) {
    const fps = Math.round((images * 1000) / (t - derniere))
    mesure.textContent = jeu.tourne
      ? `${fps} img/s · pas ${jeu.pas} · échelle ×${jeu.ecran.echelle}`
      : `arrêté · échelle ×${jeu.ecran.echelle}`
    derniere = t
    images = 0
  }
  requestAnimationFrame(rafraichirMesure)
}
requestAnimationFrame(rafraichirMesure)

window.addEventListener('resize', () => {
  if (jeu.tourne) return
  jeu.dessiner()
  dessinerCollision()
})

// Pour les bancs : ils ont besoin d'une prise sur le jeu.
;(window as unknown as { pfe: unknown }).pfe = { jeu, donjon, palette, edition }
