import { Jeu } from '../runtime/jeu.ts'
import { atlasDepuisLettres, couleursDe } from '../runtime/atlas.ts'
import { construireDonjon } from '../demo/donjon.ts'
import {
  TUILE, CLE_DONJON, CLE_HEROS, PLANCHE_DONJON, PLANCHE_HEROS,
  DIR_BAS, DIR_HAUT, DIR_DROITE, DIR_GAUCHE,
} from '../demo/art.ts'
import { Palette, depuisHex } from '../noyau/palette.ts'
import type { NoeudCorps, NoeudSprite } from '../scene/noeud.ts'

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

boutonJouer.addEventListener('click', () => {
  jeu.demarrer()
  boutonJouer.disabled = true
  boutonArreter.disabled = false
  canevas.focus()
})
boutonArreter.addEventListener('click', () => {
  jeu.arreter()
  boutonJouer.disabled = false
  boutonArreter.disabled = true
})

// Une premiere image des l'ouverture : un ecran noir ne dit pas si la scene
// est chargee ou si quelque chose a echoue.
jeu.dessiner()

info.textContent = `320×180 · ×${jeu.ecran.echelle} · ${donjon.carte.largeur}×${donjon.carte.hauteur} tuiles`
verdict.textContent = `palette : ${palette.taille} couleurs`

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

window.addEventListener('resize', () => { if (!jeu.tourne) jeu.dessiner() })

// Pour les bancs : ils ont besoin d'une prise sur le jeu.
;(window as unknown as { pfe: unknown }).pfe = { jeu, donjon, palette }
