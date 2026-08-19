# L'API publique de la FFF (DOFA)

Le site fff.fr et l'application mobile de la fédération s'appuient sur une API accessible sans
authentification : `https://api-dofa.fff.fr/api`. C'est cette source qu'utilise AmateurScore.

Elle est construite avec **API Platform** : les collections répondent au format Hydra / JSON-LD
(`hydra:member`, `hydra:view`), la pagination se fait avec `?page=N`. Aucun contrat public n'est
publié : les noms de champs peuvent varier d'un point d'entrée à l'autre, et changer sans préavis.

## Nomenclature des identifiants

| Code | Signification | Où le trouver |
| --- | --- | --- |
| `cl_no` | numéro de club | URL d'une fiche club sur fff.fr |
| `cp_no` | numéro de compétition | URL d'une poule / d'un championnat |
| `ph_no` | numéro de phase (1, 2, …) | idem |
| `po_no` | numéro de poule | idem |
| `ma_no` | numéro de rencontre | URL d'une fiche match |
| numéro d'équipe | 1 = équipe première, 2 = équipe réserve, … | fiche club |

## Points d'entrée utilisés

Ils sont regroupés dans [`server/src/fff/endpoints.ts`](../server/src/fff/endpoints.ts) :

| Fonction | Chemin |
| --- | --- |
| Fiche club | `/clubs/{cl_no}` |
| Équipes d'un club | `/clubs/{cl_no}/equipes` |
| Terrains d'un club | `/clubs/{cl_no}/terrains` |
| Engagements d'un club | `/clubs/{cl_no}/engagements` |
| Calendrier d'une équipe | `/clubs/{cl_no}/equipes/{n}/matchs` |
| Résultats d'une équipe | `/clubs/{cl_no}/equipes/{n}/resultats` |
| Prochaines rencontres | `/clubs/{cl_no}/equipes/{n}/prochains_matchs` |
| Compétition | `/compets/{cp_no}` |
| Rencontres d'une poule | `/compets/{cp_no}/phases/{ph_no}/poules/{po_no}/matchs` |
| Classement d'une poule | `/compets/{cp_no}/phases/{ph_no}/poules/{po_no}/classement_journees` |
| Équipes d'une poule | `/compets/{cp_no}/phases/{ph_no}/poules/{po_no}/equipes` |
| Fiche rencontre | `/matchs/{ma_no}` |
| Ligues / districts | `/ligues`, `/districts` |

Si un chemin évolue, **une seule constante est à corriger** : le reste du code ne connaît que les
fonctions de `ENDPOINTS`.

## Robustesse de la lecture

`server/src/fff/mappers.ts` ne suppose jamais un nom de champ unique. Chaque valeur est cherchée
parmi plusieurs orthographes plausibles :

```ts
pickString(raw, 'name', 'libelle', 'nom', 'club.name');
pickNumber(raw, 'home_score', 'score_home', 'nb_but_dom');
```

Les statuts FFF sont traduits vers le modèle interne (`A` à venir, `J` jouée, `R` reportée,
`F` forfait, `I` annulée, `M` en cours). Une rencontre illisible est ignorée et signalée dans le
rapport d'import plutôt que de faire échouer l'ensemble.

## Politesse et robustesse réseau

Le client (`server/src/fff/client.ts`) applique :

* une **file d'attente** garantissant un délai minimum entre deux requêtes (`FFF_RATE_LIMIT_MS`,
  600 ms par défaut) ;
* un **cache disque** par URL (`FFF_CACHE_TTL`, une heure par défaut) ;
* **trois tentatives** avec repli exponentiel sur `429` et `5xx`, aucune sur `4xx` ;
* un **délai maximum** par requête (`FFF_TIMEOUT_MS`) ;
* un `User-Agent` identifiable, à renseigner avec un contact réel.

## Mode hors-ligne

`FFF_OFFLINE=1` fait lire les fixtures de `server/src/fff/fixtures/` au lieu du réseau. Le nom du
fichier reprend le chemin, séparateurs remplacés par `_` :

```
/clubs/553               -> clubs_553.json
/clubs/553/equipes       -> clubs_553_equipes.json
/clubs/553/equipes/1/matchs -> clubs_553_equipes_1_matchs.json
```

Ce mode sert à deux choses : faire tourner l'import sans accès sortant, et alimenter les tests
d'intégration (`server/test/sync.test.ts`) avec des réponses réalistes.

## Diagnostic

```bash
curl "http://localhost:4000/api/sync/probe?path=/clubs/553"
```

La réponse indique l'URL appelée et, en cas d'échec, le message exact. Deux causes fréquentes :

* **`403` renvoyé par un proxy** : la machine n'a pas d'accès sortant vers `api-dofa.fff.fr`
  (c'est le cas de l'environnement de développement de ce dépôt) ;
* **délai dépassé sans erreur de proxy** : `fetch` de Node n'utilise pas `HTTPS_PROXY` par défaut.
  Lancer le serveur avec `NODE_USE_ENV_PROXY=1` derrière un proxy d'entreprise.

## Ce que l'API ne donne pas

Les compositions détaillées (la Feuille de Match Informatisée) ne sont pas exposées publiquement
pour l'ensemble des divisions amateurs. C'est précisément la raison d'être de l'éditeur de feuille
de match d'AmateurScore : la composition, les entrées en jeu, les buteurs et les cartons sont
**retranscrits** par l'utilisateur, puis agrégés pour produire la liste des joueurs utilisés et
leurs notes.
