import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import {
  Camera,
  Aperture,
  Mic2,
  Video,
  Lightbulb,
  Move3d,
  ChevronLeft,
  ChevronRight,
  X,
  Radio,
} from "lucide-react";

/* ---------------------------------------------------------
   장비예약대장 (Equipment Booking Ledger)
   - Firestore 실시간 리스너로 모든 접속자에게 즉시 동기화
--------------------------------------------------------- */

const EQUIPMENT = [
  { id: "cam-01", tag: "CAM-01", name: "DSLR 카메라", Icon: Camera },
  { id: "cam-02", tag: "CAM-02", name: "미러리스 카메라", Icon: Aperture },
  { id: "lens-01", tag: "LEN-01", name: "렌즈 세트", Icon: Aperture },
  { id: "tri-01", tag: "TRI-01", name: "삼각대", Icon: Move3d },
  { id: "gim-01", tag: "GIM-01", name: "짐벌", Icon: Move3d },
  { id: "mic-01", tag: "MIC-01", name: "무선 마이크", Icon: Mic2 },
  { id: "lgt-01", tag: "LGT-01", name: "조명 세트", Icon: Lightbulb },
  { id: "cam-03", tag: "CAM-03", name: "캠코더", Icon: Video },
];

const START_HOUR = 9;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const DOC_REF_PATH = ["bookings", "current"];

function pad(n) {
  return String(n).padStart(2, "0");
}
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function getMonday(base) {
  const d = new Date(base);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function slotKey(equipmentId, ds, hour) {
  return `${equipmentId}__${ds}__${hour}`;
}

export default function App() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEquipment, setSelectedEquipment] = useState(EQUIPMENT[0].id);
  const [bookings, setBookings] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [userName, setUserName] = useState("");
  const [modal, setModal] = useState(null);
  const [purposeInput, setPurposeInput] = useState("");
  const [now, setNow] = useState(new Date());

  const monday = getMonday(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  // Firestore 실시간 구독: 누군가 예약/취소하면 모든 접속자 화면이 즉시 갱신됨
  useEffect(() => {
    const ref = doc(db, ...DOC_REF_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? JSON.parse(snap.data().json || "{}") : {};
        setBookings(data);
        setLoaded(true);
        setConnected(true);
      },
      () => setConnected(false)
    );
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => {
      unsub();
      clearInterval(clock);
    };
  }, []);

  async function saveBookings(next) {
    setBookings(next);
    const ref = doc(db, ...DOC_REF_PATH);
    await setDoc(ref, { json: JSON.stringify(next) });
  }

  async function handleConfirmBooking() {
    if (!modal) return;
    const key = slotKey(modal.equipmentId, modal.ds, modal.hour);
    const ref = doc(db, ...DOC_REF_PATH);
    const snap = await getDoc(ref);
    const latest = snap.exists() ? JSON.parse(snap.data().json || "{}") : {};
    if (latest[key]) {
      alert("방금 다른 이용자가 먼저 예약했습니다. 목록을 새로고침합니다.");
      setBookings(latest);
      setModal(null);
      return;
    }
    const next = {
      ...latest,
      [key]: {
        equipmentId: modal.equipmentId,
        ds: modal.ds,
        hour: modal.hour,
        name: userName.trim(),
        purpose: purposeInput.trim() || "(사유 미기재)",
        createdAt: Date.now(),
      },
    };
    await saveBookings(next);
    setModal(null);
    setPurposeInput("");
  }

  async function handleCancelBooking(key) {
    const next = { ...bookings };
    delete next[key];
    await saveBookings(next);
    setModal(null);
  }

  function openSlot(equipmentId, ds, hour) {
    const key = slotKey(equipmentId, ds, hour);
    const existing = bookings[key];
    if (existing) {
      setModal({ mode: "view", ds, hour, equipmentId, booking: existing, key });
    } else {
      if (!userName.trim()) {
        alert("먼저 상단에 이름을 입력해주세요.");
        return;
      }
      setModal({ mode: "new", ds, hour, equipmentId });
      setPurposeInput("");
    }
  }

  const activeEquipment = EQUIPMENT.find((e) => e.id === selectedEquipment);
  const todayStr = dateStr(now);
  const currentHour = now.getHours();

  function isNowInUse(equipmentId) {
    const key = slotKey(equipmentId, todayStr, currentHour);
    return !!bookings[key] && currentHour >= START_HOUR && currentHour <= END_HOUR;
  }

  return (
    <div style={styles.page}>
      <style>{FONT_CSS}</style>

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoMark}>▣</div>
          <div>
            <div style={styles.title}>장비예약대장</div>
            <div style={styles.subtitle}>EQUIPMENT BOOKING LEDGER</div>
          </div>
        </div>

        <div style={styles.weekNav}>
          <button style={styles.navBtn} onClick={() => setWeekOffset((w) => w - 1)} aria-label="이전 주">
            <ChevronLeft size={16} />
          </button>
          <span style={styles.weekLabel}>
            {weekDates[0].getMonth() + 1}.{weekDates[0].getDate()} – {weekDates[6].getMonth() + 1}.
            {weekDates[6].getDate()}
            {weekOffset === 0 && <span style={styles.weekTodayTag}>이번 주</span>}
          </span>
          <button style={styles.navBtn} onClick={() => setWeekOffset((w) => w + 1)} aria-label="다음 주">
            <ChevronRight size={16} />
          </button>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.syncTag}>
            <Radio size={12} style={{ color: connected ? "var(--accent-green)" : "var(--accent-red)" }} />
            <span>{connected ? "실시간 연결됨" : "연결 중"}</span>
          </div>
          <input
            style={styles.nameInput}
            placeholder="이름 입력"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            maxLength={12}
          />
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarLabel}>장비 목록</div>
          {EQUIPMENT.map((eq) => {
            const inUse = loaded && isNowInUse(eq.id);
            const active = eq.id === selectedEquipment;
            return (
              <button
                key={eq.id}
                onClick={() => setSelectedEquipment(eq.id)}
                style={{ ...styles.equipItem, ...(active ? styles.equipItemActive : {}) }}
              >
                <div style={styles.equipIconWrap}>
                  <eq.Icon size={16} />
                </div>
                <div style={styles.equipTextWrap}>
                  <div style={styles.equipTag}>{eq.tag}</div>
                  <div style={styles.equipName}>{eq.name}</div>
                </div>
                <span
                  title={inUse ? "지금 사용중" : "지금 사용가능"}
                  style={{
                    ...styles.statusDot,
                    background: inUse ? "var(--accent-red)" : "var(--accent-green)",
                    boxShadow: inUse ? "0 0 0 3px rgba(232,67,47,0.15)" : "0 0 0 3px rgba(47,158,110,0.12)",
                  }}
                />
              </button>
            );
          })}
          <div style={styles.legend}>
            <div style={styles.legendRow}>
              <span style={{ ...styles.legendDot, background: "var(--accent-green)" }} />
              사용 가능
            </div>
            <div style={styles.legendRow}>
              <span style={{ ...styles.legendDot, background: "var(--accent-red)" }} />
              사용중 (현재 시각)
            </div>
          </div>
        </aside>

        <main style={styles.calendarWrap}>
          <div style={styles.calendarHeaderRow}>
            <div style={styles.activeEquipTitle}>
              <activeEquipment.Icon size={18} />
              <span>{activeEquipment.tag}</span>
              <span style={styles.activeEquipName}>{activeEquipment.name}</span>
            </div>
          </div>

          <div style={styles.gridScroll}>
            <div style={styles.grid}>
              <div style={{ ...styles.cell, ...styles.cornerCell }} />
              {weekDates.map((d, i) => {
                const isToday = dateStr(d) === todayStr;
                return (
                  <div key={i} style={{ ...styles.cell, ...styles.dayHeaderCell, ...(isToday ? styles.todayHeaderCell : {}) }}>
                    <div style={styles.dayLabel}>{DAY_LABELS[i]}</div>
                    <div style={styles.dayDate}>{d.getMonth() + 1}/{d.getDate()}</div>
                  </div>
                );
              })}

              {HOURS.map((h) => (
                <React.Fragment key={h}>
                  <div style={{ ...styles.cell, ...styles.hourCell }}>{pad(h)}:00</div>
                  {weekDates.map((d, i) => {
                    const ds = dateStr(d);
                    const key = slotKey(selectedEquipment, ds, h);
                    const booking = bookings[key];
                    const isNowCell = ds === todayStr && h === currentHour;
                    const mine = booking && userName.trim() && booking.name === userName.trim();
                    return (
                      <button
                        key={i}
                        onClick={() => openSlot(selectedEquipment, ds, h)}
                        style={{
                          ...styles.cell,
                          ...styles.slotCell,
                          ...(isNowCell ? styles.nowCell : {}),
                          ...(booking ? (mine ? styles.slotMine : styles.slotBooked) : styles.slotFree),
                        }}
                        title={booking ? `${booking.name} · ${booking.purpose}` : "예약 가능"}
                      >
                        {booking ? (
                          <span style={styles.slotBookedText}>{booking.name}</span>
                        ) : (
                          <span style={styles.slotFreeText}>+</span>
                        )}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </main>
      </div>

      {modal && (
        <div style={styles.overlay} onClick={() => setModal(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTag}>{EQUIPMENT.find((e) => e.id === modal.equipmentId)?.tag}</div>
                <div style={styles.modalTitle}>
                  {modal.ds.slice(5).replace("-", "/")} · {pad(modal.hour)}:00–{pad(modal.hour + 1)}:00
                </div>
              </div>
              <button style={styles.closeBtn} onClick={() => setModal(null)}>
                <X size={16} />
              </button>
            </div>

            {modal.mode === "new" ? (
              <div style={styles.modalBody}>
                <label style={styles.formLabel}>예약자</label>
                <div style={styles.readonlyName}>{userName.trim()}</div>
                <label style={styles.formLabel}>사용 목적</label>
                <textarea
                  style={styles.textarea}
                  rows={3}
                  placeholder="예: 졸업작품 촬영"
                  value={purposeInput}
                  onChange={(e) => setPurposeInput(e.target.value)}
                  autoFocus
                />
                <button style={styles.confirmBtn} onClick={handleConfirmBooking}>
                  이 시간대 예약하기
                </button>
              </div>
            ) : (
              <div style={styles.modalBody}>
                <label style={styles.formLabel}>예약자</label>
                <div style={styles.readonlyName}>{modal.booking.name}</div>
                <label style={styles.formLabel}>사용 목적</label>
                <div style={styles.readonlyPurpose}>{modal.booking.purpose}</div>
                {userName.trim() && userName.trim() === modal.booking.name ? (
                  <button style={styles.cancelBtn} onClick={() => handleCancelBooking(modal.key)}>
                    예약 취소하기
                  </button>
                ) : (
                  <div style={styles.lockedNote}>본인 예약만 취소할 수 있습니다.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root {
  --ink: #1B1E20;
  --paper: #F3F4F1;
  --panel: #FFFFFF;
  --line: #DBDDD7;
  --line-soft: #E8E9E4;
  --accent-red: #E8432F;
  --accent-green: #2F9E6E;
  --muted: #868C82;
}
html, body, #root { height: 100%; margin: 0; }
`;

const styles = {
  page: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: "var(--paper)",
    color: "var(--ink)",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 20px",
    borderBottom: "1px solid var(--line)",
    background: "var(--panel)",
    flexWrap: "wrap",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: {
    width: 34,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--ink)",
    color: "var(--paper)",
    borderRadius: 8,
    fontSize: 16,
  },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, lineHeight: 1.1 },
  subtitle: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "var(--muted)", marginTop: 2 },
  weekNav: { display: "flex", alignItems: "center", gap: 10 },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--panel)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink)",
  },
  weekLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 150,
    justifyContent: "center",
  },
  weekTodayTag: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    background: "var(--ink)",
    color: "var(--paper)",
    padding: "2px 6px",
    borderRadius: 999,
  },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  syncTag: { display: "flex", alignItems: "center", gap: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--muted)" },
  nameInput: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--line)",
    outline: "none",
    width: 110,
    background: "var(--paper)",
  },
  body: { display: "flex", flex: 1, minHeight: 0 },
  sidebar: {
    width: 230,
    borderRight: "1px solid var(--line)",
    background: "var(--panel)",
    padding: "14px 10px",
    overflowY: "auto",
    flexShrink: 0,
  },
  sidebarLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "var(--muted)", padding: "0 8px 10px" },
  equipItem: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 8px",
    borderRadius: 8,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    marginBottom: 2,
  },
  equipItemActive: { background: "var(--paper)", border: "1px solid var(--line)" },
  equipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 6,
    background: "var(--paper)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  equipTextWrap: { flex: 1, minWidth: 0 },
  equipTag: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--muted)", letterSpacing: "0.03em" },
  equipName: { fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  statusDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  legend: { marginTop: 14, padding: "10px 8px", borderTop: "1px solid var(--line-soft)" },
  legendRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", marginBottom: 4 },
  legendDot: { width: 7, height: 7, borderRadius: "50%" },
  calendarWrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  calendarHeaderRow: { padding: "12px 18px 4px" },
  activeEquipTitle: { display: "flex", alignItems: "center", gap: 8, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15 },
  activeEquipName: { fontFamily: "'Inter', sans-serif", fontWeight: 400, color: "var(--muted)", fontSize: 13 },
  gridScroll: { flex: 1, overflow: "auto", padding: "8px 18px 18px" },
  grid: { display: "grid", gridTemplateColumns: "64px repeat(7, minmax(78px, 1fr))", gridAutoRows: "42px", minWidth: 640 },
  cell: { border: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 },
  cornerCell: { background: "var(--panel)", border: "1px solid var(--line-soft)" },
  dayHeaderCell: { background: "var(--panel)", flexDirection: "column", padding: "4px 0", position: "sticky", top: 0, zIndex: 2 },
  todayHeaderCell: { background: "#EFF6F1" },
  dayLabel: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 12 },
  dayDate: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--muted)" },
  hourCell: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "var(--muted)",
    background: "var(--panel)",
    position: "sticky",
    left: 0,
    zIndex: 1,
  },
  nowCell: { boxShadow: "inset 0 0 0 2px var(--accent-red)" },
  slotCell: { cursor: "pointer", padding: 0 },
  slotFree: { background: "var(--panel)" },
  slotFreeText: { color: "var(--line)", fontSize: 14 },
  slotBooked: { background: "#FBEAE7" },
  slotMine: { background: "#E4F2EA" },
  slotBookedText: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "var(--ink)",
    padding: "0 4px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  },
  overlay: { position: "fixed", inset: 0, background: "rgba(27,30,32,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 },
  modal: { width: 320, background: "var(--panel)", borderRadius: 12, border: "1px solid var(--line)", padding: 18 },
  modalHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  modalTag: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--muted)" },
  modalTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, marginTop: 2 },
  closeBtn: {
    border: "none",
    background: "var(--paper)",
    width: 26,
    height: 26,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink)",
  },
  modalBody: { display: "flex", flexDirection: "column", gap: 6 },
  formLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--muted)", letterSpacing: "0.05em", marginTop: 6 },
  readonlyName: { fontSize: 14, fontWeight: 600, marginBottom: 4 },
  readonlyPurpose: { fontSize: 13, color: "var(--ink)", background: "var(--paper)", padding: "8px 10px", borderRadius: 6 },
  textarea: { fontFamily: "'Inter', sans-serif", fontSize: 13, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)", resize: "none", outline: "none" },
  confirmBtn: { marginTop: 12, padding: "10px 12px", borderRadius: 8, border: "none", background: "var(--ink)", color: "var(--paper)", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  cancelBtn: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--accent-red)",
    background: "transparent",
    color: "var(--accent-red)",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  lockedNote: { marginTop: 12, fontSize: 12, color: "var(--muted)" },
};
