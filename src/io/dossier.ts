/**
 * Le dossier de travail du projet.
 *
 * ## Pourquoi un dossier et non un fichier
 *
 * Un projet de jeu n'est pas un document : c'est un projet.json, des planches,
 * demain des scripts et des cartes separees. Demander un dossier une fois vaut
 * mieux que demander un fichier a chaque enregistrement, et c'est ce qui
 * permettra plus tard d'ecrire plusieurs fichiers sans redemander.
 *
 * ## Ce qui n'existe que dans certains navigateurs
 *
 * `showDirectoryPicker` n'est pas partout. On ne fait pas semblant : quand
 * l'API manque, l'editeur bascule sur le telechargement et le champ de
 * fichier, et il le DIT. Un bouton qui ne fait rien sans expliquer pourquoi
 * est pire qu'un bouton absent.
 *
 * ## Pourquoi la permission se redemande
 *
 * Un navigateur oublie l'autorisation d'ecrire entre deux sessions, meme s'il
 * garde la reference au dossier. On la reverifie donc avant chaque ecriture :
 * sans cela, le premier enregistrement apres un rechargement echoue en
 * silence, et l'on croit avoir enregistre.
 */

/* Les types de l'API des fichiers ne sont pas dans la bibliotheque standard de
 * TypeScript. On declare le strict necessaire plutot que d'ajouter une
 * dependance de types pour cinq methodes. */
interface PoigneeFichier {
  createWritable(): Promise<{
    write(d: string | Uint8Array): Promise<void>
    close(): Promise<void>
  }>
  // Un vrai File : le panneau des fichiers importe des images du dossier,
  // et une image se lit en octets, pas en texte.
  getFile(): Promise<File>
}
export interface PoigneeDossier {
  name: string
  getFileHandle(nom: string, opts?: { create?: boolean }): Promise<PoigneeFichier>
  getDirectoryHandle?(nom: string, opts?: { create?: boolean }): Promise<PoigneeDossier>
  values(): AsyncIterable<{ kind: string; name: string }>
  queryPermission?(o: { mode: string }): Promise<string>
  requestPermission?(o: { mode: string }): Promise<string>
}

type FenetreFichiers = Window & {
  showDirectoryPicker?: (o?: { mode?: string }) => Promise<PoigneeDossier>
}

export const disponible = (): boolean =>
  typeof window !== 'undefined' && typeof (window as FenetreFichiers).showDirectoryPicker === 'function'

export async function choisirDossier(): Promise<PoigneeDossier | null> {
  const f = window as FenetreFichiers
  if (!f.showDirectoryPicker) return null
  try {
    return await f.showDirectoryPicker({ mode: 'readwrite' })
  } catch {
    // L'annulation leve : ce n'est pas une faute, c'est un choix.
    return null
  }
}

/** Verifie — et redemande si besoin — le droit d'ecrire dans ce dossier. */
export async function autorise(d: PoigneeDossier): Promise<boolean> {
  if (!d.queryPermission) return true
  if (await d.queryPermission({ mode: 'readwrite' }) === 'granted') return true
  if (!d.requestPermission) return false
  return await d.requestPermission({ mode: 'readwrite' }) === 'granted'
}

export async function ecrire(d: PoigneeDossier, nom: string, contenu: string): Promise<void> {
  if (!await autorise(d)) throw new Error(`Écriture refusée dans « ${d.name} ».`)
  const f = await d.getFileHandle(nom, { create: true })
  const w = await f.createWritable()
  await w.write(contenu)
  await w.close()
}

/** La meme chose, pour du binaire : une archive, une image. */
export async function ecrireOctets(
  d: PoigneeDossier, nom: string, octets: Uint8Array,
): Promise<void> {
  if (!await autorise(d)) throw new Error(`Écriture refusée dans « ${d.name} ».`)
  const f = await d.getFileHandle(nom, { create: true })
  const w = await f.createWritable()
  await w.write(octets)
  await w.close()
}

export async function lire(d: PoigneeDossier, nom: string): Promise<string | null> {
  try {
    const f = await d.getFileHandle(nom)
    return await (await f.getFile()).text()
  } catch {
    return null
  }
}

/**
 * Le fichier lui-meme, pour ce qui ne se lit pas en texte : une image a
 * importer, un projet de sprites. Null si le fichier n'existe pas ou plus —
 * le dossier a pu changer sous nos pieds, et ce n'est pas une faute.
 */
export async function lireFichier(d: PoigneeDossier, nom: string): Promise<File | null> {
  try {
    const f = await d.getFileHandle(nom)
    return await f.getFile()
  } catch {
    return null
  }
}

export async function lister(d: PoigneeDossier, suffixe = '.json'): Promise<string[]> {
  const noms: string[] = []
  for await (const e of d.values()) {
    if (e.kind === 'file' && e.name.endsWith(suffixe)) noms.push(e.name)
  }
  return noms.sort()
}

/**
 * Le sous-dossier nomme — cree au besoin quand on va y ecrire. Null quand
 * l'API manque ou que le sous-dossier n'existe pas et qu'on ne le cree pas.
 */
async function sousDossier(
  d: PoigneeDossier, nom: string, creer: boolean,
): Promise<PoigneeDossier | null> {
  if (!d.getDirectoryHandle) return null
  try {
    return await d.getDirectoryHandle(nom, { create: creer })
  } catch {
    return null
  }
}

/** Ecrit `sous/nom` — le sous-dossier nait au besoin. */
export async function ecrireSous(
  d: PoigneeDossier, sous: string, nom: string, contenu: string,
): Promise<void> {
  const dedans = await sousDossier(d, sous, true)
  if (!dedans) throw new Error(`« ${d.name}/${sous} » est hors d'atteinte.`)
  await ecrire(dedans, nom, contenu)
}

/** Les fichiers de `sous/`, ou rien si le sous-dossier n'existe pas. */
export async function listerSous(
  d: PoigneeDossier, sous: string, suffixe = '',
): Promise<string[]> {
  const dedans = await sousDossier(d, sous, false)
  return dedans ? lister(dedans, suffixe) : []
}

/** Le texte de `sous/nom`, ou null. */
export async function lireSous(
  d: PoigneeDossier, sous: string, nom: string,
): Promise<string | null> {
  const dedans = await sousDossier(d, sous, false)
  return dedans ? lire(dedans, nom) : null
}

/* ------------------------------------------------------------------ */
/* Se souvenir du dossier d'une session a l'autre                      */
/* ------------------------------------------------------------------ */

const BASE = 'pixelforge-engine'
const MAGASIN = 'dossiers'
const CLEF = 'travail'

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const r = indexedDB.open(BASE, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore(MAGASIN) }
    r.onsuccess = () => resoudre(r.result)
    r.onerror = () => rejeter(r.error)
  })
}

/**
 * Range la poignee du dossier.
 *
 * IndexedDB et non `localStorage` : une poignee de dossier n'est pas une
 * chaine, elle ne survit pas a `JSON.stringify`. C'est la seule raison, et
 * elle suffit.
 */
export async function memoriser(d: PoigneeDossier): Promise<void> {
  // Ne jamais casser le CHOIX du dossier parce que le souvenir echoue : une
  // poignee qui ne se clone pas (un faux dossier de banc, un navigateur
  // restrictif) donne un dossier qui marche cette session-ci, sans plus.
  try {
    const base = await ouvrirBase()
    await new Promise<void>((resoudre, rejeter) => {
      const t = base.transaction(MAGASIN, 'readwrite')
      t.objectStore(MAGASIN).put(d, CLEF)
      t.oncomplete = () => resoudre()
      t.onerror = () => rejeter(t.error)
    })
    base.close()
  } catch { /* la session vivra sans souvenir */ }
}

export async function rappeler(): Promise<PoigneeDossier | null> {
  try {
    const base = await ouvrirBase()
    const d = await new Promise<PoigneeDossier | null>((resoudre) => {
      const t = base.transaction(MAGASIN, 'readonly')
      const r = t.objectStore(MAGASIN).get(CLEF)
      r.onsuccess = () => resoudre((r.result as PoigneeDossier) ?? null)
      r.onerror = () => resoudre(null)
    })
    base.close()
    return d
  } catch {
    return null
  }
}

/** Telecharge un fichier : le recours quand il n'y a pas de dossier. */
export function telecharger(nom: string, contenu: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Telecharge du binaire : une archive, une image. */
export function telechargerOctets(nom: string, octets: Uint8Array, type = 'application/zip'): void {
  // `slice()` : le Blob veut un ArrayBuffer bien a lui, et un Uint8Array peut
  // etre une vue sur un tampon plus grand.
  const url = URL.createObjectURL(new Blob([octets.slice().buffer as ArrayBuffer], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Demande un fichier a l'ancienne, par un champ de saisie. */
export function demanderFichier(accepte = '.json'): Promise<{ nom: string; texte: string } | null> {
  return new Promise((resoudre) => {
    const i = document.createElement('input')
    i.type = 'file'
    i.accept = accepte
    i.addEventListener('change', () => {
      const f = i.files?.[0]
      if (!f) { resoudre(null); return }
      f.text().then((texte) => resoudre({ nom: f.name, texte })).catch(() => resoudre(null))
    })
    i.click()
  })
}
