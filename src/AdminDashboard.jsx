import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { buildClientDirectory } from './utils/clients';

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

// A stock item's `quantity` is the total owned. `assignments` (if present) is a list of
// { staff, quantity } records for stock currently issued to staff. On-hand = total minus
// everything assigned out — that's what's actually available at the salon right now.
function onHandQuantity(item) {
  const assignedTotal = (item.assignments || []).reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
  return (Number(item.quantity) || 0) - assignedTotal;
}

function assignedTotalQuantity(item) {
  return (item.assignments || []).reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
}

function downloadCSV(rows, filename) {
  const csvContent = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminDashboard({ onClose, onLogout }) {
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' | 'stock' | 'clients'
  const [bookingDocs, setBookingDocs] = useState([]);
  const [stock, setStock] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [newStockName, setNewStockName] = useState('');
  const [newStockQty, setNewStockQty] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [clientSearch, setClientSearch] = useState('');
  const [expandedStockId, setExpandedStockId] = useState(null);
  const [assignDrafts, setAssignDrafts] = useState({}); // { [stockId]: { staff, qty } }
  const [newExpenseDate, setNewExpenseDate] = useState(todayKey());
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseNote, setNewExpenseNote] = useState('');

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
    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      setExpenses(items);
    });
    return () => {
      unsubBookings();
      unsubStock();
      unsubExpenses();
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

  // Expenses this month, and profit = revenue minus expenses.
  const monthlyExpenseTotal = expenses
    .filter((e) => (e.date || '').startsWith(selectedMonth))
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const monthlyProfit = monthlyRevenue - monthlyExpenseTotal;

  const sortedExpenses = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  async function addExpense() {
    const amount = parseFloat(newExpenseAmount);
    if (!newExpenseDate || !amount || amount <= 0) return;
    await addDoc(collection(db, 'expenses'), {
      date: newExpenseDate,
      amount,
      note: newExpenseNote.trim(),
    });
    setNewExpenseAmount('');
    setNewExpenseNote('');
  }

  async function deleteExpense(expenseId) {
    await deleteDoc(doc(db, 'expenses', expenseId));
  }

  const clientDirectory = useMemo(() => buildClientDirectory(bookingDocs), [bookingDocs]);

  const clientList = useMemo(() => {
    const list = Array.from(clientDirectory.values());
    list.sort((a, b) => b.visitCount - a.visitCount);
    const query = clientSearch.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(query) || c.phone.toLowerCase().includes(query)
    );
  }, [clientDirectory, clientSearch]);

  function exportMonthCSV() {
    const rows = [
      ['Date', 'Time', 'Client', 'Phone', 'Service', 'Amount', 'Payment', 'Status', 'Notes'],
    ];

    bookingDocs
      .filter((bDoc) => bDoc.id.startsWith(selectedMonth))
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((bDoc) => {
        (bDoc.slots || []).forEach((slot) => {
          if (!slot.client && !slot.service) return;
          rows.push([
            bDoc.id,
            `${slot.hour}:${slot.minute} ${slot.ampm}`,
            slot.client || '',
            slot.phone || '',
            slot.service || '',
            slot.amount || '',
            slot.payment || '',
            slot.status || '',
            (slot.notes || '').replace(/\n/g, ' '),
          ]);
        });
      });

    downloadCSV(rows, `bookings-${selectedMonth}.csv`);
  }

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
    await setDoc(doc(db, 'stock', item.id), {
      name: item.name,
      quantity: Number(newQty) || 0,
      assignments: item.assignments || [],
    });
  }

  async function deleteStockItem(item) {
    await deleteDoc(doc(db, 'stock', item.id));
  }

  function getAssignDraft(itemId) {
    return assignDrafts[itemId] || { staff: '', qty: '' };
  }

  function updateAssignDraft(itemId, field, value) {
    setAssignDrafts((prev) => ({
      ...prev,
      [itemId]: { ...getAssignDraft(itemId), [field]: value },
    }));
  }

  // Issues stock to a staff member: adds to that staff member's assignment (or creates one).
  // Doesn't touch the total `quantity` — it just moves some of it from "on hand" to "assigned".
  async function assignStockToStaff(item) {
    const draft = getAssignDraft(item.id);
    const staffName = draft.staff.trim();
    const qty = Number(draft.qty) || 0;
    if (!staffName || qty <= 0) return;

    const available = onHandQuantity(item);
    if (qty > available) {
      const confirmed = window.confirm(
        `Only ${available} of "${item.name}" is currently on hand. Assign ${qty} anyway?`
      );
      if (!confirmed) return;
    }

    const assignments = [...(item.assignments || [])];
    const existingIndex = assignments.findIndex(
      (a) => a.staff.trim().toLowerCase() === staffName.toLowerCase()
    );

    if (existingIndex >= 0) {
      assignments[existingIndex] = {
        ...assignments[existingIndex],
        quantity: (Number(assignments[existingIndex].quantity) || 0) + qty,
      };
    } else {
      assignments.push({ staff: staffName, quantity: qty });
    }

    await setDoc(doc(db, 'stock', item.id), {
      name: item.name,
      quantity: item.quantity,
      assignments,
    });

    setAssignDrafts((prev) => ({ ...prev, [item.id]: { staff: '', qty: '' } }));
  }

  // Reduces (or removes) one staff member's assignment — used both for "returned to salon"
  // and for correcting a number after checking in with staff.
  async function updateAssignmentQty(item, assignmentIndex, newQty) {
    const assignments = [...(item.assignments || [])];
    const qty = Math.max(0, Number(newQty) || 0);

    if (qty === 0) {
      assignments.splice(assignmentIndex, 1);
    } else {
      assignments[assignmentIndex] = { ...assignments[assignmentIndex], quantity: qty };
    }

    await setDoc(doc(db, 'stock', item.id), {
      name: item.name,
      quantity: item.quantity,
      assignments,
    });
  }

  async function removeAssignment(item, assignmentIndex) {
    const assignments = (item.assignments || []).filter((_, i) => i !== assignmentIndex);
    await setDoc(doc(db, 'stock', item.id), {
      name: item.name,
      quantity: item.quantity,
      assignments,
    });
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-left">
          <span className="crown">♛</span>
          <h1 className="admin-page-title">Admin Dashboard</h1>
        </div>
        <div className="admin-page-header-right">
          <button className="admin-back-btn" onClick={onClose}>← Back to Calendar</button>
          <button className="admin-logout-btn" onClick={onLogout}>Log Out</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab${activeTab === 'reports' ? ' admin-tab-active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          Reports
        </button>
        <button
          className={`admin-tab${activeTab === 'stock' ? ' admin-tab-active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          Stock
        </button>
        <button
          className={`admin-tab${activeTab === 'clients' ? ' admin-tab-active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          Clients
        </button>
      </div>

      <div className="admin-page-content">
        {activeTab === 'reports' && (
          <>
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
              <div className="admin-stat-row admin-stat-row-spaced">
                <div className="admin-stat-card admin-stat-card-warn">
                  <span className="admin-stat-label">Expenses this month</span>
                  <span className="admin-stat-value">R{monthlyExpenseTotal.toFixed(2)}</span>
                </div>
                <div className={`admin-stat-card${monthlyProfit < 0 ? ' admin-stat-card-warn' : ' admin-stat-card-profit'}`}>
                  <span className="admin-stat-label">Profit this month</span>
                  <span className="admin-stat-value">R{monthlyProfit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="admin-section">
              <h3>Expenses</h3>
              <div className="stock-add-row">
                <input
                  type="date"
                  className="admin-input"
                  value={newExpenseDate}
                  onChange={(e) => setNewExpenseDate(e.target.value)}
                />
                <input
                  className="admin-input stock-qty-input"
                  type="number"
                  placeholder="R Amount"
                  value={newExpenseAmount}
                  onChange={(e) => setNewExpenseAmount(e.target.value)}
                />
                <input
                  className="admin-input"
                  type="text"
                  placeholder="Note (e.g. stock restock)"
                  value={newExpenseNote}
                  onChange={(e) => setNewExpenseNote(e.target.value)}
                />
                <button className="add-slot-btn stock-add-btn" onClick={addExpense}>+ Add</button>
              </div>

              <div className="expense-list">
                {sortedExpenses.length === 0 && <p className="stock-empty">No expenses logged yet.</p>}
                {sortedExpenses.map((expense) => (
                  <div className="expense-row" key={expense.id}>
                    <span className="expense-date">{expense.date}</span>
                    <span className="expense-note">{expense.note || 'No note'}</span>
                    <span className="expense-amount">R{(parseFloat(expense.amount) || 0).toFixed(2)}</span>
                    <button className="slot-delete" onClick={() => deleteExpense(expense.id)} aria-label="Delete expense">✕</button>
                  </div>
                ))}
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
              <button className="export-csv-btn" onClick={exportMonthCSV}>
                ⬇ Export {selectedMonth} as CSV
              </button>
            </div>
          </>
        )}

        {activeTab === 'stock' && (
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
              {stock.map((item) => {
                const onHand = onHandQuantity(item);
                const assignedTotal = assignedTotalQuantity(item);
                const isExpanded = expandedStockId === item.id;
                const draft = getAssignDraft(item.id);

                return (
                  <div
                    className={`stock-row-wrap${onHand <= lowStockThreshold ? ' stock-row-low' : ''}`}
                    key={item.id}
                  >
                    <div className="stock-row">
                      <span className="stock-name">{item.name}</span>

                      <div className="stock-qty-group">
                        <span className="stock-qty-label">Total</span>
                        <input
                          className="admin-input stock-qty-input"
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateStockQty(item, e.target.value)}
                        />
                      </div>

                      <div className="stock-onhand">
                        <span className="stock-onhand-value">{onHand}</span>
                        <span className="stock-onhand-label">on hand</span>
                      </div>

                      {onHand <= lowStockThreshold && <span className="stock-low-badge">Low</span>}

                      <button
                        className="stock-staff-toggle"
                        onClick={() => setExpandedStockId(isExpanded ? null : item.id)}
                      >
                        Staff {assignedTotal > 0 ? `(${assignedTotal})` : ''} {isExpanded ? '▲' : '▼'}
                      </button>

                      <button className="slot-delete" onClick={() => deleteStockItem(item)} aria-label="Remove item">✕</button>
                    </div>

                    {isExpanded && (
                      <div className="stock-staff-panel">
                        {(item.assignments || []).length === 0 && (
                          <p className="stock-staff-empty">Nothing currently issued to staff.</p>
                        )}
                        {(item.assignments || []).map((a, i) => (
                          <div className="stock-staff-row" key={i}>
                            <span className="stock-staff-name">{a.staff}</span>
                            <input
                              className="admin-input stock-qty-input"
                              type="number"
                              value={a.quantity}
                              onChange={(e) => updateAssignmentQty(item, i, e.target.value)}
                            />
                            <button
                              className="stock-staff-return-btn"
                              onClick={() => removeAssignment(item, i)}
                            >
                              Returned all
                            </button>
                          </div>
                        ))}

                        <div className="stock-staff-add-row">
                          <input
                            className="admin-input"
                            type="text"
                            placeholder="Staff name"
                            value={draft.staff}
                            onChange={(e) => updateAssignDraft(item.id, 'staff', e.target.value)}
                          />
                          <input
                            className="admin-input stock-qty-input"
                            type="number"
                            placeholder="Qty"
                            value={draft.qty}
                            onChange={(e) => updateAssignDraft(item.id, 'qty', e.target.value)}
                          />
                          <button className="add-slot-btn stock-add-btn" onClick={() => assignStockToStaff(item)}>
                            Give to staff
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h3>Clients</h3>
              <input
                className="admin-input"
                type="text"
                placeholder="Search by name or phone..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>

            <div className="client-list">
              {clientList.length === 0 && <p className="stock-empty">No clients found.</p>}
              {clientList.map((client, i) => (
                <div className="client-row" key={i}>
                  <div className="client-row-main">
                    <span className="client-row-name">{client.name || 'Unnamed client'}</span>
                    <span className="client-row-phone">{client.phone}</span>
                  </div>
                  <div className="client-row-stats">
                    <span>{client.visitCount} visit{client.visitCount === 1 ? '' : 's'}</span>
                    <span>R{client.totalSpend.toFixed(2)} total</span>
                    <span>Last: {client.lastVisit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}