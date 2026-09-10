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

/**
 * Passe le mot d'accueil, comme un joueur le ferait.
 *
 * La caverne s'ouvre sur un dialogue qui ARRETE le monde : laisser courir le
 * jeu derriere une boite de texte fait mourir pendant qu'on lit. Tout ce qui
 * suit doit donc commencer par le refermer — et c'est aussi la preuve qu'on
 * peut le refermer.
 */
const passerDialogue = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await p.evaluate(() => window.pfe.monde.sonde?.().dialogue ?? false))) return
    await p.keyboard.press('Space')
    await p.waitForTimeout(140)
  }
}

for (const id of ['donjon', 'caverne', 'citadelle', 'etage']) {
  await p.selectOption('#monde', id)
  await p.waitForTimeout(280)
  // Jouer, bouger, arreter
  await p.click('#jouer')
  await p.waitForTimeout(160)
  await passerDialogue()
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
  ok('et les six formes de pente, demi-pentes comprises',
    ['Pente ↗', 'Pente ↖', 'Demi ↗ bas', 'Demi ↗ haut', 'Demi ↖ bas', 'Demi ↖ haut']
      .every((n) => drapeaux.includes(n)),
    drapeaux.filter((n) => n.startsWith('Pente') || n.startsWith('Demi')).join(', '))

  /*
   * Les pentes S'EXCLUENT, et cela ne se verifie qu'en cliquant.
   *
   * On coche « Solide », puis « Demi ↗ bas ». Si le panneau les combinait, la
   * matiere vaudrait 161 — que le fichier ne sait pas ecrire, et qui se
   * perdrait au premier enregistrement. On veut 160 : la pente seule.
   */
  const matiereCourante = () => p.evaluate(() => window.pfe.edition.etat.matiere)
  const cliquerMatiere = async (nom) => {
    await p.click(`xpath=//*[@id="paletteGrille"]/button[normalize-space(text())="${nom}"]`)
    await p.waitForTimeout(60)
  }
  // « Solide » est coche au depart : on ne clique que s'il ne l'est pas, sinon
  // le clic le DECOCHE et la mesure suivante ne prouve plus rien.
  if (((await matiereCourante()) & 1) === 0) await cliquerMatiere('Solide')
  const apresSolide = await matiereCourante()
  await cliquerMatiere('Demi ↗ bas')
  const apresPente = await matiereCourante()
  ok('choisir une pente efface « solide », qui la contredirait',
    (apresSolide & 1) === 1 && apresPente === 160,
    `solide ${apresSolide}, puis pente ${apresPente} — 161 serait perdu à l’enregistrement`)
  await cliquerMatiere('Demi ↖ haut')
  const apresAutre = await matiereCourante()
  ok('et deux formes de pente ne se cumulent jamais',
    apresAutre === 448,
    `${apresAutre} — 608 voudrait dire « monte à droite ET à gauche »`)
  await cliquerMatiere('Blessante')
  ok('mais « blessante » se coche par-dessus : une rampe hérissée existe',
    (await matiereCourante()) === 452, `${await matiereCourante()}`)
  await cliquerMatiere('Demi ↖ haut')
  ok('et recliquer la forme choisie la retire',
    (await matiereCourante()) === 4, `${await matiereCourante()} — il reste « blessante »`)

  await p.click('[data-outil="terrain"]')

  await p.click('#jouer')
  await p.waitForTimeout(200)

  // Le mot d'accueil : il s'ecrit lettre a lettre, un appui l'affiche en
  // entier, un autre passe a la suite. C'est le seul endroit ou l'on peut
  // verifier que la fonte, la boite et la frappe s'accordent vraiment.
  const dial = () => p.evaluate(() => window.pfe.monde.sonde().dialogue)
  ok('la caverne s’ouvre sur un mot d’accueil', await dial())
  await p.waitForTimeout(250)
  const ecritA = await p.evaluate(() => window.pfe.monde.sonde().lettres)
  await p.waitForTimeout(400)
  const ecritB = await p.evaluate(() => window.pfe.monde.sonde().lettres)
  ok('le texte s’écrit lettre à lettre', ecritB > ecritA, `${ecritA} puis ${ecritB} lettres`)
  await p.keyboard.press('Space')
  await p.waitForTimeout(150)
  ok('un appui affiche la réplique entière',
    await p.evaluate(() => window.pfe.monde.sonde().complet), 'sans faire attendre qui a déjà lu')
  await passerDialogue()
  ok('et il se referme', !(await dial()))


  // La pause : elle arrete le monde, et le menu boucle.
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  ok('Échap ouvre la pause', await p.evaluate(() => window.pfe.monde.sonde().pause))
  const avantPause = await p.evaluate(() => window.pfe.monde.heros.x)
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(350); await p.keyboard.up('ArrowRight')
  ok('et le monde ne bouge plus derrière',
    (await p.evaluate(() => window.pfe.monde.heros.x)) === avantPause,
    'sinon on meurt pendant qu’on lit')
  await p.keyboard.press('ArrowDown')
  await p.waitForTimeout(120)
  ok('le curseur du menu descend',
    (await p.evaluate(() => window.pfe.monde.sonde().menu)) === 1)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  ok('et Échap la referme', !(await p.evaluate(() => window.pfe.monde.sonde().pause)))

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

  // Le son et les particules, DANS le navigateur. Les bancs prouvent que la
  // synthese et la gerbe sont justes ; ils ne disent rien du fait qu'un coup
  // recu en produise. C'est le branchement qui peut manquer sans bruit.
  const sonde = () => p.evaluate(() => window.pfe.monde.sonde())
  const s1 = await sonde()
  ok('mourir fait sonner et jaillir des particules',
    s1.sons > 0 && s1.particules > 0,
    `${s1.sons} sons joués, ${s1.particules} particules vivantes`)
  await p.waitForTimeout(900)
  const s2 = await sonde()
  ok('et les particules disparaissent d’elles-mêmes',
    s2.particules < s1.particules,
    `${s1.particules} → ${s2.particules} — une particule immortelle est une fuite`)

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

  /**
   * Trouve un bloc par son TITRE, jamais par son rang.
   *
   * Le rang a change le jour ou le panneau a gagne des onglets, et le banc
   * s'est mis a viser le vide avec un message qui parlait de `undefined`. Un
   * selecteur qui dit ce qu'il cherche survit a la mise en page ; un
   * selecteur qui compte, non.
   */
  const blocDe = async (titre) => p.$$(
    `xpath=//div[@id="projetCorps"]//div[contains(@class,"bloc")][h3[text()="${titre}"]]//input`,
  )
  const champs = await blocDe('Carte')
  await champs[0].fill('60')
  await champs[1].fill('30')
  await p.getByRole('button', { name: 'Redimensionner' }).click()
  await p.waitForTimeout(500)
  ok('on redimensionne la carte sans écrire une ligne',
    JSON.stringify(await carte()).startsWith('[60,30'), (await carte()).join(' · '))
  ok('et ce qui était peint est toujours là', (await solides()) > 4,
    `${await solides()} cases solides après le redimensionnement`)

  /*
   * Le champ est designe par son ROLE et non par son rang.
   *
   * Il l'a ete par son rang, et ajouter deux champs de parallaxe sur chaque
   * ligne de calque a fait remplir « plafond » dans un nombre. Un banc qui
   * compte les champs mesure la disposition du panneau, pas ce qu'il fait.
   */
  const nomCalque = (await p.$$(
    'xpath=//div[@id="projetCorps"]//div[contains(@class,"bloc")][h3[text()="Calques"]]'
    + '//input[@placeholder="nom du calque"]',
  ))[0]
  await nomCalque.fill('plafond')
  await p.getByRole('button', { name: '+ Décor' }).click()
  await p.waitForTimeout(450)
  ok('on ajoute un calque', (await carte())[2] === 3, `${(await carte())[2]} calques`)

  // Une espece, sans TypeScript.
  const especes = () => p.evaluate(() => window.pfe.monde.especes.map((e) => e.id))
  const avantEsp = (await especes()).length
  await p.getByRole('button', { name: 'Espèces', exact: true }).click()
  await p.waitForTimeout(250)
  const form = await blocDe('Espèces')
  await form[0].fill('limace')
  await form[1].fill('Limace')
  await p.getByRole('button', { name: 'Créer l’espèce' }).click()
  await p.waitForTimeout(500)
  ok('on crée une espèce sans écrire une ligne de TypeScript',
    (await especes()).includes('limace') && (await especes()).length === avantEsp + 1,
    (await especes()).slice(-3).join(', '))

  /*
   * Les ateliers d'art : dessiner, monter, regler.
   *
   * C'est ce qui manquait pour qu'on puisse faire un jeu sans lire le moteur :
   * on pouvait creer une espece, et elle empruntait forcement le dessin d'une
   * autre. Ces trois onglets ne s'eprouvent que dans un navigateur — un
   * pinceau, une toile et un bouton d'ecoute n'existent pas ailleurs.
   */
  await p.getByRole('button', { name: 'Dessin', exact: true }).click()
  await p.waitForTimeout(300)
  const toile = await p.$('.toile')
  ok('l’atelier de dessin montre une case de planche', toile !== null)
  const pixels = () => p.evaluate(() => {
    const t = window.pfe.monde.planches[0]
    return t.dessins[0].join('')
  })
  const avantDessin = await pixels()
  const bt = await toile.boundingBox()
  // On choisit une couleur, puis on peint quatre pixels en glissant.
  const pastilles = await p.$$('.pastille')
  await pastilles[Math.min(3, pastilles.length - 1)].click()
  await p.mouse.move(bt.x + bt.width * 0.3, bt.y + bt.height * 0.3)
  await p.mouse.down()
  for (let i = 1; i <= 4; i++) {
    await p.mouse.move(bt.x + bt.width * (0.3 + i * 0.05), bt.y + bt.height * 0.3)
  }
  await p.mouse.up()
  await p.waitForTimeout(200)
  const apresDessin = await pixels()
  ok('on peint des pixels dans une planche', apresDessin !== avantDessin,
    `${[...apresDessin].filter((c, i) => c !== avantDessin[i]).length} pixels changés`)
  ok('et le dessin part dans le projet, pas dans une copie',
    (await p.evaluate(() => window.pfe.monde.planches[0].dessins[0].join('')))
      === apresDessin,
    'c’est la planche du monde qu’on peint, donc celle qui s’enregistre')

  // Une couleur ajoutee a la cle : sans cela on ne dessine qu'avec ce que
  // quelqu'un d'autre a choisi.
  const couleurs = () => p.evaluate(() => Object.keys(window.pfe.monde.planches[0].cle).length)
  const avantCle = await couleurs()
  await p.getByRole('button', { name: '+ Couleur' }).click()
  await p.waitForTimeout(250)
  ok('on ajoute une couleur à la planche', (await couleurs()) === avantCle + 1,
    `${avantCle} → ${await couleurs()} couleurs`)

  await p.getByRole('button', { name: 'Animations', exact: true }).click()
  await p.waitForTimeout(300)
  const premierClip = await p.$$('#projetCorps .ligne button')
  await premierClip[0].click()
  await p.waitForTimeout(300)
  const images = () => p.evaluate(() => window.pfe.monde.animations[0].images.length)
  const avantImages = await images()
  await p.getByRole('button', { name: '+ Image' }).click()
  await p.waitForTimeout(250)
  ok('on ajoute une image à une animation', (await images()) === avantImages + 1,
    `${avantImages} → ${await images()} images`)

  await p.getByRole('button', { name: 'Sons', exact: true }).click()
  await p.waitForTimeout(300)
  const boutonsSon = await p.$$('#projetCorps .ligne button')
  ok('l’atelier de sons liste les sons du projet', boutonsSon.length > 0,
    `${boutonsSon.length / 2} sons`)
  await boutonsSon[1].click()
  await p.waitForTimeout(250)
  const freq = (await p.$$('#projetCorps .champs input'))[0]
  await freq.fill('523')
  await freq.dispatchEvent('change')
  await p.waitForTimeout(200)
  ok('on règle un son, et le projet le retient',
    (await p.evaluate(() => window.pfe.monde.sons.some((s) => s.frequence === 523))),
    'six nombres : c’est tout ce qu’un son est')

  /*
   * L'IMPORT, DE BOUT EN BOUT : un vrai PNG et un vrai `.pixelforge`,
   * fabriques dans la page, choisis par le vrai bouton, decodes par le vrai
   * navigateur. Le banc de Node a eprouve la logique ; ici on eprouve la
   * porte — le fichier, le decodeur, le panneau.
   */
  await p.getByRole('button', { name: 'Dessin', exact: true }).click()
  await p.waitForTimeout(250)
  const planchesAvant = await p.evaluate(() => window.pfe.monde.planches.length)

  /* Un damier rouge-vert de 4x4, encode en vrai PNG par le canevas. */
  const pngOctets = await p.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 4; c.height = 4
    const ctx = c.getContext('2d')
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#00ff00' : '#ff0000'
      ctx.fillRect(x, y, 1, 1)
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  const champsTaille = await p.$$('#projetCorps .bloc-actions input[type=number]')
  await champsTaille[0].fill('2')
  await champsTaille[0].dispatchEvent('change')
  await champsTaille[1].fill('2')
  await champsTaille[1].dispatchEvent('change')
  await (await p.$('#projetCorps input[type=file]')).setInputFiles({
    name: 'damier.png', mimeType: 'image/png', buffer: Buffer.from(pngOctets),
  })
  await p.waitForTimeout(600)
  const importee = await p.evaluate(() => {
    const t = window.pfe.monde.planches.find((q) => q.nom === 'damier')
    return t ? {
      cases: t.dessins.length, taille: `${t.largeurCase}x${t.hauteurCase}`,
      pixel: t.cle[t.dessins[0][0][0]],
    } : null
  })
  ok('un PNG importé par le bouton devient une planche du projet',
    (await p.evaluate(() => window.pfe.monde.planches.length)) === planchesAvant + 1
    && importee && importee.cases === 4 && importee.taille === '2x2'
    && importee.pixel === '#ff0000',
    importee ? `4×4 px → ${importee.cases} cases de ${importee.taille}, premier pixel ${importee.pixel}`
      : 'planche introuvable')

  /* Le pont : un `.pixelforge` de l'editeur de sprites, deux images, deux
   * calques — les cels sont de vrais PNG en base64, comme lui les ecrit. */
  const projetSprite = await p.evaluate(async () => {
    const cel = (couleur, plein) => {
      const c = document.createElement('canvas')
      c.width = 3; c.height = 3
      const ctx = c.getContext('2d')
      ctx.fillStyle = couleur
      if (plein) ctx.fillRect(0, 0, 3, 3)
      else ctx.fillRect(1, 1, 1, 1)
      return c.toDataURL('image/png')
    }
    return JSON.stringify({
      format: 'pixelforge', version: 1, name: 'lutin', width: 3, height: 3,
      frameDurations: [100, 100],
      layers: [
        { visible: true, opacity: 255, blendMode: 'normal',
          cels: [{ opacity: 255, png: cel('#204060', true) }, { opacity: 255, png: cel('#204060', true) }] },
        { visible: true, opacity: 255, blendMode: 'normal',
          cels: [{ opacity: 255, png: cel('#ffcc00', false) }, null] },
      ],
    })
  })
  await (await p.$('#projetCorps input[type=file]')).setInputFiles({
    name: 'lutin.pixelforge', mimeType: 'application/json', buffer: Buffer.from(projetSprite),
  })
  await p.waitForTimeout(700)
  const lutin = await p.evaluate(() => {
    const t = window.pfe.monde.planches.find((q) => q.nom === 'lutin')
    if (!t) return null
    const centre = (i) => t.cle[t.dessins[i][1][1]] ?? null
    return { cases: t.dessins.length, image0: centre(0), image1: centre(1) }
  })
  ok('un projet de l’éditeur de sprites traverse le pont, calques fondus',
    lutin && lutin.cases === 2 && lutin.image0 === '#ffcc00' && lutin.image1 === '#204060',
    lutin ? `2 images → ${lutin.cases} cases ; le motif du calque haut couvre l’image 1 `
      + `(${lutin.image0}) et pas l’image 2 (${lutin.image1})` : 'planche introuvable')

  /* Le refus, par la vraie porte : un fichier qui n'est pas du pixel art. */
  await (await p.$('#projetCorps input[type=file]')).setInputFiles({
    name: 'faux.pixelforge', mimeType: 'application/json', buffer: Buffer.from('{"format":"autre"}'),
  })
  await p.waitForTimeout(400)
  ok('et un fichier illisible est refusé avec la raison, sans rien casser',
    /refusé/i.test(await p.textContent('#projetMessage').catch(() => ''))
    || (await p.evaluate(() => window.pfe.monde.planches.length)) === planchesAvant + 2,
    'le projet garde ses deux planches importées, pas une de plus')

  await p.getByRole('button', { name: 'Carte', exact: true }).click()
  await p.waitForTimeout(200)
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

  /*
   * UN DECLENCHEUR, PAR LA VRAIE PORTE : le panneau, puis Jouer.
   *
   * Les bancs prouvent la classe ; ils ne prouvent pas que le bouton du
   * panneau fabrique un declencheur, que l'enregistrement le transporte, que
   * la relecture le recompile et que la partie le fait tirer. C'est toute la
   * chaine qu'on eprouve ici : on en pose un sur la case du heros, il joue un
   * son a la premiere seconde de jeu.
   */
  await p.click('#basculeProjet')
  await p.waitForTimeout(200)
  const surBloc = (fn, ...args) => p.evaluate(({ src, args: a }) => {
    const blocs = [...document.querySelectorAll('#projetCorps .bloc')]
    const bloc = blocs.find((b) => b.querySelector('h3')?.textContent === 'Déclencheurs')
    // eslint-disable-next-line no-new-func
    return bloc ? new Function('bloc', '...args', `return (${src})(bloc, ...args)`)(bloc, ...a) : null
  }, { src: fn.toString(), args: args })
  await surBloc((bloc) => {
    ;[...bloc.querySelectorAll('button')].find((b) => b.textContent.includes('Déclencheur')).click()
  })
  await p.waitForTimeout(250)
  const caseHeros = await p.evaluate(() => {
    const h = window.pfe.monde.heros
    const t = window.pfe.monde.carte.tuile
    return { x: Math.floor(h.x / t), y: Math.floor(h.y / t) }
  })
  // La zone se regle nombre par nombre ; chaque changement refait le panneau,
  // on requiert donc les champs A CHAQUE geste au lieu de les garder.
  for (const [i, v] of [[0, caseHeros.x - 1], [1, caseHeros.y - 1], [2, 3], [3, 3]].values()) {
    await surBloc((bloc, i2, v2) => {
      const e = bloc.querySelectorAll('.ligne input[type=number]')[i2]
      e.value = String(v2)
      e.dispatchEvent(new Event('change'))
    }, i, v)
    await p.waitForTimeout(150)
  }
  await surBloc((bloc) => {
    const e = bloc.querySelector('.ligne textarea')
    e.value = "c.jouer('coup'); c.secouer(2, 120)"
    e.dispatchEvent(new Event('change'))
  })
  await p.waitForTimeout(250)
  const declMonde = await p.evaluate(() => window.pfe.monde.declencheurs)
  ok('le panneau pose un déclencheur et son script, en données',
    declMonde?.length === 1 && declMonde[0].script.includes("c.jouer('coup')")
    && declMonde[0].zone.l === 3,
    declMonde?.length ? `« ${declMonde[0].nom} », zone ${declMonde[0].zone.x},${declMonde[0].zone.y} ${declMonde[0].zone.l}×${declMonde[0].zone.h}` : 'aucun')
  await p.click('#fermerProjet')
  await p.click('#jouer')
  await p.waitForTimeout(600)
  const tir = await p.evaluate(() => ({
    tirs: window.pfe.jeu.declencheurs?.tirs ?? -1,
    joues: window.pfe.jeu.sonneur?.joue ?? -1,
  }))
  ok('et il TIRE en jouant : le script joue son son par c.jouer',
    tir.tirs === 1 && tir.joues >= 1,
    `${tir.tirs} tir(s), ${tir.joues} son(s) joué(s) — « une fois » : pas un de plus`)
  await p.click('#arreter')
  await p.waitForTimeout(200)

  /*
   * UN JEU A DEUX NIVEAUX, par les seuls boutons de l'editeur.
   *
   * « + Carte » cree le niveau deux, le Deroule donne un titre, et un
   * declencheur appelle c.niveauSuivant(). Si cette chaine casse, l'editeur
   * ne sait faire que des jeux d'UN niveau — et aucun banc hors navigateur
   * ne peut le dire, parce que tout passe par le panneau et par Jouer.
   */
  await p.click('#basculeProjet')
  await p.waitForTimeout(200)
  const surBlocNomme = (titreBloc, fn, ...args) => p.evaluate(({ titre, src, args: a }) => {
    const blocs = [...document.querySelectorAll('#projetCorps .bloc')]
    const bloc = blocs.find((b) => b.querySelector('h3')?.textContent === titre)
    // eslint-disable-next-line no-new-func
    return bloc ? new Function('bloc', '...args', `return (${src})(bloc, ...args)`)(bloc, ...a) : null
  }, { titre: titreBloc, src: fn.toString(), args: args })
  await surBlocNomme('Cartes', (bloc) => {
    ;[...bloc.querySelectorAll('button')].find((b) => b.textContent === '+ Carte').click()
  })
  await p.waitForTimeout(300)
  const apresAjout = await p.evaluate(() => window.pfe.monde.sonde())
  ok('« + Carte » donne un second niveau, nommé', apresAjout.cartes.join(',') === 'carte,niveau2',
    apresAjout.cartes.join(' · '))

  // On passe le niveau deux sous le pinceau, puis on revient : rien ne se perd.
  await surBlocNomme('Cartes', (bloc) => {
    ;[...bloc.querySelectorAll('button')].find((b) => b.textContent === 'Éditer').click()
  })
  await p.waitForTimeout(300)
  const surNiveau2 = await p.evaluate(() => window.pfe.monde.sonde().carteActive)
  await surBlocNomme('Cartes', (bloc) => {
    ;[...bloc.querySelectorAll('button')].find((b) => b.textContent === 'Éditer').click()
  })
  await p.waitForTimeout(300)
  const retour = await p.evaluate(() => window.pfe.monde.sonde())
  ok('« Éditer » change la carte sous le pinceau, et en revient',
    surNiveau2 === 'niveau2' && retour.carteActive === 'carte' && retour.cartes.length === 2,
    `carte → niveau2 → carte, ${retour.cartes.length} cartes conservées`)

  // Le titre, et un declencheur qui passe au niveau suivant.
  await surBlocNomme('Déroulé', (bloc) => {
    const e = bloc.querySelector('input')
    e.value = 'La Grotte'
    e.dispatchEvent(new Event('change'))
  })
  await p.waitForTimeout(250)
  await surBlocNomme('Déclencheurs', (bloc) => {
    ;[...bloc.querySelectorAll('button')].find((b) => b.textContent.includes('Déclencheur')).click()
  })
  await p.waitForTimeout(250)
  const caseH = await p.evaluate(() => {
    const h = window.pfe.monde.heros
    const t = window.pfe.monde.carte.tuile
    return { x: Math.floor(h.x / t), y: Math.floor(h.y / t) }
  })
  for (const [i, v] of [[0, caseH.x - 1], [1, caseH.y - 1], [2, 3], [3, 3]].values()) {
    await surBlocNomme('Déclencheurs', (bloc, i2, v2) => {
      const ligne = [...bloc.querySelectorAll('.ligne')].at(-1)
      const e = ligne.querySelectorAll('input[type=number]')[i2]
      e.value = String(v2)
      e.dispatchEvent(new Event('change'))
    }, i, v)
    await p.waitForTimeout(150)
  }
  await surBlocNomme('Déclencheurs', (bloc) => {
    const ligne = [...bloc.querySelectorAll('.ligne')].at(-1)
    const e = ligne.querySelector('textarea')
    e.value = 'c.niveauSuivant()'
    e.dispatchEvent(new Event('change'))
  })
  await p.waitForTimeout(250)
  await p.click('#fermerProjet')
  await p.click('#jouer')
  await p.waitForTimeout(300)
  const pendantTitre = await p.evaluate(() => window.pfe.monde.sonde())
  ok('le jeu s’ouvre sur son écran-titre, monde gelé',
    pendantTitre.titreOuvert === true && pendantTitre.carteActive === 'carte',
    `« La Grotte » attend — Espace pour commencer`)
  await p.keyboard.press('Space')
  await p.waitForTimeout(500)
  const apresTitre = await p.evaluate(() => window.pfe.monde.sonde())
  ok('Espace le passe, et le déclencheur emmène au niveau deux',
    apresTitre.titreOuvert === false && apresTitre.carteActive === 'niveau2',
    `carte → ${apresTitre.carteActive}, par c.niveauSuivant() dans un déclencheur — un jeu à deux niveaux sans une ligne hors de l’éditeur`)
  await p.click('#arreter')
  await p.waitForTimeout(250)
  const apresArret = await p.evaluate(() => window.pfe.monde.sonde())
  ok('« Rejouer » recommencera le JEU : retour au niveau un et au titre',
    apresArret.carteActive === 'carte' && apresArret.titreOuvert === true,
    'pas au niveau où l’on s’était arrêté')

  /*
   * LA NUIT, par le panneau : on baisse l'ambiante, on joue, et l'ecran
   * s'assombrit VRAIMENT. Le banc prouve la fidelite a la palette ; lui ne
   * peut pas prouver que le reglage du panneau atteint l'ecran — c'est un
   * branchement, et un branchement se voit ou ne se voit pas.
   */
  // La luminance des CENT pixels les plus clairs : le fond d'une carte est
  // sombre et domine l'ecran, une moyenne globale noierait la nuit dedans —
  // 18,4 le jour, 15,7 la nuit, indiscernables. Les pixels les plus clairs,
  // eux, sont le decor peint : eclatants le jour, assombris la nuit, et la
  // mesure ne depend pas du cadrage.
  const luminanceTampon = () => p.evaluate(() => {
    const t = window.pfe.jeu.ecran.tampon
    const ctx = window.pfe.jeu.ecran.ctx
    const tous = []
    // Rangee par rangee, comme la mesure de parallaxe : une seule grande
    // ImageData echoue par manque de memoire dans le navigateur du banc.
    for (let y = 0; y < t.height; y += 3) {
      const d = ctx.getImageData(0, y, t.width, 1).data
      for (let i = 0; i < d.length; i += 4) {
        tous.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
      }
    }
    tous.sort((a, b) => b - a)
    const cent = tous.slice(0, 100)
    return cent.reduce((a, b) => a + b, 0) / cent.length
  })
  // Le declencheur « niveau suivant » se rearme a l'arret : sans le retirer,
  // la mesure se ferait sur le niveau deux — vide, donc noir, donc aveugle.
  await p.click('#basculeProjet')
  await p.waitForTimeout(200)
  await surBlocNomme('Déclencheurs', (bloc) => {
    const ligne = [...bloc.querySelectorAll('.ligne')].at(-1)
    ;[...ligne.querySelectorAll('button')].find((b) => b.textContent === '✕').click()
  })
  await p.waitForTimeout(250)
  await p.click('#fermerProjet')
  await p.click('#jouer')
  await p.waitForTimeout(250)
  await p.keyboard.press('Space')
  await p.waitForTimeout(300)
  const jour = await luminanceTampon()
  await p.click('#arreter')
  await p.waitForTimeout(200)
  await p.click('#basculeProjet')
  await p.waitForTimeout(200)
  await surBlocNomme('Lumière', (bloc) => {
    const e = bloc.querySelector('input')
    e.value = '0.3'
    e.dispatchEvent(new Event('change'))
  })
  await p.waitForTimeout(250)
  await p.click('#fermerProjet')
  await p.click('#jouer')
  await p.waitForTimeout(250)
  await p.keyboard.press('Space')
  await p.waitForTimeout(300)
  const nuit = await luminanceTampon()
  ok('baisser l’ambiante au panneau assombrit vraiment l’écran de jeu',
    nuit < jour * 0.8,
    `luminance ${jour.toFixed(1)} en plein jour, ${nuit.toFixed(1)} à 0,3 d’ambiante — mesurée sur le tampon 320×180`)
  const editionClaire = await (async () => {
    await p.click('#arreter')
    await p.waitForTimeout(300)
    return luminanceTampon()
  })()
  ok('mais l’éditeur à l’arrêt reste en plein jour — on ne peint pas dans le noir',
    editionClaire > nuit * 1.2,
    `luminance ${editionClaire.toFixed(1)} à l’arrêt`)
  // Le bogue que cette mesure a permis de trouver : chaque geste du panneau
  // fait en zoom arriere gonflait la vue du projet par le facteur du cadre.
  // Apres tous les gestes de ce scenario, elle doit valoir exactement 320.
  const vueFinale = await p.evaluate(() => window.pfe.monde.vue.largeur)
  ok('dix gestes de panneau plus tard, la vue du projet n’a pas bougé',
    vueFinale === 320,
    `${vueFinale} px — la sérialisation prenait la vue de l’ÉCRAN, cadre d’édition compris`)

  /*
   * LE JEU-TEMOIN, PAR LA VRAIE PORTE : « Ouvrir… », l'ecran-titre, et le
   * premier niveau au clavier.
   *
   * Le banc prouve que la geometrie se traverse au controleur ; lui ne peut
   * pas prouver que le FICHIER s'ouvre, que le titre attend, que le dialogue
   * s'ouvre et se lit, que la musique part et que la sortie emmene au niveau
   * deux. C'est le jeu entier qui passe par les branchements — exactement ce
   * qu'un joueur fera.
   */
  {
    const { readFileSync } = await import('node:fs')
    const texte = readFileSync(new URL('../public/exemples/le-gouffre.json', import.meta.url))
    const [selecteur] = await Promise.all([
      p.waitForEvent('filechooser'),
      p.click('#ouvrir'),
    ])
    await selecteur.setFiles({
      name: 'le-gouffre.json', mimeType: 'application/json', buffer: texte,
    })
    await p.waitForTimeout(600)
    const ouverture = await p.evaluate(() => ({
      nom: window.pfe.monde.nom,
      ...window.pfe.monde.sonde(),
    }))
    ok('« Ouvrir… » relit le jeu-témoin, écran-titre en tête',
      ouverture.nom.includes('le-gouffre') && ouverture.titreOuvert === true
      && ouverture.carteActive === 'clairiere'
      && ouverture.ordre.join(',') === 'clairiere,caverne,gouffre',
      `« ${ouverture.nom} » · ${ouverture.ordre.join(' → ')}`)

    await p.click('#jouer')
    await p.waitForTimeout(300)
    await p.keyboard.press('Space')
    await p.waitForTimeout(250)
    // Le premier niveau, au clavier : droite tenue, petits sauts. Les memes
    // appuis lisent le dialogue d'accueil — valider et sauter partagent la
    // touche, comme dans les mondes de demonstration.
    await p.keyboard.down('ArrowRight')
    let etatFlux = null
    for (let i = 0; i < 70; i++) {
      // Un saut TENU, pas une pichenette : la hauteur est variable, et un
      // appui d'une image donne un sautillement qui ne monte pas une marche.
      await p.keyboard.down('Space')
      await p.waitForTimeout(170)
      await p.keyboard.up('Space')
      await p.waitForTimeout(200)
      etatFlux = await p.evaluate(() => window.pfe.monde.sonde())
      if (etatFlux.carteActive !== 'clairiere') break
    }
    await p.keyboard.up('ArrowRight')
    const apres = await p.evaluate(() => ({
      musique: window.pfe.jeu.musicien?.nom ?? '',
      tirs: window.pfe.jeu.declencheurs?.tirs ?? 0,
      x: Math.round(window.pfe.monde.heros?.x ?? -1),
      ...window.pfe.monde.sonde(),
    }))
    ok('la clairière se joue et sa sortie emmène dans la caverne',
      apres.carteActive === 'caverne',
      `arrivé en « ${apres.carteActive} » (x=${apres.x}) — le niveau entier au clavier, dialogue compris`)
    ok('la musique du jeu est partie d’un déclencheur, en données',
      apres.musique === 'descente' && apres.tirs >= 2,
      `« ${apres.musique} » joue · ${apres.tirs} déclencheur(s) tirés`)

    /*
     * LA MORT D'UN PROJET RELU — la premiere ligne du carnet du jeu-temoin.
     *
     * Avant, le heros d'un projet relu mourait et DISPARAISSAIT : pas de
     * reprise, pas de coeurs, une partie ouverte sur du vide. On le pose sur
     * les pointes de la caverne, on attend que ses coeurs s'epuisent, et
     * l'on exige qu'il REVIENNE — au point de reprise, avec toute sa vie.
     */
    // Le dialogue d'entree de la caverne est ouvert et GELE le monde — c'est
    // la regle. On le lit avant de mourir : un monde gele ne blesse pas.
    for (let i = 0; i < 4; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(200) }
    const avantMort = await p.evaluate(() => window.pfe.monde.sonde())
    await p.evaluate(() => {
      const f = (n) => (n.nom === 'heros' && n.espece ? n : n.enfants.map(f).find(Boolean))
      const h = f(window.pfe.jeu.racine)
      h.x = 25 * 16 + 8
      h.y = 15 * 16
    })
    await p.waitForTimeout(4500)
    const apresMort = await p.evaluate(() => {
      const f = (n) => (n.nom === 'heros' && n.espece ? n : n.enfants.map(f).find(Boolean))
      const h = f(window.pfe.jeu.racine)
      return { ...window.pfe.monde.sonde(), heros: h ? { x: h.x, y: h.y, v: h.visible } : null }
    })
    ok('les pointes tuent, et le héros REVIENT — la mort d’un projet relu a une reprise',
      apresMort.morts > (avantMort.morts ?? 0) && apresMort.heros !== null
      && apresMort.pv === apresMort.pvMax && apresMort.heros.x < 25 * 16,
      `${apresMort.morts} mort(s), revenu en x=${Math.round(apresMort.heros?.x ?? -1)} avec `
      + `${apresMort.pv}/${apresMort.pvMax} cœurs — avant, il disparaissait et la partie restait ouverte sur du vide`)
    await p.click('#arreter')
    await p.waitForTimeout(250)
  }

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

/*
 * LE RECTANGLE, LE REMPLISSAGE ET LES SALLES, A LA SOURIS.
 *
 * Ce sont des GESTES : ils ne se verifient qu'en les faisant. Un banc en Node
 * eprouve la regle ; celui-ci eprouve que le bouton la declenche, que le
 * pointeur arrive, et que la carte change.
 */
{
  await p.selectOption('#monde', 'donjon')
  await p.waitForTimeout(400)
  const cadre = await p.$eval('#vue', (c) => {
    const r = c.getBoundingClientRect()
    return [r.x, r.y, r.width, r.height]
  })
  const glisser = async (fx0, fy0, fx1, fy1, bouton = 'left') => {
    await p.mouse.move(cadre[0] + cadre[2] * fx0, cadre[1] + cadre[3] * fy0)
    await p.mouse.down({ button: bouton })
    await p.mouse.move(cadre[0] + cadre[2] * fx1, cadre[1] + cadre[3] * fy1, { steps: 8 })
    await p.mouse.up({ button: bouton })
    await p.waitForTimeout(250)
  }
  const solides = () => p.evaluate(() => window.pfe.edition.compter().solides)

  await p.click('[data-outil="terrain"]')
  await p.click('[data-trace="rectangle"]')
  const avantRect = await solides()
  await glisser(0.3, 0.3, 0.45, 0.5)
  const apresRect = await solides()
  /*
   * On mesure un CHANGEMENT et non une augmentation.
   *
   * Le premier appui decide, comme partout dans l'editeur : commencer sur une
   * case deja peinte efface le rectangle au lieu de le remplir. C'est la
   * regle, et le premier essai de ce banc l'a prise pour un defaut — le
   * rectangle avait retire quinze cases, ce qui etait exactement ce qu'on lui
   * demandait.
   */
  ok('un rectangle tiré à la souris change plusieurs cases d’un geste',
    Math.abs(apresRect - avantRect) > 4,
    `${avantRect} → ${apresRect} cases solides — case par case, une carte de 40×33 fait 1320 clics`)

  await p.click('#defaire')
  await p.waitForTimeout(250)
  ok('et il se défait d’un seul « défaire »',
    (await solides()) === avantRect,
    `retour à ${await solides()}`)

  await p.click('[data-trace="remplir"]')
  const avantRemp = await solides()
  await glisser(0.55, 0.35, 0.55, 0.35)
  const apresRemp = await solides()
  ok('le remplissage couvre une zone entière d’un clic',
    Math.abs(apresRemp - avantRemp) > 10,
    `${avantRemp} → ${apresRemp} cases — dans un sens ou dans l’autre : `
    + 'cliquer sur une zone peinte l’efface entièrement')
  await p.click('#defaire')
  await p.waitForTimeout(250)

  /* Les salles : on en tire une, on la voit, on la retire. */
  await p.click('[data-outil="salle"]')
  await p.click('[data-trace="libre"]')
  const salles = () => p.evaluate(() => (window.pfe.monde.salles ?? []).length)
  await glisser(0.3, 0.3, 0.6, 0.6)
  ok('l’outil « Salle » pose un tableau en tirant un rectangle',
    (await salles()) === 1, `${await salles()} salle(s)`)
  ok('et la barre d’état en tient le compte',
    /1 salle/.test(await p.textContent('#verdict')), await p.textContent('#verdict'))

  // Une seconde, qui recouvre la premiere : l'avertissement doit DURER.
  await glisser(0.35, 0.35, 0.65, 0.65)
  ok('deux salles qui se recouvrent sont signalées, et ça reste affiché',
    /recouvrent/.test(await p.textContent('#verdict')),
    await p.textContent('#verdict'))

  await glisser(0.5, 0.5, 0.5, 0.5, 'right')
  await glisser(0.4, 0.4, 0.4, 0.4, 'right')
  ok('et le clic droit les retire', (await salles()) === 0, `${await salles()} salle(s)`)
  await p.click('[data-outil="terrain"]')
}

/*
 * LE CHAPITRE EN TABLEAUX, JOUE POUR DE BON.
 *
 * Un decoupage en salles se verifie en Node — les rectangles, les
 * chevauchements, la reprise. Ce qui ne se verifie qu'ici, c'est que
 * l'ensemble TIENT : qu'on court, qu'on change d'ecran, que la camera s'y
 * arrete, et qu'on repart de l'entree du tableau quand on meurt.
 */
{
  await p.selectOption('#monde', 'ascension')
  await p.waitForTimeout(450)
  await p.click('#jouer')
  await p.waitForTimeout(350)

  const sonde = () => p.evaluate(() => window.pfe.monde.sonde())
  const camera = () => p.evaluate(() => ({
    x: Math.round(window.pfe.jeu.camera.x), y: Math.round(window.pfe.jeu.camera.y),
  }))

  const debut = await sonde()
  const camDebut = await camera()
  ok('l’Ascension commence dans un tableau', debut.salle === 'depart' && debut.salles === 6,
    `« ${debut.salle} » sur ${debut.salles} tableaux`)
  ok('et le héros y meurt d’un seul coup', debut.pv === 1,
    `${debut.pv} pv — le contrat de Celeste, qui ne tient que parce que la reprise est immédiate`)

  // On court a droite en sautillant : c'est tout ce qu'il faut pour passer
  // dans le tableau suivant.
  await p.keyboard.down('ArrowRight')
  for (let i = 0; i < 24; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(110) }
  await p.keyboard.up('ArrowRight')
  await p.waitForTimeout(400)
  const apres = await sonde()
  const camApres = await camera()
  ok('en courant, on passe dans le tableau suivant',
    apres.salle === 'faille' && apres.changements >= 1,
    `« ${debut.salle} » puis « ${apres.salle} », ${apres.changements} changement(s)`)
  ok('et la caméra a suivi, d’un tableau à l’autre',
    camApres.x === camDebut.x + 320 && camApres.y === camDebut.y,
    `${camDebut.x},${camDebut.y} puis ${camApres.x},${camApres.y} — un tableau fait 320 px`)

  /*
   * LA REGLE QUI FAIT TOUT. On tombe hors du monde, ce qui tue, et l'on doit
   * repartir de l'ENTREE DU TABLEAU COURANT — pas du depart du chapitre.
   */
  const reprise = apres.reprise
  const mortsAvant = apres.morts
  await p.evaluate(() => { window.pfe.monde.heros.y += 400 })
  await p.waitForTimeout(1400)
  const ressuscite = await sonde()
  ok('tomber hors du monde tue au lieu de chuter sans fin',
    ressuscite.morts > mortsAvant,
    `${mortsAvant} puis ${ressuscite.morts} morts — sans cette règle, le jeu a l’air figé alors qu’il tourne`)
  // On tolere une case vers le BAS : quand le tableau a ete franchi en l'air
  // — la cadence des sauts du banc en decide — l'entree est un point en
  // vol, et le heros reapparu s'y pose puis retombe sur le sol d'en dessous
  // avant qu'on mesure. C'est la reapparition qui est la regle, pas la
  // gravite qui la suit.
  ok('et l’on repart de l’entrée du tableau, pas du départ du chapitre',
    Math.abs(ressuscite.heros.x - reprise.x) < 2
    && ressuscite.heros.y - reprise.y > -2 && ressuscite.heros.y - reprise.y < 18
    && ressuscite.salle === 'faille',
    `revenu en ${Math.round(ressuscite.heros.x)},${Math.round(ressuscite.heros.y)} `
    + `pour une entrée en ${reprise.x},${reprise.y}`)
}

/*
 * LA PARALLAXE, MESUREE ET NON REGARDEE.
 *
 * Le fond de la caverne defile a 40 % de la camera. Le verifier a l'oeil n'est
 * pas une verification : la premiere version de ce fond etait entierement
 * RECOUVERTE par un aplat opaque pose devant, elle ne bougeait donc jamais, et
 * elle avait l'air parfaitement normale — un fond fixe ressemble a un fond.
 *
 * On mesure le glissement pour de bon : on releve une bande de pixels du fond,
 * on deplace la camera, on releve la meme bande, et l'on cherche de combien il
 * faut decaler l'une pour retrouver l'autre.
 *
 * Cette mesure est la DERNIERE du banc, et sur un monde recharge : elle
 * teleporte le heros, ce qui lui fait traverser des balises et deplacer son
 * point de reprise. Placee au milieu, elle faisait echouer une verification
 * qui n'avait rien a voir — et c'est ce genre d'echec qu'on met une heure a
 * attribuer.
 */
{
  await p.selectOption('#monde', 'caverne')
  await p.waitForTimeout(400)
  await p.click('#jouer')
  await p.waitForTimeout(300)
  await passerDialogue()

  const camera = () => p.evaluate(() => Math.round(window.pfe.jeu.camera.x))
  const poser = (x) => p.evaluate((v) => {
    window.pfe.monde.heros.x = v
    window.pfe.jeu.camera.x = Math.max(0, v - 160)
  }, x)

  /*
   * On lit le TAMPON DU JEU, pas le canevas affiche.
   *
   * Le canevas affiche est une copie reechelonnee du tampon, avec des bandes
   * noires et un filtrage du navigateur : mesurer dedans donnait des
   * glissements de 4,5 puis 28,5 pixels, tous faux, et tous plausibles. Le
   * tampon fait exactement la taille de la vue — 320 sur 180 — et un pixel y
   * est un pixel.
   */
  const rangees = () => p.evaluate(() => {
    const c = window.pfe.jeu.ecran.tampon
    const ctx = window.pfe.jeu.ecran.ctx
    const out = []
    for (let y = 0; y < c.height; y += 6) {
      const d = ctx.getImageData(0, y, c.width, 1).data
      const l = []
      for (let x = 0; x < c.width; x++) l.push(d[x * 4] + d[x * 4 + 1] * 256 + d[x * 4 + 2] * 65536)
      out.push({ y, l })
    }
    return out
  })

  await poser(20 * 16)
  await p.waitForTimeout(350)
  const avant = await rangees()
  const camAvant = await camera()
  await poser(26 * 16)
  await p.waitForTimeout(350)
  const apres = await rangees()
  const deplacement = (await camera()) - camAvant

  /** De combien la rangee `i` a glisse, en pixels de jeu. */
  const glissement = (i) => {
    const a = avant[i].l
    const b = apres[i].l
    let best = 0
    let mieux = Infinity
    for (let d = 0; d <= Math.floor(a.length * 0.6); d++) {
      let e = 0
      for (let x = d; x < a.length; x++) e += Math.abs(a[x] - b[x - d])
      const moyen = e / (a.length - d)
      if (moyen < mieux) { mieux = moyen; best = d }
    }
    return best
  }
  const glissements = avant.map((r, i) => ({ y: r.y, d: glissement(i) }))
  const attenduFond = Math.round(deplacement * 0.4)

  ok('la caméra a bougé, sinon la mesure ne veut rien dire', deplacement > 30, `${deplacement} px`)

  /*
   * Deux populations, et il FAUT les deux.
   *
   * Le haut de l'écran ne montre que le lointain : il doit glisser de 40 %.
   * Le sol, lui, glisse de la caméra entière. Ne vérifier que le fond
   * laisserait passer un fond immobile aussi bien qu'un fond juste ; ne
   * vérifier que le sol ne dirait rien de la parallaxe. C'est l'ÉCART entre
   * les deux qui prouve qu'il y a de la profondeur.
   */
  const fond = glissements.filter((g) => g.y < 100 && g.d > 0)
  const sol = glissements.filter((g) => g.y >= 110 && g.y < 150 && g.d > 0)
  /*
   * On prend la MEDIANE et non le compte exact.
   *
   * Le haut de l'ecran n'est pas que du lointain : une passerelle, une
   * corniche y passent, et ces rangees-la glissent avec le sol. Exiger que
   * toutes les rangees s'accordent revenait a exiger que la salle soit vide,
   * c'est-a-dire a mesurer le niveau plutot que la parallaxe. La mediane
   * ignore ces quelques rangees sans rien cacher : si le fond ne bougeait
   * pas, elle vaudrait zero.
   */
  const mediane = (l) => {
    const t = l.map((g) => g.d).sort((a, b) => a - b)
    return t.length ? t[Math.floor(t.length / 2)] : -1
  }
  const medFond = mediane(fond)
  const medSol = mediane(sol)

  ok('le fond lointain défile à 40 % de la caméra, mesuré au pixel',
    fond.length >= 5 && Math.abs(medFond - attenduFond) <= 1,
    `${medFond} px pour ${deplacement} px de caméra, attendu ${attenduFond} `
    + `(${fond.length} rangées de fond)`)
  ok('et le sol, lui, défile à 100 % : c’est l’écart qui fait la profondeur',
    sol.length >= 2 && Math.abs(medSol - deplacement) <= 2 && medSol - medFond > 20,
    `sol ${medSol} px contre fond ${medFond} px — un fond qui bougerait autant `
    + `n’aurait aucune profondeur`)
}

console.log('\nerreurs de page:', err.length ? err.join('\n') : 'aucune')
const echecs = bilan.filter(x => !x.v).length
console.log(`${bilan.length - echecs}/${bilan.length} verifications`)
await b.close(); process.exit(echecs || err.length ? 1 : 0)
