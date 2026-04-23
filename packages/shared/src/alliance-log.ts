import { z } from 'zod';

const UuidSchema = z.string().uuid();
const CoordsSchema = z.string().regex(/^\d+:\d+:\d+$/);

const CombatOutcomeSchema = z.enum(['victory', 'defeat', 'draw']);

const CombatDefensePayloadSchema = z.object({
  type: z.literal('combat.defense'),
  memberId: UuidSchema,
  memberName: z.string(),
  planetId: UuidSchema,
  planetName: z.string(),
  coords: CoordsSchema,
  attackerId: UuidSchema,
  attackerName: z.string(),
  attackerAllianceTag: z.string().optional(),
  outcome: CombatOutcomeSchema,
  reportId: UuidSchema,
});

const CombatAttackPayloadSchema = z.object({
  type: z.literal('combat.attack'),
  memberId: UuidSchema,
  memberName: z.string(),
  targetId: UuidSchema,
  targetName: z.string(),
  targetAllianceTag: z.string().optional(),
  planetName: z.string(),
  coords: CoordsSchema,
  outcome: CombatOutcomeSchema,
  reportId: UuidSchema,
});

const EspionageIncomingPayloadSchema = z.object({
  type: z.literal('espionage.incoming'),
  memberId: UuidSchema,
  memberName: z.string(),
  planetName: z.string(),
  coords: CoordsSchema,
  spyId: UuidSchema,
  spyName: z.string(),
  spyAllianceTag: z.string().optional(),
  reportId: UuidSchema,
});

const EspionageOutgoingPayloadSchema = z.object({
  type: z.literal('espionage.outgoing'),
  memberId: UuidSchema,
  memberName: z.string(),
  targetId: UuidSchema,
  targetName: z.string(),
  targetAllianceTag: z.string().optional(),
  planetName: z.string(),
  coords: CoordsSchema,
  reportId: UuidSchema,
});

const MemberJoinedPayloadSchema = z.object({
  type: z.literal('member.joined'),
  memberId: UuidSchema,
  memberName: z.string(),
  via: z.enum(['invitation', 'application']),
});

const MemberLeftPayloadSchema = z.object({
  type: z.literal('member.left'),
  memberId: UuidSchema,
  memberName: z.string(),
});

const MemberKickedPayloadSchema = z.object({
  type: z.literal('member.kicked'),
  memberId: UuidSchema,
  memberName: z.string(),
  byId: UuidSchema,
  byName: z.string(),
});

const MemberPromotedPayloadSchema = z.object({
  type: z.literal('member.promoted'),
  memberId: UuidSchema,
  memberName: z.string(),
  byId: UuidSchema,
  byName: z.string(),
  fromRole: z.literal('member'),
  toRole: z.literal('officer'),
});

const MemberDemotedPayloadSchema = z.object({
  type: z.literal('member.demoted'),
  memberId: UuidSchema,
  memberName: z.string(),
  byId: UuidSchema,
  byName: z.string(),
  fromRole: z.literal('officer'),
  toRole: z.literal('member'),
});

export const AllianceLogPayloadSchema = z.discriminatedUnion('type', [
  CombatDefensePayloadSchema,
  CombatAttackPayloadSchema,
  EspionageIncomingPayloadSchema,
  EspionageOutgoingPayloadSchema,
  MemberJoinedPayloadSchema,
  MemberLeftPayloadSchema,
  MemberKickedPayloadSchema,
  MemberPromotedPayloadSchema,
  MemberDemotedPayloadSchema,
]);

export type AllianceLogPayload = z.infer<typeof AllianceLogPayloadSchema>;
export type AllianceLogType = AllianceLogPayload['type'];

export const AllianceLogVisibilitySchema = z.enum(['all', 'officers']);
export type AllianceLogVisibility = z.infer<typeof AllianceLogVisibilitySchema>;

export const AllianceLogCategorySchema = z.enum(['military', 'members']);
export type AllianceLogCategory = z.infer<typeof AllianceLogCategorySchema>;

export function isMilitaryType(t: AllianceLogType): boolean {
  return t.startsWith('combat.') || t.startsWith('espionage.');
}

export function isMemberType(t: AllianceLogType): boolean {
  return t.startsWith('member.');
}

export function categoryOf(t: AllianceLogType): AllianceLogCategory {
  return isMilitaryType(t) ? 'military' : 'members';
}

export type AllianceLog = {
  id: string;
  allianceId: string;
  type: AllianceLogType;
  visibility: AllianceLogVisibility;
  payload: AllianceLogPayload;
  createdAt: string;
};
