/**
 * Le banc de l'habillage : la fonte, le son, les particules, le dialogue, les
 * menus, la sauvegarde.
 *
 * Ces six-la ne decident de rien dans le jeu, et c'est precisement pourquoi ils
 * se degradent sans qu'on s'en apercoive : une lettre manquante dans la fonte
 * ne fait tomber aucun banc, un son qui se rejoue cinquante fois apres un
 * rembobinage ne fait rien planter, un menu qui bute sur sa derniere ligne
 * passe pour un choix. Ce sont les defauts qu'on ne voit qu'en JOUANT — donc
 * ceux qu'il faut mesurer.
 */
const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n--- la fonte ---')

{
  const fonte = await import('../src/runtime/fonte.ts')
  const { glyphe, connait, caracteres, couper, largeurTexte, pixelsDe } = fonte

  // Chaque glyphe fait exactement cinq sur sept. Une rangee trop courte
  // decalerait tout ce qui suit sur la ligne, et seulement pour cette lettre.
  const mauvais = caracteres().filter((c) => {
    const g = glyphe(c)
    return g.length !== fonte.HAUTEUR_GLYPHE
      || g.some((r) => r.length !== fonte.LARGEUR_GLYPHE)
  })
  check('chaque glyphe fait cinq pixels sur sept',
    mauvais.length === 0,
    mauvais.length ? `fautifs : ${mauvais.join(' ')}` : `${caracteres().length} glyphes`)

  // Le francais s'ecrit avec des accents. Une fonte qui en manque fait ecrire
  // tout le jeu sans accents « parce que la fonte ne les a pas ».
  const attendus = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    ...'ÉÈÊÀÂÇÙÎÔéèêëàâçùûîïô', ...' .,:;!?-’()«»']
  const manquants = attendus.filter((c) => !connait(c))
  check('elle sait écrire le français, accents et guillemets compris',
    manquants.length === 0, manquants.length ? `manque : ${manquants.join(' ')}` : '')

  /*
   * Tout l'ASCII imprimable. Cette verification-la n'est pas du zele : le
   * curseur d'un menu s'ecrit « > », et « > » manquait. Il s'affichait donc en
   * pave plein, ce qui se voit sur une capture d'ecran et jamais dans un banc.
   * Une fonte se juge sur ce qu'elle NE SAIT PAS ecrire.
   */
  const ascii = []
  for (let c = 32; c < 127; c++) ascii.push(String.fromCharCode(c))
  const trous = ascii.filter((c) => !connait(c))
  check('la fonte couvre tout l’ASCII imprimable',
    trous.length === 0,
    trous.length ? `manque : ${trous.join(' ')}` : `${ascii.length} caractères`)

  // Un caractere inconnu doit SE VOIR. Rendre un espace ferait livrer un texte
  // amputé sans que personne ne s'en aperçoive.
  const inconnu = glyphe('中')
  check('un caractère inconnu rend un pavé plein, pas un blanc',
    inconnu.slice(0, 6).every((r) => r === '#####'),
    'un blanc se lirait comme une coquille, un pavé se remarque')

  // La coupure : aux espaces, et jamais au-dela de la largeur.
  const texte = 'Le héros franchit la fosse, puis remonte le puits en sautant d’une paroi à l’autre.'
  const lignes = couper(texte, 120)
  check('le texte se coupe aux espaces et tient dans la largeur',
    lignes.length > 1 && lignes.every((l) => largeurTexte(l) <= 120)
    && lignes.join(' ') === texte,
    `${lignes.length} lignes, la plus large ${Math.max(...lignes.map(largeurTexte))} px pour 120`)

  // Un mot plus long que la ligne doit etre COUPE, pas laisse a deborder : un
  // mot qui sort de sa boite ne se voit que sur la machine de quelqu'un d'autre.
  const long = couper('anticonstitutionnellement', 40)
  check('un mot plus long que la ligne est coupé plutôt que de déborder',
    long.length > 1 && long.every((l) => largeurTexte(l) <= 40)
    && long.join('') === 'anticonstitutionnellement',
    long.join('|'))

  check('les retours à la ligne écrits sont respectés',
    couper('un\ndeux', 400).length === 2, 'c’est ainsi qu’on sépare deux répliques')

  // Les pixels rendus : de quoi verifier un cadrage sans navigateur.
  const points = pixelsDe('I', 10, 3)
  check('un glyphe rend bien ses pixels, à la bonne place',
    points.length === glyphe('I').join('').split('#').length - 1
    && points.every((p) => p.x >= 10 && p.x < 15 && p.y >= 3 && p.y < 10),
    `${points.length} pixels pour un « I »`)
  check('et une lettre plus loin sur la ligne est décalée de la chasse',
    pixelsDe('II', 0, 0).some((p) => p.x >= fonte.LARGEUR_GLYPHE + fonte.CHASSE),
    'sinon les lettres se superposeraient')
}

console.log('\n--- le son ---')

{
  const { son, rendre, Sonneur, FORMES } = await import('../src/runtime/son.ts')

  // La duree annoncee est la duree rendue.
  const s = son('pas', { duree: 100, frequence: 300 })
  const e = rendre(s, 44100)
  check('un son dure ce qu’il annonce', e.length === 4410, `${e.length} échantillons`)

  // L'enveloppe finit a zero. Un son coupe net a mi-volume claque, et le
  // claquement s'entend plus que le son.
  check('son enveloppe part de zéro et y revient',
    Math.abs(e[0]) < 0.02 && Math.abs(e[e.length - 1]) < 0.02,
    `début ${e[0].toFixed(3)}, fin ${e[e.length - 1].toFixed(3)}`)
  check('et il ne sature jamais',
    e.every((v) => v >= -1 && v <= 1), `pointe ${Math.max(...e).toFixed(3)}`)

  // Les quatre formes rendent quatre sons DIFFERENTS. Une forme qui ne
  // changerait rien serait une option a retirer.
  const empreintes = FORMES.map((f) => {
    const q = rendre(son('x', { forme: f, duree: 40, frequence: 440 }), 8000)
    return [...q].map((v) => Math.round(v * 100)).join(',')
  })
  check('les quatre formes d’onde donnent quatre sons différents',
    new Set(empreintes).size === 4, FORMES.join(', '))

  // Le bruit doit etre REPRODUCTIBLE : sinon rien ici ne se verifie.
  const b1 = rendre(son('b', { forme: 'bruit', duree: 20 }), 8000)
  const b2 = rendre(son('b', { forme: 'bruit', duree: 20 }), 8000)
  check('le bruit est reproductible d’une exécution à l’autre',
    [...b1].every((v, i) => v === b2[i]), 'sinon on ne peut rien mesurer')

  /*
   * Le piege du rembobinage : un evenement rejoue ne doit PAS resonner deux
   * fois. Sans cette regle, une correction reseau de cinquante pas fait
   * entendre cinquante bruits de pas d'un coup.
   */
  {
    const sonneur = new Sonneur([son('pas'), son('coup')])
    const evenements = []
    sonneur.sortie = (q) => evenements.push(q.nom)
    for (let p = 100; p < 110; p++) sonneur.evenement(p, 'heros', 'pas')
    const apresUnPassage = evenements.length
    // On refait les memes pas, comme le ferait un rembobinage.
    for (let p = 100; p < 110; p++) sonneur.evenement(p, 'heros', 'pas')
    check('un événement rejoué par un rembobinage ne sonne pas deux fois',
      evenements.length === apresUnPassage && sonneur.evites === 10,
      `${apresUnPassage} sons joués, ${sonneur.evites} évités`)
    check('mais deux sources différentes au même pas sonnent bien deux fois',
      sonneur.evenement(200, 'gelee', 'pas') && sonneur.evenement(200, 'chauve', 'pas'),
      'sinon deux créatures qui marchent ensemble n’en feraient qu’une')
    check('et un son inconnu ne fait rien, sans se plaindre',
      !sonneur.evenement(300, 'heros', 'inexistant'), 'un jeu ne s’arrête pas pour un son')
  }

  // La table de memoire ne doit pas grandir sans fin : soixante entrees par
  // seconde pendant une heure feraient deux cent seize mille clefs.
  {
    const sonneur = new Sonneur([son('pas')])
    for (let p = 0; p < 5000; p++) sonneur.evenement(p, 'h', 'pas')
    // On revient loin en arriere : c'est oublie, donc ca rejoue.
    check('la mémoire du sonneur s’oublie au-delà de sa fenêtre',
      sonneur.evenement(10, 'h', 'pas'), 'sinon elle grandirait indéfiniment')
  }
}

console.log('\n--- la musique ---')

{
  const { musique, voie, frequenceDe, dureeTemps, dureeDe, rendreMusique, Musicien } =
    await import('../src/runtime/musique.ts')
  const { son, rendre } = await import('../src/runtime/son.ts')

  // Le la4 vaut 440 hertz, l'octave double, et le demi-ton est la racine
  // douzieme de deux. Ces trois-la tiennent toute la table : si elles sont
  // justes, aucune note ne peut etre fausse.
  check('le la4 vaut 440 hertz', frequenceDe('la4') === 440, 'la référence universelle')
  check('une octave double la fréquence',
    Math.abs(frequenceDe('la5') - 880) < 1e-9 && Math.abs(frequenceDe('la3') - 220) < 1e-9,
    'la5 880, la3 220')
  check('douze demi-tons font une octave',
    Math.abs(frequenceDe('do5') / frequenceDe('do4') - 2) < 1e-12,
    `do4 ${frequenceDe('do4').toFixed(2)}, do5 ${frequenceDe('do5').toFixed(2)}`)
  check('le silence, le tiret et une note inventée valent zéro, et non 440',
    ['.', '-', '', 'zz4', 'la', 'do#'].every((n) => frequenceDe(n) === 0),
    'une note illisible qui rendrait 440 se jouerait sans qu’on la voie')

  // Une musique dure ce que sa voie la plus longue dure. C'est la voie la plus
  // longue et non la premiere : une percussion de quatre temps sous une
  // melodie de seize ne raccourcit pas le morceau.
  {
    const m = musique('essai', {
      tempo: 120,
      voies: [voie(['do4', 're4']), voie(['do3', '-', '-', '-', '-', '-', '-', '-'])],
    })
    check('un temps à 120 dure une demi-seconde', dureeTemps(120) === 500, `${dureeTemps(120)} ms`)
    check('la musique dure ce que dure sa voie la plus LONGUE',
      dureeDe(m) === 4000, `${dureeDe(m)} ms pour 8 temps, la voie de 2 temps ne la raccourcit pas`)
    const e = rendreMusique(m, 8000)
    check('et le rendu fait exactement cette durée',
      e.length === Math.round(dureeDe(m) * 8000 / 1000), `${e.length} échantillons`)
    check('il ne sature jamais, malgré deux voies additionnées',
      e.every((v) => v >= -1 && v <= 1), `pointe ${Math.max(...e).toFixed(3)}`)
  }

  /*
   * Le tiret PROLONGE au lieu de rejouer. C'est la difference entre une
   * melodie et un martelement, et c'est invisible dans le fichier : deux
   * musiques de meme duree, l'une tenue, l'autre martelee.
   *
   * On la mesure par le nombre d'ATTAQUES : une note tenue monte une fois
   * depuis zero ; une note repetee retombe et remonte a chaque temps.
   */
  {
    const t = son('t', { forme: 'carre', attaque: 20, chute: 20, duree: 100 })
    const tenue = rendreMusique(
      musique('tenue', { tempo: 240, voies: [voie(['do4', '-', '-', '-'], { timbre: t })] }), 8000)
    const martelee = rendreMusique(
      musique('mart', { tempo: 240, voies: [voie(['do4', 'do4', 'do4', 'do4'], { timbre: t })] }), 8000)
    // Un creux : trois echantillons de suite sous un centieme, ailleurs qu'au
    // tout debut et a la toute fin.
    const creux = (e) => {
      let n = 0
      for (let i = 40; i < e.length - 40; i++) {
        if (Math.abs(e[i]) < 0.01 && Math.abs(e[i - 1]) < 0.01 && Math.abs(e[i + 1]) < 0.01
          && Math.abs(e[i - 2]) >= 0.01) n++
      }
      return n
    }
    check('une note tenue par des tirets ne se rattaque pas à chaque temps',
      creux(tenue) < creux(martelee),
      `${creux(tenue)} creux tenue contre ${creux(martelee)} martelée — même durée, ${tenue.length} échantillons`)
    check('et les deux durent pourtant exactement le même temps',
      tenue.length === martelee.length, `${tenue.length} échantillons`)
  }

  // La chute ne peut pas depasser la note. Une chute de 200 ms sur une croche
  // de 100 ferait commencer la decroissance avant la fin de l'attaque.
  {
    const long = son('l', { chute: 400, duree: 40 })
    const e = rendreMusique(
      musique('vite', { tempo: 480, voies: [voie(['do4'], { timbre: long })] }), 8000)
    check('la chute d’un timbre est rognée pour tenir dans une note brève',
      Math.abs(e[e.length - 1]) < 0.05,
      `fin à ${e[e.length - 1].toFixed(3)} — une note coupée à mi-volume claque`)
  }

  // Le rendu est reproductible : sinon l'export du .wav donnerait un fichier
  // different a chaque construction, et tout diff deviendrait illisible.
  {
    const m = musique('r', { tempo: 200, voies: [voie(['do4', 'mi4', 'sol4'])] })
    const a = rendreMusique(m, 8000)
    const b = rendreMusique(m, 8000)
    check('deux rendus de la même musique sont identiques échantillon par échantillon',
      a.length === b.length && [...a].every((v, i) => v === b[i]),
      'sinon chaque export produirait un fichier différent')
  }

  // Le musicien : une seule musique a la fois, et la redemander ne relance pas.
  {
    const musicien = new Musicien([musique('caverne'), musique('titre')])
    const lancees = []
    let arrets = 0
    musicien.sortie = (m) => lancees.push(m.nom)
    musicien.arret = () => { arrets++ }
    check('lancer une musique la lance', musicien.jouer('caverne') && lancees.length === 1)
    check('et le PREMIER lancement n’arrête rien, faute de quoi arrêter',
      arrets === 0,
      'chez l’hôte, `arret` à vide est un stop() sur une source qui n’existe pas')
    check('la redemander ne la relance PAS',
      !musicien.jouer('caverne') && lancees.length === 1,
      'sinon un script qui appelle à chaque pas la ferait bégayer soixante fois par seconde')
    check('en changer arrête la précédente',
      musicien.jouer('titre') && arrets === 1 && musicien.nom === 'titre',
      `${lancees.join(' puis ')}`)
    check('une musique inconnue ne fait rien, sans se plaindre',
      !musicien.jouer('inexistante') && musicien.nom === 'titre',
      'un jeu ne s’arrête pas pour une musique')
    musicien.arreter()
    check('et l’arrêt libère la place pour relancer la même',
      musicien.nom === '' && musicien.jouer('titre'), `${musicien.lancees} lancements`)
  }
}

console.log('\n--- le WAV, ce que l’export donne à Godot et Unity ---')

{
  const { encoderWav } = await import('../src/export/wav.ts')
  const { son, rendre } = await import('../src/runtime/son.ts')

  const e = rendre(son('pas', { duree: 100, frequence: 300 }), 22050)
  const w = encoderWav(e, 22050)
  const vue = new DataView(w.buffer, w.byteOffset, w.byteLength)
  const mot = (p) => String.fromCharCode(w[p], w[p + 1], w[p + 2], w[p + 3])

  check('le fichier porte RIFF, WAVE et ses deux morceaux',
    mot(0) === 'RIFF' && mot(8) === 'WAVE' && mot(12) === 'fmt ' && mot(36) === 'data',
    `${w.length} octets`)
  check('sa taille annoncée est sa taille réelle',
    vue.getUint32(4, true) === w.length - 8 && vue.getUint32(40, true) === e.length * 2,
    `${vue.getUint32(4, true)} + 8 = ${w.length}`)
  check('il annonce une voie, seize bits, et le taux qu’on lui a donné',
    vue.getUint16(20, true) === 1 && vue.getUint16(22, true) === 1
    && vue.getUint32(24, true) === 22050 && vue.getUint16(34, true) === 16,
    'PCM 16 bits mono à 22050 Hz')
  check('le débit et l’alignement suivent, au lieu d’être écrits en dur',
    vue.getUint32(28, true) === 22050 * 2 && vue.getUint16(32, true) === 2,
    'un lecteur strict refuse un en-tête incohérent')

  // La borne : sans elle, un echantillon a 1,2 deborde vers -26000, c'est-a-dire
  // un craquement violent au beau milieu du son.
  {
    const debordant = new Float32Array([0, 1.5, -1.5, 0.5, -0.5])
    const q = encoderWav(debordant, 8000)
    const v = new DataView(q.buffer, q.byteOffset, q.byteLength)
    const lus = [0, 1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true))
    check('un échantillon hors bornes est ÉCRÊTÉ, et non replié dans le négatif',
      lus[1] === 32767 && lus[2] === -32767,
      `1,5 → ${lus[1]} et −1,5 → ${lus[2]} ; un débordement donnerait ${(Math.round(1.5 * 32767) << 16) >> 16}`)
    check('et ce qui tient dans les bornes garde sa valeur',
      lus[0] === 0 && lus[3] === Math.round(0.5 * 32767) && lus[4] === Math.round(-0.5 * 32767),
      `${lus.join(', ')}`)
  }

  // Deux exports du meme son doivent donner le meme fichier, octet pour octet :
  // c'est ce qui rend une archive reproductible.
  check('deux encodages du même son sont identiques octet pour octet',
    encoderWav(e, 22050).every((v, i) => v === w[i]),
    'sinon chaque construction changerait l’archive')

  // Un son vide ne doit pas produire un fichier invalide.
  {
    const q = encoderWav(new Float32Array(0), 44100)
    check('un son vide donne un en-tête valide et zéro donnée',
      q.length === 44 && new DataView(q.buffer, q.byteOffset, 44).getUint32(40, true) === 0,
      `${q.length} octets`)
  }
}

console.log('\n--- la traduction ---')

{
  const { Traduction } = await import('../src/runtime/traduction.ts')

  const tr = new Traduction({
    fr: { 'menu.jouer': 'Jouer', 'menu.quitter': 'Quitter', 'hud.vies': '{n} vies', vide: '' },
    en: { 'menu.jouer': 'Play', 'hud.vies': '{n} lives' },
  }, 'fr')

  check('elle rend le texte de la langue courante', tr.t('menu.jouer') === 'Jouer')
  tr.langue = 'en'
  check('et change de langue sans rien recharger', tr.t('menu.jouer') === 'Play')

  // LA regle : ce qui manque doit SE VOIR. Rendre du vide ferait disparaitre
  // un bouton, et personne ne remarque un bouton sans etiquette.
  check('une clef non traduite rend LA CLEF, et non du vide',
    tr.t('menu.quitter') === 'menu.quitter',
    'un bouton sans étiquette ne se remarque pas ; « menu.quitter » à l’écran, si')
  check('elle est retenue dans la liste de ce qui reste à traduire',
    tr.manquantes.has('en:menu.quitter'), [...tr.manquantes].join(', '))
  check('une clef qui n’existe nulle part rend elle aussi la clef',
    tr.t('clef.inventee') === 'clef.inventee')

  // Un texte VOLONTAIREMENT vide n'est pas un texte manquant : la difference
  // se joue sur `undefined`, pas sur la longueur.
  tr.langue = 'fr'
  check('un texte volontairement vide reste vide, et n’est pas compté manquant',
    tr.t('vide') === '' && !tr.manquantes.has('fr:vide'),
    'sinon on ne pourrait jamais écrire une ligne vide exprès')

  // Les substitutions sont NOMMEES : l'ordre des mots change d'une langue a
  // l'autre, un %s positionnel ne survivrait pas.
  check('la substitution est nommée et non positionnelle',
    tr.t('hud.vies', { n: 3 }) === '3 vies', tr.t('hud.vies', { n: 3 }))
  tr.langue = 'en'
  check('et elle survit à une langue qui place les mots autrement',
    tr.t('hud.vies', { n: 3 }) === '3 lives')
  check('une valeur absente laisse le marqueur en clair au lieu de « undefined »',
    tr.t('hud.vies') === '{n} lives',
    'écrire « undefined lives » à l’écran serait pire que montrer le marqueur')

  // Le rapport avant livraison : ce que l'anglais n'a pas.
  check('elle dit exactement ce qui manque à une langue',
    tr.trous('en', 'fr').join(',') === 'menu.quitter,vide',
    tr.trous('en', 'fr').join(', '))
  check('et rien ne manque à la langue de référence elle-même',
    tr.trous('fr', 'fr').length === 0)
  check('une langue entièrement absente manque de TOUT, sans planter',
    tr.trous('de', 'fr').length === 4, `${tr.trous('de', 'fr').length} clefs`)

  // `definir` complete au lieu d'ecraser : traduire dix clefs de plus ne doit
  // pas effacer les cinquante deja faites.
  tr.definir('en', { 'menu.quitter': 'Quit' })
  check('ajouter des textes complète la table au lieu de l’écraser',
    tr.t('menu.quitter') === 'Quit' && tr.t('menu.jouer') === 'Play',
    `${tr.trous('en', 'fr').length} trous restants`)
  check('et `a` distingue le connu de l’inconnu, langue par langue',
    tr.a('menu.quitter', 'en') && !tr.a('menu.quitter', 'de') && tr.a('menu.quitter', 'fr'))
}

console.log('\n--- les particules ---')

{
  const { Particules, emission } = await import('../src/runtime/particules.ts')

  const p = new Particules(7)
  p.emettre(emission({ nombre: 12, vie: 200, vieVariation: 0 }), 100, 50)
  check('une gerbe émet ce qu’on lui demande', p.nombre === 12, `${p.nombre} particules`)

  // Elles meurent. Une particule immortelle est une fuite qu'on ne voit pas.
  for (let i = 0; i < 20; i++) p.avancer(1000 / 60)
  check('et elles meurent au bout de leur vie', p.nombre === 0,
    'une particule immortelle est une fuite qui ne se voit pas')

  // Les points rendus sont ENTIERS : une particule en sous-pixel scintille.
  const q = new Particules(3)
  q.emettre(emission({ nombre: 20 }), 40, 40)
  q.avancer(100)
  check('leurs positions sont des pixels entiers',
    q.points().every((v) => Number.isInteger(v.x) && Number.isInteger(v.y)),
    `${q.nombre} particules`)

  // La couleur suit la vie : une gerbe qui garde la meme couleur du debut a la
  // fin ne se lit pas comme une gerbe.
  const r = new Particules(1)
  r.emettre(emission({ nombre: 4, vie: 300, vieVariation: 0, couleurs: ['#fff', '#f80', '#800'] }), 0, 0)
  const debut = r.points()[0].couleur
  r.avancer(280)
  const fin = r.points()[0]?.couleur
  check('leur couleur change au cours de leur vie', debut !== fin, `${debut} → ${fin}`)

  // Le plafond : mille particules ne se voient pas mieux que cent, et font
  // tomber la cadence.
  const t = new Particules(1)
  t.plafond = 50
  for (let i = 0; i < 20; i++) t.emettre(emission({ nombre: 20 }), 0, 0)
  check('un plafond empêche une explosion d’abîmer la cadence',
    t.nombre === 50, `${t.nombre} particules pour 400 demandées`)

  /*
   * Une gerbe ne se PHOTOGRAPHIE pas, et c'est voulu.
   *
   * Le rembobinage garde un instantane par pas. Y mettre les particules
   * couterait cette copie a chaque pas garde, sur les deux machines, pour
   * quelque chose que personne ne peut contredire — deux joueurs ne verront
   * jamais que leurs etincelles different. Le jour ou quelqu'un ajoutera
   * `instantane()` ici « pour faire comme les autres », ce controle tombera et
   * dira pourquoi il ne faut pas.
   */
  check('une gerbe ne se photographie pas : elle n’est pas dans la simulation',
    typeof (new Particules(1)).instantane === 'undefined'
    && typeof (new Particules(1)).restaurer === 'undefined',
    'après un rembobinage, les étincelles diffèrent — et personne ne le verra jamais')

  // Une gerbe dirigee part BIEN dans la direction demandee. Quatre-vingt-dix
  // degres pointe vers le BAS : c'est le sens de l'ecran, pas celui des
  // mathematiques, et s'en tromper fait tomber les etincelles vers le haut.
  {
    const bas = new Particules(2)
    bas.emettre(emission({ nombre: 30, angle: 90, ouverture: 20, pesanteur: 0, vitesse: 100 }), 0, 0)
    bas.avancer(100)
    const descendues = bas.points().filter((v) => v.y > 0).length
    check('une gerbe à quatre-vingt-dix degrés part vers le bas de l’écran',
      descendues === bas.nombre, `${descendues} particules sur ${bas.nombre}`)
  }

  // La pesanteur agit : sans elle, une gerbe monte indefiniment et ne
  // ressemble a rien.
  {
    const g = new Particules(4)
    g.emettre(emission({ nombre: 12, angle: -90, ouverture: 10, vitesse: 90, pesanteur: 900 }), 0, 0)
    g.avancer(60)
    const haut = Math.min(...g.points().map((v) => v.y))
    g.avancer(300)
    const apres = Math.min(...g.points().map((v) => v.y))
    check('les particules retombent',
      apres > haut, `montées jusqu’à ${haut}, redescendues à ${apres}`)
  }

  // Reproductible : la meme graine donne la meme gerbe.
  const g1 = new Particules(42)
  const g2 = new Particules(42)
  g1.emettre(emission({ nombre: 10 }), 0, 0)
  g2.emettre(emission({ nombre: 10 }), 0, 0)
  g1.avancer(50); g2.avancer(50)
  check('la même graine donne la même gerbe',
    JSON.stringify(g1.points()) === JSON.stringify(g2.points()),
    'sinon une capture d’écran ne se reproduit pas')
}

console.log('\n--- le dialogue ---')

{
  const { Dialogue, replique } = await import('../src/runtime/dialogue.ts')

  const d = new Dialogue({ largeur: 120, vitesse: 30, lignes: 3 })
  d.ouvrir([
    replique('Le puits se remonte en sautant d’une paroi à l’autre.', { qui: 'Pixl' }),
    replique('Tu veux essayer ?', {
      choix: [{ texte: 'Oui', valeur: 'oui' }, { texte: 'Plus tard', valeur: 'non' }],
    }),
  ])
  check('le dialogue s’ouvre sur sa première réplique',
    d.ouvert && d.courante.qui === 'Pixl', d.courante.qui)
  check('et rien n’est encore écrit', d.lignesVisibles().join('') === '',
    'le texte se compose, il n’apparaît pas d’un coup')

  d.avancerTemps(500)
  const partiel = d.lignesVisibles().join('')
  check('le texte s’écrit lettre à lettre',
    partiel.length > 0 && !d.complet, `${partiel.length} caractères après une demi-seconde`)

  // Le deuxieme appui affiche tout : faire attendre quelqu'un qui a deja lu
  // transforme un dialogue en corvee.
  check('un appui affiche la réplique entière', d.valider() === 'complete' && d.complet,
    'faire attendre quelqu’un qui a déjà lu est la faute la plus répandue du genre')
  check('un deuxième appui passe à la suivante', d.valider() === 'suivant',
    d.courante.texte)

  // Les choix : le curseur boucle, et la valeur revient a l'appelant.
  d.avancerTemps(10000)
  d.deplacer(1)
  check('le curseur se déplace dans les choix', d.curseur === 1, `curseur ${d.curseur}`)
  d.deplacer(1)
  check('et il boucle sur le premier', d.curseur === 0,
    'un menu qui bute sur sa dernière ligne a l’air planté')
  d.deplacer(1)
  check('valider rend le choix pris',
    d.valider() === 'ferme' && d.derniereValeur === 'non', d.derniereValeur)
  check('et le dialogue se ferme après la dernière réplique', !d.ouvert)

  // Le decoupage decide de la hauteur de la boite : le savoir au dessin serait
  // trop tard, on aurait deja choisi ou la poser.
  const e = new Dialogue({ largeur: 60, vitesse: 1000, lignes: 2 })
  e.ouvrir([replique('Une phrase assez longue pour tenir sur plusieurs lignes étroites.')])
  e.avancerTemps(10000)
  check('la boîte connaît sa hauteur avant d’être dessinée',
    e.hauteurTexte() > 0 && e.lignesVisibles().length <= 2,
    `${e.hauteurTexte()} px, ${e.lignesVisibles().length} lignes visibles`)
}

console.log('\n--- les menus ---')

{
  const { Menu, entree } = await import('../src/runtime/menu.ts')

  const m = new Menu([
    entree('Continuer', 'continuer', false),
    entree('Nouvelle partie', 'neuve'),
    entree('Options', 'options'),
  ])
  // Une entree inerte se VOIT et ne se choisit pas : la retirer changerait la
  // place de tout le reste d'un ecran a l'autre.
  check('le curseur commence sur la première entrée active',
    m.curseur === 1, `entrée ${m.curseur} : ${m.choisie.texte}`)
  m.deplacer(1)
  check('il descend', m.curseur === 2, m.choisie.texte)
  m.deplacer(1)
  check('et il boucle en sautant l’entrée inerte', m.curseur === 1,
    'il saute « Continuer », qui est grisée')
  m.deplacer(-1)
  check('il remonte aussi en la sautant', m.curseur === 2, m.choisie.texte)
  check('valider rend la valeur', m.valider() === 'options', m.valider())

  const inerte = new Menu([entree('Rien', 'rien', false)])
  check('un menu sans entrée active se sait vide et ne bouge pas',
    inerte.vide && !inerte.deplacer(1) && inerte.valider() === '',
    'plutôt que de rendre une valeur qu’on ne pouvait pas choisir')

  // Remplacer les entrees garde la selection quand elle reste possible : sans
  // cela, activer « Continuer » en arrivant du menu remettrait le curseur en
  // haut sous les doigts du joueur.
  m.remplacer([
    entree('Continuer', 'continuer'),
    entree('Nouvelle partie', 'neuve'),
    entree('Options', 'options'),
  ])
  check('remplacer les entrées garde la sélection', m.valider() === 'options',
    'sinon le curseur saute sous les doigts du joueur')
}

console.log('\n--- la sauvegarde de la partie ---')

{
  const { Sauvegarde, partieNeuve, versTexte, relire, VERSION_SAUVEGARDE } =
    await import('../src/runtime/sauvegarde.ts')

  const disque = new Map()
  const faire = (projet) => new Sauvegarde(projet, {
    lire: (c) => disque.get(c) ?? null,
    ecrire: (c, t) => disque.set(c, t),
    maintenant: () => 1700000000000,
  })

  const s = faire('caverne')
  s.noter('morts', 3)
  s.acquerir('epee')
  s.reprendreA(320, 176)
  s.avancerDuree(125000)
  s.poser({ pv: 1, pvMax: 1, graine: 7 })
  s.enregistrer(0)

  const relu = faire('caverne')
  const r = relu.charger(0)
  check('une partie enregistrée se relit',
    r.trouvee && relu.partie.compteurs.morts === 3 && relu.a('epee')
    && relu.partie.reprise.x === 320 && relu.partie.graine === 7,
    `${relu.partie.pv} pv, reprise ${relu.partie.reprise.x},${relu.partie.reprise.y}`)

  // La graine EN FAIT PARTIE : sans elle, un étage engendré rouvre un autre
  // étage, avec le héros au milieu d’un mur.
  check('elle emporte la graine du monde engendré', relu.partie.graine === 7,
    'sinon on rouvre un autre étage, le héros dans un mur')

  // Une partie d'un AUTRE jeu doit être refusée, et le dire.
  const autre = faire('citadelle')
  disque.set(Sauvegarde.cleDe('citadelle', 0), versTexte(partieNeuve('caverne')))
  const refus = autre.charger(0)
  check('une partie d’un autre projet est refusée, avec la raison',
    !refus.trouvee && refus.note.includes('caverne'), refus.note)

  // Un emplacement vide n'est pas une faute : c'est le cas de tout le monde
  // la première fois.
  const vide = faire('donjon')
  check('un emplacement vide se dit vide, sans erreur',
    !vide.charger(2).trouvee && vide.charger(2).note === '' && vide.resume(2) === 'vide')

  // Un fichier abîmé se signale au lieu de reprendre avec zéro point de vie.
  disque.set(Sauvegarde.cleDe('donjon', 1), '{ ceci n’est pas du JSON')
  const abime = vide.charger(1)
  check('une sauvegarde abîmée est signalée, pas devinée',
    !abime.trouvee && abime.note.includes('illisible'), abime.note)

  // Une version plus récente se lit quand même, et le dit.
  const futur = { ...partieNeuve('donjon'), version: VERSION_SAUVEGARDE + 5, pv: 9 }
  disque.set(Sauvegarde.cleDe('donjon', 2), versTexte(futur))
  const enAvant = vide.charger(2)
  check('une version plus récente se lit sans faire semblant de la comprendre',
    enAvant.trouvee && enAvant.note.includes('version') && vide.partie.pv === 9,
    enAvant.note)

  // Le résumé, pour un menu.
  check('le résumé d’un emplacement se lit d’un coup d’œil',
    /\d+\/\d+ pv · \d+ min/.test(relu.resume(0)), relu.resume(0))

  // Et le point qui donne son nom au fichier : la partie n’est PAS le projet.
  const { relire: relireProjet } = { relire }
  const texte = versTexte(relu.partie)
  check('une sauvegarde ne contient ni carte, ni planche, ni espèce',
    !texte.includes('calques') && !texte.includes('planches') && !texte.includes('especes'),
    'le projet décrit le jeu, la sauvegarde décrit une partie')
  check('et elle porte une version dès le premier jour',
    relireProjet(texte).partie.version === VERSION_SAUVEGARDE,
    'un lecteur doit pouvoir dire qu’il ne comprend pas')
}

console.log('\n--- la manette, le tactile, et le plan de touches ---')

{
  const { Entrees, ACTIONS_ORDRE } = await import('../src/runtime/entree.ts')

  // Le plan de touches est REMAPPABLE, et il s'ecrit dans un fichier. Un plan
  // fige rend le jeu injouable pour une partie des gens, en silence.
  {
    const e = new Entrees()
    const plan = e.planCourant()
    check('le plan de touches se lit et s’enregistre',
      Array.isArray(plan.saut) && plan.saut.includes('Space'),
      `saut : ${plan.saut.join(', ')}`)
    e.definirPlan({ saut: ['KeyJ'], droite: ['KeyL'] })
    e.auPas(0)
    e.simulerAppui('KeyJ')
    check('et un plan remappé prend effet',
      e.tenue('saut') && !e.tenue('droite'), 'Espace ne fait plus rien, J saute')
    e.simulerAppui('Space')
    check('l’ancienne touche ne fait plus rien', !e.tenue('droite'),
      'sinon le remappage serait un ajout et non un remplacement')
  }

  // La manette : on l'INTERROGE, elle n'envoie rien. On simule le tableau que
  // le navigateur rend, ce qui permet de l'eprouver sans manette.
  {
    const e = new Entrees()
    e.pasMs = 1000 / 60
    const faux = { buttons: [], axes: [0, 0] }
    // `navigator` est en lecture seule sous Node : on le REMPLACE par une
    // propriete a nous, et l'on remet l'original a la fin. Contourner en
    // ajoutant un crochet d'injection au moteur ferait exister, dans le code
    // livre, un chemin qui ne sert qu'au banc.
    const navAvant = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => [faux] }, configurable: true, writable: true,
    })
    e.auPas(0)
    faux.buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: i === 15 }))
    e.lireManettes()
    check('une manette branchée dirige comme le clavier',
      e.tenue('droite') && e.axe().x === 1, `axe x = ${e.axe().x}`)
    e.auPas(1)
    faux.buttons = Array.from({ length: 16 }, () => ({ pressed: false }))
    e.lireManettes()
    check('et lâcher la croix arrête bien le personnage',
      !e.tenue('droite'), 'sinon il courrait pour toujours')
    e.auPas(2)
    faux.axes = [-0.9, 0]
    e.lireManettes()
    check('le stick gauche dirige aussi', e.axe().x === -1, `axe x = ${e.axe().x}`)
    e.auPas(3)
    faux.axes = [-0.2, 0]
    e.lireManettes()
    check('mais une zone morte évite qu’un stick usé marche tout seul',
      e.axe().x === 0, 'deux dixièmes de course ne comptent pas')
    if (navAvant) Object.defineProperty(globalThis, 'navigator', navAvant)
    else delete globalThis.navigator
  }

  // Le tactile : des zones en FRACTIONS de la surface, donc la meme
  // description sur un telephone et sur une tablette.
  {
    const e = new Entrees()
    e.auPas(0)
    e.presserAction('gauche')
    check('une zone tactile presse une action',
      e.tenue('gauche') && e.axe().x === -1, `axe x = ${e.axe().x}`)
    check('et elle compte comme un appui récent',
      e.vientDePresser('gauche'), 'le tampon de saut doit marcher au doigt aussi')
    e.relacherAction('gauche')
    check('la relâcher l’arrête', !e.tenue('gauche'))
    check('les codes inventés ne polluent pas le plan enregistré',
      !JSON.stringify(e.planCourant()).includes('@gauche'),
      'ils ne désignent aucune touche : les enregistrer ferait croire à un plan modifiable')
    void ACTIONS_ORDRE
  }
}

console.log('\n--- le hit-stop et la secousse ---')

{
  /*
   * Le gel et la secousse vivent dans `Jeu`, qui demande un canevas. On
   * eprouve donc la REGLE sur un double minimal — un compteur qui s'arrete —
   * plutot que de renoncer a la mesurer. Ce qui compte ici est l'arithmetique
   * du gel et la decroissance de la secousse, et ni l'une ni l'autre ne
   * dependent du navigateur.
   */
  class JeuMinimal {
    constructor(pasMs) {
      this.pasMs = pasMs
      this.gelRestant = 0
      this.secousseAmplitude = 0
      this.secousseRestante = 0
      this.secousseDuree = 1
      this.secousseGraine = 1
      this.pas = 0
    }

    geler(ms) { this.gelRestant = Math.max(this.gelRestant, ms) }

    secouer(a, ms) {
      if (this.secousseRestante > 0 && a <= this.secousseAmplitude) return
      this.secousseAmplitude = a
      this.secousseRestante = ms
      this.secousseDuree = Math.max(1, ms)
      this.secousseGraine = (Math.imul(this.secousseGraine, 1664525) + 1013904223) >>> 0
    }

    get secousse() {
      return this.secousseRestante > 0
        ? this.secousseAmplitude * (this.secousseRestante / this.secousseDuree)
        : 0
    }

    decalage() {
      if (this.secousseRestante <= 0) return { x: 0, y: 0 }
      const a = this.secousse
      const n = Math.imul(this.secousseGraine ^ Math.round(this.secousseRestante), 2654435761) >>> 0
      return {
        x: Math.round((((n & 0xffff) / 65536) * 2 - 1) * a),
        y: Math.round((((n >>> 16) / 65536) * 2 - 1) * a),
      }
    }

    avancer() {
      if (this.secousseRestante > 0) this.secousseRestante -= this.pasMs
      if (this.gelRestant > 0) { this.gelRestant -= this.pasMs; return }
      this.pas++
    }
  }

  {
    const j = new JeuMinimal(1000 / 60)
    for (let i = 0; i < 10; i++) j.avancer()
    j.geler(50)
    for (let i = 0; i < 10; i++) j.avancer()
    check('le gel suspend la simulation, il ne la ralentit pas',
      j.pas === 10 + 7, `${j.pas} pas — trois images gelées sur cinquante millisecondes`)
    check('et le monde repart tout seul', !(j.gelRestant > 0), 'un gel qui ne finit pas est un plantage')
  }

  {
    const j = new JeuMinimal(1000 / 60)
    j.geler(100)
    j.geler(30)
    check('deux coups au même instant n’additionnent pas leurs arrêts',
      j.gelRestant === 100, `${j.gelRestant} ms — sinon une mêlée fige le jeu`)
  }

  {
    const j = new JeuMinimal(1000 / 60)
    j.secouer(6, 200)
    const points = []
    for (let i = 0; i < 20; i++) { points.push(j.decalage()); j.avancer() }
    check('la secousse décale la caméra de pixels ENTIERS',
      points.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)),
      'un tremblement en sous-pixel fait onduler toute la grille')
    check('et elle bouge vraiment',
      points.some((p) => p.x !== 0 || p.y !== 0),
      `pointe ${Math.max(...points.map((p) => Math.abs(p.x)))} px`)
    check('elle s’éteint franchement au lieu de traîner',
      j.secousse === 0 && j.decalage().x === 0 && j.decalage().y === 0,
      'une décroissance exponentielle laisse un demi-pixel pendant une seconde')
    // Reproductible : deux captures d'ecran de la meme partie doivent
    // coincider, sinon on ne peut rien comparer.
    const k = new JeuMinimal(1000 / 60)
    k.secouer(6, 200)
    const bis = []
    for (let i = 0; i < 20; i++) { bis.push(k.decalage()); k.avancer() }
    check('et la même secousse redonne les mêmes décalages',
      JSON.stringify(points) === JSON.stringify(bis),
      'deux captures d’écran de la même partie doivent coïncider')
  }

  {
    const j = new JeuMinimal(1000 / 60)
    j.secouer(2, 200)
    j.secouer(8, 100)
    check('le coup le plus fort l’emporte sur celui qui traîne',
      j.secousse > 7, `${j.secousse.toFixed(1)} px`)
  }
}

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
