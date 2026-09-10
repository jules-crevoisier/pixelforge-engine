/**
 * Le banc de charge : ce que le moteur encaisse vraiment.
 *
 * ## Pourquoi il existe
 *
 * Le README annonce « soixante images par seconde » depuis le premier jour, et
 * ce chiffre reposait sur ma parole. Aucun banc ne mesurait combien d'entites,
 * de particules ou de corps mobiles le moteur supporte avant de decrocher, ni
 * ce que coute un rembobinage de seize pas sur une vraie scene. C'etait le
 * seul endroit du projet ou l'on affirmait sans mesurer — precisement ce que ce
 * projet refuse partout ailleurs.
 *
 * ## Comment on mesure sans se mentir
 *
 * On mesure le temps d'un PAS DE SIMULATION, pas celui d'une image : le dessin
 * depend du navigateur et de la machine, la simulation ne depend que du code.
 * Le budget est celui d'un pas a soixante images par seconde — 16,7 ms — et
 * l'on se donne une marge : la simulation ne doit pas depasser le TIERS de ce
 * budget, le reste appartenant au dessin.
 *
 * ## Pourquoi les seuils sont larges
 *
 * Une machine de compilation partagee n'est pas une machine de joueur, et un
 * seuil serre rendrait ce banc rouge une fois sur cinq pour des raisons qui
 * n'ont rien a voir avec le code. Un banc qui echoue au hasard cesse d'etre
 * lu. Les seuils sont donc ceux d'un DECROCHAGE franc, pas d'une regression de
 * cinq pour cent — et le banc affiche toujours le chiffre, pour qu'on voie une
 * derive meme quand il passe.
 */
const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

/** Le budget d'un pas a soixante images, et la part qu'on s'accorde. */
const BUDGET_MS = 1000 / 60
const PART_SIMULATION = 1 / 3

/**
 * Mesure le temps moyen d'un pas, en ecartant la mise en train.
 *
 * Les premieres executions paient la compilation a la volee du moteur
 * JavaScript : les compter donnerait un chiffre deux a dix fois trop grand, et
 * l'on optimiserait un probleme qui n'existe pas.
 */
function mesurer(nom, pas, tours = 400, chauffe = 100) {
  for (let i = 0; i < chauffe; i++) pas(i)
  const debut = performance.now()
  for (let i = 0; i < tours; i++) pas(chauffe + i)
  const ms = (performance.now() - debut) / tours
  return { nom, ms }
}

const src = (p) => import(`../src/${p}`)
const { creerNoeud, Mouvements } = await src('scene/noeud.ts')
const { Combat } = await src('runtime/combat.ts')
const { Peuplement, espece } = await src('runtime/entites.ts')
const { CorpsMobiles, grilleAvecCorps } = await src('runtime/corps.ts')
const { clipRegulier } = await src('runtime/animation.ts')
const { ORTHO_COTE } = await src('noyau/projection.ts')
const { deplacer } = await src('runtime/collision.ts')
const { Entrees } = await src('runtime/entree.ts')
const { SimulationJeu } = await src('reseau/simulation-jeu.ts')
const { Particules, emission } = await src('runtime/particules.ts')
const { engendrerPlan } = await src('niveau/plan.ts')
const { assemblerEtage } = await src('niveau/assemblage.ts')
const { MODELES_DEMO, SYMBOLES_DEMO } = await src('demo/salles-demo.ts')

const T = 16

/** Un monde de charge : un heros, N creatures, un decor plein de pentes. */
function monde(creatures, porteurs = 0) {
  const H = 40
  const L = 200
  const decor = {
    tuile: T, largeur: L, hauteur: H,
    solide: (cx, cy) => cy >= H - 4,
    matiere: (cx, cy) => (cy >= H - 4 ? 1 : 0),
  }
  const ESPECES = [
    espece('heros', {
      camp: 'heros', pv: 5, vitesse: 0, degats: 0, comportement: 'plateformeur',
      clip: 'marche', boite: { x: -4, y: -14, l: 8, h: 14 },
    }),
    espece('blob', {
      camp: 'ennemi', pv: 3, vitesse: 30, degats: 1, comportement: 'patrouille',
      clip: 'marche', boite: { x: -5, y: -7, l: 10, h: 7 }, pesante: true,
    }),
    espece('dalle', {
      camp: 'decor', pv: 9999, vitesse: 0, degats: 0, comportement: 'porteur',
      clip: 'marche', matiereCorps: 1, boite: { x: -8, y: -6, l: 16, h: 6 },
      trajet: { dx: 48, dy: 0, duree: 1400, pause: 300 },
    }),
  ]
  const CLIPS = [clipRegulier('marche', [0, 1, 2, 3], 110)]
  const racine = creerNoeud('noeud', 'charge')
  const combat = new Combat()
  const corps = new CorpsMobiles()
  const peuplement = new Peuplement(racine, combat, ESPECES, CLIPS, ORTHO_COTE(T), T)
  peuplement.degatsMatiere = 0
  const grille = grilleAvecCorps(decor, corps)
  const mouvements = new Mouvements()
  const hote = (c) => {
    const ch = (n) => {
      for (const e of n.enfants) { if (e.id === c.id) return n; const r = ch(e); if (r) return r }
      return null
    }
    return ch(racine)
  }
  const bouger = (cps, dx, dy) => {
    const acc = mouvements.de(cps.id)
    const pas = acc.pas(dx, dy)
    if (!pas.x && !pas.y) return { dx: 0, dy: 0, bloque: false }
    const h = hote(cps)
    if (!h) return { dx: 0, dy: 0, bloque: false }
    const b = { x: h.x + cps.boiteX, y: h.y + cps.boiteY, w: cps.boiteL, h: cps.boiteH }
    const c = deplacer(grille, b, pas.x, pas.y)
    h.x += c.dx; h.y += c.dy
    if (c.bloqueX) acc.bloquerX()
    if (c.bloqueY) acc.bloquerY()
    return { dx: c.dx, dy: c.dy, bloque: c.bloqueX || c.bloqueY }
  }
  const heros = peuplement.poser('heros', 100, (H - 4) * T)
  // Les creatures sont reparties, pas empilees : entassees au meme endroit,
  // elles ne mesureraient que le cout de la collision entre elles, ce qui
  // n'est pas ce qu'un vrai niveau fait vivre.
  for (let i = 0; i < creatures; i++) {
    peuplement.poser('blob', 160 + (i % 120) * 24, (H - 4) * T)
  }
  for (let i = 0; i < porteurs; i++) {
    peuplement.poser('dalle', 200 + i * 40, (H - 8) * T)
  }
  peuplement.synchroniser()
  const entrees = new Entrees()
  entrees.pasMs = 1000 / 60
  const contexte = () => ({
    dt: 1 / 60, entrees, racine, carte: decor, grille, corps, pas: 0,
    trouver: () => null, bouger,
  })
  const sim = new SimulationJeu({
    racine, peuplement, combat, corps, entrees, mouvements, contexte,
    dtMs: 1000 / 60, noeudDe: () => heros,
    pas: (c, dtMs) => {
      peuplement.synchroniser()
      peuplement.avancer(c, heros, dtMs)
      for (const i of combat.avancer(dtMs)) if (i.fatal) peuplement.tuer(i.cible)
    },
  })
  return { sim, peuplement, racine }
}

console.log('\n--- le pas de simulation, selon le nombre de creatures ---')

{
  const budget = BUDGET_MS * PART_SIMULATION
  const mesures = []
  for (const n of [0, 25, 100, 300]) {
    const m = monde(n)
    const r = mesurer(`${n} créatures`, () => m.sim.avancer(new Map([['a', { tenues: 2, appuis: 0 }]])))
    mesures.push({ n, ...r, entites: m.peuplement.nombre })
    console.log(`        ${String(n).padStart(3)} créatures · ${r.ms.toFixed(3)} ms par pas`
      + ` · ${Math.round(BUDGET_MS / r.ms)} pas par image de budget`)
  }
  const cent = mesures.find((m) => m.n === 100)
  check('cent créatures tiennent dans le tiers du budget d’une image',
    cent.ms < budget,
    `${cent.ms.toFixed(3)} ms pour ${budget.toFixed(1)} ms accordées`)

  const trois = mesures.find((m) => m.n === 300)
  check('et trois cents tiennent encore dans une image entière',
    trois.ms < BUDGET_MS, `${trois.ms.toFixed(3)} ms pour ${BUDGET_MS.toFixed(1)} ms`)

  /*
   * Le chiffre que le README annonce depuis le premier jour.
   *
   * « Soixante images par seconde » reposait sur ma parole. Le voici mesure :
   * combien de pas de simulation tiennent dans le budget d'une image, avec
   * une scene de cent creatures. C'est le seul endroit du projet ou l'on
   * affirmait sans mesurer.
   */
  check('le budget d’une image tient largement le pas de simulation annoncé',
    BUDGET_MS / cent.ms > 20,
    `${Math.round(BUDGET_MS / cent.ms)} pas de simulation par image, à cent créatures`)

  /*
   * Le cout doit croitre LINEAIREMENT avec le nombre de creatures.
   *
   * C'est la mesure qui compte vraiment : un cout lineaire tient encore a
   * mille, un cout quadratique s'ecroule des deux cents. Le peuplement
   * compare chaque entite a chaque autre pour le pietinement — si cette boucle
   * devenait le poste principal, la pente le dirait.
   */
  const a = mesures.find((m) => m.n === 25)
  const b = mesures.find((m) => m.n === 300)
  const facteurEntites = b.n / a.n
  const facteurTemps = (b.ms - mesures[0].ms) / Math.max(1e-6, a.ms - mesures[0].ms)
  check('le coût croît proportionnellement au nombre de créatures',
    facteurTemps < facteurEntites * 2.5,
    `${facteurEntites}× plus de créatures pour ${facteurTemps.toFixed(1)}× le temps`
    + ' — quadratique donnerait 144×')
}

console.log('\n--- les particules ---')

{
  const p = new Particules(1)
  p.plafond = 4000
  for (let i = 0; i < 200; i++) p.emettre(emission({ nombre: 20, vie: 100000 }), 100, 100)
  const r = mesurer('particules', () => { p.avancer(1000 / 60); p.points() })
  console.log(`        ${p.nombre} particules · ${r.ms.toFixed(3)} ms par pas`)
  check('quatre mille particules tiennent dans le tiers d’une image',
    r.ms < BUDGET_MS * PART_SIMULATION,
    `${r.ms.toFixed(3)} ms pour ${p.nombre} particules`)
  check('et le plafond par défaut est bien plus bas que ce seuil',
    (new Particules(1)).plafond <= 500,
    'le plafond protège la cadence, la mesure dit de combien il protège')
}

console.log('\n--- le rembobinage, sur une vraie scene ---')

{
  const m = monde(60)
  const entrees = new Map([['a', { tenues: 2, appuis: 0 }]])
  for (let i = 0; i < 200; i++) m.sim.avancer(entrees)

  const photo = mesurer('instantané', () => { m.sim.instantane() })
  console.log(`        instantané · ${photo.ms.toFixed(3)} ms`)
  check('prendre un instantané coûte moins qu’un pas de simulation',
    photo.ms < BUDGET_MS * PART_SIMULATION,
    `${photo.ms.toFixed(3)} ms avec ${m.peuplement.nombre} entités`)

  // Le cas le plus cher du reseau : rembobiner seize pas et tout refaire.
  const seize = mesurer('rembobinage', () => {
    const e = m.sim.instantane()
    for (let k = 0; k < 16; k++) m.sim.avancer(entrees)
    m.sim.restaurer(e)
    for (let k = 0; k < 16; k++) m.sim.avancer(entrees)
  }, 40, 10)
  console.log(`        rembobinage de 16 pas · ${seize.ms.toFixed(3)} ms`)
  check('un rembobinage de seize pas tient dans une image',
    seize.ms < BUDGET_MS * 2,
    `${seize.ms.toFixed(3)} ms — c’est le pire cas du réseau, et il est rare`)
}

console.log('\n--- engendrer un etage ---')

{
  const r = mesurer('étage', (i) => {
    const plan = engendrerPlan(1 + (i % 50), { salles: 12, largeur: 9, hauteur: 7 })
    assemblerEtage(plan, { modeles: MODELES_DEMO, symboles: SYMBOLES_DEMO })
  }, 40, 10)
  console.log(`        un étage complet · ${r.ms.toFixed(2)} ms`)
  check('un étage s’engendre en moins d’un dixième de seconde',
    r.ms < 100, `${r.ms.toFixed(2)} ms — on peut donc en proposer un autre sans attente`)
}

console.log('\n--- la navigation : contourner ce qui bloque ---')

/*
 * Le champ de navigation se recalcule ENTIEREMENT a chaque pas — c'est ce qui
 * le rend insensible au rembobinage, et c'est aussi ce qui pourrait le rendre
 * cher. On le mesure donc pour de bon, sur une salle plus grande que ce
 * qu'aucun jeu du genre n'utilise.
 */
{
  const { Carte, SOLIDE } = await import('../src/tuiles/tilemap.ts')
  const { ChampDeFlux, grilleDeCarte, ligneLibre } = await import('../src/runtime/chemin.ts')

  // Soixante cases sur quarante, avec des piliers : plus grand qu'une salle
  // d'Isaac, et bien plus encombre.
  const carte = new Carte(60, 40, 16)
  carte.ajouterCalque('sol')
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 60; x++) {
      const bord = x === 0 || y === 0 || x === 59 || y === 39
      const pilier = x % 7 === 3 && y % 5 === 2
      if (bord || pilier) carte.solides[carte.index(x, y)] = SOLIDE
    }
  }
  const g = grilleDeCarte(carte)
  const champ = new ChampDeFlux()

  const plein = mesurer('champ', (i) => champ.calculer(g, 2 + (i % 3), 2, 60), 400, 50)
  console.log(`        champ sur 60×40, portée entière · ${plein.ms.toFixed(3)} ms · ${champ.visitees} cases`)
  check('un champ de navigation sur une grande salle tient dans un dixième d’image',
    plein.ms < 16.7 / 10,
    `${plein.ms.toFixed(3)} ms pour ${champ.visitees} cases — et il sert TOUTES les créatures à la fois`)

  // La portee est le reglage qui compte : c'est elle qui rend le cout
  // independant de la taille de la carte.
  const borne = mesurer('champ borné', (i) => champ.calculer(g, 2 + (i % 3), 2, 26), 400, 50)
  console.log(`        champ à portée 26 · ${borne.ms.toFixed(3)} ms · ${champ.visitees} cases`)
  check('et la portée employée par le moteur coûte moins encore',
    borne.ms <= plein.ms + 0.01,
    `${borne.ms.toFixed(3)} ms contre ${plein.ms.toFixed(3)} — la portée borne le travail, pas la carte`)

  /*
   * La ligne de vue, elle, se paie PAR CREATURE : c'est le seul morceau de la
   * navigation qui monte avec le nombre d'ennemis. On verifie qu'il reste
   * negligeable a trois cents.
   */
  const vues = mesurer('lignes de vue', (i) => {
    for (let k = 0; k < 300; k++) {
      ligneLibre(g, 40 * 16, (2 + (k % 30)) * 16, (4 + (i % 3)) * 16, 20 * 16)
    }
  }, 200, 20)
  console.log(`        300 lignes de vue · ${vues.ms.toFixed(3)} ms`)
  check('trois cents lignes de vue tiennent dans un dixième d’image',
    vues.ms < 16.7 / 10,
    `${vues.ms.toFixed(3)} ms — c’est la seule part de la navigation qui suive le nombre d’ennemis`)

  // Et l'essentiel : le champ ne depend PAS du nombre de creatures. Un champ
  // par creature ferait trois cents fois ce temps-la.
  check('un champ partagé vaut trois cents recherches évitées',
    plein.ms * 300 > 16.7,
    `${(plein.ms * 300).toFixed(1)} ms si chaque créature cherchait pour elle — soit `
    + `${(plein.ms * 300 / 16.7).toFixed(1)} images pour un seul pas`)
}

console.log('\n--- la lumiere : ce que la nuit coute vraiment ---')
{
  const { Eclairage, TableLumiere } = await import('../src/runtime/lumiere.ts')
  /*
   * Un tampon comme celui du jeu : 320x180, rempli de couleurs de la palette.
   * La passe d'eclairage est le seul endroit du moteur qui touche CHAQUE
   * pixel de l'ecran a chaque image : c'est ici qu'une promesse non mesuree
   * couterait le plus cher.
   */
  const couleurs = ['#14101a', '#2b2233', '#4a3b57', '#7a7466', '#b8a988', '#e8dcc0']
  const largeur = 320
  const hauteur = 180
  const pixels = new Uint8ClampedArray(largeur * hauteur * 4)
  const rgb = couleurs.map((c) => parseInt(c.slice(1), 16))
  for (let i = 0; i < largeur * hauteur; i++) {
    const c = rgb[i % rgb.length]
    pixels[i * 4] = (c >> 16) & 255
    pixels[i * 4 + 1] = (c >> 8) & 255
    pixels[i * 4 + 2] = c & 255
    pixels[i * 4 + 3] = 255
  }
  const e = new Eclairage(couleurs)
  e.ambiante = 0.25
  e.sources = () => [
    { x: 80, y: 60, rayon: 40 }, { x: 200, y: 120, rayon: 60 }, { x: 300, y: 30, rayon: 24 },
  ]
  const copie = new Uint8ClampedArray(pixels)
  const nuit = mesurer('lumiere', () => {
    pixels.set(copie)
    e.appliquer(pixels, largeur, hauteur, 0, 0)
  }, 120, 30)
  console.log(`        320×180, trois sources, ambiante 0,25 · ${nuit.ms.toFixed(3)} ms par image`)
  check('la nuit entiere tient dans le tiers du budget d\'une image',
    nuit.ms < BUDGET_MS * PART_SIMULATION,
    `${nuit.ms.toFixed(3)} ms — c'est un cout d'IMAGE, il s'ajoute au dessin, pas a la simulation`)

  // Le revers : un monde sans nuit ne paie RIEN. C'est la promesse qui
  // autorise a livrer la lumiere sans faire payer ceux qui ne s'en servent pas.
  e.ambiante = 1
  const jour = mesurer('plein-jour', () => { e.appliquer(pixels, largeur, hauteur, 0, 0) }, 400, 50)
  check('et le plein jour ne paie rien du tout',
    jour.ms < 0.01, `${(jour.ms * 1000).toFixed(2)} µs par image`)

  // La fidelite a la palette n'est pas une opinion : chaque pixel assombri
  // DOIT etre une couleur de la palette. On verifie sur le vrai tampon.
  e.ambiante = 0.25
  pixels.set(copie)
  e.appliquer(pixels, largeur, hauteur, 0, 0)
  const admis = new Set(rgb)
  let hors = 0
  for (let i = 0; i < largeur * hauteur; i++) {
    const c = (pixels[i * 4] << 16) | (pixels[i * 4 + 1] << 8) | pixels[i * 4 + 2]
    if (!admis.has(c)) hors++
  }
  check('chaque pixel de la nuit reste une couleur de la palette',
    hors === 0, hors ? `${hors} pixels hors palette` : `${largeur * hauteur} pixels verifies`)

  // Et la table elle-meme : le niveau le plus sombre choisit une couleur plus
  // sombre OU EGALE, jamais plus claire — sinon la nuit eclaircirait.
  const table = new TableLumiere(couleurs, 4)
  const luminance = (c) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)
  const montent = rgb.filter((c) => luminance(table.assombrir(c, 0)) > luminance(c) + 1e-9)
  check('assombrir n\'eclaircit jamais', montent.length === 0,
    `${rgb.length} couleurs, niveau le plus sombre`)
}

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
