import type { AppSettings } from "@/lib/settings";
import type { Lang } from "@/lib/i18n";
import { STR } from "@/lib/i18n";

export function SettingsModal(props: {
  open: boolean;
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { open, settings, onChange, onClose, onSave } = props;
  const t = STR[settings.lang];

  if (!open) return null;

  const set = (patch: Partial<AppSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{t.setTitle}</div>
          <button className="iconBtn" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>

        <div className="modalBody">
          <div className="field">
            <div className="fieldTop">{t.id}</div>
            <input
              className="input"
              value={settings.playerId}
              placeholder={t.id}
              onChange={(e) => set({ playerId: e.target.value })}
            />
          </div>

          <div className="field">
            <div className="fieldTop">{settings.lang === "ko" ? "출신 국가 또는 소속" : "Country or affiliation"}</div>
            <input
              className="input"
              value={settings.country}
              placeholder={settings.lang === "ko" ? "대한민국" : ""}
              onChange={(e) => set({ country: e.target.value })}
            />
          </div>

          <div className="field">
            <div className="fieldTop">{t.lang}</div>
            <div className="fieldRow">
              {(["ko","en"] as Lang[]).map((lng) => (
                <button
                  key={lng}
                  className={"chip " + (settings.lang === lng ? "active" : "")}
                  onClick={() => set({ lang: lng })}
                >
                  {lng === "ko" ? t.korean : "English"}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="fieldTop">{t.difficulty}</div>
            <div className="fieldRow">
              {(["easy","medium","hard","pro","insane"] as const).map((d) => (
                <button
                  key={d}
                  className={"chip " + (settings.defaultDifficulty === d ? "active" : "")}
                  onClick={() => set({ defaultDifficulty: d })}
                >
                  {d === "easy" ? t.easy : d === "medium" ? t.medium : d === "hard" ? t.hard : d === "pro" ? t.pro : t.insane}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="fieldTop">{t.options}</div>
            <div className="fieldRow">
              <button
                className={"chip " + (settings.highlightSameNumbers ? "active" : "")}
                onClick={() => set({ highlightSameNumbers: !settings.highlightSameNumbers })}
              >
                {t.highlightSame}
              </button>
              <button
                className={"chip " + (settings.showCompletedNumbers ? "active" : "")}
                onClick={() => set({ showCompletedNumbers: !settings.showCompletedNumbers })}
              >
                {t.showCompleted}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              • {t.highlightSame} {t.penaltyOn}<br/>
              • {t.showCompleted} {t.penaltyOn}
            </div>
          </div>
        </div>

        <div className="modalFooter">
          <button className="footerBtn" onClick={onClose}>{t.close}</button>
          <button className="footerBtn primary" onClick={onSave}>{t.save}</button>
        </div>
      </div>
    </div>
  );
}
