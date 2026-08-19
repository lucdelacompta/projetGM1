/**
 * Cartographie des points d'entree de l'API publique DOFA de la FFF
 * (celle qu'utilise le site fff.fr et l'application mobile).
 *
 * L'API est une API Platform : les collections sont renvoyees au format
 * Hydra/JSON-LD (`hydra:member`, `hydra:view`), la pagination se fait avec
 * `?page=N`. Les identifiants suivent la nomenclature interne FFF :
 *
 *   cl_no  numero de club          (ex: 553)
 *   cp_no  numero de competition   (ex: 420001)
 *   ph_no  numero de phase         (1, 2, ...)
 *   po_no  numero de poule
 *   ma_no  numero de rencontre
 *   D1/D2  numero d'equipe au sein du club (1 = equipe premiere)
 *
 * Ces chemins sont regroupes ici volontairement : si la FFF fait evoluer son
 * API, une seule constante est a corriger, sans toucher au reste du code.
 */
export const ENDPOINTS = {
  club: (clNo: string | number) => `/clubs/${clNo}`,
  clubTeams: (clNo: string | number) => `/clubs/${clNo}/equipes`,
  clubTerrains: (clNo: string | number) => `/clubs/${clNo}/terrains`,
  clubEngagements: (clNo: string | number) => `/clubs/${clNo}/engagements`,
  teamMatches: (clNo: string | number, teamNumber: string | number) =>
    `/clubs/${clNo}/equipes/${teamNumber}/matchs`,
  teamNextMatches: (clNo: string | number, teamNumber: string | number) =>
    `/clubs/${clNo}/equipes/${teamNumber}/prochains_matchs`,
  teamResults: (clNo: string | number, teamNumber: string | number) =>
    `/clubs/${clNo}/equipes/${teamNumber}/resultats`,
  competition: (cpNo: string | number) => `/compets/${cpNo}`,
  poolMatches: (cpNo: string | number, phNo: string | number, poNo: string | number) =>
    `/compets/${cpNo}/phases/${phNo}/poules/${poNo}/matchs`,
  poolRanking: (cpNo: string | number, phNo: string | number, poNo: string | number) =>
    `/compets/${cpNo}/phases/${phNo}/poules/${poNo}/classement_journees`,
  poolTeams: (cpNo: string | number, phNo: string | number, poNo: string | number) =>
    `/compets/${cpNo}/phases/${phNo}/poules/${poNo}/equipes`,
  match: (maNo: string | number) => `/matchs/${maNo}`,
  ligues: () => `/ligues`,
  districts: () => `/districts`,
} as const;

export type EndpointName = keyof typeof ENDPOINTS;
