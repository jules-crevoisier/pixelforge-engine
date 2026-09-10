/**
 * Le banc de fumee : l'editeur, dans un vrai navigateur.
 *
 * Les autres bancs eprouvent du CALCUL, et ils ont raison de tourner en Node
 * pur : y ajouter un navigateur n'ajouterait que des secondes et des causes de
 * panne. Mais toute une classe de fautes ne se voit QUE dans un navigateur —
 * une regle de style qui ecrase l'attribut « hidden » et laisse un panneau
 * ouvert en permanence, un bouton qui ne branche rien, une erreur de console
 * que personne ne lit. Celui-ci ouvre l'editeur, charge les quatre mondes, joue
 * dans chacun, peint, exporte, et refuse de passer si la console a dit quoi que
 * ce soit.
 *
 * Il a trouve sa premiere faute le jour ou il a ete ecrit : le panneau de
 * scripts ne se fermait jamais.
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { chromium } from 'playwright'
const PORT = 6200 + Math.floor(Math.random() * 20)
/* Le navigateur : celui de l'environnement s'il y en a un, sinon celui que
 * Playwright a installe. On ne telecharge rien depuis un banc. */
let nav = null
try {
  for (const d of readdirSync('/opt/pw-browsers')) {
    if (/^chromium-\d+$/.test(d)) { nav = `/opt/pw-browsers/${d}/chrome-linux/chrome`; break }
  }
} catch { /* pas d'installation partagee : Playwright se debrouille */ }
const s = spawn('node_modules/.bin/vite',
  ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
process.on('exit', () => s.kill())
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break } catch {} await new Promise(r => setTimeout(r, 250)) }
const b = await chromium.launch(nav ? { executablePath: nav } : {})
const p = await b.newPage({ viewport: { width: 1360, height: 780 }, deviceScaleFactor: 1 })
const err = []
p.on('pageerror', e => err.push('pageerror: ' + e))
p.on('console', m => { if (m.type() === 'error') err.push('console: ' + m.text()) })
await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })

let bilan = []
const ok = (nom, v, d = '') => { bilan.push({ nom, v }); console.log(`${v ? '  ok  ' : ' ECHEC'} ${nom}${d ? ' — ' + d : ''}`) }

for (const id of ['donjon', 'caverne', 'citadelle', 'etage']) {
  await p.selectOption('#monde', id)
  await p.waitForTimeout(280)
  // Jouer, bouger, arreter
  await p.click('#jouer')
  await p.waitForTimeout(120)
  const avant = await p.evaluate(() => [window.pfe.monde.heros.x, window.pfe.monde.heros.y])
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(420); await p.keyboard.up('ArrowRight')
  if (id === 'caverne') { await p.keyboard.press('Space'); await p.waitForTimeout(300) }
  const apres = await p.evaluate(() => [window.pfe.monde.heros.x, window.pfe.monde.heros.y])
  const img = await p.evaluate(() => window.pfe.monde.heros.image)
  await p.click('#arreter')
  await p.waitForTimeout(150)
  const remis = await p.evaluate(() => [window.pfe.monde.heros.x, window.pfe.monde.heros.y])
  const depart = await p.evaluate(() => [window.pfe.monde.depart.x, window.pfe.monde.depart.y])
  ok(`${id} : le heros bouge`, avant[0] !== apres[0] || avant[1] !== apres[1], `${avant} -> ${apres}`)
  ok(`${id} : l'arret le repose au depart`, remis[0] === depart[0] && remis[1] === depart[1], `${remis}`)
  ok(`${id} : une image d'animation valide`, typeof img === 'number' && img >= 0, `image ${img}`)

  // Peindre une case et verifier que la collision suit
  const boite = await p.$eval('#vue', c => { const r = c.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] })
  const avantSol = await p.evaluate(() => window.pfe.edition.compter().solides)
  await p.mouse.click(boite[0], boite[1])
  await p.waitForTimeout(120)
  const apresSol = await p.evaluate(() => window.pfe.edition.compter().solides)
  ok(`${id} : le pinceau change la collision`, avantSol !== apresSol, `${avantSol} -> ${apresSol}`)

  // Voir les collisions
  await p.check('#voirCollision'); await p.waitForTimeout(150); await p.uncheck('#voirCollision')
}

// Les outils Entité et Tuile
{
  await p.selectOption('#monde', 'donjon')
  await p.waitForTimeout(280)
  const compter = () => p.evaluate(() => {
    let n = 0
    const f = (x) => { if (x.espece) n++; x.enfants.forEach(f) }
    f(window.pfe.monde.racine)
    return n
  })
  await p.click('[data-outil="entite"]')
  await p.waitForTimeout(150)
  const especes = await p.$$eval('#paletteGrille button', b => b.length)
  ok('la palette d\'entités montre les espèces', especes >= 3, `${especes} espèces`)

  const boutons = await p.$$('#paletteGrille button')
  await boutons[boutons.length - 2].click()
  const c = await p.$eval('#vue', e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })
  const avant = await compter()
  await p.mouse.click(c[0] + c[2] * 0.45, c[1] + c[3] * 0.45)
  await p.waitForTimeout(100)
  const pose = await compter()
  ok('un clic pose une entité', pose === avant + 1, `${avant} -> ${pose}`)

  await p.mouse.click(c[0] + c[2] * 0.45, c[1] + c[3] * 0.45, { button: 'right' })
  await p.waitForTimeout(100)
  ok('un clic droit la retire', (await compter()) === avant, `retour à ${avant}`)

  await p.click('[data-outil="tuile"]')
  await p.waitForTimeout(150)
  const tuiles = await p.$$eval('#paletteGrille button', b => b.length)
  ok('la palette de tuiles montre la planche', tuiles > 10, `${tuiles} tuiles`)
  await p.click('[data-outil="terrain"]')
  await p.waitForTimeout(100)
  ok('et elle disparaît avec l\'outil', !(await p.isVisible('#paletteGrille')))
}

// L'atelier
await p.click('#basculeAtelier'); await p.waitForTimeout(150)
ok('l\'atelier s\'ouvre', await p.isVisible('#scriptSource'))
await p.click('#fermerAtelier'); await p.waitForTimeout(100)
ok('et se referme', !(await p.isVisible('#scriptSource')))

// L'export : on intercepte le telechargement
const telecharges = []
p.on('download', d => telecharges.push(d.suggestedFilename()))
await p.selectOption('#cible', 'python')
await p.click('#exporter')
await p.waitForTimeout(900)
ok('l\'export produit deux fichiers', telecharges.length === 2, telecharges.join(', '))
await p.click('#enregistrer')
await p.waitForTimeout(900)
ok('Enregistrer telecharge le projet faute de dossier', telecharges.length === 3, telecharges.join(', '))

console.log('\nerreurs de page:', err.length ? err.join('\n') : 'aucune')
const echecs = bilan.filter(x => !x.v).length
console.log(`${bilan.length - echecs}/${bilan.length} verifications`)
await b.close(); process.exit(echecs || err.length ? 1 : 0)
