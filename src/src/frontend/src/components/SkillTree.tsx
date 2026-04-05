import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { toast } from "sonner";
import { useAdvanceCareer, useUpgradeSkill } from "../hooks/useQueries";
import type { PlayerProfile } from "../types/game";
import {
  CAREER_STAGES,
  CAREER_STAGE_NAMES,
  type CareerStage,
  SKILL_MAX,
  levelFromXp,
  xpForLevel,
  xpForNextLevel,
} from "../types/game";

interface Props {
  profile: PlayerProfile;
  onProfileUpdate?: (profile: PlayerProfile) => void;
  isLoggedIn?: boolean;
}

const SKILL_DEFS = [
  {
    key: "speed",
    label: "Speed",
    emoji: "SPD",
    desc: "+0.8 tiles/sec per rank • Rank 10: elite sprinter pace",
    color: "#FFD700",
  },
  {
    key: "power",
    label: "Power",
    emoji: "PWR",
    desc: "Rank 1: auto-break crates • Rank 5: DE bounce • Rank 8: break any defender • Rank 12+: DT shrug",
    color: "#C63A3A",
  },
  {
    key: "agility",
    label: "Agility",
    emoji: "AGI",
    desc: "+8% lane switch speed per rank • Rank 10: instant cut",
    color: "#3FAE5A",
  },
  {
    key: "spin",
    label: "Spin",
    emoji: "SPN",
    desc: "+12 frames spin duration per rank • Rank 5+: wider zone • Rank 10+: double spin",
    color: "#2E7BD6",
  },
  {
    key: "hurdle",
    label: "Hurdle",
    emoji: "HRD",
    desc: "+0.35 jump power per rank • Rank 10: clears all crates",
    color: "#D4A017",
  },
  {
    key: "breakTackle",
    label: "Break Tackle",
    emoji: "BRK",
    desc: "Each rank adds 8% chance to shed a hit with no damage • Rank 10+: 80% shed rate",
    color: "#FF6B35",
  },
  {
    key: "vision",
    label: "Vision",
    emoji: "VIS",
    desc: "Each rank slows obstacle approach by 3% — see the play developing • Rank 10: matrix mode",
    color: "#9B59B6",
  },
  {
    key: "burst",
    label: "Burst",
    emoji: "BST",
    desc: "Explosive acceleration on first 5 yards of each play • Rank 10: +4 yards/sec burst speed",
    color: "#00BCD4",
  },
] as const;

const CAREER_XP_REQS: Record<CareerStage, number> = {
  HighSchool: 0,
  College: 500,
  Pro: 1500,
  SuperBowl: 3000,
  HallOfFame: 6000,
};

export function SkillTree({ profile, onProfileUpdate, isLoggedIn }: Props) {
  const upgradeSkill = useUpgradeSkill();
  const advanceCareer = useAdvanceCareer();
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  const currentStageIdx = CAREER_STAGES.indexOf(profile.careerStage);
  const nextStage =
    currentStageIdx < CAREER_STAGES.length - 1
      ? CAREER_STAGES[currentStageIdx + 1]
      : null;
  const nextXpReq = nextStage ? CAREER_XP_REQS[nextStage] : null;
  const canAdvance =
    nextStage && profile.xp >= (nextXpReq ?? Number.POSITIVE_INFINITY);

  // Level calculations using new RPG formula
  const currentLevel = levelFromXp(profile.xp);
  const xpCurrentLevel = xpForLevel(currentLevel);
  const xpNext = xpForNextLevel(currentLevel);
  const progressInLevel = profile.xp - xpCurrentLevel;
  const neededForNext = xpNext - xpCurrentLevel;
  const levelPct =
    neededForNext > 0
      ? Math.min(100, (progressInLevel / neededForNext) * 100)
      : 100;

  const handleUpgrade = async (skillKey: string) => {
    if (profile.skillPoints <= 0) {
      toast.error("No skill points available!");
      return;
    }
    if (!isLoggedIn) {
      const currentLevel =
        profile.skills[skillKey as keyof typeof profile.skills];
      if (currentLevel >= SKILL_MAX) return;
      const updatedProfile: PlayerProfile = {
        ...profile,
        skillPoints: profile.skillPoints - 1,
        skills: {
          ...profile.skills,
          [skillKey]: currentLevel + 1,
        },
      };
      onProfileUpdate?.(updatedProfile);
      toast.success(
        `${skillKey.charAt(0).toUpperCase()}${skillKey.slice(1)} upgraded to Rank ${currentLevel + 1}!`,
      );
      return;
    }
    try {
      const updated = await upgradeSkill.mutateAsync(skillKey);
      onProfileUpdate?.(updated);
      toast.success(
        `${skillKey.charAt(0).toUpperCase()}${skillKey.slice(1)} upgraded!`,
      );
    } catch {
      toast.error("Failed to upgrade skill");
    }
  };

  const handleAdvance = async () => {
    try {
      const updated = await advanceCareer.mutateAsync();
      onProfileUpdate?.(updated);
      toast.success(`Advanced to ${CAREER_STAGE_NAMES[updated.careerStage]}!`);
    } catch {
      toast.error("Cannot advance career yet");
    }
  };

  return (
    <div
      className="w-full max-w-lg mx-auto px-4 py-6"
      data-ocid="skill_tree.section"
    >
      <div className="text-center mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">
          SKILL TREE
        </h2>
        <p className="text-muted-foreground text-sm">
          Spend skill points to upgrade your runner
        </p>
      </div>

      <div className="flex gap-3 mb-6">
        <div
          className="flex-1 rounded-lg p-3 text-center"
          style={{
            background:
              "linear-gradient(135deg, rgba(63,174,90,0.15), rgba(63,174,90,0.05))",
            border: "1px solid rgba(63,174,90,0.3)",
          }}
        >
          <div
            className="font-display text-3xl font-bold"
            style={{ color: "#3FAE5A" }}
          >
            {profile.skillPoints}
          </div>
          <div className="text-xs text-muted-foreground">SKILL POINTS</div>
        </div>
        <div
          className="flex-1 rounded-lg p-3 text-center"
          style={{
            background: "rgba(46,123,214,0.1)",
            border: "1px solid rgba(46,123,214,0.3)",
          }}
        >
          <div
            className="font-display text-3xl font-bold"
            style={{ color: "#2E7BD6" }}
          >
            Lv.{currentLevel}
          </div>
          <div className="text-xs text-muted-foreground">{profile.xp} XP</div>
        </div>
      </div>

      {/* Level progress bar using new formula */}
      <div
        className="mb-6 p-3 rounded-lg"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Level Progress</span>
          <span>
            {progressInLevel}/{neededForNext} XP to Lv.{currentLevel + 1}
          </span>
        </div>
        <Progress value={levelPct} className="h-2" />
        <div className="text-xs text-muted-foreground mt-1 text-center">
          Next level at {xpNext} total XP
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {SKILL_DEFS.map((skill) => {
          const currentSkillLevel = profile.skills[skill.key];
          const canUpgrade =
            profile.skillPoints > 0 && currentSkillLevel < SKILL_MAX;
          const isHovered = hoveredSkill === skill.key;
          const maxed = currentSkillLevel >= SKILL_MAX;

          // Build rank pip indicators (10 pips max)
          const pips = Array.from({ length: SKILL_MAX }, (_, i) => i);

          return (
            <div
              key={skill.key}
              data-ocid={`skill_tree.${skill.key}.panel`}
              className="rounded-lg p-3 transition-all"
              style={{
                background: isHovered
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${
                  maxed
                    ? `${skill.color}80`
                    : isHovered
                      ? `${skill.color}40`
                      : "rgba(255,255,255,0.06)"
                }`,
              }}
              onMouseEnter={() => setHoveredSkill(skill.key)}
              onMouseLeave={() => setHoveredSkill(null)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{
                    background: `${skill.color}20`,
                    border: `1px solid ${skill.color}40`,
                    color: skill.color,
                  }}
                >
                  {skill.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-sm font-bold text-foreground">
                      {skill.label}
                    </span>
                    <Badge
                      variant="outline"
                      style={{
                        fontSize: 9,
                        borderColor: maxed
                          ? `${skill.color}90`
                          : `${skill.color}60`,
                        color: maxed ? skill.color : `${skill.color}AA`,
                        background: maxed ? `${skill.color}15` : "transparent",
                      }}
                    >
                      {maxed ? "MAX" : `${currentSkillLevel}/${SKILL_MAX}`}
                    </Badge>
                  </div>
                  {/* 10-pip rank display */}
                  <div className="flex gap-0.5 mb-1 flex-wrap">
                    {pips.map((i) => (
                      <button
                        type="button"
                        key={`pip-${i}`}
                        data-ocid={`skill_tree.${skill.key}.toggle`}
                        onClick={() =>
                          i >= currentSkillLevel &&
                          canUpgrade &&
                          handleUpgrade(skill.key)
                        }
                        disabled={i < currentSkillLevel || !canUpgrade}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          border: "none",
                          cursor:
                            i >= currentSkillLevel && canUpgrade
                              ? "pointer"
                              : "default",
                          background:
                            i < currentSkillLevel
                              ? i < 5
                                ? `radial-gradient(circle, ${skill.color} 0%, ${skill.color}88 100%)`
                                : `radial-gradient(circle, ${skill.color}FF 0%, ${skill.color} 100%)`
                              : i === currentSkillLevel && canUpgrade
                                ? "rgba(255,255,255,0.12)"
                                : "rgba(42,49,56,0.8)",
                          boxShadow:
                            i < currentSkillLevel
                              ? `0 0 4px ${skill.color}60`
                              : "none",
                          transform:
                            i === currentSkillLevel && canUpgrade
                              ? "scale(1.15)"
                              : "scale(1)",
                          transition: "all 0.1s ease",
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: "#6A7480" }}>
                    {skill.desc}
                  </p>
                </div>
                {canUpgrade && (
                  <Button
                    data-ocid={`skill_tree.${skill.key}.button`}
                    size="sm"
                    onClick={() => handleUpgrade(skill.key)}
                    disabled={upgradeSkill.isPending}
                    style={{
                      background: skill.color,
                      color: "#000",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "4px 10px",
                      height: "auto",
                    }}
                  >
                    +1
                  </Button>
                )}
                {maxed && (
                  <span
                    style={{
                      fontSize: 10,
                      color: skill.color,
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    MAX
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <h3 className="font-display text-sm font-bold text-foreground mb-3">
          CAREER STAGE
        </h3>
        <div className="flex gap-1 mb-3">
          {CAREER_STAGES.map((stage, i) => (
            <div
              key={stage}
              className="flex-1 h-6 rounded flex items-center justify-center"
              style={{
                background:
                  i <= currentStageIdx
                    ? "linear-gradient(135deg, #3FAE5A, #2A8040)"
                    : "rgba(42,49,56,0.8)",
                border: `1px solid ${
                  i <= currentStageIdx ? "#3FAE5A40" : "rgba(255,255,255,0.06)"
                }`,
                fontSize: 7,
                fontWeight: 700,
                color: i <= currentStageIdx ? "#FFF" : "#4A545D",
                letterSpacing: "0.05em",
              }}
            >
              {CAREER_STAGE_NAMES[stage]
                .split(" ")[0]
                .substring(0, 4)
                .toUpperCase()}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div
              className="font-display text-base font-bold"
              style={{ color: "#3FAE5A" }}
            >
              {CAREER_STAGE_NAMES[profile.careerStage]}
            </div>
            {nextStage && (
              <div className="text-xs text-muted-foreground">
                Next: {CAREER_STAGE_NAMES[nextStage]} (need {nextXpReq} XP)
              </div>
            )}
          </div>
          {canAdvance && (
            <Button
              data-ocid="skill_tree.advance_button"
              onClick={handleAdvance}
              disabled={advanceCareer.isPending}
              style={{
                background: "linear-gradient(135deg, #3FAE5A, #2A8040)",
                color: "#FFF",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              ADVANCE
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
