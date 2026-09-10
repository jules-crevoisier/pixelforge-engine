/**
 * Un paquet ZIP, ecrit a la main.
 *
 * ## Pourquoi pas une bibliotheque
 *
 * Le depot n'a aucune dependance a l'execution, et ce n'est pas une pose : une
 * bibliotheque de compression pese plus lourd que tout le moteur de rendu, et
 * elle serait la pour une seule chose — mettre plusieurs fichiers dans un
 * seul. Un projet Godot fait une douzaine de fichiers ; les telecharger un par
 * un ferait douze fenetres de confirmation.
 *
 * ## Pourquoi on ne compresse pas
 *
 * Le format ZIP autorise le stockage sans compression, et c'est ce qu'on
 * emploie. Compresser demanderait deflate — soit une dependance, soit trois
 * cents lignes de code a eprouver. Un projet exporte est fait de texte et de
 * PNG (deja compresses) ; ce qu'on gagnerait ne vaut pas ce qu'on risquerait.
 * Le fichier est plus gros, il s'ouvre partout, et il s'ouvre correctement.
 */

/** Une entree du paquet : un chemin et son contenu. */
export interface Entree {
  /** Chemin dans l'archive, avec des barres obliques. Jamais de « .. ». */
  chemin: string
  contenu: Uint8Array
}

/** La table du CRC-32, calculee une fois. */
const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < octets.length; i++) c = TABLE[(c ^ octets[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function versOctets(texte: string): Uint8Array {
  return new TextEncoder().encode(texte)
}

/**
 * Assemble les entrees en une archive.
 *
 * Les dates sont figees a une valeur unique. Un ZIP dont l'horodatage change a
 * chaque export produit un fichier different a chaque fois, meme quand rien
 * n'a bouge : impossible de dire si un export a change quelque chose. Une date
 * fixe rend l'archive REPRODUCTIBLE, ce qui vaut mieux qu'une date exacte dont
 * personne ne se sert.
 */
export function zipper(entrees: Entree[]): Uint8Array {
  const HEURE = 0
  const DATE = 0x2821 // 1 janvier 2000, en date MS-DOS.

  const morceaux: Uint8Array[] = []
  const centrales: Uint8Array[] = []
  let decalage = 0

  for (const e of entrees) {
    const nom = versOctets(e.chemin)
    const crc = crc32(e.contenu)
    const taille = e.contenu.length

    const entete = new Uint8Array(30 + nom.length)
    const v = new DataView(entete.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true) // version minimale
    v.setUint16(6, 0, true) // aucun drapeau
    v.setUint16(8, 0, true) // methode : stockage
    v.setUint16(10, HEURE, true)
    v.setUint16(12, DATE, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, taille, true)
    v.setUint32(22, taille, true)
    v.setUint16(26, nom.length, true)
    v.setUint16(28, 0, true)
    entete.set(nom, 30)

    morceaux.push(entete, e.contenu)

    const centrale = new Uint8Array(46 + nom.length)
    const w = new DataView(centrale.buffer)
    w.setUint32(0, 0x02014b50, true)
    w.setUint16(4, 20, true) // version d'ecriture
    w.setUint16(6, 20, true)
    w.setUint16(8, 0, true)
    w.setUint16(10, 0, true)
    w.setUint16(12, HEURE, true)
    w.setUint16(14, DATE, true)
    w.setUint32(16, crc, true)
    w.setUint32(20, taille, true)
    w.setUint32(24, taille, true)
    w.setUint16(28, nom.length, true)
    w.setUint32(42, decalage, true)
    centrale.set(nom, 46)
    centrales.push(centrale)

    decalage += entete.length + taille
  }

  const tailleCentrale = centrales.reduce((n, c) => n + c.length, 0)
  const fin = new Uint8Array(22)
  const f = new DataView(fin.buffer)
  f.setUint32(0, 0x06054b50, true)
  f.setUint16(8, entrees.length, true)
  f.setUint16(10, entrees.length, true)
  f.setUint32(12, tailleCentrale, true)
  f.setUint32(16, decalage, true)

  const tout = [...morceaux, ...centrales, fin]
  const total = tout.reduce((n, m) => n + m.length, 0)
  const sortie = new Uint8Array(total)
  let i = 0
  for (const m of tout) { sortie.set(m, i); i += m.length }
  return sortie
}
