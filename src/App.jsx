import React, { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  Aperture,
  CalendarDays,
  CalendarRange,
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
   FSM Booking
   - Weekly and monthly calendar views
   - Real-time Firestore synchronization
   - User-editable equipment list
--------------------------------------------------------- */

const DEFAULT_EQUIPMENT = [
  {
    id: "afm-01",
    tag: "ANALYSIS",
    name: "Atomic Force Microscope (AFM)",
    icon: "aperture",
  },
  {
    id: "xrd-01",
    tag: "ANALYSIS",
    name: "X-ray Diffractometer (XRD)",
    icon: "camera",
  },
  {
    id: "tga-01",
    tag: "THERMAL",
    name: "Thermogravimetric Analyzer (TGA)",
    icon: "light",
  },
  {
    id: "uvvis-01",
    tag: "SPECTROSCOPY",
    name: "UV–Vis Spectrophotometer",
    icon: "aperture",
  },
  {
    id: "sem-01",
    tag: "MICROSCOPY",
    name: "Scanning Electron Microscope (SEM)",
    icon: "video",
  },
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
  { value: "aperture", label: "Analysis / Optical" },
  { value: "camera", label: "Imaging" },
  { value: "video", label: "Microscopy / Video" },
  { value: "light", label: "Thermal / Light" },
  { value: "microphone", label: "Signal / Sensor" },
  { value: "tripod", label: "Stand / General" },
];

const START_HOUR = 9;
const END_HOUR = 21;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i
);
const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const BOOKINGS_DOC_PATH = ["bookings", "current"];
const EQUIPMENT_DOC_PATH = ["equipment", "current"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateStr(ds) {
  const [year, month, day] = ds.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function getMonday(base) {
  const d = new Date(base);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base, amount) {
  const d = new Date(base);
  d.setDate(d.getDate() + amount);
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
  const base =
    tag
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "equipment";
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${base}-${Date.now().toString(36)}-${randomPart}`;
}

export default function App() {
  const [viewMode, setViewMode] = useState("week");
  const [viewDate, setViewDate] = useState(new Date());
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
  const todayStr = dateStr(now);
  const currentHour = now.getHours();

  const weekDates = useMemo(() => {
    const monday = getMonday(viewDate);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [viewDate]);

  const monthDates = useMemo(() => {
    const monthStart = new Date(
      viewDate.getFullYear(),
      viewDate.getMonth(),
      1
    );
    const gridStart = getMonday(monthStart);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewDate]);

  useEffect(() => {
    document.title = "FSM Booking";
  }, []);

  useEffect(() => {
    const ref = doc(db, ...BOOKINGS_DOC_PATH);
    return onSnapshot(
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
  }, []);

  useEffect(() => {
    const ref = doc(db, ...EQUIPMENT_DOC_PATH);
    return onSnapshot(
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
        const nextEquipment =
          Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_EQUIPMENT;
        setEquipment(nextEquipment);
        setEquipmentLoaded(true);
        setEquipmentConnected(true);
      },
      () => {
        setEquipmentLoaded(true);
        setEquipmentConnected(false);
      }
    );
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (
      equipmentLoaded &&
      equipment.length > 0 &&
      !equipment.some((item) => item.id === selectedEquipment)
    ) {
      setSelectedEquipment(equipment[0].id);
    }
  }, [equipment, equipmentLoaded, selectedEquipment]);

  function goPrevious() {
    setViewDate((current) => {
      const next = new Date(current);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() - 1, 1);
      } else {
        next.setDate(next.getDate() - 7);
      }
      return next;
    });
  }

  function goNext() {
    setViewDate((current) => {
      const next = new Date(current);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() + 1, 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      return next;
    });
  }

  function goToday() {
    setViewDate(new Date());
  }

  async function refreshBookings() {
    const ref = doc(db, ...BOOKINGS_DOC_PATH);
    const snap = await getDoc(ref);
    const latest = snap.exists()
      ? safeParseJson(snap.data().json, {})
      : {};
    setBookings(latest && typeof latest === "object" ? latest : {});
  }

  async function handleConfirmBooking() {
    if (!bookingModal) return;

    const key = slotKey(
      bookingModal.equipmentId,
      bookingModal.ds,
      bookingModal.hour
    );
    const booking = {
      equipmentId: bookingModal.equipmentId,
      ds: bookingModal.ds,
      hour: bookingModal.hour,
      name: userName.trim(),
      purpose: purposeInput.trim() || "(No purpose provided)",
      createdAt: Date.now(),
    };
    const previous = bookings;

    setBookings((current) => ({ ...current, [key]: booking }));
    setBookingModal(null);
    setPurposeInput("");

    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, ...BOOKINGS_DOC_PATH);
        const snap = await transaction.get(ref);
        const latest = snap.exists()
          ? safeParseJson(snap.data().json, {})
          : {};

        if (latest[key]) {
          const error = new Error("BOOKING_CONFLICT");
          error.code = "BOOKING_CONFLICT";
          throw error;
        }

        transaction.set(ref, {
          json: JSON.stringify({ ...latest, [key]: booking }),
        });
      });
    } catch (error) {
      setBookings(previous);
      await refreshBookings().catch(() => {});
      if (error?.code === "BOOKING_CONFLICT") {
        alert(
          "Another user booked this time slot first. The schedule has been refreshed."
        );
      } else {
        alert(`The booking could not be saved. ${error?.message || ""}`);
      }
    }
  }

  async function handleCancelBooking(key) {
    const previous = bookings;
    const optimistic = { ...bookings };
    delete optimistic[key];
    setBookings(optimistic);
    setBookingModal(null);

    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, ...BOOKINGS_DOC_PATH);
        const snap = await transaction.get(ref);
        const latest = snap.exists()
          ? safeParseJson(snap.data().json, {})
          : {};
        delete latest[key];
        transaction.set(ref, { json: JSON.stringify(latest) });
      });
    } catch (error) {
      setBookings(previous);
      alert(`The booking could not be cancelled. ${error?.message || ""}`);
    }
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

  function openMonthDay(ds) {
    setViewDate(fromDateStr(ds));
    setViewMode("week");
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

    const previous = equipment;
    let newItem = null;
    let optimistic;

    if (equipmentModal?.mode === "edit") {
      optimistic = equipment.map((item) =>
        item.id === equipmentModal.equipmentId
          ? { ...item, tag, name, icon: equipmentForm.icon }
          : item
      );
    } else {
      newItem = {
        id: createEquipmentId(tag),
        tag,
        name,
        icon: equipmentForm.icon,
      };
      optimistic = [...equipment, newItem];
      setSelectedEquipment(newItem.id);
    }

    setEquipment(optimistic);
    setEquipmentModal(null);

    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, ...EQUIPMENT_DOC_PATH);
        const snap = await transaction.get(ref);
        const parsed = snap.exists()
          ? safeParseJson(snap.data().json, DEFAULT_EQUIPMENT)
          : DEFAULT_EQUIPMENT;
        const latest = Array.isArray(parsed) ? parsed : DEFAULT_EQUIPMENT;
        let next;

        if (equipmentModal?.mode === "edit") {
          next = latest.map((item) =>
            item.id === equipmentModal.equipmentId
              ? { ...item, tag, name, icon: equipmentForm.icon }
              : item
          );
        } else {
          next = [...latest, newItem];
        }

        transaction.set(ref, { json: JSON.stringify(next) });
      });
    } catch (error) {
      setEquipment(previous);
      alert(`The equipment could not be saved. ${error?.message || ""}`);
    }
  }

  async function handleDeleteEquipment() {
    if (equipmentModal?.mode !== "edit") return;

    const equipmentId = equipmentModal.equipmentId;
    const item = equipment.find((entry) => entry.id === equipmentId);

    if (equipment.length <= 1) {
      alert("At least one equipment item must remain.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${item?.name || "this equipment"}? All bookings associated with it will also be deleted.`
    );
    if (!confirmed) return;

    const previousEquipment = equipment;
    const previousBookings = bookings;
    const nextEquipment = equipment.filter((entry) => entry.id !== equipmentId);
    const nextBookings = Object.fromEntries(
      Object.entries(bookings).filter(
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
    setEquipmentModal(null);

    try {
      await runTransaction(db, async (transaction) => {
        const equipmentRef = doc(db, ...EQUIPMENT_DOC_PATH);
        const bookingsRef = doc(db, ...BOOKINGS_DOC_PATH);
        const equipmentSnap = await transaction.get(equipmentRef);
        const bookingsSnap = await transaction.get(bookingsRef);

        const parsedEquipment = equipmentSnap.exists()
          ? safeParseJson(equipmentSnap.data().json, DEFAULT_EQUIPMENT)
          : DEFAULT_EQUIPMENT;
        const latestEquipment = Array.isArray(parsedEquipment)
          ? parsedEquipment
          : DEFAULT_EQUIPMENT;

        if (latestEquipment.length <= 1) {
          throw new Error("At least one equipment item must remain.");
        }

        const latestBookings = bookingsSnap.exists()
          ? safeParseJson(bookingsSnap.data().json, {})
          : {};
        const savedEquipment = latestEquipment.filter(
          (entry) => entry.id !== equipmentId
        );
        const savedBookings = Object.fromEntries(
          Object.entries(latestBookings).filter(
            ([key, booking]) =>
              booking?.equipmentId !== equipmentId &&
              !key.startsWith(`${equipmentId}__`)
          )
        );

        transaction.set(equipmentRef, {
          json: JSON.stringify(savedEquipment),
        });
        transaction.set(bookingsRef, {
          json: JSON.stringify(savedBookings),
        });
      });
    } catch (error) {
      setEquipment(previousEquipment);
      setBookings(previousBookings);
      setSelectedEquipment(equipmentId);
      alert(`The equipment could not be deleted. ${error?.message || ""}`);
    }
  }

  const activeEquipment =
    equipment.find((item) => item.id === selectedEquipment) || equipment[0];
  const ActiveEquipmentIcon = activeEquipment
    ? ICON_MAP[activeEquipment.icon] || Aperture
    : Aperture;

  function isNowInUse(equipmentId) {
    const key = slotKey(equipmentId, todayStr, currentHour);
    return (
      !!bookings[key] &&
      currentHour >= START_HOUR &&
      currentHour <= END_HOUR
    );
  }

  function bookingsForDay(ds) {
    return Object.values(bookings)
      .filter(
        (booking) =>
          booking?.equipmentId === selectedEquipment && booking?.ds === ds
      )
      .sort((a, b) => a.hour - b.hour);
  }

  const modalEquipment = bookingModal
    ? equipment.find((item) => item.id === bookingModal.equipmentId)
    : null;

  const weekIsCurrent =
    dateStr(weekDates[0]) === dateStr(getMonday(new Date()));
  const monthIsCurrent =
    viewDate.getFullYear() === now.getFullYear() &&
    viewDate.getMonth() === now.getMonth();

  const navigationLabel =
    viewMode === "month"
      ? `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`
      : `${weekDates[0].getMonth() + 1}.${weekDates[0].getDate()} – ${
          weekDates[6].getMonth() + 1
        }.${weekDates[6].getDate()}`;

  return (
    <div style={styles.page}>
      <style>{FONT_CSS}</style>

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoMark}>▣</div>
          <div>
            <div style={styles.title}>FSM Booking</div>
            <div style={styles.subtitle}>SHARED EQUIPMENT BOOKING LEDGER</div>
          </div>
        </div>

        <div style={styles.headerCenter}>
          <div style={styles.viewToggle}>
            <button
              style={{
                ...styles.viewToggleButton,
                ...(viewMode === "week" ? styles.viewToggleButtonActive : {}),
              }}
              onClick={() => setViewMode("week")}
            >
              <CalendarRange size={17} />
              WEEK
            </button>
            <button
              style={{
                ...styles.viewToggleButton,
                ...(viewMode === "month" ? styles.viewToggleButtonActive : {}),
              }}
              onClick={() => setViewMode("month")}
            >
              <CalendarDays size={17} />
              MONTH
            </button>
          </div>

          <div style={styles.dateNav}>
            <button
              style={styles.navBtn}
              onClick={goPrevious}
              aria-label={viewMode === "month" ? "Previous month" : "Previous week"}
            >
              <ChevronLeft size={19} />
            </button>
            <button style={styles.dateLabelButton} onClick={goToday}>
              <span>{navigationLabel}</span>
              {((viewMode === "week" && weekIsCurrent) ||
                (viewMode === "month" && monthIsCurrent)) && (
                <span style={styles.currentTag}>
                  {viewMode === "month" ? "THIS MONTH" : "THIS WEEK"}
                </span>
              )}
            </button>
            <button
              style={styles.navBtn}
              onClick={goNext}
              aria-label={viewMode === "month" ? "Next month" : "Next week"}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.syncTag}>
            <Radio
              size={15}
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
              <Plus size={19} />
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
                    <EquipmentIcon size={20} />
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
                        ? "0 0 0 4px rgba(232,67,47,0.15)"
                        : "0 0 0 4px rgba(47,158,110,0.12)",
                    }}
                  />
                </button>
                <button
                  style={styles.editEquipmentBtn}
                  onClick={() => openEditEquipmentModal(item)}
                  title={`Edit ${item.name}`}
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil size={17} />
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
                <ActiveEquipmentIcon size={23} />
                <span>{activeEquipment.tag}</span>
                <span style={styles.activeEquipName}>
                  {activeEquipment.name}
                </span>
              </div>
            ) : (
              <div style={styles.activeEquipTitle}>No equipment available</div>
            )}
          </div>

          {viewMode === "week" ? (
            <div style={styles.gridScroll}>
              <div style={styles.weekGrid}>
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

                {HOURS.map((hour) => (
                  <React.Fragment key={hour}>
                    <div style={{ ...styles.cell, ...styles.hourCell }}>
                      {pad(hour)}:00
                    </div>
                    {weekDates.map((d) => {
                      const ds = dateStr(d);
                      const key = slotKey(selectedEquipment, ds, hour);
                      const booking = bookings[key];
                      const isNowCell = ds === todayStr && hour === currentHour;
                      const mine =
                        booking &&
                        userName.trim() &&
                        booking.name === userName.trim();

                      return (
                        <button
                          key={`${ds}-${hour}`}
                          onClick={() =>
                            activeEquipment &&
                            openSlot(selectedEquipment, ds, hour)
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
          ) : (
            <div style={styles.monthScroll}>
              <div style={styles.monthWeekHeader}>
                {DAY_LABELS.map((day) => (
                  <div key={day} style={styles.monthWeekHeaderCell}>
                    {day}
                  </div>
                ))}
              </div>
              <div style={styles.monthGrid}>
                {monthDates.map((d) => {
                  const ds = dateStr(d);
                  const isToday = ds === todayStr;
                  const inCurrentMonth = d.getMonth() === viewDate.getMonth();
                  const dayBookings = bookingsForDay(ds);

                  return (
                    <button
                      key={ds}
                      style={{
                        ...styles.monthCell,
                        ...(!inCurrentMonth ? styles.monthCellMuted : {}),
                        ...(isToday ? styles.monthCellToday : {}),
                      }}
                      onClick={() => openMonthDay(ds)}
                      title="Open this week"
                    >
                      <div style={styles.monthDateRow}>
                        <span style={styles.monthDateNumber}>{d.getDate()}</span>
                        {dayBookings.length > 0 && (
                          <span style={styles.monthBookingCount}>
                            {dayBookings.length} booking
                            {dayBookings.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div style={styles.monthBookingList}>
                        {dayBookings.slice(0, 4).map((booking) => (
                          <div
                            key={`${booking.ds}-${booking.hour}-${booking.name}`}
                            style={styles.monthBookingChip}
                          >
                            <span style={styles.monthBookingTime}>
                              {pad(booking.hour)}:00
                            </span>
                            <span style={styles.monthBookingName}>
                              {booking.name}
                            </span>
                          </div>
                        ))}
                        {dayBookings.length > 4 && (
                          <div style={styles.monthMoreBookings}>
                            +{dayBookings.length - 4} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {bookingModal && (
        <div style={styles.overlay} onClick={() => setBookingModal(null)}>
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
                <X size={20} />
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
                  placeholder="e.g. AFM imaging for Sample A"
                  value={purposeInput}
                  onChange={(e) => setPurposeInput(e.target.value)}
                  autoFocus
                />
                <button style={styles.confirmBtn} onClick={handleConfirmBooking}>
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
        <div style={styles.overlay} onClick={() => setEquipmentModal(null)}>
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
                <X size={20} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <label style={styles.formLabel}>EQUIPMENT TAG</label>
              <input
                style={styles.formInput}
                placeholder="e.g. MICROSCOPY"
                value={equipmentForm.tag}
                onChange={(e) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    tag: e.target.value,
                  }))
                }
                maxLength={30}
                autoFocus
              />
              <div style={styles.formHint}>
                Equipment tags may be shared by multiple instruments.
              </div>

              <label style={styles.formLabel}>EQUIPMENT NAME</label>
              <input
                style={styles.formInput}
                placeholder="e.g. Atomic Force Microscope (AFM)"
                value={equipmentForm.name}
                onChange={(e) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    name: e.target.value,
                  }))
                }
                maxLength={70}
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
                    <Trash2 size={18} />
                    Delete
                  </button>
                )}
                <button
                  style={styles.confirmBtnCompact}
                  onClick={handleSaveEquipment}
                >
                  {equipmentModal.mode === "add"
                    ? "Add equipment"
                    : "Save changes"}
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
button, input, textarea, select { font: inherit; }
`;

const styles = {
  page: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: "var(--paper)",
    color: "var(--ink)",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    fontSize: 17,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    padding: "16px 22px",
    borderBottom: "1px solid var(--line)",
    background: "var(--panel)",
    flexWrap: "wrap",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logoMark: {
    width: 42,
    height: 42,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--ink)",
    color: "var(--paper)",
    borderRadius: 9,
    fontSize: 21,
  },
  title: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 21,
    lineHeight: 1.1,
  },
  subtitle: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    letterSpacing: "0.08em",
    color: "var(--muted)",
    marginTop: 3,
  },
  headerCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  viewToggle: {
    display: "flex",
    padding: 3,
    borderRadius: 9,
    background: "var(--paper)",
    border: "1px solid var(--line)",
  },
  viewToggleButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 10px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "var(--muted)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  viewToggleButtonActive: {
    background: "var(--panel)",
    color: "var(--ink)",
    boxShadow: "0 1px 3px rgba(27,30,32,0.10)",
  },
  dateNav: { display: "flex", alignItems: "center", gap: 10 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 7,
    border: "1px solid var(--line)",
    background: "var(--panel)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink)",
  },
  dateLabelButton: {
    minWidth: 228,
    border: "none",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    color: "var(--ink)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 17,
    cursor: "pointer",
  },
  currentTag: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    background: "var(--ink)",
    color: "var(--paper)",
    padding: "3px 7px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  syncTag: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14,
    color: "var(--muted)",
  },
  nameInput: {
    fontSize: 17,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--line)",
    outline: "none",
    width: 190,
    background: "var(--paper)",
  },
  body: { display: "flex", flex: 1, minHeight: 0 },
  sidebar: {
    width: 300,
    borderRight: "1px solid var(--line)",
    background: "var(--panel)",
    padding: "16px 11px",
    overflowY: "auto",
    flexShrink: 0,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 5px 11px 9px",
  },
  sidebarLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    letterSpacing: "0.08em",
    color: "var(--muted)",
  },
  sidebarAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 7,
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
    gap: 5,
    marginBottom: 3,
  },
  equipItem: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "11px 9px",
    borderRadius: 9,
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
    width: 35,
    height: 35,
    flexShrink: 0,
    borderRadius: 7,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  equipIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 7,
    background: "var(--paper)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  equipTextWrap: { flex: 1, minWidth: 0 },
  equipTag: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "var(--muted)",
    letterSpacing: "0.03em",
  },
  equipName: {
    fontSize: 17,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  statusDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  legend: {
    marginTop: 17,
    padding: "13px 9px",
    borderTop: "1px solid var(--line-soft)",
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "var(--muted)",
    marginBottom: 6,
  },
  legendDot: { width: 9, height: 9, borderRadius: "50%" },
  calendarWrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  calendarHeaderRow: { padding: "15px 20px 6px" },
  activeEquipTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 20,
  },
  activeEquipName: {
    fontFamily: "'Inter', sans-serif",
    fontWeight: 400,
    color: "var(--muted)",
    fontSize: 17,
  },
  gridScroll: { flex: 1, overflow: "auto", padding: "10px 20px 20px" },
  weekGrid: {
    display: "grid",
    gridTemplateColumns: "82px repeat(7, minmax(105px, 1fr))",
    gridAutoRows: "52px",
    minWidth: 850,
  },
  cell: {
    border: "1px solid var(--line-soft)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
  },
  cornerCell: { background: "var(--panel)" },
  dayHeaderCell: {
    background: "var(--panel)",
    flexDirection: "column",
    padding: "5px 0",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  todayHeaderCell: { background: "#EFF6F1" },
  dayLabel: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 16,
  },
  dayDate: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "var(--muted)",
  },
  hourCell: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14,
    color: "var(--muted)",
    background: "var(--panel)",
    position: "sticky",
    left: 0,
    zIndex: 1,
  },
  nowCell: { boxShadow: "inset 0 0 0 2px var(--accent-red)" },
  slotCell: { cursor: "pointer", padding: 0 },
  slotFree: { background: "var(--panel)" },
  slotFreeText: { color: "var(--line)", fontSize: 20 },
  slotBooked: { background: "#FBEAE7" },
  slotMine: { background: "#E4F2EA" },
  slotDisabled: { cursor: "not-allowed", opacity: 0.55 },
  slotBookedText: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "var(--ink)",
    padding: "0 6px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  },
  monthScroll: { flex: 1, overflow: "auto", padding: "10px 20px 20px" },
  monthWeekHeader: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(135px, 1fr))",
    minWidth: 945,
  },
  monthWeekHeaderCell: {
    padding: "11px 8px",
    border: "1px solid var(--line-soft)",
    background: "var(--panel)",
    textAlign: "center",
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 16,
  },
  monthGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(135px, 1fr))",
    gridTemplateRows: "repeat(6, minmax(145px, 1fr))",
    minWidth: 945,
    minHeight: 870,
  },
  monthCell: {
    minWidth: 0,
    padding: 11,
    border: "1px solid var(--line-soft)",
    background: "var(--panel)",
    color: "var(--ink)",
    textAlign: "left",
    verticalAlign: "top",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  monthCellMuted: { background: "#F8F8F6", color: "var(--muted)" },
  monthCellToday: { boxShadow: "inset 0 0 0 2px var(--accent-green)" },
  monthDateRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  monthDateNumber: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 500,
    fontSize: 16,
  },
  monthBookingCount: {
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },
  monthBookingList: { display: "flex", flexDirection: "column", gap: 6 },
  monthBookingChip: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
    padding: "5px 7px",
    borderRadius: 6,
    background: "#E4F2EA",
    fontSize: 13,
  },
  monthBookingTime: {
    flexShrink: 0,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "var(--muted)",
  },
  monthBookingName: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  monthMoreBookings: { fontSize: 13, color: "var(--muted)", paddingLeft: 6 },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(27,30,32,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  modal: {
    width: 410,
    maxWidth: "calc(100vw - 32px)",
    background: "var(--panel)",
    borderRadius: 14,
    border: "1px solid var(--line)",
    padding: 23,
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 17,
  },
  modalTag: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "var(--muted)",
  },
  modalTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 20,
    marginTop: 3,
  },
  closeBtn: {
    border: "none",
    background: "var(--paper)",
    width: 34,
    height: 34,
    borderRadius: 7,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink)",
  },
  modalBody: { display: "flex", flexDirection: "column", gap: 8 },
  formLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "var(--muted)",
    letterSpacing: "0.05em",
    marginTop: 8,
  },
  formHint: { fontSize: 13, color: "var(--muted)", marginTop: -2 },
  readonlyName: { fontSize: 18, fontWeight: 600, marginBottom: 5 },
  readonlyPurpose: {
    fontSize: 17,
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "10px 12px",
    borderRadius: 7,
  },
  textarea: {
    fontSize: 17,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--line)",
    resize: "none",
    outline: "none",
  },
  formInput: {
    width: "100%",
    fontSize: 17,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--line)",
    outline: "none",
    background: "var(--panel)",
    color: "var(--ink)",
  },
  confirmBtn: {
    marginTop: 15,
    padding: "12px 14px",
    borderRadius: 9,
    border: "none",
    background: "var(--ink)",
    color: "var(--paper)",
    fontWeight: 600,
    fontSize: 17,
    cursor: "pointer",
  },
  cancelBtn: {
    marginTop: 15,
    padding: "12px 14px",
    borderRadius: 9,
    border: "1px solid var(--accent-red)",
    background: "transparent",
    color: "var(--accent-red)",
    fontWeight: 600,
    fontSize: 17,
    cursor: "pointer",
  },
  lockedNote: { marginTop: 15, fontSize: 15, color: "var(--muted)" },
  modalActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 17,
  },
  confirmBtnCompact: {
    marginLeft: "auto",
    padding: "11px 14px",
    borderRadius: 9,
    border: "none",
    background: "var(--ink)",
    color: "var(--paper)",
    fontWeight: 600,
    fontSize: 17,
    cursor: "pointer",
  },
  deleteEquipmentBtn: {
    padding: "10px 12px",
    borderRadius: 9,
    border: "1px solid var(--accent-red)",
    background: "transparent",
    color: "var(--accent-red)",
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontWeight: 600,
    fontSize: 17,
    cursor: "pointer",
  },
  deleteNote: { fontSize: 13, color: "var(--muted)", marginTop: 3 },
};
