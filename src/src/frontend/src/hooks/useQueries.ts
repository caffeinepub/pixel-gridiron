import { useActor } from "@/hooks/useActor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeaderboardEntry, PlayerProfile } from "../types/game";

// Since backend.d.ts has empty interface, we use the Motoko actor directly
// All calls go through the raw actor from useActor

export function usePlayerProfile() {
  const { actor, isFetching } = useActor();
  return useQuery<PlayerProfile>({
    queryKey: ["profile"],
    queryFn: async () => {
      if (!actor) throw new Error("No actor");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (actor as any).getProfile();
      return convertProfile(result);
    },
    enabled: !!actor && !isFetching,
    staleTime: 30000,
  });
}

export function useLeaderboard() {
  const { actor, isFetching } = useActor();
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      if (!actor) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (actor as any).getLeaderboard();
      return (result as any[]).map((e: any) => ({
        playerName: e.playerName,
        score: Number(e.score),
        principal: e.principal,
      }));
    },
    enabled: !!actor && !isFetching,
    staleTime: 60000,
  });
}

export function useAddXp() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (xpGain: number) => {
      if (!actor) throw new Error("No actor");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (actor as any).addXpAndLevel(BigInt(xpGain));
      return convertProfile(result);
    },
    onSuccess: (data) => {
      qc.setQueryData(["profile"], data);
    },
  });
}

export function useSubmitScore() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      score,
      playerName,
    }: { score: number; playerName: string }) => {
      if (!actor) throw new Error("No actor");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (actor as any).submitScore(BigInt(score), playerName);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function useUpgradeSkill() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillName: string) => {
      if (!actor) throw new Error("No actor");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (actor as any).upgradeSkill(skillName);
      if (!result || result.length === 0) throw new Error("Upgrade failed");
      return convertProfile(result[0]);
    },
    onSuccess: (data) => {
      qc.setQueryData(["profile"], data);
    },
  });
}

export function useUnlockLegend() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      legendId,
      xpCost,
    }: { legendId: string; xpCost: number }) => {
      if (!actor) throw new Error("No actor");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (actor as any).unlockLegend(
        legendId,
        BigInt(xpCost),
      );
      if (!result || result.length === 0) throw new Error("Unlock failed");
      return convertProfile(result[0]);
    },
    onSuccess: (data) => {
      qc.setQueryData(["profile"], data);
    },
  });
}

export function useAdvanceCareer() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("No actor");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (actor as any).advanceCareer();
      if (!result || result.length === 0) throw new Error("Advance failed");
      return convertProfile(result[0]);
    },
    onSuccess: (data) => {
      qc.setQueryData(["profile"], data);
    },
  });
}

export function useSaveProfile() {
  const { actor } = useActor();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: PlayerProfile) => {
      if (!actor) throw new Error("No actor");
      const moProfile = convertProfileToMo(profile);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (actor as any).saveProfile(moProfile);
    },
    onSuccess: (_data, variables) => {
      qc.setQueryData(["profile"], variables);
    },
  });
}

// Convert Motoko response to our TypeScript profile
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertProfile(raw: any): PlayerProfile {
  const stageKey =
    raw?.careerStage?.__tag ||
    Object.keys(raw?.careerStage || {})[0] ||
    "HighSchool";
  return {
    xp: Number(raw?.xp ?? 0),
    hp: Number(raw?.hp ?? 100),
    level: Number(raw?.level ?? 1),
    skillPoints: Number(raw?.skillPoints ?? 0),
    highScore: Number(raw?.highScore ?? 0),
    careerStage: stageKey as any,
    unlockedLegends: Array.isArray(raw?.unlockedLegends)
      ? raw.unlockedLegends
      : [],
    skills: {
      speed: Number(raw?.skills?.speed ?? 0),
      power: Number(raw?.skills?.power ?? 0),
      agility: Number(raw?.skills?.agility ?? 0),
      spin: Number(raw?.skills?.spin ?? 0),
      hurdle: Number(raw?.skills?.hurdle ?? 0),
      breakTackle: Number(raw?.skills?.breakTackle ?? 0),
      vision: Number(raw?.skills?.vision ?? 0),
      burst: Number(raw?.skills?.burst ?? 0),
    },
    displayName: raw?.displayName ?? "Player",
    teamName: raw?.teamName ?? "Pixel FC",
    jerseyNumber: Number(raw?.jerseyNumber ?? 32),
  };
}

function convertProfileToMo(profile: PlayerProfile): any {
  const stageVariant: Record<string, null> = {};
  stageVariant[profile.careerStage] = null;
  return {
    xp: BigInt(profile.xp),
    hp: BigInt(profile.hp),
    level: BigInt(profile.level),
    skillPoints: BigInt(profile.skillPoints),
    highScore: BigInt(profile.highScore),
    careerStage: stageVariant,
    unlockedLegends: profile.unlockedLegends,
    skills: {
      speed: BigInt(profile.skills.speed),
      power: BigInt(profile.skills.power),
      agility: BigInt(profile.skills.agility),
      spin: BigInt(profile.skills.spin),
      hurdle: BigInt(profile.skills.hurdle),
    },
    displayName: profile.displayName,
  };
}
