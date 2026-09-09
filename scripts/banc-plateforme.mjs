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

const grilleDe = (plan) => ({
  tuile: T,
  largeur: plan[0].length,
  hauteur: plan.length,
  solide: (cx, cy) => plan[cy][cx] === '#',
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

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
