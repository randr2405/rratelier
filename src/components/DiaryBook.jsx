import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

function formatDisplayDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

let saveTimeout = null;

export default function DiaryBook({ dateKey, onClose }) {
  const [slots, setSlots] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const ref = doc(db, 'bookings', dateKey);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSlots(snap.data().slots || []);
      } else {
        setSlots([
          { time: '09:00', client: '', service: '' },
          { time: '10:00', client: '', service: '' },
          { time: '11:00', client: '', service: '' },
        ]);
      }
    });
    return () => unsubscribe();
  }, [dateKey]);

  function scheduleSave(nextSlots) {
    setStatus('Saving...');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'bookings', dateKey), { slots: nextSlots });
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
    const next = [...slots, { time: '', client: '', service: '' }];
    setSlots(next);
    scheduleSave(next);
  }

  function deleteSlot(index) {
    const next = slots.filter((_, i) => i !== index);
    setSlots(next);
    scheduleSave(next);
  }

  return (
    <div className="diary-overlay" onClick={onClose}>
      <div className="diary-book" onClick={(e) => e.stopPropagation()}>
        <div className="diary-page">
          <button className="diary-close" onClick={onClose} aria-label="Close">✕</button>
          <h2 className="diary-date">{formatDisplayDate(dateKey)}</h2>
          <p className="diary-sub">Your Beauty, Our Craft.</p>

          {slots.map((slot, index) => (
            <div className="slot-row" key={index}>
              <input
                className="slot-input slot-time"
                type="text"
                placeholder="Time"
                value={slot.time}
                onChange={(e) => updateSlot(index, 'time', e.target.value)}
                style={{ maxWidth: '70px' }}
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
              <button className="slot-delete" onClick={() => deleteSlot(index)} aria-label="Remove slot">✕</button>
            </div>
          ))}

          <button className="add-slot-btn" onClick={addSlot}>+ Add time slot</button>
          <div className="save-status">{status}</div>
        </div>
      </div>
    </div>
  );
}