import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { buildClientDirectory, findClientByPhone, normalizePhone } from '../utils/clients';

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplayDate(dateKey) {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const PAYMENT_TYPES = ['Cash', 'Card', 'EFT', 'Not paid yet'];
const STATUS_TYPES = ['Upcoming', 'Completed', 'No-show'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const AMPM = ['AM', 'PM'];

function defaultSlot(hour = '09', minute = '00', ampm = 'AM') {
  return {
    hour,
    minute,
    ampm,
    client: '',
    phone: '',
    service: '',
    amount: '',
    payment: 'Not paid yet',
    status: 'Upcoming',
    notes: '',
  };
}

// Converts a slot's hour/minute/ampm into minutes-since-midnight, for sorting & conflict checks.
function slotMinutes(slot) {
  let h = parseInt(slot.hour, 10) % 12;
  if (slot.ampm === 'PM') h += 12;
  return h * 60 + parseInt(slot.minute, 10);
}

function slotTimeLabel(slot) {
  return `${slot.hour}:${slot.minute} ${slot.ampm}`;
}

let saveTimeout = null;
let audioCtx = null;

function playPageFlipSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtx;
    const duration = 0.35;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(2200, ctx.currentTime);
    bandpass.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + duration);
    bandpass.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    noise.stop(ctx.currentTime + duration);
  } catch (err) {
    // Audio not available — fail silently, don't break the flip
  }
}

export default function DiaryBook({ dateKey, onClose, onDateChange }) {
  const [slots, setSlots] = useState([]);
  const [dayNote, setDayNote] = useState('');
  const [status, setStatus] = useState('');
  const [flipDirection, setFlipDirection] = useState(null);
  const [displayedKey, setDisplayedKey] = useState(dateKey);
  const flipTimeout = useRef(null);

  // Pending deletion: { slot, originalIndex, remainingSlots } — held for a few seconds so it can be undone.
  const [pendingDelete, setPendingDelete] = useState(null);
  const pendingDeleteTimeout = useRef(null);

  // All bookings across every day, used to build the client directory for the
  // "returning client" badge and the name/phone autocomplete.
  const [allBookingDocs, setAllBookingDocs] = useState([]);

  useEffect(() => {
    const ref = doc(db, 'bookings', displayedKey);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSlots(
          (data.slots || []).map((slot) => ({
            ...defaultSlot(),
            ...slot,
          }))
        );
        setDayNote(data.dayNote || '');
      } else {
        // No document for this day yet — start empty. Nothing is written until an appointment is added.
        setSlots([]);
        setDayNote('');
      }
    });
    return () => unsubscribe();
  }, [displayedKey]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const docs = [];
      snapshot.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));
      setAllBookingDocs(docs);
    });
    return () => unsub();
  }, []);

  // Clear any pending (unconfirmed) deletion when the day changes, so it doesn't leak across days.
  useEffect(() => {
    clearTimeout(pendingDeleteTimeout.current);
    setPendingDelete(null);
  }, [displayedKey]);

  // Exclude the currently-displayed day so a client being booked "today" doesn't count as their own prior visit.
  const clientDirectory = useMemo(
    () => buildClientDirectory(allBookingDocs, displayedKey),
    [allBookingDocs, displayedKey]
  );

  const clientNameOptions = useMemo(() => {
    const names = new Set();
    clientDirectory.forEach((entry) => {
      if (entry.name) names.add(entry.name);
    });
    return Array.from(names).sort();
  }, [clientDirectory]);

  const sortedSlots = [...slots].sort((a, b) => slotMinutes(a) - slotMinutes(b));

  // Find times that have more than one booking at the exact same slot.
  const conflictMinutes = new Set();
  const seenMinutes = new Map();
  sortedSlots.forEach((slot) => {
    const m = slotMinutes(slot);
    if (seenMinutes.has(m)) {
      conflictMinutes.add(m);
    } else {
      seenMinutes.set(m, true);
    }
  });

  function scheduleSave(nextSlots, nextDayNote) {
    setStatus('Saving...');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'bookings', displayedKey), {
          slots: nextSlots,
          dayNote: nextDayNote,
        });
        setStatus('Saved');
        setTimeout(() => setStatus(''), 1500);
      } catch (err) {
        setStatus('Could not save — check connection');
      }
    }, 500);
  }

  function updateSlot(originalIndex, field, value) {
    const next = slots.map((slot, i) => i === originalIndex ? { ...slot, [field]: value } : slot);
    setSlots(next);
    scheduleSave(next, dayNote);
  }

  // When a client name is typed/selected and matches exactly one known client, auto-fill their
  // phone number if the phone field is still empty — saves re-typing for repeat clients.
  function handleClientNameBlur(originalIndex, value) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return;

    const matches = [];
    clientDirectory.forEach((entry) => {
      if (entry.name.trim().toLowerCase() === trimmed) matches.push(entry);
    });

    const currentSlot = slots[originalIndex];
    if (matches.length === 1 && !currentSlot.phone) {
      updateSlot(originalIndex, 'phone', matches[0].phone);
    }
  }

  function updateDayNote(value) {
    setDayNote(value);
    scheduleSave(slots, value);
  }

  function addSlot() {
    const next = [...slots, defaultSlot()];
    setSlots(next);
    scheduleSave(next, dayNote);
  }

  // Step 1: remove from view immediately and hold it for a few seconds so it can be undone.
  // The actual save only happens once the undo window expires.
  function requestDeleteSlot(originalIndex) {
    const slot = slots[originalIndex];
    const remainingSlots = slots.filter((_, i) => i !== originalIndex);

    clearTimeout(pendingDeleteTimeout.current);
    setSlots(remainingSlots);
    setPendingDelete({ slot, originalIndex, remainingSlots });

    pendingDeleteTimeout.current = setTimeout(() => {
      scheduleSave(remainingSlots, dayNote);
      setPendingDelete(null);
    }, 5000);
  }

  function undoDeleteSlot() {
    if (!pendingDelete) return;
    clearTimeout(pendingDeleteTimeout.current);
    const restored = [...pendingDelete.remainingSlots];
    restored.splice(pendingDelete.originalIndex, 0, pendingDelete.slot);
    setSlots(restored);
    setPendingDelete(null);
  }

  function turnPage(direction) {
    if (flipDirection) return;
    playPageFlipSound();
    setFlipDirection(direction);
    clearTimeout(flipTimeout.current);
    flipTimeout.current = setTimeout(() => {
      const current = parseDateKey(displayedKey);
      current.setDate(current.getDate() + (direction === 'next' ? 1 : -1));
      const newKey = toDateKey(current);
      setDisplayedKey(newKey);
      if (onDateChange) onDateChange(newKey);
      setFlipDirection(null);
    }, 420);
  }

  return (
    <div className="diary-overlay" onClick={onClose}>
      <div className="diary-book" onClick={(e) => e.stopPropagation()}>
        <button className="page-arrow page-arrow-left" onClick={() => turnPage('prev')} aria-label="Previous day">‹</button>

        <div className={`diary-page-container${flipDirection ? ` flipping-${flipDirection}` : ''}`}>
          <div className="diary-page-flip">
            <div className="diary-page">
              <button className="diary-close" onClick={onClose} aria-label="Close">✕</button>
              <h2 className="diary-date">{formatDisplayDate(displayedKey)}</h2>
              <p className="diary-sub">Your Beauty, Our Craft.</p>

              <textarea
                className="day-note"
                placeholder="Notes for the day (e.g. running late, closing early)..."
                value={dayNote}
                onChange={(e) => updateDayNote(e.target.value)}
                rows={2}
              />

              {sortedSlots.length === 0 && (
                <p className="no-appointments">No appointments yet for this day.</p>
              )}

              <datalist id="client-name-options">
                {clientNameOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              {sortedSlots.map((slot) => {
                // Find this slot's real index in the unsorted `slots` array, so edits/deletes target the right one.
                const originalIndex = slots.indexOf(slot);
                const hasConflict = conflictMinutes.has(slotMinutes(slot));
                const returningClient = normalizePhone(slot.phone)
                  ? findClientByPhone(clientDirectory, slot.phone)
                  : null;

                return (
                  <div className={`slot-card${hasConflict ? ' slot-card-conflict' : ''}`} key={originalIndex}>
                    {hasConflict && (
                      <div className="slot-conflict-banner">
                        ⚠ Another appointment is also booked at {slotTimeLabel(slot)}
                      </div>
                    )}

                    {returningClient && returningClient.visitCount > 0 && (
                      <div className="slot-returning-badge">
                        ★ Returning client — {returningClient.visitCount} previous visit{returningClient.visitCount === 1 ? '' : 's'}, last on {returningClient.lastVisit}
                      </div>
                    )}

                    <div className="slot-card-header">
                      <div className="time-picker">
                        <select
                          className="time-select"
                          value={slot.hour}
                          onChange={(e) => updateSlot(originalIndex, 'hour', e.target.value)}
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="time-colon">:</span>
                        <select
                          className="time-select"
                          value={slot.minute}
                          onChange={(e) => updateSlot(originalIndex, 'minute', e.target.value)}
                        >
                          {MINUTES.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          className="time-select time-ampm"
                          value={slot.ampm}
                          onChange={(e) => updateSlot(originalIndex, 'ampm', e.target.value)}
                        >
                          {AMPM.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>

                      <input
                        className="slot-input slot-input-client"
                        type="text"
                        placeholder="Client name"
                        list="client-name-options"
                        value={slot.client}
                        onChange={(e) => updateSlot(originalIndex, 'client', e.target.value)}
                        onBlur={(e) => handleClientNameBlur(originalIndex, e.target.value)}
                      />

                      <button
                        className="slot-delete"
                        onClick={() => requestDeleteSlot(originalIndex)}
                        aria-label="Remove appointment"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="slot-card-grid">
                      <input
                        className="slot-input"
                        type="tel"
                        placeholder="Phone"
                        value={slot.phone}
                        onChange={(e) => updateSlot(originalIndex, 'phone', e.target.value)}
                      />
                      <input
                        className="slot-input"
                        type="text"
                        placeholder="Service"
                        value={slot.service}
                        onChange={(e) => updateSlot(originalIndex, 'service', e.target.value)}
                      />
                      <input
                        className="slot-input"
                        type="number"
                        placeholder="R Amount"
                        value={slot.amount}
                        onChange={(e) => updateSlot(originalIndex, 'amount', e.target.value)}
                      />
                      <select
                        className="slot-payment"
                        value={slot.payment || 'Not paid yet'}
                        onChange={(e) => updateSlot(originalIndex, 'payment', e.target.value)}
                      >
                        {PAYMENT_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      <select
                        className={`slot-status slot-status-${(slot.status || 'Upcoming').toLowerCase().replace(' ', '-')}`}
                        value={slot.status || 'Upcoming'}
                        onChange={(e) => updateSlot(originalIndex, 'status', e.target.value)}
                      >
                        {STATUS_TYPES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      className="slot-notes"
                      placeholder="Notes (allergies, preferences, etc.)"
                      value={slot.notes || ''}
                      onChange={(e) => updateSlot(originalIndex, 'notes', e.target.value)}
                      rows={1}
                    />
                  </div>
                );
              })}

              <button className="add-slot-btn" onClick={addSlot}>+ Add appointment</button>
              <div className="save-status">{status}</div>
            </div>
            <div className="diary-page-back" />
          </div>
          <div className="page-shadow-overlay" />
        </div>

        <button className="page-arrow page-arrow-right" onClick={() => turnPage('next')} aria-label="Next day">›</button>

        {pendingDelete && (
          <div className="undo-toast">
            <span>Appointment removed</span>
            <button className="undo-toast-btn" onClick={undoDeleteSlot}>Undo</button>
          </div>
        )}
      </div>
    </div>
  );
}