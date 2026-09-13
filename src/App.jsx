import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import Calendar from './components/Calendar';
import DiaryBook from './components/DiaryBook';

export default function App() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [bookedDateKeys, setBookedDateKeys] = useState(new Set());

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const keysWithSlots = new Set();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.slots && data.slots.some((s) => s.client || s.service)) {
          keysWithSlots.add(docSnap.id);
        }
      });
      setBookedDateKeys(keysWithSlots);
    });
    return () => unsubscribe();
  }, []);

  function handleSelectDate(dateKey) {
    setSelectedDateKey(dateKey);
  }

  function handleCloseDiary() {
    setSelectedDateKey(null);
  }

  return (
    <>
      <div className="app-header">
        <span className="crown">♛</span>
        <h1>R&amp;R Atelier</h1>
        <p>Your Beauty, Our Craft.</p>
      </div>

      <Calendar
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
        onSelectDate={handleSelectDate}
        bookedDateKeys={bookedDateKeys}
      />

      {selectedDateKey && (
        <DiaryBook dateKey={selectedDateKey} onClose={handleCloseDiary} />
      )}
    </>
  );
}