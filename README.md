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

### Les salles sont dessinées à la main, le tirage choisit laquelle

Le hasard suffit à prouver qu'un étage tient debout ; il ne fait pas un jeu.
Personne ne se souvient d'une salle tirée au sort. On se souvient de la salle
aux quatre piliers, de celle où deux tourelles se font face à couvert, de celle
qui est presque vide et où l'on comprend qu'il va falloir se retourner. Ces
salles-là sont **écrites** — dix-huit colonnes sur neuf, une lettre par case,
comme les planches de dessins — et le tirage ne choisit que laquelle et dans
quel sens. C'est le partage d'Isaac, de Dead Cells et de Spelunky : le hasard
décide de la forme de l'étage, la main décide du contenu de chaque pièce.

**Un modèle n'a pas à connaître ses portes.** Isaac range ses salles par
configuration de portes — nord, nord et est, et ainsi de suite jusqu'à quinze
familles. C'est beaucoup de dessins pour une propriété qui se garantit
autrement : si la croix centrale reste libre, les quatre portes possibles sont
reliées entre elles quelle que soit la configuration. Sept dessins valent alors
quinze familles — et comme la croix est **centrée**, elle est symétrique sur
les deux axes, donc un modèle valable le reste retourné. Sept dessins, quatre
orientations, vingt-huit salles distinctes à l'œil.

La croix n'est pas une convention polie : elle est **vérifiée**. Un bloc posé
dedans fait refuser le modèle au démarrage, avec sa case — « case 8,4 : un bloc
barre la croix des portes ». Une salle close ne se voit qu'en jouant, une fois
sur douze, et seulement si l'on va jusque-là. Le banc éprouve les deux versants :
les sept dessins livrés passent dans leurs quatre orientations, et trois dessins
volontairement fautifs — un bloc dans la croix, une rangée trop courte, une
lettre qui ne veut rien dire — sont bien refusés. Une règle qui ne refuse jamais
rien est indistinguable d'une règle absente.

Une salle sans modèle retombe sur les amas tirés au sort. Ce n'est pas un
vestige : c'est ce qui permet d'ajouter un dessin et de voir ce qu'il donne, au
lieu d'avoir à couvrir tous les rôles avant que le premier ne serve.

Ce chemin de repli a d'ailleurs révélé un défaut qui dormait là depuis le
début. Les amas évitaient les cases **marquées** en comparant leur tuile à la
tuile marqueur ; quand l'appelant ne précise ni l'une ni l'autre, les deux
valent zéro, toute case passe pour marquée, et plus un seul obstacle n'est posé.
Les salles étaient vides, sans que rien ne le signale — y compris dans le banc,
qui appelait justement sans préciser. L'identité d'une tuile est une mauvaise
façon de dire « cette case est spéciale » : on retient maintenant la case.

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
nom — `immobile`, `patrouille`, `poursuite`, `bond`, `joueur`, `plateformeur`,
`projectile`. Un fichier ne peut pas contenir de fonction ; un nom, si, et il se
porte dans les six langages.

Le **héros en est une**, et ce n'est pas une coquetterie : tant qu'il naissait
d'un appel de fonction, un projet relu n'avait personne à diriger. Maintenant un
étage enregistré se rouvre avec ses vingt-trois entités, elles bougent encore,
et l'on peut y jouer. C'est ce que le banc vérifie, sans navigateur.

### Une machine à états par espèce

Une intention seule ne fait pas un ennemi. « Poursuite » décrit un tas de
gélée ; ça ne décrit pas une tourelle, qui guette, vise, tire, puis souffle.
Une espèce peut donc porter des **états** nommés : chacun a son clip, son
intention, sa durée, l'état qui suit, et deux bascules de distance —
`siProche` et `siLoin`. La tourelle est quatre lignes de données : `guet`
bascule vers `anticipe` en deçà de 90 px, `anticipe` dure 250 ms puis passe à
`tire`, `tire` passe à `repos`, `repos` revient au `guet`.

L'état d'anticipation n'est pas un détail de mise en scène : **c'est lui qui
rend l'ennemi juste**. Un tir sans préavis ne se lit pas, donc ne s'évite pas,
donc le joueur accuse le jeu au lieu de s'accuser lui-même. Un quart de seconde
de posture visible change une mort injuste en erreur reconnue.

### Le coup part de l'image, pas du chronomètre

Un état peut porter des **déclencheurs**, et un déclencheur est attaché à un
**événement d'animation**, jamais à un nombre de millisecondes. « Le coup porte
à la troisième image » ne peut pas s'écrire en millisecondes sans mentir : la
durée change dès qu'on retouche le clip, et le réglage se déphase en silence.
Attaché à l'image, il reste vrai après la retouche. Et comme les événements de
clip survivent à une image de jeu longue, le tir ne se perd pas quand la page
hésite.

Un déclencheur fait une **frappe** — dégâts, portée, épaisseur, durée, poussée —
ou un **tir**, qui lance une autre espèce. Un projectile n'est rien de plus
qu'une entité de plus : sa propre espèce, sa vitesse, sa durée de vie, et il
meurt au premier mur. Il traverse donc les mêmes sauvegardes, le même export,
les mêmes six langages que le reste — au lieu d'être un système à part qu'il
faudrait porter une deuxième fois.

Le clip de tir est en **boucle unique**. Il a d'abord été laissé en boucle, et
la tourelle tirait deux fois par cycle : l'événement repassait avant la fin de
l'état. C'est le genre de bogue qu'un banc attrape et qu'une relecture ne voit
pas.

### Ce qui bouge et qui n'est pas une case

Tout le décor tenait dans la grille de tuiles. C'est exact pour un mur et faux
pour tout ce qui bouge : une plateforme qui monte, une caisse, une porte qui
coulisse. Une case ne sait pas dire « je suis ici, à treize pixels ».

Il existe donc un **registre de corps mobiles**, en pixels, qui se *branche* sur
la grille. Le contrôleur de plateforme, le déplacement des créatures et les
scripts passent tous par la même interface : aucun des trois n'apprend qu'il
existe des corps mobiles, et un obstacle qui se déplace devient du décor du
point de vue de qui se cogne dedans. Les drapeaux sont ceux des cases — solide,
plateforme à sens unique — et ce n'est pas une coïncidence.

Une plateforme mobile est donc **une entité de plus**, décrite en données : son
aller-retour tient en quatre nombres — de combien, en combien de temps, avec
quelle pause aux extrémités. La pause n'est pas décorative : c'est elle qui
donne le temps de monter. Le mouvement est linéaire et non adouci ; une
plateforme adoucie est plus jolie et moins lisible, on ne sait plus quand elle
repart, donc on rate le saut.

Le passager est relevé **avant** que la plateforme ne bouge, jamais après : une
fois qu'elle a bougé, plus rien ne repose dessus, et l'on cherche une liste qui
n'existe plus. Et il est déplacé sans recevoir de vitesse — une vitesse le
ferait continuer tout seul à l'instant où la plateforme s'arrête, ce qui est le
défaut classique du passager éjecté en bout de course.

### Sauter sur la tête, et l'ordre qui rend ça juste

Le piétinement se règle en données lui aussi : la victime dit ce qu'elle perd
et de quelle hauteur on rebondit. La hauteur appartient à la **victime** parce
qu'un ressort vivant renvoie plus haut qu'un champignon, et que c'est ce qui
distingue deux ennemis qui se ressemblent. Une créature à pointes peut refuser
d'être piétinée : sans ce refus, le joueur apprend un geste qui le tue une fois
sur deux.

Ce qui a demandé le plus de soin n'est pas la détection, c'est l'**ordre**. Une
première version résolvait le piétinement au début du pas, donc sur les
positions du pas précédent : le héros mangeait le coup à l'image où il
atterrissait sur la gelée, et ne l'écrasait qu'à la suivante — il payait un
point de vie pour un geste réussi. Maintenant chacun frappe depuis la place où
il est vraiment : on bouge, puis on piétine, puis on blesse au contact. Le banc
mesure les deux versants — la créature meurt quand on lui tombe dessus, elle
survit quand on la frôle ou quand on la traverse en montant — parce qu'une
règle qui ne refuse jamais rien est indistinguable d'une règle absente.

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

## Partir de rien

![Un projet parti de zéro : la carte, les calques, les espèces](docs/projet.png)

**Nouveau…** donne un projet vide et jouable — les deux ne se contredisent
pas : il y a une carte, deux calques, un héros au milieu et le catalogue des
espèces. Ce qui manque, c'est le décor, et c'est justement ce qu'on vient
dessiner. Un projet neuf sans héros s'ouvrirait sur un rectangle noir où
« Jouer » ne ferait rien, et la première impression serait « c'est cassé ».

Le panneau **Projet** fait ce que le pinceau ne sait pas faire : redimensionner
la carte, ajouter ou retirer un calque, en changer l'ordre, créer une espèce
sans écrire une ligne de TypeScript.

### Pourquoi tout passe par le fichier de projet

Ces gestes-là touchent à la **structure**. On pourrait les faire en place —
agrandir les tableaux, pousser un calque, ajouter une entrée au catalogue — et
c'est ce qu'on écrit d'abord. Chacun oblige alors à se souvenir de tout ce qui
dépend de la chose changée : la grille de collision, la présence de chaque
calque, l'atlas, la caméra, le peuplement déjà adopté, l'historique qui pointe
sur des index devenus faux. Le premier oubli ne se voit pas, et le deuxième se
voit trois gestes plus tard.

Ici, chaque geste transforme le **projet sérialisé**, et l'éditeur relit le
résultat par le chemin qui sert déjà à rouvrir un fichier. Ce chemin est
éprouvé à chaque banc, il reconstruit tout, et il ne peut rien oublier
puisqu'il ne garde rien. Le prix est une reconstruction de quelques
millisecondes, et le fait qu'un geste de structure **ne se défasse pas** au
Ctrl+Z — ce qu'on dit au lieu de le cacher.

Le gain second n'est pas mince : ces gestes **éprouvent le format**. Un champ
que la relecture perdrait se voit tout de suite, dans l'éditeur, au lieu
d'attendre le jour où quelqu'un rouvre un vieux fichier. C'est comme ça qu'on a
trouvé que la présence d'un calque **sans terrain** n'était pas relue : le
fichier l'écrivait, le lecteur la jetait. Une perte silencieuse — c'est-à-dire
le pire des défauts, et celui que le commentaire d'à côté disait refuser.

Une espèce créée dans le panneau passe par la **même fabrique** que le
catalogue écrit en TypeScript : tout champ qu'on ne remplit pas prend la valeur
par défaut du moteur, et le banc vérifie qu'elle a exactement les mêmes vingt-six
champs que « Gelée ». Sans cela, une espèce de l'éditeur serait une espèce de
deuxième classe, à qui il manquerait le champ qu'on vient d'ajouter au moteur.

### Le cadre d'édition n'est pas un zoom

L'échelle à l'écran est entière, toujours. Un zoom qui la multiplierait par 1,5
casserait ce contrat à la première molette. Les boutons **−** et **+** changent
donc la **résolution virtuelle pendant l'édition** : un cadre deux fois plus
large montre deux fois plus de carte, avec des pixels deux fois plus petits, et
l'échelle reste entière. Le cadre du jeu, lui, ne bouge jamais — il est remis à
celui du monde dès qu'on appuie sur Jouer. Sinon on réglerait la difficulté du
jeu avec un bouton de zoom, en voyant arriver ce que le joueur ne verra pas.

### Ce qu'un vrai navigateur a trouvé et qu'aucun banc ne pouvait dire

Le parcours complet — créer un projet, peindre, poser une créature, la traîner,
redimensionner, ajouter un calque, créer une espèce, jouer — tourne dans un
navigateur à chaque exécution de la fumée. C'est la seule vérification qui
réponde à « quelqu'un d'autre peut-il s'en servir ».

Elle a payé du premier coup. Le panneau gardait le projet **capturé au moment
où il avait été dessiné** : on ouvrait le panneau, on peignait dix cases, on
redimensionnait — et les dix cases disparaissaient, parce que le
redimensionnement s'appliquait à l'état d'avant. Aucun banc ne pouvait le dire :
ils appellent la fonction sur un projet qu'ils viennent de fabriquer, où la
question du « quand » ne se pose pas.

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
- un projet neuf, vide et jouable, en un bouton
- redimensionner la carte, ajouter et ordonner les calques, créer une espèce —
  sans écrire une ligne de code
- déplacer une entité posée en la traînant, et le défaire
- un cadre d'édition réglable, qui ne touche jamais au cadre du jeu
- une aide qui dit dans quel ordre s'y prendre
- défaire et refaire (Ctrl+Z, Ctrl+Maj+Z), y compris sur les entités posées
- projet enregistré et relu dans un dossier local, planches et projection comprises
- scripting embarqué : écrire le comportement d'un nœud dans l'éditeur, à chaud
- entités en données : catalogue d'espèces, intentions nommées, placement à la
  souris, et le héros lui-même est une entité
- combat : vitalités, frappes à durée, poussée, images d'invulnérabilité
- corps mobiles : plateformes qui portent, ascenseurs, caisses solides
- sauter sur la tête d'une créature, avec rebond réglé en hauteur
- machines à états par espèce : bascules de distance, durées, état suivant
- déclencheurs attachés à une image d'animation : frapper, tirer
- projectiles, qui sont des entités comme les autres
- des pentes à quarante-cinq degrés, montées en marchant, sans escalader les murs
- hit-stop et secousse de caméra, entière et reproductible
- manette, tactile par zones, et plan de touches enregistré dans le projet
- dessiner une planche, monter une animation, régler un son — dans l'éditeur
- une charge mesurée : 300 créatures à 0,4 ms par pas de simulation
- une fonte de pixels 5×7, accents français et tout l'ASCII imprimable
- de la musique écrite en notes, exportée aussi en `.wav`, et des textes
  traduits par clef — ce qui manque s'affiche au lieu de disparaître
- du son décrit en données, synthétisé, attaché aux événements d'animation —
  et qui ne se rejoue pas quand le réseau rembobine
- des particules, hors de la simulation par construction
- dialogue à la frappe, avec choix ; menus à curseur bouclant ; pause
- sauvegarde de la partie, distincte du projet, avec la graine du monde
- entrées déterministes : la même partie rejouée donne la même partie
- instantané et rembobinage du moteur entier, résurrections comprises
- rollback à deux, avec latence, gigue et pertes — éprouvé sur le vrai moteur
- génération d'étages en salles, reproductible depuis une graine
- salles dessinées à la main, tirées et retournées par le générateur, refusées
  au démarrage si elles barrent le passage entre leurs portes
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
npm run banc            #  82 vérifications du moteur
npm run banc:plateforme #  68 vérifications du contrôleur, des pentes et des plateformes
npm run banc:mondes     # 224 vérifications : mondes, animations, combat, étages, scripts, projets, historique
npm run banc:langages   #  87 vérifications : chargeurs, accord entre langages, paquets
npm run banc:reseau     #  33 vérifications : instantanés, rembobinage, perte de paquets
npm run banc:habillage  # 112 vérifications : fonte, son, musique, WAV, traduction, menus, sauvegarde
npm run banc:charge     #   9 mesures de cadence — mesurées, pas promises
npm run fumee           #  77 vérifications de l'éditeur, dans un vrai navigateur
npm run agent           # la grille : 61 critères, et ce qu'il reste à faire
npm run build
```

## Le multijoueur : jouer sans attendre les autres

Les entrées du joueur d'en face arrivent en retard. On peut soit **attendre** —
et le jeu accuse la latence à chaque appui, ce qui est insupportable dans un jeu
de plateforme — soit **avancer en devinant, puis se corriger**. La seconde voie
est celle de tous les jeux de combat depuis vingt ans, et elle porte un nom :
rollback.

### Rien n'était possible tant qu'une horloge traînait

`Entrees` datait chaque appui avec `performance.now()`. La règle était juste et
le résultat n'était pas **reproductible** : deux exécutions des mêmes touches,
sur la même machine, ne rendaient pas la même partie. Tout le reste du moteur
était déterministe — pas fixe, hasard tiré d'une graine — et cette seule lecture
d'horloge suffisait à tout ruiner : ni rejeu, ni vérification d'un record, ni la
moindre forme de rembobinage.

Un appui est maintenant daté par le **numéro du pas** où il a eu lieu. Les
réglages restent en millisecondes — c'est l'unité qui se compare à l'œil — et se
convertissent en pas à la lecture. On y perd une chose, et c'est correct : deux
appuis de la même touche dans un seul pas ne se distinguent plus. Un jeu à pas
fixe ne pouvait de toute façon pas les voir ; l'horloge donnait l'illusion du
contraire.

### Ce que le rembobinage a exigé

Revenir en arrière suppose de savoir rendre un état **exactement** comme il
était. Chaque système sait maintenant se photographier — le contrôleur, le
lecteur d'animation, le combat, le peuplement, les corps mobiles. Trois choses
qu'on aurait oubliées, et que le banc a nommées :

- **Les fractions de pixel.** Elles valent moins d'un pixel, elles ne se voient
  pas — et c'est exactement pourquoi il faut les garder. Un rembobinage qui les
  perd repart avec un demi-pixel d'écart, et deux machines n'arrivent pas au
  même pixel un dixième de seconde plus tard. Elles vivent en plus **à côté** de
  la scène, dans les accumulateurs de déplacement, ce qui les rend deux fois
  plus faciles à oublier.
- **La résurrection.** Une créature tuée au pas 130 doit revenir si l'on
  rembobine au pas 120. Une première version gardait seulement les positions et
  laissait la scène décider qui existe : ça paraissait prudent, et ça rendait le
  rembobinage tout simplement faux.
- **Les frappes en vol.** Un coup d'épée dure six images et porte la liste de ce
  qu'il a déjà touché. Perdre cette liste ferait blesser deux fois avec le même
  coup — précisément le défaut que la règle « un coup ne touche qu'une fois »
  existe pour éviter.

### Deux défauts du rembobinage lui-même

**Le retard local retardait ce qu'on joue, pas ce qu'on annonce.** Jouer ses
propres touches deux images plus tard ne sert à rien si le message part quand
même au dernier moment : il arrive toujours en retard, et le réglage ne change
rigoureusement rien. Le banc l'a dit sans ambiguïté — cent huit pas refaits avec,
cent huit sans. En annonçant *maintenant* ce qu'on jouera *dans deux pas*, l'autre
reçoit avant d'en avoir besoin : cent huit pas refaits deviennent **zéro**.

**La correction abandonnait dès que le premier pas suspect s'avérait juste.** On
retenait le plus ancien pas dont une entrée était *arrivée* — ce qui n'est pas le
plus ancien pas dont une entrée était *fausse*. Quand l'entrée reçue confirmait
la prédiction, ce qui arrive tout le temps puisque c'est le principe, on
concluait « rien à refaire » et on abandonnait au passage les corrections des pas
suivants arrivées dans le même lot. Les deux machines divergeaient alors pour de
bon, en silence.

### Un rembobinage ne répare pas une perte

Si le paquet qui portait le pas 412 n'arrive jamais, aucune correction ne
rattrapera une information détruite. Chaque message porte donc les **huit
derniers pas** : perdre un paquet devient sans conséquence dès que le suivant
arrive. Le coût est ridicule — une entrée tient dans deux petits entiers.

Le banc mesure les deux versants : avec redondance et 30 % de pertes, les deux
machines s'accordent ; sans elle, les mêmes pertes les font diverger pour de bon.

### Ce que le banc vérifie, et sur quoi

Le rembobinage a d'abord été écrit contre une **simulation-jouet** : deux
curseurs qui avancent. C'était le bon choix — un échec y est lisible. Ce n'est
pas une preuve que le *moteur* se rembobine, alors le banc le fait aussi sur le
vrai jeu : un héros avec sa vitesse, son coyote, son tampon de saut, sa fraction
de pixel, son animation en cours, sa vitalité, des gelées qui patrouillent et
qu'on écrase. Cent vingt pas rembobinés, refaits à l'identique — et un instantané
volontairement amputé qui, lui, doit échouer.

    le vrai moteur, à deux, sur un lien qui retarde et qui perd
      accord au pas 294 · 46 messages perdus, 30 rembobinages

Ce qui manque encore, et qui se dit : un seul jeu d'entrées est actif par pas,
donc un seul personnage dirigeable dans cette version. Faire lire à chaque entité
*ses* entrées est un changement du contexte de jeu, pas du rembobinage.

## Ce qu'un jeu a en plus de son gameplay

![Le dialogue, le menu de pause, la fonte](docs/interface.png)

Une fonte, du son, des étincelles, du texte, des menus, une sauvegarde. Aucun
des six ne décide de quoi que ce soit — et c'est exactement pourquoi ils se
dégradent sans qu'on s'en aperçoive : une lettre manquante ne fait tomber aucun
banc, un son qui se rejoue cinquante fois après un rembobinage ne fait rien
planter, un menu qui bute sur sa dernière ligne passe pour un choix.

### Une fonte en pixels, écrite comme les planches

`ctx.fillText` donnerait du texte anticrénelé — du gris sur les bords, dans un
jeu où chaque pixel est une couleur de la palette. Sur un écran agrandi quatre
fois, l'un appartient au jeu et l'autre est posé dessus. Et une police du
système n'est pas la même partout : un dialogue cadré au pixel près chez soi
déborde de sa boîte chez quelqu'un d'autre.

Cinq sur sept, parce que c'est la plus petite taille où les minuscules restent
lisibles avec des jambages. Un glyphe par ligne, sept rangées séparées par une
barre — c'est fait pour le **diff** : quand un pixel bouge, on voit lequel, dans
quelle lettre.

Les accents ne sont pas une option. Une fonte sans « é » fait écrire « eleve »,
et l'on finit par écrire tout le jeu sans accents « parce que la fonte ne les a
pas ».

Un caractère inconnu rend un **pavé plein**, jamais un blanc : un texte où les
caractères manquants disparaissent se lit presque normalement, et l'on livre le
jeu sans avoir vu qu'un mot était amputé. C'est ce qui a fait remarquer que le
curseur des menus — un simple `>` — n'était pas dans la fonte : il s'affichait
en pavé sur la capture d'écran. Un contrôle couvre maintenant tout l'ASCII
imprimable, et il l'aurait dit avant que je regarde.

### Le son, décrit en données

Un projet doit se suffire à lui-même : c'est la règle qui a fait mettre les
planches dans le fichier. Un fichier d'onde pour un bruit de pas pèse trente
kilo-octets, ne se relit pas dans un diff, et rouvre le problème qu'on avait
résolu pour les dessins.

Un son est donc une description — une forme d'onde, une fréquence qui glisse,
une enveloppe, une durée. Six nombres. C'est aussi ce que faisaient les machines
de cette époque : trois oscillateurs et un bruit. La contrainte donne le son du
genre, elle ne le limite pas.

La synthèse est **pure** : elle remplit un tableau d'échantillons et ne connaît
pas le navigateur. Un banc vérifie donc qu'un son dure ce qu'il annonce, que son
enveloppe revient à zéro — un son coupé net à mi-volume claque, et le claquement
s'entend plus que le son —, qu'il ne sature pas, et que les quatre formes d'onde
donnent bien quatre sons différents. Ce qui touche à l'audio du navigateur tient
en dix lignes, à part, et ne contient aucune décision.

**Et un son ne se rejoue pas quand le réseau rembobine.** Les événements
d'animation ressortent à chaque re-simulation : sans mémoire, une correction de
cinquante pas ferait entendre cinquante bruits de pas d'un coup. Le sonneur
retient ce qu'il a joué, par pas *et* par source — deux créatures qui marchent
ensemble doivent s'entendre toutes les deux.

### La musique s'écrit en notes

Même raison, un cran plus haut. Une minute de musique en fichier d'onde pèse dix
mégaoctets et ne se relit pas ; en notes, elle pèse deux kilo-octets et un diff
montre **quelle note a changé**. Une musique est un tempo et des voies ; une voie
est un timbre — un son complet, posé là — et une note par temps. Le point est un
silence, le tiret **prolonge** la note précédente.

Ce tiret n'est pas une commodité d'écriture. Sans lui, une blanche s'écrirait en
répétant la note, et l'on entendrait deux attaques au lieu d'une note tenue :
c'est la différence entre une mélodie et un martèlement. Un banc le mesure en
comptant les creux d'enveloppe — la version tenue en a zéro, la version martelée
en a trois, pour exactement la même durée.

Le timbre est **posé dans la voie** et non désigné par son nom dans le catalogue
des sons. Un renvoi économiserait quelques octets et créerait une référence qui
peut pendre : une musique dont le timbre a été renommé jouerait en silence.

Les voies s'additionnent, et le résultat est **borné**, pas normalisé. Normaliser
ferait dépendre le volume général de la note la plus forte, et deux musiques du
même jeu n'auraient pas le même niveau. Si ça sature, c'est aux volumes de le
dire.

**Et l'export la donne aussi en `.wav`.** Le projet garde les notes ; Godot ne
sait pas synthétiser une onde carrée, il sait lire un fichier. C'est exactement
ce que fait l'export des planches, qui rend des PNG là où le projet garde des
lettres. Le paquet porte les deux, si bien qu'un aller-retour reste possible. Un
contrôle vérifie que chaque son *et* chaque musique a son fichier, que ces
fichiers sont de vrais RIFF/WAVE, et que la musique rendue dure bien ses trois
secondes — un en-tête vide sorti sous le bon nom passerait les deux premiers.

### La traduction : ce qui manque doit se voir

On serait tenté d'indexer par le français : « Reprendre » vers « Continue ».
Beaucoup de jeux le font, et ça casse au premier ajustement — corriger une
virgule orpheline toutes les traductions d'un coup, sans que rien ne le signale.
Une clef ne bouge pas.

Une clef non traduite rend **la clef**, jamais du vide. Une traduction
incomplète est la règle et non l'exception : on ajoute une réplique le lundi et
on traduit le vendredi. Rendre du vide ferait disparaître le texte — un bouton
sans étiquette ne se remarque pas ; `menu.quitter` affiché en plein menu, si.
C'est la même règle que le pavé plein de la fonte pour un caractère inconnu.

Les substitutions sont **nommées** — `{n} vies` — et non positionnelles : l'ordre
des mots change d'une langue à l'autre, un `%s` ne survivrait pas. Il n'y a ni
pluriels ni genres : ils demandent une grammaire par langue, et faire semblant
de les gérer avec une règle simple donne du faux dans la moitié des langues.

Le défaut qui arrive vraiment n'est pas dans le moteur, il est dans le jeu :
quelqu'un ajoute une ligne au menu et écrit son libellé en clair, parce que
c'est plus court. Rien ne tombe — le menu s'affiche, en français, dans toutes
les langues. Un contrôle lit donc la source du menu de pause et refuse toute
chaîne posée en clair dans une entrée.

### Les particules ne se photographient pas

Une gerbe d'étincelles ne décide de rien. La mettre dans l'état du jeu
obligerait à la copier dans chaque instantané gardé par le rembobinage, à la
transmettre, à s'accorder dessus entre deux machines — pour quelque chose que
personne ne peut contredire. Après une correction réseau, les étincelles ne sont
pas aux mêmes endroits sur les deux machines, et personne ne s'en apercevra
jamais. C'est précisément le critère.

Un contrôle vérifie que `Particules` n'offre **pas** de `instantane()` : le jour
où quelqu'un en ajoutera un « pour faire comme les autres », il tombera et dira
pourquoi il ne faut pas.

### Le dialogue, et l'appui qui n'attend pas

Le texte s'écrit lettre à lettre — un pavé qui apparaît d'un coup se saute, et
le texte qui se compose donne au joueur une raison d'appuyer, donc une prise. Le
**deuxième** appui affiche la réplique entière : faire attendre quelqu'un qui a
déjà lu est la faute la plus répandue du genre, et elle transforme un dialogue
en corvée.

Le dialogue **arrête le monde**. Laisser courir le jeu derrière une boîte de
texte fait mourir pendant qu'on lit, ce qui est la faute la plus injuste qu'un
jeu puisse commettre. Le banc de fumée le vérifie dans un vrai navigateur :
Échap ouvre la pause, on tient la flèche droite, et le héros ne bouge pas.

### La sauvegarde de la partie n'est pas le projet

Le fichier de projet décrit le **jeu** — cartes, dessins, espèces. La sauvegarde
décrit une **partie** — où en est ce joueur-ci, combien de cœurs, quelles salles
il a vues. Les mélanger a une conséquence immédiate : ouvrir le jeu de quelqu'un
d'autre le fait commencer là où cette personne s'était arrêtée. Et une plus
lente : on ne peut plus corriger un niveau sans invalider les parties en cours.

La graine en fait partie. Un étage engendré n'est reproductible que par elle ;
une sauvegarde qui ne la porte pas rouvre un **autre** étage, avec le héros posé
au milieu d'un mur. C'est le genre de défaut qu'on ne voit qu'après avoir
engendré le deuxième niveau, c'est-à-dire trop tard.

Une sauvegarde d'un autre projet est refusée avec la raison ; une abîmée est
signalée au lieu d'être devinée ; une version plus récente se lit sans faire
semblant de la comprendre.

## Ce qu'un jeu de plateforme doit avoir

**Les pentes.** À quarante-cinq degrés, la hauteur du sol dans une case vaut la
position dans la case : une soustraction, et deux tuiles voisines qui se
raccordent au pixel près. Pour un angle quelconque il faudrait une table par
angle et un arrondi par colonne — c'est le défaut qu'on voit dans la moitié des
jeux amateurs, où le personnage sautille en montant une colline.

Une pente n'est **pas** solide : marquée solide, elle bloque comme un mur et
l'on se cogne dans le bas de la côte au lieu de la monter. Le contrôleur
cherche donc, devant chaque obstacle, si le même pas passe quelques pixels plus
haut : si oui, c'est une pente ou une marche et l'on grimpe ; sinon c'est un mur
et l'on s'arrête. Le même test sert aux deux, ce qui évite d'avoir deux règles
qui se contredisent un jour.

Un détail a coûté cher : debout au sommet exact d'une case de pente, les pieds
sont sur sa frontière haute, donc la rangée du dernier pixel du corps est celle
**au-dessus** de la pente — et la pente devient invisible. On en regarde
maintenant deux.

**Les demi-pentes.** Deux cases pour monter d'une : un pixel toutes les deux
colonnes. Ce n'est pas un arrondi — un demi est exact, et deux cases voisines se
raccordent toujours au pixel près. Un tiers, un quart seraient le même calcul
avec un autre diviseur ; on s'arrête à deux parce que trois cases pour monter
d'une case de seize pixels donne une côte qu'on ne distingue plus d'un sol plat,
et parce que chaque raideur de plus est une tuile de plus à dessiner.

Les six formes — deux directions à quarante-cinq degrés, quatre demi-cases —
**s'excluent** : une case n'a qu'une surface. L'éditeur ne les propose donc pas
en cases à cocher, contrairement aux cinq matières. Composer « solide et montant
à droite » aurait été possible, et le fichier en aurait perdu la moitié à
l'enregistrement — la perte qu'on ne remarque qu'en rouvrant le projet.

**Ce que l'écriture d'une case a coûté.** Une case de collision tient en un
caractère : une rangée reste une ligne, et un diff montre la case qui a changé.
C'était de la base trente-six, bornée à trente-cinq « pour que rien ne casse en
silence ». Elle cassait en silence : une pente montant à **gauche** vaut
soixante-quatre, sortait `z`, et se relisait en mur. Toute colline tournée vers
la gauche se rouvrait fausse, et rien ne le disait.

Deux choses avaient rendu ça possible. Le format écrivait les matières
lui-même au lieu d'appeler la fonction qui sait les écrire — deux endroits pour
une valeur, donc un jour où ils divergent. Et la grille tenait dans un tableau
d'**octets**, alors que les matières comptent maintenant neuf drapeaux : « moitié
haute » vaut deux cent cinquante-six et y repassait à zéro.

L'alphabet passe à soixante-deux caractères, la grille à seize bits, et les
valeurs 0 à 31 ne bougent pas — un fichier écrit avant se relit sans une ligne
de migration. Un contrôle parcourt maintenant les quarante-quatre matières que
le format peut porter et vérifie l'aller-retour de chacune, plus qu'aucune ne
s'écrit comme une autre.

**Et les six portages lisent la même chose.** Ils comparaient le caractère à
`'1'`. Un mur hérissé de pointes vaut cinq : il était traversable dans le jeu
porté, et solide nulle part ailleurs. Ils décodent maintenant les drapeaux, et
un banc leur demande, pour chaque matière et **chaque colonne de pixels**, où se
trouve le sol — sept cent quatre réponses, qui doivent toutes tomber juste.

**On ne décolle pas pour une marche d'un pixel.** Une pente ne descend jamais
plus bas que `tuile - 1` : au pied d'une côte il reste un pixel avant la case
plate. Le corps le franchissait en tombant, ce qui le mettait en l'air trois ou
quatre images. Trois images ne se voient pas ; ce qu'elles font, si — elles
déclenchent le coyote, passent l'animation en « chute », coupent les poussières
de course, et rendent possible un saut aérien juste après une côte. Le
personnage descend une colline et l'on croit qu'il sautille. Le contrôleur colle
donc au sol jusqu'à la hauteur qu'il sait monter, et pas un pixel de plus : au
bord d'une falaise, la sonde ne rencontre rien et le corps tombe normalement.
Une vérification garde chacun des deux côtés.

**Le hit-stop.** Un coup qui touche sans que rien ne s'arrête se lit comme un
coup qui *traverse*. Deux ou trois images de gel, et le même coup **porte** :
l'œil a le temps de voir la rencontre. C'est la technique la moins chère et la
plus efficace du genre, et celle qu'aucun moteur généraliste ne propose parce
qu'elle contredit l'idée d'une simulation régulière.

Elle **gèle** la simulation, elle ne la ralentit pas : un ralentissement étale
le mouvement, un arrêt le suspend, et c'est l'interruption nette qui fait
l'impact. L'affichage, lui, continue — sinon on ne verrait pas les étincelles
jaillir pendant l'arrêt. Deux coups au même instant n'additionnent pas leurs
arrêts : le plus long l'emporte, sans quoi une mêlée fige le jeu une
demi-seconde.

**La secousse de caméra** est entière et reproductible. Un tremblement en
sous-pixel fait onduler toute la grille — le défaut exact que l'échelle entière
existe pour éviter, réintroduit par la porte de derrière. Elle décroît
linéairement : une décroissance exponentielle laisse un demi-pixel de
tremblement une seconde après le coup, et l'on ne comprend pas pourquoi l'image
ne se pose pas.

**La manette, le tactile, les touches.** La couche d'*actions* existait depuis
le premier jour — le jeu demande « est-ce que le joueur veut aller à droite » et
non « la flèche droite est-elle enfoncée » — et personne n'était jamais venu y
brancher autre chose qu'un clavier. Une manette s'*interroge* au pas et non à
l'image, sinon son état ne correspondrait plus à celui du clavier au même pas et
un rejeu ne reproduirait plus rien. Les zones tactiles sont en **fractions** de
la surface, pour que la même description marche sur un téléphone et sur une
tablette. Et le plan de touches est dans le fichier de projet : un plan figé rend
le jeu injouable pour une partie des gens, en silence.

## Dessiner, monter et régler dans l'éditeur

On pouvait créer une espèce sans écrire une ligne de TypeScript — et elle
empruntait forcément le dessin d'une autre. Trois ateliers referment ça.

**Le dessin** est le seul geste de l'éditeur qui ne passe **pas** par la
reconstruction du projet. Tous les autres transforment le fichier et relisent le
monde ; celui-ci ne peut pas, parce qu'on peint soixante pixels par seconde en
glissant la souris. On modifie donc la planche vivante et l'on refait l'atlas —
cent fois moins cher, et sans risque : une planche ne porte aucune référence
vers autre chose.

On peint une **lettre** et non une couleur. Un dessin est une grille de lettres,
et la clé dit quelle couleur chaque lettre porte ; peindre une couleur
directement obligerait à inventer une lettre par teinte. Le sous-produit est
qu'un dessin ne peut pas sortir de la palette.

**Le monteur d'animations** montre les **événements** — « le pied touche ici »,
« le coup porte là ». C'est ce qui le distingue d'un diaporama, et la seule
façon d'accorder un son à un dessin. Les cacher ferait régler les sons en
millisecondes, ce que tout le moteur existe pour éviter. Retirer une image
décale les événements suivants : ne pas les décaler ferait sonner le pas à la
mauvaise image, sans que rien ne le signale.

**Le réglage des sons** a un bouton *Écouter*, et ce n'est pas un agrément : un
son ne se règle pas par le raisonnement. On change une fréquence de cinquante
hertz, on écoute, on recommence. Sans ce bouton il faudrait relancer le jeu et
provoquer l'événement pour entendre chaque essai — le réglage deviendrait si
pénible que personne ne toucherait aux sons livrés.

## Ce qu'on affirmait sans l'avoir mesuré

« Soixante images par seconde » figurait dans ce README depuis le premier jour
et reposait sur ma parole. `npm run banc:charge` le mesure :

    300 créatures · 0,394 ms par pas · 42 pas de simulation par image
    4000 particules · 0,184 ms
    rembobinage de 16 pas · 1,05 ms
    un étage engendré · 2,47 ms

On mesure le **pas de simulation** et non l'image : le dessin dépend du
navigateur et de la machine, la simulation ne dépend que du code. Et l'on
mesure la **pente** du coût, pas seulement sa valeur : douze fois plus de
créatures pour cinq fois le temps. Un coût linéaire tient encore à mille ; un
coût quadratique s'écroule dès deux cents, et aurait donné cent quarante-quatre.

Les seuils sont larges à dessein. Une machine de compilation partagée n'est pas
une machine de joueur, et un seuil serré rendrait ce banc rouge une fois sur cinq
pour des raisons étrangères au code — un banc qui échoue au hasard cesse d'être
lu. Ils repèrent un décrochage franc, et le chiffre s'affiche toujours pour
qu'une dérive se voie même quand le banc passe.

## L'agent qui évalue, et qui reboucle

    npm run agent            # tout, navigateur compris
    npm run agent -- --rapide    # sans le navigateur
    npm run agent -- --ecrire    # met à jour docs/evaluation.{json,md}

Une note monte toute seule d'une itération à l'autre : on ajoute du code, on se
sent avancé, on écrit 7/10 là où l'on écrivait 6. Elle ne se contredit jamais,
donc elle n'apprend rien. Ce que l'agent produit n'est pas une note : c'est un
**état**, et la différence avec l'état précédent.

**Il ne juge pas, il cherche des preuves.** Un critère n'est pas tenu parce que
le code a l'air de le faire. Il est tenu quand il existe des vérifications qui
deviendraient rouges si la chose disparaissait, et que les symboles nommés
existent dans les sources. Chaque ligne du rapport est donc falsifiable : on
peut aller lire les preuves, et l'on peut les casser exprès pour voir le critère
tomber. C'est ce qu'on a fait — supprimer une vérification du banc fait sortir
l'agent en erreur, la remettre le fait taire.

C'est aussi ce qui rend le rebouclage utile. **Une preuve qui disparaît est une
régression que rien d'autre ne détecte** : les bancs restent verts, le build
passe, et l'on a simplement cessé de vérifier quelque chose. L'agent échoue
dans ce cas-là, exactement comme pour un banc rouge.

### Ce que le premier rebouclage a trouvé — dans l'agent lui-même

Le premier passage a nommé cinq critères où le code existait mais la preuve
manquait. On les a écrits — de vraies vérifications, jamais un élargissement
des indices : régler la mesure sur le résultat voulu la rend inutile.

Le deuxième passage a trouvé trois défauts, tous dans l'agent :

- **Il se lisait lui-même.** Un critère nommant le symbole `jouerSon` se
  déclarait tenu parce que le mot figurait… dans la ligne du critère. La mesure
  se satisfaisait de son propre énoncé, ce qui est la plus complète des
  illusions : elle passe au vert pour tout ce qu'on lui demande de chercher, et
  d'autant mieux qu'on lui en demande davantage.
- **Il comparait au mot près, non.** L'indice « son » se retrouvait dans
  « raison » et « moisson », « mur » dans « murale », « coup » dans
  « coupure » : trente et une preuves apparaissaient pour un critère qui n'en
  avait aucune. Une mesure trop indulgente est pire qu'une mesure absente, parce
  qu'elle rassure.
- **Il criait au loup.** Un passage sans navigateur, comparé à un passage
  complet, annonçait cinquante-cinq vérifications disparues. Un agent qui se
  trompe une fois sur deux cesse d'être lu — et c'est alors qu'il manque la
  vraie régression. Il refuse maintenant de comparer ce qui n'a pas tourné des
  deux côtés, et refuse d'enregistrer un relevé partiel.

Et une quatrième dans la langue : la normalisation Unicode sépare l'accent de
sa lettre mais ne touche pas à « œ ». L'agent déclarait donc manquante une
preuve nommée « un cœur posé par une salle dessinée » — accuser à tort est le
pire défaut d'une mesure.

### Où en est le projet, d'après lui

    Celeste — plateforme de précision              8/8
    The Binding of Isaac — salles engendrées       7/7
    Dead Cells — combat et corps                   6/6
    Faire un jeu sans lire le moteur               8/8
    Le multijoueur, et ce qu'il exige d'abord      6/6
    Ce qu'on affirme sans l'avoir mesuré           4/4
    Ce qu'un jeu de plateforme doit avoir          9/9
    Ce qu'un jeu a en plus de son gameplay        13/13
                                          692 vérifications

Les cinq critères ajoutés au dernier tour — musique, export `.wav`, traduction,
libellés jamais en clair, accord des six portages sur les notes et les textes —
sont partis rouges. L'un d'eux l'est resté après coup : le `.wav` était écrit,
branché sur les deux paquets, et **rien ne vérifiait que l'archive le
contenait**. Trois vérifications de plus, et le trou s'est fermé.

Le tour suivant a demandé les demi-pentes. Elles ont coûté trois défauts qui
dormaient depuis longtemps et qu'aucun banc ne regardait : une pente montant à
gauche que l'enregistrement transformait en mur, neuf drapeaux dans un tableau
d'octets, et six chargeurs qui comparaient une matière au caractère `'1'`. Aucun
des trois n'aurait été trouvé en écrivant les demi-pentes ; ils l'ont été en
écrivant les vérifications qui vont avec.

Elle est de nouveau entièrement verte, donc elle ne mesure plus rien. C'est le
moment de l'élargir, pas de s'en féliciter.

Le relevé complet est dans [`docs/evaluation.md`](docs/evaluation.md).

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
