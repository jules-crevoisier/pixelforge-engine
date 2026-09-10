/**
 * Ecrire un son en fichier WAV.
 *
 * ## Pourquoi le format le plus bete du monde
 *
 * Un WAV non compresse tient en quarante-quatre octets d'en-tete et des
 * entiers de seize bits. Aucune bibliotheque, aucune dependance, et TOUS les
 * moteurs le lisent — Godot, Unity, un navigateur, un lecteur du systeme.
 * Un format compresse pesserait dix fois moins et demanderait un encodeur de
 * plusieurs milliers de lignes, pour des sons qui durent un dixieme de
 * seconde.
 *
 * ## Pourquoi l'export en a besoin, alors que le projet non
 *
 * Le projet garde les sons en DONNEES — six nombres — et c'est le bon choix :
 * ca se relit, ca se diffe, ca se regle. Mais Godot ne sait pas synthetiser
 * une onde carree ; il sait lire un fichier. L'export doit donc TRADUIRE, et
 * c'est exactement ce que fait l'export des planches, qui rend des PNG la ou
 * le projet garde des lettres.
 *
 * On garde les deux : le fichier de projet part aussi dans l'archive, si bien
 * qu'un aller-retour reste possible.
 */

/** Le WAV, en seize bits, une voie. */
export function encoderWav(
  echantillons: Float32Array, tauxEchantillon = 44100,
): Uint8Array {
  const n = echantillons.length
  const octets = new Uint8Array(44 + n * 2)
  const vue = new DataView(octets.buffer)

  const texte = (position: number, s: string): void => {
    for (let i = 0; i < s.length; i++) octets[position + i] = s.charCodeAt(i)
  }
  texte(0, 'RIFF')
  vue.setUint32(4, 36 + n * 2, true)
  texte(8, 'WAVE')
  texte(12, 'fmt ')
  vue.setUint32(16, 16, true)
  // 1 : entiers non compresses. C'est le seul format que tout le monde lit
  // sans exception, et le seul qu'on puisse ecrire sans bibliotheque.
  vue.setUint16(20, 1, true)
  vue.setUint16(22, 1, true)
  vue.setUint32(24, tauxEchantillon, true)
  vue.setUint32(28, tauxEchantillon * 2, true)
  vue.setUint16(32, 2, true)
  vue.setUint16(34, 16, true)
  texte(36, 'data')
  vue.setUint32(40, n * 2, true)

  for (let i = 0; i < n; i++) {
    // On BORNE avant de convertir : un echantillon a 1,2 deviendrait -26000
    // par debordement, c'est-a-dire un craquement violent au milieu du son.
    const v = Math.max(-1, Math.min(1, echantillons[i]))
    // 32767 et non 32768 : le maximum d'un entier signe de seize bits. Un
    // pixel de plus et l'on repasse par le negatif.
    vue.setInt16(44 + i * 2, Math.round(v * 32767), true)
  }
  return octets
}
