import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { users } from '../schema/users.js';
import { planets } from '../schema/planets.js';
import { userExilium } from '../schema/user-exilium.js';
import { flagships } from '../schema/flagships.js';
import { tutorialProgress } from '../schema/tutorial-progress.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://exilium:exilium@localhost:5432/exilium';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function migrate() {
  console.log('Migration Phase 1 : Exilium + Flagship...');

  // 1. Creer un record user_exilium pour chaque joueur qui n'en a pas
  const allUsers = await db.select({ id: users.id }).from(users);

  let exiliumCreated = 0;
  for (const user of allUsers) {
    const [existing] = await db
      .select({ userId: userExilium.userId })
      .from(userExilium)
      .where(eq(userExilium.userId, user.id))
      .limit(1);

    if (!existing) {
      await db.insert(userExilium).values({ userId: user.id });
      exiliumCreated++;
    }
  }
  console.log(`  -> ${exiliumCreated} records user_exilium crees`);

  // 2. Creer un flagship pour chaque joueur ayant deja passe la quete 11
  const allProgress = await db
    .select()
    .from(tutorialProgress);

  let flagshipsCreated = 0;
  for (const progress of allProgress) {
    const completedQuests = (progress.completedQuests as Array<{ questId: string }>) || [];
    const hasCompletedQuest11 = completedQuests.some(q => q.questId === 'quest_11');

    // Le joueur est au-dela de la quete 11 OU l'a completee
    const currentOrder = parseInt(progress.currentQuestId.replace('quest_', ''), 10);
    const isPassedQuest11 = hasCompletedQuest11 || currentOrder > 11 || progress.isComplete;

    if (!isPassedQuest11) continue;

    // Verifier qu'il n'a pas deja un flagship
    const [existingFlagship] = await db
      .select({ id: flagships.id })
      .from(flagships)
      .where(eq(flagships.userId, progress.userId))
      .limit(1);

    if (existingFlagship) continue;

    // Recuperer la planete mere
    const [homePlanet] = await db
      .select({ id: planets.id })
      .from(planets)
      .where(eq(planets.userId, progress.userId))
      .limit(1);

    if (!homePlanet) continue;

    await db.insert(flagships).values({
      userId: progress.userId,
      planetId: homePlanet.id,
      name: 'Vaisseau amiral',
      description: '',
    });
    flagshipsCreated++;
  }
  console.log(`  -> ${flagshipsCreated} flagships crees retroactivement`);

  console.log('Migration terminee.');
  await client.end();
}

migrate().catch(console.error);
