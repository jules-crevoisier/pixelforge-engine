/**
 * Le banc du determinisme et du rembobinage.
 *
 * ## Ce qu'il eprouve, et dans quel ordre
 *
 * 1. Les entrees ne lisent plus l'horloge : rejouer les memes touches rend la
 *    meme partie, au pixel pres.
 * 2. Un instantane rend l'etat EXACTEMENT — fractions de pixel comprises, qui
 *    sont precisement ce qu'on oublie.
 * 3. Le rembobinage : deux joueurs relies par un lien qui perd et qui retarde
 *    voient la meme partie.
 *
 * L'ordre n'est pas cosmetique : chaque etage repose sur le precedent, et un
 * rembobinage sur des entrees non deterministes ne prouverait rien du tout.
 */
const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

const { Entrees, ACTIONS_ORDRE, ETAT_VIDE } = await import('../src/runtime/entree.ts')
const { Plateformeur } = await import('../src/runtime/plateforme.ts')
const { Accumulateur } = await import('../src/noyau/pixel.ts')
const { empreinteDe } = await import('../src/reseau/instantane.ts')
const { LienLocal } = await import('../src/reseau/transport.ts')
const { Partie } = await import('../src/reseau/partie.ts')

console.log('\n--- les entrees ne lisent plus l\'horloge ---')

{
  // La preuve la plus directe : le fichier lui-meme. Une regle qu'on enonce
  // sans la verifier redevient fausse au premier ajout.
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../src/runtime/entree.ts', import.meta.url), 'utf8')
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  check('aucune horloge murale dans le code des entrées',
    !sansCommentaires.includes('performance.now') && !sansCommentaires.includes('Date.now'),
    'la mémoire des appuis se compte en pas de simulation')

  // La memoire, en pas. Quinze centiemes a soixante images font neuf pas.
  const e = new Entrees()
  e.pasMs = 1000 / 60
  e.auPas(0)
  e.simulerAppui('Space')
  check('un appui reste vu comme récent pendant sa fenêtre',
    e.vientDePresser('saut'), 'au pas 0')
  e.auPas(9)
  check('et neuf pas plus tard aussi — 150 ms à 60 images',
    e.vientDePresser('saut'), 'au pas 9')
  e.auPas(10)
  check('mais plus au dixième', !e.vientDePresser('saut'),
    'la fenêtre est une durée, comptée en pas')

  // Le meme appui, deux fois, avec des « heures » differentes : sans horloge,
  // le resultat ne peut plus en dependre.
  const rejouer = () => {
    const q = new Entrees()
    q.pasMs = 1000 / 60
    const vus = []
    for (let p = 0; p < 30; p++) {
      q.auPas(p)
      if (p === 3) q.simulerAppui('Space')
      if (p === 5) q.simulerRelache('Space')
      vus.push(`${q.tenue('saut') ? 't' : '.'}${q.vientDePresser('saut') ? 'p' : '.'}`)
    }
    return vus.join('')
  }
  const a = rejouer()
  // Un peu de temps passe entre les deux : avec `performance.now`, les deux
  // suites differaient.
  const debut = Date.now()
  while (Date.now() - debut < 5) { /* on laisse l'horloge avancer */ }
  const b = rejouer()
  check('deux exécutions des mêmes touches donnent exactement la même suite',
    a === b, `${a.slice(0, 20)}…`)
}

console.log('\n--- l\'etat impose : le jeu ne sait pas d\'ou viennent les touches ---')

{
  const e = new Entrees()
  const rang = (a) => ACTIONS_ORDRE.indexOf(a)
  e.imposer({ tenues: 1 << rang('droite'), appuis: 1 << rang('saut') })
  check('un état imposé remplace le clavier',
    e.tenue('droite') && !e.tenue('gauche') && e.axe().x === 1, `axe x=${e.axe().x}`)
  check('et ses appuis se consomment une seule fois',
    e.consommer('saut') && !e.consommer('saut'),
    'sinon un saut imposé se déclencherait à chaque lecture du même pas')
  e.imposer(null)
  check('rendre la main au clavier efface l’état imposé',
    !e.tenue('droite') && !e.estImpose)

  // Capturer puis imposer doit redonner le meme comportement : c'est le
  // contrat sans lequel un rejeu ne rejoue rien.
  const source = new Entrees()
  source.auPas(0)
  source.simulerAppui('ArrowRight')
  source.simulerAppui('Space')
  const capture = source.capturer()
  const copie = new Entrees()
  copie.imposer(capture)
  check('capturer puis imposer rend le même état',
    copie.tenue('droite') === source.tenue('droite')
    && copie.vientDePresser('saut') === source.vientDePresser('saut'),
    `tenues=${capture.tenues}, appuis=${capture.appuis}`)
}

console.log('\n--- rejouer une partie enregistree ---')

{
  const T = 8
  const plan = [
    '..........',
    '..........',
    '..........',
    '..........',
    '#........#',
    '##########',
  ]
  const grille = {
    tuile: T, largeur: plan[0].length, hauteur: plan.length,
    solide: (cx, cy) => plan[cy][cx] === '#',
    matiere: (cx, cy) => (plan[cy][cx] === '#' ? 1 : 0),
  }
  const BOITE = { x: -3, y: -8, l: 6, h: 8 }

  /** Une course scriptee : on tient droite, on saute par a-coups. */
  const touches = (p) => ({
    droite: p > 10,
    saut: p % 37 === 12,
    tenirSaut: p % 37 >= 12 && p % 37 < 26,
    dash: p === 60,
  })

  /** Joue au clavier simule, et enregistre l'etat de chaque pas. */
  const jouer = () => {
    const e = new Entrees()
    e.pasMs = 1000 / 60
    const c = new Plateformeur()
    const corps = { x: 5 * T, y: 4 * T, boite: { ...BOITE } }
    const bande = []
    const trace = []
    for (let p = 0; p < 200; p++) {
      e.auPas(p)
      const t = touches(p)
      if (t.droite) e.simulerAppui('ArrowRight'); else e.simulerRelache('ArrowRight')
      if (t.saut) e.simulerAppui('Space')
      if (!t.tenirSaut) e.simulerRelache('Space')
      if (t.dash) e.simulerAppui('ShiftLeft'); else e.simulerRelache('ShiftLeft')
      bande.push(e.capturer())
      const a = e.axe()
      c.avancer(grille, corps, 1 / 60, a.x, e.consommer('saut'), e.tenue('saut'),
        e.consommer('dash'), a.y)
      trace.push(`${corps.x},${corps.y}`)
    }
    return { bande, trace }
  }

  /** Rejoue depuis la bande enregistree, sans clavier du tout. */
  const rejouer = (bande) => {
    const e = new Entrees()
    const c = new Plateformeur()
    const corps = { x: 5 * T, y: 4 * T, boite: { ...BOITE } }
    const trace = []
    for (let p = 0; p < bande.length; p++) {
      e.auPas(p)
      e.imposer(bande[p])
      const a = e.axe()
      c.avancer(grille, corps, 1 / 60, a.x, e.consommer('saut'), e.tenue('saut'),
        e.consommer('dash'), a.y)
      trace.push(`${corps.x},${corps.y}`)
    }
    return trace
  }

  const partie = jouer()
  const bis = jouer()
  check('la même partie jouée deux fois donne la même trace',
    partie.trace.join('|') === bis.trace.join('|'),
    `${partie.trace.length} pas, arrivée ${partie.trace[partie.trace.length - 1]}`)

  const rejeu = rejouer(partie.bande)
  const premierEcart = rejeu.findIndex((v, i) => v !== partie.trace[i])
  check('et la bande enregistrée la rejoue au pixel près',
    premierEcart === -1,
    premierEcart === -1
      ? `${rejeu.length} pas identiques`
      : `écart au pas ${premierEcart} : ${partie.trace[premierEcart]} contre ${rejeu[premierEcart]}`)
  // Le revers : une bande alteree doit donner autre chose. Une comparaison qui
  // reussit toujours ne prouve rien.
  const abimee = partie.bande.map((v, i) => (i === 80 ? { tenues: 0, appuis: 0 } : v))
  check('une bande altérée, elle, diverge',
    rejouer(abimee).join('|') !== partie.trace.join('|'),
    'un seul pas changé au milieu suffit')
}

console.log('\n--- l\'instantane rend TOUT, fractions comprises ---')

{
  const a = new Accumulateur()
  a.pas(0.4, 0.7)
  const photo = a.instantane()
  const suite = a.pas(0.4, 0.7)
  const b = new Accumulateur()
  b.restaurer(photo)
  const memeSuite = b.pas(0.4, 0.7)
  check('un accumulateur restauré rend le même pas entier',
    suite.x === memeSuite.x && suite.y === memeSuite.y,
    `${suite.x},${suite.y}`)
  const neuf = new Accumulateur()
  const sansPhoto = neuf.pas(0.4, 0.7)
  check('et sans la fraction, il ne le rendrait pas',
    sansPhoto.y !== suite.y,
    'la fraction vaut moins d’un pixel : c’est pour ça qu’on l’oublie')

  // Le controleur entier : on photographie au milieu d'un saut, on continue,
  // on revient, on recontinue. Les deux suites doivent coincider.
  const T = 8
  const plan = ['..........', '..........', '..........', '..........', '..........', '##########']
  const g = {
    tuile: T, largeur: 10, hauteur: 6,
    solide: (cx, cy) => plan[cy][cx] === '#',
    matiere: (cx, cy) => (plan[cy][cx] === '#' ? 1 : 0),
  }
  const c = new Plateformeur()
  const corps = { x: 40, y: 5 * T, boite: { x: -3, y: -8, l: 6, h: 8 } }
  for (let i = 0; i < 30; i++) c.avancer(g, corps, 1 / 60, 1, i === 0, i < 12)
  const photoC = c.instantane()
  const photoCorps = { ...corps }
  const droit = []
  for (let i = 0; i < 40; i++) { c.avancer(g, corps, 1 / 60, 1, false, false); droit.push(`${corps.x},${corps.y}`) }
  c.restaurer(photoC)
  corps.x = photoCorps.x; corps.y = photoCorps.y
  const refait = []
  for (let i = 0; i < 40; i++) { c.avancer(g, corps, 1 / 60, 1, false, false); refait.push(`${corps.x},${corps.y}`) }
  check('un contrôleur restauré au milieu d’un saut refait exactement le même vol',
    droit.join('|') === refait.join('|'), `${droit.length} pas, fin ${droit[droit.length - 1]}`)
}

console.log('\n--- le rembobinage, sur un lien qui retarde et qui perd ---')

{
  /**
   * Une simulation-jouet dont on connait la reponse a la main.
   *
   * Deux curseurs qui avancent d'un pixel par pas quand on tient une
   * direction, et sautent de dix quand on appuie. Rien de plus : ce qui est
   * eprouve ici est le REMBOBINAGE, pas le jeu, et une simulation compliquee
   * ne ferait que rendre les echecs illisibles.
   */
  const rang = (a) => ACTIONS_ORDRE.indexOf(a)
  const faireSim = () => {
    const etat = { a: 0, b: 0, pas: 0 }
    return {
      etat,
      avancer(entrees) {
        for (const [j, e] of entrees) {
          const cle = j === 'a' ? 'a' : 'b'
          if (e.tenues & (1 << rang('droite'))) etat[cle] += 1
          if (e.tenues & (1 << rang('gauche'))) etat[cle] -= 1
          if (e.appuis & (1 << rang('saut'))) etat[cle] += 10
        }
        etat.pas++
      },
      instantane: () => ({ ...etat }),
      restaurer: (s) => { Object.assign(etat, s) },
      empreinte: () => empreinteDe([etat.a, etat.b, etat.pas]),
    }
  }

  /** Ce que chaque joueur fait a chaque pas. Deux scripts differents. */
  const script = (joueur, p) => {
    let tenues = 0
    let appuis = 0
    if (joueur === 'a') {
      if (p % 40 < 25) tenues |= 1 << rang('droite')
      if (p % 40 === 30) appuis |= 1 << rang('saut')
    } else {
      if (p % 33 < 12) tenues |= 1 << rang('gauche')
      if (p % 33 === 20) appuis |= 1 << rang('saut')
    }
    return { tenues, appuis }
  }

  /*
   * On compare au dernier pas CONFIRME, jamais a l'etat courant.
   *
   * L'etat courant contient des suppositions sur ce que l'autre est en train
   * de faire, et deux machines ne supposent pas la meme chose au meme instant.
   * Comparer les etats courants revient donc a comparer deux predictions :
   * elles different, et ce n'est pas une divergence. La premiere version de ce
   * banc le faisait et accusait le rembobinage d'un defaut qu'il n'avait pas.
   */
  const courir = (reglages, pasTotal = 300, jeu = {}) => {
    const lien = new LienLocal(['a', 'b'], reglages)
    const sims = { a: faireSim(), b: faireSim() }
    const r = { fenetre: 16, retardLocal: 2, ...jeu }
    const parties = {
      a: new Partie(sims.a, lien.pour('a'), ['a', 'b'], r),
      b: new Partie(sims.b, lien.pour('b'), ['a', 'b'], r),
    }
    for (let p = 0; p < pasTotal; p++) {
      parties.a.avancer(script('a', p))
      parties.b.avancer(script('b', p))
      lien.avancer(1000 / 60)
    }
    const commun = Math.min(parties.a.pasConfirme, parties.b.pasConfirme)
    const accord = commun >= 0
      && parties.a.empreinteA(commun) !== null
      && parties.a.empreinteA(commun) === parties.b.empreinteA(commun)
    return { lien, sims, parties, commun, accord }
  }

  // Sans reseau du tout : la reference. Les deux machines doivent finir sur le
  // meme etat, sinon rien de ce qui suit n'a de sens.
  {
    const r = courir({ latence: 0, perte: 0 })
    check('sans latence, les deux machines s’accordent sur le dernier pas confirmé',
      r.accord, `pas ${r.commun}, empreinte ${r.parties.a.empreinteA(r.commun)}`)
  }

  // Cent millisecondes de latence : le cas courant sur un continent.
  {
    const r = courir({ latence: 100, gigue: 20, graine: 7 })
    check('avec 100 ms de latence et de la gigue, elles s’accordent quand même',
      r.accord, `pas ${r.commun} · ${r.parties.a.rembobinages} rembobinages,`
      + ` ${r.parties.a.pasResimules} pas refaits`)
    check('et il a bien fallu rembobiner — sinon la mesure ne prouve rien',
      r.parties.a.rembobinages > 0 && r.parties.a.pasResimules > 0,
      `${r.parties.a.rembobinages} rembobinages pour 300 pas`)
  }

  // Des pertes : un message perdu doit etre rattrape par les suivants, qui
  // portent les pas manquants.
  {
    const r = courir({ latence: 80, gigue: 30, perte: 0.1, graine: 11 })
    check('avec 10 % de pertes, elles s’accordent encore',
      r.accord, `${r.lien.perdus} messages perdus sur ${r.lien.envoyes}, accord au pas ${r.commun}`)
  }

  // Des pertes lourdes : huit pas de redondance couvrent une rafale de plus
  // d'un dixieme de seconde. C'est le cas d'un reseau mobile qui hoquette.
  {
    const r = courir({ latence: 90, gigue: 40, perte: 0.3, graine: 5 })
    check('et avec 30 % de pertes aussi',
      r.accord, `${r.lien.perdus} messages perdus sur ${r.lien.envoyes}`)
  }

  // Le revers de la redondance : sans elle, les memes pertes font diverger.
  // Une precaution dont on ne montre pas qu'elle sert est une precaution qu'on
  // retirera un jour « pour simplifier ».
  {
    const r = courir({ latence: 90, gigue: 40, perte: 0.3, graine: 5 }, 300, { redondance: 1 })
    check('sans redondance, les mêmes pertes font diverger pour de bon',
      !r.accord, 'une entrée perdue ne se rattrape par aucun rembobinage')
  }

  // Le revers : sans rembobinage, la meme partie DIVERGE. Une propriete qu'on
  // ne sait pas casser n'est pas une propriete, c'est une croyance.
  {
    const lien = new LienLocal(['a', 'b'], { latence: 100, graine: 7 })
    const sims = { a: faireSim(), b: faireSim() }
    const transports = { a: lien.pour('a'), b: lien.pour('b') }
    const recues = { a: new Map(), b: new Map() }
    for (let p = 0; p < 300; p++) {
      for (const j of ['a', 'b']) {
        for (const m of transports[j].recevoir()) recues[j].set(m.joueur, m.bande[m.bande.length - 1])
        const mien = script(j, p)
        transports[j].envoyer({ joueur: j, pas: p, bande: [mien], empreinte: 0 })
        const entrees = new Map([[j, mien]])
        const autre = j === 'a' ? 'b' : 'a'
        entrees.set(autre, recues[j].get(autre) ?? ETAT_VIDE)
        sims[j].avancer(entrees)
      }
      lien.avancer(1000 / 60)
    }
    check('sans rembobinage, la même partie diverge',
      JSON.stringify(sims.a.etat) !== JSON.stringify(sims.b.etat),
      `${JSON.stringify(sims.a.etat)} contre ${JSON.stringify(sims.b.etat)}`)
  }

  // L'empreinte doit savoir dire qu'on a diverge. On force le desaccord.
  {
    const s1 = faireSim()
    const s2 = faireSim()
    s1.etat.a = 5
    check('deux états différents rendent deux empreintes différentes',
      s1.empreinte() !== s2.empreinte(), `${s1.empreinte()} contre ${s2.empreinte()}`)
    s2.etat.a = 5
    check('et deux états identiques la même',
      s1.empreinte() === s2.empreinte(), `${s1.empreinte()}`)
  }

  // Le retard local doit REDUIRE les rembobinages. C'est sa seule raison
  // d'etre, et une option qui ne change rien est une option a retirer.
  {
    const avec = (retard) => {
      const lien = new LienLocal(['a', 'b'], { latence: 60, graine: 3 })
      const sims = { a: faireSim(), b: faireSim() }
      const parties = {
        a: new Partie(sims.a, lien.pour('a'), ['a', 'b'], { fenetre: 16, retardLocal: retard }),
        b: new Partie(sims.b, lien.pour('b'), ['a', 'b'], { fenetre: 16, retardLocal: retard }),
      }
      for (let p = 0; p < 300; p++) {
        parties.a.avancer(script('a', p))
        parties.b.avancer(script('b', p))
        lien.avancer(1000 / 60)
      }
      return parties.a.pasResimules
    }
    const sans = avec(0)
    const deux = avec(4)
    check('un retard local volontaire réduit le nombre de pas refaits',
      deux < sans, `${sans} pas refaits sans retard, ${deux} avec quatre pas de retard`)
  }
}

console.log('\n--- le VRAI jeu, rembobine ---')

/*
 * Jusqu'ici tout a ete eprouve sur une simulation-jouet : deux curseurs qui
 * avancent. C'etait le bon choix pour ecrire le rembobinage — un echec y est
 * lisible. Ce n'est pas une preuve que le MOTEUR se rembobine : un heros porte
 * une vitesse, un coyote, un tampon de saut, une fraction de pixel, une
 * animation en cours, une vitalite, des frappes en vol. Chacune de ces choses
 * peut manquer a l'instantane sans que rien ne le dise, et le defaut
 * n'apparaitrait qu'a la premiere partie a deux.
 */
{
  const { creerNoeud } = await import('../src/scene/noeud.ts')
  const { Combat } = await import('../src/runtime/combat.ts')
  const { Peuplement, espece } = await import('../src/runtime/entites.ts')
  const { CorpsMobiles, grilleAvecCorps } = await import('../src/runtime/corps.ts')
  const { clipRegulier } = await import('../src/runtime/animation.ts')
  const { ORTHO_COTE } = await import('../src/noyau/projection.ts')
  const { SimulationJeu } = await import('../src/reseau/simulation-jeu.ts')
  const { deplacer } = await import('../src/runtime/collision.ts')
  const { Mouvements } = await import('../src/scene/noeud.ts')

  const T = 16
  const plan = [
    '....................',
    '....................',
    '....................',
    '....................',
    '..........####......',
    '....................',
    '....####............',
    '....................',
    '####################',
  ]
  const decor = {
    tuile: T, largeur: 20, hauteur: 9,
    solide: (cx, cy) => (plan[cy]?.[cx] ?? '#') === '#',
    matiere: (cx, cy) => ((plan[cy]?.[cx] ?? '#') === '#' ? 1 : 0),
  }
  const ESPECES = [
    espece('heros', {
      camp: 'heros', pv: 5, vitesse: 0, degats: 0, comportement: 'plateformeur',
      clip: 'marche', boite: { x: -4, y: -14, l: 8, h: 14 },
    }),
    espece('blob', {
      camp: 'ennemi', pv: 3, vitesse: 26, degats: 1, comportement: 'patrouille',
      clip: 'marche', boite: { x: -5, y: -7, l: 10, h: 7 }, pesante: true,
      degatsPietinement: 3, rebondPietinement: 30, invulnerabiliteMs: 0,
    }),
  ]
  const CLIPS = [clipRegulier('marche', [0, 1, 2, 3], 120)]

  const monter = () => {
    const racine = creerNoeud('noeud', 'monde')
    const combat = new Combat()
    const corps = new CorpsMobiles()
    const peuplement = new Peuplement(racine, combat, ESPECES, CLIPS, ORTHO_COTE(T), T)
    peuplement.degatsMatiere = 0
    const grille = grilleAvecCorps(decor, corps)
    // Les MEMES accumulateurs que le vrai jeu : c'est `Mouvements` qui les
    // tient, et c'est lui que l'instantane doit emporter.
    const mouvements = new Mouvements()
    const hote = (cible) => {
      const ch = (n) => {
        for (const e of n.enfants) { if (e.id === cible.id) return n; const r = ch(e); if (r) return r }
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
    const heros = peuplement.poser('heros', 6 * T, 8 * T)
    peuplement.poser('blob', 12 * T, 8 * T)
    peuplement.poser('blob', 16 * T, 8 * T)
    peuplement.synchroniser()
    const Entrees2 = Entrees
    const entrees = new Entrees2()
    entrees.pasMs = 1000 / 60
    const contexte = () => ({
      dt: 1 / 60, entrees, racine, carte: decor, grille, corps, pas: 0,
      trouver: () => null, bouger,
    })
    const sim = new SimulationJeu({
      racine, peuplement, combat, corps, entrees, mouvements, contexte,
      dtMs: 1000 / 60,
      noeudDe: () => heros,
      pas: (c, dtMs) => {
        peuplement.synchroniser()
        peuplement.avancer(c, heros, dtMs)
        for (const impact of combat.avancer(dtMs)) {
          if (impact.fatal) peuplement.tuer(impact.cible)
        }
      },
    })
    return { sim, racine, heros }
  }

  const rang = (a) => ACTIONS_ORDRE.indexOf(a)
  /** Un script de jeu : on court, on saute, on retombe sur des gelees. */
  const touches = (p) => {
    let tenues = 0
    let appuis = 0
    if (p % 90 < 55) tenues |= 1 << rang('droite')
    else tenues |= 1 << rang('gauche')
    if (p % 23 === 0) { appuis |= 1 << rang('saut'); tenues |= 1 << rang('saut') }
    if (p % 23 < 9) tenues |= 1 << rang('saut')
    return { tenues, appuis }
  }

  const jouer = (n) => {
    const m = monter()
    const trace = []
    for (let p = 0; p < n; p++) {
      m.sim.avancer(new Map([['a', touches(p)]]))
      trace.push(m.sim.empreinte())
    }
    return { ...m, trace }
  }

  const un = jouer(240)
  const deux = jouer(240)
  const ecart = un.trace.findIndex((v, i) => v !== deux.trace[i])
  check('le vrai jeu joué deux fois donne la même partie',
    ecart === -1, ecart === -1 ? '240 pas identiques' : `écart au pas ${ecart}`)

  // Et le rembobinage sur le vrai jeu : on photographie, on continue, on
  // revient, on recontinue. C'est ce qui met a l'epreuve chaque instantane —
  // le controleur, l'animation, la vitalite, les frappes en vol.
  {
    const m = monter()
    for (let p = 0; p < 120; p++) m.sim.avancer(new Map([['a', touches(p)]]))
    const photo = m.sim.instantane()
    const empreinteAvant = m.sim.empreinte()
    const droit = []
    for (let p = 120; p < 240; p++) {
      m.sim.avancer(new Map([['a', touches(p)]]))
      droit.push(m.sim.empreinte())
    }
    m.sim.restaurer(photo)
    check('un instantané rendu redonne exactement l’état visible qu’il portait',
      m.sim.empreinte() === empreinteAvant,
      `${empreinteAvant} contre ${m.sim.empreinte()}`)
    const refait = []
    for (let p = 120; p < 240; p++) {
      m.sim.avancer(new Map([['a', touches(p)]]))
      refait.push(m.sim.empreinte())
    }
    const e = droit.findIndex((v, i) => v !== refait[i])
    check('rembobiner cent vingt pas du vrai jeu refait exactement la même suite',
      e === -1, e === -1 ? '120 pas refaits à l’identique' : `écart au pas ${120 + e}`)
  }

  // Le revers : un instantane INCOMPLET doit echouer. Sans cette mesure, on ne
  // saurait pas si l'egalite ci-dessus vient de la justesse de l'instantane ou
  // de la pauvrete du script de test.
  {
    const m = monter()
    for (let p = 0; p < 120; p++) m.sim.avancer(new Map([['a', touches(p)]]))
    const photo = m.sim.instantane()
    // On garde les positions et l'on jette l'etat vivant : c'est exactement
    // l'instantane qu'on aurait ecrit en n'y pensant pas.
    const amputee = { ...photo, peuplement: [] }
    const droit = []
    for (let p = 120; p < 200; p++) {
      m.sim.avancer(new Map([['a', touches(p)]]))
      droit.push(m.sim.empreinte())
    }
    m.sim.restaurer(amputee)
    const refait = []
    for (let p = 120; p < 200; p++) {
      m.sim.avancer(new Map([['a', touches(p)]]))
      refait.push(m.sim.empreinte())
    }
    check('un instantané amputé de l’état vivant, lui, ne refait pas la même suite',
      droit.join('|') !== refait.join('|'),
      'la vitesse, le coyote et la fraction de pixel comptent autant que la position')
  }
  // La mesure qui reunit tout : le VRAI moteur, a deux, sur un lien qui
  // retarde et qui perd. C'est la seule qui reponde a « est-ce que ca marche »,
  // et elle ne tient que parce que chacune des precedentes tient.
  {
    const lien = new LienLocal(['a', 'b'], { latence: 90, gigue: 30, perte: 0.08, graine: 13 })
    const un = monter()
    const deux = monter()
    const parties = {
      a: new Partie(un.sim, lien.pour('a'), ['a', 'b'], { fenetre: 16, retardLocal: 2 }),
      b: new Partie(deux.sim, lien.pour('b'), ['a', 'b'], { fenetre: 16, retardLocal: 2 }),
    }
    // Un seul personnage dirige, deux machines qui le simulent : c'est le cas
    // le plus dur a tenir, parce que la moindre difference se voit tout de
    // suite sur le heros lui-meme.
    for (let p = 0; p < 300; p++) {
      parties.a.avancer(touches(p))
      parties.b.avancer({ tenues: 0, appuis: 0 })
      lien.avancer(1000 / 60)
    }
    const commun = Math.min(parties.a.pasConfirme, parties.b.pasConfirme)
    const ea = parties.a.empreinteA(commun)
    const eb = parties.b.empreinteA(commun)
    check('le vrai moteur, à deux, sur un lien qui retarde et qui perd',
      commun > 0 && ea !== null && ea === eb,
      `accord au pas ${commun} · ${lien.perdus} messages perdus,`
      + ` ${parties.b.rembobinages} rembobinages côté spectateur`)
    check('et il a fallu rembobiner pour y arriver',
      parties.b.rembobinages > 0, `${parties.b.pasResimules} pas refaits`)
  }
}

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
