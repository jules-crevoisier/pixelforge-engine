#!/usr/bin/env node
/**
 * L'agent d'evaluation : il mesure, il compare au dernier passage, il reboucle.
 *
 * ## Pourquoi un agent, et pas une note
 *
 * Une note monte toute seule d'une iteration a l'autre : on ajoute du code, on
 * se sent avance, on ecrit 7/10 la ou l'on ecrivait 6. Elle ne se contredit
 * jamais, donc elle n'apprend rien. Ce que cet agent produit n'est pas une
 * note : c'est un ETAT, et la difference avec l'etat precedent.
 *
 * ## La regle qui fait toute sa valeur : il ne juge pas, il cherche des preuves
 *
 * Un critere n'est pas « tenu » parce que le code a l'air de le faire. Il est
 * tenu quand il existe des VERIFICATIONS qui deviendraient rouges si la chose
 * disparaissait, et que les symboles nommes existent dans les sources. Chaque
 * ligne du rapport est donc falsifiable : on peut aller lire les preuves, et
 * l'on peut les casser expres pour voir le critere tomber.
 *
 * C'est aussi ce qui rend le rebouclage utile. Une preuve qui DISPARAIT est
 * une regression que rien d'autre ne detecte : les bancs restent verts, le
 * build passe, et l'on a simplement cesse de verifier quelque chose. L'agent
 * rend 1 dans ce cas-la, exactement comme pour un banc rouge.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne mesure ni la beaute du code, ni le nombre de lignes, ni la couverture
 * au sens des outils. Ces trois chiffres montent quand on ecrit du code et ne
 * disent rien de ce que le projet SAIT FAIRE. La question posee ici est
 * l'unique question qui compte : peut-on refaire Celeste, Isaac, Dead Cells,
 * et peut-on le faire sans lire le moteur.
 *
 * Usage :
 *   node scripts/agent.mjs            — tout, fumee comprise
 *   node scripts/agent.mjs --rapide   — sans le navigateur
 *   node scripts/agent.mjs --ecrire   — met a jour docs/evaluation.{json,md}
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RACINE = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const args = new Set(process.argv.slice(2))
const rapide = args.has('--rapide')
const ecrire = args.has('--ecrire')

/* ------------------------------------------------------------------ */
/* 1. Les epreuves : on execute, on ne suppose pas                     */
/* ------------------------------------------------------------------ */

/**
 * Les bancs rendent leurs verifications ligne par ligne. On les collecte
 * TOUTES, avec leur nom, parce que le nom est la preuve : c'est lui qu'un
 * critere cite, et c'est sa disparition qui signale une regression.
 */
function lancer(nom, commande, arguments_) {
  const t = Date.now()
  const r = spawnSync(commande, arguments_, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const verifications = []
  for (const ligne of sortie.split('\n')) {
    const m = /^\s*(ok|ECHEC)\s+(.*?)(?:\s+—\s+.*)?$/.exec(ligne)
    if (m) verifications.push({ nom: m[2].trim(), ok: m[1] === 'ok' })
  }
  return {
    nom,
    code: r.status ?? -1,
    ms: Date.now() - t,
    verifications,
    reussies: verifications.filter((v) => v.ok).length,
    total: verifications.length,
    sortie,
  }
}

const epreuves = []
epreuves.push(lancer('build', 'npm', ['run', '-s', 'build']))
for (const b of ['banc', 'banc:plateforme', 'banc:mondes', 'banc:langages', 'banc:reseau',
  'banc:habillage', 'banc:charge', 'banc:image', 'banc:deploiement']) {
  epreuves.push(lancer(b, 'npm', ['run', '-s', b]))
}
/**
 * Ce qu'on a DELIBEREMENT saute, et qui n'est donc pas une regression.
 *
 * L'agent signalait « épreuve DISPARUE » pour la fumee des qu'on lui passait
 * `--rapide`, et sortait en erreur. C'est accuser a tort — le pire defaut
 * d'une mesure, celui qui la fait cesser d'etre lue. Un banc qu'on choisit de
 * ne pas lancer et un banc qui a disparu du depot ne sont pas la meme chose.
 */
const sautees = []
if (!rapide) epreuves.push(lancer('fumee', 'npm', ['run', '-s', 'fumee']))
else sautees.push('fumee')

const preuves = epreuves.flatMap((e) => e.verifications)
const nomsPreuves = preuves.map((v) => v.nom)
const rouges = preuves.filter((v) => !v.ok)
const epreuvesRatees = epreuves.filter((e) => e.code !== 0)

/* ------------------------------------------------------------------ */
/* 2. Les sondes : ce que les sources contiennent vraiment             */
/* ------------------------------------------------------------------ */

const sources = []
;(function parcourir(d) {
  for (const f of readdirSync(d)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue
    const chemin = join(d, f)
    if (statSync(chemin).isDirectory()) parcourir(chemin)
    else if (/\.(ts|mjs)$/.test(f)) sources.push(chemin)
  }
})(join(RACINE, 'src'))
for (const f of readdirSync(join(RACINE, 'scripts'))) {
  if (f.endsWith('.mjs')) sources.push(join(RACINE, 'scripts', f))
}
/*
 * Le deploiement fait partie du code.
 *
 * Il n'en faisait pas partie, et l'agent declarait donc « le code n'existe
 * pas » pour des criteres dont le code etait ecrit — dans le Dockerfile et
 * dans la configuration nginx. Un moteur qu'on ne peut pas mettre en ligne
 * n'est pas fini ; ce qui le met en ligne se mesure comme le reste.
 */
for (const f of ['Dockerfile', 'docker-compose.yml', 'docker-compose.local.yml',
  '.dockerignore', 'docker/default.conf', 'docker/security-headers.conf']) {
  if (existsSync(join(RACINE, f))) sources.push(join(RACINE, f))
}
const texte = new Map(sources.map((f) => [relative(RACINE, f), readFileSync(f, 'utf8')]))
/**
 * Le corpus, MOINS l'agent lui-meme.
 *
 * Sans ce retrait, un critere qui nomme le symbole `jouerSon` se declare tenu
 * parce que le mot `jouerSon` figure… dans la ligne du critere. La mesure se
 * satisfait de son propre enonce, ce qui est la plus complete des illusions :
 * elle passe au vert pour tout ce qu'on lui demande de chercher, et d'autant
 * mieux qu'on lui en demande davantage. Trouve en rebouclant.
 */
const MOI = relative(RACINE, new URL(import.meta.url).pathname)
const toutLeCode = [...texte].filter(([f]) => f !== MOI).map(([, c]) => c).join('\n')

const contient = (symbole) => toutLeCode.includes(symbole)

/* ------------------------------------------------------------------ */
/* 3. La grille : ce qu'il faut pour refaire ces jeux-la               */
/* ------------------------------------------------------------------ */

/**
 * Chaque critere porte :
 * - `symboles` : ce qui doit exister dans les sources ;
 * - `indices`  : des morceaux de noms de verifications, en minuscules et sans
 *                accents, qui prouvent que la chose est EPROUVEE ;
 * - `preuves`  : combien il en faut au minimum.
 *
 * Le seuil de preuves n'est pas decoratif. Une seule verification prouve que
 * la chose existe ; elle ne prouve pas qu'elle tient dans les cas limites.
 * Quand un critere en demande trois, c'est qu'il a trois versants — la regle
 * qui s'applique, la regle qui refuse, et le cas limite qui a deja mordu.
 */
/**
 * Les accents et les LIGATURES, tous les deux.
 *
 * La normalisation NFD separe l'accent de sa lettre, et il suffit de retirer
 * les diacritiques. Elle ne touche pas a « œ » ni a « æ », qui sont des
 * lettres a part entiere en Unicode — si bien qu'un critere cherchant « coeur »
 * ne trouvait pas la verification nommee « un cœur posé par une salle
 * dessinée ». L'agent declarait donc manquante une preuve correctement ecrite,
 * ce qui est le pire defaut d'une mesure : accuser a tort.
 */
const sansAccents = (s) => s
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0153/g, 'oe').replace(/\u00e6/g, 'ae')
  .toLowerCase()
const indexPreuves = nomsPreuves.map(sansAccents)

const OBJECTIFS = [
  {
    jeu: 'Celeste — plateforme de précision',
    criteres: [
      { nom: 'Contrôleur nerveux : coyote, tampon, hauteur variable',
        symboles: ['coyoteRestant', 'tamponRestant', 'coupureSaut'],
        indices: ['coyote', 'tampon', 'hauteur variable', 'relacher'], preuves: 4 },
      { nom: 'Dash directionnel, avec récupération',
        symboles: ['vitesseDash', 'recuperationDash'], indices: ['dash'], preuves: 2 },
      { nom: 'Saut mural et glissade',
        symboles: ['pousseeMur', 'blocageApresMur', 'vitesseGlissade'],
        indices: ['mur', 'paroi', 'glissade'], preuves: 3 },
      { nom: 'Correction de coin',
        symboles: ['corrigerCoin'], indices: ['coin'], preuves: 1 },
      { nom: 'Pointes, mort et point de reprise',
        symboles: ['BLESSANTE', 'reprise', 'reapparition'],
        indices: ['pointe', 'reprise', 'mort'], preuves: 3 },
      { nom: 'Plateformes à sens unique, et descente volontaire',
        symboles: ['plateformeArrete', 'traverseePlateforme'],
        indices: ['plateforme', 'passerelle'], preuves: 4 },
      { nom: 'Plateformes mobiles qui portent',
        symboles: ['CorpsMobiles', 'porter', 'passagersDe'],
        indices: ['plateforme mobile', 'passager', 'porteuse', 'dalle'], preuves: 3 },
      { nom: 'Les créatures contournent ce qui les bloque',
        symboles: ['ChampDeFlux', 'peutContourner', 'ligneLibre'],
        indices: ['contourne', 'champ', 'ligne de vue', 'coin de mur', 'escalier'], preuves: 6 },
      { nom: 'Et cette navigation ne coûte rien par ennemi de plus',
        symboles: ['casesVisitees'],
        indices: ['meme champ qu', 'champ partage', 'portee borne'], preuves: 3 },
      { nom: 'Un chapitre en TABLEAUX posés à la main, pas une grille',
        symboles: ['class Salles', 'chevauchements', 'salleIsolees', 'bornesDe'],
        indices: ['tableau', 'salle', 'chevauchent', 'atteindre'], preuves: 8 },
      { nom: 'La caméra s’arrête au bord du tableau, et y glisse',
        symboles: ['surSalle'],
        indices: ['camera a suivi', 'taille de la vue'], preuves: 2 },
      { nom: 'Mourir renvoie à l’entrée du tableau, pas au départ du chapitre',
        symboles: ['reprise()', 'MARGE_CHUTE'],
        indices: ['entree du tableau', 'hors du monde', 'coeurs'], preuves: 4 },
      { nom: 'Et le chapitre se grimpe vraiment, avec le vrai contrôleur',
        symboles: [], indices: ['gravit le chapitre', 'tableau suivant'], preuves: 2 },
      { nom: 'Niveaux vérifiés franchissables, pas seulement dessinés',
        symboles: ['portee'], indices: ['franchit', 'fosse', 'se remonte'], preuves: 3 },
    ],
  },
  {
    jeu: 'The Binding of Isaac — salles engendrées',
    criteres: [
      { nom: 'Plan d’étage reproductible depuis une graine',
        symboles: ['engendrerPlan', 'Hasard'], indices: ['graine', 'meme etage'], preuves: 2 },
      { nom: 'Rôles de salle : départ, boss, trésor, boutique',
        symboles: ['tresor', 'boutique', 'boss'], indices: ['boss', 'impasse'], preuves: 2 },
      { nom: 'Aucune salle injoignable, vérifié case par case',
        symboles: ['salleEn'], indices: ['injoignable', 'close'], preuves: 2 },
      { nom: 'Salles écrites à la main, tirées et retournées',
        symboles: ['ModeleSalle', 'verifierModele', 'croixLibre'],
        indices: ['dessinee', 'modele', 'croix des portes'], preuves: 5 },
      { nom: 'Caméra verrouillée sur la salle',
        symboles: ['cameraParSalle', 'dureeTransition'], indices: ['camera', 'salle'], preuves: 2 },
      { nom: 'Tirs, projectiles et ennemis qui annoncent',
        symboles: ['EtatEspece', 'declencheurs', 'projectile'],
        indices: ['tourelle', 'projectile', 'anticipation'], preuves: 4 },
      { nom: 'Ramassages et soin',
        symboles: ['soigne'], indices: ['coeur', 'ramasse'], preuves: 2 },
    ],
  },
  {
    jeu: 'Dead Cells — combat et corps',
    criteres: [
      { nom: 'Frappes à durée, poussée, invulnérabilité',
        symboles: ['invulnerabiliteMs', 'poussee'],
        indices: ['coup', 'invulnerab', 'frappe', 'impact'], preuves: 4 },
      { nom: 'Machines à états par espèce, déclencheurs sur l’image',
        symboles: ['etatInitial', 'avancerEtat', 'evenement'],
        indices: ['tourelle', 'anticipation', 'evenement'], preuves: 4 },
      { nom: 'Entités solides : caisses, obstacles mobiles',
        symboles: ['matiereCorps', 'grilleAvecCorps'],
        indices: ['corps solide', 'corps mobile', 'caisse'], preuves: 3 },
      { nom: 'Piétinement et rebond',
        symboles: ['degatsPietinement', 'rebondir'],
        indices: ['pietine', 'rebond', 'tete'], preuves: 4 },
      { nom: 'Pesanteur pour les créatures, en vue de côté',
        symboles: ['pesante', 'PESANTEUR_ENTITE'], indices: ['pesante'], preuves: 2 },
      { nom: 'Armes et portée réglées, pas devinées',
        symboles: ['portee', 'epaisseur'], indices: ['epee', 'portee', 'dos'], preuves: 3 },
    ],
  },
  {
    jeu: 'Faire un jeu sans lire le moteur',
    criteres: [
      { nom: 'Partir d’un projet vide',
        symboles: ['projetNeuf'], indices: ['projet neuf', 'nouveau', 'projet vide'], preuves: 3 },
      { nom: 'Redimensionner la carte, gérer les calques',
        symboles: ['redimensionnerProjet', 'ajouterCalqueProjet', 'retirerCalqueProjet'],
        indices: ['redimensionne', 'agrandir', 'reduire', 'calque'], preuves: 6 },
      { nom: 'Créer une espèce sans écrire de code',
        symboles: ['poserEspeceProjet'], indices: ['espece', 'typescript'], preuves: 3 },
      { nom: 'Poser et déplacer une entité à la souris',
        symboles: ['surDeplacement'], indices: ['entite', 'trainant', 'deplace'], preuves: 3 },
      { nom: 'Défaire et refaire, y compris sur les entités',
        symboles: ['Historique', 'differences'], indices: ['defai', 'refai', 'ctrl+z'], preuves: 3 },
      { nom: 'Un projet se ferme, se rouvre, se joue',
        symboles: ['mondeDepuisProjet', 'relireCarte'],
        indices: ['relu', 'revient', 'enregistr'], preuves: 6 },
      { nom: 'Une aide qui dit dans quel ordre s’y prendre',
        symboles: ['aideBoite'], indices: ['aide'], preuves: 2 },
      { nom: 'Export vers un moteur du commerce',
        symboles: ['paquetGodot', 'paquetUnity'], indices: ['godot', 'unity', 'archive'], preuves: 2 },
    ],
  },
  {
    jeu: 'Le multijoueur, et ce qu’il exige d’abord',
    criteres: [
      { nom: 'Simulation à pas fixe, hasard reproductible',
        symboles: ['class Boucle', 'class Hasard'], indices: ['pas fixe', 'graine', 'rattrapage'], preuves: 2 },
      { nom: 'Entrées déterministes : aucune horloge murale dans la simulation',
        symboles: [],
        interdits: [{ fichier: 'src/runtime/entree.ts', motif: 'performance.now' }],
        indices: ['entree', 'appui'], preuves: 2 },
      { nom: 'Instantané et rejeu de l’état d’un pas',
        symboles: ['instantane', 'restaurer', 'SimulationJeu'],
        indices: ['instantane', 'rejou', 'rembobin', 'bande'], preuves: 5 },
      { nom: 'Transport réseau, avec latence, gigue et pertes',
        symboles: ['LienLocal', 'redondance'],
        indices: ['latence', 'pertes', 'lien'], preuves: 3 },
      { nom: 'Le vrai moteur se rembobine, pas seulement un jouet',
        symboles: ['SimulationJeu', 'prendreScene', 'rendreScene'],
        indices: ['vrai moteur', 'vrai jeu'], preuves: 3 },
      { nom: 'Plusieurs personnages dirigeables, chacun ses touches',
        symboles: ['entreesDe'], indices: ['personnages', 'touches'], preuves: 2 },
    ],
  },
  {
    jeu: 'Le déployer sans que ça casse en production',
    criteres: [
      { nom: 'Une image qui ne contient que ce qu’elle sert',
        symboles: ['FROM nginx', 'USER nginx', 'read_only'],
        indices: ['image', 'dockerfile', 'lecture seule', 'port non privilegie'], preuves: 4 },
      { nom: 'Toute page du dépôt entre dans l’image, sans qu’on la nomme',
        symboles: ['COPY *.html'],
        indices: ['page du depot', 'motif'], preuves: 2 },
      { nom: 'L’application vit sous les en-têtes réels, pas seulement en local',
        symboles: ['securitypolicyviolation', 'Content-Security-Policy'],
        indices: ['politique', 'atelier de scripts peut compiler', 'en-tetes de production'], preuves: 4 },
      { nom: 'Le fond défile moins vite que le sol, et on l’a mesuré',
        symboles: ['decalageParallaxe', 'parallaxe', 'repete'],
        indices: ['parallaxe', 'fond lointain', 'repete', 'profondeur'], preuves: 6 },
    ],
  },
  {
    jeu: 'Ce qu’on affirme sans l’avoir mesuré',
    criteres: [
      { nom: 'La cadence est mesurée, pas promise',
        symboles: ['BUDGET_MS', 'mesurer'],
        indices: ['budget', 'creatures tiennent', 'image entiere'], preuves: 3 },
      { nom: 'Le coût croît linéairement avec le nombre d’entités',
        symboles: ['PART_SIMULATION'], indices: ['proportionnellement'], preuves: 1 },
      { nom: 'Un rembobinage tient dans une image',
        symboles: [], indices: ['instantane coute', 'rembobinage de seize'], preuves: 2 },
      { nom: 'Un étage s’engendre sans attente',
        symboles: [], indices: ['etage s’engendre'], preuves: 1 },
    ],
  },
  {
    jeu: 'Ce qu’un jeu de plateforme doit avoir',
    criteres: [
      { nom: 'Des pentes qu’on monte en marchant',
        symboles: ['PENTE_DROITE', 'sommetPente', 'hauteurSol'],
        indices: ['pente', 'cote en marchant', 'cote en la suivant'], preuves: 5 },
      { nom: 'Des demi-pentes : deux cases pour monter d’une',
        symboles: ['PENTE_DEMI', 'PENTE_HAUTE', 'FORMES_PENTE_NOMMEES'],
        indices: ['demi-pente', 'demi-pentes', 'miroir', 'pas est regulier'], preuves: 5 },
      { nom: 'On ne décolle pas pour une marche d’un pixel',
        symboles: ['collerAuSol'],
        indices: ['quitte jamais le sol', 'au-dessus du vide'], preuves: 2 },
      { nom: 'Une matière survit à l’écriture en un caractère',
        symboles: ['matiereEnCaractere', 'caractereEnMatiere', 'ALPHABET'],
        indices: ['un caractere', 'aller-retour en un caractere', 'ecrivent jamais pareil',
          'survit a l’enregistrement', 'sans une ligne de migration'], preuves: 5 },
      { nom: 'Et les six portages lisent la même collision',
        symboles: ['matiereDeCase', 'matiere_du_caractere', 'hauteur_sol'],
        indices: ['dit solide exactement', 'meme hauteur', 'decode chaque caractere'], preuves: 5 },
      { nom: 'Le hit-stop : un coup qui porte au lieu de traverser',
        symboles: ['geler', 'gelRestant'], indices: ['gel', 'hit-stop'], preuves: 2 },
      { nom: 'Une secousse de caméra entière et reproductible',
        symboles: ['secouer', 'decalageSecousse'], indices: ['secousse', 'secoue'], preuves: 2 },
      { nom: 'Manette, tactile et touches remappables',
        symboles: ['lireManettes', 'brancherTactile', 'planCourant'],
        indices: ['manette', 'tactile', 'remappable', 'plan de touches'], preuves: 3 },
      { nom: 'L’art dessiné ailleurs entre dans le projet',
        symboles: ['plancheDepuisImage', 'plancheDepuisSprite', 'echelleDe', 'ajouterPlancheProjet'],
        indices: ['importe', 'import', 'aplatis', 'echelle', 'quantifier'], preuves: 8 },
      { nom: 'Peindre autrement que case par case',
        symboles: ['type Trace', 'remplir(', 'valeurSous'],
        indices: ['rectangle', 'remplissage', 'remplir', 'faufile'], preuves: 6 },
      { nom: 'Et découper un niveau en tableaux, à la souris',
        symboles: ['surSalle', 'salleEn(', 'blocSalles', 'reglerSalleProjet'],
        indices: ['outil « salle »', 'tableau en tirant', 'recouvrent'], preuves: 4 },
      { nom: 'Dessiner, monter et régler dans l’éditeur',
        symboles: ['blocDessin', 'blocAnimations', 'blocSons'],
        indices: ['atelier de dessin', 'peint des pixels', 'image a une animation',
          'regle un son', 'couleur a la planche'], preuves: 5 },
    ],
  },
  {
    jeu: 'Ce qu’un jeu a en plus de son gameplay',
    criteres: [
      { nom: 'Une fonte de pixels, accents français compris',
        symboles: ['LARGEUR_GLYPHE', 'couper', 'pixelsDe'],
        indices: ['fonte', 'glyphe', 'ascii', 'francais'], preuves: 4 },
      { nom: 'Son : décrit en données, attaché aux événements d’animation',
        symboles: ['Sonneur', 'rendre', 'evenement'],
        indices: ['son', 'bruit', 'enveloppe', 'onde'], preuves: 5 },
      { nom: 'Et un son ne se rejoue pas quand le réseau rembobine',
        symboles: ['oublierAvant'], indices: ['rejoue'], preuves: 1 },
      { nom: 'Particules et effets',
        symboles: ['Particules', 'emettre'], indices: ['particule', 'gerbe'], preuves: 4 },
      { nom: 'Dialogue : frappe, coupure, choix',
        symboles: ['Dialogue', 'replique', 'lignesVisibles'],
        indices: ['dialogue', 'replique', 'texte'], preuves: 5 },
      { nom: 'Sauvegarde de la PARTIE, distincte du projet',
        symboles: ['Sauvegarde', 'VERSION_SAUVEGARDE', 'partieNeuve'],
        indices: ['partie', 'sauvegarde', 'emplacement'], preuves: 5 },
      { nom: 'Et tout cela traverse l’enregistrement du projet',
        symboles: ['sons: Son[]', 'dialogues:'],
        indices: ['sons partent', 'dialogues aussi', 'texte du jeu'], preuves: 3 },
      { nom: 'Menus : curseur qui boucle, entrées inertes',
        symboles: ['Menu', 'entree'], indices: ['menu', 'pause', 'curseur'], preuves: 4 },
      { nom: 'Musique écrite en notes, pas en fichier d’onde',
        symboles: ['rendreMusique', 'frequenceDe', 'class Musicien'],
        indices: ['musique', 'note', 'hertz', 'octave', 'temps a 120'], preuves: 6 },
      { nom: 'Et l’export la donne en .wav, que tout moteur sait lire',
        symboles: ['encoderWav', 'RIFF'],
        indices: ['wav', 'riff', 'ecrete', 'seize bits'], preuves: 4 },
      { nom: 'Traduction : une clef par texte, et ce qui manque se VOIT',
        symboles: ['class Traduction', 'manquantes', 'trous'],
        indices: ['traduit', 'traduction', 'langue', 'clef', 'substitution'], preuves: 6 },
      { nom: 'Aucun libellé du jeu n’est écrit en clair dans le code',
        symboles: [], indices: ['en clair'], preuves: 1 },
      { nom: 'Les six portages retrouvent musiques et textes, à l’identique',
        symboles: ['musiques: Musique[]', 'textes: Record<string, Record<string, string>>'],
        indices: ['convertit chaque note', 'rend la clef', 'survit a enregistrer'], preuves: 6 },
    ],
  },
]

/**
 * Un indice se compare au MOT, pas a la sous-chaine.
 *
 * En sous-chaine, l'indice « son » se retrouve dans « raison », « poisson »,
 * « moisson » ; « mur » dans « murale » ; « coup » dans « coupure ». Trente et
 * une preuves apparaissaient ainsi pour un critere qui n'en avait aucune. Une
 * mesure trop indulgente est pire qu'une mesure absente : elle rassure.
 *
 * Le bord de mot suffit ici et l'on garde l'inclusion de PREFIXE — « defai »
 * doit attraper « defait » et « defaire », et un indice ecrit exprès comme un
 * radical dit clairement ce qu'il cherche.
 */
const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const correspond = (nom, indice) => new RegExp(`\\b${echappe(indice)}`).test(nom)

function evaluer(c) {
  const manquants = c.symboles.filter((s) => !contient(s))
  // Un critere peut aussi exiger une ABSENCE. « Les entrees ne lisent pas
  // l'horloge murale » ne se prouve pas en cherchant un symbole : la seule
  // formulation exacte est « ce motif n'apparait pas dans ce fichier ». Un
  // critere qu'on ne peut enoncer qu'en negatif reste un critere.
  for (const i of c.interdits ?? []) {
    const source = texte.get(i.fichier)
    if (source === undefined) { manquants.push(`fichier absent : ${i.fichier}`); continue }
    // Sans les commentaires. Une sonde qu'un commentaire fait basculer punit
    // la documentation : expliquer ce qu'on a retire du code suffirait alors a
    // faire croire que c'est encore la.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (code.includes(i.motif)) manquants.push(`« ${i.motif} » subsiste dans ${i.fichier}`)
  }
  const trouvees = new Set()
  for (const i of c.indices) {
    const cle = sansAccents(i)
    indexPreuves.forEach((n, k) => { if (correspond(n, cle)) trouvees.add(nomsPreuves[k]) })
  }
  const rougesIci = [...trouvees].filter((n) => preuves.some((v) => v.nom === n && !v.ok))
  const tenu = manquants.length === 0 && trouvees.size >= c.preuves && rougesIci.length === 0
  return {
    nom: c.nom,
    tenu,
    preuves: trouvees.size,
    attendues: c.preuves,
    manquants,
    rouges: rougesIci,
    // Ce qui manque, en une phrase utilisable telle quelle.
    raison: manquants.length
      ? `symbole absent : ${manquants.join(', ')}`
      : rougesIci.length
        ? `vérification rouge : ${rougesIci[0]}`
        : trouvees.size < c.preuves
          ? `${trouvees.size} preuve(s) sur ${c.preuves} — il en manque ${c.preuves - trouvees.size}`
          : '',
  }
}

const bilan = OBJECTIFS.map((o) => {
  const criteres = o.criteres.map(evaluer)
  return {
    jeu: o.jeu,
    criteres,
    tenus: criteres.filter((c) => c.tenu).length,
    total: criteres.length,
  }
})

/* ------------------------------------------------------------------ */
/* 4. Le rebouclage : ce qui a bouge depuis le dernier passage         */
/* ------------------------------------------------------------------ */

const CHEMIN_ETAT = join(RACINE, 'docs', 'evaluation.json')
const precedent = existsSync(CHEMIN_ETAT)
  ? JSON.parse(readFileSync(CHEMIN_ETAT, 'utf8'))
  : null

const etat = {
  date: new Date().toISOString().slice(0, 10),
  epreuves: epreuves.map((e) => ({
    nom: e.nom, code: e.code, reussies: e.reussies, total: e.total,
    // Les noms sont ranges PAR EPREUVE : c'est ce qui permet de ne comparer
    // que ce qui a tourne des deux cotes. Voir le rebouclage, plus bas.
    noms: e.verifications.map((v) => v.nom),
  })),
  verifications: nomsPreuves.length,
  bilan: bilan.map((b) => ({
    jeu: b.jeu, tenus: b.tenus, total: b.total,
    criteres: b.criteres.map((c) => ({ nom: c.nom, tenu: c.tenu, preuves: c.preuves })),
  })),
  // Les noms des verifications, tries : c'est le vrai etat. Une preuve qui
  // disparait est une regression que rien d'autre ne detecte.
  noms: [...nomsPreuves].sort(),
}

const mouvements = []
if (precedent) {
  /*
   * On ne compare QUE les epreuves qui ont tourne des deux cotes.
   *
   * Sans cette restriction, un passage `--rapide` compare une execution sans
   * navigateur a une execution complete, et annonce cinquante-cinq
   * verifications disparues. Un agent qui crie au loup une fois sur deux cesse
   * d'etre lu — et c'est alors qu'il manque la vraie regression. Trouve en
   * rebouclant, du premier coup.
   */
  const communes = new Set(
    (precedent.epreuves ?? []).map((e) => e.nom).filter((n) => epreuves.some((e) => e.nom === n)),
  )
  // Une epreuve PERDUE et une epreuve AJOUTEE ne se valent pas. Perdue, on ne
  // sait plus rien de ce qu'elle couvrait et l'on ne peut plus comparer les
  // criteres. Ajoutee, on en sait davantage — il n'y a aucune raison de
  // refuser la comparaison, et refuser rendrait le premier passage suivant
  // muet a chaque fois qu'on ecrit un banc de plus.
  const perduesEpreuves = (precedent.epreuves ?? []).map((e) => e.nom)
    .filter((n) => !epreuves.some((e) => e.nom === n) && !sautees.includes(n))
  const neuvesEpreuves = epreuves.map((e) => e.nom)
    .filter((n) => !(precedent.epreuves ?? []).some((e) => e.nom === n))
  if (neuvesEpreuves.length) {
    mouvements.push({
      genre: 'neuf', quoi: `épreuve nouvelle : ${neuvesEpreuves.join(', ')}`, detail: [],
    })
  }
  if (perduesEpreuves.length) {
    mouvements.push({
      genre: 'perdu',
      quoi: `épreuve DISPARUE, plus rien n’en est comparé : ${perduesEpreuves.join(', ')}`,
      detail: [],
    })
  }
  // Les criteres ne se comparent pas non plus quand on a saute une epreuve :
  // ce qu'elle prouvait manque, et un critere tomberait sans avoir bouge.
  const ignorees = [...perduesEpreuves, ...sautees.filter(
    (n) => (precedent.epreuves ?? []).some((e) => e.nom === n),
  )]
  const nomsDe = (source) => new Set(
    (source.epreuves ?? []).filter((e) => communes.has(e.nom)).flatMap((e) => e.noms ?? []),
  )
  const avant = nomsDe(precedent)
  const apres = nomsDe(etat)
  const perdues = [...avant].filter((n) => !apres.has(n))
  const gagnees = [...apres].filter((n) => !avant.has(n))
  if (gagnees.length) mouvements.push({ genre: 'gagne', quoi: `${gagnees.length} vérification(s) de plus`, detail: gagnees.slice(0, 6) })
  if (perdues.length) mouvements.push({ genre: 'perdu', quoi: `${perdues.length} vérification(s) ont DISPARU`, detail: perdues.slice(0, 6) })
  /*
   * Les criteres ne se comparent que si les DEUX passages ont tout execute.
   *
   * Un critere dont les preuves vivent dans la fumee ne peut pas etre evalue
   * sans navigateur : il tombe, et l'agent annonce une regression qui n'existe
   * pas. Plutot que de rattraper au cas par cas, on refuse la comparaison —
   * une mesure qui sait dire « je ne sais pas » vaut mieux qu'une mesure qui
   * repond toujours.
   */
  if (ignorees.length) {
    mouvements.push({
      genre: 'neuf',
      quoi: 'passage incomplet : les critères ne sont pas comparés au dernier relevé',
      detail: ['relancez sans --rapide pour savoir ce qui a bougé'],
    })
  } else {
    const avantCriteres = new Map()
    for (const b of precedent.bilan ?? []) for (const c of b.criteres) avantCriteres.set(c.nom, c.tenu)
    for (const b of bilan) {
      for (const c of b.criteres) {
        const a = avantCriteres.get(c.nom)
        if (a === undefined) mouvements.push({ genre: 'neuf', quoi: `critère nouveau : ${c.nom}`, detail: [] })
        else if (a && !c.tenu) mouvements.push({ genre: 'perdu', quoi: `critère PERDU : ${c.nom}`, detail: [c.raison] })
        else if (!a && c.tenu) mouvements.push({ genre: 'gagne', quoi: `critère tenu : ${c.nom}`, detail: [] })
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 5. Le rapport                                                       */
/* ------------------------------------------------------------------ */

const lignes = []
const dire = (s = '') => { lignes.push(s); console.log(s) }

dire('')
dire('╭─ AGENT D’ÉVALUATION ────────────────────────────────────────────')
dire(`│ ${etat.date}${precedent ? ` · dernier passage ${precedent.date}` : ' · premier passage'}`)
dire('╰─────────────────────────────────────────────────────────────────')
dire('')
dire('LES ÉPREUVES')
for (const e of epreuves) {
  const etatE = e.code === 0 ? 'vert ' : 'ROUGE'
  const compte = e.total ? `${e.reussies}/${e.total}` : '—'
  dire(`  ${etatE}  ${e.nom.padEnd(16)} ${compte.padStart(9)}  ${(e.ms / 1000).toFixed(1)} s`)
}
dire(`  ${nomsPreuves.length} vérifications au total, ${rouges.length} rouge(s)`)

dire('')
dire('CE QUE LE PROJET SAIT FAIRE')
dire('  Un critère n’est tenu que s’il existe des vérifications qui tomberaient')
dire('  sans lui. C’est pourquoi il se lit « n preuves » et non « fait ».')
for (const b of bilan) {
  dire('')
  dire(`  ${b.jeu} — ${b.tenus}/${b.total}`)
  for (const c of b.criteres) {
    const marque = c.tenu ? '✓' : '·'
    const detail = c.tenu ? `${c.preuves} preuves` : c.raison
    dire(`    ${marque} ${c.nom.padEnd(52)} ${detail}`)
  }
}

const manquants = bilan.flatMap((b) => b.criteres.filter((c) => !c.tenu).map((c) => ({ ...c, jeu: b.jeu })))

dire('')
dire('CE QU’IL RESTE À FAIRE, DANS L’ORDRE')
if (manquants.length === 0) {
  dire('  Rien de la grille. C’est le moment d’élargir la grille, pas de se féliciter :')
  dire('  une grille entièrement verte ne mesure plus rien.')
} else {
  // Un symbole absent est du travail ; une preuve manquante est une
  // verification a ecrire. Les deux ne coutent pas pareil, et les melanger
  // ferait commencer par le moins utile.
  const aEcrire = manquants.filter((c) => c.manquants.length === 0)
  const aFaire = manquants.filter((c) => c.manquants.length > 0)
  if (aFaire.length) {
    dire('  À CONSTRUIRE — le code n’existe pas :')
    for (const c of aFaire) dire(`    · ${c.nom} (${c.jeu.split(' —')[0]}) — ${c.raison}`)
  }
  if (aEcrire.length) {
    dire('  À ÉPROUVER — le code existe, la preuve manque :')
    for (const c of aEcrire) dire(`    · ${c.nom} (${c.jeu.split(' —')[0]}) — ${c.raison}`)
  }
}

dire('')
dire('CE QUI A BOUGÉ')
if (!precedent) {
  dire('  Premier passage : rien à comparer. Le prochain dira ce qui a changé.')
} else if (mouvements.length === 0) {
  dire('  Rien. Ni gagné, ni perdu.')
} else {
  for (const m of mouvements) {
    const signe = m.genre === 'perdu' ? '↓' : (m.genre === 'gagne' ? '↑' : '+')
    dire(`  ${signe} ${m.quoi}`)
    for (const d of m.detail) dire(`      ${d}`)
  }
}

const regressions = mouvements.filter((m) => m.genre === 'perdu')
dire('')
if (epreuvesRatees.length) {
  dire(`VERDICT : ${epreuvesRatees.length} épreuve(s) rouge(s) — ${epreuvesRatees.map((e) => e.nom).join(', ')}`)
} else if (regressions.length) {
  dire(`VERDICT : vert, mais ${regressions.length} régression(s) de couverture. Une preuve qui disparaît`)
  dire('          ne fait rien échouer : c’est exactement pourquoi elle se signale ici.')
} else {
  const tenus = bilan.reduce((s, b) => s + b.tenus, 0)
  const total = bilan.reduce((s, b) => s + b.total, 0)
  dire(`VERDICT : tout est vert · ${tenus}/${total} critères tenus · ${nomsPreuves.length} vérifications`)
}
dire('')

if (ecrire && rapide) {
  // Ecrire un releve partiel par-dessus un releve complet ferait passer, au
  // passage suivant, cinquante verifications pour « gagnees » et le releve de
  // reference pour un etat qu'il n'a jamais eu. Le releve est tout ou rien.
  console.log('refus : --ecrire demande un passage complet. Relancez sans --rapide.')
  process.exit(1)
}

if (ecrire) {
  writeFileSync(CHEMIN_ETAT, `${JSON.stringify(etat, null, 2)}\n`)
  const md = [
    '# Évaluation',
    '',
    '<!-- Écrit par `npm run agent -- --ecrire`. Ne pas modifier à la main :',
    '     ce fichier est un relevé, pas un document. -->',
    '',
    '```',
    ...lignes,
    '```',
    '',
  ].join('\n')
  writeFileSync(join(RACINE, 'docs', 'evaluation.md'), md)
  console.log(`écrit : docs/evaluation.json et docs/evaluation.md`)
}

process.exit(epreuvesRatees.length || regressions.length ? 1 : 0)
