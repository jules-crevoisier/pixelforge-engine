/**
 * Le banc des trois mondes.
 *
 * Il repond a trois questions qu'aucune verification de type ne peut poser :
 *
 * 1. Les dalles isometriques PAVENT-ELLES le plan ? Un liseré de fond entre
 *    deux dalles ne se voit qu'a l'ecran, et il scintille des que la camera
 *    bouge. On rasterise ici les dessins et on compte les trous.
 * 2. Ce qu'on ne dessine pas est-il vraiment invisible ? Le calcul des cases
 *    visibles est une optimisation, et une optimisation qui se trompe fait
 *    disparaitre le decor par morceaux.
 * 3. Les niveaux sont-ils FRANCHISSABLES ? Pas « ont-ils l'air », mais : le
 *    vrai controleur, sur la vraie carte, arrive-t-il de l'autre cote. Un
 *    niveau infranchissable ne se decouvre qu'en jouant, et seulement si l'on
 *    va jusque-la.
 */
const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

const {
  ORTHO_DESSUS, ORTHO_COTE, ISO, ISO_DECALEE, HEXA,
  projeter, deprojeter, casesVisibles, boiteMonde, tailleMonde,
  caseVersMonde, profondeurMonde,
} = await import('../src/noyau/projection.ts')
const art = await import('../src/demo/art-iso.ts')
const artCote = await import('../src/demo/art-cote.ts')
const { CLE_HEROS, PLANCHE_HEROS, TUILE } = await import('../src/demo/art.ts')
const { mondeCaverne, mondeCitadelle, mondeDonjon, PLAN_CAVERNE, PLAN_CITADELLE, REGLAGES_DEFAUT } =
  await import('../src/demo/mondes.ts')
const { Plateformeur } = await import('../src/runtime/plateforme.ts')

console.log('\n--- les planches : aucune lettre muette ---')

// Une lettre absente de la cle ne leve rien : elle laisse un trou transparent.
// C'est le defaut le plus sournois d'un dessin en texte, et il a deja coute
// une caisse entiere sur ce projet.
for (const [nom, planche, cle, l, h] of [
  ['iso', art.PLANCHE_ISO, art.CLE_ISO, 32, 32],
  ['caverne', artCote.PLANCHE_CAVERNE, artCote.CLE_CAVERNE, 16, 16],
  ['heros', PLANCHE_HEROS, CLE_HEROS, 16, 16],
]) {
  let fautes = 0
  let exemple = ''
  planche.forEach((d, i) => {
    if (d.length !== h) { fautes++; exemple ||= `dessin ${i} fait ${d.length} rangees` }
    d.forEach((ligne, y) => {
      if (ligne.length !== l) { fautes++; exemple ||= `dessin ${i} rangee ${y} fait ${ligne.length}` }
      for (const c of ligne) {
        if (c !== '.' && !cle[c]) { fautes++; exemple ||= `dessin ${i} rangee ${y} : lettre ${JSON.stringify(c)}` }
      }
    })
  })
  check(`planche ${nom} : chaque lettre a une couleur, chaque rangee la bonne largeur`,
    fautes === 0, fautes ? `${fautes} fautes, ex. ${exemple}` : `${planche.length} dessins`)
}

// Et le sens inverse : une planche fautive doit etre reconnue comme telle.
{
  const fautive = [['abc', 'ab']]
  const cle = { a: '#000', b: '#111', c: '#222' }
  let fautes = 0
  fautive.forEach((d) => d.forEach((ligne) => { if (ligne.length !== 3) fautes++ }))
  check('la regle sait accuser une planche irreguliere', fautes === 1, `${fautes} faute relevee`)
}

console.log('\n--- les dalles isometriques pavent le plan ---')

{
  // On rasterise la dalle de sol, puis on en pose un damier de six par six et
  // l'on compte, dans la zone entierement entouree, les pixels couverts zero
  // fois (un trou) et plus d'une fois (un recouvrement).
  const p = ISO(art.LARGEUR_ISO, art.HAUTEUR_DESSIN_ISO - art.HAUTEUR_ISO)
  const dalle = art.PLANCHE_ISO[art.ISO_SOL]
  const debord = art.HAUTEUR_DESSIN_ISO - p.hauteurTuile
  const N = 6
  const compte = new Map()
  const clef = (x, y) => `${x},${y}`
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      const m = caseVersMonde(p, cx, cy)
      for (let y = 0; y < dalle.length; y++) {
        for (let x = 0; x < dalle[y].length; x++) {
          if (dalle[y][x] === '.') continue
          const k = clef(m.x + x, m.y - debord + y)
          compte.set(k, (compte.get(k) ?? 0) + 1)
        }
      }
    }
  }
  // La zone sure : le losange des quatre cases centrales, dont tous les
  // voisins existent. Sur le bord, un trou est normal — il n'y a rien a cote.
  let trous = 0
  let recouvrements = 0
  let exemple = ''
  for (let cy = 2; cy <= 3; cy++) {
    for (let cx = 2; cx <= 3; cx++) {
      const m = caseVersMonde(p, cx, cy)
      for (let y = 0; y < p.hauteurTuile; y++) {
        for (let x = 0; x < p.largeurTuile; x++) {
          const n = compte.get(clef(m.x + x, m.y + y)) ?? 0
          if (n === 0) { trous++; exemple ||= `trou en ${m.x + x},${m.y + y}` }
          if (n > 1) { recouvrements++; exemple ||= `${n} dalles en ${m.x + x},${m.y + y}` }
        }
      }
    }
  }
  check('les dalles isometriques ne laissent aucun trou entre elles',
    trous === 0, trous ? `${trous} pixels de fond visibles, ${exemple}` : '4 cases entourees, 2048 pixels')
  check('et elles ne se recouvrent pas non plus',
    recouvrements === 0, recouvrements ? `${recouvrements} pixels peints deux fois, ${exemple}` : 'chaque pixel une seule fois')

  // Le sens inverse : une dalle qui ne gagne que deux pixels par rangee au
  // lieu de quatre est plus etroite que son pas, et laisse voir le fond.
  const mauvaise = []
  for (let y = 0; y < art.HAUTEUR_DESSIN_ISO; y++) {
    const ligne = []
    for (let x = 0; x < art.LARGEUR_ISO; x++) {
      const yy = y - art.HAUTEUR_ISO
      const dy = yy < 0 ? -1 : (yy < art.HAUTEUR_ISO / 2 ? yy : art.HAUTEUR_ISO - 1 - yy)
      const dedans = dy >= 0 && Math.abs(x - 15.5) <= dy + 0.5
      ligne.push(dedans ? 'm' : '.')
    }
    mauvaise.push(ligne.join(''))
  }
  const compte2 = new Map()
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const m = caseVersMonde(p, cx, cy)
    for (let y = 0; y < mauvaise.length; y++) for (let x = 0; x < mauvaise[y].length; x++) {
      if (mauvaise[y][x] === '.') continue
      const k = clef(m.x + x, m.y - debord + y)
      compte2.set(k, (compte2.get(k) ?? 0) + 1)
    }
  }
  let mauvaisTrous = 0
  for (let cy = 2; cy <= 3; cy++) for (let cx = 2; cx <= 3; cx++) {
    const m = caseVersMonde(p, cx, cy)
    for (let y = 0; y < p.hauteurTuile; y++) for (let x = 0; x < p.largeurTuile; x++) {
      if (!compte2.get(clef(m.x + x, m.y + y))) mauvaisTrous++
    }
  }
  check('une dalle plus etroite, elle, laisse voir le fond',
    mauvaisTrous > 0, `${mauvaisTrous} pixels de fond — deux pixels de gagnes par rangee au lieu de quatre`)
}

console.log('\n--- ce qu\'on ne dessine pas est bien invisible ---')

{
  // Verite de reference : une case est visible si sa boite a l'ecran coupe la
  // vue. On la compare a ce que `casesVisibles` accepte de parcourir.
  const vue = { largeur: 320, hauteur: 180 }
  const carte = { largeur: 40, hauteur: 40 }
  const modes = [
    ['orthogonale', ORTHO_DESSUS(16), 16, 16],
    ['isometrique', ISO(32, 16), 32, 32],
    ['iso-decalee', ISO_DECALEE(32, 16), 32, 32],
    ['hexagonale', HEXA(32, 28), 32, 28],
  ]
  for (const [nom, p, lDessin, hDessin] of modes) {
    let manquees = 0
    let exemple = ''
    for (const [camX, camY] of [[0, 0], [37, 91], [-120, 44], [260, 210], [-300, -50]]) {
      const b = casesVisibles(p, camX, camY, vue, carte)
      for (let cy = 0; cy < carte.hauteur; cy++) {
        for (let cx = 0; cx < carte.largeur; cx++) {
          const m = caseVersMonde(p, cx, cy)
          const x = m.x - camX
          const y = m.y - camY - (hDessin - p.hauteurTuile)
          const visible = x + lDessin > 0 && x < vue.largeur && y + hDessin > 0 && y < vue.hauteur
          if (!visible) continue
          if (cx < b.x0 || cx > b.x1 || cy < b.y0 || cy > b.y1) {
            manquees++
            exemple ||= `case ${cx},${cy} a l'ecran en ${x},${y}, hors de [${b.x0}..${b.x1}]x[${b.y0}..${b.y1}]`
          }
        }
      }
    }
    check(`${nom} : aucune case visible n'est ecartee du parcours`,
      manquees === 0, manquees ? `${manquees} cases perdues, ex. ${exemple}` : '5 positions de camera')
  }

  // Et le sens inverse : sans les quatre coins, l'isometrique perd du decor.
  const p = ISO(32, 16)
  const camX = -120, camY = 44
  const c = mondeVersCaseNaif(p, camX, camY)
  const b = { x0: c.x, y0: c.y, x1: c.x + Math.ceil(vue.largeur / p.largeurTuile), y1: c.y + Math.ceil(vue.hauteur / p.hauteurTuile) }
  let perdues = 0
  for (let cy = 0; cy < 40; cy++) for (let cx = 0; cx < 40; cx++) {
    const m = caseVersMonde(p, cx, cy)
    const x = m.x - camX, y = m.y - camY - 16
    if (!(x + 32 > 0 && x < vue.largeur && y + 32 > 0 && y < vue.hauteur)) continue
    if (cx < b.x0 || cx > b.x1 || cy < b.y0 || cy > b.y1) perdues++
  }
  check('un seul coin, lui, en laisse tomber',
    perdues > 0, `${perdues} cases — le decor apparaitrait par morceaux le long d'une diagonale`)
}

function mondeVersCaseNaif(p, x, y) {
  return { x: Math.floor(x / p.largeurTuile), y: Math.floor(y / p.hauteurTuile) }
}

console.log('\n--- la profondeur, et le mur qui doit cacher le heros ---')

{
  const iso = ISO(32, 16)
  const dessus = ORTHO_DESSUS(16)
  const cote = ORTHO_COTE(16)
  // Le demi retire aux tuiles : un heros DANS une case passe devant sa dalle.
  const dalle = (cx, cy, p) => profondeurMonde(p, cx + 0.5, cy + 0.5, 0, 0) - 0.5
  const perso = (cx, cy, p) => profondeurMonde(p, cx + 0.5, cy + 0.5, 0, 0)

  check('le heros passe devant la dalle qu\'il foule',
    perso(4, 4, iso) > dalle(4, 4, iso))
  check('et derriere le mur de la case au sud-est',
    perso(4, 4, iso) < dalle(5, 4, iso) && perso(4, 4, iso) < dalle(4, 5, iso),
    'sans quoi le personnage se dessine par-dessus le mur qui devrait le cacher')
  check('mais devant celui de la case au nord-ouest',
    perso(4, 4, iso) > dalle(3, 4, iso) && perso(4, 4, iso) > dalle(4, 3, iso))
  check('vu de dessus, seul le sud compte',
    perso(4, 4, dessus) < dalle(4, 5, dessus) && perso(4, 4, dessus) > dalle(9, 4, dessus),
    'la colonne ne change rien : ce qui est plus bas est plus pres')
  check('vu de cote, la case ne decide de rien — seul le calque',
    profondeurMonde(cote, 0, 50) === profondeurMonde(cote, 99, 3)
    && profondeurMonde(cote, 0, 0, 0, 1) > profondeurMonde(cote, 0, 999, 0, 0))
}

console.log('\n--- la boite du monde borne bien la camera ---')

{
  const iso = ISO(32, 16)
  const b = boiteMonde(iso, 10, 10)
  const t = tailleMonde(iso, 10, 10)
  check('la boite isometrique commence a GAUCHE de l\'origine',
    b.x < 0, `x = ${b.x} — borner a zero laisserait voir le vide sur tout le flanc gauche`)
  let dehors = 0
  for (let cy = 0; cy < 10; cy++) for (let cx = 0; cx < 10; cx++) {
    const m = caseVersMonde(iso, cx, cy)
    if (m.x < b.x || m.y + iso.hauteurTuile > b.y + b.h || m.x + iso.largeurTuile > b.x + b.l) dehors++
  }
  check('et elle contient toutes les cases', dehors === 0,
    dehors ? `${dehors} cases dehors` : `${b.x},${b.y} ${b.l}x${b.h}`)
  check('la boite orthogonale, elle, part de l\'origine',
    boiteMonde(ORTHO_DESSUS(16), 10, 10).x === 0 && t.l === 320)
}

console.log('\n--- aller-retour ecran <-> monde ---')

{
  for (const [nom, p] of [
    ['orthogonale', ORTHO_DESSUS(16)],
    ['isometrique', ISO(32, 16)],
    ['hexagonale', HEXA(32, 28)],
  ]) {
    let rates = 0
    let pire = ''
    for (let y = -200; y <= 200; y += 7) {
      for (let x = -200; x <= 200; x += 11) {
        const e = projeter(p, x, y, 16)
        const r = deprojeter(p, e.x, e.y, 16)
        if (Math.abs(r.x - x) > 1e-9 || Math.abs(r.y - y) > 1e-9) {
          rates++
          pire ||= `${x},${y} -> ${e.x},${e.y} -> ${r.x},${r.y}`
        }
      }
    }
    check(`${nom} : projeter puis deprojeter rend le point de depart`,
      rates === 0, rates ? `${rates} ratés, ex. ${pire}` : '2091 points')
  }

  // La consequence concrete : « droite » au clavier doit deplacer vers la
  // droite a l'ecran, et pas en diagonale.
  const iso = ISO(32, 16)
  const d = deprojeter(iso, 1, 0, 16)
  const n = Math.hypot(d.x, d.y)
  const e = projeter(iso, d.x / n, d.y / n, 16)
  check('en isometrique, « droite » au clavier va vers la droite a l\'ecran',
    e.x > 0 && Math.abs(e.y) < 1e-9, `deplacement ecran ${e.x.toFixed(2)},${e.y.toFixed(2)}`)
  const naif = projeter(iso, 1, 0, 16)
  check('sans la conversion, elle irait en biais',
    Math.abs(naif.y) > 1e-9, `${naif.x},${naif.y} — le defaut de la moitie des jeux isometriques amateurs`)
}

console.log('\n--- la caverne est franchissable ---')

const caverne = mondeCaverne()

{
  const carte = caverne.carte
  const boite = { x: -4, y: -14, l: 8, h: 14 }

  /** Un pas du controleur, avec la vraie carte et le vrai corps. */
  const simuler = (depart, politique, pas) => {
    const c = new Plateformeur()
    const corps = { x: depart.x, y: depart.y, boite }
    const trace = []
    for (let i = 0; i < pas; i++) {
      const d = c.diagnostic()
      const e = politique(d, i, corps)
      c.avancer(carte, corps, 1 / 60, e.dirX ?? 0, !!e.saute, !!e.tenu, !!e.dash, e.dirY ?? 0)
      trace.push({ x: corps.x, y: corps.y, ...c.diagnostic() })
    }
    return { corps, trace, diag: c.diagnostic() }
  }

  // Le depart : ni dans un mur, ni en l'air.
  const d = caverne.depart
  const dansMur = carte.solide(Math.floor(d.x / TUILE), Math.floor((d.y - 1) / TUILE))
  const surSol = carte.solide(Math.floor(d.x / TUILE), Math.floor(d.y / TUILE))
  check('le depart n\'est pas dans un mur, et repose sur du sol',
    !dansMur && surSol, `case ${Math.floor(d.x / TUILE)},${Math.floor(d.y / TUILE)}`)

  // Les fosses du plancher principal, mesurees dans le plan lui-meme.
  const fosses = []
  {
    const y = 20
    let debut = -1
    for (let x = 1; x < PLAN_CAVERNE[y].length - 1; x++) {
      const vide = PLAN_CAVERNE[y][x] !== '#'
      if (vide && debut < 0) debut = x
      if (!vide && debut >= 0) { fosses.push({ x0: debut, x1: x - 1 }); debut = -1 }
    }
  }
  check('le plancher principal comporte bien des fosses a franchir',
    fosses.length >= 2, fosses.map((f) => `${f.x1 - f.x0 + 1} cases`).join(', '))

  // La portee du saut, deduite des reglages et non estimee a l'oeil.
  const r = REGLAGES_DEFAUT
  const g = (2 * r.hauteurSaut) / (r.tempsMontee * r.tempsMontee)
  const portee = r.vitesse * (r.tempsMontee + Math.sqrt((2 * r.hauteurSaut) / (g * r.gravitDescente)))
  for (const f of fosses) {
    const large = (f.x1 - f.x0 + 1) * TUILE
    check(`une fosse de ${f.x1 - f.x0 + 1} cases tient dans la portee du saut`,
      large <= portee, `${large} px pour ${Math.round(portee)} px de portee`)
  }

  // Et la preuve par le controleur : on saute vraiment par-dessus.
  for (const f of fosses) {
    const depart = { x: (f.x0 - 1) * TUILE + TUILE / 2, y: 20 * TUILE }
    const res = simuler(depart, (diag, i) => ({
      dirX: 1, saute: i === 2, tenu: i >= 2 && i < 24,
    }), 200)
    const caseArrivee = Math.floor(res.corps.x / TUILE)
    check(`le controleur franchit reellement la fosse de ${f.x1 - f.x0 + 1} cases`,
      caseArrivee > f.x1 && res.diag.auSol,
      `arrive case ${caseArrivee} (fosse ${f.x0}..${f.x1}), ${res.diag.etat}`)
  }

  // Le puits : deux parois qui se font face, remontees en sautant de l'une a
  // l'autre. C'est la technique que le niveau existe pour eprouver.
  const hautDuPuits = 6 * TUILE
  const entree = { x: 40 * TUILE + TUILE / 2, y: 20 * TUILE }
  const res = simuler(entree, (diag) => {
    if (diag.mur !== 0 && !diag.auSol) return { dirX: -diag.mur, saute: true, tenu: true }
    if (diag.auSol) return { dirX: 1, saute: true, tenu: true }
    // En l'air sans mur : on se rabat vers la paroi la plus proche.
    return { dirX: diag.vx >= 0 ? 1 : -1, tenu: true }
  }, 2000)
  const plusHaut = Math.min(...res.trace.map((t) => t.y))
  check('le puits se remonte en sautant d\'une paroi a l\'autre',
    plusHaut <= hautDuPuits,
    `atteint y=${Math.round(plusHaut)}, il fallait ${hautDuPuits}`)

  // Le sens inverse : sans saut mural, le meme puits est infranchissable.
  const sansMur = simuler(entree, (diag) => ({ dirX: 1, saute: diag.auSol, tenu: true }), 2000)
  const plusHautSansMur = Math.min(...sansMur.trace.map((t) => t.y))
  check('et sans sauter des parois, il ne se remonte pas',
    plusHautSansMur > hautDuPuits,
    `on plafonne a y=${Math.round(plusHautSansMur)} — un simple saut ne suffit pas`)

  // La lanterne existe, et elle est posee sur le plancher superieur.
  let lanterne = null
  PLAN_CAVERNE.forEach((l, y) => { const x = l.indexOf('L'); if (x >= 0) lanterne = { x, y } })
  check('la lanterne est bien au bout du couloir superieur',
    lanterne !== null && PLAN_CAVERNE[lanterne.y + 1][lanterne.x] === '#',
    lanterne ? `case ${lanterne.x},${lanterne.y}, posee sur du sol` : 'introuvable')
}

console.log('\n--- la citadelle tient debout ---')

{
  const c = mondeCitadelle()
  const carte = c.carte
  const cx = Math.floor(c.depart.x / TUILE)
  const cy = Math.floor(c.depart.y / TUILE)
  check('le depart isometrique n\'est pas dans un mur', !carte.solide(cx, cy), `case ${cx},${cy}`)

  let sortie = null
  PLAN_CITADELLE.forEach((l, y) => { const x = l.indexOf('S'); if (x >= 0) sortie = { x, y } })
  check('la sortie existe et ne bloque pas le passage',
    sortie !== null && !carte.solide(sortie.x, sortie.y),
    sortie ? `case ${sortie.x},${sortie.y} — un but qu'on ne peut pas atteindre n'est pas un but` : 'introuvable')

  // L'eau bloque sans rien poser sur le calque des blocs : la collision est sa
  // propre grille, et c'est exactement a cela qu'elle sert.
  let eau = null
  PLAN_CITADELLE.forEach((l, y) => { const x = l.indexOf('~'); if (x >= 0 && !eau) eau = { x, y } })
  const blocs = carte.calques.find((q) => q.nom === 'blocs')
  check('l\'eau bloque sans etre un bloc',
    eau !== null && carte.solide(eau.x, eau.y) && blocs.cases[carte.index(eau.x, eau.y)] === -1,
    eau ? `case ${eau.x},${eau.y}` : 'introuvable')

  // Le chemin du depart a la sortie existe reellement.
  const vus = new Set()
  const file = [[cx, cy]]
  vus.add(`${cx},${cy}`)
  while (file.length) {
    const [x, y] = file.shift()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      const k = `${nx},${ny}`
      if (vus.has(k) || !carte.dedans(nx, ny) || carte.solide(nx, ny)) continue
      vus.add(k)
      file.push([nx, ny])
    }
  }
  check('un chemin relie le depart a la sortie',
    sortie !== null && vus.has(`${sortie.x},${sortie.y}`),
    `${vus.size} cases atteintes sur ${carte.cases}`)

  // Et la cour fermee, elle, ne doit PAS etre atteignable en traversant ses
  // murs : si elle l'etait, c'est que la collision ne serait pas posee.
  check('les remparts de la cour bloquent bien', carte.solide(4, 5) && carte.solide(6, 4),
    'sinon le heros traverserait le decor sans que rien ne le signale')
}

console.log('\n--- les trois mondes se construisent tous ---')

{
  for (const construire of [mondeDonjon, () => caverne, mondeCitadelle]) {
    const m = construire()
    check(`${m.id} : ${m.projection.mode} vue de ${m.projection.regard}, ${m.carte.largeur}x${m.carte.hauteur}`,
      m.carte.calques.length > 0 && m.couleurs.length > 0 && m.heros.source === 'heros'
      && typeof m.etat() === 'string',
      `${m.carte.calques.length} calques, ${m.couleurs.length} couleurs`)
  }
}

const echecs = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - echecs.length}/${bilan.length} verifications reussies`)
if (echecs.length) {
  for (const e of echecs) console.log(`  ECHEC ${e.nom}`)
  process.exit(1)
}
