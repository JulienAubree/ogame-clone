import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Overview() {
  const { data: planets, isLoading } = trpc.planet.list.useQuery();

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const planet = planets?.[0];
  if (!planet) {
    return <div className="p-6 text-muted-foreground">Aucune planète trouvée.</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{planet.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coordonnées</span>
              <span>[{planet.galaxy}:{planet.system}:{planet.position}]</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Diamètre</span>
              <span>{planet.diameter.toLocaleString('fr-FR')} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Champs</span>
              <span>0 / {planet.maxFields}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Température</span>
              <span>{planet.minTemp}°C à {planet.maxTemp}°C</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ressources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-metal">Métal</span>
              <span>{Number(planet.metal).toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-crystal">Cristal</span>
              <span>{Number(planet.crystal).toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-deuterium">Deutérium</span>
              <span>{Number(planet.deuterium).toLocaleString('fr-FR')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bâtiments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mine de métal</span>
              <Badge variant="secondary">Niv. {planet.metalMineLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mine de cristal</span>
              <Badge variant="secondary">Niv. {planet.crystalMineLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Synthétiseur de deut.</span>
              <Badge variant="secondary">Niv. {planet.deutSynthLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Centrale solaire</span>
              <Badge variant="secondary">Niv. {planet.solarPlantLevel}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
