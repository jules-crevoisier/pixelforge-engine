# Évaluation

<!-- Écrit par `npm run agent -- --ecrire`. Ne pas modifier à la main :
     ce fichier est un relevé, pas un document. -->

```

╭─ AGENT D’ÉVALUATION ────────────────────────────────────────────
│ 2026-09-10 · dernier passage 2026-09-10
╰─────────────────────────────────────────────────────────────────

LES ÉPREUVES
  vert   build                    —  3.0 s
  vert   banc                 82/82  0.3 s
  vert   banc:plateforme      51/51  0.3 s
  vert   banc:mondes        207/207  1.4 s
  vert   banc:langages        66/66  1.2 s
  vert   banc:reseau          33/33  0.4 s
  vert   banc:habillage       72/72  0.3 s
  vert   banc:charge            9/9  1.0 s
  vert   fumee                72/72  35.2 s
  592 vérifications au total, 0 rouge(s)

CE QUE LE PROJET SAIT FAIRE
  Un critère n’est tenu que s’il existe des vérifications qui tomberaient
  sans lui. C’est pourquoi il se lit « n preuves » et non « fait ».

  Celeste — plateforme de précision — 8/8
    ✓ Contrôleur nerveux : coyote, tampon, hauteur variable 6 preuves
    ✓ Dash directionnel, avec récupération                 5 preuves
    ✓ Saut mural et glissade                               14 preuves
    ✓ Correction de coin                                   9 preuves
    ✓ Pointes, mort et point de reprise                    8 preuves
    ✓ Plateformes à sens unique, et descente volontaire    8 preuves
    ✓ Plateformes mobiles qui portent                      9 preuves
    ✓ Niveaux vérifiés franchissables, pas seulement dessinés 7 preuves

  The Binding of Isaac — salles engendrées — 7/7
    ✓ Plan d’étage reproductible depuis une graine         5 preuves
    ✓ Rôles de salle : départ, boss, trésor, boutique      3 preuves
    ✓ Aucune salle injoignable, vérifié case par case      2 preuves
    ✓ Salles écrites à la main, tirées et retournées       7 preuves
    ✓ Caméra verrouillée sur la salle                      14 preuves
    ✓ Tirs, projectiles et ennemis qui annoncent           5 preuves
    ✓ Ramassages et soin                                   2 preuves

  Dead Cells — combat et corps — 6/6
    ✓ Frappes à durée, poussée, invulnérabilité            15 preuves
    ✓ Machines à états par espèce, déclencheurs sur l’image 9 preuves
    ✓ Entités solides : caisses, obstacles mobiles         5 preuves
    ✓ Piétinement et rebond                                8 preuves
    ✓ Pesanteur pour les créatures, en vue de côté         2 preuves
    ✓ Armes et portée réglées, pas devinées                11 preuves

  Faire un jeu sans lire le moteur — 8/8
    ✓ Partir d’un projet vide                              4 preuves
    ✓ Redimensionner la carte, gérer les calques           13 preuves
    ✓ Créer une espèce sans écrire de code                 13 preuves
    ✓ Poser et déplacer une entité à la souris             13 preuves
    ✓ Défaire et refaire, y compris sur les entités        11 preuves
    ✓ Un projet se ferme, se rouvre, se joue               20 preuves
    ✓ Une aide qui dit dans quel ordre s’y prendre         3 preuves
    ✓ Export vers un moteur du commerce                    11 preuves

  Le multijoueur, et ce qu’il exige d’abord — 6/6
    ✓ Simulation à pas fixe, hasard reproductible          5 preuves
    ✓ Entrées déterministes : aucune horloge murale dans la simulation 18 preuves
    ✓ Instantané et rejeu de l’état d’un pas               12 preuves
    ✓ Transport réseau, avec latence, gigue et pertes      6 preuves
    ✓ Le vrai moteur se rembobine, pas seulement un jouet  3 preuves
    ✓ Plusieurs personnages dirigeables, chacun ses touches 3 preuves

  Ce qu’on affirme sans l’avoir mesuré — 4/4
    ✓ La cadence est mesurée, pas promise                  3 preuves
    ✓ Le coût croît linéairement avec le nombre d’entités  1 preuves
    ✓ Un rembobinage tient dans une image                  2 preuves
    ✓ Un étage s’engendre sans attente                     1 preuves

  Ce qu’un jeu de plateforme doit avoir — 5/5
    ✓ Des pentes qu’on monte en marchant                   6 preuves
    ✓ Le hit-stop : un coup qui porte au lieu de traverser 5 preuves
    ✓ Une secousse de caméra entière et reproductible      2 preuves
    ✓ Manette, tactile et touches remappables              3 preuves
    ✓ Dessiner, monter et régler dans l’éditeur            5 preuves

  Ce qu’un jeu a en plus de son gameplay — 8/8
    ✓ Une fonte de pixels, accents français compris        4 preuves
    ✓ Son : décrit en données, attaché aux événements d’animation 48 preuves
    ✓ Et un son ne se rejoue pas quand le réseau rembobine 2 preuves
    ✓ Particules et effets                                 8 preuves
    ✓ Dialogue : frappe, coupure, choix                    7 preuves
    ✓ Sauvegarde de la PARTIE, distincte du projet         9 preuves
    ✓ Et tout cela traverse l’enregistrement du projet     3 preuves
    ✓ Menus : curseur qui boucle, entrées inertes          5 preuves

CE QU’IL RESTE À FAIRE, DANS L’ORDRE
  Rien de la grille. C’est le moment d’élargir la grille, pas de se féliciter :
  une grille entièrement verte ne mesure plus rien.

CE QUI A BOUGÉ
  + épreuve nouvelle : banc:charge
  ↑ 43 vérification(s) de plus
      une pente montante donne un sol qui monte d’un pixel par colonne
      et la pente inverse descend d’autant
      un solide a son sol tout en haut de la case
      et le vide n’a pas de sol
      le plan des pentes est bien rectangulaire
      une pente n’arrête pas comme un mur
  + critère nouveau : Plusieurs personnages dirigeables, chacun ses touches
  + critère nouveau : La cadence est mesurée, pas promise
  + critère nouveau : Le coût croît linéairement avec le nombre d’entités
  + critère nouveau : Un rembobinage tient dans une image
  + critère nouveau : Un étage s’engendre sans attente
  + critère nouveau : Des pentes qu’on monte en marchant
  + critère nouveau : Le hit-stop : un coup qui porte au lieu de traverser
  + critère nouveau : Une secousse de caméra entière et reproductible
  + critère nouveau : Manette, tactile et touches remappables
  + critère nouveau : Dessiner, monter et régler dans l’éditeur
  + critère nouveau : Et tout cela traverse l’enregistrement du projet

VERDICT : tout est vert · 52/52 critères tenus · 592 vérifications

```
