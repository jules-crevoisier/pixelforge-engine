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
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>
  getFile(): Promise<{ text(): Promise<string> }>
}
export interface PoigneeDossier {
  name: string
  getFileHandle(nom: string, opts?: { create?: boolean }): Promise<PoigneeFichier>
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

export async function lire(d: PoigneeDossier, nom: string): Promise<string | null> {
  try {
    const f = await d.getFileHandle(nom)
    return await (await f.getFile()).text()
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
  const base = await ouvrirBase()
  await new Promise<void>((resoudre, rejeter) => {
    const t = base.transaction(MAGASIN, 'readwrite')
    t.objectStore(MAGASIN).put(d, CLEF)
    t.oncomplete = () => resoudre()
    t.onerror = () => rejeter(t.error)
  })
  base.close()
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
