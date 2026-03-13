import { useState, useEffect, useRef } from 'react';

interface ResourceCounterInput {
  metal: number;
  crystal: number;
  deuterium: number;
  resourcesUpdatedAt: string;
  metalPerHour: number;
  crystalPerHour: number;
  deutPerHour: number;
  storageMetalCapacity: number;
  storageCrystalCapacity: number;
  storageDeutCapacity: number;
}

interface ResourceCounterOutput {
  metal: number;
  crystal: number;
  deuterium: number;
}

export function useResourceCounter(input: ResourceCounterInput | undefined): ResourceCounterOutput {
  const [resources, setResources] = useState<ResourceCounterOutput>({
    metal: 0,
    crystal: 0,
    deuterium: 0,
  });

  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!input) return;

    function tick() {
      const data = inputRef.current;
      if (!data) return;

      const now = Date.now();
      const updatedAt = new Date(data.resourcesUpdatedAt).getTime();
      const elapsedHours = (now - updatedAt) / (3600 * 1000);

      setResources({
        metal: Math.min(
          Math.floor(data.metal + data.metalPerHour * elapsedHours),
          data.storageMetalCapacity,
        ),
        crystal: Math.min(
          Math.floor(data.crystal + data.crystalPerHour * elapsedHours),
          data.storageCrystalCapacity,
        ),
        deuterium: Math.min(
          Math.floor(data.deuterium + data.deutPerHour * elapsedHours),
          data.storageDeutCapacity,
        ),
      });
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [input?.resourcesUpdatedAt, input?.metalPerHour, input?.crystalPerHour, input?.deutPerHour]);

  return resources;
}
