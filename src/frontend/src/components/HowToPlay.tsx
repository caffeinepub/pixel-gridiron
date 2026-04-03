import type React from "react";

export function HowToPlay() {
  return (
    <div
      className="w-full max-w-lg mx-auto px-4 py-6"
      data-ocid="howtoplay.section"
    >
      <div className="text-center mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">
          HOW TO PLAY
        </h2>
        <p className="text-muted-foreground text-sm">Master the gridiron</p>
      </div>

      <div className="space-y-4">
        <Section title="CONSOLE CONTROLS">
          <div className="grid grid-cols-2 gap-3">
            <ControlItem
              emoji="LR"
              label="D-PAD LEFT/RIGHT"
              desc="Switch lanes"
            />
            <ControlItem emoji="UP" label="D-PAD UP" desc="Jump / Hurdle" />
            <ControlItem
              emoji="GRN"
              label="HURDLE"
              desc="Jump over obstacles"
              color="#3FAE5A"
            />
            <ControlItem
              emoji="BLU"
              label="SPIN"
              desc="Spin invincibility"
              color="#2E7BD6"
            />
            <ControlItem
              emoji="RED"
              label="TURBO"
              desc="2x speed boost"
              color="#C63A3A"
            />
            <ControlItem
              emoji="GO"
              label="START"
              desc="Begin game"
              color="#3FAE5A"
            />
          </div>
        </Section>

        <Section title="LANE RUNNING">
          <p className="text-sm text-muted-foreground mb-2">
            The field has 3 lanes. Use the D-PAD to switch lanes and avoid
            defenders. The center lane is slightly wider — use it when
            outnumbered.
          </p>
          <div className="flex gap-2">
            {(["LEFT\nLANE", "CENTER\nLANE", "RIGHT\nLANE"] as const).map(
              (label, i) => (
                <div
                  key={label}
                  className="flex-1 p-2 rounded text-center"
                  style={{
                    background:
                      i === 1
                        ? "rgba(63,174,90,0.15)"
                        : "rgba(255,255,255,0.04)",
                    border:
                      i === 1
                        ? "1px solid rgba(63,174,90,0.3)"
                        : "1px solid rgba(255,255,255,0.08)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: i === 1 ? "#3FAE5A" : "#A9B0B6",
                    whiteSpace: "pre-line",
                    lineHeight: 1.4,
                  }}
                >
                  {label}
                </div>
              ),
            )}
          </div>
        </Section>

        <Section title="CRATES & POWER-UPS">
          <p className="text-sm text-muted-foreground mb-3">
            Brown crates appear in lanes. Break them to collect power-ups
            inside! If your Power skill is 2+, you auto-break crates without
            taking damage.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <PowerItem
              color="#FFD700"
              label="TURBO BOOST"
              desc="2x speed for 1.5s"
            />
            <PowerItem color="#2E7BD6" label="SHIELD" desc="Block one hit" />
            <PowerItem color="#3FAE5A" label="+DOWN" desc="Restore 20 HP" />
            <PowerItem
              color="#D4A017"
              label="2X SCORE"
              desc="Double score 5s"
            />
          </div>
        </Section>

        <Section title="HP AND XP">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div
                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{ background: "#C63A3A" }}
              />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">HP:</strong> Lose HP when
                hit by defenders or crates. Reach 0 HP = Game Over.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div
                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{ background: "#2E7BD6" }}
              />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">XP:</strong> Earn XP per 100
                yards run and from crates. Level up every 100 XP for a skill
                point!
              </p>
            </div>
          </div>
        </Section>

        <Section title="CAREER LADDER">
          <div className="space-y-2">
            {(
              [
                {
                  stage: "HIGH SCHOOL",
                  desc: "Simple field, basic defenders",
                  req: "0 XP",
                  color: "#888",
                },
                {
                  stage: "COLLEGE",
                  desc: "Bigger stadium, 1.5x score",
                  req: "500 XP",
                  color: "#4A90D9",
                },
                {
                  stage: "PRO",
                  desc: "Pro stadium, 2x score",
                  req: "1,500 XP",
                  color: "#3FAE5A",
                },
                {
                  stage: "SUPER BOWL",
                  desc: "Confetti, 3x score",
                  req: "3,000 XP",
                  color: "#D4A017",
                },
                {
                  stage: "HALL OF FAME",
                  desc: "Gold overlay, 5x score",
                  req: "6,000 XP",
                  color: "#FFD700",
                },
              ] as const
            ).map((s) => (
              <div key={s.stage} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: s.color }}
                />
                <div className="flex-1">
                  <span
                    className="font-display text-xs font-bold"
                    style={{ color: s.color }}
                  >
                    {s.stage}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {s.desc}
                  </span>
                </div>
                <span className="text-xs" style={{ color: "#4A545D" }}>
                  {s.req}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="SKILL TREE">
          <p className="text-sm text-muted-foreground mb-2">
            Earn skill points by leveling up. Each skill has 5 levels.
          </p>
          <div className="grid grid-cols-1 gap-1">
            {(
              [
                ["Speed", "More base run speed"],
                ["Power", "Auto-break crates at level 2"],
                ["Agility", "Faster lane switching"],
                ["Spin", "Longer spin window"],
                ["Hurdle", "Higher jumps"],
              ] as const
            ).map(([name, desc]) => (
              <div key={name} className="flex justify-between">
                <span className="text-xs font-bold text-foreground">
                  {name}
                </span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <h3
        className="font-display text-sm font-bold text-foreground mb-3"
        style={{ letterSpacing: "0.08em" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function ControlItem({
  emoji,
  label,
  desc,
  color,
}: { emoji: string; label: string; desc: string; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#A9B0B6",
        }}
      >
        {emoji}
      </div>
      <div>
        <div
          className="text-xs font-bold"
          style={{ color: color ?? "#E7E7E7", fontSize: 10 }}
        >
          {label}
        </div>
        <div className="text-xs text-muted-foreground" style={{ fontSize: 10 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

function PowerItem({
  color,
  label,
  desc,
}: { color: string; label: string; desc: string }) {
  return (
    <div
      className="p-2 rounded-lg"
      style={{ background: `${color}15`, border: `1px solid ${color}30` }}
    >
      <div className="text-xs font-bold mb-0.5" style={{ color }}>
        {label}
      </div>
      <div className="text-xs" style={{ color: "#8A9098" }}>
        {desc}
      </div>
    </div>
  );
}
