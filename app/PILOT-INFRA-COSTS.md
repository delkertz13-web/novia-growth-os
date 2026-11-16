# Coûts d'infrastructure du pilote (Scaleway, Paris) : connus et inconnus

> Règle : aucun prix non vérifié n'est présenté comme sûr. Seuls les tarifs **lus dans la documentation publique
> de Scaleway** sont chiffrés, et ils restent **À RECONFIRMER DANS LA CONSOLE** (les prix changent, et le
> déploiement n'a pas eu lieu). Tout le reste est **À CONFIRMER DANS LA CONSOLE SCALEWAY**. Relevé du 16/11/2026, HT.

## Tableau

| Poste | Hypothèse d'usage | Tarif | Statut | Coût mensuel |
|---|---|---|---|---|
| Serverless Container | 1 instance permanente (`min-scale = 1`), 0,25 vCPU, 0,5 Go (taille **à mesurer**) | 0,0000100 € / vCPU-s ; 0,0000020 € / Go-s ; gratuité mensuelle 200 000 vCPU-s et 400 000 Go-s (exemple de calcul de la FAQ Scaleway) | **Lu dans la doc, À RECONFIRMER** | **≈ 6 €** (calcul ci-dessous, sous hypothèse) |
| Déclencheur CRON | 1 appel par minute (≈ 43 200 / mois) | inclus dans l'exécution du conteneur ? | **À CONFIRMER DANS LA CONSOLE** | inconnu (a priori marginal) |
| Container Registry | 1 image (~200 Mo), quelques versions | — | **À CONFIRMER DANS LA CONSOLE** | inconnu |
| Managed Database for PostgreSQL 16 | plus petite offre, 1 nœud | — | **À CONFIRMER DANS LA CONSOLE SCALEWAY** | **inconnu** |
| Sauvegardes de la base | quotidiennes, rétention ≥ 7 jours | — | **À CONFIRMER DANS LA CONSOLE** | inconnu |
| Secret Manager | 3 secrets, quelques versions | — | **À CONFIRMER DANS LA CONSOLE** | inconnu |
| Trafic entrant / sortant du conteneur | faible (2 appareils) | gratuit d'après la FAQ | **Lu dans la doc, À RECONFIRMER** | 0 € |
| Nom de domaine | `pilote.<domaine>` (domaine existant ou à acheter) | dépend du registraire | **À CONFIRMER** | inconnu |
| Certificat HTTPS | géré par la plateforme | — | **À CONFIRMER** | inconnu (souvent inclus) |

## Calcul du conteneur (hypothèse, à refaire avec les tarifs de la console)

- 30 jours = 2 592 000 s, instance facturée en continu (**hypothèse** : une instance gardée par `min-scale = 1` est facturée comme active).
- vCPU : 0,25 × 2 592 000 = 648 000 vCPU-s − 200 000 gratuits = 448 000 × 0,0000100 € ≈ **4,48 €**
- Mémoire : 0,5 × 2 592 000 = 1 296 000 Go-s − 400 000 gratuits = 896 000 × 0,0000020 € ≈ **1,79 €**
- Total conteneur ≈ **6,27 € / mois**, si la taille 0,25 vCPU / 0,5 Go suffit (à mesurer : l'image Node 22 + le front).

## Total mensuel estimé

**Connu (sous hypothèse) : ≈ 6 € pour le conteneur. Le reste est inconnu**, dont le poste principal probable :
la base PostgreSQL managée. **Total : À CONFIRMER DANS LA CONSOLE SCALEWAY** une fois le compte créé (le simulateur de
prix de la console donne les montants exacts). Ce document sera mis à jour avec les montants lus dans la console.

## Ce qui ne coûte rien en P3

Aucun SMS, aucun appel, aucun Voice, aucun paiement, aucune API GHL ou Planity : le pilote en mode shadow n'a aucun
coût d'usage par message ou par appel.
