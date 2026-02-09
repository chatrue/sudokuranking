import { STR } from "@/lib/i18n";
import type { AppSettings } from "@/lib/settings";

type Row = {
  player_id: string;
  country: string | null;
};

export function RankingsModal(props: {
  open: boolean;
  settings: AppSettings;
  rows: Row[];
  loading: boolean;
  onClose: () => void;
}) {
  const { open, settings, rows, loading, onClose } = props;
  const t = STR[settings.lang];
  if (!open) return null;

  const top = rows?.[0];

  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{t.ranking}</div>
          <button className="iconBtn" onClick={onClose} aria-label={t.close}>✕</button>
        </div>

        <div className="modalBody">
          <div className="field" style={{ background: "white" }}>
            {loading ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.loading}</div>
            ) : !top ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.noSubmissions}</div>
            ) : (
              <div className="card" style={{ boxShadow: "none", borderRadius: 16, padding: 14 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  {t.rank1} {top.player_id}{top.country ? ` - ${top.country}` : ""}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
  제출에 성공한 점수만 서버에 누적됩니다.
</div>

                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modalFooter">
          <button className="pillBtn" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
