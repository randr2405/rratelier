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

let saveTimeout = null;

export default function DiaryBook({ dateKey, onClose, onDateChange }) {
  const [slots, setSlots] = useState([]);
  const [status, setStatus] = useState('');
  const [flipDirection, setFlipDirection] = useState(null);
  const [displayedKey, setDisplayedKey] = useState(dateKey);
  const flipTimeout = useRef(null);

  useEffect(() => {
    const ref = doc(db, 'bookings', displayedKey);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSlots(snap.data().slots || []);
      } else {
        setSlots([
          { time: '09:00', client: '', service: '', payment: 'Not paid yet' },
          { time: '10:00', client: '', service: '', payment: 'Not paid yet' },
          { time: '11:00', client: '', service: '', payment: 'Not paid yet' },
        ]);
      }
    });
    return () => unsubscribe();
  }, [displayedKey]);

  function scheduleSave(nextSlots) {
    setStatus('Saving...');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'bookings', displayedKey), { slots: nextSlots });
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
    scheduleSave(next);
  }

  function addSlot() {
    const next = [...slots, { time: '', client: '', service: '', payment: 'Not paid yet' }];
    setSlots(next);
    scheduleSave(next);
  }

  function deleteSlot(index) {
    const next = slots.filter((_, i) => i !== index);
    setSlots(next);
    scheduleSave(next);
  }

  function turnPage(direction) {
    if (flipDirection) return;
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
          <div className="diary-page">
            <button className="diary-close" onClick={onClose} aria-label="Close">✕</button>
            <h2 className="diary-date">{formatDisplayDate(displayedKey)}</h2>
            <p className="diary-sub">Your Beauty, Our Craft.</p>

            {slots.map((slot, index) => (
              <div className="slot-row" key={index}>
                <input
                  className="slot-input slot-time"
                  type="text"
                  placeholder="Time"
                  value={slot.time}
                  onChange={(e) => updateSlot(index, 'time', e.target.value)}
                />
                <input
                  className="slot-input"
                  type="text"
                  placeholder="Client name"
                  value={slot.client}
                  onChange={(e) => updateSlot(index, 'client', e.target.value)}
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
                <button className="slot-delete" onClick={() => deleteSlot(index)} aria-label="Remove slot">✕</button>
              </div>
            ))}

            <button className="add-slot-btn" onClick={addSlot}>+ Add time slot</button>
            <div className="save-status">{status}</div>
          </div>
        </div>

        <button className="page-arrow page-arrow-right" onClick={() => turnPage('next')} aria-label="Next day">›</button>
      </div>
    </div>
  );
}