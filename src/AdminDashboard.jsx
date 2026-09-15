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

// One-time full stock reset, built entirely from the owner's own manually-typed recount
// (total quantity + how much of that total is currently with Lydia). This replaces every
// previous stock entry rather than trying to merge on top of earlier, less reliable guesses.
const STOCK_RESET = {
  staff: 'Lydia',
  items: [
    { name: 'Cuticle oil pen', total: 4, withStaff: 1 },
    { name: 'Cuticle oil bottle', total: 2, withStaff: 2 },
    { name: 'Foil', total: 2, withStaff: 1 },
    { name: 'Sand bits', total: 100, withStaff: 5 },
    { name: 'Cuticle clipper', total: 1, withStaff: 1 },
    { name: 'Rhinestone gripper', total: 1, withStaff: 1 },
    { name: 'Nail glue', total: 5, withStaff: 2 },
    { name: 'Chrome', total: 3, withStaff: 1 },
    { name: 'Butterfly charms (silver and gold)', total: 2, withStaff: 1 },
    { name: 'Lint wipes', total: 200, withStaff: 200 },
    { name: 'Pearl charms', total: 1, withStaff: 1 },
    { name: 'Bow charms', total: 1, withStaff: 1 },
    { name: 'Flower charms', total: 1, withStaff: 1 },
    { name: 'Butterfly colour charms', total: 1, withStaff: 1 },
    { name: 'Square soft gel tips (500pc pack)', total: 1, withStaff: 0 },
    { name: 'Square thick tips XL', total: 1, withStaff: 1 },
    { name: 'Round thick tips M', total: 1, withStaff: 1 },
    { name: 'UV nail lamp', total: 2, withStaff: 1 },
    { name: 'Nail file drill', total: 1, withStaff: 1 },
    { name: 'Hand cushion', total: 1, withStaff: 1 },
    { name: 'Nail art dotting tool', total: 5, withStaff: 1 },
    { name: 'Container', total: 1, withStaff: 0 },
    { name: 'Refill lint', total: 600, withStaff: 0 },
    { name: 'Sponge paint gel', total: 1, withStaff: 1 },
    { name: 'Rhinestones (gold and silver)', total: 2, withStaff: 1 },
    { name: 'Hand sanitizer 1L', total: 1, withStaff: 1 },
    { name: 'Acetone 1L', total: 1, withStaff: 1 },
    { name: 'Monomer 1L', total: 1, withStaff: 1 },
    { name: 'Acrylic powder', total: 5, withStaff: 5 },
    { name: 'Soak off containers', total: 2, withStaff: 2 },
    { name: 'Tip cutter', total: 1, withStaff: 1 },
    { name: 'Planet nail hand sanitizer spray bottle', total: 1, withStaff: 1 },
    { name: 'Brush cleaner 120ml', total: 1, withStaff: 1 },
    { name: 'Base coat', total: 4, withStaff: 2 },
    { name: 'Top coat', total: 5, withStaff: 2 },
    { name: 'Blooming gel', total: 2, withStaff: 1 },
    { name: 'Foil sticky gel', total: 2, withStaff: 1 },
    { name: 'Nail dehydrator', total: 1, withStaff: 1 },
    { name: 'Nail hardener', total: 1, withStaff: 1 },
    { name: 'Nail primer', total: 1, withStaff: 1 },
    { name: 'White gel', total: 2, withStaff: 1 },
    { name: 'Diamond adhesive', total: 2, withStaff: 1 },
    { name: 'Fiber builder gel', total: 2, withStaff: 1 },
    { name: 'Black gel', total: 1, withStaff: 1 },
    { name: 'Red glitter gel', total: 1, withStaff: 1 },
    { name: 'White glitter gel (thick)', total: 1, withStaff: 1 },
    { name: 'White glitter gel (thin)', total: 1, withStaff: 0 },
    { name: 'Metallic liner gel', total: 1, withStaff: 1 },
    { name: 'Platinum gel 07', total: 1, withStaff: 1 },
    { name: 'Platinum gel 34', total: 1, withStaff: 1 },
    { name: 'Rose gold glitter gel', total: 1, withStaff: 1 },
    { name: 'Temp change gel 67', total: 1, withStaff: 1 },
    { name: 'Temp change gel 65', total: 1, withStaff: 1 },
    { name: 'Temp change gel 58', total: 1, withStaff: 1 },
    { name: 'Silver gel', total: 2, withStaff: 1 },
    { name: 'Nail gold gel', total: 1, withStaff: 1 },
    { name: 'Gel 055', total: 1, withStaff: 1 },
    { name: 'Gel 095', total: 1, withStaff: 1 },
    { name: 'Gel 062', total: 1, withStaff: 1 },
    { name: 'Gel 074', total: 1, withStaff: 1 },
    { name: 'Gel 100', total: 1, withStaff: 1 },
    { name: 'Gel 098', total: 1, withStaff: 1 },
    { name: 'Gel 088', total: 1, withStaff: 1 },
    { name: 'Gel 022', total: 1, withStaff: 1 },
    { name: 'Gel 072', total: 1, withStaff: 1 },
    { name: 'Cat eye 12', total: 1, withStaff: 1 },
    { name: 'Cat eye 15', total: 1, withStaff: 1 },
    { name: 'Cat eye 24', total: 1, withStaff: 1 },
    { name: 'Cat eye 10', total: 1, withStaff: 1 },
    { name: 'Cat eye 21', total: 1, withStaff: 1 },
    { name: 'Cat eye 17', total: 1, withStaff: 1 },
    { name: 'Cat eye 20', total: 1, withStaff: 1 },
    { name: 'Clear rubber base', total: 1, withStaff: 1 },
    { name: 'Rubber base 28', total: 1, withStaff: 1 },
    { name: 'Rubber base 23', total: 1, withStaff: 1 },
    { name: 'Rubber base 41', total: 1, withStaff: 1 },
    { name: 'Rubber base 16', total: 1, withStaff: 1 },
    { name: 'Rubber base 30', total: 1, withStaff: 1 },
    { name: 'Rubber base 22', total: 1, withStaff: 1 },
    { name: 'Loose glitter (all colours)', total: 7, withStaff: 7 },
    { name: 'Dipper dish', total: 1, withStaff: 1 },
    { name: 'Spider gel', total: 3, withStaff: 3 },
    { name: 'Nail stamp', total: 1, withStaff: 1 },
    { name: 'Stickers', total: 3, withStaff: 3 },
    { name: 'Acrylic colour powders', total: 12, withStaff: 12 },
    { name: 'Nail duster', total: 2, withStaff: 2 },
    { name: 'Nail buff', total: 3, withStaff: 1 },
    { name: 'Nail file', total: 5, withStaff: 3 },
    { name: 'Magnet for cat eye', total: 1, withStaff: 1 },
    { name: 'Nail stamps', total: 6, withStaff: 6 },
    { name: 'Nail clipper', total: 1, withStaff: 1 },
    { name: 'Nail brush', total: 17, withStaff: 9 },
    { name: 'Cuticle pusher', total: 1, withStaff: 1 },
    { name: 'Magnets', total: 12, withStaff: 12 },
  ],
};

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
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [newStockName, setNewStockName] = useState('');
  const [newStockQty, setNewStockQty] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [clientSearch, setClientSearch] = useState('');
  const [expandedStockId, setExpandedStockId] = useState(null);
  const [assignDrafts, setAssignDrafts] = useState({}); // { [stockId]: { staff, qty } }
  const [resetStatus, setResetStatus] = useState('idle'); // 'idle' | 'running' | 'done'

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

  // One-time full reset: deletes every current stock item, then rebuilds the list from
  // STOCK_RESET (the owner's own manually-typed recount), with Lydia's split baked in.
  async function runStockReset() {
    const confirmed = window.confirm(
      `This will DELETE all ${stock.length} current stock items and replace them with ${STOCK_RESET.items.length} freshly entered ones (with ${STOCK_RESET.staff}'s split already set). This can't be undone. Continue?`
    );
    if (!confirmed) return;

    setResetStatus('running');

    for (const item of stock) {
      await deleteDoc(doc(db, 'stock', item.id));
    }

    for (const item of STOCK_RESET.items) {
      const assignments = item.withStaff > 0
        ? [{ staff: STOCK_RESET.staff, quantity: item.withStaff }]
        : [];
      await addDoc(collection(db, 'stock'), {
        name: item.name,
        quantity: item.total,
        assignments,
      });
    }

    setResetStatus('done');
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

            {resetStatus !== 'done' && (
              <div className="bulk-import-box">
                <p className="bulk-import-text">
                  One-time reset: replaces all {stock.length} current stock items with a fresh,
                  corrected recount ({STOCK_RESET.items.length} items), with {STOCK_RESET.staff}'s
                  current split already set per item. This deletes the current list first — can't be undone.
                </p>
                <button
                  className="bulk-import-btn"
                  onClick={runStockReset}
                  disabled={resetStatus === 'running'}
                >
                  {resetStatus === 'running' ? 'Resetting stock...' : `Reset stock (${STOCK_RESET.items.length} items)`}
                </button>
              </div>
            )}

            {resetStatus === 'done' && (
              <p className="bulk-import-done">
                ✓ Stock reset complete — {STOCK_RESET.items.length} items rebuilt. You can remove this box from the code now.
              </p>
            )}

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