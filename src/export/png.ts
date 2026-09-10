import { crc32 } from './paquet.ts'

/**
 * Un encodeur PNG, en une centaine de lignes.
 *
 * ## Pourquoi ne pas passer par le canevas
 *
 * `canvas.toBlob` rend un PNG, et c'est ce qu'on ferait dans un navigateur.
 * Mais l'export doit etre EPROUVE, et un banc qui tourne en Node pur n'a pas
 * de canevas. Un encodeur ecrit ici se verifie sans navigateur, rend le meme
 * fichier partout, et ne depend d'aucune option d'un moteur de rendu — le
 * canevas, lui, peut premultiplier l'alpha et changer les couleurs a demi
 * transparentes.
 *
 * ## Pourquoi on ne compresse pas non plus
 *
 * Le flux zlib d'un PNG peut n'etre fait que de blocs STOCKES : c'est prevu
 * par le format, et tout lecteur les accepte. Ecrire deflate demanderait trois
 * cents lignes de plus a eprouver, pour des planches de quelques kilo-octets
 * qui vivront dans un ZIP. Le fichier est plus gros, il s'ouvre partout.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function morceau(type: string, donnees: Uint8Array): Uint8Array {
  const nom = new TextEncoder().encode(type)
  const out = new Uint8Array(12 + donnees.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, donnees.length, false)
  out.set(nom, 4)
  out.set(donnees, 8)
  // Le CRC couvre le TYPE et les donnees, pas la longueur. C'est la faute la
  // plus courante quand on ecrit un PNG a la main, et elle rend le fichier
  // illisible sans rien expliquer.
  const couvert = new Uint8Array(4 + donnees.length)
  couvert.set(nom, 0)
  couvert.set(donnees, 4)
  v.setUint32(8 + donnees.length, crc32(couvert), false)
  return out
}

function adler32(d: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < d.length; i++) {
    a = (a + d[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** Un flux zlib fait de blocs stockes : prevu par le format, lu partout. */
function zlibStocke(donnees: Uint8Array): Uint8Array {
  const MAX = 65535
  const blocs: Uint8Array[] = []
  for (let i = 0; i < donnees.length || i === 0; i += MAX) {
    const part = donnees.subarray(i, Math.min(i + MAX, donnees.length))
    const dernier = i + MAX >= donnees.length ? 1 : 0
    const b = new Uint8Array(5 + part.length)
    b[0] = dernier
    b[1] = part.length & 0xff
    b[2] = (part.length >> 8) & 0xff
    b[3] = ~part.length & 0xff
    b[4] = (~part.length >> 8) & 0xff
    b.set(part, 5)
    blocs.push(b)
    if (dernier) break
  }
  const corps = blocs.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(2 + corps + 4)
  out[0] = 0x78
  out[1] = 0x01
  let i = 2
  for (const b of blocs) { out.set(b, i); i += b.length }
  new DataView(out.buffer).setUint32(i, adler32(donnees), false)
  return out
}

/**
 * Encode une image RGBA en PNG.
 *
 * `pixels` fait quatre octets par pixel, ligne par ligne.
 */
export function encoderPng(largeur: number, hauteur: number, pixels: Uint8Array): Uint8Array {
  if (pixels.length !== largeur * hauteur * 4) {
    throw new Error(`${pixels.length} octets pour ${largeur}x${hauteur} : il en faut ${largeur * hauteur * 4}`)
  }
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, largeur, false)
  v.setUint32(4, hauteur, false)
  ihdr[8] = 8 // huit bits par canal
  ihdr[9] = 6 // couleur vraie avec alpha
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Chaque rangee est precedee de son octet de filtre. Zero : aucun filtre.
  // Les filtres servent la compression ; on ne compresse pas.
  const brut = new Uint8Array(hauteur * (1 + largeur * 4))
  for (let y = 0; y < hauteur; y++) {
    brut[y * (1 + largeur * 4)] = 0
    brut.set(pixels.subarray(y * largeur * 4, (y + 1) * largeur * 4), y * (1 + largeur * 4) + 1)
  }

  const parties = [
    new Uint8Array(SIGNATURE),
    morceau('IHDR', ihdr),
    morceau('IDAT', zlibStocke(brut)),
    morceau('IEND', new Uint8Array(0)),
  ]
  const total = parties.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let i = 0
  for (const p of parties) { out.set(p, i); i += p.length }
  return out
}

/**
 * Peint une planche en lettres dans un tampon RGBA.
 *
 * C'est le meme parcours que `atlasDepuisLettres`, sans canevas : une lettre
 * par couleur, le point pour le vide, les cases rangees par colonnes.
 */
export function planchePixels(
  dessins: string[][], cle: Record<string, string>,
  largeurCase: number, hauteurCase: number, colonnes: number,
): { largeur: number; hauteur: number; pixels: Uint8Array } {
  const lignes = Math.max(1, Math.ceil(dessins.length / colonnes))
  const largeur = colonnes * largeurCase
  const hauteur = lignes * hauteurCase
  const pixels = new Uint8Array(largeur * hauteur * 4)

  dessins.forEach((dessin, i) => {
    const ox = (i % colonnes) * largeurCase
    const oy = Math.floor(i / colonnes) * hauteurCase
    for (let y = 0; y < dessin.length; y++) {
      const ligne = dessin[y]
      for (let x = 0; x < ligne.length; x++) {
        const hex = cle[ligne[x]]
        if (!hex) continue
        const c = lireHex(hex)
        const p = ((oy + y) * largeur + ox + x) * 4
        pixels[p] = c[0]
        pixels[p + 1] = c[1]
        pixels[p + 2] = c[2]
        pixels[p + 3] = 255
      }
    }
  })
  return { largeur, hauteur, pixels }
}

function lireHex(hex: string): [number, number, number] {
  const s = hex.replace('#', '')
  const court = s.length === 3
  const n = (i: number): number =>
    parseInt(court ? s[i] + s[i] : s.slice(i * 2, i * 2 + 2), 16)
  return [n(0), n(1), n(2)]
}
