import { useState } from 'react';
import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Galaxy() {
  const [galaxy, setGalaxy] = useState(1);
  const [system, setSystem] = useState(1);

  const { data, isLoading } = trpc.galaxy.system.useQuery(
    { galaxy, system },
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Galaxie</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Galaxie</label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGalaxy(Math.max(1, galaxy - 1))}
              disabled={galaxy <= 1}
            >
              &lt;
            </Button>
            <Input
              type="number"
              min={1}
              max={9}
              value={galaxy}
              onChange={(e) => setGalaxy(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
              className="w-16 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGalaxy(Math.min(9, galaxy + 1))}
              disabled={galaxy >= 9}
            >
              &gt;
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Système</label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSystem(Math.max(1, system - 1))}
              disabled={system <= 1}
            >
              &lt;
            </Button>
            <Input
              type="number"
              min={1}
              max={499}
              value={system}
              onChange={(e) => setSystem(Math.max(1, Math.min(499, Number(e.target.value) || 1)))}
              className="w-20 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSystem(Math.min(499, system + 1))}
              disabled={system >= 499}
            >
              &gt;
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Système solaire [{galaxy}:{system}]
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground">Chargement...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1 w-12">Pos</th>
                  <th className="px-2 py-1">Planète</th>
                  <th className="px-2 py-1">Joueur</th>
                  <th className="px-2 py-1 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.slots.map((slot, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    {slot ? (
                      <>
                        <td className="px-2 py-1">{slot.planetName}</td>
                        <td className="px-2 py-1">{slot.username}</td>
                        <td className="px-2 py-1">
                          <span className="text-xs text-muted-foreground">-</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1 text-muted-foreground">-</td>
                        <td className="px-2 py-1 text-muted-foreground">-</td>
                        <td className="px-2 py-1">-</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
