import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from './firebase';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKeyFromDateKey(dateKey) {
  return dateKey.slice(0, 7); // "YYYY-MM"
}

export default function AdminDashboard({ onClose }) {
  const [bookingDocs, setBookingDocs] = useState([]);
  const [stock, setStock] = useState([]);
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [newStockName, setNewStockName] = useState('');
  const [newStockQty, setNewStockQty] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const docs = [];
      snapshot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setBookingDocs(docs);
    });
    const unsubStock = onSnapshot(collection(db, 'stock'), (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      setStock(items);
    });
    return () => {
      unsubBookings();
      unsubStock();
    };
  }, []);

  const selectedMonth = monthKeyFromDateKey(selectedDay);

  let dailyRevenue = 0;
  let monthlyRevenue = 0;
  let totalClientsThisMonth = 0;
  let noShowThisMonth = 0;
  let completedThisMonth = 0;

  bookingDocs.forEach((bDoc) => {
    const slots = bDoc.slots || [];
    const isSelectedDay = bDoc.id === selectedDay;
    const isSelectedMonth = bDoc.id.startsWith(selectedMonth);

    slots.forEach((slot) => {
      const amt = parseFloat(slot.amount) || 0;
      const paid = slot.payment && slot.payment !== 'Not paid yet';

      if (isSelectedDay && paid) {
        dailyRevenue += amt;
      }
      if (isSelectedMonth) {
        if (paid) monthlyRevenue += amt;
        if (slot.client) totalClientsThisMonth += 1;
        if (slot.status === 'No-show') noShowThisMonth += 1;
        if (slot.status === 'Completed') completedThisMonth += 1;
      }
    });
  });

  async function addStockItem() {
    if (!newStockName.trim()) return;
    await addDoc(collection(db, 'stock'), {
      name: newStockName.trim(),
      quantity: Number(newStockQty) || 0,
    });
    setNewStockName('');
    setNewStockQty('');
  }

  async function updateStockQty(item, newQty) {
    await setDoc(doc(db, 'stock', item.id), { name: item.name, quantity: Number(newQty) || 0 });
  }

  async function deleteStockItem(item) {
    await deleteDoc(doc(db, 'stock', item.id));
  }

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-dashboard" onClick={(e) => e.stopPropagation()}>
        <button className="diary-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="admin-dashboard-title">Admin Dashboard</h2>

        <div className="admin-section">
          <div className="admin-section-header">
            <h3>Revenue</h3>
            <input
              type="date"
              className="admin-date-input"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            />
          </div>
          <div className="admin-stat-row">
            <div className="admin-stat-card">
              <span className="admin-stat-label">Revenue on {selectedDay}</span>
              <span className="admin-stat-value">R{dailyRevenue.toFixed(2)}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Revenue this month ({selectedMonth})</span>
              <span className="admin-stat-value">R{monthlyRevenue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="admin-section">
          <h3>Booking Stats — {selectedMonth}</h3>
          <div className="admin-stat-row">
            <div className="admin-stat-card">
              <span className="admin-stat-label">Total Clients</span>
              <span className="admin-stat-value">{totalClientsThisMonth}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-label">Completed</span>
              <span className="admin-stat-value">{completedThisMonth}</span>
            </div>
            <div className="admin-stat-card admin-stat-card-warn">
              <span className="admin-stat-label">No-shows</span>
              <span className="admin-stat-value">{noShowThisMonth}</span>
            </div>
          </div>
        </div>

        <div className="admin-section">
          <h3>Stock</h3>
          <div className="stock-add-row">
            <input
              className="admin-input"
              type="text"
              placeholder="Product name"
              value={newStockName}
              onChange={(e) => setNewStockName(e.target.value)}
            />
            <input
              className="admin-input stock-qty-input"
              type="number"
              placeholder="Qty"
              value={newStockQty}
              onChange={(e) => setNewStockQty(e.target.value)}
            />
            <button className="add-slot-btn stock-add-btn" onClick={addStockItem}>+ Add</button>
          </div>

          <div className="low-stock-row">
            <label>Low-stock alert below:</label>
            <input
              type="number"
              className="admin-input stock-qty-input"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(Number(e.target.value) || 0)}
            />
          </div>

          <div className="stock-list">
            {stock.length === 0 && <p className="stock-empty">No stock items yet.</p>}
            {stock.map((item) => (
              <div className={`stock-row${item.quantity <= lowStockThreshold ? ' stock-row-low' : ''}`} key={item.id}>
                <span className="stock-name">{item.name}</span>
                <input
                  className="admin-input stock-qty-input"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateStockQty(item, e.target.value)}
                />
                {item.quantity <= lowStockThreshold && <span className="stock-low-badge">Low</span>}
                <button className="slot-delete" onClick={() => deleteStockItem(item)} aria-label="Remove item">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}