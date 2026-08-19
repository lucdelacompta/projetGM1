# Barème de notation

Chaque participation à une rencontre porte deux notes :

* `rating` — la **note attribuée** par l'utilisateur, de 0 à 10 par demi-points. C'est elle qui
  fait foi partout (moyennes, classements, homme du match).
* `auto_rating` — la **note proposée** par le barème, recalculée automatiquement à chaque
  modification de la feuille de match, du score ou des faits de jeu. Elle s'affiche en italique
  tant qu'elle n'a pas été validée.

Le bouton « Appliquer aux joueurs non notés » recopie la note proposée dans la note attribuée,
sans jamais écraser une note déjà saisie.

## Calcul (`server/src/domain/rating.ts`)

Départ à **5,5**, puis :

| Élément | Effet |
| --- | --- |
| Résultat de l'équipe | +0,4 victoire, 0 nul, −0,3 défaite, **au prorata du temps joué** |
| But | +3,0 gardien · +1,5 défenseur · +1,2 milieu · +1,0 attaquant |
| Passe décisive | +0,7 |
| But contre son camp | −1,2 |
| Penalty manqué | −0,8 |
| Penalty arrêté | +1,2 |
| Carton jaune | −0,4 |
| Second avertissement | −1,2 |
| Carton rouge | −1,6 |
| Clean sheet (≥ 60 min jouées) | +1,0 gardien · +0,7 défenseur · +0,2 milieu |
| Buts encaissés (≥ 60 min, défensifs) | −0,35 par but pour le gardien, −0,15 pour un défenseur |
| Capitaine | +0,1 |
| Temps de jeu < 25 min | la note est ramenée vers 5,5 proportionnellement au temps joué |

Le résultat est borné entre 0 et 10 puis arrondi au demi-point. Un remplaçant non entré n'est pas
noté (`auto_rating` reste vide et le joueur n'apparaît pas dans les moyennes).

Le barème est une constante exportée (`DEFAULT_SCALE`) : le modifier suffit à ajuster toute
l'application, et `computeAutoRating` renvoie le détail du calcul (`breakdown`) pour pouvoir
l'expliquer ligne par ligne.

## Moyennes

Les moyennes sont **pondérées par le temps de jeu**, avec un plancher de 15 minutes par
participation : une entrée en jeu de dix minutes notée 4 ne pénalise pas autant qu'un match
complet. La moyenne d'un joueur combine notes attribuées et, à défaut, notes proposées.

## Homme du match

La meilleure note de la rencontre parmi les joueurs ayant disputé **au moins 45 minutes**, note
attribuée en priorité, note proposée sinon.

## Joueurs utilisés

Le tableau « joueurs utilisés » d'une équipe agrège toutes les feuilles retranscrites :

| Colonne | Contenu |
| --- | --- |
| M | rencontres disputées (titularisations + entrées en jeu) |
| Min | minutes cumulées |
| B / PD | buts, passes décisives |
| Cartons | jaunes et rouges |
| Moy. | moyenne pondérée |
| Forme | cinq dernières notes, en histogramme |

Les présences sur le banc sans entrer en jeu sont comptées à part : elles ne gonflent ni le nombre
de matchs ni les moyennes, mais restent visibles pour mesurer la rotation de l'effectif.
