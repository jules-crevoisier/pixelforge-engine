/**
 * Le banc du moteur.
 *
 * Meme discipline que l'editeur de sprites : chaque regle est eprouvee dans
 * les DEUX sens — sur un cas ou elle doit se taire, et sur un cas fabrique ou
 * elle doit parler. Un banc qui ne sait pas echouer ne protege rien.
 *
 * Il tourne en Node pur, sans navigateur : tout ce qui est teste ici est du
 * calcul, et le faire passer par un navigateur ne ferait qu'ajouter des
 * secondes et des causes de panne.
 */
const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

/* Node 22 retire les types a la volee : pas de bundler pour verifier des
 * tables de bits. Tout ce qui est teste ici est du calcul, et le faire passer
 * par un navigateur n'ajouterait que des secondes et des causes de panne. */
const { MASQUES_BLOB47, MASQUES_BORD16, masqueNettoye, indexDeMasque,
        tuilePour, HAUT, DROITE, BAS, GAUCHE, HAUT_DROITE, BAS_GAUCHE } =
  await import('../src/tuiles/terrain.ts')
const { Accumulateur, arrondiPair, echelleEntiere, seChevauchent, rect } =
  await import('../src/noyau/pixel.ts')

console.log('\n--- le contrat de pixel ---')

// L'accumulateur ne perd pas de terrain : c'est sa seule raison d'exister.
{
  const a = new Accumulateur()
  let total = 0
  for (let i = 0; i < 1000; i++) total += a.pas(0.4, 0).x
  check('l\'accumulateur ne perd pas de terrain sur mille images',
    Math.abs(total - 400) <= 1, `${total} pixels pour 400 demandes`)

  // Le defaut qu'il repare : arrondir image par image n'avance jamais.
  let naif = 0
  for (let i = 0; i < 1000; i++) naif += Math.round(0.4)
  check('l\'arrondi image par image, lui, n\'avance pas du tout',
    naif === 0, `${naif} pixels au lieu de 400`)
}

// L'arrondi pair commute avec le miroir. `Math.round` non.
{
  let pairs = 0, ronds = 0
  for (let k = -50; k <= 50; k++) {
    const v = k + 0.5
    if (arrondiPair(v) !== -arrondiPair(-v)) pairs++
    if (Math.round(v) !== -Math.round(-v)) ronds++
  }
  check('l\'arrondi pair commute avec le miroir', pairs === 0, `${pairs} ecart(s) sur 101`)
  check('Math.round, lui, ne commute pas — c\'est pourquoi il est ecarte',
    ronds > 0, `${ronds} ecart(s) sur 101`)
}

// L'echelle est entiere, jamais fractionnaire.
{
  const cas = [[320, 180, 1280, 800, 4], [320, 180, 1920, 1080, 6], [160, 144, 800, 600, 4],
               [320, 180, 100, 100, 1]]
  const faux = cas.filter(([lv, hv, lf, hf, att]) => echelleEntiere(lv, hv, lf, hf) !== att)
  check('l\'echelle d\'affichage est toujours entiere et au moins 1',
    faux.length === 0, faux.map((c) => c.join('x')).join(' ') || `${cas.length} cas`)
  const e = echelleEntiere(320, 180, 1280, 800)
  check('elle prefere des bandes noires a une grille qui ondule',
    Number.isInteger(e) && e * 180 <= 800, `${e} (4,44 serait le maximum reel)`)
}

// Les rectangles se touchent bord a bord sans se chevaucher.
check('deux rectangles jointifs ne se chevauchent pas',
  !seChevauchent(rect(0, 0, 8, 8), rect(8, 0, 8, 8)), 'x=0..8 et x=8..16')
check('un pixel de recouvrement suffit a les faire se chevaucher',
  seChevauchent(rect(0, 0, 8, 8), rect(7, 0, 8, 8)))

console.log('\n--- l\'autotiling ---')

check('le jeu blob compte bien quarante-sept tuiles',
  MASQUES_BLOB47.length === 47, `${MASQUES_BLOB47.length} masques distincts sur 256 configurations`)
check('le jeu sans coins en compte seize',
  MASQUES_BORD16.length === 16, `${MASQUES_BORD16.length}`)

// La reduction est idempotente : nettoyer un masque deja propre ne bouge rien.
{
  const bougent = MASQUES_BLOB47.filter((m) => masqueNettoye(m) !== m)
  check('un masque deja reduit ne bouge plus', bougent.length === 0, `${bougent.length} bougent`)
}

// Le vrai contenu de la regle : un coin ne compte que si ses deux cotes sont pleins.
check('un coin seul, sans ses deux cotes, ne compte pas',
  masqueNettoye(HAUT_DROITE) === 0, 'haut-droite sans haut ni droite')
check('un coin avec un seul de ses cotes ne compte pas non plus',
  masqueNettoye(HAUT | HAUT_DROITE) === HAUT, 'haut-droite sans droite')
check('un coin avec ses deux cotes compte',
  masqueNettoye(HAUT | DROITE | HAUT_DROITE) === (HAUT | DROITE | HAUT_DROITE))

// L'ordre de la table est stable : c'est lui qui est enregistre dans les
// projets et dans les planches dessinees par l'artiste.
check('la table est triee, donc son ordre est reproductible',
  MASQUES_BLOB47.every((m, i) => i === 0 || m > MASQUES_BLOB47[i - 1]))
check('le masque vide est a l\'index zero', MASQUES_BLOB47[0] === 0)
check('le masque plein est au dernier index',
  MASQUES_BLOB47[46] === 255, `${MASQUES_BLOB47[46]}`)

// Une case isolee, une case au milieu : les deux extremes du voisinage.
{
  const carte = [
    '.....',
    '..#..',
    '.###.',
    '..#..',
    '.....',
  ]
  const g = {
    largeur: 5, hauteur: 5,
    plein: (x, y) => carte[y][x] === '#',
  }
  const croix = tuilePour(g, 2, 2, 'blob47', false)
  const bras = tuilePour(g, 2, 1, 'blob47', false)
  check('le centre d\'une croix voit ses quatre cotes et aucun coin',
    MASQUES_BLOB47[croix] === (HAUT | DROITE | BAS | GAUCHE),
    `masque ${MASQUES_BLOB47[croix]}`)
  check('le bras d\'une croix ne voit que le bas',
    MASQUES_BLOB47[bras] === BAS, `masque ${MASQUES_BLOB47[bras]}`)
}

// Le bord de la carte : les deux conventions doivent differer, sinon l'option
// ne sert a rien.
{
  const g = { largeur: 3, hauteur: 3, plein: () => true }
  const ferme = tuilePour(g, 0, 0, 'blob47', true)
  const ouvert = tuilePour(g, 0, 0, 'blob47', false)
  check('au bord, « le terrain se prolonge » donne le masque plein',
    MASQUES_BLOB47[ferme] === 255, `masque ${MASQUES_BLOB47[ferme]}`)
  check('et « la carte a un contour » donne autre chose',
    ferme !== ouvert, `${ferme} contre ${ouvert}`)
  check('ce contour-la ne voit que le bas, la droite et leur coin',
    MASQUES_BLOB47[ouvert] === (DROITE | BAS | (DROITE | BAS ? 8 : 0)),
    `masque ${MASQUES_BLOB47[ouvert]}`)
}

// Le jeu a seize ignore les diagonales, par construction.
{
  const avec = indexDeMasque(HAUT | DROITE | HAUT_DROITE, 'bord16')
  const sans = indexDeMasque(HAUT | DROITE, 'bord16')
  check('le jeu sans coins ignore les diagonales', avec === sans, `${avec} et ${sans}`)
  const gauche = indexDeMasque(GAUCHE | BAS_GAUCHE, 'bord16')
  const gaucheSeul = indexDeMasque(GAUCHE, 'bord16')
  check('des deux cotes', gauche === gaucheSeul)
}

console.log('\n--- la boucle a pas fixe ---')

{
  const { Boucle } = await import('../src/runtime/boucle.ts')
  // Assez de marge pour que le plafond ne s'en mele pas : ici on ne mesure
  // que le rapport entre le temps et les pas.
  let pas = 0
  const large = new Boucle(() => { pas++ }, () => {}, { pasMs: 10, rattrapageMax: 100 })
  large.avancerDe(100)
  check('cent millisecondes a dix par pas font dix pas', pas === 10, `${pas}`)

  // Le reste est garde : trois fois 7 ms font deux pas, pas zero.
  pas = 0
  large.avancerDe(7); large.avancerDe(7); large.avancerDe(7)
  check('le reste passe d\'une image a l\'autre', pas === 2, `${pas} pas pour 21 ms`)

  // Le plafond : un onglet revenu d'arriere-plan ne doit pas tout rattraper.
  // Le double de test doit l'appliquer comme la vraie boucle — une premiere
  // version ne le faisait pas et rendait cinq cents pas.
  pas = 0
  const serre = new Boucle(() => { pas++ }, () => {}, { pasMs: 10, rattrapageMax: 5 })
  serre.avancerDe(5000)
  check('un retard enorme est plafonne, pas rattrape',
    pas === 5, `${pas} pas pour 5 secondes de retard`)

  // Et le retard abandonne est JETE : sinon la spirale repart a l'image
  // suivante, qui replafonnerait, et ainsi de suite sans jamais rattraper.
  pas = 0
  serre.avancerDe(0)
  check('le retard abandonne est jete, pas garde', pas === 0, `${pas} pas de plus`)
}

console.log('\n--- les collisions ---')

{
  const { deplacer, toucheSolide } = await import('../src/runtime/collision.ts')
  const { rect } = await import('../src/noyau/pixel.ts')

  // Un couloir horizontal, mur en haut et en bas, un pilier d'une case.
  const carte = [
    '#########',
    '#.......#',
    '#...#...#',
    '#.......#',
    '#########',
  ]
  const g = {
    tuile: 8, largeur: 9, hauteur: 5,
    solide: (cx, cy) => carte[cy][cx] === '#',
  }

  check('un corps dans le vide ne touche rien',
    !toucheSolide(g, rect(8, 8, 8, 8)))
  check('un corps dans le mur touche', toucheSolide(g, rect(0, 0, 8, 8)))

  // Le retrait d'un pixel : un corps large d'une tuile exactement, cale sur la
  // grille, n'occupe qu'une case et non deux.
  check('un corps large d\'une tuile exactement n\'en occupe qu\'une',
    !toucheSolide(g, rect(8, 8, 8, 8)) && !toucheSolide(g, rect(16, 8, 8, 8)),
    'sinon il resterait coince partout')

  // Le tunneling : un corps lance a pleine vitesse contre le pilier.
  {
    const c = deplacer(g, rect(8, 16, 8, 8), 40, 0)
    check('un corps rapide ne traverse pas un pilier',
      c.bloqueX && c.dx === 16, `parcouru ${c.dx}, bloque ${c.bloqueX}`)
  }

  // Glisser le long d'un mur : bloque sur un axe, libre sur l'autre.
  {
    const c = deplacer(g, rect(8, 8, 8, 8), 0, -8)
    check('un corps bloque en haut ne monte pas', c.bloqueY && c.dy === 0, `dy ${c.dy}`)
    const d = deplacer(g, rect(8, 8, 8, 8), 8, -8)
    check('mais il glisse quand meme sur l\'autre axe',
      d.dx === 8 && d.dy === 0, `dx ${d.dx}, dy ${d.dy}`)
  }

  // Hors carte : traite comme solide, sinon un corps sort du monde.
  check('sortir de la carte est bloque',
    toucheSolide(g, rect(-4, 8, 8, 8)), 'le dehors compte comme solide')
}

console.log('\n--- les entrees ---')

{
  const { Entrees } = await import('../src/runtime/entree.ts')
  const e = new Entrees()

  e.simulerAppui('ArrowRight')
  check('une touche tenue est vue comme tenue', e.tenue('droite'))
  check('et comme un appui recent', e.vientDePresser('droite'))
  check('l\'axe suit', e.axe().x === 1, `x=${e.axe().x}`)

  // Le defaut que la memoire repare : un appui relache avant le pas suivant.
  e.simulerRelache('ArrowRight')
  check('un appui relache n\'est plus tenu', !e.tenue('droite'))
  check('mais il reste vu comme recent — c\'est toute la raison d\'etre du tampon',
    e.vientDePresser('droite'), 'sans cela l\'appui serait simplement perdu')

  // Consommer : la meme demande ne se sert pas deux fois.
  e.simulerAppui('Space')
  check('une action se consomme', e.consommer('action'))
  check('et ne se sert pas deux fois', !e.consommer('action'),
    'sinon on ouvre le coffre et on le referme dans la foulee')

  // Une fenetre a memoire nulle ne voit que ce qui est tenu.
  e.simulerAppui('KeyE')
  check('une memoire nulle ignore le passe', !e.vientDePresser('action', -1))
}

console.log('\n--- la carte de tuiles ---')

{
  const { Carte, VIDE } = await import('../src/tuiles/tilemap.ts')
  const c = new Carte(8, 6, 16)
  const mur = c.ajouterCalque('mur', {
    terrain: { tuileDepart: 0, jeu: 'blob47', dehorsEstPlein: false },
  })

  check('un calque neuf est entierement vide',
    [...mur.cases].every((v) => v === VIDE), 'VIDE et non zero, qui est une vraie tuile')

  c.peindreTerrain(mur, 3, 3, true)
  check('poser du terrain pose une tuile', mur.cases[c.index(3, 3)] !== VIDE,
    `tuile ${mur.cases[c.index(3, 3)]}`)

  // Le voisinage se recalcule : c'est tout l'interet de l'autotiling.
  c.peindreTerrain(mur, 4, 3, true)
  const gauche = mur.cases[c.index(3, 3)]
  const droite2 = mur.cases[c.index(4, 3)]
  check('poser une tuile voisine change le dessin de la premiere',
    gauche !== droite2 && gauche !== 0,
    `${gauche} et ${droite2} — sans cela l'autotiling ne servirait a rien`)

  // Le rayon : on ne recalcule QUE les neuf cases autour, pas la carte.
  const loin = mur.cases[c.index(0, 0)]
  check('une case eloignee n\'est pas touchee', loin === VIDE,
    'recalculer toute la carte a chaque coup de pinceau la rendrait poisseuse')

  // Retirer remet du vide, et met a jour les voisins.
  c.peindreTerrain(mur, 4, 3, false)
  check('retirer du terrain remet du vide', mur.cases[c.index(4, 3)] === VIDE)
  check('et rend a la premiere son dessin d\'origine',
    mur.cases[c.index(3, 3)] === 0, `tuile ${mur.cases[c.index(3, 3)]}`)

  // La collision est SA propre grille : dessiner ne rend pas solide.
  check('dessiner une tuile ne la rend pas solide par magie',
    !c.solide(3, 3), 'un tapis se dessine sans bloquer')
  c.solides[c.index(3, 3)] = 1
  check('la collision se declare a part', c.solide(3, 3))
  check('le dehors de la carte est solide', c.solide(-1, 0) && c.solide(8, 0))
}

console.log('\n--- la palette verrouillee ---')

{
  const { Palette, verifierPalette, rvb, distance, depuisHex, versHex } =
    await import('../src/noyau/palette.ts')

  check('un aller-retour hexadecimal ne perd rien',
    versHex(depuisHex('#1a2b3c')) === '#1a2b3c')

  const pal = new Palette('test', [rvb(0, 0, 0), rvb(255, 255, 255), rvb(90, 52, 24)])

  // Une image conforme : la regle doit se taire.
  const propre = new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255, 90, 52, 24, 255, 0, 0, 0, 0,
  ])
  const v1 = verifierPalette(propre, pal)
  check('une image dans la palette ne declenche rien',
    v1.conforme && v1.part === 0, `${v1.fautives.length} fautive(s)`)

  // Le vide ne compte pas : sinon tout sprite avec du vide autour echouerait.
  check('les pixels transparents sont ignores', v1.part === 0,
    'sinon tout sprite detoure echouerait')

  // Une image fautive : la regle doit parler, et nommer le coupable.
  const sale = new Uint8ClampedArray([
    0, 0, 0, 255, 91, 53, 25, 255, 91, 53, 25, 255, 200, 10, 10, 255,
  ])
  const v2 = verifierPalette(sale, pal)
  check('une couleur hors palette est signalee', !v2.conforme, `${v2.fautives.length} fautives`)
  check('avec son effectif, et la plus employee en tete',
    v2.fautives[0].pixels === 2, `${v2.fautives[0].pixels} pixels`)
  check('et la couleur de palette la plus proche, pour decider vite',
    v2.fautives[0].proche === rvb(90, 52, 24) && v2.fautives[0].ecart === 3,
    `ecart ${v2.fautives[0].ecart}`)
  check('la part hors palette est comptee sur les pixels opaques',
    Math.abs(v2.part - 0.75) < 1e-9, `${(v2.part * 100).toFixed(0)}%`)

  // La mesure est celle de l'editeur de sprites : deux outils, un chiffre.
  check('la distance est la somme des ecarts de canaux',
    distance(rvb(0, 0, 0), rvb(1, 2, 3)) === 6)
}

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
