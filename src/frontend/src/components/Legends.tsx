import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInternetIdentity } from "@/hooks/useInternetIdentity";
import { useState } from "react";
import { toast } from "sonner";
import { useUnlockLegend } from "../hooks/useQueries";
import { LEGENDARY_PLAYERS } from "../types/game";
import type { PlayerProfile } from "../types/game";

interface Props {
  profile: PlayerProfile;
  onProfileUpdate?: (profile: PlayerProfile) => void;
  onSetActiveLegend?: (legendId: string | null) => void;
  activeLegend?: string | null;
}

export function Legends({
  profile,
  onProfileUpdate,
  onSetActiveLegend,
  activeLegend,
}: Props) {
  const unlockLegend = useUnlockLegend();
  const { identity } = useInternetIdentity();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleUnlock = async (legendId: string, xpCost: number) => {
    if (!identity) {
      toast.error("Login required to unlock legends");
      return;
    }
    if (profile.xp < xpCost) {
      toast.error(`Need ${xpCost} XP to unlock (you have ${profile.xp})`);
      return;
    }
    setPendingId(legendId);
    try {
      const updated = await unlockLegend.mutateAsync({ legendId, xpCost });
      onProfileUpdate?.(updated);
      toast.success("Legend unlocked! \ud83c\udfb5");
    } catch {
      toast.error("Failed to unlock legend");
    } finally {
      setPendingId(null);
    }
  };

  const handlePlayAs = (legendId: string) => {
    onSetActiveLegend?.(activeLegend === legendId ? null : legendId);
    toast.success(
      activeLegend === legendId
        ? "Reverted to default player"
        : `Now playing as ${LEGENDARY_PLAYERS.find((l) => l.id === legendId)?.nickname}!`,
    );
  };

  return (
    <div
      className="w-full max-w-lg mx-auto px-4 py-6"
      data-ocid="legends.section"
    >
      <div className="text-center mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">
          LEGENDS
        </h2>
        <p className="text-muted-foreground text-sm">
          Unlock legendary players to boost your stats
        </p>
      </div>

      <div className="flex items-center justify-between mb-4 px-1">
        <span className="text-xs text-muted-foreground">
          Your XP:{" "}
          <span style={{ color: "#2E7BD6", fontWeight: 700 }}>
            {profile.xp.toLocaleString()}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {profile.unlockedLegends.length}/{LEGENDARY_PLAYERS.length} unlocked
        </span>
      </div>

      <div className="space-y-4">
        {LEGENDARY_PLAYERS.map((legend, idx) => {
          const isUnlocked = profile.unlockedLegends.includes(legend.id);
          const isActive = activeLegend === legend.id;
          const canAfford = profile.xp >= legend.xpCost;
          const isPending = pendingId === legend.id;

          return (
            <div
              key={legend.id}
              data-ocid={`legends.item.${idx + 1}`}
              className="rounded-xl overflow-hidden transition-all"
              style={{
                background: isUnlocked
                  ? `linear-gradient(135deg, ${legend.color}20, ${legend.secondaryColor}15)`
                  : "rgba(255,255,255,0.03)",
                border: isActive
                  ? `2px solid ${legend.color}`
                  : isUnlocked
                    ? `1px solid ${legend.color}50`
                    : "1px solid rgba(255,255,255,0.08)",
                boxShadow: isActive ? `0 0 20px ${legend.color}30` : "none",
                opacity: !isUnlocked && !canAfford ? 0.6 : 1,
              }}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Jersey number badge */}
                  <div
                    className="flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${legend.color}, ${legend.secondaryColor})`,
                      boxShadow: isUnlocked
                        ? `0 0 12px ${legend.color}50`
                        : "none",
                    }}
                  >
                    {!isUnlocked && <span className="text-xl">&#x1F512;</span>}
                    {isUnlocked && (
                      <>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: "rgba(255,255,255,0.7)",
                            letterSpacing: "0.1em",
                          }}
                        >
                          #{legend.number}
                        </span>
                        <span
                          style={{
                            fontSize: 18,
                            fontWeight: 900,
                            color: "#FFF",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {legend.number}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span
                        className="font-display text-lg font-bold"
                        style={{ color: isUnlocked ? legend.color : "#E7E7E7" }}
                      >
                        {legend.nickname}
                      </span>
                      {isActive && (
                        <Badge
                          style={{
                            fontSize: 9,
                            background: `${legend.color}30`,
                            borderColor: `${legend.color}80`,
                            color: legend.color,
                          }}
                        >
                          ACTIVE
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mb-1">
                      #{legend.number} • {legend.role}
                    </div>
                    <div
                      className="text-xs mb-2"
                      style={{ color: "#8A9098", fontStyle: "italic" }}
                    >
                      &#x201C;{legend.description}&#x201D;
                    </div>

                    {/* Stat boosts */}
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(legend.boost).map(([stat, val]) => (
                        <div
                          key={stat}
                          style={{
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#E7E7E7",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          +{val} {stat.toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action row */}
                <div className="flex items-center justify-between mt-3">
                  <div
                    style={{
                      fontSize: 11,
                      color: canAfford || isUnlocked ? "#3FAE5A" : "#C63A3A",
                    }}
                  >
                    {isUnlocked ? "Unlocked ✓" : `Cost: ${legend.xpCost} XP`}
                  </div>
                  {isUnlocked ? (
                    <Button
                      data-ocid={`legends.item.${idx + 1}.button`}
                      size="sm"
                      onClick={() => handlePlayAs(legend.id)}
                      style={{
                        background: isActive
                          ? "rgba(255,255,255,0.1)"
                          : `linear-gradient(135deg, ${legend.color}, ${legend.secondaryColor})`,
                        color: "#FFF",
                        fontSize: 10,
                        fontWeight: 700,
                        border: isActive
                          ? `1px solid ${legend.color}60`
                          : "none",
                      }}
                    >
                      {isActive ? "PLAYING AS" : "PLAY AS"}
                    </Button>
                  ) : (
                    <Button
                      data-ocid={`legends.item.${idx + 1}.button`}
                      size="sm"
                      disabled={!canAfford || isPending}
                      onClick={() => handleUnlock(legend.id, legend.xpCost)}
                      style={{
                        background: canAfford
                          ? `linear-gradient(135deg, ${legend.color}, ${legend.secondaryColor})`
                          : "rgba(255,255,255,0.06)",
                        color: canAfford ? "#FFF" : "#4A545D",
                        fontSize: 10,
                        fontWeight: 700,
                        border: "none",
                      }}
                    >
                      {isPending ? "UNLOCKING..." : "UNLOCK"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
