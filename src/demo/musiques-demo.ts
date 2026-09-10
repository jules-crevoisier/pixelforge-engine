import { musique, voie, type Musique } from '../runtime/musique.ts'
import { son } from '../runtime/son.ts'

/**
 * Les musiques de la demonstration.
 *
 * ## Comment on ecrit une musique sans l'entendre
 *
 * On ne l'invente pas : on part d'une SUITE D'ACCORDS qui a fait ses preuves,
 * et l'on pose la melodie dessus. La caverne emploie un la mineur — la tonalite
 * de tout ce qui est souterrain depuis quarante ans — et une basse qui marche
 * en croches, ce qui donne l'avancee sans rien demander a la melodie.
 *
 * Le titre est en do majeur, plus lent, avec des blanches : c'est ce qui
 * distingue un ecran d'attente d'un niveau. Un theme de titre rapide donne
 * envie d'appuyer avant d'avoir lu le menu.
 *
 * ## Pourquoi trois voies et pas plus
 *
 * Melodie, basse, percussion. C'est ce qu'avaient les machines de l'epoque, et
 * ce n'est pas une contrainte subie : au-dela, il faut un mixage, et un mixage
 * mal fait s'entend plus qu'une voie manquante.
 */

/** Le timbre de la melodie : carre, court, franc. */
const CHANT = son('chant', { forme: 'carre', volume: 0.34, attaque: 3, chute: 90, paliers: 0 })
/** La basse : triangle, plus douce, plus longue. */
const BASSE = son('basse', { forme: 'triangle', volume: 0.42, attaque: 2, chute: 110 })
/** La percussion : du bruit, tres court. */
const TAMBOUR = son('tambour', { forme: 'bruit', volume: 0.30, attaque: 1, chute: 55 })

/**
 * La caverne : la mineur, seize temps, qui tourne.
 *
 * La melodie descend puis remonte : une melodie qui ne fait que descendre
 * s'entend comme une fin, et une musique de niveau ne doit jamais sonner comme
 * une fin.
 */
export const CAVERNE = musique('caverne', {
  tempo: 132,
  voies: [
    voie([
      'la4', '-', 'do5', '-', 'mi5', '-', 're5', '-',
      'do5', '-', 'la4', '-', 'si4', '-', '.', '-',
      'sol4', '-', 'si4', '-', 're5', '-', 'do5', '-',
      'si4', '-', 'sol4', '-', 'la4', '-', '-', '-',
    ], { timbre: CHANT, volume: 0.55 }),
    voie([
      'la2', 'la3', 'la2', 'la3', 'fa2', 'fa3', 'fa2', 'fa3',
      'do3', 'do4', 'do3', 'do4', 'mi2', 'mi3', 'mi2', 'mi3',
      'sol2', 'sol3', 'sol2', 'sol3', 'mi2', 'mi3', 'mi2', 'mi3',
      'fa2', 'fa3', 'fa2', 'fa3', 'mi2', 'mi3', 'mi2', 'mi3',
    ], { timbre: BASSE, volume: 0.5 }),
    voie([
      'do3', '.', '.', 'do3', '.', '.', 'do3', '.',
      'do3', '.', '.', 'do3', '.', '.', 'do3', '.',
      'do3', '.', '.', 'do3', '.', '.', 'do3', '.',
      'do3', '.', '.', 'do3', '.', 'do3', 'do3', '.',
    ], { timbre: TAMBOUR, volume: 0.4 }),
  ],
})

/** Le titre : do majeur, lent, en blanches. On attend, on ne court pas. */
export const TITRE = musique('titre', {
  tempo: 84,
  voies: [
    voie([
      'do5', '-', '-', '-', 'mi5', '-', '-', '-',
      'sol5', '-', '-', '-', 'mi5', '-', '-', '-',
      'fa5', '-', '-', '-', 'mi5', '-', '-', '-',
      're5', '-', '-', '-', '-', '-', '-', '-',
    ], { timbre: CHANT, volume: 0.5 }),
    voie([
      'do3', '-', '-', '-', 'do3', '-', '-', '-',
      'la2', '-', '-', '-', 'la2', '-', '-', '-',
      'fa2', '-', '-', '-', 'fa2', '-', '-', '-',
      'sol2', '-', '-', '-', 'sol2', '-', '-', '-',
    ], { timbre: BASSE, volume: 0.5 }),
  ],
})

export const MUSIQUES_DEMO: Musique[] = [CAVERNE, TITRE]

/**
 * Ce que le navigateur fait d'une musique.
 *
 * Elle est rendue UNE FOIS puis bouclee par l'audio du navigateur, au lieu
 * d'etre resynthetisee a chaque tour : trente secondes de musique coutent une
 * seconde a fabriquer, et la refabriquer en boucle ferait hoqueter le jeu a
 * chaque reprise. On paie une fois, on garde.
 */
export function brancherMusique(
  musicien: { sortie: ((m: Musique, v: number) => void) | null; arret: (() => void) | null },
  rendreMusique: (m: Musique, taux: number) => Float32Array,
): () => void {
  type Fabrique = new () => AudioContext
  const F = globalThis as unknown as { AudioContext?: Fabrique; webkitAudioContext?: Fabrique }
  const Classe = F.AudioContext ?? F.webkitAudioContext
  if (!Classe) return () => {}
  let ctx: AudioContext | null = null
  let source: AudioBufferSourceNode | null = null
  const cache = new Map<string, AudioBuffer>()

  musicien.arret = () => {
    try { source?.stop() } catch { /* deja arretee */ }
    source = null
  }
  musicien.sortie = (m, volume) => {
    if (!ctx) ctx = new Classe()
    if (ctx.state === 'suspended') void ctx.resume()
    // On n'arrete pas ici : `jouer` l'a deja fait s'il y avait de quoi. Le
    // faire aussi rendrait l'arret dependant de l'ordre des deux appels, et
    // masquerait ici un `jouer` qui aurait oublie de couper la precedente.
    let tampon = cache.get(m.nom)
    if (!tampon) {
      const e = rendreMusique(m, ctx.sampleRate)
      tampon = ctx.createBuffer(1, e.length, ctx.sampleRate)
      tampon.getChannelData(0).set(e)
      cache.set(m.nom, tampon)
    }
    const s = ctx.createBufferSource()
    s.buffer = tampon
    s.loop = m.boucle
    const gain = ctx.createGain()
    gain.gain.value = volume
    s.connect(gain).connect(ctx.destination)
    s.start()
    source = s
  }
  return () => { musicien.arret?.(); void ctx?.close(); ctx = null }
}
