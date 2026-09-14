import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

function slotMinutes(slot) {
  let h = parseInt(slot.hour, 10) % 12;
  if (slot.ampm === 'PM') h += 12;
  return h * 60 + parseInt(slot.minute, 10);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function WeekView({ weekStart, onWeekChange, onSelectDate }) {
  const [bookingDocs, setBookingDocs] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const docs = [];
      snapshot.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));
      setBookingDocs(docs);
    });
    return () => unsub();
  }, []);

  const start = startOfWeek(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayKey = toDateKey(new Date());

  function goPrevWeek() {
    const d = new Date(start);
    d.setDate(d.getDate() - 7);
    onWeekChange(d);
  }

  function goNextWeek() {
    const d = new Date(start);
    d.setDate(d.getDate() + 7);
    onWeekChange(d);
  }

  return (
    <div className="week-view-wrap">
      <div className="calendar-nav">
        <button onClick={goPrevWeek} aria-label="Previous week">‹</button>
        <span>
          {days[0].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
          {' – '}
          {days[6].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
        </span>
        <button onClick={goNextWeek} aria-label="Next week">›</button>
      </div>

      <div className="week-days">
        {days.map((d) => {
          const dateKey = toDateKey(d);
          const bDoc = bookingDocs.find((b) => b.id === dateKey);
          const slots = (bDoc?.slots || [])
            .filter((s) => s.client || s.service)
            .sort((a, b) => slotMinutes(a) - slotMinutes(b));
          const isToday = dateKey === todayKey;

          return (
            <div
              className={`week-day-card${isToday ? ' week-day-today' : ''}`}
              key={dateKey}
              onClick={() => onSelectDate(dateKey)}
            >
              <div className="week-day-header">
                <span className="week-day-name">{DAY_NAMES[d.getDay()]}</span>
                <span className="week-day-date">
                  {d.getDate()} {d.toLocaleDateString('en-ZA', { month: 'short' })}
                </span>
              </div>

              {slots.length === 0 ? (
                <p className="week-day-empty">No appointments</p>
              ) : (
                <ul className="week-day-list">
                  {slots.map((s, i) => (
                    <li key={i}>
                      <span className="week-day-time">{s.hour}:{s.minute} {s.ampm}</span>
                      <span className="week-day-client">{s.client || 'Untitled'}</span>
                      {s.service && <span className="week-day-service"> — {s.service}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}