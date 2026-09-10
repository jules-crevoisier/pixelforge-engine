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
const artCreatures = await import('../src/demo/art-creatures.ts')
const { CLE_HEROS, PLANCHE_HEROS, TUILE } = await import('../src/demo/art.ts')
const { mondeCaverne, mondeCitadelle, mondeDonjon, PLAN_CAVERNE, PLAN_CITADELLE, REGLAGES_DEFAUT } =
  await import('../src/demo/mondes.ts')
const { Plateformeur } = await import('../src/runtime/plateforme.ts')
const { Lecteur, clip, clipRegulier, ordreDeLecture, dureeDe, imageA } =
  await import('../src/runtime/animation.ts')

console.log('\n--- le lecteur d\'animation ---')

{
  const marche = clipRegulier('marche', [10, 11, 12, 13], 100, {
    evenements: [{ image: 0, nom: 'pas' }, { image: 2, nom: 'pas' }],
  })
  const repos = clipRegulier('repos', [9], 1000)

  // Le defaut le plus courant des premiers jeux faits a la main : le script
  // tourne a chaque pas et redemande « marche », l'animation repart de son
  // premier dessin soixante fois par seconde, et le personnage ne bouge jamais.
  {
    const l = new Lecteur([marche, repos])
    const vus = new Set()
    for (let i = 0; i < 60; i++) { l.jouer('marche'); l.avancer(1000 / 60); vus.add(l.image) }
    check('redemander le clip en cours ne le recommence pas',
      vus.size === 4, `${vus.size} dessins vus en une seconde — il en fallait 4`)

    const naif = new Lecteur([marche, repos])
    const vusNaif = new Set()
    for (let i = 0; i < 60; i++) { naif.jouer('marche', true); naif.avancer(1000 / 60); vusNaif.add(naif.image) }
    check('et le forcer, lui, fige bien l\'animation',
      vusNaif.size === 1, `${vusNaif.size} dessin — c'est le defaut que la regle evite`)
  }

  // Une image de jeu longue ne doit pas AVALER les evenements traverses.
  {
    const l = new Lecteur([marche])
    l.jouer('marche')
    const gros = l.avancer(400)
    let fin = 0
    const petit = new Lecteur([marche])
    petit.jouer('marche')
    for (let i = 0; i < 400; i++) fin += petit.avancer(1).filter((e) => e === 'pas').length
    check('un pas de temps long ne perd aucun evenement',
      gros.filter((e) => e === 'pas').length === fin,
      `${gros.filter((e) => e === 'pas').length} en un bond, ${fin} en quatre cents petits`)

    // Le sens inverse, avec un vrai lecteur naif : il calcule le dessin ou il
    // ATTERRIT et ne releve que celui-la. C'est la version qu'on ecrit
    // spontanement, et celle qui avale le bruit de pas quand la machine rame.
    const naif = (dtMs) => {
      const n = marche.images.length
      const duree = marche.images[0].duree
      const avant = 0
      const apres = Math.floor((avant + dtMs) / duree) % n
      return marche.evenements.filter((e) => e.image === apres).map((e) => e.nom)
    }
    check('un lecteur qui saute au bon dessin, lui, en perd',
      naif(400).length < fin,
      `${naif(400).length} evenement au lieu de ${fin} sur un seul a-coup de 400 ms`)
  }

  // L'aller-retour ne repete pas ses extremites.
  {
    const va = clipRegulier('va', [0, 1, 2, 3], 100, { boucle: 'aller-retour' })
    const ordre = ordreDeLecture(va)
    check('l\'aller-retour ne repete pas ses extremites',
      ordre.length === 6 && ordre.join(',') === '0,1,2,3,2,1',
      `${ordre.join(',')} — les repeter ferait tenir les deux bouts deux fois plus longtemps`)
    check('et sa duree suit', dureeDe(va) === 600, `${dureeDe(va)} ms`)
    check('un clip a deux images n\'a rien a inverser',
      ordreDeLecture(clipRegulier('deux', [0, 1], 100, { boucle: 'aller-retour' })).length === 2)
  }

  // Un clip unique s'arrete, previent, et enchaine s'il a une suite.
  {
    const attaque = clip('attaque', [{ index: 20, duree: 80 }, { index: 21, duree: 80 }],
      { boucle: 'unique', suite: 'repos', evenements: [{ image: 1, nom: 'coup' }] })
    const l = new Lecteur([attaque, repos])
    l.jouer('attaque')
    const e1 = l.avancer(80)
    check('un clip unique declenche ses evenements en route', e1.includes('coup'), e1.join(','))
    const e2 = l.avancer(80)
    check('puis il annonce sa fin et enchaine sur sa suite',
      e2.includes('fin') && l.nom === 'repos', `${e2.join(',')} puis ${l.nom}`)

    // Sans suite, il tient sa derniere image au lieu de disparaitre.
    const seul = clip('seul', [{ index: 30, duree: 50 }], { boucle: 'unique' })
    const m = new Lecteur([seul])
    m.jouer('seul')
    m.avancer(5000)
    check('sans suite, il tient sa derniere image',
      m.image === 30 && m.termine, `image ${m.image}, termine ${m.termine}`)
  }

  // Le lecteur a etat et la fonction pure doivent tomber d'accord, sinon le
  // moteur et ses portages dans six langages divergent des la premiere image.
  {
    const cas = [
      clipRegulier('boucle', [10, 11, 12, 13], 100),
      clipRegulier('inegal', [4, 5, 6], 70, {}),
      clip('inegal2', [{ index: 1, duree: 30 }, { index: 2, duree: 250 }, { index: 3, duree: 90 }]),
      clipRegulier('va', [0, 1, 2, 3], 100, { boucle: 'aller-retour' }),
      clip('seul', [{ index: 7, duree: 40 }, { index: 8, duree: 60 }], { boucle: 'unique' }),
    ]
    let ecarts = 0
    let pire = ''
    for (const c of cas) {
      const l = new Lecteur([c])
      l.jouer(c.nom)
      let t = 0
      // Le lecteur avance par petits pas, la fonction pure repond directement :
      // c'est la comparaison qui a du sens, celle de deux chemins differents.
      for (let i = 0; i < 400; i++) {
        const attendu = imageA(c, t)
        if (l.image !== attendu) {
          ecarts++
          pire ||= `${c.nom} a ${t} ms : lecteur ${l.image}, imageA ${attendu}`
        }
        l.avancer(7)
        t += 7
      }
    }
    check('le lecteur et la fonction pure rendent la meme image',
      ecarts === 0, ecarts ? `${ecarts} ecarts, ex. ${pire}` : '2000 instants sur cinq clips')
  }

  // Un pas de temps enorme — un onglet revenu au premier plan — ne doit pas
  // faire tourner la boucle des milliers de fois.
  {
    const l = new Lecteur([marche])
    l.jouer('marche')
    const debut = process.hrtime.bigint()
    l.avancer(3600 * 1000)
    const ms = Number(process.hrtime.bigint() - debut) / 1e6
    check('une heure d\'un coup ne fait pas tourner la boucle une heure',
      ms < 20, `${ms.toFixed(2)} ms — le garde-fou plafonne a deux tours de clip`)
  }
}

console.log('\n--- le cycle de marche du heros ---')

{
  const { PLANCHE_HEROS, TEMPS_PAR_DIRECTION, TEMPS_MARCHE, TEMPS_REPOS, imageHeros,
          DIR_BAS, DIR_DROITE, DIR_HAUT } = await import('../src/demo/art.ts')
  check('la planche porte les quatre directions et leurs cinq temps',
    PLANCHE_HEROS.length === 4 * TEMPS_PAR_DIRECTION, `${PLANCHE_HEROS.length} dessins`)

  // Les quatre temps doivent etre DIFFERENTS. Un cycle dont deux images sont
  // identiques saccade, et une planche mal indexee ne se voit pas autrement.
  for (const [nom, dir] of [['bas', DIR_BAS], ['cote', DIR_DROITE], ['haut', DIR_HAUT]]) {
    const temps = TEMPS_MARCHE.map((t) => PLANCHE_HEROS[imageHeros(dir, t)].join('\n'))
    const distincts = new Set(temps).size
    check(`${nom} : contact et passage ne se ressemblent pas`,
      distincts >= 2 && temps[1] !== temps[3],
      `${distincts} poses distinctes sur 4, et les deux passages levent bien un pied different`)
  }

  // Le repos n'est aucun des quatre temps.
  const repos = PLANCHE_HEROS[imageHeros(DIR_BAS, TEMPS_REPOS)].join('\n')
  check('le repos n\'est aucune des poses de marche',
    TEMPS_MARCHE.every((t) => PLANCHE_HEROS[imageHeros(DIR_BAS, t)].join('\n') !== repos),
    'un personnage arrete les jambes en ciseaux a l\'air d\'attendre qu\'on lui rende la main')

  // Et le cycle garde les pieds au sol : aucune pose ne doit flotter de plus
  // d'un pixel au-dessus de la ligne de contact.
  const basDe = (d) => { for (let y = d.length - 1; y >= 0; y--) if (/[^.]/.test(d[y])) return y; return -1 }
  const lignes = TEMPS_MARCHE.map((t) => basDe(PLANCHE_HEROS[imageHeros(DIR_DROITE, t)]))
  check('aucune pose du cycle ne decolle du sol',
    Math.max(...lignes) - Math.min(...lignes) <= 1,
    `rangees basses ${lignes.join(', ')} — un pied leve d'un pixel, pas d'un saut`)
}

console.log('\n--- les planches : aucune lettre muette ---')

// Une lettre absente de la cle ne leve rien : elle laisse un trou transparent.
// C'est le defaut le plus sournois d'un dessin en texte, et il a deja coute
// une caisse entiere sur ce projet.
for (const [nom, planche, cle, l, h] of [
  ['iso', art.PLANCHE_ISO, art.CLE_ISO, 32, 32],
  ['caverne', artCote.PLANCHE_CAVERNE, artCote.CLE_CAVERNE, 16, 16],
  ['heros', PLANCHE_HEROS, CLE_HEROS, 16, 16],
  ['creatures', artCreatures.PLANCHE_CREATURES, artCreatures.CLE_CREATURES, 16, 16],
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

  /*
   * LES COTES DE LA CAVERNE SE MARCHENT VRAIMENT.
   *
   * Une pente qui se calcule bien dans un plan de banc et qui ne se monte pas
   * dans le vrai niveau ne sert a rien — et c'est exactement le genre de chose
   * qu'on ne decouvre qu'en jouant. On part du sol a gauche des cotes, on
   * court a droite, et l'on demande trois choses : etre monte, etre
   * redescendu, et n'avoir jamais quitte le sol.
   */
  {
    const { estPente, hauteurSol, PENTE_DROITE, PENTE_GAUCHE, PENTE_DEMI, PENTE_HAUTE } =
      await import('../src/tuiles/tilemap.ts')

    /*
     * LE DESSIN ET LA COLLISION NE PEUVENT PAS SE CONTREDIRE.
     *
     * Les tuiles de pente sont dessinees depuis `hauteurSol`, celle-la meme
     * dont se sert le controleur. On le VERIFIE quand meme : le jour ou
     * quelqu'un retouche une rampe a la main pour l'embellir, le personnage
     * marchera un pixel au-dessus de la roche ou s'y enfoncera, et rien ne
     * dira lequel des deux a tort.
     *
     * On mesure le premier pixel opaque de chaque colonne du dessin, et on le
     * compare a la hauteur du sol.
     */
    const { PLANCHE_CAVERNE, TUILE_PENTE_D } = await import('../src/demo/art-cote.ts')
    const FORMES = [
      PENTE_DROITE, PENTE_GAUCHE,
      PENTE_DROITE | PENTE_DEMI, PENTE_DROITE | PENTE_DEMI | PENTE_HAUTE,
      PENTE_GAUCHE | PENTE_DEMI, PENTE_GAUCHE | PENTE_DEMI | PENTE_HAUTE,
    ]
    const ecartsDessin = []
    FORMES.forEach((forme, k) => {
      const dessin = PLANCHE_CAVERNE[TUILE_PENTE_D + k]
      for (let x = 0; x < TUILE; x++) {
        let haut = TUILE
        for (let y = 0; y < TUILE && haut === TUILE; y++) if (dessin[y][x] !== 'f') haut = y
        if (haut !== hauteurSol(forme, x, TUILE)) ecartsDessin.push(`${k}@${x}`)
      }
    })
    check('le dessin d’une côte suit EXACTEMENT sa collision, colonne par colonne',
      ecartsDessin.length === 0,
      ecartsDessin.length
        ? `${ecartsDessin.length} colonnes fausses, ex. forme ${ecartsDessin[0]}`
        : `${FORMES.length * TUILE} colonnes — le dessin est calculé depuis la collision`)

    const pentes = [...carte.solides].filter(estPente).length
    check('la caverne porte les six formes de côte',
      pentes === 6 && new Set([...carte.solides].filter(estPente)).size === 6,
      `${pentes} cases de pente — sans cela, les pentes existent sans que personne les voie`)

    // La rangee des cotes, trouvee et non ecrite en dur : deplacer le plan
    // d'une ligne ne doit pas rendre ce controle faux sans le dire.
    let premiere = -1
    for (let i = 0; i < carte.solides.length && premiere < 0; i++) {
      if (estPente(carte.solides[i])) premiere = i
    }
    const rangee = Math.floor(premiere / carte.largeur)
    const colonne = premiere % carte.largeur
    let derniere = premiere
    for (let i = 0; i < carte.solides.length; i++) {
      if (estPente(carte.solides[i])) derniere = i
    }
    const finColonne = derniere % carte.largeur
    const depart = { x: (colonne - 3) * TUILE, y: (rangee + 1) * TUILE }
    // On s'arrete AU BOUT de la derniere cote : deux cases plus loin, la
    // passerelle s'arrete et le heros tombe dans la salle du dessous — une
    // chute normale, que compter comme un decollage accuserait les pentes de
    // ce que fait le niveau. La mesure porte sur les cotes, et sur elles
    // seules.
    const finX = (finColonne + 1) * TUILE
    const r = simuler(depart, () => ({ dirX: 1 }), 900)
    const parcours = []
    for (const t of r.trace) { parcours.push(t); if (t.x >= finX) break }
    const sommet = Math.min(...parcours.map((t) => t.y ?? 0), depart.y)
    const plusHaut = parcours.reduce((m, t, i) => (t.y < parcours[m].y ? i : m), 0)
    const enLAir = parcours.filter((t) => !t.auSol).length
    check('on gravit les côtes de la caverne en courant, sans sauter',
      sommet <= depart.y - TUILE,
      `de ${depart.y} à ${sommet}, soit ${depart.y - sommet} px — la tuile fait ${TUILE}`)
    check('et l’on redescend de l’autre côté',
      parcours[parcours.length - 1].y > parcours[plusHaut].y
      && parcours[parcours.length - 1].x >= finX,
      `sommet ${parcours[plusHaut].y}, arrivée ${parcours[parcours.length - 1].y}`)
    check('sans jamais quitter le sol de toute la traversée',
      enLAir === 0,
      `${enLAir} image(s) en l’air sur ${parcours.length} — décoller sur une côte fait sautiller`)
  }

  // Les corps solides POSES dans le niveau ne doivent pas le fermer.
  //
  // Une caisse est du contenu, pas un mur : le banc l'a appris en jouant, ou
  // une gelee posee a cinq cases du depart tuait le heros a chaque
  // reapparition — un niveau qui se referme sur lui-meme. La verification de
  // franchissabilite ci-dessus ne voyait rien : elle se fait sur la CARTE, et
  // un corps mobile n'est pas dans la carte.
  {
    const { CorpsMobiles, grilleAvecCorps } = await import('../src/runtime/corps.ts')
    const registre = new CorpsMobiles()
    const solides = []
    const parcourir = (n) => {
      const e = n.espece ? caverne.especes.find((q) => q.id === n.espece) : null
      if (e && e.matiereCorps) {
        registre.poser(n.id, n.x + e.boite.x, n.y + e.boite.y, e.boite.l, e.boite.h, e.matiereCorps)
        solides.push({ nom: e.nom, x: n.x + e.boite.x, y: n.y + e.boite.y, l: e.boite.l })
      }
      for (const f of n.enfants) parcourir(f)
    }
    parcourir(caverne.racine)
    check('la caverne pose bien des corps solides', solides.length >= 3,
      solides.map((s) => s.nom).join(', '))

    const avecCorps = grilleAvecCorps(carte, registre)
    for (const b of solides) {
      // On ne s'occupe que de ce qui est pose sur le plancher principal : le
      // reste est en l'air, et rien n'oblige a passer dessus.
      if (b.y + 20 < 20 * TUILE || b.y > 20 * TUILE) continue
      const c = new Plateformeur()
      const corps = { x: b.x - 3 * TUILE, y: 20 * TUILE, boite: { ...boite } }
      for (let i = 0; i < 240; i++) {
        c.avancer(avecCorps, corps, 1 / 60, 1, i % 45 === 0, i % 45 < 22)
      }
      check(`on passe « ${b.nom} » sans que le niveau se ferme`,
        corps.x > b.x + b.l, `arrive a x=${corps.x}, l'obstacle finit a ${b.x + b.l}`)
    }

    // Et la creature la plus proche du depart doit etre HORS de sa vigilance :
    // sinon elle vient au-devant du heros a chaque reapparition, et un monde a
    // un point de vie devient une boucle de morts.
    let pire = Infinity
    let coupable = ''
    const creatures = (n) => {
      const e = n.espece ? caverne.especes.find((q) => q.id === n.espece) : null
      if (e && e.degats > 0 && e.vigilance > 0) {
        const d = Math.hypot(n.x - caverne.depart.x, n.y - caverne.depart.y) - e.vigilance
        if (d < pire) { pire = d; coupable = e.nom }
      }
      for (const f of n.enfants) creatures(f)
    }
    creatures(caverne.racine)
    check('aucune creature ne guette le point de depart',
      pire > 0, `${coupable} : ${Math.round(pire)} px hors de sa portee de vigilance`)
  }

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

console.log('\n--- defaire et refaire ---')

{
  const { Historique, differences, gesteDeChangements, GESTES_GARDES } =
    await import('../src/editeur/historique.ts')

  // La difference, et non l'action : poser du terrain repeint aussi les huit
  // voisins et met a jour la collision. Rejouer l'inverse d'une action
  // oublierait les consequences qu'on n'a pas pensees.
  {
    const vivant = new Int32Array([1, 2, 3, 4])
    const photo = vivant.slice()
    vivant[1] = 9
    vivant[3] = 7
    const d = differences(vivant, photo)
    check('la comparaison ne garde que ce qui a bouge',
      d.length === 2 && d[0].index === 1 && d[0].avant === 2 && d[0].apres === 9,
      `${d.length} cases sur 4`)

    const g = gesteDeChangements('essai', d)
    g.defaire()
    check('defaire remet exactement l\'etat d\'avant',
      [...vivant].join(',') === '1,2,3,4', [...vivant].join(','))
    g.refaire()
    check('et refaire remet celui d\'apres',
      [...vivant].join(',') === '1,9,3,7', [...vivant].join(','))
  }

  // Un geste qui ne change rien ne doit pas encombrer l'historique.
  {
    const a = new Uint8Array([5, 5])
    check('un geste sans effet ne laisse aucune trace',
      differences(a, a.slice()).length === 0)
  }

  // Repartir dans une autre direction efface le futur : garder l'ancienne
  // branche donnerait un « refaire » qui rejoue ce qui n'a plus de sens.
  {
    const h = new Historique()
    const journal = []
    const geste = (n) => ({ nom: n, defaire: () => journal.push(`-${n}`), refaire: () => journal.push(`+${n}`) })
    h.poser(geste('a'))
    h.poser(geste('b'))
    h.defaire()
    check('on peut defaire puis refaire', h.peutRefaire && h.nomRefaire === 'b')
    h.poser(geste('c'))
    check('mais un geste neuf efface le futur', !h.peutRefaire,
      'sinon « refaire » rejoue une branche abandonnee')
    check('et le journal dit ce qui s\'est passe', journal.join(' ') === '-b', journal.join(' '))
  }

  // Une seance longue ne doit pas garder deux heures de photographies.
  {
    const h = new Historique()
    for (let i = 0; i < GESTES_GARDES + 20; i++) {
      h.poser({ nom: `g${i}`, defaire: () => {}, refaire: () => {} })
    }
    check('l\'historique est borne', h.taille === GESTES_GARDES,
      `${h.taille} gestes gardes sur ${GESTES_GARDES + 20} poses`)
    check('et c\'est le plus ancien qui part', h.nomDefaire === `g${GESTES_GARDES + 19}`)
  }
}

console.log('\n--- l\'atelier de scripts ---')

{
  const { compiler, nomsInterdits, sansChainesNiCommentaires, bouclesSansFin,
          ERREURS_AVANT_SOMMEIL } = await import('../src/script/atelier.ts')

  // La regle refuse ce qui ne passerait pas la frontiere des langages.
  check('un script qui touche a la page est refuse',
    !compiler('document.title = "pris"').ok
    && !compiler('fetch("/x")').ok
    && !compiler('window.alert(1)').ok,
    'un script ne parle qu\'a « c » et « n » : c\'est ce qui le rend exportable')

  // Et le sens inverse, qui compte autant : refuser a tort ferait cesser de
  // croire la regle.
  check('mais le meme mot dans un commentaire ou une chaine ne l\'est pas',
    nomsInterdits('// on ne touche pas au document ici').length === 0
    && nomsInterdits('n.etat.nom = "document"').length === 0
    && nomsInterdits('n.etat.document = 1').length === 0,
    'refuser a tort est pire que ne rien verifier')
  check('le nettoyage garde les retours a la ligne',
    sansChainesNiCommentaires('a\n// x\nb').split('\n').length === 3,
    'sans quoi le numero de ligne d\'une erreur ne voudrait plus rien dire')

  // Une boucle qu'on ne peut pas interrompre est refusee, pas signalee.
  check('une boucle sans sortie est refusee',
    bouclesSansFin('while (true) { n.x++ }') && !compiler('while (true) { n.x++ }').ok
    && !compiler('for (;;) {}').ok,
    'on ne peut pas interrompre du JavaScript en cours : l\'appliquer fermerait la porte')
  check('une boucle bornee, elle, passe',
    compiler('for (let i = 0; i < 4; i++) n.x++').ok)

  // Une faute de frappe ne doit pas faire tomber la boucle de jeu.
  {
    const mauvais = compiler('n.x +=')
    check('une erreur de syntaxe est rapportee, pas levee',
      !mauvais.ok && typeof mauvais.erreur === 'string' && mauvais.script === null,
      mauvais.erreur)

    const rapports = []
    const c = compiler('n.etat.rien.du.tout = 1', (r) => rapports.push({ ...r }))
    const n = { etat: {} }
    let levees = 0
    for (let i = 0; i < 20; i++) {
      try { c.script({}, n) } catch { levees++ }
    }
    check('un script qui echoue s\'endort au lieu de crier soixante fois par seconde',
      rapports.length === ERREURS_AVANT_SOMMEIL
      && rapports[rapports.length - 1].endormi,
      `${rapports.length} rapports pour vingt appels`)
    check('et l\'exception ne remonte jamais jusqu\'a la boucle de jeu',
      levees === 0,
      levees ? `${levees} exceptions ont traverse` : 'vingt appels, aucune levee')

    // Le sens inverse : sans le filet, la meme faute fait tomber la boucle.
    let sansFilet = 0
    const brut = new Function('c', 'n', 'n.etat.rien.du.tout = 1')
    try { brut({}, { etat: {} }) } catch { sansFilet++ }
    check('sans le filet, elle la ferait tomber des le premier pas',
      sansFilet === 1, 'et l\'on perdrait la scene a chaque faute de frappe')
  }

  // Un script juste fait ce qu'on lui demande, et n'a acces qu'a ce qu'on lui
  // donne.
  {
    const c = compiler('n.x += Math.round(c.dt * 60)')
    const n = { x: 10, etat: {} }
    c.script({ dt: 1 / 60 }, n)
    check('un script juste modifie son noeud', c.ok && n.x === 11, `x = ${n.x}`)
  }
}

console.log('\n--- le combat ---')

{
  const { Combat, visibleSousInvulnerabilite, INVULNERABILITE_MS } =
    await import('../src/runtime/combat.ts')
  const { rect } = await import('../src/noyau/pixel.ts')
  const boite = { x: -5, y: -7, l: 10, h: 7 }
  const surCible = () => rect(95, 93, 10, 7)

  // Une frappe DURE. Si elle blessait a chaque image, un coup d'epee ferait
  // six fois les degats, et la difficulte dependrait du taux d'images.
  {
    const c = new Combat()
    c.inscrire('gelee', { max: 20, camp: 'ennemi', boite, x: 100, y: 100 })
    c.frapper('heros', surCible(), 1, 100)
    let total = 0
    for (let i = 0; i < 10; i++) total += c.avancer(16).length
    check('un coup qui dure six images ne blesse qu\'une fois',
      total === 1 && c.vies.get('gelee').pv === 19, `${total} impacts, ${c.vies.get('gelee').pv} pv`)

    // Le sens inverse : sans la memoire de la frappe, six fois les degats.
    const naif = new Combat()
    naif.inscrire('gelee', { max: 20, camp: 'ennemi', boite, x: 100, y: 100 })
    const f = naif.frapper('heros', surCible(), 1, 100)
    let sansMemoire = 0
    for (let i = 0; i < 10; i++) {
      f.touches.clear()
      naif.vies.get('gelee').invulnerable = 0
      sansMemoire += naif.avancer(16).length
    }
    check('sans cette memoire, le meme coup blesse a chaque image',
      sansMemoire > 1, `${sansMemoire} impacts pour un seul coup`)
  }

  // L'invulnerabilite : elle protege de deux coups DIFFERENTS.
  {
    const c = new Combat()
    c.inscrire('heros', { max: 3, camp: 'heros', boite, x: 100, y: 100 })
    c.frapper('ennemi', surCible(), 1, 10)
    c.avancer(16)
    c.frapper('ennemi', surCible(), 1, 10)
    c.avancer(16)
    check('deux coups coup sur coup ne comptent que pour un',
      c.vies.get('heros').pv === 2, `${c.vies.get('heros').pv} pv sur 3`)
    c.avancer(INVULNERABILITE_MS)
    c.frapper('ennemi', surCible(), 1, 10)
    c.avancer(16)
    check('mais un coup apres la fenetre passe',
      c.vies.get('heros').pv === 1, `${c.vies.get('heros').pv} pv`)
  }

  // Les deux regles ne se remplacent pas : la premiere protege d'un meme coup,
  // la seconde de deux coups differents.
  {
    const c = new Combat()
    c.inscrire('a', { max: 5, camp: 'ennemi', boite, x: 100, y: 100 })
    c.inscrire('b', { max: 5, camp: 'ennemi', boite, x: 104, y: 100 })
    c.frapper('heros', rect(90, 90, 30, 14), 1, 50)
    const impacts = c.avancer(16)
    check('un seul coup touche DEUX cibles, une fois chacune',
      impacts.length === 2 && c.vies.get('a').pv === 4 && c.vies.get('b').pv === 4,
      `${impacts.length} impacts`)
  }

  // Une frappe d'une seule image doit toucher a l'image ou elle nait : les
  // frappes vieillissent apres avoir servi, pas avant.
  {
    const c = new Combat()
    c.inscrire('gelee', { max: 5, camp: 'ennemi', boite, x: 100, y: 100 })
    c.frapper('ennemi', surCible(), 1, 1)
    const memeCamp = c.avancer(16)
    check('une frappe ne blesse pas son propre camp', memeCamp.length === 0)
    c.frapper('heros', surCible(), 1, 1)
    check('une frappe d\'une seule image touche a l\'image ou elle nait',
      c.avancer(16).length === 1, 'les frappes vieillissent apres avoir servi')
    check('et elle a bien disparu ensuite', c.frappes.length === 0)
  }

  // Le clignotement : un personnage qui encaisse sans rien montrer laisse
  // croire que le coup n'a pas porte.
  {
    const vus = []
    for (let t = 600; t > 0; t -= 50) vus.push(visibleSousInvulnerabilite(t, 100) ? 1 : 0)
    check('une entite invulnerable clignote',
      new Set(vus).size === 2 && vus.join('').includes('1100'),
      vus.join(''))
    check('et redevient visible une fois protegee', visibleSousInvulnerabilite(0))
  }
}

console.log('\n--- l\'aventure : l\'epee, la troupe, la mort ---')

{
  const { creerNoeud } = await import('../src/scene/noeud.ts')
  const { Aventure } = await import('../src/demo/aventure.ts')
  const { RAYON_ACTIVITE } = await import('../src/runtime/entites.ts')

  /** Un contexte de jeu minimal : de quoi faire tourner l'aventure sans DOM. */
  const monter = () => {
    const racine = creerNoeud('noeud', 'essai')
    const heros = creerNoeud('sprite', 'heros')
    heros.x = 100
    heros.y = 100
    const corps = creerNoeud('corps', 'corps')
    corps.boiteX = -4; corps.boiteY = -6; corps.boiteL = 8; corps.boiteH = 6
    heros.enfants.push(corps)
    racine.enfants.push(heros)
    const av = new Aventure(racine, heros, { pvHeros: 3 })
    let frappe = false
    const hote = (cible) => {
      const chercher = (n) => {
        for (const e of n.enfants) { if (e.id === cible.id) return n; const r = chercher(e); if (r) return r }
        return null
      }
      return chercher(racine)
    }
    const ctx = {
      dt: 1 / 60,
      entrees: { consommer: (a) => a === 'action' && frappe, axe: () => ({ x: 0, y: 0 }), tenue: () => false },
      racine,
      carte: { tuile: 16, largeur: 200, hauteur: 200, solide: () => false },
      pas: 0,
      trouver: () => null,
      bouger: (cps, dx, dy) => {
        const h = hote(cps)
        if (h) { h.x += dx; h.y += dy }
        return { dx, dy, bloque: false }
      },
    }
    return { racine, heros, av, ctx, frapper: (v) => { frappe = v } }
  }

  // Une creature COLLEE au heros doit etre touchee. Une premiere version posait
  // la boite d'epee, carree, a dix-huit pixels devant : elle ratait tout ce qui
  // etait au contact, c'est-a-dire exactement ce qui venait de blesser.
  for (const [nom, dx, dy, regard] of [
    ['collee devant', 6, 0, { x: 1, y: 0 }],
    ['a bout de portee', 19, 0, { x: 1, y: 0 }],
    ['au-dessus', 0, -14, { x: 0, y: -1 }],
    ['en dessous', 0, 14, { x: 0, y: 1 }],
  ]) {
    const e = monter()
    e.av.peuplement.poser('gelee', 100 + dx, 100 + dy)
    let coups = 0
    for (let i = 0; i < 90; i++) {
      e.frapper(i % 24 === 0)
      e.av.avancer(e.ctx, regard)
      coups = e.av.abattus
      if (coups) break
    }
    check(`l'epee touche une gelee ${nom}`, coups === 1,
      coups ? 'abattue' : 'ratee — une epee qui rate au contact rate quand on en a le plus besoin')
  }

  // Et le sens inverse : ce qui est derriere ne doit PAS etre touche.
  {
    const e = monter()
    e.av.peuplement.poser('gelee', 100 - 26, 100)
    for (let i = 0; i < 60; i++) { e.frapper(i % 24 === 0); e.av.avancer(e.ctx, { x: 1, y: 0 }) }
    check('mais elle ne touche pas ce qui est derriere',
      e.av.abattus === 0, `${e.av.abattus} abattue(s) dans le dos`)
  }

  // Une creature abattue disparait entierement : noeud, vitalite, lecteur.
  {
    const e = monter()
    const n = e.av.peuplement.poser('gelee', 108, 100)
    const avant = e.racine.enfants.length
    for (let i = 0; i < 90 && e.av.abattus === 0; i++) {
      e.frapper(i % 24 === 0)
      e.av.avancer(e.ctx, { x: 1, y: 0 })
    }
    check('une creature abattue quitte la scene ET le systeme de combat',
      e.av.abattus === 1 && e.racine.enfants.length === avant - 1
      && !e.av.combat.vies.has(n.id) && e.av.peuplement.nombre === 0,
      'une vitalite orpheline continuerait de recevoir des coups')
  }

  // Une entite est un NOEUD : posee, elle entre dans le jeu au pas suivant ;
  // retiree de la scene, elle en sort, vitalite comprise. C'est ce qui permet
  // a l'editeur d'en ajouter sans rien prevenir.
  {
    const e = monter()
    const n = e.av.peuplement.poser('gelee', 200, 200)
    e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('une entite posee dans la scene entre dans le jeu toute seule',
      e.av.peuplement.nombre === 1 && e.av.combat.vies.has(n.id),
      'la scene est la verite, et rien de l\'inverse')

    // On la retire a la main, comme le ferait la gomme de l'editeur.
    const { retirerDe } = await import('../src/runtime/entites.ts')
    retirerDe(e.racine, n)
    e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('et retiree de la scene, elle en sort — vitalite comprise',
      e.av.peuplement.nombre === 0 && !e.av.combat.vies.has(n.id),
      'une vitalite orpheline continuerait de recevoir des coups depuis nulle part')
  }

  // Un ramassage est une entite comme une autre : ce qui le distingue est une
  // valeur dans sa description, pas un deuxieme systeme.
  {
    const e = monter()
    e.av.peuplement.poser('gelee', 106, 100)
    for (let i = 0; i < 240 && e.av.pv === 3; i++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    const blesse = e.av.pv
    e.av.peuplement.vider()
    e.av.peuplement.poser('coeur', 100, 100)
    for (let i = 0; i < 10; i++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('un coeur pose au sol se ramasse et rend un point de vie',
      blesse < 3 && e.av.pv === blesse + 1 && e.av.ramasses === 1,
      `${blesse} pv, puis ${e.av.pv}`)

    // Et il ne se ramasse pas quand on est au complet : sinon on le gaspille
    // sans s'en apercevoir.
    const plein = monter()
    plein.av.peuplement.poser('coeur', 100, 100)
    for (let i = 0; i < 10; i++) plein.av.avancer(plein.ctx, { x: 1, y: 0 })
    check('mais pas quand la vie est deja pleine',
      plein.av.ramasses === 0 && plein.av.peuplement.nombre === 1,
      'le ramasser pour rien serait le perdre')
  }

  // La machine a etats : guet, anticipation, tir, repos. C'est l'anticipation
  // qui rend un ennemi lisible — sans elle, le tir est imparable.
  {
    const e = monter()
    // Loin : elle ne doit pas quitter son guet.
    const loin = e.av.peuplement.poser('tourelle', 100 + 200, 100)
    for (let i = 0; i < 120; i++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    const larmesLoin = e.av.peuplement.positions().filter((q) => q.espece === 'larme').length
    check('une tourelle hors de portee reste au guet',
      larmesLoin === 0, `${larmesLoin} tir(s) — elle ne devrait pas voir la cible`)
    e.av.peuplement.tuer(loin.id)

    // Pres : guet -> anticipe -> tire. Le tir ne part qu'apres l'anticipation.
    const pres = e.av.peuplement.poser('tourelle', 100 + 90, 100)
    let premierTir = -1
    for (let i = 0; i < 200; i++) {
      e.av.avancer(e.ctx, { x: 1, y: 0 })
      if (premierTir < 0 && e.av.peuplement.positions().some((q) => q.espece === 'larme')) {
        premierTir = i
      }
    }
    check('une tourelle a portee finit par tirer', premierTir > 0, `au pas ${premierTir}`)
    // 420 ms d'anticipation, soit vingt-cinq pas de soixantieme. Le tir ne
    // doit pas partir avant : c'est tout ce qui le rend evitable.
    check('mais seulement apres son temps d\'anticipation',
      premierTir >= 24,
      `${premierTir} pas — l'anticipation en vaut 25, et sans elle le tir est imparable`)
    void pres
  }

  // Un projectile va tout droit, blesse, et finit par disparaitre.
  {
    const e = monter()
    const l = e.av.peuplement.lancer('larme', 200, 100, -1, 0, 'ennemi')
    const x0 = l.x
    for (let i = 0; i < 20; i++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('un projectile lance avance dans sa direction',
      l.x < x0 - 20, `de ${x0} a ${Math.round(l.x)}`)

    // Il finit par mourir de vieillesse : sans cela il traverserait l'etage et
    // blesserait deux salles plus loin.
    for (let i = 0; i < 200; i++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('et il ne vit pas eternellement',
      e.av.peuplement.positions().every((q) => q.espece !== 'larme'),
      '1600 ms de duree de vie')
  }

  // Un projectile blesse ce qu'il traverse, et son camp seulement l'epargne.
  {
    const e = monter()
    e.av.peuplement.lancer('larme', 100 + 30, 100, -1, 0, 'ennemi')
    let touche = false
    for (let i = 0; i < 60 && !touche; i++) {
      e.av.avancer(e.ctx, { x: 1, y: 0 })
      if (e.av.pv < 3) touche = true
    }
    check('un projectile ennemi blesse le heros', touche, `${e.av.pv} pv`)
  }

  // La distance d'activite : une creature loin ne bouge pas et ne frappe pas.
  {
    const e = monter()
    const loin = e.av.peuplement.poser('gelee', 100 + RAYON_ACTIVITE + 60, 100)
    const x0 = loin.x
    for (let i = 0; i < 120; i++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('une creature hors de portee reste chez elle',
      loin.x === x0 && e.av.pv === 3,
      'sinon les vingt-deux creatures de l\'etage convergent des la premiere seconde')

    const proche = monter()
    const pres = proche.av.peuplement.poser('gelee', 100 + 40, 100)
    for (let i = 0; i < 120; i++) proche.av.avancer(proche.ctx, { x: 1, y: 0 })
    check('une creature a portee, elle, vient et mord',
      pres.x !== 100 + 40 && proche.av.pv < 3, `${proche.av.pv} pv sur 3`)
  }

  // La reapparition : mourir mille fois n'est supportable que si mourir est
  // bref, et si l'on repart ou l'on s'etait arrete.
  {
    const e = monter()
    e.av.reapparition = { x: 300, y: 300 }
    e.av.peuplement.poser('gelee', 106, 100)
    let i = 0
    while (i < 400 && !e.av.mort) { e.av.avancer(e.ctx, { x: 1, y: 0 }); i++ }
    check('on finit par mourir', e.av.mort && e.av.morts === 1, `${e.av.morts} mort(s)`)

    // Le delai par defaut est de six dixiemes : quarante pas de soixantieme.
    for (let k = 0; k < 60; k++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('puis l\'on reapparait au point de reprise, en vie',
      !e.av.mort && e.av.pv === e.av.max && e.heros.x === 300 && e.heros.y === 300,
      `${e.av.pv}/${e.av.max} pv en ${e.heros.x},${e.heros.y}`)

    // Et l'on repart protege : renaitre dans la pointe qui vient de tuer
    // recommencerait la mort a l'image suivante.
    e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('et protege un instant', e.av.pv === e.av.max,
      'sinon on remeurt sans comprendre ce qui se passe')
  }

  // Une balise deplace le point de reprise, et ne se ramasse pas.
  {
    const e = monter()
    // On ecarte d'abord le point de reprise : sans cela il vaut deja la
    // position du heros, et le test ne prouverait rien.
    e.av.reapparition = { x: 0, y: 0 }
    const avant = { ...e.av.reapparition }
    const b = e.av.peuplement.poser('balise', 100, 100)
    for (let k = 0; k < 5; k++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('toucher une balise deplace le point de reprise',
      e.av.reapparition.x === 100 && e.av.reapparition.y === 100
      && (avant.x !== 100 || avant.y !== 100) && e.av.balisesAtteintes === 1,
      `${avant.x},${avant.y} -> ${e.av.reapparition.x},${e.av.reapparition.y}`)
    check('et la balise reste : on peut y revenir',
      e.av.peuplement.nombre === 1 && e.av.ramasses === 0,
      `l'entite ${b.nom} est toujours la`)

    // Une deuxieme fois ne la compte pas deux fois.
    for (let k = 0; k < 5; k++) e.av.avancer(e.ctx, { x: 1, y: 0 })
    check('la repasser ne la compte pas deux fois', e.av.balisesAtteintes === 1)
  }

  // La mort appelle ce qu'on lui a donne, et une seule fois.
  {
    const racine = creerNoeud('noeud', 'essai')
    const heros = creerNoeud('sprite', 'heros')
    heros.x = 100; heros.y = 100
    const corps = creerNoeud('corps', 'corps')
    corps.boiteX = -4; corps.boiteY = -6; corps.boiteL = 8; corps.boiteH = 6
    heros.enfants.push(corps)
    racine.enfants.push(heros)
    let morts = 0
    // Sans reapparition : on meurt, et l'on reste mort. C'est ce qui permet
    // de compter les annonces sans que la boucle recommence.
    const av = new Aventure(racine, heros, {
      pvHeros: 1, surMort: () => morts++, reapparitionMs: 0,
    })
    av.peuplement.poser('gelee', 106, 100)
    const ctx = {
      dt: 1 / 60,
      entrees: { consommer: () => false, axe: () => ({ x: 0, y: 0 }), tenue: () => false },
      racine, carte: { tuile: 16, largeur: 200, hauteur: 200, solide: () => false }, pas: 0,
      trouver: () => null, bouger: () => ({ dx: 0, dy: 0, bloque: false }),
    }
    for (let i = 0; i < 240; i++) av.avancer(ctx, { x: 1, y: 0 })
    check('la mort est annoncee une seule fois', morts === 1 && av.mort,
      `${morts} annonce(s), pv ${av.pv}`)
    check('et un mort ne se fait plus toucher', av.pv === 0, `${av.pv} pv`)
  }
}

console.log('\n--- l\'etage engendre ---')

{
  const { engendrerPlan, sallesAtteignables, Hasard } =
    await import('../src/niveau/plan.ts')
  const { assemblerEtage } = await import('../src/niveau/assemblage.ts')

  // La graine, d'abord. Un niveau qu'on ne peut pas reproduire est un niveau
  // qu'on ne peut pas corriger : « il y avait un mur infranchissable » devient
  // une histoire au lieu d'un rapport.
  {
    const a = engendrerPlan(1234, { salles: 12 })
    const b = engendrerPlan(1234, { salles: 12 })
    const empreinte = (p) => p.salles.map((s) => `${s.cx},${s.cy},${s.role}`).sort().join('|')
    check('la meme graine rend le meme etage', empreinte(a) === empreinte(b),
      `${a.salles.length} salles, empreinte identique`)
    const c = engendrerPlan(1235, { salles: 12 })
    check('et deux graines voisines rendent deux etages differents',
      empreinte(a) !== empreinte(c),
      'les bits de poids faible d\'un generateur congruentiel sont mauvais : ' +
      'un modulo 2 rendait le meme etage pour toutes les graines')

    // La preuve directe du defaut repare : le dernier bit d'un generateur
    // congruentiel alterne strictement, quelle que soit la graine. Le tirage
    // par bits de poids fort, lui, varie.
    const parModulo = []
    const g = new Hasard(99)
    for (let i = 0; i < 16; i++) parModulo.push(g.suivant() % 2)
    const parBitsForts = []
    const g2 = new Hasard(99)
    for (let i = 0; i < 16; i++) parBitsForts.push(g2.entier(2))
    const alterne = (t) => t.every((v, i) => i === 0 || v !== t[i - 1])
    check('le modulo alterne strictement, les bits de poids fort non',
      alterne(parModulo) && !alterne(parBitsForts),
      `modulo ${parModulo.join('')} · poids fort ${parBitsForts.join('')}`)
  }

  // Le plan tient debout : connexite, boss au plus loin, nombre respecte.
  {
    let deconnectes = 0
    let bossMalPlace = 0
    let manquants = 0
    for (let graine = 1; graine <= 120; graine++) {
      const p = engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 })
      if (sallesAtteignables(p).size !== p.salles.length) deconnectes++
      if (p.salles.length !== 12) manquants++
      const plusLoin = Math.max(...p.salles.map((s) => s.distance))
      const impasses = p.salles.filter((s) => s !== p.depart && s.voisines.filter(Boolean).length === 1)
      // Le boss est le cul-de-sac le plus lointain. S'il y a des impasses, il
      // en est une ; et aucune impasse n'est plus loin que lui.
      if (impasses.length && (!impasses.includes(p.boss)
          || impasses.some((s) => s.distance > p.boss.distance))) bossMalPlace++
      void plusLoin
    }
    check('toutes les salles du plan sont reliees au depart', deconnectes === 0,
      deconnectes ? `${deconnectes} etages coupes sur 120` : '120 graines')
    check('le nombre de salles demande est atteint', manquants === 0,
      manquants ? `${manquants} etages incomplets` : '12 salles a chaque fois')
    check('le boss est au cul-de-sac le plus loin du depart', bossMalPlace === 0,
      bossMalPlace ? `${bossMalPlace} etages mal places`
        : 'en nombre de salles parcourues, et non a vol d\'oiseau')
  }

  // Et le sens inverse : sans la regle du voisinage unique, l'etage se colle
  // en pave et il n'y a plus ni branche ni cul-de-sac ou cacher un tresor.
  {
    let avecRegle = 0
    let sansRegle = 0
    for (let graine = 1; graine <= 40; graine++) {
      const p = engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 })
      avecRegle += p.salles.filter((s) => s.voisines.filter(Boolean).length === 1).length
      // Un pave de 4 x 3 : ce que donne la croissance sans la regle.
      const pave = []
      for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) pave.push({ x, y })
      sansRegle += pave.filter((c) => {
        const n = pave.filter((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) === 1).length
        return n === 1
      }).length
    }
    check('la regle du voisinage unique donne des branches et des culs-de-sac',
      avecRegle / 40 > sansRegle / 40,
      `${(avecRegle / 40).toFixed(1)} impasses par etage contre ${(sansRegle / 40).toFixed(1)} pour un pave`)
  }

  // La verification qui compte vraiment : sur la VRAIE grille de tuiles, en
  // marchant case par case, chaque salle est-elle atteignable ? Le plan peut
  // etre parfait et l'assemblage condamner une porte avec un bloc.
  {
    let etagesCoupes = 0
    let pire = ''
    for (let graine = 1; graine <= 60; graine++) {
      const plan = engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 })
      const e = assemblerEtage(plan)
      const c = e.carte
      const vus = new Uint8Array(c.cases)
      const dx = Math.floor(e.depart.x / c.tuile)
      const dy = Math.floor(e.depart.y / c.tuile) - 1
      const file = [[dx, dy]]
      vus[c.index(dx, dy)] = 1
      while (file.length) {
        const [x, y] = file.pop()
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ax
          const ny = y + ay
          if (!c.dedans(nx, ny) || vus[c.index(nx, ny)] || c.solide(nx, ny)) continue
          vus[c.index(nx, ny)] = 1
          file.push([nx, ny])
        }
      }
      const manquees = plan.salles.filter((s) => {
        const o = e.coinDe(s)
        return !vus[c.index(o.x + Math.floor(e.largeurSalle / 2), o.y + Math.floor(e.hauteurSalle / 2))]
      })
      if (manquees.length) { etagesCoupes++; pire ||= `graine ${graine} : ${manquees.length} salles` }
    }
    check('en marchant case par case, aucune salle n\'est injoignable',
      etagesCoupes === 0,
      etagesCoupes ? `${etagesCoupes} etages sur 60, ${pire}` : '60 etages, 720 salles')
  }

  /*
   * Les salles dessinees a la main.
   *
   * La question n'est pas « le tirage les emploie-t-il » mais « peut-il en
   * sortir une salle close ». Une salle close ne se voit qu'en jouant, une
   * fois sur douze, et seulement si l'on va jusque-la.
   */
  {
    const { verifierModele, croixLibre, modele, lireModele } =
      await import('../src/niveau/modeles.ts')
    const { MODELES_DEMO, SYMBOLES_DEMO } = await import('../src/demo/salles-demo.ts')
    const croix = croixLibre(20, 11, 2, 3)

    // 1. Tous les dessins livres sont bons — dans les QUATRE orientations, car
    //    le tirage les retourne.
    const mauvais = []
    for (const m of MODELES_DEMO) {
      for (const [mx, my] of [[false, false], [true, false], [false, true], [true, true]]) {
        const retourne = modele(`${m.nom}${mx ? ' ↔' : ''}${my ? ' ↕' : ''}`,
          Array.from({ length: 9 }, (_, y) =>
            Array.from({ length: 18 }, (_, x) => lireModele(m, x, y, mx, my, 18, 9)).join('')),
          { roles: m.roles, poids: m.poids })
        mauvais.push(...verifierModele(retourne, 18, 9, SYMBOLES_DEMO, croix))
      }
    }
    check('les salles dessinees sont toutes valables, retournees comprises',
      mauvais.length === 0,
      mauvais.length ? mauvais[0] : `${MODELES_DEMO.length} modèles × 4 orientations`)

    // 2. Et la regle REFUSE. Une regle qui ne refuse jamais rien est
    //    indistinguable d'une regle absente : on eprouve les trois fautes.
    const barre = modele('barre la croix', [
      '..................', '..................', '..................',
      '..................', '........#.........', '..................',
      '..................', '..................', '..................',
    ])
    const courte = modele('rangee courte', [
      '.................', '..................', '..................',
      '..................', '..................', '..................',
      '..................', '..................', '..................',
    ])
    const inconnue = modele('lettre inconnue', [
      'Z.................', '..................', '..................',
      '..................', '..................', '..................',
      '..................', '..................', '..................',
    ])
    check('un bloc dans la croix des portes fait refuser le modèle',
      verifierModele(barre, 18, 9, SYMBOLES_DEMO, croix).length === 1,
      verifierModele(barre, 18, 9, SYMBOLES_DEMO, croix)[0])
    check('une rangée de la mauvaise largeur aussi',
      verifierModele(courte, 18, 9, SYMBOLES_DEMO, croix).length === 1,
      verifierModele(courte, 18, 9, SYMBOLES_DEMO, croix)[0])
    check('et une lettre qui ne veut rien dire',
      verifierModele(inconnue, 18, 9, SYMBOLES_DEMO, croix).length === 1,
      verifierModele(inconnue, 18, 9, SYMBOLES_DEMO, croix)[0])

    // 3. L'etage assemble AVEC les modeles : ils servent, ils posent des
    //    creatures, et rien n'est refuse.
    const plan = engendrerPlan(7, { salles: 12, largeur: 9, hauteur: 7 })
    const avecModeles = assemblerEtage(plan, {
      modeles: MODELES_DEMO, symboles: SYMBOLES_DEMO,
    })
    const modelables = plan.salles.filter((s) => s.role !== 'depart').length
    check('l\'étage engendré emploie vraiment les salles dessinées',
      avecModeles.plaintes.length === 0 && avecModeles.modeleDe.size >= modelables * 0.6,
      `${avecModeles.modeleDe.size} salles dessinées sur ${modelables}`)
    check('et elles posent leurs créatures elles-mêmes',
      avecModeles.entites.length > 0,
      `${avecModeles.entites.length} entités demandées par les dessins`)

    // 4. La verification qui compte : sur soixante etages MODELES, en marchant
    //    case par case, aucune salle close.
    let coupes = 0
    let pireM = ''
    for (let graine = 1; graine <= 60; graine++) {
      const pl = engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 })
      const e = assemblerEtage(pl, { modeles: MODELES_DEMO, symboles: SYMBOLES_DEMO })
      const c = e.carte
      const vus = new Uint8Array(c.cases)
      const dx = Math.floor(e.depart.x / c.tuile)
      const dy = Math.floor(e.depart.y / c.tuile) - 1
      const file = [[dx, dy]]
      vus[c.index(dx, dy)] = 1
      while (file.length) {
        const [x, y] = file.pop()
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ax
          const ny = y + ay
          if (!c.dedans(nx, ny) || vus[c.index(nx, ny)] || c.solide(nx, ny)) continue
          vus[c.index(nx, ny)] = 1
          file.push([nx, ny])
        }
      }
      const manquees = pl.salles.filter((s) => {
        const o = e.coinDe(s)
        return !vus[c.index(o.x + Math.floor(e.largeurSalle / 2), o.y + Math.floor(e.hauteurSalle / 2))]
      })
      if (manquees.length) { coupes++; pireM ||= `graine ${graine} : ${manquees.length} salles` }
    }
    check('avec les salles dessinées, aucune salle n\'est close non plus',
      coupes === 0, coupes ? `${coupes} etages sur 60, ${pireM}` : '60 etages, 720 salles')

    // 5. La meme graine choisit les memes salles. Un etage reproductible dont
    //    le contenu ne l'est pas ne se corrige pas mieux qu'un etage qui ne
    //    l'est pas du tout.
    const bis = assemblerEtage(engendrerPlan(7, { salles: 12, largeur: 9, hauteur: 7 }),
      { modeles: MODELES_DEMO, symboles: SYMBOLES_DEMO })
    const empreinte = (e) => [...e.modeleDe.values()].join('|')
      + '#' + e.entites.map((q) => `${q.espece}@${q.x},${q.y}`).join(',')
    check('la même graine choisit les mêmes salles, aux mêmes places',
      empreinte(avecModeles) === empreinte(bis),
      `${avecModeles.modeleDe.size} salles, ${avecModeles.entites.length} entités`)

    // 6. Et le tirage varie : quatre dessins retournes doivent donner autre
    //    chose d'un etage a l'autre, sinon les modeles remplacent une
    //    monotonie par une autre.
    const vus = new Set()
    for (let graine = 1; graine <= 40; graine++) {
      const e = assemblerEtage(engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 }),
        { modeles: MODELES_DEMO, symboles: SYMBOLES_DEMO })
      vus.add([...e.modeleDe.values()].join('|'))
    }
    check('et deux étages ne reçoivent pas la même suite de salles',
      vus.size >= 35, `${vus.size} suites différentes sur 40 étages`)

    // 7. Un seul modele suffit a demarrer : les salles sans dessin retombent
    //    sur les amas tires au sort. C'est ce qui permet d'en ajouter un et de
    //    voir ce qu'il donne, au lieu de devoir couvrir tous les roles avant
    //    que le premier ne serve — et c'est un chemin qu'il faut garder
    //    vivant, sinon il pourrira sans qu'on s'en apercoive.
    const seul = MODELES_DEMO.filter((m) => m.roles.includes('boss'))
    const partiel = assemblerEtage(engendrerPlan(7, { salles: 12, largeur: 9, hauteur: 7 }),
      { modeles: seul, symboles: SYMBOLES_DEMO })
    const communes = plan.salles.filter((s) => s.role === 'commune')
    const encombrees = communes.filter((s) => {
      const o = partiel.coinDe(s)
      let blocs = 0
      for (let y = 1; y < partiel.hauteurSalle - 1; y++) {
        for (let x = 1; x < partiel.largeurSalle - 1; x++) {
          if (partiel.carte.solide(o.x + x, o.y + y)) blocs++
        }
      }
      return blocs > 0
    }).length
    check('une salle sans dessin retombe sur les amas tirés au sort',
      partiel.modeleDe.size === 1 && encombrees >= communes.length - 1,
      `1 salle dessinée, ${encombrees} salles encombrées au hasard sur ${communes.length}`)

    // 8. Et le defaut que le point precedent a revele : les amas etaient
    //    ecartes des cases MARQUEES en comparant leur tuile a la tuile
    //    marqueur. Quand l'appelant ne precise ni l'une ni l'autre, les deux
    //    valent zero, toute case passe pour marquee, et plus un obstacle n'est
    //    pose — dans le silence le plus complet, y compris ici, ou l'on
    //    appelait justement sans preciser.
    const nu = assemblerEtage(engendrerPlan(7, { salles: 12, largeur: 9, hauteur: 7 }))
    let blocsNus = 0
    for (const s of plan.salles) {
      const o = nu.coinDe(s)
      for (let y = 1; y < nu.hauteurSalle - 1; y++) {
        for (let x = 1; x < nu.largeurSalle - 1; x++) {
          if (nu.carte.solide(o.x + x, o.y + y)) blocsNus++
        }
      }
    }
    check('un assemblage sans tuiles précisées encombre quand même ses salles',
      blocsNus > 20, `${blocsNus} blocs posés`)
  }

  // Une porte percee d'un seul cote laisse un mur invisible d'une case : le
  // joueur se cogne dans ce qui a l'air d'etre une ouverture.
  {
    const plan = engendrerPlan(7, { salles: 12, largeur: 9, hauteur: 7 })
    const e = assemblerEtage(plan)
    const c = e.carte
    let percees = 0
    let borgnes = 0
    for (const s of plan.salles) {
      const o = e.coinDe(s)
      for (let d = 0; d < 4; d++) {
        const v = s.voisines[d]
        if (!v) continue
        percees++
        const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][d]
        let cote = 0
        if (dir[0] !== 0) {
          const x = dir[0] > 0 ? o.x + e.largeurSalle - 1 : o.x
          const y = o.y + Math.floor((e.hauteurSalle - 3) / 2) + 1
          if (!c.solide(x, y)) cote++
          if (!c.solide(x + dir[0], y)) cote++
        } else {
          const y = dir[1] > 0 ? o.y + e.hauteurSalle - 1 : o.y
          const x = o.x + Math.floor((e.largeurSalle - 2) / 2)
          if (!c.solide(x, y)) cote++
          if (!c.solide(x, y + dir[1])) cote++
        }
        if (cote !== 2) borgnes++
      }
    }
    check('chaque porte perce LES DEUX murs mitoyens', borgnes === 0,
      borgnes ? `${borgnes} portes borgnes sur ${percees}` : `${percees} passages`)
  }

  // Les cellules sans salle restent solides : on ne doit pas pouvoir sortir de
  // l'etage par un trou dans la grille.
  {
    const plan = engendrerPlan(3, { salles: 8, largeur: 9, hauteur: 7 })
    const e = assemblerEtage(plan)
    let percees = 0
    for (let cy = 0; cy < plan.hauteur; cy++) {
      for (let cx = 0; cx < plan.largeur; cx++) {
        if (plan.salles.some((s) => s.cx === cx && s.cy === cy)) continue
        const o = { x: cx * e.largeurSalle, y: cy * e.hauteurSalle }
        for (let y = 0; y < e.hauteurSalle; y++) {
          for (let x = 0; x < e.largeurSalle; x++) if (!e.carte.solide(o.x + x, o.y + y)) percees++
        }
      }
    }
    check('les cellules sans salle restent pleines', percees === 0,
      percees ? `${percees} cases traversables hors salle` : 'on commence plein et l\'on creuse')
  }
}

console.log('\n--- un projet enregistre puis relu ---')

{
  const { serialiserProjet, versTexte, relireNoeud, relireCarte, VERSION_FORMAT } =
    await import('../src/export/format.ts')
  const { mondeDepuisProjet } = await import('../src/editeur/monde-projet.ts')
  const { Palette, depuisHex } = await import('../src/noyau/palette.ts')
  const { mondeCitadelle, mondeDonjon } = await import('../src/demo/mondes.ts')

  for (const construire of [mondeDonjon, mondeCitadelle]) {
    const m = construire()
    // Un script ecrit dans l'atelier : c'est du texte, il doit traverser.
    m.heros.script = 'n.x += 1'
    const projet = serialiserProjet(
      m.id, m.vue, new Palette(m.id, m.couleurs.map(depuisHex)),
      [{ nom: m.id, carte: m.carte }], [{ nom: 'principale', racine: m.racine }],
      m.animations, m.planches, m.projection,
    )
    const relu = mondeDepuisProjet(JSON.parse(versTexte(projet)), 'essai.json')

    check(`${m.id} : la carte relue est identique, tuile par tuile`,
      relu.carte.largeur === m.carte.largeur && relu.carte.hauteur === m.carte.hauteur
      && relu.carte.calques.length === m.carte.calques.length
      && relu.carte.calques.every((q, i) =>
        q.cases.every((v, j) => v === m.carte.calques[i].cases[j])),
      `${relu.carte.largeur}x${relu.carte.hauteur}, ${relu.carte.calques.length} calques`)

    check(`${m.id} : la collision aussi`,
      [...relu.carte.solides].every((v, i) => v === m.carte.solides[i]))

    check(`${m.id} : la projection revient telle quelle`,
      relu.projection.mode === m.projection.mode
      && relu.projection.regard === m.projection.regard
      && relu.projection.largeurTuile === m.projection.largeurTuile
      && relu.projection.hauteurTuile === m.projection.hauteurTuile
      && relu.projection.hauteurBloc === m.projection.hauteurBloc,
      `${relu.projection.mode}, vue de ${relu.projection.regard} — `
      + 'sans elle un projet isometrique se rouvre orthogonal, la carte juste et tout de travers')

    const pixels = (pl) => pl.dessins.reduce((n, d) => n + d.join('').replace(/\./g, '').length, 0)
    check(`${m.id} : les planches reviennent, au pixel pres`,
      relu.planches.length === m.planches.length
      && relu.planches.every((t, i) => t.nom === m.planches[i].nom
        && t.largeurCase === m.planches[i].largeurCase
        && t.hauteurCase === m.planches[i].hauteurCase
        && pixels(t) === pixels(m.planches[i])),
      `${relu.planches.map((t) => `${t.nom} ${pixels(t)} px`).join(', ')}`)

    check(`${m.id} : les clips reviennent avec leurs evenements`,
      relu.animations.length === m.animations.length
      && relu.animations.every((a, i) => a.nom === m.animations[i].nom
        && a.boucle === m.animations[i].boucle
        && a.images.length === m.animations[i].images.length
        && a.evenements.length === m.animations[i].evenements.length),
      `${relu.animations.length} clips`)

    const chercher = (n, nom) => {
      if (n.nom === nom) return n
      for (const e of n.enfants) { const r = chercher(e, nom); if (r) return r }
      return null
    }
    const herosRelu = chercher(relu.racine, 'heros')
    const corpsRelu = herosRelu && chercher(herosRelu, 'corps')
    check(`${m.id} : la scene revient avec ses proprietes et son script`,
      herosRelu && herosRelu.x === m.heros.x && herosRelu.y === m.heros.y
      && herosRelu.ancreY === m.heros.ancreY && herosRelu.source === m.heros.source
      && herosRelu.script === 'n.x += 1'
      && corpsRelu && corpsRelu.boiteL > 0,
      'ancre, source, boite de collision et script')
  }

  // Le vrai gain des entites en donnees : un etage enregistre garde ses
  // creatures, et elles bougent encore a la relecture.
  {
    const { mondeEtage } = await import('../src/demo/mondes.ts')
    const m = mondeEtage(7)
    const projet = serialiserProjet(
      m.id, m.vue, new Palette(m.id, m.couleurs.map(depuisHex)),
      [{ nom: m.id, carte: m.carte }], [{ nom: 'principale', racine: m.racine }],
      m.animations, m.planches, m.projection, m.especes,
    )
    // L'espece est remontee a cote des champs communs, et non dans le sac des
    // proprietes : c'est ce qui permet a un lecteur qui ne sait pas lire un
    // dictionnaire libre — celui d'Unity — de dessiner quand meme les entites.
    const compter = (n) => {
      let t = n.espece ? 1 : 0
      for (const e of n.enfants ?? []) t += compter(e)
      return t
    }
    const dedans = compter(projet.scenes[0].racine)
    check('un etage enregistre emporte ses creatures',
      dedans > 10 && projet.especes.length >= 3,
      `${dedans} entités dans la scène, ${projet.especes.length} espèces au catalogue`)

    const relu = mondeDepuisProjet(JSON.parse(versTexte(projet)), 'essai.json')
    const especes = new Map(relu.especes.map((e) => [e.id, e]))
    check('et le catalogue relu decrit toujours ce qu\'elles font',
      especes.get('gelee')?.comportement === 'bond'
      && especes.get('heros')?.comportement === 'joueur'
      && especes.get('coeur')?.soigne === 1,
      'l\'intention est un NOM : un fichier ne peut pas porter de fonction')

    // Et elles VIVENT : on fait tourner le monde relu sans navigateur.
    const { Combat } = await import('../src/runtime/combat.ts')
    const { Peuplement } = await import('../src/runtime/entites.ts')
    const combat = new Combat()
    const peuplement = new Peuplement(
      relu.racine, combat, relu.especes, relu.animations, relu.projection, relu.carte.tuile,
    )
    peuplement.synchroniser()
    const avant = peuplement.positions().map((q) => `${q.x},${q.y}`)
    const { CorpsMobiles, grilleAvecCorps } = await import('../src/runtime/corps.ts')
    const registre = new CorpsMobiles()
    const ctx = {
      dt: 1 / 60,
      entrees: { axe: () => ({ x: 1, y: 0 }), tenue: () => false, consommer: () => false },
      racine: relu.racine, carte: relu.carte, pas: 0, trouver: () => null,
      corps: registre, grille: grilleAvecCorps(relu.carte, registre),
      bouger: (corps, dx, dy) => {
        const hote = (n) => {
          for (const e of n.enfants) { if (e.id === corps.id) return n; const r = hote(e); if (r) return r }
          return null
        }
        const h = hote(relu.racine)
        if (h) { h.x += dx; h.y += dy }
        return { dx, dy, bloque: false }
      },
    }
    const heros = peuplement.positions().length
      ? relu.racine.enfants.find((n) => n.espece === 'heros')
      : null
    for (let i = 0; i < 60; i++) peuplement.avancer(ctx, heros ?? { x: 0, y: 0 }, 1000 / 60)
    const apres = peuplement.positions().map((q) => `${q.x},${q.y}`)
    const bougees = apres.filter((q, i) => q !== avant[i]).length
    check('les creatures d\'un etage relu bougent encore',
      peuplement.nombre === dedans && bougees > 0,
      `${peuplement.nombre} entités adoptées, ${bougees} ont bougé en une seconde`)
  }

  /*
   * L'aller-retour COMPLET : enregistrer, relire, reenregistrer.
   *
   * Un seul aller ne prouve rien. Ce qui coute cher, c'est un champ que la
   * relecture laisse tomber : le projet s'ouvre normalement, tout a l'air la,
   * et le deuxieme enregistrement l'efface pour de bon. On compare donc le
   * DEUXIEME fichier au premier.
   */
  {
    const { mondeCaverne } = await import('../src/demo/mondes.ts')
    const m = mondeCaverne()
    const enProjet = (monde) => serialiserProjet(
      monde.id, monde.vue, new Palette(monde.id, monde.couleurs.map(depuisHex)),
      [{ nom: monde.id, carte: monde.carte }], [{ nom: 'principale', racine: monde.racine }],
      monde.animations, monde.planches, monde.projection, monde.especes,
      monde.sons ?? [], monde.dialogues ?? [],
      { sauter: ['Space', 'KeyW'] },
      monde.musiques ?? [], monde.textes ?? {},
    )
    const premier = enProjet(m)
    check('un monde emporte ses musiques et ses textes dans le fichier',
      premier.musiques.length > 0 && Object.keys(premier.textes).length >= 2,
      `${premier.musiques.length} musiques, ${Object.keys(premier.textes).join(' et ')}`)
    check('et une musique y est en NOTES, pas en echantillons',
      premier.musiques[0].voies.length > 0
      && premier.musiques[0].voies.every((v) => v.notes.every((n) => typeof n === 'string')),
      `${premier.musiques[0].voies.reduce((n, v) => n + v.notes.length, 0)} notes — `
      + 'la meme minute en fichier d\'onde peserait dix megaoctets')
    check('le timbre d\'une voie est POSE dans la voie, et non renvoye par nom',
      premier.musiques[0].voies.every((v) => v.timbre && typeof v.timbre.forme === 'string'),
      'un renvoi vers le catalogue est une reference qui peut pendre')

    const relu = mondeDepuisProjet(JSON.parse(versTexte(premier)), 'essai.json')
    const second = enProjet(relu)
    for (const champ of ['musiques', 'textes', 'sons', 'dialogues']) {
      check(`« ${champ} » survit a enregistrer, relire, reenregistrer`,
        JSON.stringify(second[champ]) === JSON.stringify(premier[champ]),
        JSON.stringify(second[champ]) === JSON.stringify(premier[champ])
          ? 'identique au caractere pres'
          : `${JSON.stringify(premier[champ]).length} octets deviennent ${JSON.stringify(second[champ]).length}`)
    }
    check('le plan de touches aussi',
      JSON.stringify(second.touches.sauter) === JSON.stringify(['Space', 'KeyW']),
      JSON.stringify(second.touches.sauter))
  }

  /*
   * Le menu de pause est-il VRAIMENT traduit ?
   *
   * La faute qui arrive est toujours la meme : quelqu'un ajoute une ligne au
   * menu et ecrit son libelle en clair, parce que c'est plus court. Rien ne
   * tombe — le menu s'affiche, en francais, dans toutes les langues. On lit
   * donc la source : toute chaine posee dans une `entree(...)` doit venir
   * d'une clef, et toute clef demandee doit exister dans la langue de
   * reference.
   */
  {
    const { readFileSync } = await import('node:fs')
    const { TEXTES_DEMO, LANGUES_DEMO } = await import('../src/demo/textes-demo.ts')
    const source = readFileSync(new URL('../src/demo/mondes.ts', import.meta.url), 'utf8')
    const pause = source.slice(source.indexOf('class Pause'), source.indexOf('function installerMusique'))

    const enClair = [...pause.matchAll(/entree\(\s*'([^']*)'/g)].map((m) => m[1])
    check('aucun libellé du menu de pause n’est écrit en clair',
      enClair.length === 0,
      enClair.length ? `en clair : ${enClair.join(', ')}` : 'tous passent par une clef')

    // Toute chaine en points minuscules dans ce bloc EST une clef : on les
    // prend toutes, y compris celles posees dans un ternaire ou un gabarit,
    // que « .t( » suivi d'un guillemet laisserait passer.
    const clefs = [...new Set([...pause.matchAll(/'([a-z]+(?:\.[a-z]+)+)'/g)].map((m) => m[1]))]
    const inconnues = clefs.filter((c) => TEXTES_DEMO.fr[c] === undefined)
    check('et chaque clef qu’il demande existe en français',
      clefs.length >= 7 && inconnues.length === 0,
      inconnues.length ? `absentes : ${inconnues.join(', ')}` : `${clefs.length} clefs`)

    // La table anglaise est incomplete EXPRES, pour montrer la regle. On
    // verifie que le trou est bien celui qu'on a voulu, et pas un oubli qui
    // s'est ajoute depuis.
    const trous = Object.keys(TEXTES_DEMO.fr).filter((c) => TEXTES_DEMO.en[c] === undefined)
    check('le seul trou de la table anglaise est celui qu’elle annonce',
      trous.join(',') === 'langue.en',
      `${trous.join(', ')} — une clef manquante s’affiche telle quelle, et se voit`)
    check('et les langues du menu ont toutes une table',
      LANGUES_DEMO.every((l) => TEXTES_DEMO[l]), LANGUES_DEMO.join(', '))
  }

  /*
   * L'EDITEUR NE DOIT PAS LAISSER COMPOSER CE QUE LE FICHIER PERD.
   *
   * Les cinq matieres se combinent librement ; les six formes de pente
   * s'excluent — une case n'a qu'une surface. Le format le sait : il ecrit une
   * FORME et non une somme de drapeaux. Si le panneau proposait les pentes en
   * cases a cocher, on pourrait peindre « solide et montant a droite », et
   * l'enregistrement en perdrait la moitie, en silence, jusqu'a la
   * reouverture.
   *
   * On verifie donc la propriete elle-meme : toute matiere que le panneau peut
   * produire survit a l'aller-retour.
   */
  {
    const { MATIERES, FORMES_PENTE_NOMMEES, PENTE, BLESSANTE, SOLIDE,
            matiereEnCaractere, caractereEnMatiere } =
      await import('../src/tuiles/tilemap.ts')
    const { readFileSync } = await import('node:fs')

    // Ce que le panneau peut produire : toute combinaison des cinq cases a
    // cocher, avec au plus une forme de pente — et « blessante » seule
    // survivant au choix d'une pente.
    const possibles = new Set()
    const libres = MATIERES.reduce((n, m) => n | m.drapeau, 0)
    for (let v = 0; v <= libres; v++) possibles.add(v)
    for (const f of FORMES_PENTE_NOMMEES) {
      possibles.add(f.drapeaux)
      possibles.add(f.drapeaux | BLESSANTE)
    }
    const perdues = [...possibles].filter((v) => caractereEnMatiere(matiereEnCaractere(v)) !== v)
    check('toute matière que le panneau peut composer survit à l’enregistrement',
      perdues.length === 0,
      perdues.length ? `${perdues.length} perdues, ex. ${perdues[0]}` : `${possibles.size} combinaisons`)

    // Et le revers : le panneau ne DOIT PAS pouvoir en composer d'autres. On
    // lit sa source — une pente qui reviendrait dans la liste des cases a
    // cocher ferait tomber cette ligne.
    check('et les pentes ne sont pas des cases à cocher',
      MATIERES.every((m) => (m.drapeau & PENTE) === 0)
      && FORMES_PENTE_NOMMEES.length === 6
      && FORMES_PENTE_NOMMEES.every((f) => (f.drapeaux & ~PENTE) === 0),
      `${MATIERES.length} cases à cocher, ${FORMES_PENTE_NOMMEES.length} formes exclusives`)

    const source = readFileSync(new URL('../src/editeur/palette-panneau.ts', import.meta.url), 'utf8')
    check('choisir une pente efface ce qui la contredirait',
      source.includes('courante & ~PENTE') && source.includes('(courante & BLESSANTE) | f.drapeaux'),
      'sinon « solide et montant à droite » se peint, et se perd à l’enregistrement')

    // Le cas qui a dormi : une pente montant a GAUCHE valait soixante-quatre,
    // sortait « z » en base trente-six bornee, et se relisait en mur.
    const gauche = FORMES_PENTE_NOMMEES[1].drapeaux
    check('une pente montant à GAUCHE se relit comme une pente montant à gauche',
      caractereEnMatiere(matiereEnCaractere(gauche)) === gauche
      && (caractereEnMatiere(matiereEnCaractere(gauche)) & SOLIDE) === 0,
      `« ${matiereEnCaractere(gauche)} » — elle sortait « z » et se relisait en mur`)
  }

  // Les matieres traversent l'aller-retour, y compris celles qui ne sont pas
  // du solide. C'est ce qui permet a une pointe de rester une pointe.
  {
    const { Carte, SOLIDE, PLATEFORME, BLESSANTE, LIQUIDE, ECHELLE,
            matiereEnCaractere, caractereEnMatiere } =
      await import('../src/tuiles/tilemap.ts')
    const c = new Carte(6, 2, 16)
    c.ajouterCalque('sol')
    const valeurs = [0, SOLIDE, PLATEFORME, BLESSANTE, SOLIDE | BLESSANTE, LIQUIDE | ECHELLE]
    valeurs.forEach((v, i) => { c.solides[i] = v })

    const projet = serialiserProjet('m', { largeur: 320, hauteur: 180 },
      new Palette('p', []), [{ nom: 'm', carte: c }], [], [], [], undefined, [])
    const ligne = projet.cartes[0].solides[0]
    check('chaque case tient en un caractere, quelle que soit sa matiere',
      ligne.length === 6,
      `« ${ligne} » — en decimal, la valeur 16 en prendrait deux et decalerait la rangee`)

    const relu = relireCarte(projet.cartes[0], (l, h, t) => new Carte(l, h, t))
    check('et les matieres reviennent toutes',
      valeurs.every((v, i) => relu.solides[i] === v),
      `${[...relu.solides].slice(0, 6).join(',')} contre ${valeurs.join(',')}`)

    check('un ancien fichier fait de zeros et de uns se relit tel quel',
      caractereEnMatiere('0') === 0 && caractereEnMatiere('1') === SOLIDE,
      'aucune migration a ecrire')
    check('et un caractere illisible ne fait pas tomber la lecture',
      caractereEnMatiere('?') === 0 && matiereEnCaractere(LIQUIDE) === 'g',
      'une carte a moitie lue vaut mieux qu\'une exception')
  }

  // Une propriete inconnue du lecteur ne doit pas disparaitre en silence :
  // perdre des donnees sans rien dire est pire que refuser de les lire.
  {
    const s = {
      id: 'x', nom: 'chose', type: 'sprite', x: 3, y: 4, visible: true, script: null,
      proprietes: { source: 'a', quelqueChoseDeNeuf: 42 }, enfants: [],
    }
    const n = relireNoeud(s)
    check('une propriete que le lecteur ne connait pas est conservee',
      n.quelqueChoseDeNeuf === 42 && n.source === 'a',
      'une liste blanche par type perdrait tout champ ajoute depuis')
  }

  /*
   * La version n'est pas comparee a un nombre ecrit ici : ce serait deux
   * endroits pour une valeur, et le banc dirait « faux » a chaque montee sans
   * rien avoir verifie. On demande deux choses qui, elles, peuvent etre
   * fausses : que la version parte VRAIMENT dans le fichier, et que le
   * changement qui l'a fait monter soit ECRIT dans l'histoire des versions.
   * Monter la version sans dire ce qu'elle ajoute est ce qui rend un format
   * impossible a porter.
   */
  {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../src/export/format.ts', import.meta.url), 'utf8')
    const p = serialiserProjet('v', { largeur: 320, hauteur: 180 }, new Palette('p', []), [], [])
    check('la version du format est ecrite dans le fichier',
      p.version === VERSION_FORMAT,
      `version ${p.version} — un chargeur d'un autre langage doit pouvoir DIRE qu'il ne comprend pas`)
    const datees = [...source.matchAll(/^ \* \*\*(\d+)\*\* —/gm)].map((m) => Number(m[1]))
    check('et chaque version, celle-ci comprise, dit ce qu\'elle a ajoute',
      datees.includes(VERSION_FORMAT)
      && datees.length === new Set(datees).size
      && datees.every((v, i) => i === 0 || datees[i - 1] > v),
      `${datees.join(', ')} — dans l'ordre, sans doublon, et ${VERSION_FORMAT} y figure`)
  }

  /*
   * Ce qui n'est pas dans le fichier n'existe pas.
   *
   * Le son et les dialogues ont ete ecrits, branches, eprouves — et oublies
   * du format. Un projet enregistre se rouvrait muet, et un export ne
   * contenait pas un octet de son. Aucun banc ne le disait, parce qu'aucun ne
   * demandait « et cela traverse-t-il l'enregistrement ». Celui-ci le demande,
   * et il le demandera pour tout ce qu'on ajoutera ensuite.
   */
  {
    const { mondeCaverne } = await import('../src/demo/mondes.ts')
    const m = mondeCaverne()
    const projet = serialiserProjet(
      m.id, m.vue, new Palette('p', m.couleurs.map(depuisHex)),
      [{ nom: m.id, carte: m.carte }], [{ nom: 'principale', racine: m.racine }],
      m.animations, m.planches, m.projection, m.especes, m.sons ?? [], m.dialogues ?? [],
    )
    const relu = JSON.parse(versTexte(projet))
    check('les sons partent dans le fichier de projet',
      relu.sons.length > 0 && relu.sons.every((q) => q.nom && q.forme && q.duree > 0),
      `${relu.sons.length} sons, dont « ${relu.sons[0]?.nom} »`)
    check('et un son relu décrit exactement le même son',
      JSON.stringify(relu.sons) === JSON.stringify(m.sons),
      'six nombres : la forme, deux fréquences, la durée, le volume, l’enveloppe')
    check('les dialogues aussi, texte et choix compris',
      relu.dialogues.length > 0
      && relu.dialogues[0].repliques.some((r) => r.choix.length > 0)
      && relu.dialogues[0].repliques[0].texte.includes('caverne'),
      `${relu.dialogues[0]?.repliques.length} répliques`)
    check('et le texte du jeu n’est donc plus dans le code',
      relu.dialogues[0].repliques[0].qui === 'Pixl',
      'une faute d’orthographe ne demande plus de recompiler, et une traduction devient possible')
  }
}

console.log('\n--- les quatre mondes se construisent tous ---')

{
  const { mondeEtage } = await import('../src/demo/mondes.ts')
  for (const construire of [mondeDonjon, () => caverne, mondeCitadelle, () => mondeEtage(7)]) {
    const m = construire()
    check(`${m.id} : ${m.projection.mode} vue de ${m.projection.regard}, ${m.carte.largeur}x${m.carte.hauteur}`,
      m.carte.calques.length > 0 && m.couleurs.length > 0 && m.heros.source === 'heros'
      && typeof m.etat() === 'string',
      `${m.carte.calques.length} calques, ${m.couleurs.length} couleurs`)
  }
}

console.log('\n--- les corps mobiles, dans le peuplement ---')

{
  const { creerNoeud } = await import('../src/scene/noeud.ts')
  const { Combat } = await import('../src/runtime/combat.ts')
  const { Peuplement, espece } = await import('../src/runtime/entites.ts')
  const { CorpsMobiles, grilleAvecCorps } = await import('../src/runtime/corps.ts')
  const { clipRegulier } = await import('../src/runtime/animation.ts')

  const T = 16
  // Un sol plein a la rangee 20, et rien d'autre.
  const decor = {
    tuile: T, largeur: 40, hauteur: 40,
    solide: (cx, cy) => cy >= 20,
    matiere: (cx, cy) => (cy >= 20 ? 1 : 0),
  }

  const ESPECES = [
    espece('marcheur', {
      camp: 'heros', pv: 5, vitesse: 0, degats: 0, comportement: 'plateformeur',
      clip: 'immobile', boite: { x: -4, y: -14, l: 8, h: 14 },
    }),
    espece('dalle', {
      camp: 'decor', pv: 9999, vitesse: 0, degats: 0, comportement: 'porteur',
      clip: 'immobile', matiereCorps: 1,
      trajet: { dx: 48, dy: 0, duree: 1000, pause: 0 },
      boite: { x: -8, y: -6, l: 16, h: 6 },
    }),
    espece('blob', {
      camp: 'ennemi', pv: 2, vitesse: 0, degats: 1, comportement: 'immobile',
      clip: 'immobile', boite: { x: -5, y: -7, l: 10, h: 7 },
      degatsPietinement: 2, rebondPietinement: 30, invulnerabiliteMs: 0,
    }),
  ]
  const CLIPS = [clipRegulier('immobile', [0], 1000)]

  /**
   * Le deplacement du vrai jeu, en miniature : la FRACTION est gardee.
   *
   * Un faux `bouger` qui arrondit a chaque appel immobilise tout ce qui avance
   * de moins d'un pixel par pas — une creature a vingt pixels par seconde ne
   * bouge jamais. Le banc accusait alors le moteur d'un defaut qui n'etait que
   * le sien.
   */
  const bougeurFidele = (racine) => {
    const restes = new Map()
    const hote = (cible) => {
      const chercher = (n) => {
        for (const e of n.enfants) { if (e.id === cible.id) return n; const r = chercher(e); if (r) return r }
        return null
      }
      return chercher(racine)
    }
    return (cps, dx, dy) => {
      const r = restes.get(cps.id) ?? { x: 0, y: 0 }
      r.x += dx; r.y += dy
      const px = Math.trunc(r.x); const py = Math.trunc(r.y)
      r.x -= px; r.y -= py
      restes.set(cps.id, r)
      const h = hote(cps)
      if (h) { h.x += px; h.y += py }
      return { dx: px, dy: py, bloque: false }
    }
  }

  /** Un monde minimal : la scene, le combat, le peuplement et le contexte. */
  const monter = () => {
    const racine = creerNoeud('noeud', 'essai')
    const combat = new Combat()
    const corps = new CorpsMobiles()
    const peuplement = new Peuplement(racine, combat, ESPECES, CLIPS, ORTHO_COTE(T), T)
    peuplement.degatsMatiere = 0
    const grille = grilleAvecCorps(decor, corps)
    const ctx = {
      dt: 1 / 60,
      entrees: { consommer: () => false, axe: () => ({ x: 0, y: 0 }), tenue: () => false },
      racine, carte: decor, grille, corps, pas: 0, trouver: () => null,
      bouger: bougeurFidele(racine),
    }
    return { racine, combat, corps, peuplement, ctx }
  }

  // 1. Un corps mobile se declare tout seul au registre du jeu : le peuplement
  //    le remplit depuis la scene, comme il remplit tout le reste.
  {
    const m = monter()
    m.peuplement.poser('dalle', 160, 200)
    m.peuplement.synchroniser()
    m.peuplement.avancer(m.ctx, { x: 0, y: 0 }, 16)
    check('une entite porteuse s\'inscrit au registre des corps mobiles',
      m.corps.nombre === 1, `${m.corps.nombre} corps`)
    // Et elle s'en retire quand elle disparait : un obstacle invisible est
    // pire qu'un obstacle absent.
    const id = m.corps.identifiants[0]
    m.peuplement.tuer(m.peuplement.positions().length ? id : id)
    m.peuplement.avancer(m.ctx, { x: 0, y: 0 }, 16)
    check('et elle s\'en retire quand on la retire de la scene',
      m.corps.nombre === 0, `${m.corps.nombre} corps`)
  }

  // 2. On se tient sur une plateforme mobile, et elle nous emmene. La mesure
  //    qui compte n'est pas « le heros a avance » — la dalle fait un
  //    aller-RETOUR, et sur une fenetre mal choisie le total est nul. C'est
  //    l'ECART entre les deux qui doit rester constant, a chaque pas.
  {
    const m = monter()
    m.peuplement.poser('dalle', 160, 200)
    const h = m.peuplement.poser('marcheur', 160, 180)
    m.peuplement.synchroniser()
    for (let i = 0; i < 40; i++) m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
    const dalle = m.corps.tous[0]
    const pose = h.y
    const ecart = h.x - dalle.x
    let pire = 0
    let gauche = dalle.x
    let droite = dalle.x
    for (let i = 0; i < 150; i++) {
      m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
      pire = Math.max(pire, Math.abs((h.x - dalle.x) - ecart))
      gauche = Math.min(gauche, dalle.x)
      droite = Math.max(droite, dalle.x)
    }
    const parcouru = droite - gauche
    check('le heros se pose sur la plateforme mobile',
      pose === 194, `bas du heros a ${pose}, dessus de la dalle a 194`)
    check('et il garde sa place dessus sur tout l\'aller-retour',
      pire === 0 && parcouru >= 40,
      `ecart maximal ${pire} px, la dalle a parcouru ${parcouru} px`)
  }

  // 3. Sauter sur une tete : la creature meurt, le heros rebondit, et il ne
  //    prend PAS le coup de contact au passage. Ce dernier point est ce que la
  //    passe separee sert a garantir : sans elle, l'ordre des noeuds dans la
  //    scene deciderait qui gagne entre le pied et la dent.
  {
    const m = monter()
    const blob = m.peuplement.poser('blob', 200, 320)
    const h = m.peuplement.poser('marcheur', 200, 290)
    m.peuplement.synchroniser()
    let bas = h.y
    let remonte = 0
    for (let i = 0; i < 60; i++) {
      m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
      m.combat.avancer(1000 / 60)
      bas = Math.max(bas, h.y)
      remonte = Math.max(remonte, bas - h.y)
    }
    const vie = m.combat.vies.get(blob.id)
    const vieH = m.combat.vies.get(h.id)
    check('sauter sur une tete tue la creature', !vie || vie.mort,
      vie ? `${vie.pv} pv, mort=${vie.mort}` : 'retiree')
    check('et le heros rebondit au lieu de retomber', remonte >= 20,
      `tombe jusqu'a ${bas}, remonte de ${remonte} px`)
    check('et il ne mange pas la creature qu\'il vient d\'ecraser',
      vieH.pv === 5, `${vieH.pv} pv sur 5`)
  }

  // 4. On ne pietine pas ce qu'on FROLE. Sans cette condition, passer a cote
  //    d'une creature en tombant la tuerait, et le joueur croirait a un bug —
  //    ou pire, y compterait.
  {
    const m = monter()
    const blob = m.peuplement.poser('blob', 200, 320)
    const h = m.peuplement.poser('marcheur', 220, 290)
    m.peuplement.synchroniser()
    for (let i = 0; i < 60; i++) {
      m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
      m.combat.avancer(1000 / 60)
    }
    const vie = m.combat.vies.get(blob.id)
    check('mais tomber a cote d\'une creature ne la pietine pas',
      vie && !vie.mort && vie.pv === 2, vie ? `${vie.pv} pv` : 'retiree')
  }

  // 4 bis. Une creature pesante TOMBE dans un monde vu de cote, et ne tombe
  //        pas dans un monde vu de dessus. Ce defaut-la n'a ete trouve qu'en
  //        JOUANT : la gelee posee dans la caverne derivait vers le haut de
  //        l'ecran en poursuivant le heros, et aucun banc ne regardait.
  {
    const pesante = espece('lourde', {
      camp: 'ennemi', pv: 2, vitesse: 20, degats: 0, comportement: 'poursuite',
      vigilance: 400, clip: 'immobile', boite: { x: -5, y: -7, l: 10, h: 7 },
      pesante: true,
    })
    const chute = (regard) => {
      const racine = creerNoeud('noeud', 'essai')
      const combat = new Combat()
      const corps = new CorpsMobiles()
      const proj = regard === 'cote' ? ORTHO_COTE(T) : ORTHO_DESSUS(T)
      const p = new Peuplement(racine, combat, [pesante], CLIPS, proj, T)
      p.degatsMatiere = 0
      const grille = grilleAvecCorps(decor, corps)
      const ctx = {
        dt: 1 / 60, entrees: { consommer: () => false, tenue: () => false, axe: () => ({ x: 0, y: 0 }) },
        racine, carte: decor, grille, corps, pas: 0, trouver: () => null,
        bouger: bougeurFidele(racine),
      }
      const n = p.poser('lourde', 200, 200)
      p.synchroniser()
      // La cible est PLUS HAUT qu'elle : sans pesanteur, la poursuite la fait
      // monter, et c'est exactement ce qu'on avait a l'ecran.
      for (let i = 0; i < 120; i++) p.avancer(ctx, { x: 200, y: 100 }, 1000 / 60)
      return n.y - 200
    }
    const cote = chute('cote')
    const dessus = chute('dessus')
    check('une creature pesante tombe dans un monde vu de cote', cote > 40,
      `descendue de ${cote} px`)
    check('et la meme ne tombe pas dans un monde vu de dessus', dessus < 0,
      `deplacee de ${dessus} px — elle monte vers sa cible, comme prevu`)
  }

  // 5. Et l'on ne pietine pas en MONTANT. Le heros saute dans une creature
  //    posee au-dessus de lui : tant qu'il monte, elle ne doit rien perdre —
  //    sinon le joueur apprend un geste qui n'existe pas, et s'en sert.
  {
    const m = monter()
    // Le bouton PRESSE une fois, puis TENU : sans le maintien, la hauteur
    // variable coupe la montee et le saut ne fait que douze pixels. Le banc
    // s'est trompe la-dessus avant d'accuser le moteur.
    let presse = false
    let tenu = false
    m.ctx.entrees = {
      consommer: (a) => a === 'saut' && presse,
      tenue: (a) => a === 'saut' && tenu,
      axe: () => ({ x: 0, y: 0 }),
    }
    const blob = m.peuplement.poser('blob', 200, 290)
    const h = m.peuplement.poser('marcheur', 200, 320)
    m.peuplement.synchroniser()
    for (let i = 0; i < 20; i++) m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
    presse = true
    tenu = true
    m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
    m.combat.avancer(1000 / 60)
    presse = false
    let intacteEnMontant = true
    let pasDeMontee = 0
    for (let i = 0; i < 120; i++) {
      const d = m.peuplement.diagnosticDe(h.id)
      if (d && d.vy >= 0) break
      pasDeMontee++
      m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
      m.combat.avancer(1000 / 60)
      const v = m.combat.vies.get(blob.id)
      if (!v || v.pv < 2) intacteEnMontant = false
    }
    tenu = false
    check('traverser une creature en montant ne la pietine pas',
      intacteEnMontant && pasDeMontee > 5,
      `${pasDeMontee} pas de montee, la creature garde ses points`)
    // Et le revers : en retombant dessus, elle y passe. Une regle qui ne fait
    // jamais rien est indistinguable d'une regle absente.
    let morte = false
    for (let i = 0; i < 200 && !morte; i++) {
      m.peuplement.avancer(m.ctx, { x: h.x, y: h.y }, 1000 / 60)
      m.combat.avancer(1000 / 60)
      const v = m.combat.vies.get(blob.id)
      morte = !v || v.mort
    }
    check('mais en retombant dessus, si', morte, 'la creature est morte a la descente')
  }
}

/*
 * Les cinq controles ci-dessous ont ete ecrits parce que l'agent
 * d'evaluation les reclamait — voir `scripts/agent.mjs`. Il ne demandait pas
 * du code : le code existait. Il demandait des PREUVES, c'est-a-dire des
 * verifications qui deviendraient rouges si la chose disparaissait.
 *
 * On aurait pu faire taire l'agent en elargissant ses indices, ou en
 * renommant les verifications existantes pour qu'elles tombent dans ses
 * mailles. Ce serait regler la mesure sur le resultat voulu, et la mesure ne
 * servirait plus a rien. Chacun de ces cinq controles eprouve donc quelque
 * chose que rien n'eprouvait.
 */

console.log('\n--- ce que l\'agent d\'evaluation reclamait ---')

{
  const { MODELES_DEMO, SYMBOLES_DEMO } = await import('../src/demo/salles-demo.ts')
  const { lireModele } = await import('../src/niveau/modeles.ts')
  const { engendrerPlan } = await import('../src/niveau/plan.ts')
  const { assemblerEtage } = await import('../src/niveau/assemblage.ts')
  const { ORTHO_COTE } = await import('../src/noyau/projection.ts')

  // A. Les roles. Un etage a exactement UN depart, UN boss, UN tresor, UNE
  //    boutique — et le boss est au bout d'une impasse, le plus loin possible
  //    du depart. C'est ce qui fait la forme d'un etage d'Isaac : on sait
  //    qu'on approche parce qu'on s'eloigne.
  {
    let uniques = 0
    let bossImpasse = 0
    let bossPlusLoin = 0
    const N = 40
    for (let graine = 1; graine <= N; graine++) {
      const pl = engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 })
      const compte = (r) => pl.salles.filter((s) => s.role === r).length
      if (compte('depart') === 1 && compte('boss') === 1
        && compte('tresor') === 1 && compte('boutique') === 1) uniques++
      const boss = pl.salles.find((s) => s.role === 'boss')
      const depart = pl.salles.find((s) => s.role === 'depart')
      if (boss && boss.voisines.filter(Boolean).length === 1) bossImpasse++
      // La distance de Manhattan sur la grille de cellules : pas la vraie
      // distance a pied, mais elle suffit a dire « au bout ».
      const loinBoss = boss ? Math.abs(boss.cx - depart.cx) + Math.abs(boss.cy - depart.cy) : 0
      const median = pl.salles
        .map((s) => Math.abs(s.cx - depart.cx) + Math.abs(s.cy - depart.cy))
        .sort((a, b) => a - b)[Math.floor(pl.salles.length / 2)]
      if (loinBoss >= median) bossPlusLoin++
    }
    check('chaque étage a un seul départ, un seul boss, un seul trésor, une seule boutique',
      uniques === N, `${uniques} étages sur ${N}`)
    check('et le boss est au bout d’une impasse, du côté le plus loin du départ',
      bossImpasse === N && bossPlusLoin >= N - 2,
      `${bossImpasse}/${N} en impasse, ${bossPlusLoin}/${N} au-delà de la salle médiane`)
  }

  // B. Le retournement des modeles. Il est cense quadrupler la variete ; s'il
  //    ne changeait rien a l'ecran, on aurait quatre fois la meme salle et
  //    l'illusion d'en avoir seize.
  {
    const rendre = (m, mx, my) => Array.from({ length: 9 }, (_, y) =>
      Array.from({ length: 18 }, (_, x) => lireModele(m, x, y, mx, my, 18, 9)).join('')).join('|')
    const dissymetriques = MODELES_DEMO.filter((m) => {
      const vus = new Set([
        rendre(m, false, false), rendre(m, true, false),
        rendre(m, false, true), rendre(m, true, true),
      ])
      return vus.size === 4
    })
    check('un modèle dissymétrique donne bien quatre salles différentes une fois retourné',
      dissymetriques.length >= 2,
      `${dissymetriques.length} modèles sur ${MODELES_DEMO.length} rendent 4 dessins distincts`)
  }

  // C. Le coeur de la chambre au tresor. Il est POSE par un dessin ; encore
  //    faut-il qu'il tombe sur une case libre, sinon il est dans un mur et la
  //    salle promet un tresor qu'elle ne donne pas.
  {
    let salles = 0
    let atteignables = 0
    for (let graine = 1; graine <= 30; graine++) {
      const pl = engendrerPlan(graine, { salles: 12, largeur: 9, hauteur: 7 })
      const e = assemblerEtage(pl, { modeles: MODELES_DEMO, symboles: SYMBOLES_DEMO })
      for (const q of e.entites.filter((x) => x.espece === 'coeur')) {
        salles++
        const cx = Math.floor(q.x / e.carte.tuile)
        const cy = Math.floor((q.y - 1) / e.carte.tuile)
        if (!e.carte.solide(cx, cy)) atteignables++
      }
    }
    check('un cœur posé par une salle dessinée tombe sur une case libre',
      salles > 0 && atteignables === salles,
      `${atteignables} cœurs libres sur ${salles} posés`)
  }

  // D. La pesanteur ne s'ACCUMULE pas contre le sol. C'est le meme piege que
  //    l'accumulateur du controleur : garder la vitesse acquise contre un sol
  //    ferait s'enfoncer d'un coup a l'instant ou le sol disparait, sans que
  //    personne n'ait rien demande.
  {
    const { creerNoeud } = await import('../src/scene/noeud.ts')
    const { Combat } = await import('../src/runtime/combat.ts')
    const { Peuplement, espece } = await import('../src/runtime/entites.ts')
    const { CorpsMobiles, grilleAvecCorps } = await import('../src/runtime/corps.ts')
    const { clipRegulier } = await import('../src/runtime/animation.ts')
    const T = 16
    let solHaut = 20
    const decor = {
      tuile: T, largeur: 40, hauteur: 40,
      solide: (cx, cy) => cy >= solHaut,
      matiere: (cx, cy) => (cy >= solHaut ? 1 : 0),
    }
    const lourde = espece('lourde', {
      camp: 'ennemi', pv: 2, vitesse: 0, degats: 0, comportement: 'immobile',
      clip: 'immobile', boite: { x: -5, y: -7, l: 10, h: 7 }, pesante: true,
    })
    const racine = creerNoeud('noeud', 'essai')
    const combat = new Combat()
    const corps = new CorpsMobiles()
    const peuplement = new Peuplement(racine, combat, [lourde],
      [clipRegulier('immobile', [0], 1000)], ORTHO_COTE(T), T)
    peuplement.degatsMatiere = 0
    const restes = new Map()
    const hote = (cible) => {
      const ch = (n) => {
        for (const e of n.enfants) { if (e.id === cible.id) return n; const r = ch(e); if (r) return r }
        return null
      }
      return ch(racine)
    }
    const ctx = {
      dt: 1 / 60,
      entrees: { consommer: () => false, tenue: () => false, axe: () => ({ x: 0, y: 0 }) },
      racine, carte: decor, grille: grilleAvecCorps(decor, corps), corps, pas: 0,
      trouver: () => null,
      bouger: (cps, dx, dy) => {
        const r = restes.get(cps.id) ?? { x: 0, y: 0 }
        r.x += dx; r.y += dy
        const px = Math.trunc(r.x); const py = Math.trunc(r.y)
        r.x -= px; r.y -= py
        restes.set(cps.id, r)
        // On bute sur le sol, comme le vrai deplacement.
        const h = hote(cps)
        if (!h) return { dx: 0, dy: 0, bloque: false }
        let fait = 0
        const sy = Math.sign(py)
        for (let i = 0; i < Math.abs(py); i++) {
          const bas = h.y + fait + sy
          if (sy > 0 && Math.floor((bas - 1) / T) >= solHaut) break
          fait += sy
        }
        h.x += px
        h.y += fait
        return { dx: px, dy: fait, bloque: fait !== py }
      },
    }
    const n = peuplement.poser('lourde', 200, 100)
    peuplement.synchroniser()
    for (let i = 0; i < 400; i++) peuplement.avancer(ctx, { x: 200, y: 100 }, 1000 / 60)
    const posee = n.y
    for (let i = 0; i < 200; i++) peuplement.avancer(ctx, { x: 200, y: 100 }, 1000 / 60)
    check('une créature pesante se pose sur le sol et n’y descend plus',
      posee === solHaut * T && n.y === posee,
      `posée à ${posee}, toujours à ${n.y} trois secondes plus tard`)
    // Le sol disparait : elle doit repartir de zero, pas a la vitesse limite.
    solHaut = 30
    const avantChute = n.y
    peuplement.avancer(ctx, { x: 200, y: 100 }, 1000 / 60)
    const premierPas = n.y - avantChute
    check('et sa vitesse de chute est remise à zéro tant qu’elle est posée',
      premierPas <= 1,
      `${premierPas} px au premier pas après la disparition du sol — la vitesse limite en ferait 5`)
  }
}

console.log('\n--- l\'editeur autonome : creer, redimensionner, ajouter ---')

{
  const {
    projetNeuf, redimensionnerProjet, ajouterCalqueProjet, retirerCalqueProjet,
    modifierCalqueProjet, poserEspeceProjet, retirerEspeceProjet, changerVueProjet,
    PROJECTIONS,
  } = await import('../src/editeur/projet-neuf.ts')
  const { versTexte, relireCarte, relireNoeud } = await import('../src/export/format.ts')
  const { Carte } = await import('../src/tuiles/tilemap.ts')

  const relire = (p) => ({
    carte: relireCarte(p.cartes[0], (l, h, t) => new Carte(l, h, t)),
    racine: relireNoeud(p.scenes[0].racine),
  })
  const compterEntites = (n) => (n.espece ? 1 : 0)
    + n.enfants.reduce((s, e) => s + compterEntites(e), 0)

  // 1. Un projet neuf est vide ET jouable. Vide et jouable ne se contredisent
  //    pas : il y a une carte, deux calques, un heros. Un projet neuf sans
  //    heros s'ouvrirait sur un rectangle noir ou « Jouer » ne fait rien, et
  //    la premiere impression serait « c'est casse ».
  {
    const p = projetNeuf()
    const r = relire(p)
    check('un projet neuf a une carte, des calques et un héros',
      r.carte.largeur === 40 && r.carte.hauteur === 24 && r.carte.calques.length === 2
      && compterEntites(r.racine) === 1 && p.especes.length > 0,
      `${r.carte.largeur}×${r.carte.hauteur}, ${r.carte.calques.length} calques,`
      + ` ${compterEntites(r.racine)} entité, ${p.especes.length} espèces`)
    check('et il ne porte pas une seule case peinte',
      r.carte.solides.every((v) => v === 0)
      && r.carte.calques.every((c) => c.presence && c.presence.every((v) => v === 0)),
      'aucune case solide, aucune présence — tout reste à dessiner')
    // Et il traverse le format : c'est le meme chemin que l'enregistrement.
    const relu = JSON.parse(versTexte(p))
    // Et le defaut que ce controle a revele : la presence d'un calque SANS
    // terrain n'etait pas relue. Le fichier l'ecrivait, le lecteur la jetait.
    check('la présence d’un calque sans terrain revient de l’enregistrement',
      r.carte.calques.every((c) => c.presence !== null),
      r.carte.calques.map((c) => `${c.nom}:${c.presence ? 'oui' : 'NON'}`).join(' '))
    check('un projet neuf traverse l’enregistrement sans rien perdre',
      JSON.stringify(relu) === JSON.stringify(JSON.parse(JSON.stringify(p))),
      `${Math.round(versTexte(p).length / 1024)} Ko`)
  }

  // 2. La projection choisie decide aussi du HEROS : un plateformeur dans un
  //    monde vu de dessus tomberait indefiniment vers le sud.
  {
    const dessus = projetNeuf({ projection: 'dessus' })
    const cote = projetNeuf({ projection: 'cote' })
    const herosDe = (p) => relireNoeud(p.scenes[0].racine).enfants.find((n) => n.espece)
    check('une vue de côté donne un héros de côté, une vue de dessus un héros de dessus',
      herosDe(dessus).espece === 'heros' && herosDe(cote).espece === 'heros-cote'
      && cote.projection.regard === 'cote' && dessus.projection.regard === 'dessus',
      `${herosDe(dessus).espece} / ${herosDe(cote).espece}`)
    check('et les trois projections proposées se construisent toutes',
      PROJECTIONS.every((q) => {
        const r = relire(projetNeuf({ projection: q.id }))
        return r.carte.calques.length === 2
      }), PROJECTIONS.map((q) => q.nom).join(', '))
  }

  // 3. Redimensionner : ce qui rentre est GARDE, l'ancrage est le coin
  //    haut-gauche. Un ancrage centre paraitrait plus poli et decalerait tout
  //    ce qu'on a deja dessine, sans que rien ne le dise.
  {
    let p = projetNeuf({ largeur: 10, hauteur: 8 })
    // On peint une case reconnaissable, par le fichier lui-meme.
    const c = p.cartes[0]
    c.solides[2] = `${'0'.repeat(3)}4${'0'.repeat(6)}`
    c.calques[1].cases[2] = c.calques[1].cases[2].split(',').map((v, i) => (i === 3 ? '7' : v)).join(',')

    const grand = redimensionnerProjet(p, 20, 16)
    const rg = relire(grand)
    check('agrandir garde ce qui était dessiné, au même endroit',
      rg.carte.largeur === 20 && rg.carte.hauteur === 16
      && rg.carte.solides[rg.carte.index(3, 2)] === 4
      && rg.carte.calques[1].cases[rg.carte.index(3, 2)] === 7,
      `case 3,2 : matière ${rg.carte.solides[rg.carte.index(3, 2)]},`
      + ` tuile ${rg.carte.calques[1].cases[rg.carte.index(3, 2)]}`)
    check('et le terrain neuf est vide, pas rempli de hasard',
      rg.carte.solides[rg.carte.index(15, 12)] === 0,
      'la case 15,12 — hors de l’ancienne carte — ne fait rien')

    const petit = redimensionnerProjet(p, 5, 5)
    const rp = relire(petit)
    check('réduire ne perd que ce qui dépasse',
      rp.carte.largeur === 5 && rp.carte.hauteur === 5
      && rp.carte.solides[rp.carte.index(3, 2)] === 4
      && rp.carte.cases === 25,
      `${rp.carte.largeur}×${rp.carte.hauteur}, la case 3,2 est toujours là`)
    check('et une carte ne descend pas sous quatre cases',
      relire(redimensionnerProjet(p, 1, 1)).carte.largeur === 4,
      'une carte d’une case ne se peint pas, et ne se dit pas')
  }

  // 4. Les calques : ajouter, retirer, ordonner. Le DERNIER ne se retire pas.
  {
    const p = projetNeuf()
    const plus = ajouterCalqueProjet(p, 'plafond', false)
    check('on ajoute un calque, et il est posé par-dessus les autres',
      plus.cartes[0].calques.length === 3
      && plus.cartes[0].calques[2].nom === 'plafond',
      plus.cartes[0].calques.map((q) => q.nom).join(' → '))
    check('un calque de terrain neuf a bien son terrain',
      ajouterCalqueProjet(p, 'roche', true).cartes[0].calques[2].terrain !== null,
      'sinon l’autotiling ne s’applique pas, et le pinceau ne fait rien')
    check('un nom déjà pris est numéroté au lieu d’écraser',
      ajouterCalqueProjet(plus, 'plafond', false).cartes[0].calques[3].nom === 'plafond 2',
      'deux calques du même nom rendraient « lequel ? » sans réponse')
    check('on retire un calque',
      retirerCalqueProjet(plus, 'plafond').cartes[0].calques.length === 2,
      '3 → 2')
    const un = retirerCalqueProjet(retirerCalqueProjet(p, 'mur'), 'sol')
    check('mais jamais le dernier : une carte sans calque ne se dessine plus',
      un.cartes[0].calques.length === 1, `${un.cartes[0].calques.length} calque restant`)
    const monte = modifierCalqueProjet(p, 'sol', { decaler: 1 })
    check('et l’on change leur ordre',
      monte.cartes[0].calques.map((q) => q.nom).join(',') === 'mur,sol',
      monte.cartes[0].calques.map((q) => q.nom).join(' → '))
    check('et leur visibilité',
      modifierCalqueProjet(p, 'sol', { visible: false }).cartes[0].calques[0].visible === false,
      'un calque caché reste dans le fichier — on ne perd rien en le cachant')
  }

  // 5. Une espece creee dans l'editeur doit avoir EXACTEMENT la forme d'une
  //    espece ecrite en TypeScript : sinon c'est une espece de deuxieme
  //    classe, a qui il manque le champ qu'on vient d'ajouter au moteur.
  {
    const p = projetNeuf()
    const avec = poserEspeceProjet(p, 'ver', { nom: 'Ver', pv: 3, comportement: 'patrouille' })
    const neuve = avec.especes.find((e) => e.id === 'ver')
    const modele = avec.especes.find((e) => e.id === 'gelee')
    check('une espèce créée dans l’éditeur a tous les champs d’une espèce du moteur',
      Object.keys(neuve).sort().join() === Object.keys(modele).sort().join(),
      `${Object.keys(neuve).length} champs, comme « Gelée »`)
    check('et les champs qu’on n’a pas remplis prennent la valeur du moteur',
      neuve.invulnerabiliteMs === modele.invulnerabiliteMs && neuve.matiereCorps === 0,
      `invulnérabilité ${neuve.invulnerabiliteMs} ms`)
    const modifiee = poserEspeceProjet(avec, 'ver', { pv: 9 })
    check('reposer le même identifiant modifie au lieu de dupliquer',
      modifiee.especes.filter((e) => e.id === 'ver').length === 1
      && modifiee.especes.find((e) => e.id === 'ver').pv === 9
      && modifiee.especes.find((e) => e.id === 'ver').nom === 'Ver',
      '9 pv, et le nom est conservé')
  }

  // 6. Retirer une espece retire AUSSI les entites posees qui la portaient.
  //    Les laisser ferait des noeuds qui designent une espece absente : ils ne
  //    se dessinent plus, ne bougent plus, et occupent une case qu'on ne peut
  //    plus viser.
  {
    const p = projetNeuf()
    const avant = compterEntites(relireNoeud(p.scenes[0].racine))
    const sans = retirerEspeceProjet(p, 'heros')
    const apres = compterEntites(relireNoeud(sans.scenes[0].racine))
    check('retirer une espèce retire les entités posées qui la portaient',
      sans.especes.every((e) => e.id !== 'heros') && apres === avant - 1,
      `${avant} entité(s) → ${apres}`)
  }

  // 7. La vue : elle decide de ce que le joueur voit, et rien d'autre.
  {
    const p = changerVueProjet(projetNeuf(), 480, 270)
    check('on change la résolution virtuelle du jeu',
      p.vue.largeur === 480 && p.vue.hauteur === 270, '480×270')
    check('mais pas en dessous de ce qui se voit',
      changerVueProjet(p, 4, 4).vue.largeur === 32, 'une vue de quatre pixels ne montre rien')
  }
}

const echecs = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - echecs.length}/${bilan.length} verifications reussies`)
if (echecs.length) {
  for (const e of echecs) console.log(`  ECHEC ${e.nom}`)
  process.exit(1)
}
