import type { ProjetSerialise } from './format.ts'
import { versTexte } from './format.ts'
import type { Entree } from './paquet.ts'

/**
 * Le jeu livrable : la page web autoporteuse, et le paquet de bureau.
 *
 * ## Une seule injection, deux sorties
 *
 * L'export « Jeu web » et le paquet « Bureau » emballent la MEME page — le
 * gabarit commis dans public/jeu/, avec le projet inline. L'injection vit
 * donc ici, une fois : deux copies auraient fini par echapper le JSON de
 * deux facons differentes, et l'une des deux aurait casse un jour sur un
 * projet contenant « </script » dans un dialogue.
 */

export const EMPLACEMENT_PROJET = '<script id="projet" type="application/json"></script>'

/**
 * La page de jeu complete : le gabarit, le projet dedans. Null si le
 * gabarit n'a pas l'emplacement — un gabarit d'une autre epoque, et
 * l'appelant doit le DIRE plutot que livrer une page vide.
 */
export function pageDeJeu(gabarit: string, p: ProjetSerialise): string | null {
  if (!gabarit.includes(EMPLACEMENT_PROJET)) return null
  // « </ » fermerait la balise du script en plein JSON ; l'echappement est
  // neutre en JSON comme en JavaScript.
  const inline = versTexte(p).replace(/<\//g, '<\\/')
  return gabarit.replace(EMPLACEMENT_PROJET,
    `<script id="projet" type="application/json">${inline}</script>`)
}

/**
 * Le paquet de bureau : la page de jeu, et l'echafaudage Electron qui en
 * fait un binaire Linux, Windows ou macOS.
 *
 * ## Pourquoi Electron, et pourquoi un ECHAFAUDAGE
 *
 * Le jeu est du web : l'emballer dans un navigateur embarque est le chemin
 * le plus court vers un exécutable, et Electron ne demande que Node — pas
 * de chaine Rust, pas de SDK par plateforme. Et c'est un echafaudage a
 * compiler CHEZ SOI : un editeur dans un navigateur ne peut pas produire un
 * .exe — pretendre le contraire serait un bouton qui ment. Le LISEZMOI dit
 * exactement quoi taper, et ce que chaque commande produit.
 */
export function paquetBureau(p: ProjetSerialise, pageJeu: string): Entree[] {
  const nom = (p.nom || 'jeu').replace(/\.json$/i, '')
  const paquet = {
    name: nom.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'jeu',
    productName: nom,
    version: '1.0.0',
    private: true,
    main: 'main.cjs',
    scripts: {
      jouer: 'electron .',
      construire: 'electron-builder',
    },
    devDependencies: {
      electron: '^33.0.0',
      'electron-builder': '^25.0.0',
    },
    build: {
      appId: `pixelforge.${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      files: ['main.cjs', 'index.html'],
      linux: { target: 'AppImage', category: 'Game' },
      win: { target: 'portable' },
      mac: { target: 'zip', category: 'public.app-category.games' },
    },
  }
  const main = `// La fenetre du jeu, et rien d'autre.
const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  const fenetre = new BrowserWindow({
    width: ${Math.max(320, (p.vue?.largeur ?? 320) * 3)},
    height: ${Math.max(180, (p.vue?.hauteur ?? 180) * 3)},
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
  })
  fenetre.loadFile('index.html')
})

app.on('window-all-closed', () => app.quit())
`
  const lisezmoi = `# ${nom} — jeu de bureau

Le jeu est la page \`index.html\` : elle marche déjà telle quelle dans un
navigateur. Ce dossier l'emballe en application de bureau avec Electron.

## Jouer tout de suite

    npm install
    npm run jouer

## Construire les binaires

    npm run construire

Les fichiers sortent dans \`dist/\` :

- **Linux** : un AppImage — exécutable directement.
- **Windows** : un .exe portable. Il se construit le mieux DEPUIS Windows ;
  depuis Linux, electron-builder passe par Wine s'il est installé.
- **macOS** : une archive .zip de l'application — depuis un Mac seulement,
  et la signature est votre affaire.

Chaque système construit le mieux le sien : c'est une limite d'Electron et
des formats d'installeurs, pas un oubli. Node 18 ou plus récent est requis.
`
  const octets = (t: string): Uint8Array => new TextEncoder().encode(t)
  return [
    { chemin: 'index.html', contenu: octets(pageJeu) },
    { chemin: 'main.cjs', contenu: octets(main) },
    { chemin: 'package.json', contenu: octets(`${JSON.stringify(paquet, null, 2)}\n`) },
    { chemin: 'LISEZMOI.md', contenu: octets(lisezmoi) },
  ]
}
