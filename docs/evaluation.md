# Évaluation

<!-- Écrit par `npm run agent -- --ecrire`. Ne pas modifier à la main :
     ce fichier est un relevé, pas un document. -->

```

╭─ AGENT D’ÉVALUATION ────────────────────────────────────────────
│ 2026-09-10 · dernier passage 2026-09-10
╰─────────────────────────────────────────────────────────────────

LES ÉPREUVES
  vert   build                    —  3.7 s
  vert   banc                 82/82  0.4 s
  vert   banc:plateforme      40/40  0.4 s
  vert   banc:mondes        203/203  1.9 s
  vert   banc:langages        66/66  1.6 s
  vert   banc:reseau          31/31  0.5 s
  vert   banc:habillage       53/53  0.4 s
  vert   fumee                65/65  33.0 s
  540 vérifications au total, 0 rouge(s)

CE QUE LE PROJET SAIT FAIRE
  Un critère n’est tenu que s’il existe des vérifications qui tomberaient
  sans lui. C’est pourquoi il se lit « n preuves » et non « fait ».

  Celeste — plateforme de précision — 8/8
    ✓ Contrôleur nerveux : coyote, tampon, hauteur variable 5 preuves
    ✓ Dash directionnel, avec récupération                 5 preuves
    ✓ Saut mural et glissade                               12 preuves
    ✓ Correction de coin                                   9 preuves
    ✓ Pointes, mort et point de reprise                    7 preuves
    ✓ Plateformes à sens unique, et descente volontaire    8 preuves
    ✓ Plateformes mobiles qui portent                      9 preuves
    ✓ Niveaux vérifiés franchissables, pas seulement dessinés 7 preuves

  The Binding of Isaac — salles engendrées — 7/7
    ✓ Plan d’étage reproductible depuis une graine         5 preuves
    ✓ Rôles de salle : départ, boss, trésor, boutique      3 preuves
    ✓ Aucune salle injoignable, vérifié case par case      2 preuves
    ✓ Salles écrites à la main, tirées et retournées       7 preuves
    ✓ Caméra verrouillée sur la salle                      13 preuves
    ✓ Tirs, projectiles et ennemis qui annoncent           5 preuves
    ✓ Ramassages et soin                                   2 preuves

  Dead Cells — combat et corps — 6/6
    ✓ Frappes à durée, poussée, invulnérabilité            13 preuves
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
    ✓ Un projet se ferme, se rouvre, se joue               17 preuves
    ✓ Une aide qui dit dans quel ordre s’y prendre         3 preuves
    ✓ Export vers un moteur du commerce                    11 preuves

  Le multijoueur, et ce qu’il exige d’abord — 5/5
    ✓ Simulation à pas fixe, hasard reproductible          5 preuves
    ✓ Entrées déterministes : aucune horloge murale dans la simulation 16 preuves
    ✓ Instantané et rejeu de l’état d’un pas               10 preuves
    ✓ Transport réseau, avec latence, gigue et pertes      6 preuves
    ✓ Le vrai moteur se rembobine, pas seulement un jouet  3 preuves

  Ce qu’un jeu a en plus de son gameplay — 7/7
    ✓ Une fonte de pixels, accents français compris        4 preuves
    ✓ Son : décrit en données, attaché aux événements d’animation 42 preuves
    ✓ Et un son ne se rejoue pas quand le réseau rembobine 2 preuves
    ✓ Particules et effets                                 7 preuves
    ✓ Dialogue : frappe, coupure, choix                    5 preuves
    ✓ Sauvegarde de la PARTIE, distincte du projet         9 preuves
    ✓ Menus : curseur qui boucle, entrées inertes          5 preuves

CE QU’IL RESTE À FAIRE, DANS L’ORDRE
  Rien de la grille. C’est le moment d’élargir la grille, pas de se féliciter :
  une grille entièrement verte ne mesure plus rien.

CE QUI A BOUGÉ
  Rien. Ni gagné, ni perdu.

VERDICT : tout est vert · 41/41 critères tenus · 540 vérifications

```
