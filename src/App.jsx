import React, { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Aperture,
  Camera,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Mic2,
  Move3d,
  Pencil,
  Plus,
  Radio,
  Trash2,
  Video,
  X,
} from "lucide-react";

/* ---------------------------------------------------------
   Equipment Booking Ledger
   - Bookings and equipment settings are synchronized in real time.
   - Any user can add, rename, or delete equipment.
--------------------------------------------------------- */

const DEFAULT_EQUIPMENT = [
  { id: "cam-01", tag: "CAM-01", name: "DSLR Camera", icon: "camera" },
  { id: "cam-02", tag: "CAM-02", name: "Mirrorless Camera", icon: "aperture" },
  { id: "lens-01", tag: "LEN-01", name: "Lens Set", icon: "aperture" },
  { id: "tri-01", tag: "TRI-01", name: "Tripod", icon: "tripod" },
  { id: "gim-01", tag: "GIM-01", name: "Gimbal", icon: "tripod" },
  { id: "mic-01", tag: "MIC-01", name: "Wireless Microphone", icon: "microphone" },
  { id: "lgt-01", tag: "LGT-01", name: "Lighting Set", icon: "light" },
  { id: "cam-03", tag: "CAM-03", name: "Camcorder", icon: "video" },
];

const ICON_MAP = {
  camera: Camera,
  aperture: Aperture,
  microphone: Mic2,
  video: Video,
  light: Lightbulb,
  tripod: Move3d,
};

const ICON_OPTIONS = [
  { value: "camera", label: "Camera" },
  { value: "aperture", label: "Lens / Optical" },
  { value: "microphone", label: "Microphone" },
  { value: "video", label: "Video" },
  { value: "light", label: "Lighting" },
  { value: "tripod", label: "Stand / General" },
];

const START_HOUR = 9;
const END_HOUR = 21;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i
);
const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const BOOKINGS_DOC_PATH = ["bookings", "current"];
const EQUIPMENT_DOC_PATH = ["equipment", "current"];

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

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function createEquipmentId(tag) {
  const base = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "equipment";

  const randomPart = Math.random().toString(36).slice(2, 7);
  return `${base}-${Date.now().toString(36)}-${randomPart}`;
}

export default function App() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [equipment, setEquipment] = useState(DEFAULT_EQUIPMENT);
  const [selectedEquipment, setSelectedEquipment] = useState(
    DEFAULT_EQUIPMENT[0].id
  );
  const [bookings, setBookings] = useState({});
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  const [equipmentLoaded, setEquipmentLoaded] = useState(false);
  const [bookingsConnected, setBookingsConnected] = useState(false);
  const [equipmentConnected, setEquipmentConnected] = useState(false);
  const [userName, setUserName] = useState("");
  const [bookingModal, setBookingModal] = useState(null);
  const [equipmentModal, setEquipmentModal] = useState(null);
  const [purposeInput, setPurposeInput] = useState("");
  const [equipmentForm, setEquipmentForm] = useState({
    tag: "",
    name: "",
    icon: "aperture",
  });
  const [now, setNow] = useState(new Date());

  const connected = bookingsConnected && equipmentConnected;
  const loaded = bookingsLoaded && equipmentLoaded;

  const monday = getMonday(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  // Real-time booking subscription.
  useEffect(() => {
    const ref = doc(db, ...BOOKINGS_DOC_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists()
          ? safeParseJson(snap.data().json, {})
          : {};
        setBookings(data && typeof data === "object" ? data : {});
        setBookingsLoaded(true);
        setBookingsConnected(true);
      },
      () => {
        setBookingsLoaded(true);
        setBookingsConnected(false);
      }
    );

    return unsub;
  }, []);

  // Real-time equipment subscription. The default list is seeded once when
  // the equipment document does not exist yet.
  useEffect(() => {
    const ref = doc(db, ...EQUIPMENT_DOC_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setEquipment(DEFAULT_EQUIPMENT);
          setEquipmentLoaded(true);
          setEquipmentConnected(true);
          setDoc(ref, { json: JSON.stringify(DEFAULT_EQUIPMENT) }).catch(() =>
            setEquipmentConnected(false)
          );
          return;
        }

        const parsed = safeParseJson(snap.data().json, DEFAULT_EQUIPMENT);
        const nextEquipment = Array.isArray(parsed) && parsed.length
          ? parsed
          : DEFAULT_EQUIPMENT;

        setEquipment(nextEquipment);
        setEquipmentLoaded(true);
        setEquipmentConnected(true);
      },
      () => {
        setEquipmentLoaded(true);
        setEquipmentConnected(false);
      }
    );

    return unsub;
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(clock);
  }, []);

  // If another user deletes the selected equipment, automatically select
  // the first remaining item.
  useEffect(() => {
    if (
      equipmentLoaded &&
      equipment.length > 0 &&
      !equipment.some((item) => item.id === selectedEquipment)
    ) {
      setSelectedEquipment(equipment[0].id);
    }
  }, [equipment, equipmentLoaded, selectedEquipment]);

  async function saveBookings(next) {
    setBookings(next);
    const ref = doc(db, ...BOOKINGS_DOC_PATH);
    await setDoc(ref, { json: JSON.stringify(next) });
  }

  async function handleConfirmBooking() {
    if (!bookingModal) return;

    const key = slotKey(
      bookingModal.equipmentId,
      bookingModal.ds,
      bookingModal.hour
    );
    const ref = doc(db, ...BOOKINGS_DOC_PATH);
    const snap = await getDoc(ref);
    const latest = snap.exists()
      ? safeParseJson(snap.data().json, {})
      : {};

    if (latest[key]) {
      alert(
        "Another user booked this time slot first. The schedule has been refreshed."
      );
      setBookings(latest);
      setBookingModal(null);
      return;
    }

    const next = {
      ...latest,
      [key]: {
        equipmentId: bookingModal.equipmentId,
        ds: bookingModal.ds,
        hour: bookingModal.hour,
        name: userName.trim(),
        purpose: purposeInput.trim() || "(No purpose provided)",
        createdAt: Date.now(),
      },
    };

    await saveBookings(next);
    setBookingModal(null);
    setPurposeInput("");
  }

  async function handleCancelBooking(key) {
    const ref = doc(db, ...BOOKINGS_DOC_PATH);
    const snap = await getDoc(ref);
    const latest = snap.exists()
      ? safeParseJson(snap.data().json, {})
      : {};
    const next = { ...latest };
    delete next[key];
    await saveBookings(next);
    setBookingModal(null);
  }

  function openSlot(equipmentId, ds, hour) {
    const key = slotKey(equipmentId, ds, hour);
    const existing = bookings[key];

    if (existing) {
      setBookingModal({
        mode: "view",
        ds,
        hour,
        equipmentId,
        booking: existing,
        key,
      });
      return;
    }

    if (!userName.trim()) {
      alert("Enter your name at the top before making a booking.");
      return;
    }

    setBookingModal({ mode: "new", ds, hour, equipmentId });
    setPurposeInput("");
  }

  function openAddEquipmentModal() {
    setEquipmentForm({ tag: "", name: "", icon: "aperture" });
    setEquipmentModal({ mode: "add" });
  }

  function openEditEquipmentModal(item) {
    setEquipmentForm({
      tag: item.tag,
      name: item.name,
      icon: item.icon || "aperture",
    });
    setEquipmentModal({ mode: "edit", equipmentId: item.id });
  }

  async function handleSaveEquipment() {
    const tag = equipmentForm.tag.trim().toUpperCase();
    const name = equipmentForm.name.trim();

    if (!tag || !name) {
      alert("Enter both an equipment tag and equipment name.");
      return;
    }

    const ref = doc(db, ...EQUIPMENT_DOC_PATH);
    const snap = await getDoc(ref);
    const latestParsed = snap.exists()
      ? safeParseJson(snap.data().json, DEFAULT_EQUIPMENT)
      : DEFAULT_EQUIPMENT;
    const latest = Array.isArray(latestParsed) ? latestParsed : DEFAULT_EQUIPMENT;

    const duplicateTag = latest.some(
      (item) =>
        item.tag?.toUpperCase() === tag &&
        item.id !== equipmentModal?.equipmentId
    );

    if (duplicateTag) {
      alert("That equipment tag is already in use.");
      return;
    }

    let next;
    let nextSelectedId = selectedEquipment;

    if (equipmentModal?.mode === "edit") {
      next = latest.map((item) =>
        item.id === equipmentModal.equipmentId
          ? {
              ...item,
              tag,
              name,
              icon: equipmentForm.icon,
            }
          : item
      );
    } else {
      const newItem = {
        id: createEquipmentId(tag),
        tag,
        name,
        icon: equipmentForm.icon,
      };
      next = [...latest, newItem];
      nextSelectedId = newItem.id;
    }

    setEquipment(next);
    setSelectedEquipment(nextSelectedId);
    await setDoc(ref, { json: JSON.stringify(next) });
    setEquipmentModal(null);
  }

  async function handleDeleteEquipment() {
    if (equipmentModal?.mode !== "edit") return;

    const equipmentId = equipmentModal.equipmentId;
    const equipmentItem = equipment.find((item) => item.id === equipmentId);
    const equipmentRef = doc(db, ...EQUIPMENT_DOC_PATH);
    const bookingRef = doc(db, ...BOOKINGS_DOC_PATH);

    const equipmentSnap = await getDoc(equipmentRef);
    const latestEquipmentParsed = equipmentSnap.exists()
      ? safeParseJson(equipmentSnap.data().json, DEFAULT_EQUIPMENT)
      : DEFAULT_EQUIPMENT;
    const latestEquipment = Array.isArray(latestEquipmentParsed)
      ? latestEquipmentParsed
      : DEFAULT_EQUIPMENT;

    if (latestEquipment.length <= 1) {
      alert("At least one equipment item must remain.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${equipmentItem?.name || "this equipment"}? All bookings associated with it will also be deleted.`
    );
    if (!confirmed) return;

    const bookingSnap = await getDoc(bookingRef);
    const latestBookings = bookingSnap.exists()
      ? safeParseJson(bookingSnap.data().json, {})
      : {};

    const nextEquipment = latestEquipment.filter(
      (item) => item.id !== equipmentId
    );
    const nextBookings = Object.fromEntries(
      Object.entries(latestBookings).filter(
        ([key, booking]) =>
          booking?.equipmentId !== equipmentId &&
          !key.startsWith(`${equipmentId}__`)
      )
    );

    setEquipment(nextEquipment);
    setBookings(nextBookings);
    setSelectedEquipment((current) =>
      current === equipmentId ? nextEquipment[0].id : current
    );

    await Promise.all([
      setDoc(equipmentRef, { json: JSON.stringify(nextEquipment) }),
      setDoc(bookingRef, { json: JSON.stringify(nextBookings) }),
    ]);

    setEquipmentModal(null);
  }

  const activeEquipment =
    equipment.find((item) => item.id === selectedEquipment) || equipment[0];
  const ActiveEquipmentIcon = activeEquipment
    ? ICON_MAP[activeEquipment.icon] || Aperture
    : Aperture;
  const todayStr = dateStr(now);
  const currentHour = now.getHours();

  function isNowInUse(equipmentId) {
    const key = slotKey(equipmentId, todayStr, currentHour);
    return (
      !!bookings[key] &&
      currentHour >= START_HOUR &&
      currentHour <= END_HOUR
    );
  }

  const modalEquipment = bookingModal
    ? equipment.find((item) => item.id === bookingModal.equipmentId)
    : null;

  return (
    <div style={styles.page}>
      <style>{FONT_CSS}</style>

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoMark}>▣</div>
          <div>
            <div style={styles.title}>Equipment Booking</div>
            <div style={styles.subtitle}>SHARED EQUIPMENT BOOKING LEDGER</div>
          </div>
        </div>

        <div style={styles.weekNav}>
          <button
            style={styles.navBtn}
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <span style={styles.weekLabel}>
            {weekDates[0].getMonth() + 1}.{weekDates[0].getDate()} –{" "}
            {weekDates[6].getMonth() + 1}.{weekDates[6].getDate()}
            {weekOffset === 0 && (
              <span style={styles.weekTodayTag}>THIS WEEK</span>
            )}
          </span>
          <button
            style={styles.navBtn}
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.syncTag}>
            <Radio
              size={12}
              style={{
                color: connected
                  ? "var(--accent-green)"
                  : "var(--accent-red)",
              }}
            />
            <span>{connected ? "LIVE SYNC" : "CONNECTING"}</span>
          </div>
          <input
            style={styles.nameInput}
            placeholder="Enter your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            maxLength={24}
          />
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <div style={styles.sidebarLabel}>EQUIPMENT</div>
            <button
              style={styles.sidebarAddBtn}
              onClick={openAddEquipmentModal}
              title="Add equipment"
              aria-label="Add equipment"
            >
              <Plus size={15} />
            </button>
          </div>

          {equipment.map((item) => {
            const inUse = loaded && isNowInUse(item.id);
            const active = item.id === selectedEquipment;
            const EquipmentIcon = ICON_MAP[item.icon] || Aperture;

            return (
              <div key={item.id} style={styles.equipRow}>
                <button
                  onClick={() => setSelectedEquipment(item.id)}
                  style={{
                    ...styles.equipItem,
                    ...(active ? styles.equipItemActive : {}),
                  }}
                >
                  <div style={styles.equipIconWrap}>
                    <EquipmentIcon size={16} />
                  </div>
                  <div style={styles.equipTextWrap}>
                    <div style={styles.equipTag}>{item.tag}</div>
                    <div style={styles.equipName}>{item.name}</div>
                  </div>
                  <span
                    title={inUse ? "In use now" : "Available now"}
                    style={{
                      ...styles.statusDot,
                      background: inUse
                        ? "var(--accent-red)"
                        : "var(--accent-green)",
                      boxShadow: inUse
                        ? "0 0 0 3px rgba(232,67,47,0.15)"
                        : "0 0 0 3px rgba(47,158,110,0.12)",
                    }}
                  />
                </button>
                <button
                  style={styles.editEquipmentBtn}
                  onClick={() => openEditEquipmentModal(item)}
                  title={`Edit ${item.name}`}
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil size={13} />
                </button>
              </div>
            );
          })}

          <div style={styles.legend}>
            <div style={styles.legendRow}>
              <span
                style={{
                  ...styles.legendDot,
                  background: "var(--accent-green)",
                }}
              />
              Available now
            </div>
            <div style={styles.legendRow}>
              <span
                style={{
                  ...styles.legendDot,
                  background: "var(--accent-red)",
                }}
              />
              In use now
            </div>
          </div>
        </aside>

        <main style={styles.calendarWrap}>
          <div style={styles.calendarHeaderRow}>
            {activeEquipment ? (
              <div style={styles.activeEquipTitle}>
                <ActiveEquipmentIcon size={18} />
                <span>{activeEquipment.tag}</span>
                <span style={styles.activeEquipName}>
                  {activeEquipment.name}
                </span>
              </div>
            ) : (
              <div style={styles.activeEquipTitle}>No equipment available</div>
            )}
          </div>

          <div style={styles.gridScroll}>
            <div style={styles.grid}>
              <div style={{ ...styles.cell, ...styles.cornerCell }} />
              {weekDates.map((d, i) => {
                const isToday = dateStr(d) === todayStr;
                return (
                  <div
                    key={dateStr(d)}
                    style={{
                      ...styles.cell,
                      ...styles.dayHeaderCell,
                      ...(isToday ? styles.todayHeaderCell : {}),
                    }}
                  >
                    <div style={styles.dayLabel}>{DAY_LABELS[i]}</div>
                    <div style={styles.dayDate}>
                      {d.getMonth() + 1}/{d.getDate()}
                    </div>
                  </div>
                );
              })}

              {HOURS.map((h) => (
                <React.Fragment key={h}>
                  <div style={{ ...styles.cell, ...styles.hourCell }}>
                    {pad(h)}:00
                  </div>
                  {weekDates.map((d) => {
                    const ds = dateStr(d);
                    const key = slotKey(selectedEquipment, ds, h);
                    const booking = bookings[key];
                    const isNowCell = ds === todayStr && h === currentHour;
                    const mine =
                      booking &&
                      userName.trim() &&
                      booking.name === userName.trim();

                    return (
                      <button
                        key={`${ds}-${h}`}
                        onClick={() =>
                          activeEquipment &&
                          openSlot(selectedEquipment, ds, h)
                        }
                        disabled={!activeEquipment}
                        style={{
                          ...styles.cell,
                          ...styles.slotCell,
                          ...(isNowCell ? styles.nowCell : {}),
                          ...(booking
                            ? mine
                              ? styles.slotMine
                              : styles.slotBooked
                            : styles.slotFree),
                          ...(!activeEquipment ? styles.slotDisabled : {}),
                        }}
                        title={
                          booking
                            ? `${booking.name} · ${booking.purpose}`
                            : "Available to book"
                        }
                      >
                        {booking ? (
                          <span style={styles.slotBookedText}>
                            {booking.name}
                          </span>
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

      {bookingModal && (
        <div
          style={styles.overlay}
          onClick={() => setBookingModal(null)}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTag}>
                  {modalEquipment?.tag || "EQUIPMENT"}
                </div>
                <div style={styles.modalTitle}>
                  {bookingModal.ds.slice(5).replace("-", "/")} ·{" "}
                  {pad(bookingModal.hour)}:00–{pad(bookingModal.hour + 1)}:00
                </div>
              </div>
              <button
                style={styles.closeBtn}
                onClick={() => setBookingModal(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {bookingModal.mode === "new" ? (
              <div style={styles.modalBody}>
                <label style={styles.formLabel}>BOOKED BY</label>
                <div style={styles.readonlyName}>{userName.trim()}</div>
                <label style={styles.formLabel}>PURPOSE</label>
                <textarea
                  style={styles.textarea}
                  rows={3}
                  placeholder="e.g. Product photography"
                  value={purposeInput}
                  onChange={(e) => setPurposeInput(e.target.value)}
                  autoFocus
                />
                <button
                  style={styles.confirmBtn}
                  onClick={handleConfirmBooking}
                >
                  Book this time slot
                </button>
              </div>
            ) : (
              <div style={styles.modalBody}>
                <label style={styles.formLabel}>BOOKED BY</label>
                <div style={styles.readonlyName}>
                  {bookingModal.booking.name}
                </div>
                <label style={styles.formLabel}>PURPOSE</label>
                <div style={styles.readonlyPurpose}>
                  {bookingModal.booking.purpose}
                </div>
                {userName.trim() &&
                userName.trim() === bookingModal.booking.name ? (
                  <button
                    style={styles.cancelBtn}
                    onClick={() => handleCancelBooking(bookingModal.key)}
                  >
                    Cancel booking
                  </button>
                ) : (
                  <div style={styles.lockedNote}>
                    Only the person who made this booking can cancel it.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {equipmentModal && (
        <div
          style={styles.overlay}
          onClick={() => setEquipmentModal(null)}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTag}>EQUIPMENT SETTINGS</div>
                <div style={styles.modalTitle}>
                  {equipmentModal.mode === "add"
                    ? "Add equipment"
                    : "Edit equipment"}
                </div>
              </div>
              <button
                style={styles.closeBtn}
                onClick={() => setEquipmentModal(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <label style={styles.formLabel}>EQUIPMENT TAG</label>
              <input
                style={styles.formInput}
                placeholder="e.g. XRD-01"
                value={equipmentForm.tag}
                onChange={(e) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    tag: e.target.value,
                  }))
                }
                maxLength={20}
                autoFocus
              />

              <label style={styles.formLabel}>EQUIPMENT NAME</label>
              <input
                style={styles.formInput}
                placeholder="e.g. X-ray Diffractometer"
                value={equipmentForm.name}
                onChange={(e) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    name: e.target.value,
                  }))
                }
                maxLength={50}
              />

              <label style={styles.formLabel}>ICON</label>
              <select
                style={styles.formInput}
                value={equipmentForm.icon}
                onChange={(e) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    icon: e.target.value,
                  }))
                }
              >
                {ICON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div style={styles.modalActions}>
                {equipmentModal.mode === "edit" && (
                  <button
                    style={styles.deleteEquipmentBtn}
                    onClick={handleDeleteEquipment}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
                <button
                  style={styles.confirmBtnCompact}
                  onClick={handleSaveEquipment}
                >
                  {equipmentModal.mode === "add" ? "Add equipment" : "Save changes"}
                </button>
              </div>

              {equipmentModal.mode === "edit" && (
                <div style={styles.deleteNote}>
                  Deleting equipment also removes all bookings associated with it.
                </div>
              )}
            </div>
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
button, input, textarea, select { box-sizing: border-box; }
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
  title: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    lineHeight: 1.1,
  },
  subtitle: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    color: "var(--muted)",
    marginTop: 2,
  },
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
    minWidth: 178,
    justifyContent: "center",
  },
  weekTodayTag: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 9,
    background: "var(--ink)",
    color: "var(--paper)",
    padding: "2px 6px",
    borderRadius: 999,
  },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  syncTag: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "var(--muted)",
  },
  nameInput: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--line)",
    outline: "none",
    width: 150,
    background: "var(--paper)",
  },
  body: { display: "flex", flex: 1, minHeight: 0 },
  sidebar: {
    width: 250,
    borderRight: "1px solid var(--line)",
    background: "var(--panel)",
    padding: "14px 10px",
    overflowY: "auto",
    flexShrink: 0,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 4px 9px 8px",
  },
  sidebarLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    color: "var(--muted)",
  },
  sidebarAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--paper)",
    color: "var(--ink)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  equipRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  equipItem: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 8px",
    borderRadius: 8,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  },
  equipItemActive: {
    background: "var(--paper)",
    border: "1px solid var(--line)",
  },
  editEquipmentBtn: {
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
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
  equipTag: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "var(--muted)",
    letterSpacing: "0.03em",
  },
  equipName: {
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  statusDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  legend: {
    marginTop: 14,
    padding: "10px 8px",
    borderTop: "1px solid var(--line-soft)",
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "var(--muted)",
    marginBottom: 4,
  },
  legendDot: { width: 7, height: 7, borderRadius: "50%" },
  calendarWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  calendarHeaderRow: { padding: "12px 18px 4px" },
  activeEquipTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 15,
  },
  activeEquipName: {
    fontFamily: "'Inter', sans-serif",
    fontWeight: 400,
    color: "var(--muted)",
    fontSize: 13,
  },
  gridScroll: { flex: 1, overflow: "auto", padding: "8px 18px 18px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "64px repeat(7, minmax(78px, 1fr))",
    gridAutoRows: "42px",
    minWidth: 640,
  },
  cell: {
    border: "1px solid var(--line-soft)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
  },
  cornerCell: {
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
  },
  dayHeaderCell: {
    background: "var(--panel)",
    flexDirection: "column",
    padding: "4px 0",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  todayHeaderCell: { background: "#EFF6F1" },
  dayLabel: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 11,
  },
  dayDate: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "var(--muted)",
  },
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
  slotDisabled: { cursor: "not-allowed", opacity: 0.45 },
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
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(27,30,32,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 16,
  },
  modal: {
    width: 340,
    maxWidth: "100%",
    background: "var(--panel)",
    borderRadius: 12,
    border: "1px solid var(--line)",
    padding: 18,
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTag: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "var(--muted)",
  },
  modalTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 15,
    marginTop: 2,
  },
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
  formLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "var(--muted)",
    letterSpacing: "0.05em",
    marginTop: 6,
  },
  formInput: {
    width: "100%",
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--panel)",
    color: "var(--ink)",
    outline: "none",
  },
  readonlyName: { fontSize: 14, fontWeight: 600, marginBottom: 4 },
  readonlyPurpose: {
    fontSize: 13,
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "8px 10px",
    borderRadius: 6,
  },
  textarea: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--line)",
    resize: "none",
    outline: "none",
  },
  confirmBtn: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--ink)",
    color: "var(--paper)",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
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
  modalActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  deleteEquipmentBtn: {
    marginRight: "auto",
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid var(--accent-red)",
    background: "transparent",
    color: "var(--accent-red)",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  confirmBtnCompact: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--ink)",
    color: "var(--paper)",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  deleteNote: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 1.45,
    color: "var(--muted)",
  },
};
