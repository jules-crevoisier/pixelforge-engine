import { son, type Son, Sonneur } from '../runtime/son.ts'

/**
 * La banque de sons de la demonstration.
 *
 * ## Comment on regle un son sans l'entendre
 *
 * On ne le regle pas : on part de ce que le son DIT. Un saut monte — la
 * frequence va de bas en haut. Une chute descend. Un coup est court, bruite,
 * et n'a pas de hauteur. Un ramassage est une petite montee claire, deux
 * notes. Une mort est une longue descente. Ces formes-la sont celles de tous
 * les jeux de cette epoque parce qu'elles sont celles que l'oreille comprend
 * sans qu'on les lui apprenne.
 *
 * ## Pourquoi des paliers d'un demi-ton
 *
 * Un glissando continu sonne comme une sirene ; par paliers, il sonne comme
 * une puce sonore. C'est le meme choix que l'echelle entiere a l'ecran : la
 * contrainte fait le style, elle ne l'appauvrit pas.
 */
export const SONS_DEMO: Son[] = [
  // Le pas : court, sourd, presque inaudible seul. Un bruit de pas qu'on
  // remarque devient insupportable au bout de trente secondes de marche.
  son('pas', {
    forme: 'bruit', frequence: 180, duree: 45, volume: 0.10, attaque: 1, chute: 30,
  }),
  // Le saut monte. C'est la seule chose que le son doit dire.
  son('saut', {
    forme: 'carre', frequence: 300, frequenceFin: 620, duree: 120,
    volume: 0.16, chute: 60, paliers: 1,
  }),
  son('atterrissage', {
    forme: 'bruit', frequence: 140, duree: 60, volume: 0.12, chute: 45,
  }),
  // Le coup : bruite et bref. Une hauteur le rendrait musical, donc doux.
  son('coup', {
    forme: 'bruit', frequence: 900, duree: 90, volume: 0.20, chute: 70,
  }),
  // Toucher : une note franche, descendante, pour que le joueur sache que
  // c'est LUI qui a pris.
  son('touche', {
    forme: 'scie', frequence: 420, frequenceFin: 160, duree: 200,
    volume: 0.22, chute: 120, paliers: 1,
  }),
  son('abattu', {
    forme: 'carre', frequence: 520, frequenceFin: 120, duree: 180,
    volume: 0.18, chute: 110, paliers: 1,
  }),
  // La mort : longue et descendante. La duree fait le poids.
  son('mort', {
    forme: 'triangle', frequence: 440, frequenceFin: 80, duree: 700,
    volume: 0.26, chute: 400, paliers: 1,
  }),
  // Le ramassage monte, franchement. C'est la recompense.
  son('ramasse', {
    forme: 'triangle', frequence: 660, frequenceFin: 1320, duree: 160,
    volume: 0.20, chute: 90, paliers: 1,
  }),
  son('balise', {
    forme: 'triangle', frequence: 520, frequenceFin: 1040, duree: 320,
    volume: 0.22, chute: 200, paliers: 1,
  }),
  son('tir', {
    forme: 'scie', frequence: 700, frequenceFin: 240, duree: 140,
    volume: 0.14, chute: 90, paliers: 1,
  }),
  // Les sons d'interface : courts, secs, et plus aigus que le jeu — pour
  // qu'ils ne se confondent pas avec ce qui se passe dans le monde.
  son('menu', {
    forme: 'carre', frequence: 880, duree: 40, volume: 0.12, chute: 30, paliers: 1,
  }),
  son('valider', {
    forme: 'carre', frequence: 880, frequenceFin: 1320, duree: 90,
    volume: 0.16, chute: 60, paliers: 1,
  }),
  son('texte', {
    forme: 'carre', frequence: 1100, duree: 18, volume: 0.05, attaque: 1, chute: 14,
  }),
]

/**
 * Ce que le navigateur fait d'un son.
 *
 * Dix lignes, aucune decision : la synthese est ailleurs, et c'est elle qui
 * est eprouvee. Ici on remplit un tampon et on le lit.
 *
 * Le contexte est cree PARESSEUSEMENT, au premier son : un navigateur refuse
 * d'ouvrir l'audio avant qu'on ait clique quelque part, et un contexte ouvert
 * au chargement reste suspendu pour toujours sans rien dire.
 */
export function brancherAudio(sonneur: Sonneur, rendre: (s: import('../runtime/son.ts').Son, taux: number) => Float32Array): () => void {
  type Fabrique = new () => AudioContext
  const F = (globalThis as unknown as { AudioContext?: Fabrique; webkitAudioContext?: Fabrique })
  const Classe = F.AudioContext ?? F.webkitAudioContext
  if (!Classe) return () => {}
  let ctx: AudioContext | null = null
  const cache = new Map<string, AudioBuffer>()

  sonneur.sortie = (s, volume) => {
    if (!ctx) ctx = new Classe()
    if (ctx.state === 'suspended') void ctx.resume()
    let tampon = cache.get(s.nom)
    if (!tampon) {
      const echantillons = rendre(s, ctx.sampleRate)
      tampon = ctx.createBuffer(1, echantillons.length, ctx.sampleRate)
      tampon.getChannelData(0).set(echantillons)
      cache.set(s.nom, tampon)
    }
    const source = ctx.createBufferSource()
    source.buffer = tampon
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(gain).connect(ctx.destination)
    source.start()
  }
  return () => { sonneur.sortie = null; void ctx?.close(); ctx = null }
}

export const sonneurDemo = (): Sonneur => new Sonneur(SONS_DEMO)
