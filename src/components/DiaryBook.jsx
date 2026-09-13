import React, { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
    payment: 'Not paid yet',
    status: 'Upcoming',
    notes: '',
  };
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
        setSlots([
          defaultSlot('09', '00', 'AM'),
          defaultSlot('10', '00', 'AM'),
          defaultSlot('11', '00', 'AM'),
        ]);
        setDayNote('');
      }
    });
    return () => unsubscribe();
  }, [displayedKey]);

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

  function updateSlot(index, field, value) {
    const next = slots.map((slot, i) => i === index ? { ...slot, [field]: value } : slot);
    setSlots(next);
    scheduleSave(next, dayNote);
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

  function deleteSlot(index) {
    const next = slots.filter((_, i) => i !== index);
    setSlots(next);
    scheduleSave(next, dayNote);
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

              {slots.map((slot, index) => (
                <div className="slot-row-wrap" key={index}>
                  <div className="slot-row">
                    <div className="time-picker">
                      <select
                        className="time-select"
                        value={slot.hour}
                        onChange={(e) => updateSlot(index, 'hour', e.target.value)}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <span className="time-colon">:</span>
                      <select
                        className="time-select"
                        value={slot.minute}
                        onChange={(e) => updateSlot(index, 'minute', e.target.value)}
                      >
                        {MINUTES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        className="time-select time-ampm"
                        value={slot.ampm}
                        onChange={(e) => updateSlot(index, 'ampm', e.target.value)}
                      >
                        {AMPM.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      className="slot-input"
                      type="text"
                      placeholder="Client name"
                      value={slot.client}
                      onChange={(e) => updateSlot(index, 'client', e.target.value)}
                    />
                    <input
                      className="slot-input slot-phone"
                      type="tel"
                      placeholder="Phone"
                      value={slot.phone}
                      onChange={(e) => updateSlot(index, 'phone', e.target.value)}
                    />
                    <input
                      className="slot-input"
                      type="text"
                      placeholder="Service"
                      value={slot.service}
                      onChange={(e) => updateSlot(index, 'service', e.target.value)}
                    />
                    <select
                      className="slot-payment"
                      value={slot.payment || 'Not paid yet'}
                      onChange={(e) => updateSlot(index, 'payment', e.target.value)}
                    >
                      {PAYMENT_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <select
                      className={`slot-status slot-status-${(slot.status || 'Upcoming').toLowerCase().replace(' ', '-')}`}
                      value={slot.status || 'Upcoming'}
                      onChange={(e) => updateSlot(index, 'status', e.target.value)}
                    >
                      {STATUS_TYPES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button className="slot-delete" onClick={() => deleteSlot(index)} aria-label="Remove slot">✕</button>
                  </div>
                  <textarea
                    className="slot-notes"
                    placeholder="Notes (allergies, preferences, etc.)"
                    value={slot.notes || ''}
                    onChange={(e) => updateSlot(index, 'notes', e.target.value)}
                    rows={1}
                  />
                </div>
              ))}

              <button className="add-slot-btn" onClick={addSlot}>+ Add time slot</button>
              <div className="save-status">{status}</div>
            </div>
            <div className="diary-page-back" />
          </div>
          <div className="page-shadow-overlay" />
        </div>

        <button className="page-arrow page-arrow-right" onClick={() => turnPage('next')} aria-label="Next day">›</button>
      </div>
    </div>
  );
}