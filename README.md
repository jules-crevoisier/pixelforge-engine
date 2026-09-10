# PixelForge Engine

Un éditeur de jeux 2D **fait pour le pixel art**, de bout en bout.

Ce n'est pas un moteur généraliste avec un mode pixel art. C'est l'inverse : la
grille de pixels est le contrat de base, et tout le reste s'y plie.

## Quatre mondes, un seul moteur

|  |  |
| --- | --- |
| **Donjon** — orthogonale, vue de dessus | **Caverne** — orthogonale, vue de côté |
| ![Le donjon](docs/donjon.png) | ![La caverne](docs/caverne.png) |
| **Étage engendré** — salles, caméra verrouillée | |
| ![L'étage engendré](docs/etage.png) | |

![La citadelle isométrique](docs/citadelle.png)

Les quatre se choisissent dans la barre de l'éditeur et se jouent tout de suite.
Ils partagent **tout** ce qui compte : la même grille carrée de seize pixels, le
même moteur de collision, le même héros, le même contrat de pixel. Ce qui les
sépare tient en trois déclarations — une projection, un script, une planche de
dessins.

C'est délibéré. Une carte isométrique n'est pas une autre géométrie : c'est la
même grille carrée, regardée de biais. Faire vivre le gameplay dans le losange
obligerait à réécrire les collisions, la poursuite, la distance — et à les
réécrire une deuxième fois pour l'hexagone. Le monde reste donc carré, et la
projection n'intervient qu'au **dessin** et au **clic**.

Ce que ça achète, mode par mode :

- **Vue de dessus** — la diagonale est normalisée, le tri se fait par `y`.
- **Vue de côté** — le contrôleur de plateforme complet : coyote time, tampon de
  saut, hauteur variable, correction de coin, apex flottant, glissade et saut
  muraux, dash. Le puits du niveau se remonte en sautant d'une paroi à l'autre,
  et le banc le **prouve** en le rejouant avec le vrai contrôleur. Les pointes
  tuent en un coup, on repart à la dernière balise, et les passerelles se
  traversent par en dessous.
- **Isométrique** — les losanges 2:1 pavent le plan sans un pixel de fond
  visible, le clic vise le bon losange jusqu'aux bords, et tuiles et personnages
  sont mêlés dans un seul tri : un mur passe devant ou derrière le héros selon
  sa case, et la réponse change à chaque pas.
- **Salles engendrées** — un étage à la Isaac, tiré d'une graine : le boss au
  cul-de-sac le plus loin du départ, le trésor dans une autre impasse, et la
  caméra verrouillée sur la salle — on ne voit la suivante qu'en y entrant. Des
  créatures, une épée, cinq cœurs, et de quoi mourir.

### L'étage engendré, en détail

La règle qui fait tout tient en une ligne : **une salle candidate est refusée
si elle touche déjà plus d'une salle placée.** Sans elle, les salles se collent
en pavé, il n'y a plus ni branche ni cul-de-sac, donc plus rien à découvrir et
nulle part où mettre un trésor. Le banc le mesure : 5 impasses par étage avec
la règle, 0 pour un pavé.

Les obstacles évitent deux bandes — celle des portes horizontales, celle des
portes verticales — qui forment une croix libre au milieu de chaque salle et
relient à elles seules les quatre portes possibles. Aucun tirage ne peut donc
condamner une salle. L'alternative — poser au hasard, vérifier, recommencer —
est séduisante et mauvaise : elle rend le temps de génération imprévisible, et
elle ne garantit rien tant qu'on n'a pas borné le nombre d'essais. Une règle
qui rend la faute **impossible** vaut mieux qu'une règle qui la rattrape.

Et la vérification qui compte n'est pas sur le plan : elle marche **case par
case sur la vraie grille de tuiles**, depuis le départ, et exige d'atteindre le
centre de chaque salle. 60 étages, 720 salles, aucune injoignable. Un plan peut
être parfait et l'assemblage condamner une porte.

### Le combat, et les deux règles qui le tiennent

**Un coup ne touche qu'une fois par cible.** Une frappe dure : le geste occupe
120 ms, soit six images. Si la boîte blessait à chaque image, un coup d'épée
ferait six fois les dégâts, et la difficulté du jeu dépendrait du taux de
rafraîchissement. Le banc oppose les deux versions : 1 impact contre 7.

**Être touché rend invulnérable un instant.** Six dixièmes pour le joueur — de
quoi voir ce qui l'a atteint et sortir du danger. Deux dixièmes pour un ennemi —
de quoi ne pas mourir en une image, sans que l'épée ait l'air molle. Le même
nombre pour les deux donne un jeu où l'un des deux camps se joue mal.

Les deux règles se ressemblent et ne se remplacent pas : la première protège
d'un même coup, la seconde de deux coups différents.

La boîte de l'épée part du **corps** et s'étend vers l'avant. Une première
version la posait, carrée, à dix-huit pixels devant : elle ratait tout ce qui
était collé au personnage — c'est-à-dire exactement ce qui venait de le blesser.
Quatre vérifications gardent ce cas : collée devant, à bout de portée, au-dessus,
en dessous ; et une cinquième exige qu'elle ne touche pas dans le dos.

Une créature au-delà de 340 pixels ne fait rien. Ce n'est pas une optimisation,
c'est une règle de jeu : sans elle, les vingt-deux créatures de l'étage
convergent dès la première seconde et le joueur les affronte toutes dans le
couloir de départ.

## Ce qu'une case FAIT, et pas seulement ce qu'elle montre

La grille de collision ne disait qu'une chose : ça bloque, ou ça ne bloque pas.
Avec ce seul bit on ne peut écrire ni une pointe, ni une plateforme qu'on
traverse par en dessous, ni une échelle, ni de l'eau — c'est-à-dire qu'on ne
peut faire ni Celeste, ni Dead Cells, ni la moitié d'un Isaac.

Une case porte maintenant des **drapeaux** : `Solide`, `Plateforme`,
`Blessante`, `Échelle`, `Liquide`. Des drapeaux et non un type unique, parce
qu'une pointe peut être solide et de l'eau peut blesser : un type obligerait à
inventer « solide-et-blessant », puis « solide-et-blessant-et-liquide ». Ils se
peignent avec l'outil **Collision**, en cases à cocher.

### La plateforme, et la règle qui n'est pas celle qu'on croit

Une plateforme ne bloque **que** si le bas du corps arrive pile sur le haut de
la case. On écrit d'abord « elle bloque ce qui descend », et c'est faux : un
corps déjà engagé dedans, parce qu'il a sauté par en dessous, s'y retrouve pris
à l'instant où il redescend. Il faut le **croisement du bord**, pas la
direction. Le banc garde ce cas précis.

### Mourir, et repartir

Une pointe blesse par une frappe ordinaire, du camp `decor` — qui n'appartient
à personne, et pique donc le héros comme la créature qui marche dessus. Traiter
les pièges comme un second mécanisme aurait demandé de réécrire les images
d'invulnérabilité une deuxième fois.

La mort mène à une **réapparition**, six dixièmes de seconde plus tard, au
dernier point de reprise — et l'on repart invulnérable un instant, sans quoi
renaître dans la pointe qui vient de tuer recommence la mort à l'image suivante.
Le point de reprise se déplace en touchant une **balise**, qui est une entité
comme les autres : une valeur dans sa description la distingue d'un cœur.

## Les entités sont des données

![L'outil Entité et sa palette](docs/entites.png)

L'outil **Entité** montre les espèces du projet en vignettes ; on clique pour
poser, clic droit pour retirer. L'outil **Tuile** fait de même avec la planche,
pour les cas où l'autotiling ne sait pas deviner.

Poser une créature, c'est **ajouter un nœud à la scène**. Rien d'autre. Le
peuplement s'accorde tout seul au pas suivant — on peut donc éditer pendant que
le jeu tourne. Et comme c'est un nœud, ça part dans le fichier de projet avec
tout le reste.

Une espèce est entièrement en données : sa vie, sa vitesse, ses dégâts, sa
boîte, ce qu'elle rend quand on la ramasse, et son **intention** sous forme de
nom — `immobile`, `patrouille`, `poursuite`, `bond`, `joueur`, `plateformeur`.
Un fichier ne peut pas contenir de fonction ; un nom, si, et il se porte dans
les six langages.

Le **héros en est une**, et ce n'est pas une coquetterie : tant qu'il naissait
d'un appel de fonction, un projet relu n'avait personne à diriger. Maintenant un
étage enregistré se rouvre avec ses vingt-trois entités, elles bougent encore,
et l'on peut y jouer. C'est ce que le banc vérifie, sans navigateur.

### Défaire, et pourquoi on enregistre la différence

On pourrait enregistrer « pinceau de terrain en 12,7 » et rejouer l'inverse.
C'est plus économe, et c'est un piège : poser du terrain repeint aussi les huit
voisins, met à jour la collision, et un jour fera autre chose encore. Chaque
nouvelle conséquence devrait être ajoutée à l'inverse, et la première oubliée
laisse un « défaire » qui ne défait pas tout — le pire des défauts, parce qu'on
ne s'en aperçoit que trois gestes plus tard.

L'éditeur photographie donc la carte avant le geste, compare après, et garde les
cases qui ont changé. Quelques kilo-octets par coup de pinceau, et la garantie
est totale **par construction** au lieu d'être totale par vigilance.

Une entité posée garde son nœud, pas une description : la remettre en place doit
rendre la **même** entité, avec son identifiant. Un nœud recréé en porterait un
autre, et tout ce qui y renvoyait pointerait dans le vide.

## Le scripting, dans l'éditeur

![L'atelier de scripts](docs/atelier.png)

On choisit un nœud, on écrit son comportement, **Ctrl+Entrée**, et ça tourne —
pendant que le jeu joue. Le nœud garde la **source**, pas la fonction compilée :
c'est elle qui part dans le fichier de projet, qui se relit, qui figure dans un
diff.

Un script ne parle qu'à deux choses : `c`, le contexte de jeu, et `n`, son nœud.
Écrire `document`, `fetch`, `localStorage` est **refusé**, avec la raison. Ce
n'est pas un bac à sable de sécurité — le code vient de vous, il tourne chez
vous, et `new Function` n'isole rien. C'est une contrainte de **conception** :
le projet promet de tourner ailleurs, en Python, en Rust, dans Godot, et cette
promesse ne tient que si les scripts ne parlent qu'à `c` et `n`. La règle refuse
ce qui ne passerait pas la frontière, et elle le dit tout de suite au lieu de
laisser découvrir le problème le jour de l'export.

Elle refuse aussi `while (true)` : on ne peut pas interrompre du JavaScript en
cours, et appliquer un script dont on **sait** qu'il fige l'onglet reviendrait à
fermer la porte derrière la personne. Un script est appelé une fois par pas —
c'est le moteur qui boucle.

Et la règle vérifie son propre revers : le mot « document » dans un commentaire
ou dans une chaîne ne fait rien refuser. Refuser à tort est pire que ne rien
vérifier, parce qu'on cesse alors de croire la règle.

Une erreur d'exécution ne fait pas tomber la boucle. Elle est rapportée, et
après cinq le script se met en sommeil : répéter la même exception soixante fois
par seconde n'apprend rien et rend la page inutilisable.

## Ce que ça veut dire, concrètement

- **Tout est en pixels entiers.** Positions, caméra, échelle. Ce qui a besoin de
  précision — une vitesse, une accélération — la garde dans un accumulateur et
  ne se pose sur la grille qu'au dernier moment. Un objet à 0,4 px par image
  avance d'un pixel toutes les deux ou trois images, ce qu'on voit dans les jeux
  de cette époque, au lieu de glisser en sous-pixel.
- **L'échelle est entière, toujours.** 320×180 dans une fenêtre de 1280×800
  donne ×4, pas ×4,44. On préfère des bandes noires à une grille qui ondule.
- **Rien n'est interpolé.** Jamais.
- **L'autotiling est au centre**, pas en module annexe. On peint « ici il y a du
  mur » et la bonne tuile parmi 47 se déduit du voisinage.
- **La palette est verrouillée pour tout le projet**, et une règle nomme toute
  couleur qui en sort, avec son effectif et la plus proche de la palette.

## Ce qui marche aujourd'hui

Trois mondes jouables : on peint le décor, on appuie sur **Jouer**, on marche,
on saute, on bute contre les murs, la caméra suit sans trembler. 60 images par
seconde.

- contrat de pixel : accumulateur, arrondi symétrique, échelle entière
- quatre projections — orthogonale, isométrique, isométrique décalée, hexagonale
- contrôleur de plateforme de qualité Celeste, réglé en **hauteur et en temps**
  plutôt qu'en gravité et en impulsion
- animations : durées en millisecondes, boucle, aller-retour, clip unique avec
  enchaînement, et des **événements rendus** — le pied qui touche le sol, l'image
  où le coup porte — qui survivent à une image de jeu longue
- autotiling à 47 ou 16 tuiles, calculé et non recopié
- cartes en calques, collision sur sa propre grille
- boucle à pas fixe avec plafond de rattrapage
- collisions axe par axe, pixel par pixel — pas de traversée de mur
- entrées avec mémoire courte : un appui entre deux pas n'est pas perdu
- matières de case : solide, plateforme traversable par en dessous, blessante,
  échelle, liquide — et elles se combinent
- mort, réapparition et points de reprise
- édition : terrain, gomme, matières, tuile précise, entités, déplacement de la
  vue — et le pinceau vise le bon losange en isométrique, pas la case d'à côté
- défaire et refaire (Ctrl+Z, Ctrl+Maj+Z), y compris sur les entités posées
- projet enregistré et relu dans un dossier local, planches et projection comprises
- scripting embarqué : écrire le comportement d'un nœud dans l'éditeur, à chaud
- entités en données : catalogue d'espèces, intentions nommées, placement à la
  souris, et le héros lui-même est une entité
- combat : vitalités, frappes à durée, poussée, images d'invulnérabilité
- génération d'étages en salles, reproductible depuis une graine
- caméra verrouillée sur la salle, avec glissement à vitesse constante
- export d'un projet Godot 4 ou d'un dossier Unity, en une archive
- Tiled et LDtk, dans les deux sens
- export du projet et de son chargeur

## Le projet, sur votre disque

**Dossier…** choisit le dossier de travail, **Enregistrer** (ou Ctrl+S) y écrit
`projet.json`, **Ouvrir…** le relit. Là où `showDirectoryPicker` n'existe pas,
l'éditeur bascule sur le téléchargement et le champ de fichier — et il le dit :
un bouton qui ne fait rien sans expliquer pourquoi est pire qu'un bouton absent.

Le fichier **se suffit à lui-même**. Il porte les cartes, la collision, la
scène, la palette, les clips d'animation, la projection, et les **planches de
dessins** — en lettres, une couleur par caractère, le point pour le vide. Une
planche en PNG encodé serait plus compacte et opaque dans un dépôt : un diff
dirait « l'image a changé », et rien de plus. En lettres, il montre le pixel qui
a bougé.

Un projet relu se **joue**, il ne s'affiche pas seulement : les entités
reviennent et bougent, le héros répond au clavier, et les scripts écrits dans
l'atelier sont recompilés depuis leur source.

Ce qui ne revient pas, et qu'on préfère dire : un comportement qui ne s'exprime
par aucun nom du catalogue — l'aventure, l'épée, les cœurs de l'interface — est
écrit en TypeScript et vit dans le code du moteur. Un fichier ne peut pas
contenir du code compilé, et prétendre le contraire ferait croire à une fidélité
qui n'existe pas.

## Un projet Godot ou Unity, en un fichier

Le menu d'export propose deux familles, et les sépare :

**Un projet qui s'ouvre.** *Projet Godot 4 (.zip)* donne un dossier avec son
`project.godot`, ses PNG, son JSON et le code qui les lit — on l'ouvre dans
Godot et on lance. *Dossier Unity (.zip)* se copie dans `Assets/` et se branche
sur un GameObject vide.

**Un chargeur à brancher.** Les six langages ci-dessous, pour qui écrit son
propre moteur.

### Pourquoi les données à l'exécution, et pas des ressources natives

On pourrait écrire un `.tscn` avec son TileMap déjà rempli. Ce serait plus
impressionnant à l'ouverture, et ce serait fragile : le contenu binaire d'un
TileMap Godot a changé entre 4.2 et 4.3, et un asset Unity demande un GUID de
meta que rien ne nous autorise à inventer. **Un export qui casse à la version
suivante du moteur d'accueil est pire qu'un export honnête.**

Le paquet porte donc les données et le code qui les lit, dans la langue du
moteur. Les API d'exécution — `TileSet.new()`, `Sprite2D`, `SpriteRenderer` —
sont stables depuis des années. Ce qu'on perd : la carte n'apparaît qu'au
lancement. Pour des ressources natives et éditables, l'export **Tiled** existe,
et c'est le chemin que Godot comme Unity recommandent eux-mêmes.

### Ce que le banc vérifie, et ce qu'il ne peut pas

Ni Godot ni Unity ne sont installés ici, donc **aucun des deux paquets n'est
ouvert au banc**. Ce qui l'est : le CRC-32 contre sa valeur de référence
publiée, la structure du PNG morceau par morceau avec ses CRC, la lecture de
l'archive par son propre répertoire central, et — la vérification qui compte —
**tout chemin `res://` cité par un fichier engendré doit exister dans le
paquet**. Une référence cassée est la faute la plus courante d'un générateur de
projet, et la seule qu'on ne découvre qu'à l'ouverture.

Le ZIP et le PNG sont écrits à la main, sans dépendance et sans compression. Le
format autorise les deux : blocs stockés côté ZIP, flux zlib de blocs stockés
côté PNG. Écrire deflate demanderait trois cents lignes de plus à éprouver pour
des fichiers qui vivront dans une archive. Et la date des entrées est figée :
sans cela, deux exports du même projet donnent deux fichiers différents, et l'on
ne peut plus dire si quelque chose a changé.

## « Marche avec tous les langages »

Un onglet de navigateur ne peut pas exécuter du C++ ni du Rust ; prétendre le
contraire serait malhonnête. Ce qu'il fait : produire des **données** dans un
format ouvert et diffable, et **le code pour les lire** dans la langue de votre
choix.

| Cible | État |
| --- | --- |
| Python | **exécuté au banc** — charge un projet, retrouve chaque valeur, rend la même image d'animation à 51 instants, le même pixel de planche 24 fois et la même case isométrique 25 fois |
| Rust | **compilé et exécuté au banc** — mêmes tables, valeur par valeur (serde retiré, la crate n'est pas installée ici) |
| TypeScript | **compilé `--strict` et exécuté** — même chargement, mêmes tables |
| C# (Unity) | généré, symboles vérifiés — aucun interprète installé ici |
| GDScript (Godot) | généré, symboles vérifiés — aucun interprète installé ici |
| Lua (LÖVE) | généré, symboles vérifiés — aucun interprète installé ici |

Le tableau dit ce qui est éprouvé et ce qui ne l'est pas. Un générateur de code
dont on affirme que la sortie compile, c'est le genre de promesse qui se révèle
fausse le jour où quelqu'un s'en sert.

Et compiler n'est pas tourner. Ce que le banc compare, c'est la **réponse** : le
moteur, le portage Python, le portage Rust et le portage TypeScript doivent
rendre exactement la même image d'animation pour les mêmes millisecondes, la
même couleur pour le même pixel de planche, et la même position à l'écran pour
la même case isométrique. Aux instants frontière, et sur la demi-largeur du
losange — c'est-à-dire là où deux portages divergent. C'est ce test qui a révélé que le
chargeur Rust cherchait un champ `tuile_depart` là où le format écrit
`tuileDepart` : il compilait très bien, et aurait échoué à la première carte
avec un terrain.

## Démarrer

```sh
npm install
npm run dev      # l'éditeur
npm run banc            # 82 vérifications du moteur
npm run banc:plateforme # 29 vérifications du contrôleur et des plateformes
npm run banc:mondes     # 142 vérifications : mondes, animations, combat, étages, scripts, projets, historique
npm run banc:langages   # 66 vérifications : chargeurs, accord entre langages, paquets
npm run fumee           # 35 vérifications de l'éditeur, dans un vrai navigateur
npm run build
```

## La méthode

Chaque règle est éprouvée dans les **deux sens** : sur un cas où elle doit se
taire, et sur un cas fabriqué où elle doit parler. Un banc qui ne sait pas
échouer ne protège rien.

Un banc de plus, `npm run fumee`, ouvre l'éditeur dans un vrai navigateur :
il charge les quatre mondes, joue dans chacun, peint une case, ouvre l'atelier,
exporte, et refuse de passer si la console a dit quoi que ce soit. Les autres
bancs éprouvent du calcul et ont raison de tourner en Node pur ; celui-ci
attrape ce qui ne se voit qu'à l'écran. Il a trouvé sa première faute le jour où
il a été écrit — une règle de style écrasait l'attribut `hidden`, et le panneau
de scripts ne se fermait jamais.

Le banc a déjà pris ce dépôt en défaut plusieurs fois — un double de test qui
n'appliquait pas le plafond de la vraie boucle et rendait 500 pas au lieu de 5 ;
47 tuiles de mur qui pointaient toutes sur le même dessin, si bien que les murs
ne se rejoignaient jamais à l'écran ; `caseVersMonde` qui rendait le sommet du
losange quand son inverse attendait le coin de la boîte, et faisait rater les
144 cases sur 144 d'un aller-retour isométrique.

Ce que le banc des mondes vérifie, et qu'aucun typage ne peut poser comme
question :

- les dalles isométriques **pavent** le plan — on les rastérise et l'on compte
  les pixels de fond visibles entre elles ; une dalle plus étroite d'un pixel
  par rangée est présentée en contre-exemple et doit échouer ;
- aucune case visible n'est **écartée** du parcours de rendu, à cinq positions
  de caméra et dans les quatre projections ;
- les niveaux sont **franchissables** : pas « ont l'air », mais le vrai
  contrôleur, sur la vraie carte, arrive de l'autre côté de chaque fosse et
  remonte le puits ; et sans saut mural, il n'y arrive pas.

Le dépôt est **entièrement en texte**, dessins compris : une lettre par couleur,
le point pour le vide. Un diff dit ce qui a bougé dans un sprite.

## Parenté

Petit frère de [PixelForge](https://github.com/jules-crevoisier/sprite),
l'éditeur de sprites. Les deux partagent leurs leçons : l'arrondi qui commute
avec le miroir vient de là, et il y avait coûté 40 % d'asymétrie sur une lame
pourtant parfaitement symétrique.
