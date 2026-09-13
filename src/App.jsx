import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import Calendar from './components/Calendar';
import DiaryBook from './components/DiaryBook';
import AdminLogin from './AdminLogin.jsx';
import AdminDashboard from './AdminDashboard.jsx';

export default function App() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [bookedDateKeys, setBookedDateKeys] = useState(new Set());
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

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

  function handleAdminLoginSuccess() {
    setIsAdmin(true);
    setShowAdminLogin(false);
    setShowAdminDashboard(true);
  }

  function handleAdminButtonClick() {
    if (isAdmin) {
      setShowAdminDashboard(true);
    } else {
      setShowAdminLogin(true);
    }
  }

  function handleLogout() {
    setIsAdmin(false);
    setShowAdminDashboard(false);
  }

  return (
    <>
      <div className="app-header">
        <span className="crown">♛</span>
        <h1>R&amp;R Atelier</h1>
        <p>Your Beauty, Our Craft.</p>
        <button className="admin-login-btn" onClick={handleAdminButtonClick}>
          {isAdmin ? 'Admin Dashboard' : 'Admin Login'}
        </button>
        {isAdmin && (
          <button className="admin-logout-btn" onClick={handleLogout}>Log Out</button>
        )}
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

      {showAdminLogin && (
        <AdminLogin onSuccess={handleAdminLoginSuccess} onClose={() => setShowAdminLogin(false)} />
      )}

      {showAdminDashboard && isAdmin && (
        <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
      )}
    </>
  );
}