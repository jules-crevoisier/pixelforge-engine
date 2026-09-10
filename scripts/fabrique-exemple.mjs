/**
 * Fabrique le fichier du jeu-temoin, « Le Gouffre ».
 *
 * Le generateur (src/demo/exemple-gouffre.ts) est la SOURCE ; le fichier
 * public/exemples/le-gouffre.json est l'ARTEFACT — celui que « Ouvrir… »
 * relit, celui que la fumee joue. Le banc verifie que l'artefact et le
 * generateur disent la meme chose : deux sources de verite finiraient par
 * se contredire, et l'on jouerait un autre jeu que celui qu'on relit.
 */
import { writeFileSync } from 'node:fs'
const { projetGouffre } = await import('../src/demo/exemple-gouffre.ts')
const { versTexte } = await import('../src/export/format.ts')
writeFileSync(new URL('../public/exemples/le-gouffre.json', import.meta.url),
  versTexte(projetGouffre()))
console.log('public/exemples/le-gouffre.json ecrit')
