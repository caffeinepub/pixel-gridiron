import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInternetIdentity } from "@/hooks/useInternetIdentity";
import { useLeaderboard } from "../hooks/useQueries";

export function Leaderboard() {
  const { data: entries, isLoading, isError } = useLeaderboard();
  const { identity } = useInternetIdentity();
  const myPrincipal = identity?.getPrincipal().toString();

  const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const rankEmoji = ["1st", "2nd", "3rd"];

  return (
    <div
      className="w-full max-w-lg mx-auto px-4 py-6"
      data-ocid="leaderboard.section"
    >
      <div className="text-center mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">
          LEADERBOARD
        </h2>
        <p className="text-muted-foreground text-sm">
          Top 10 running backs of all time
        </p>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {isLoading ? (
          <div className="p-4 space-y-2" data-ocid="leaderboard.loading_state">
            {["a", "b", "c", "d", "e"].map((k) => (
              <Skeleton
                key={k}
                className="h-10 w-full"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center" data-ocid="leaderboard.error_state">
            <p className="text-destructive text-sm">
              Failed to load leaderboard
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Connect your wallet to view scores
            </p>
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="p-12 text-center" data-ocid="leaderboard.empty_state">
            <div className="text-4xl mb-3">&#x1F3C8;</div>
            <p className="text-muted-foreground text-sm">No scores yet!</p>
            <p className="text-muted-foreground text-xs mt-1">
              Be the first to set a high score
            </p>
          </div>
        ) : (
          <Table data-ocid="leaderboard.table">
            <TableHeader>
              <TableRow style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <TableHead
                  className="w-12 text-center"
                  style={{ color: "#4A545D", fontSize: 11, fontWeight: 700 }}
                >
                  RANK
                </TableHead>
                <TableHead
                  style={{ color: "#4A545D", fontSize: 11, fontWeight: 700 }}
                >
                  PLAYER
                </TableHead>
                <TableHead
                  className="text-right"
                  style={{ color: "#4A545D", fontSize: 11, fontWeight: 700 }}
                >
                  SCORE
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, i) => {
                const isMe = entry.principal === myPrincipal;
                const rank = i + 1;
                return (
                  <TableRow
                    key={entry.principal || entry.playerName}
                    data-ocid={`leaderboard.item.${rank}`}
                    style={{
                      borderColor: "rgba(255,255,255,0.05)",
                      background: isMe ? "rgba(63,174,90,0.1)" : "transparent",
                    }}
                  >
                    <TableCell className="text-center">
                      {i < 3 ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: rankColors[i],
                          }}
                        >
                          {rankEmoji[i]}
                        </span>
                      ) : (
                        <span
                          style={{
                            color: "#4A545D",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          #{rank}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: isMe ? 700 : 400,
                            color: isMe ? "#3FAE5A" : "#E7E7E7",
                          }}
                        >
                          {entry.playerName}
                        </span>
                        {isMe && (
                          <Badge
                            style={{
                              fontSize: 9,
                              background: "#3FAE5A20",
                              borderColor: "#3FAE5A60",
                              color: "#3FAE5A",
                            }}
                          >
                            YOU
                          </Badge>
                        )}
                        {i === 0 && (
                          <Badge
                            style={{
                              fontSize: 9,
                              background: "#FFD70020",
                              borderColor: "#FFD70060",
                              color: "#FFD700",
                            }}
                          >
                            CHAMPION
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 14,
                          fontWeight: 700,
                          color: i < 3 ? rankColors[i] : "#E7E7E7",
                        }}
                      >
                        {entry.score.toLocaleString()}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!myPrincipal && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Login to save your scores to the global leaderboard
        </p>
      )}
    </div>
  );
}
