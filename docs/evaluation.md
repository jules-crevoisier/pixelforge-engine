# Évaluation

<!-- Écrit par `npm run agent -- --ecrire`. Ne pas modifier à la main :
     ce fichier est un relevé, pas un document. -->

```

╭─ AGENT D’ÉVALUATION ────────────────────────────────────────────
│ 2026-09-11 · dernier passage 2026-09-11
╰─────────────────────────────────────────────────────────────────

LES ÉPREUVES
  vert   build                    —  3.6 s
  vert   banc                 83/83  0.3 s
  vert   banc:plateforme      68/68  0.3 s
  vert   banc:mondes        431/431  1.6 s
  vert   banc:langages      100/100  2.3 s
  vert   banc:reseau          33/33  0.4 s
  vert   banc:habillage     112/112  0.3 s
  vert   banc:charge          17/17  1.5 s
  vert   banc:image           30/30  0.2 s
  vert   banc:deploiement       9/9  7.1 s
  vert   fumee              131/131  96.3 s
  1014 vérifications au total, 0 rouge(s)

CE QUE LE PROJET SAIT FAIRE
  Un critère n’est tenu que s’il existe des vérifications qui tomberaient
  sans lui. C’est pourquoi il se lit « n preuves » et non « fait ».

  Celeste — plateforme de précision — 14/14
    ✓ Contrôleur nerveux : coyote, tampon, hauteur variable 6 preuves
    ✓ Dash directionnel, avec récupération                 5 preuves
    ✓ Saut mural et glissade                               23 preuves
    ✓ Correction de coin                                   11 preuves
    ✓ Pointes, mort et point de reprise                    11 preuves
    ✓ Plateformes à sens unique, et descente volontaire    9 preuves
    ✓ Plateformes mobiles qui portent                      9 preuves
    ✓ Les créatures contournent ce qui les bloque          16 preuves
    ✓ Et cette navigation ne coûte rien par ennemi de plus 3 preuves
    ✓ Un chapitre en TABLEAUX posés à la main, pas une grille 52 preuves
    ✓ La caméra s’arrête au bord du tableau, et y glisse   2 preuves
    ✓ Mourir renvoie à l’entrée du tableau, pas au départ du chapitre 6 preuves
    ✓ Et le chapitre se grimpe vraiment, avec le vrai contrôleur 2 preuves
    ✓ Niveaux vérifiés franchissables, pas seulement dessinés 7 preuves

  The Binding of Isaac — salles engendrées — 7/7
    ✓ Plan d’étage reproductible depuis une graine         5 preuves
    ✓ Rôles de salle : départ, boss, trésor, boutique      3 preuves
    ✓ Aucune salle injoignable, vérifié case par case      2 preuves
    ✓ Salles écrites à la main, tirées et retournées       7 preuves
    ✓ Caméra verrouillée sur la salle                      42 preuves
    ✓ Tirs, projectiles et ennemis qui annoncent           6 preuves
    ✓ Ramassages et soin                                   4 preuves

  Dead Cells — combat et corps — 6/6
    ✓ Frappes à durée, poussée, invulnérabilité            20 preuves
    ✓ Machines à états par espèce, déclencheurs sur l’image 9 preuves
    ✓ Entités solides : caisses, obstacles mobiles         5 preuves
    ✓ Piétinement et rebond                                11 preuves
    ✓ Pesanteur pour les créatures, en vue de côté         4 preuves
    ✓ Armes et portée réglées, pas devinées                18 preuves

  Faire un jeu sans lire le moteur — 13/13
    ✓ Partir d’un projet vide                              6 preuves
    ✓ Redimensionner la carte, gérer les calques           24 preuves
    ✓ Créer une espèce sans écrire de code                 28 preuves
    ✓ Poser et déplacer une entité à la souris             13 preuves
    ✓ Défaire et refaire, y compris sur les entités        13 preuves
    ✓ Un projet se ferme, se rouvre, se joue               39 preuves
    ✓ Une aide qui dit dans quel ordre s’y prendre         4 preuves
    ✓ Export vers un moteur du commerce                    20 preuves
    ✓ Le comportement d’une espèce peut être un script à soi 5 preuves
    ✓ La physique du contrôleur se règle par espèce, et ça se mesure 3 preuves
    ✓ L’épée, les cœurs, la réapparition et les pointes se débrayent 4 preuves
    ✓ Les fichiers se voient, s’ouvrent et se déposent, comme dans un moteur 4 preuves
    ✓ La feuille blanche : partir sans un seul asset de démonstration 10 preuves

  Le multijoueur, et ce qu’il exige d’abord — 6/6
    ✓ Simulation à pas fixe, hasard reproductible          5 preuves
    ✓ Entrées déterministes : aucune horloge murale dans la simulation 23 preuves
    ✓ Instantané et rejeu de l’état d’un pas               19 preuves
    ✓ Transport réseau, avec latence, gigue et pertes      6 preuves
    ✓ Le vrai moteur se rembobine, pas seulement un jouet  3 preuves
    ✓ Plusieurs personnages dirigeables, chacun ses touches 6 preuves

  Le déployer sans que ça casse en production — 4/4
    ✓ Une image qui ne contient que ce qu’elle sert        47 preuves
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
    ✓ L’art dessiné ailleurs entre dans le projet          12 preuves
    ✓ Des déclencheurs : les événements du niveau en données 24 preuves
    ✓ Un script peut tout ce qu’un jeu fait                2 preuves
    ✓ Plusieurs cartes, un déroulé : un projet devient un jeu 16 preuves
    ✓ Une lumière fidèle à la palette, au prix mesuré      31 preuves
    ✓ Un jeu-témoin complet, joué par les bancs            13 preuves
    ✓ Un projet relu meurt et REVIENT, comme un vrai jeu   18 preuves
    ✓ Salles et lumière par carte : la carte partout       8 preuves
    ✓ Peindre autrement que case par case                  11 preuves
    ✓ Et découper un niveau en tableaux, à la souris       4 preuves
    ✓ Les textes et les musiques s’écrivent dans l’éditeur 6 preuves
    ✓ Le premier lancement se comprend sans rien apprendre 4 preuves
    ✓ Dessiner, monter et régler dans l’éditeur            6 preuves

  Ce qu’un jeu a en plus de son gameplay — 14/14
    ✓ Une fonte de pixels, accents français compris        5 preuves
    ✓ Son : décrit en données, attaché aux événements d’animation 86 preuves
    ✓ Et un son ne se rejoue pas quand le réseau rembobine 6 preuves
    ✓ Particules et effets                                 8 preuves
    ✓ Dialogue : frappe, coupure, choix                    19 preuves
    ✓ Sauvegarde de la PARTIE, distincte du projet         13 preuves
    ✓ Et tout cela traverse l’enregistrement du projet     3 preuves
    ✓ Menus : curseur qui boucle, entrées inertes          7 preuves
    ✓ Musique écrite en notes, pas en fichier d’onde       29 preuves
    ✓ Et l’export la donne en .wav, que tout moteur sait lire 7 preuves
    ✓ Traduction : une clef par texte, et ce qui manque se VOIT 14 preuves
    ✓ Aucun libellé du jeu n’est écrit en clair dans le code 2 preuves
    ✓ Un jeu à plusieurs niveaux s’exporte entier          4 preuves
    ✓ Les six portages retrouvent musiques et textes, à l’identique 11 preuves

CE QU’IL RESTE À FAIRE, DANS L’ORDRE
  Rien de la grille. C’est le moment d’élargir la grille, pas de se féliciter :
  une grille entièrement verte ne mesure plus rien.

CE QUI A BOUGÉ
  ↑ 4 vérification(s) de plus
      le panneau Fichiers inventorie le projet : cartes, planches, espèces, sons…
      cliquer une planche du panneau Fichiers ouvre l’atelier de dessin DESSUS
      déposer une image sur la page en fait une planche, et le voile se retire
      déposer un .json ouvre le projet, comme « Ouvrir » l’aurait fait
  + critère nouveau : Les fichiers se voient, s’ouvrent et se déposent, comme dans un moteur

VERDICT : tout est vert · 89/89 critères tenus · 1014 vérifications

```
