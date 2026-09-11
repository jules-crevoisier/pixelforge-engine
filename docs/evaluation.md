# Évaluation

<!-- Écrit par `npm run agent -- --ecrire`. Ne pas modifier à la main :
     ce fichier est un relevé, pas un document. -->

```

╭─ AGENT D’ÉVALUATION ────────────────────────────────────────────
│ 2026-09-11 · dernier passage 2026-09-11
╰─────────────────────────────────────────────────────────────────

LES ÉPREUVES
  vert   build                    —  4.3 s
  vert   banc                 83/83  0.3 s
  vert   banc:plateforme      68/68  0.3 s
  vert   banc:mondes        572/572  1.8 s
  vert   banc:langages      104/104  1.7 s
  vert   banc:reseau          33/33  0.4 s
  vert   banc:habillage     112/112  0.4 s
  vert   banc:charge          23/23  1.9 s
  vert   banc:image           30/30  0.2 s
  vert   banc:deploiement     12/12  8.5 s
  vert   fumee              260/260  177.6 s
  1297 vérifications au total, 0 rouge(s)

CE QUE LE PROJET SAIT FAIRE
  Un critère n’est tenu que s’il existe des vérifications qui tomberaient
  sans lui. C’est pourquoi il se lit « n preuves » et non « fait ».

  Celeste — plateforme de précision — 14/14
    ✓ Contrôleur nerveux : coyote, tampon, hauteur variable 6 preuves
    ✓ Dash directionnel, avec récupération                 5 preuves
    ✓ Saut mural et glissade                               24 preuves
    ✓ Correction de coin                                   13 preuves
    ✓ Pointes, mort et point de reprise                    12 preuves
    ✓ Plateformes à sens unique, et descente volontaire    9 preuves
    ✓ Plateformes mobiles qui portent                      9 preuves
    ✓ Les créatures contournent ce qui les bloque          17 preuves
    ✓ Et cette navigation ne coûte rien par ennemi de plus 3 preuves
    ✓ Un chapitre en TABLEAUX posés à la main, pas une grille 62 preuves
    ✓ La caméra s’arrête au bord du tableau, et y glisse   2 preuves
    ✓ Mourir renvoie à l’entrée du tableau, pas au départ du chapitre 6 preuves
    ✓ Et le chapitre se grimpe vraiment, avec le vrai contrôleur 2 preuves
    ✓ Niveaux vérifiés franchissables, pas seulement dessinés 7 preuves

  The Binding of Isaac — salles engendrées — 7/7
    ✓ Plan d’étage reproductible depuis une graine         5 preuves
    ✓ Rôles de salle : départ, boss, trésor, boutique      3 preuves
    ✓ Aucune salle injoignable, vérifié case par case      2 preuves
    ✓ Salles écrites à la main, tirées et retournées       12 preuves
    ✓ Caméra verrouillée sur la salle                      49 preuves
    ✓ Tirs, projectiles et ennemis qui annoncent           6 preuves
    ✓ Ramassages et soin                                   4 preuves

  Dead Cells — combat et corps — 6/6
    ✓ Frappes à durée, poussée, invulnérabilité            21 preuves
    ✓ Machines à états par espèce, déclencheurs sur l’image 9 preuves
    ✓ Entités solides : caisses, obstacles mobiles         5 preuves
    ✓ Piétinement et rebond                                11 preuves
    ✓ Pesanteur pour les créatures, en vue de côté         4 preuves
    ✓ Armes et portée réglées, pas devinées                20 preuves

  Faire un jeu sans lire le moteur — 33/33
    ✓ Partir d’un projet vide                              8 preuves
    ✓ Redimensionner la carte, gérer les calques           26 preuves
    ✓ Créer une espèce sans écrire de code                 41 preuves
    ✓ Poser et déplacer une entité à la souris             33 preuves
    ✓ Défaire et refaire, y compris sur les entités        37 preuves
    ✓ Un projet se ferme, se rouvre, se joue               47 preuves
    ✓ Une aide qui dit dans quel ordre s’y prendre         4 preuves
    ✓ Export vers un moteur du commerce                    20 preuves
    ✓ Le bureau : Linux, Windows, macOS par l’échafaudage Electron 4 preuves
    ✓ Le code s’édite dehors : scripts en fichiers, relus à chaque Jouer 8 preuves
    ✓ Livrer : le jeu web en un fichier, qui tourne chez un joueur 5 preuves
    ✓ Le comportement d’une espèce peut être un script à soi 5 preuves
    ✓ La physique du contrôleur se règle par espèce, et ça se mesure 3 preuves
    ✓ L’épée, les cœurs, la réapparition et les pointes se débrayent 4 preuves
    ✓ Les fichiers se voient, s’ouvrent et se déposent, comme dans un moteur 4 preuves
    ✓ Les niveaux de Tiled et de LDtk entrent, jouables    5 preuves
    ✓ L’arbre de scène : retrouver, renommer, cacher, réordonner, retirer 11 preuves
    ✓ Les assemblages : un prefab qui se pose depuis la palette 6 preuves
    ✓ L’audio enregistré entre aussi : un .wav devient un son du projet 5 preuves
    ✓ Un seul journal : le Ctrl+Z traverse une reconstruction du projet 10 preuves
    ✓ L’inspecteur : ce qu’un nœud porte se lit et se règle 7 preuves
    ✓ Le clavier agit sur le nœud choisi : flèches, Suppr, Ctrl+D, F 10 preuves
    ✓ La console dit ce qui ne va pas, et le garde         11 preuves
    ✓ L’arbre COMPOSE : créer un nœud, changer son parent en le glissant 12 preuves
    ✓ Renommer SUIT les références — et dit ce qu’il n’a pas su suivre 14 preuves
    ✓ Figer une image, et l’avancer d’un pas               8 preuves
    ✓ Le brouillon : un onglet fermé ne coûte pas l’heure qu’on vient de passer 9 preuves
    ✓ Copier-coller des nœuds, d’une scène à l’autre       9 preuves
    ✓ Trouver : un seul champ pour tout ce que le projet nomme 12 preuves
    ✓ Plusieurs nœuds à la fois : rectangle, Ctrl+clic, et un seul geste 8 preuves
    ✓ Les salles se tirent à la souris : déplacer, retailler, défaire 8 preuves
    ✓ Voir ce qu’on s’apprête à poser, et qui l’on règle   2 preuves
    ✓ La feuille blanche : partir sans un seul asset de démonstration 10 preuves

  Le multijoueur, et ce qu’il exige d’abord — 6/6
    ✓ Simulation à pas fixe, hasard reproductible          6 preuves
    ✓ Entrées déterministes : aucune horloge murale dans la simulation 24 preuves
    ✓ Instantané et rejeu de l’état d’un pas               19 preuves
    ✓ Transport réseau, avec latence, gigue et pertes      6 preuves
    ✓ Le vrai moteur se rembobine, pas seulement un jouet  4 preuves
    ✓ Plusieurs personnages dirigeables, chacun ses touches 6 preuves

  Le déployer sans que ça casse en production — 4/4
    ✓ Une image qui ne contient que ce qu’elle sert        49 preuves
    ✓ Toute page du dépôt entre dans l’image, sans qu’on la nomme 2 preuves
    ✓ L’application vit sous les en-têtes réels, pas seulement en local 5 preuves
    ✓ Le fond défile moins vite que le sol, et on l’a mesuré 12 preuves

  Ce qu’on affirme sans l’avoir mesuré — 4/4
    ✓ La cadence est mesurée, pas promise                  4 preuves
    ✓ Le coût croît linéairement avec le nombre d’entités  1 preuves
    ✓ Un rembobinage tient dans une image                  2 preuves
    ✓ Un étage s’engendre sans attente                     1 preuves

  Ce qu’un jeu de plateforme doit avoir — 21/21
    ✓ Des pentes qu’on monte en marchant                   23 preuves
    ✓ Des demi-pentes : deux cases pour monter d’une       8 preuves
    ✓ On ne décolle pas pour une marche d’un pixel         2 preuves
    ✓ Une matière survit à l’écriture en un caractère      9 preuves
    ✓ Et les six portages lisent la même collision         7 preuves
    ✓ Le hit-stop : un coup qui porte au lieu de traverser 6 preuves
    ✓ Une secousse de caméra entière et reproductible      2 preuves
    ✓ Manette, tactile et touches remappables              4 preuves
    ✓ L’art dessiné ailleurs entre dans le projet          14 preuves
    ✓ Des déclencheurs : les événements du niveau en données 25 preuves
    ✓ Un script peut tout ce qu’un jeu fait                2 preuves
    ✓ Plusieurs cartes, un déroulé : un projet devient un jeu 19 preuves
    ✓ Une lumière fidèle à la palette, au prix mesuré      32 preuves
    ✓ Un jeu-témoin complet, joué par les bancs            15 preuves
    ✓ Un projet relu meurt et REVIENT, comme un vrai jeu   18 preuves
    ✓ Salles et lumière par carte : la carte partout       8 preuves
    ✓ Peindre autrement que case par case                  12 preuves
    ✓ Et découper un niveau en tableaux, à la souris       4 preuves
    ✓ Les textes et les musiques s’écrivent dans l’éditeur 6 preuves
    ✓ Le premier lancement se comprend sans rien apprendre 4 preuves
    ✓ Dessiner, monter et régler dans l’éditeur            6 preuves

  Ce qu’un jeu a en plus de son gameplay — 14/14
    ✓ Une fonte de pixels, accents français compris        5 preuves
    ✓ Son : décrit en données, attaché aux événements d’animation 109 preuves
    ✓ Et un son ne se rejoue pas quand le réseau rembobine 6 preuves
    ✓ Particules et effets                                 8 preuves
    ✓ Dialogue : frappe, coupure, choix                    21 preuves
    ✓ Sauvegarde de la PARTIE, distincte du projet         16 preuves
    ✓ Et tout cela traverse l’enregistrement du projet     3 preuves
    ✓ Menus : curseur qui boucle, entrées inertes          14 preuves
    ✓ Musique écrite en notes, pas en fichier d’onde       30 preuves
    ✓ Et l’export la donne en .wav, que tout moteur sait lire 12 preuves
    ✓ Traduction : une clef par texte, et ce qui manque se VOIT 14 preuves
    ✓ Aucun libellé du jeu n’est écrit en clair dans le code 2 preuves
    ✓ Un jeu à plusieurs niveaux s’exporte entier          4 preuves
    ✓ Les six portages retrouvent musiques et textes, à l’identique 11 preuves

CE QU’IL RESTE À FAIRE, DANS L’ORDRE
  Rien de la grille. C’est le moment d’élargir la grille, pas de se féliciter :
  une grille entièrement verte ne mesure plus rien.

CE QUI A BOUGÉ
  ↑ 218 vérification(s) de plus
      apres une reconstruction, le tableau vise n'est plus le meme objet
      defaire ecrit dans le tableau D'AUJOURD'HUI, pas dans celui d'hier
      et l'ancien tableau, lui, n'est pas touche
      refaire le repose au meme endroit
      une adresse morte n'ecrit RIEN plutot que d'ecrire au hasard
      un geste sans adresse retombe sur sa reference : rien n'est casse
  + critère nouveau : Un seul journal : le Ctrl+Z traverse une reconstruction du projet
  + critère nouveau : L’inspecteur : ce qu’un nœud porte se lit et se règle
  + critère nouveau : Le clavier agit sur le nœud choisi : flèches, Suppr, Ctrl+D, F
  + critère nouveau : La console dit ce qui ne va pas, et le garde
  + critère nouveau : L’arbre COMPOSE : créer un nœud, changer son parent en le glissant
  + critère nouveau : Renommer SUIT les références — et dit ce qu’il n’a pas su suivre
  + critère nouveau : Figer une image, et l’avancer d’un pas
  + critère nouveau : Le brouillon : un onglet fermé ne coûte pas l’heure qu’on vient de passer
  + critère nouveau : Copier-coller des nœuds, d’une scène à l’autre
  + critère nouveau : Trouver : un seul champ pour tout ce que le projet nomme
  + critère nouveau : Plusieurs nœuds à la fois : rectangle, Ctrl+clic, et un seul geste
  + critère nouveau : Les salles se tirent à la souris : déplacer, retailler, défaire
  + critère nouveau : Voir ce qu’on s’apprête à poser, et qui l’on règle

VERDICT : tout est vert · 109/109 critères tenus · 1297 vérifications

```
