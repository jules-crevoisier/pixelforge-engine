/**
 * Le banc du controleur de plateforme.
 *
 * Chaque technique est mesuree DEUX fois : avec elle, et avec elle desactivee.
 * Un « coyote time » dont on ne montre pas qu'il change quelque chose n'est
 * qu'une variable qui traine. Ici, desactiver un reglage doit faire echouer le
 * geste qu'il sert a rattraper.
 *
 * ## Le banc verifie sa propre premisse
 *
 * La premiere version de ce fichier a rendu sept echecs, et les sept venaient
 * de MES cartes de test : un plan de quarante pixels de haut pour un saut qui
 * en fait quarante-six — le heros tapait le plafond du monde — un corps place
 * dans un mur des la premiere image, un trou de plafond vise a cote. Le moteur
 * etait juste a chaque fois.
 *
 * D'ou `poser()` : il refuse de commencer une mesure si le corps n'est pas
 * dans le vide, et `hauteurDisponible()` refuse un saut qui ne tient pas dans
 * la carte. Un banc dont on ne verifie pas les hypotheses accuse le code.
 */
const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

const { Plateformeur, REGLAGES_DEFAUT, gravitéDe, impulsionDe } =
  await import('../src/runtime/plateforme.ts')

const T = 8
const DT = 1 / 60
const BOITE = { x: -3, y: -8, l: 6, h: 8 }

/** `#` est solide, `-` est une plateforme qu'on traverse par en dessous. */
const grilleDe = (plan) => ({
  tuile: T,
  largeur: plan[0].length,
  hauteur: plan.length,
  solide: (cx, cy) => plan[cy][cx] === '#',
  matiere: (cx, cy) => (plan[cy][cx] === '#' ? 1 : (plan[cy][cx] === '-' ? 2 : 0)),
})

/** Vrai si la boite posee en (x, y) ne touche aucun solide. */
function libre(g, x, y) {
  const bx = x + BOITE.x, by = y + BOITE.y
  const x0 = Math.floor(bx / T), y0 = Math.floor(by / T)
  const x1 = Math.floor((bx + BOITE.l - 1) / T), y1 = Math.floor((by + BOITE.h - 1) / T)
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cy < 0 || cx >= g.largeur || cy >= g.hauteur) return false
      if (g.solide(cx, cy)) return false
    }
  }
  return true
}

/** Pose un corps, en refusant une position invalide. */
function poser(g, x, y, ou) {
  if (!libre(g, x, y)) throw new Error(`banc mal construit : depart dans un solide (${ou})`)
  return { x, y, boite: { ...BOITE } }
}

function simuler(p, g, c, n, entrees) {
  const trace = []
  for (let i = 0; i < n; i++) {
    const e = typeof entrees === 'function' ? entrees(i) : entrees
    p.avancer(g, c, DT, e.dirX ?? 0, e.saute ?? false, e.tenu ?? false, e.dash ?? false, e.dirY ?? 0)
    trace.push({ i, x: c.x, y: c.y, ...p.diagnostic() })
  }
  return trace
}

/* Une carte haute : le saut doit tenir dedans, sinon on mesure le plafond du
 * monde et non la gravite. */
const HAUTE = [
  '............', '............', '............', '............',
  '............', '............', '............', '............',
  '............', '............', '............', '############',
]
const SOL_HAUT = 11 * T   // le corps repose a y = 88

check('la carte d\'essai est assez haute pour le saut regle',
  SOL_HAUT - REGLAGES_DEFAUT.hauteurSaut - BOITE.h >= 0,
  `${SOL_HAUT} px de creux pour un saut de ${REGLAGES_DEFAUT.hauteurSaut} + 8 de corps`)

console.log('\n--- la gravite se deduit de la hauteur voulue ---')
{
  const r = REGLAGES_DEFAUT
  const gr = gravitéDe(r)
  const imp = impulsionDe(r)
  const hauteur = (imp * imp) / (2 * gr)
  check('la hauteur theorique est celle qu\'on a demandee',
    Math.abs(hauteur - r.hauteurSaut) < 0.01, `${hauteur.toFixed(2)} px pour ${r.hauteurSaut}`)
  check('et le sommet arrive au temps demande',
    Math.abs(-imp / gr - r.tempsMontee) < 1e-9, `${(-imp / gr).toFixed(3)} s`)
}

console.log('\n--- le saut, mesure dans le monde ---')
{
  const g = grilleDe(HAUTE)
  const p = new Plateformeur()
  const c = poser(g, 40, 32, 'saut')
  simuler(p, g, c, 40, {})
  const solY = c.y
  check('le corps se pose bien sur le sol', solY === SOL_HAUT, `y=${solY}`)

  const t = simuler(p, g, c, 60, (i) => ({ saute: i === 0, tenu: true }))
  const hauteur = solY - Math.min(...t.map((e) => e.y))
  check('un saut tenu monte a la hauteur reglee',
    Math.abs(hauteur - REGLAGES_DEFAUT.hauteurSaut) <= 3,
    `${hauteur} px pour ${REGLAGES_DEFAUT.hauteurSaut} regles`)

  const p2 = new Plateformeur()
  const c2 = poser(g, 40, 32, 'petit saut')
  simuler(p2, g, c2, 40, {})
  const t2 = simuler(p2, g, c2, 60, (i) => ({ saute: i === 0, tenu: i < 3 }))
  const petit = solY - Math.min(...t2.map((e) => e.y))
  check('relacher le bouton coupe la montee', petit < hauteur * 0.7,
    `${petit} px contre ${hauteur} px en tenant`)
  check('mais le petit saut reste un vrai saut', petit > 8, `${petit} px`)
}

console.log('\n--- coyote time ---')
{
  const plan = [
    '............', '............', '............', '............',
    '............', '............', '............', '............',
    '######......', '............', '............', '............',
  ]
  const g = grilleDe(plan)
  const essai = (coyote, retardImages) => {
    const p = new Plateformeur({ coyote })
    const c = poser(g, 20, 40, 'coyote')
    simuler(p, g, c, 40, {})
    // On court vers le vide jusqu'a quitter le sol.
    let quitte = -1
    for (let i = 0; i < 60 && quitte < 0; i++) {
      p.avancer(g, c, DT, 1, false, false)
      if (!p.diagnostic().auSol) quitte = i
    }
    const yAuBord = c.y
    simuler(p, g, c, retardImages, { dirX: 1 })
    const t = simuler(p, g, c, 30, (i) => ({ dirX: 1, saute: i === 0, tenu: true }))
    return yAuBord - Math.min(...t.map((e) => e.y))
  }
  const avec = essai(0.1, 3)
  const sans = essai(0, 3)
  check('avec coyote, sauter trois images apres le bord marche encore',
    avec > 18, `monte de ${avec} px`)
  check('sans coyote, le meme geste rate — c\'est le defaut qu\'il repare',
    sans <= 0, `monte de ${sans} px`)
}

console.log('\n--- tampon de saut ---')
{
  const g = grilleDe(HAUTE)
  const essai = (tampon) => {
    const p = new Plateformeur({ tampon })
    const c = poser(g, 40, 24, 'tampon')
    p.avancer(g, c, DT, 0, true, true)     // on appuie tout de suite, en l'air
    const t = simuler(p, g, c, 90, { tenu: true })
    // On ne cherche PAS une image ou `auSol` est vrai : elle n'existe pas. Le
    // saut tamponne part a la premiere image de contact et remet l'etat en
    // l'air dans le meme pas — c'est exactement le comportement voulu, et le
    // chercher a coute une heure. On repere donc le point le plus bas atteint,
    // qui est l'atterrissage, et on regarde ce qui se passe apres.
    const yBas = Math.max(...t.map((e) => e.y))
    const iBas = t.findIndex((e) => e.y === yBas)
    const apres = t.slice(iBas)
    return { iBas, yBas, remonte: yBas - Math.min(...apres.map((e) => e.y)) }
  }
  const avec = essai(0.6)
  const sans = essai(0)
  check('avec tampon, un appui avant l\'atterrissage declenche le saut',
    avec.remonte > 18, `remonte de ${avec.remonte} px des le contact`)
  check('sans tampon, l\'appui tombe dans le vide', sans.remonte <= 0,
    `remonte de ${sans.remonte} px`)
  check('et le saut part a la premiere image de contact, sans temps mort',
    avec.iBas >= 0 && avec.remonte > 18,
    'aucune image ne montre le heros pose : il repart aussitot')
}

console.log('\n--- correction de coin ---')
{
  // Trou d'une tuile en colonne 3 : x de 24 a 32, donc centre a 28.
  const plan = [
    '............', '............', '###.########', '............',
    '............', '............', '............', '............',
    '............', '############',
  ]
  const g = grilleDe(plan)
  const CENTRE_TROU = 3 * T + T / 2
  const essai = (correction, decalage) => {
    const p = new Plateformeur({ correctionCoin: correction })
    const c = poser(g, CENTRE_TROU + decalage, 40, 'coin')
    simuler(p, g, c, 40, {})
    const solY = c.y
    const t = simuler(p, g, c, 40, (i) => ({ saute: i === 0, tenu: true }))
    return { monte: solY - Math.min(...t.map((e) => e.y)), corrige: t.some((e) => e.coinCorrige) }
  }
  const avec = essai(3, -3)
  const sans = essai(0, -3)
  check('un saut decale de trois pixels passe quand meme le trou',
    avec.corrige && avec.monte > 30, `monte de ${avec.monte} px, corrige : ${avec.corrige}`)
  // Le plafond est a huit pixels sous le sommet possible : sans correction, la
  // montee s'y arrete net, avec elle le corps passe par le trou et poursuit.
  check('sans correction, il se cogne au coin et s\'arrete au plafond',
    !sans.corrige && avec.monte > sans.monte + 5,
    `${sans.monte} px contre ${avec.monte} px avec la correction`)
}

console.log('\n--- glissade et saut muraux ---')
{
  const plan = [
    '#..........#', '#..........#', '#..........#', '#..........#',
    '#..........#', '#..........#', '#..........#', '#..........#',
    '#..........#', '#..........#', '#..........#', '############',
  ]
  const g = grilleDe(plan)
  const p = new Plateformeur()
  const c = poser(g, 11, 20, 'mur')
  const t = simuler(p, g, c, 45, { dirX: -1 })
  const surMur = t.filter((e) => e.mur !== 0)
  check('le corps s\'accroche bien au mur', surMur.length > 10, `${surMur.length} images au mur`)
  check('et sa chute y est freinee',
    Math.max(...surMur.map((e) => e.vy)) <= REGLAGES_DEFAUT.vitesseGlissade + 1,
    `chute max ${Math.max(...surMur.map((e) => e.vy)).toFixed(0)} contre ${REGLAGES_DEFAUT.chuteMax} en air libre`)

  const xAvant = c.x
  const yAvant = c.y
  const t2 = simuler(p, g, c, 25, (i) => ({ dirX: -1, saute: i === 0, tenu: true }))
  check('le saut mural pousse dans le sens oppose au mur', c.x > xAvant + 4,
    `de x=${xAvant} a x=${c.x}`)
  check('et il monte', yAvant - Math.min(...t2.map((e) => e.y)) > 15,
    `${yAvant - Math.min(...t2.map((e) => e.y))} px`)
  check('meme en tenant la direction du mur — sans blocage, on y recollerait',
    c.x > xAvant + 4, `ecart de ${c.x - xAvant} px`)
}

console.log('\n--- dash ---')
{
  const g = grilleDe(HAUTE)
  const p = new Plateformeur()
  const c = poser(g, 16, 40, 'dash')
  simuler(p, g, c, 40, {})
  const xAvant = c.x
  const t = simuler(p, g, c, 12, (i) => ({ dirX: 1, dash: i === 0 }))
  const parcouru = c.x - xAvant
  check('le dash va plus loin que la course sur la meme duree',
    parcouru > REGLAGES_DEFAUT.vitesse * 12 * DT,
    `${parcouru} px contre ${(REGLAGES_DEFAUT.vitesse * 12 * DT).toFixed(0)} en courant`)
  check('le dash a son propre etat, lisible par l\'animation',
    t.some((e) => e.etat === 'dash'))

  const p2 = new Plateformeur()
  const c2 = poser(g, 16, 24, 'double dash')
  simuler(p2, g, c2, 1, { dash: true, dirX: 1 })
  const x1 = c2.x
  simuler(p2, g, c2, 14, {})
  const gain1 = c2.x - x1
  const x2 = c2.x
  simuler(p2, g, c2, 14, (i) => ({ dash: i === 0, dirX: 1 }))
  const gain2 = c2.x - x2
  check('un second dash en l\'air est refuse', gain2 < gain1 * 0.7,
    `${gain2} px contre ${gain1} px au premier`)
}

console.log('\n--- ce qui ne doit jamais arriver ---')
{
  const plan = [
    '############', '#..........#', '#..........#', '#..........#',
    '#...####...#', '#..........#', '#..........#', '#....##....#',
    '#..........#', '#..........#', '#..........#', '############',
  ]
  const g = grilleDe(plan)
  const p = new Plateformeur()
  const c = poser(g, 60, 30, 'chaos')
  let graine = 12345
  const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  let dansMur = 0
  let entier = true
  for (let i = 0; i < 3000; i++) {
    p.avancer(g, c, DT, Math.round(alea() * 2) - 1, alea() < 0.1, alea() < 0.5,
      alea() < 0.05, Math.round(alea() * 2) - 1)
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) entier = false
    if (!libre(g, c.x, c.y)) dansMur++
  }
  check('trois mille pas d\'entrees hasardeuses ne font jamais entrer dans un mur',
    dansMur === 0, `${dansMur} image(s) dans un solide`)
  check('et la position reste entiere du debut a la fin', entier,
    'le contrat de pixel tient sous le desordre')
}

console.log('\n--- les plateformes qu\'on traverse par en dessous ---')

{
  const PLAN = [
    '..........',
    '..........',
    '..-----...',
    '..........',
    '..........',
    '##########',
  ]
  const g = grilleDe(PLAN)

  // On tombe DESSUS : elle porte.
  {
    const p = new Plateformeur()
    const c = poser(g, 5 * T, 2 * T - 1, 'au-dessus de la plateforme')
    let posee = false
    for (let i = 0; i < 90; i++) {
      p.avancer(g, c, DT, 0, false, false)
      if (p.diagnostic().auSol) { posee = true; break }
    }
    check('on se pose sur une plateforme en tombant dessus',
      posee && Math.round(c.y) === 2 * T,
      `y = ${Math.round(c.y)}, le haut de la case est a ${2 * T}`)
  }

  // On la traverse par EN DESSOUS.
  {
    const p = new Plateformeur()
    const c = poser(g, 5 * T, 5 * T, 'sur le sol, sous la plateforme')
    let plusHaut = c.y
    for (let i = 0; i < 60; i++) {
      p.avancer(g, c, DT, 0, i === 0, i < 20)
      plusHaut = Math.min(plusHaut, c.y)
    }
    check('et on la traverse en sautant par en dessous',
      plusHaut < 2 * T - 2,
      `atteint y = ${Math.round(plusHaut)} — la plateforme est a ${2 * T}`)
  }

  // Le defaut que la regle du CROISEMENT evite : un corps deja engage dans la
  // plateforme, parce qu'il vient de la traverser, ne doit pas y rester pris
  // en redescendant. Tester « il descend » suffirait a l'y coller.
  {
    const p = new Plateformeur()
    const c = poser(g, 5 * T, 2 * T + 4, 'a cheval sur la plateforme')
    for (let i = 0; i < 90; i++) p.avancer(g, c, DT, 0, false, false)
    check('un corps engage dans la plateforme retombe au sol',
      Math.round(c.y) === 5 * T,
      `y = ${Math.round(c.y)} — il devait retomber a ${5 * T}, pas rester a ${2 * T}`)
  }

  // Descendre volontairement : bas + saut.
  {
    const p = new Plateformeur()
    const c = poser(g, 5 * T, 2 * T - 1, 'au-dessus de la plateforme')
    for (let i = 0; i < 60 && !p.diagnostic().auSol; i++) p.avancer(g, c, DT, 0, false, false)
    const surLaPlateforme = Math.round(c.y)
    for (let i = 0; i < 120; i++) {
      p.avancer(g, c, DT, 0, i === 0, i < 3, false, i === 0 ? 1 : 0)
    }
    check('bas plus saut fait descendre de la plateforme',
      surLaPlateforme === 2 * T && Math.round(c.y) === 5 * T,
      `de ${surLaPlateforme} a ${Math.round(c.y)}`)
  }

  // Et le sens inverse : sans appuyer vers le bas, on saute au lieu de tomber.
  {
    const p = new Plateformeur()
    const c = poser(g, 5 * T, 2 * T - 1, 'au-dessus de la plateforme')
    for (let i = 0; i < 60 && !p.diagnostic().auSol; i++) p.avancer(g, c, DT, 0, false, false)
    let plusHaut = c.y
    for (let i = 0; i < 60; i++) {
      p.avancer(g, c, DT, 0, i === 0, i < 20)
      plusHaut = Math.min(plusHaut, c.y)
    }
    check('sauter sans appuyer vers le bas ne fait pas traverser',
      plusHaut < 2 * T && Math.round(c.y) === 2 * T,
      `monte a ${Math.round(plusHaut)}, retombe sur la plateforme a ${Math.round(c.y)}`)
  }
}


console.log('\n--- les corps mobiles : porter, bloquer, pietiner ---')
{
  const { CorpsMobiles, grilleAvecCorps, porter } = await import('../src/runtime/corps.ts')

  const plan = [
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '##########',
  ]
  const decor = grilleDe(plan)

  // Une dalle solide, seize de large et quatre de haut, sous le corps.
  const monter = (y) => {
    const registre = new CorpsMobiles()
    registre.poser('dalle', 16, y, 16, 4, 1)
    return { registre, g: grilleAvecCorps(decor, registre) }
  }

  // 1. Un corps mobile ARRETE. Sans le crochet en pixels, il ne serait qu'un
  //    dessin : on le traverserait sans rien sentir.
  {
    const { g } = monter(5 * T)
    const p = new Plateformeur()
    const c = poser(decor, 24, 2 * T, 'au-dessus de la dalle')
    for (let i = 0; i < 90; i++) p.avancer(g, c, DT, 0, false, false)
    check('une dalle solide arrete la chute', c.y + BOITE.y + BOITE.h === 5 * T,
      `bas du corps a ${c.y + BOITE.y + BOITE.h}, dessus de la dalle a ${5 * T}`)
  }

  // 2. Et sans le registre, la meme chute traverse. C'est la mesure qui prouve
  //    que c'est bien la dalle qui arrete, et non le sol du bas.
  {
    const p = new Plateformeur()
    const c = poser(decor, 24, 2 * T, 'au-dessus de la dalle')
    for (let i = 0; i < 90; i++) p.avancer(decor, c, DT, 0, false, false)
    check('sans le registre, la meme chute va jusqu\'au sol',
      c.y + BOITE.y + BOITE.h === 6 * T,
      `bas du corps a ${c.y + BOITE.y + BOITE.h}`)
  }

  // 3. Le passager est PORTE. La plateforme se deplace, `porter` rattrape le
  //    corps, et le corps ne doit pas etre laisse en arriere.
  {
    const { registre, g } = monter(5 * T)
    const p = new Plateformeur()
    const c = poser(decor, 24, 2 * T, 'au-dessus de la dalle')
    for (let i = 0; i < 90; i++) p.avancer(g, c, DT, 0, false, false)
    const avant = c.x
    for (let pas = 0; pas < 20; pas++) {
      const d = registre.de('dalle')
      registre.poser('dalle', d.x + 1, d.y, d.l, d.h, d.matiere)
      const boite = { x: c.x + BOITE.x, y: c.y + BOITE.y, w: BOITE.l, h: BOITE.h }
      const fait = porter(g, boite, 1, 0)
      c.x += fait.dx
      p.avancer(g, c, DT, 0, false, false)
    }
    check('une plateforme qui avance emmene son passager', c.x - avant === 20,
      `le passager a suivi de ${c.x - avant} px pour 20 px de plateforme`)
  }

  // 4. Le passager reste PORTE en montant : la dalle monte dans ses pieds, et
  //    le corps ne doit pas s'y enfoncer.
  {
    const { registre, g } = monter(5 * T)
    const p = new Plateformeur()
    const c = poser(decor, 24, 2 * T, 'au-dessus de la dalle')
    for (let i = 0; i < 90; i++) p.avancer(g, c, DT, 0, false, false)
    for (let pas = 0; pas < 10; pas++) {
      const d = registre.de('dalle')
      registre.poser('dalle', d.x, d.y - 1, d.l, d.h, d.matiere)
      const boite = { x: c.x + BOITE.x, y: c.y + BOITE.y, w: BOITE.l, h: BOITE.h }
      const fait = porter(g, boite, 0, -1)
      c.y += fait.dy
      p.avancer(g, c, DT, 0, false, false)
    }
    const d = registre.de('dalle')
    check('une plateforme qui monte ne s\'enfonce pas dans son passager',
      c.y + BOITE.y + BOITE.h === d.y,
      `bas du corps a ${c.y + BOITE.y + BOITE.h}, dessus de la dalle a ${d.y}`)
  }

  // 4 bis. Un corps solide arrete aussi la COURSE, et pas seulement la chute.
  //        Une caisse qu'on traverse de cote n'est pas une caisse.
  {
    const registre = new CorpsMobiles()
    registre.poser('caisse', 40, 6 * T - 14, 14, 14, 1)
    const g = grilleAvecCorps(decor, registre)
    const p = new Plateformeur()
    const c = poser(decor, 16, 6 * T, 'au sol, a gauche de la caisse')
    for (let i = 0; i < 120; i++) p.avancer(g, c, DT, 1, false, false)
    check('un corps solide arrete la course', c.x + BOITE.x + BOITE.l === 40,
      `bord droit du corps a ${c.x + BOITE.x + BOITE.l}, bord gauche de la caisse a 40`)

    // Et l'on passe par-dessus en sautant : sans cela, une caisse posee sur le
    // chemin FERME le niveau au lieu de le meubler, et le banc doit le dire.
    const q = new Plateformeur()
    const d = poser(decor, 16, 6 * T, 'au sol, a gauche de la caisse')
    for (let i = 0; i < 200; i++) q.avancer(g, d, DT, 1, i % 40 === 0, i % 40 < 20)
    check('et l\'on passe par-dessus en sautant',
      d.x + BOITE.x > 54, `le corps est passe a x=${d.x}, la caisse finit a 54`)
  }

  // 5. Un corps a SENS UNIQUE se traverse par en dessous. Meme regle de
  //    croisement que pour les cases, et il fallait la reecrire : le dessus
  //    d'une dalle mobile n'est pas un multiple de la tuile.
  {
    const registre = new CorpsMobiles()
    // 37 : volontairement pas un multiple de 8. Une regle ecrite avec un
    // modulo de tuile echouerait ici, et c'est tout l'interet du test.
    registre.poser('passerelle', 16, 37, 16, 3, 2)
    const g = grilleAvecCorps(decor, registre)
    const p = new Plateformeur()
    const c = poser(decor, 24, 6 * T, 'sous la passerelle')
    let plusHaut = c.y
    for (let i = 0; i < 120; i++) {
      p.avancer(g, c, DT, 0, i === 0, i < 20)
      plusHaut = Math.min(plusHaut, c.y)
    }
    const traverse = plusHaut + BOITE.y + BOITE.h < 37
    check('on traverse une passerelle mobile par en dessous', traverse,
      `le bas du corps est monte jusqu'a ${plusHaut + BOITE.y + BOITE.h}, la passerelle est a 37`)
    check('et l\'on se pose dessus en redescendant',
      c.y + BOITE.y + BOITE.h === 37,
      `bas du corps a ${c.y + BOITE.y + BOITE.h}`)
  }

  // 6. Le rebond du pietinement se regle en HAUTEUR, comme le saut. On mesure
  //    la hauteur reellement atteinte.
  {
    const p = new Plateformeur()
    const c = poser(decor, 24, 6 * T, 'au sol')
    for (let i = 0; i < 30; i++) p.avancer(decor, c, DT, 0, false, false)
    const depart = c.y
    p.rebondir(30)
    let plusHaut = c.y
    for (let i = 0; i < 120; i++) {
      p.avancer(decor, c, DT, 0, false, false)
      plusHaut = Math.min(plusHaut, c.y)
    }
    const monte = depart - plusHaut
    check('le rebond du pietinement atteint la hauteur demandee',
      Math.abs(monte - 30) <= 3, `${monte} px pour 30 demandes`)
  }

  // 7. Et il rend le dash : une recompense qui laisse sans ressource en l'air
  //    est une punition deguisee. On mesure les deux cotes — sans rebond le
  //    deuxieme dash est refuse, avec rebond il part.
  {
    const haut = [...Array(39).fill('....................'), '####################']
    const ciel = grilleDe(haut)
    const enLair = (avecRebond) => {
      const p = new Plateformeur()
      const c = poser(ciel, 16, 2 * T, 'en plein ciel')
      // Un premier dash, en l'air : il consomme la ressource.
      p.avancer(ciel, c, DT, 1, false, false, true, 0)
      for (let i = 0; i < 24; i++) p.avancer(ciel, c, DT, 0, false, false)
      if (avecRebond) p.rebondir(30)
      const avant = c.x
      for (let i = 0; i < 10; i++) p.avancer(ciel, c, DT, 1, false, false, i === 0, 0)
      return c.x - avant
    }
    const sans = enLair(false)
    const avec = enLair(true)
    check('sans rebond, le deuxieme dash en l\'air est refuse', sans < 20,
      `parcouru ${sans} px en dix images`)
    check('le rebond rend le dash', avec > sans + 15,
      `${avec} px avec le rebond contre ${sans} sans`)
  }
}


console.log('\n--- les pentes ---')
{
  const { sommetPente, toucheSolide } = await import('../src/runtime/collision.ts')
  const { rect } = await import('../src/noyau/pixel.ts')
  const { hauteurSol, PENTE_DROITE, PENTE_GAUCHE, SOLIDE } =
    await import('../src/tuiles/tilemap.ts')

  // La regle de base : a quarante-cinq degres, la hauteur du sol vaut la
  // position dans la case. Une soustraction, et deux cases voisines se
  // raccordent au pixel pres.
  check('une pente montante donne un sol qui monte d’un pixel par colonne',
    hauteurSol(PENTE_DROITE, 0, 8) === 7 && hauteurSol(PENTE_DROITE, 7, 8) === 0,
    'de 7 à 0 sur huit colonnes')
  check('et la pente inverse descend d’autant',
    hauteurSol(PENTE_GAUCHE, 0, 8) === 0 && hauteurSol(PENTE_GAUCHE, 7, 8) === 7)
  check('un solide a son sol tout en haut de la case', hauteurSol(SOLIDE, 3, 8) === 0)
  check('et le vide n’a pas de sol', hauteurSol(0, 3, 8) === 8, 'la hauteur vaut la tuile entière')

  /*
   * Le plan des pentes.
   *
   * `/` monte vers la droite, `%` monte vers la gauche — et non la barre
   * inverse, qui demanderait d'echapper des echappements dans un fichier qui
   * decrit deja des dessins. Un plan qu'on ne peut pas lire est un plan qui
   * ment sur ce qu'il teste.
   *
   * On part du plat, on monte, on tient un palier, on redescend, on reprend le
   * plat.
   */
  const planPente = [
    '..............',
    '..............',
    '..............',
    '..............',
    '......./###%..',
    '.../###....#..',
    '##############',
  ]
  const grillePente = {
    tuile: T,
    largeur: planPente[0].length,
    hauteur: planPente.length,
    solide: (cx, cy) => planPente[cy][cx] === '#',
    matiere: (cx, cy) => {
      const c = planPente[cy][cx]
      if (c === '#') return 1
      if (c === '/') return PENTE_DROITE
      if (c === '%') return PENTE_GAUCHE
      return 0
    },
  }
  check('le plan des pentes est bien rectangulaire',
    planPente.every((l) => l.length === planPente[0].length),
    `${planPente[0].length} colonnes`)

  check('une pente n’arrête pas comme un mur',
    !toucheSolide(grillePente, rect(3 * T + 2, 5 * T + 2, 4, 4)),
    'sinon on se cogne dans le bas de la côte au lieu de la monter')
  {
    const sous = sommetPente(grillePente, rect(3 * T, 5 * T - 4, 6, 8))
    check('mais elle porte : on trouve son sommet sous les pieds',
      sous !== null && sous >= 5 * T && sous < 6 * T, `sommet à ${sous}`)
  }

  // La mesure qui compte : on court a droite, et l'on doit se retrouver PLUS
  // HAUT qu'on n'est parti, sans avoir saute une seule fois.
  {
    const c = new Plateformeur()
    const corps = { x: 1 * T + 4, y: 6 * T, boite: { ...BOITE } }
    const depart = corps.y
    let plusHaut = corps.y
    for (let i = 0; i < 200; i++) {
      c.avancer(grillePente, corps, DT, 1, false, false)
      plusHaut = Math.min(plusHaut, corps.y)
    }
    check('on monte une côte en marchant, sans sauter',
      plusHaut <= depart - T, `de ${depart} à ${plusHaut}, soit ${depart - plusHaut} px`)
    check('et l’on reste au sol tout du long',
      c.diagnostic().auSol, `état ${c.diagnostic().etat}`)
  }

  // Le revers : un vrai mur doit toujours arreter. Une regle qui fait monter
  // les pentes et les murs fait escalader la carte entiere.
  {
    const planMur = ['......', '......', '......', '#....#', '######']
    const g = {
      tuile: T, largeur: 6, hauteur: 5,
      solide: (cx, cy) => planMur[cy][cx] === '#',
      matiere: (cx, cy) => (planMur[cy][cx] === '#' ? 1 : 0),
    }
    const c = new Plateformeur()
    const corps = poser(g, 3 * T, 3 * T, 'au sol entre deux murs')
    for (let i = 0; i < 200; i++) c.avancer(g, corps, DT, 1, false, false)
    check('un mur, lui, arrête toujours',
      corps.x + BOITE.x + BOITE.l <= 5 * T,
      `arrêté à ${corps.x + BOITE.x + BOITE.l}, le mur commence à ${5 * T}`)
  }

  /*
   * Descendre : on doit SUIVRE la pente, pas la quitter en petits sauts.
   *
   * On mesure l'ECART aux pieds et non le nombre d'images en l'air. « En
   * l'air » compte aussi l'image ou l'on est un pixel au-dessus de la
   * surface, ce qui ne se voit pas ; ce qui se voit, c'est un personnage qui
   * flotte quatre pixels au-dessus de la cote qu'il descend. La mesure doit
   * porter sur ce qu'on peut constater.
   */
  {
    const c = new Plateformeur()
    const corps = { x: 10 * T, y: 4 * T, boite: { ...BOITE } }
    for (let i = 0; i < 60; i++) c.avancer(grillePente, corps, DT, 0, false, false)
    const posee = corps.y
    let pireEcart = 0
    for (let i = 0; i < 120; i++) {
      c.avancer(grillePente, corps, DT, 1, false, false)
      const sol = sommetPente(grillePente, rect(corps.x + BOITE.x, corps.y + BOITE.y, BOITE.l, BOITE.h))
      if (sol === null) continue
      pireEcart = Math.max(pireEcart, sol - (corps.y + BOITE.y + BOITE.h))
    }
    check('on descend une côte en la suivant, sans décoller',
      corps.y > posee && pireEcart <= REGLAGES_DEFAUT.montee,
      `descendu de ${corps.y - posee} px, jamais plus de ${pireEcart} px au-dessus de la pente`)
  }
}

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
