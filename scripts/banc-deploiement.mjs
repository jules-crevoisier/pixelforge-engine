#!/usr/bin/env node
/**
 * Le banc du deploiement : l'application vit-elle sous les en-tetes de
 * production ?
 *
 * ## Pourquoi il ne suffit pas de lire les fichiers
 *
 * `banc:image` lit le Dockerfile et la politique de securite, et verifie
 * qu'ils se tiennent. C'est utile et ce n'est pas suffisant : une politique
 * peut etre coherente sur le papier et tuer l'application.
 *
 * Elle l'a fait. La premiere version interdisait `'unsafe-eval'` — ce qui
 * parait la bonne reponse — et l'atelier de scripts compile ce que la
 * personne ecrit avec `new Function`. En developpement, rien : le serveur de
 * Vite n'envoie aucune politique. En production, l'atelier serait mort, avec
 * un message parlant d'un script invalide.
 *
 * ## Ce que fait ce banc
 *
 * Il reconstruit EXACTEMENT le contenu que le Dockerfile copie, dans un
 * dossier a part — donc rien de ce qui traine ici ne peut le sauver —, le
 * sert avec les en-tetes lus dans `docker/security-headers.conf`, et fait
 * tourner l'application dedans.
 *
 * ## Un piege qui a failli le rendre inutile
 *
 * `page.evaluate` s'execute dans un monde ISOLE, que la politique de la page
 * ne regit pas : un `new Function` appele de la reussit meme quand la page
 * l'a interdit. Le premier essai declarait donc tout vert sous une politique
 * qui bloquait tout. On passe par un gestionnaire d'evenement pose par la
 * page, et l'on ecoute `securitypolicyviolation`.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdtempSync, cpSync, rmSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const bilan = []
const check = (nom, ok, detail = '') => {
  bilan.push({ nom, ok: !!ok })
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`)
}

console.log('--- on reconstruit ce que l\'image emporte, et rien d\'autre ---')

const dockerfile = readFileSync('Dockerfile', 'utf8')
const etapeBuild = dockerfile.slice(0, dockerfile.indexOf('FROM nginx'))
const copies = [...etapeBuild.matchAll(/^COPY\s+(.+?)\s+\S+\s*$/gm)].flatMap((m) => m[1].split(/\s+/))

const ctx = mkdtempSync(join(tmpdir(), 'pfe-image-'))
let manquants = []
for (const c of copies) {
  if (c.includes('*')) {
    const re = new RegExp(`^${c.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`)
    for (const f of readdirSync('.').filter((f) => re.test(f))) cpSync(f, join(ctx, f))
    continue
  }
  if (!existsSync(c)) { manquants.push(c); continue }
  cpSync(c, join(ctx, c), { recursive: true })
}
check('tout ce que le Dockerfile copie existe dans le depot',
  manquants.length === 0,
  manquants.length ? `introuvable(s) : ${manquants.join(', ')} — la construction de l’image echouerait`
    : `${copies.length} entrees`)

// Les dependances ne sont pas ce qu'on eprouve ici : on les prete au lieu de
// les reinstaller, ce qui ferait durer ce banc plusieurs minutes.
spawnSync('ln', ['-s', join(process.cwd(), 'node_modules'), join(ctx, 'node_modules')])

const construction = spawnSync('npm', ['run', 'build'], { cwd: ctx, encoding: 'utf8' })
check('et cela suffit a construire le site',
  construction.status === 0,
  construction.status === 0
    ? 'le contexte de l’image se construit seul'
    : (construction.stdout + construction.stderr).split('\n').filter(Boolean).slice(-3).join(' | '))
if (construction.status !== 0) { rmSync(ctx, { recursive: true, force: true }); conclure() }

console.log('\n--- puis on la sert avec les en-tetes de production ---')

const conf = readFileSync('docker/security-headers.conf', 'utf8')
const entetes = {}
for (const m of conf.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"/gm)) entetes[m[1]] = m[2]
check('les en-tetes se lisent depuis la configuration nginx elle-meme',
  Object.keys(entetes).length >= 4 && !!entetes['Content-Security-Policy'],
  Object.keys(entetes).join(', '))

const RACINE = join(ctx, 'dist')
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
}
const serveur = createServer((req, res) => {
  let p = join(RACINE, decodeURIComponent(req.url.split('?')[0]))
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(RACINE, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream', ...entetes })
  res.end(readFileSync(p))
})
const PORT = 5600 + Math.floor(Math.random() * 200)
await new Promise((r) => serveur.listen(PORT, r))

let navigateur = null
try {
  for (const d of readdirSync('/opt/pw-browsers')) {
    if (/^chromium-\d+$/.test(d)) { navigateur = `/opt/pw-browsers/${d}/chrome-linux/chrome`; break }
  }
} catch { /* installation locale */ }

const b = await chromium.launch(navigateur ? { executablePath: navigateur } : {})
const page = await b.newPage()
const erreurs = []
page.on('pageerror', (e) => erreurs.push(`page: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`console: ${m.text()}`) })

await page.addInitScript(() => {
  window.__violations = []
  document.addEventListener('securitypolicyviolation',
    (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`))
})
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

check('la politique arrive bien jusqu\'a la page',
  (await page.evaluate(async () => (await fetch('/')).headers.get('content-security-policy')))
    ?.includes("default-src 'self'"),
  'sans elle, tout ce qui suit ne mesurerait rien')
check('l\'application demarre sous cette politique',
  await page.evaluate(() => !!window.pfe),
  'c’est le minimum, et c’est deja plus que ce qu’un fichier lu peut dire')

/*
 * L'atelier de scripts, depuis la PAGE.
 *
 * `page.evaluate` vit dans un monde isole que la politique ne regit pas : un
 * appel fait de la reussit meme quand la page l'interdit. On passe donc par
 * un gestionnaire pose par la page elle-meme.
 */
await page.evaluate(() => {
  const bouton = document.createElement('button')
  bouton.id = 'pfe-essai-compilation'
  bouton.style.display = 'none'
  bouton.addEventListener('click', () => {
    try {
      window.__compile = new Function('a', 'return a + 1')(1) === 2 ? 'ok' : 'faux'
    } catch (e) { window.__compile = `REFUSE : ${e.message}` }
  })
  document.body.appendChild(bouton)
})
await page.evaluate(() => document.querySelector('#pfe-essai-compilation').click())
await page.waitForTimeout(200)
const compile = await page.evaluate(() => window.__compile)
check('l\'atelier de scripts peut compiler ce qu\'on lui ecrit',
  compile === 'ok',
  compile === 'ok'
    ? 'new Function autorise — c’est le metier de l’atelier'
    : String(compile))

const blob = await page.evaluate(() => {
  try {
    const u = URL.createObjectURL(new Blob(['x']))
    URL.revokeObjectURL(u)
    return 'ok'
  } catch (e) { return `REFUSE : ${e.message}` }
})
check('et un projet peut se telecharger', blob === 'ok', String(blob))

const violations = await page.evaluate(() => window.__violations)
check('aucune violation de la politique au demarrage',
  violations.length === 0,
  violations.length ? violations.join(' | ') : 'la page ne demande rien qu’elle n’ait le droit de faire')
check('aucune erreur de page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '))

await b.close()
serveur.close()
rmSync(ctx, { recursive: true, force: true })
conclure()

function conclure() {
  const rates = bilan.filter((q) => !q.ok)
  console.log(`\n${bilan.length - rates.length}/${bilan.length} verifications reussies`)
  process.exit(rates.length ? 1 : 0)
}
