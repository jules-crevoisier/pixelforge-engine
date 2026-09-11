#!/usr/bin/env node
/**
 * Fabrique le GABARIT du jeu web : une seule page autoporteuse.
 *
 * ## Pourquoi un artefact commis, comme `le-gouffre.json`
 *
 * L'export « Jeu web » doit marcher DANS l'editeur, y compris servi par le
 * serveur de developpement : il emballe le gabarit avec le projet. Or le
 * gabarit est un BUILD — le runtime empaquete en un fichier — et l'editeur
 * ne peut pas builder depuis le navigateur. On le fabrique donc ici, on le
 * commet dans `public/jeu/`, et un banc verifie qu'il n'est pas perime en
 * le refabriquant : la meme regle que pour l'exemple du Gouffre.
 *
 * ## Pourquoi UNE page
 *
 * Un fichier = un jeu. La page exportee s'ouvre en double-clic, sans
 * serveur, et se depose telle quelle sur itch.io. Le style, le script et —
 * a l'export — le projet vivent dedans. C'est le meme choix que le projet
 * en un seul fichier, pour la meme raison : ce qui tient en un fichier ne
 * se perd pas en route.
 */
import { build } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
// `--sortie chemin` : le banc de fraicheur refabrique AILLEURS et compare
// au gabarit commis — la meme regle que pour l'exemple du Gouffre.
const iSortie = process.argv.indexOf('--sortie')
const SORTIE = iSortie >= 0 ? process.argv[iSortie + 1] : join(RACINE, 'public', 'jeu', 'gabarit.html')
const CHANTIER = join(RACINE, `dist-joueur-${process.pid}`)

await build({
  configFile: false,
  root: RACINE,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: CHANTIER,
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: join(RACINE, 'joueur.html'),
      output: { inlineDynamicImports: true },
    },
  },
})

let page = readFileSync(join(CHANTIER, 'joueur.html'), 'utf8')

// Inline le script et la feuille de style : le gabarit doit tenir SEUL.
page = page.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+)"[^>]*><\/script>/, (_, chemin) => {
  const js = readFileSync(join(CHANTIER, chemin), 'utf8')
    // « </script » dans une chaine du bundle fermerait la page en plein
    // milieu ; l'echappement est neutre en JavaScript, dans une chaine
    // comme dans une expression reguliere.
    .replace(/<\/script/g, '<\\/script')
  return `<script type="module">\n${js}\n</script>`
})
page = page.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+)"[^>]*>/, (_, chemin) => {
  const css = readFileSync(join(CHANTIER, chemin), 'utf8')
  return `<style>\n${css}\n</style>`
})

if (page.includes('assets/')) {
  console.error('le gabarit garde une reference externe : il ne tiendrait pas seul')
  process.exit(1)
}

mkdirSync(join(SORTIE, '..'), { recursive: true })
writeFileSync(SORTIE, page)
rmSync(CHANTIER, { recursive: true, force: true })
console.log(`${SORTIE} ecrit (${Math.round(page.length / 1024)} Ko)`)
