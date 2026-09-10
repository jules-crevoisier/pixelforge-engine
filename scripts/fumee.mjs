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

// Les matières : pointes, mort, réapparition
{
  await p.selectOption('#monde', 'caverne')
  await p.waitForTimeout(300)
  await p.click('[data-outil="collision"]')
  await p.waitForTimeout(150)
  const drapeaux = await p.$$eval('#paletteGrille button', b => b.map(x => x.textContent))
  ok('la palette de matières montre les drapeaux',
    drapeaux.includes('Blessante') && drapeaux.includes('Plateforme'), drapeaux.join(', '))
  await p.click('[data-outil="terrain"]')

  await p.click('#jouer')
  await p.waitForTimeout(200)
  const depart = await p.evaluate(() => [window.pfe.monde.heros.x, window.pfe.monde.heros.y])
  const morts = async () => {
    const m = /(\d+) mort/.exec(await p.evaluate(() => window.pfe.monde.etat()))
    return m ? Number(m[1]) : -1
  }
  ok('on part vivant', (await morts()) === 0)
  // Courir vers la droite : la première fosse est garnie de pointes.
  await p.keyboard.down('ArrowRight')
  let mort = 0
  for (let i = 0; i < 25 && mort === 0; i++) { await p.waitForTimeout(200); mort = await morts() }
  await p.keyboard.up('ArrowRight')
  ok('les pointes tuent', mort === 1, `${mort} mort(s)`)

  // Les corps mobiles, DANS LE NAVIGATEUR. Le banc construit son registre a la
  // main ; ici c'est le jeu qui le remplit depuis la scene, et c'est ce
  // branchement-la qui peut manquer sans qu'aucun banc s'en apercoive.
  const corps = await p.evaluate(() => window.pfe.jeu.corps.tous.map(
    (c) => `${c.l}x${c.h}@${c.x},${c.y}`))
  ok('les corps mobiles du niveau sont inscrits dans le jeu',
    corps.length === 3, corps.join(' · '))
  // Et la plateforme BOUGE : un porteur immobile serait un mur de plus.
  const corpsAvant = await p.evaluate(() => window.pfe.jeu.corps.tous.map((c) => c.x + ',' + c.y))
  await p.waitForTimeout(700)
  const corpsApres = await p.evaluate(() => window.pfe.jeu.corps.tous.map((c) => c.x + ',' + c.y))
  ok('et la plateforme mobile se deplace vraiment',
    corpsAvant.some((v, i) => v !== corpsApres[i]),
    `${corpsAvant.join(' · ')} -> ${corpsApres.join(' · ')}`)

  await p.waitForTimeout(900)
  const apres = await p.evaluate(() => [window.pfe.monde.heros.x, window.pfe.monde.heros.y])
  ok('et l\'on réapparaît au point de reprise',
    apres[0] === depart[0] && apres[1] === depart[1],
    `${apres.join(',')} — le départ est ${depart.join(',')}`)
  await p.click('#arreter')
  await p.waitForTimeout(150)
}

// Défaire et refaire
{
  await p.selectOption('#monde', 'donjon')
  await p.waitForTimeout(280)
  await p.click('[data-outil="terrain"]')
  const c = await p.$eval('#vue', e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })
  const solides = () => p.evaluate(() => window.pfe.edition.compter().solides)
  const avant = await solides()
  await p.mouse.click(c[0] + c[2] * 0.5, c[1] + c[3] * 0.6)
  await p.waitForTimeout(120)
  const peint = await solides()
  ok('peindre change la carte', peint !== avant, `${avant} -> ${peint}`)

  await p.keyboard.press('Control+z')
  await p.waitForTimeout(120)
  ok('Ctrl+Z rend la carte a son etat d\'avant', (await solides()) === avant,
    await p.textContent('#verdict'))

  await p.keyboard.press('Control+Shift+z')
  await p.waitForTimeout(120)
  ok('Ctrl+Maj+Z refait le geste', (await solides()) === peint,
    await p.textContent('#verdict'))

  // Une entite posee se defait aussi.
  const compter = () => p.evaluate(() => {
    let n = 0
    const f = (x) => { if (x.espece) n++; x.enfants.forEach(f) }
    f(window.pfe.monde.racine)
    return n
  })
  await p.click('[data-outil="entite"]')
  await p.waitForTimeout(150)
  const e0 = await compter()
  await p.mouse.click(c[0] + c[2] * 0.35, c[1] + c[3] * 0.35)
  await p.waitForTimeout(120)
  const e1 = await compter()
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(120)
  ok('une entite posee se defait', e1 === e0 + 1 && (await compter()) === e0,
    `${e0} -> ${e1} -> ${await compter()}`)
}

/*
 * Le parcours d'un debutant, du projet vide au jeu qui tourne.
 *
 * C'est la seule verification qui reponde a « quelqu'un d'autre peut-il s'en
 * servir ». Les bancs prouvent que chaque piece est juste ; ils ne disent rien
 * du fait qu'on puisse partir de rien et arriver a quelque chose de jouable
 * sans ecrire une ligne de code. Ce parcours-la ne tient que dans un vrai
 * navigateur, et il tombe des qu'un bouton se debranche.
 */
{
  p.on('dialog', d => d.accept())
  await p.click('#nouveau')
  await p.waitForTimeout(500)
  const carte = () => p.evaluate(() => [
    window.pfe.monde.carte.largeur, window.pfe.monde.carte.hauteur,
    window.pfe.monde.carte.calques.length, window.pfe.monde.especes.length,
  ])
  const entites = () => p.evaluate(() => {
    let n = 0
    const f = (x) => { if (x.espece) n++; x.enfants.forEach(f) }
    f(window.pfe.monde.racine)
    return n
  })
  ok('« Nouveau » donne un projet vide mais jouable',
    JSON.stringify(await carte()).startsWith('[40,24,2') && (await entites()) === 1,
    `${(await carte()).join(' · ')} — ${await entites()} entité`)

  // Peindre du mur dans un projet neuf.
  await p.click('[data-outil="terrain"]')
  const c = await p.$eval('#vue', e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })
  const solides = () => p.evaluate(() => window.pfe.edition.compter().solides)
  await p.mouse.move(c[0] + c[2] * 0.35, c[1] + c[3] * 0.62)
  await p.mouse.down()
  for (let i = 0; i <= 12; i++) {
    await p.mouse.move(c[0] + c[2] * (0.35 + i * 0.02), c[1] + c[3] * 0.62)
  }
  await p.mouse.up()
  await p.waitForTimeout(150)
  ok('on peint du sol dans un projet neuf', (await solides()) > 4, `${await solides()} cases solides`)

  // Poser une creature, puis la DEPLACER en la trainant.
  await p.click('[data-outil="entite"]')
  await p.waitForTimeout(200)
  const gelee = await p.$$eval('#paletteGrille button', (b) => b.length)
  ok('la palette montre les espèces du projet', gelee >= 8, `${gelee} vignettes`)
  await p.mouse.click(c[0] + c[2] * 0.42, c[1] + c[3] * 0.5)
  await p.waitForTimeout(150)
  ok('on pose une créature', (await entites()) === 2, `${await entites()} entités`)

  const ou = () => p.evaluate(() => {
    const f = (x) => (x.espece && x.nom !== 'heros' ? [x.x, x.y] : x.enfants.map(f).find(Boolean))
    return f(window.pfe.monde.racine)
  })
  const avantGlisse = await ou()
  await p.mouse.move(c[0] + c[2] * 0.42, c[1] + c[3] * 0.5)
  await p.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await p.mouse.move(c[0] + c[2] * (0.42 + i * 0.012), c[1] + c[3] * (0.5 - i * 0.006))
  }
  await p.mouse.up()
  await p.waitForTimeout(200)
  const apresGlisse = await ou()
  ok('et on la déplace en la traînant',
    String(avantGlisse) !== String(apresGlisse) && (await entites()) === 2,
    `${avantGlisse} → ${apresGlisse}`)
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(150)
  ok('un déplacement se défait', String(await ou()) === String(avantGlisse),
    `${await ou()}`)

  // Le panneau Projet : redimensionner, ajouter un calque, creer une espece.
  // « Nouveau » l'a deja ouvert — le rouvrir le refermerait, ce qui est
  // exactement ce que le premier essai de ce scenario a fait.
  if (!(await p.isVisible('#projetCorps'))) await p.click('#basculeProjet')
  await p.waitForTimeout(250)
  ok('le panneau Projet s’ouvre', await p.isVisible('#projetCorps'))

  const champs = await p.$$('#projetCorps .bloc:nth-of-type(1) input')
  await champs[0].fill('60')
  await champs[1].fill('30')
  await p.getByRole('button', { name: 'Redimensionner' }).click()
  await p.waitForTimeout(500)
  ok('on redimensionne la carte sans écrire une ligne',
    JSON.stringify(await carte()).startsWith('[60,30'), (await carte()).join(' · '))
  ok('et ce qui était peint est toujours là', (await solides()) > 4,
    `${await solides()} cases solides après le redimensionnement`)

  const nomCalque = await p.$('#projetCorps .bloc-actions input')
  await nomCalque.fill('plafond')
  await p.getByRole('button', { name: '+ Décor' }).click()
  await p.waitForTimeout(450)
  ok('on ajoute un calque', (await carte())[2] === 3, `${(await carte())[2]} calques`)

  // Une espece, sans TypeScript.
  const especes = () => p.evaluate(() => window.pfe.monde.especes.map((e) => e.id))
  const avantEsp = (await especes()).length
  const form = await p.$$('#projetCorps .bloc:nth-of-type(3) input')
  await form[0].fill('limace')
  await form[1].fill('Limace')
  await p.getByRole('button', { name: 'Créer l’espèce' }).click()
  await p.waitForTimeout(500)
  ok('on crée une espèce sans écrire une ligne de TypeScript',
    (await especes()).includes('limace') && (await especes()).length === avantEsp + 1,
    (await especes()).slice(-3).join(', '))

  await p.click('#fermerProjet')
  await p.waitForTimeout(150)

  // Le cadre d'edition : il change ce qu'on voit, pas ce que le jeu verra.
  const vue = () => p.evaluate(() => [window.pfe.jeu.ecran.vue.largeur, window.pfe.monde.vue.largeur])
  const v0 = await vue()
  await p.click('#zoomMoins')
  await p.waitForTimeout(200)
  const v1 = await vue()
  ok('le cadre d’édition montre plus de carte', v1[0] > v0[0], `${v0[0]} → ${v1[0]} px`)
  ok('sans toucher au cadre du jeu', v1[1] === v0[1], `le jeu reste en ${v1[1]} px`)
  await p.click('#jouer')
  await p.waitForTimeout(250)
  const v2 = await vue()
  ok('et Jouer rend le cadre du jeu', v2[0] === v2[1], `${v2[0]} px`)
  const posAvant = await p.evaluate(() => window.pfe.monde.heros.x)
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(400); await p.keyboard.up('ArrowRight')
  const posApres = await p.evaluate(() => window.pfe.monde.heros.x)
  ok('un projet parti de rien se joue vraiment', posApres !== posAvant,
    `le héros est passé de ${posAvant} à ${posApres}`)
  await p.click('#arreter')
  await p.waitForTimeout(200)

  // L'aide s'ouvre et se ferme.
  await p.click('#basculeAide')
  await p.waitForTimeout(200)
  ok('l’aide s’ouvre', await p.evaluate(() => document.getElementById('aideBoite').open))
  // L'aide doit NOMMER chaque outil de la barre. C'est ce qui l'empeche de
  // deriver : on ajoute un outil, on oublie d'en parler, et l'aide devient
  // fausse par omission — le seul defaut d'une aide qu'on ne remarque jamais,
  // puisque ce qui manque ne se voit pas.
  const outilsBarre = await p.$$eval('#outils button', (b) => b.map((x) => x.textContent.trim()))
  const texteAide = await p.textContent('#aideCorps')
  const boutonsBarre = ['Jouer', 'Arrêter', 'Nouveau…', 'Dossier…', 'Enregistrer', 'Script', 'Projet']
  const oublies = [...outilsBarre, ...boutonsBarre].filter((o) => !texteAide.includes(o))
  ok('l’aide nomme chaque outil et chaque commande de la barre',
    oublies.length === 0, oublies.length ? `oubliés : ${oublies.join(', ')}` : `${outilsBarre.length + boutonsBarre.length} commandes citées`)

  await p.click('#fermerAide')
  await p.waitForTimeout(150)
  ok('et l’aide se referme', !(await p.evaluate(() => document.getElementById('aideBoite').open)))
}

// L'atelier
await p.selectOption('#monde', 'donjon')
await p.waitForTimeout(300)
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

await p.selectOption('#cible', 'paquet:godot')
await p.click('#exporter')
await p.waitForTimeout(1600)
ok('un projet Godot part en une seule archive',
  telecharges.length === 3 && telecharges[2].endsWith('-godot.zip'), telecharges[2])
ok('et la barre d\'état dit ce qu\'elle contient',
  /\d+ fichiers/.test(await p.textContent('#verdict')), await p.textContent('#verdict'))
await p.click('#enregistrer')
await p.waitForTimeout(900)
ok('Enregistrer telecharge le projet faute de dossier',
  telecharges.length === 4 && telecharges[3].endsWith('.json'), telecharges.join(', '))

console.log('\nerreurs de page:', err.length ? err.join('\n') : 'aucune')
const echecs = bilan.filter(x => !x.v).length
console.log(`${bilan.length - echecs}/${bilan.length} verifications`)
await b.close(); process.exit(echecs || err.length ? 1 : 0)
