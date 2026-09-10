#!/usr/bin/env node
/**
 * Le banc de l'image : ce que le Dockerfile copie suffit-il a construire ?
 *
 * ## Pourquoi ce banc existe
 *
 * Il existe a cause d'un autre depot. Sur l'editeur de sprites, dix
 * deploiements de suite ont echoue sur ce message :
 *
 *     Could not resolve entry module "demo.html".
 *
 * La page etait dans le depot, la construction passait en local, les tests
 * passaient, le typage passait. Elle manquait UNIQUEMENT dans l'image : le
 * Dockerfile copiait `index.html` nommement, et la page ajoutee ensuite
 * n'avait jamais ete ajoutee a cette ligne.
 *
 * C'est la pire categorie de defaut — celui qu'aucune verification locale ne
 * peut voir, parce que tout le monde travaille dans un dossier ou le fichier
 * EST la. Le seul endroit ou il se voit, c'est la production.
 *
 * Le moteur n'a qu'une page aujourd'hui. C'est exactement la situation d'ou
 * l'autre depot est parti.
 *
 * ## Ce qu'il verifie, et ce qu'il ne verifie pas
 *
 * Il lit le Dockerfile et le compare a l'arborescence. Pas de Docker, pas de
 * reseau, une demi-seconde : un banc qui demanderait Docker ne tournerait sur
 * la machine de personne, donc ne servirait a rien.
 *
 * Il ne construit pas l'image. Un `COPY src ./src` qui oublierait un dossier
 * frere de `src` lui echapperait — c'est pourquoi il verifie AUSSI qu'aucun
 * dossier de source n'a pousse a cote de ceux qui sont copies.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'

const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

const lire = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)

console.log('--- ce que le Dockerfile emporte ---')

const dockerfile = lire('Dockerfile')
check('le Dockerfile existe', dockerfile !== null,
  'sans lui, il n’y a rien a deployer')
if (!dockerfile) process.exit(1)

/* Les lignes COPY de l'etape de CONSTRUCTION seulement : celles de l'etape
 * finale copient depuis la premiere, et ne disent rien du depot. */
const etapeBuild = dockerfile.slice(0, dockerfile.indexOf('FROM nginx'))
const copies = [...etapeBuild.matchAll(/^COPY\s+(.+?)\s+\S+\s*$/gm)]
  .flatMap((m) => m[1].split(/\s+/))

check('l’etape de construction copie quelque chose', copies.length > 0, copies.join(' '))

/*
 * LES PAGES. C'est la regle qui a mordu.
 *
 * Une page peut etre copiee nommement ou par un motif. On accepte les deux,
 * mais on verifie que CHAQUE page du depot est couverte par l'un ou l'autre.
 */
const pages = readdirSync('.').filter((f) => f.endsWith('.html'))
const couvre = (f) => copies.some((c) => c === f
  || (c.includes('*') && new RegExp(`^${c.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(f)))
const oubliees = pages.filter((f) => !couvre(f))
check('chaque page du depot entre dans l’image',
  pages.length > 0 && oubliees.length === 0,
  oubliees.length ? `oubliee(s) : ${oubliees.join(', ')}`
    : `${pages.join(', ')} — couverte(s) par « ${copies.filter((c) => c.endsWith('.html')).join(' ')} »`)

/* Le revers : un motif, et non un nom. Un nom passerait ce banc aujourd'hui
 * et le ferait tomber le jour ou l'on ajoute une page — c'est-a-dire trop
 * tard, puisque le banc doit proteger CE jour-la. */
check('et les pages sont copiees par un motif, non une par une',
  copies.some((c) => c.endsWith('.html') && c.includes('*')),
  'nommer les pages fait echouer le deploiement le jour ou l’on en ajoute une, '
  + 'avec un message qui parle de rollup et jamais du Dockerfile')

/* Les fichiers dont la construction a besoin. */
for (const requis of ['package.json', 'package-lock.json', 'tsconfig.json']) {
  check(`« ${requis} » est copie`, copies.includes(requis),
    copies.includes(requis) ? '' : 'la construction en a besoin')
}

/* Les dossiers de source : aucun ne doit avoir pousse a cote sans etre copie. */
const dossiers = readdirSync('.')
  .filter((f) => statSync(f).isDirectory())
  .filter((f) => !['node_modules', 'dist', '.git', 'docs', 'scripts', 'docker', '.github'].includes(f))
const dossiersOublies = dossiers.filter((d) => !copies.includes(d))
check('aucun dossier de source n’a poussé à côté de ceux qu’on copie',
  dossiersOublies.length === 0,
  dossiersOublies.length ? `hors de l’image : ${dossiersOublies.join(', ')}`
    : `${dossiers.join(', ')} — tous copies`)

console.log('\n--- la configuration de service ---')

for (const f of ['docker/default.conf', 'docker/security-headers.conf',
  'docker-compose.yml', '.dockerignore']) {
  check(`« ${f} » existe`, existsSync(f))
}

const conf = lire('docker/default.conf') ?? ''
check('nginx ecoute sur un port non privilegie',
  /listen\s+8080;/.test(conf),
  'un port sous 1024 obligerait le conteneur a tourner en root')
check('et le Dockerfile expose CE port-la',
  /EXPOSE\s+8080/.test(dockerfile) && /USER\s+nginx/.test(dockerfile),
  'exposer un port et en servir un autre est une panne muette')
check('la sonde de sante existe des deux cotes',
  /location\s*=\s*\/healthz/.test(conf) && /healthz/.test(dockerfile),
  'sans elle, l’orchestrateur declare le service vivant avant qu’il ne serve')

const compose = lire('docker-compose.yml') ?? ''
check('le service ne publie aucun port sur l’hote',
  !/^\s*ports:/m.test(compose) && /^\s*expose:/m.test(compose),
  'Traefik joint le conteneur par le reseau interne ; publier un port invite un conflit')
check('et il rejoint le reseau que Dokploy fournit',
  /dokploy-network/.test(compose) && /external:\s*true/.test(compose))
check('le conteneur est en lecture seule, avec un tmpfs pour nginx',
  /read_only:\s*true/.test(compose) && /\/var\/cache\/nginx/.test(compose),
  'un site statique n’a rien a ecrire ; nginx, si — son pid et ses tampons')

/*
 * LA POLITIQUE DE SECURITE DOIT PERMETTRE CE QUE LE CODE FAIT.
 *
 * Une politique trop stricte ne casse rien en developpement — le serveur de
 * Vite ne l'envoie pas — et casse tout en production. C'est la deuxieme faute
 * de deploiement de ce projet, apres la page non copiee, et elle est de la
 * meme famille : invisible partout sauf la ou elle compte.
 *
 * On DEDUIT donc les besoins du code au lieu de les recopier a la main.
 */
const entetes = lire('docker/security-headers.conf') ?? ''
const csp = /Content-Security-Policy "([^"]+)"/.exec(entetes)?.[1] ?? ''
const directive = (nom) => (new RegExp(`${nom} ([^;]*)`).exec(csp)?.[1] ?? '').trim()

const sources = readdirSync('src', { recursive: true })
  .filter((f) => String(f).endsWith('.ts'))
  .map((f) => readFileSync(`src/${f}`, 'utf8'))
  .join('\n')

// `new Function` dans un commentaire ne compte pas : on cherche un APPEL.
const compileDuCode = /=\s*new Function\(|\bnew Function\([\s\S]{0,40}?['"`]/.test(sources)
check('la politique permet ce que l’atelier de scripts fait vraiment',
  !compileDuCode || directive('script-src').includes("'unsafe-eval'"),
  compileDuCode
    ? `l’atelier compile avec « new Function » ; script-src = « ${directive('script-src')} »`
    : 'aucune compilation dynamique dans les sources')
check('et elle ne permet rien de plus du côté des scripts',
  !directive('script-src').includes("'unsafe-inline'")
  && !directive('script-src').includes('http'),
  `script-src = « ${directive('script-src')} » — ni script en ligne, ni script distant`)

const faitDesBlobs = /createObjectURL/.test(sources)
check('les téléchargements par blob: sont permis',
  !faitDesBlobs || directive('img-src').includes('blob:'),
  faitDesBlobs ? `img-src = « ${directive('img-src')} »` : 'aucun blob dans les sources')

for (const [nom, attendu] of [['object-src', "'none'"], ['frame-ancestors', "'none'"],
  ['base-uri', "'self'"], ['default-src', "'self'"]]) {
  check(`« ${nom} » reste ferme`, directive(nom) === attendu,
    `${nom} = « ${directive(nom)} », attendu « ${attendu} »`)
}

const ignore = lire('.dockerignore') ?? ''
check('« node_modules » et « dist » restent hors du contexte',
  /^node_modules$/m.test(ignore) && /^dist$/m.test(ignore),
  'les envoyer au demon Docker ferait des centaines de megaoctets a chaque construction')

const rates = bilan.filter((b) => !b.ok)
console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
process.exit(rates.length ? 1 : 0)
