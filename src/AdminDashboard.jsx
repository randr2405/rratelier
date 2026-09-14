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

// One-time bulk stock import, transcribed from the handwritten stock-take list (Sept 2026 restock).
// Quantities for packaged/boxed items (charms, tips, gel refills, etc.) are counted in
// containers/packs, not individual pieces inside them, per how the list was written.
// This is meant to be run once from the Stock tab, then can be removed from the code.
const BULK_STOCK_IMPORT = [
  { name: 'Cuticle oil pen', quantity: 14 },
  { name: 'Cuticle oil bottle', quantity: 3 },
  { name: 'Foil', quantity: 2 },
  { name: 'Sand bits', quantity: 100 },
  { name: 'Cuticle scissors', quantity: 1 },
  { name: 'Rhinestone dapper', quantity: 1 },
  { name: 'Nail glue', quantity: 10 },
  { name: 'Butterfly charms (container of 6)', quantity: 2 },
  { name: 'Chrome', quantity: 3 },
  { name: 'Nail wipes', quantity: 200 },
  { name: 'Pearl charms (container of 6)', quantity: 1 },
  { name: 'Rose charms (container of 6)', quantity: 1 },
  { name: 'Flower charms (containers)', quantity: 15 },
  { name: 'Butterfly security charms (containers)', quantity: 12 },
  { name: 'Square soft gel tips M (500pc pack)', quantity: 1 },
  { name: 'Square thick tips size 6 (360pc pack)', quantity: 6 },
  { name: 'Round thick tips M (450pc pack)', quantity: 1 },
  { name: 'UV nail lamp', quantity: 2 },
  { name: 'Nail file drill', quantity: 1 },
  { name: 'Hand cushion', quantity: 1 },
  { name: 'Nail art dotting tool', quantity: 5 },
  { name: 'Container (28pc pack)', quantity: 1 },
  { name: 'Refill lint disc', quantity: 600 },
  { name: 'Sponge paint gel', quantity: 1 },
  { name: 'Rhinestones (rigid + silver, container)', quantity: 1 },
  { name: 'Hand sanitizer (1L)', quantity: 1 },
  { name: 'Acetone (1L)', quantity: 1 },
  { name: 'Monomer (1L)', quantity: 1 },
  { name: 'Monomer (300ml)', quantity: 1 },
  { name: 'Acrylic powder', quantity: 5 },
  { name: 'Soak off containers', quantity: 2 },
  { name: 'Tip cutter', quantity: 1 },
  { name: 'Planet nail hand sanitizer', quantity: 1 },
  { name: 'Brush cleaner (120ml)', quantity: 1 },
  { name: 'Base coat', quantity: 4 },
  { name: 'Top coat', quantity: 5 },
  { name: 'Blooming gel', quantity: 3 },
  { name: 'Fan sticky gel', quantity: 3 },
  { name: 'Nail dehydrator', quantity: 1 },
  { name: 'Nail hardener', quantity: 1 },
  { name: 'Nail primer', quantity: 1 },
  { name: 'White gel', quantity: 3 },
  { name: 'Diamond adhesive', quantity: 2 },
  { name: 'Fiber builder gel', quantity: 3 },
  { name: 'Black gel', quantity: 1 },
  { name: 'Red glitter gel', quantity: 1 },
  { name: 'White glitter gel (thick)', quantity: 1 },
  { name: 'White glitter gel (thin)', quantity: 1 },
  { name: 'Metallic liner gel', quantity: 1 },
  { name: 'Platinum gel 07', quantity: 1 },
  { name: 'Platinum gel 34', quantity: 1 },
  { name: 'Rose gold glitter gel', quantity: 1 },
  { name: 'Temp change gel 01', quantity: 1 },
  { name: 'Temp change gel 65', quantity: 1 },
  { name: 'Temp change gel 58', quantity: 1 },
  { name: 'Silver gel', quantity: 2 },
  { name: 'Nail gold gel', quantity: 2 },
  { name: 'Gel 055', quantity: 1 },
  { name: 'Gel 002', quantity: 1 },
  { name: 'Gel 074', quantity: 1 },
  { name: 'Gel 100', quantity: 1 },
  { name: 'Gel 098', quantity: 1 },
  { name: 'Gel 088', quantity: 1 },
  { name: 'Gel 022', quantity: 1 },
  { name: 'Gel 072', quantity: 1 },
  { name: 'Cat eye 13', quantity: 1 },
  { name: 'Cat eye 15', quantity: 1 },
  { name: 'Cat eye 24', quantity: 2 },
  { name: 'Cat eye 10', quantity: 1 },
  { name: 'Cat eye 21', quantity: 1 },
  { name: 'Cat eye 17', quantity: 1 },
  { name: 'Cat eye 20', quantity: 1 },
  { name: 'Clear rubber base', quantity: 1 },
  { name: 'Rubber base 28', quantity: 1 },
  { name: 'Rubber base 23', quantity: 1 },
  { name: 'Rubber base 41', quantity: 1 },
  { name: 'Rubber base 16', quantity: 1 },
  { name: 'Rubber base 30', quantity: 1 },
  { name: 'Rubber base 22', quantity: 1 },
  { name: 'Loose glitter', quantity: 7 },
  { name: 'Dipper dish', quantity: 1 },
  { name: 'Silver spider gel', quantity: 1 },
  { name: 'Gold spider gel', quantity: 1 },
  { name: 'White spider gel', quantity: 7 },
  { name: 'Nail stamp', quantity: 1 },
  { name: 'Stickers', quantity: 3 },
  { name: 'Acrylic colour powders', quantity: 12 },
  { name: 'Nail duster', quantity: 2 },
  { name: 'Nail buff', quantity: 3 },
  { name: 'Nail file', quantity: 5 },
  { name: 'Magnet for cat eye', quantity: 1 },
  { name: 'Nail stamps', quantity: 6 },
  { name: 'Nail clipper', quantity: 1 },
  { name: 'Nail brush', quantity: 17 },
  { name: 'Cuticle pusher', quantity: 1 },
  { name: 'Magnets', quantity: 12 },
];

// One-time bulk assignment: stock handed to a staff member, transcribed from the complete
// handwritten "Day 1" hand-out sheet. Matched against BULK_STOCK_IMPORT names where the item
// already exists (topping up that assignment); items with a code/name that doesn't match
// anything already tracked are created fresh, with on-hand starting at 0 since all of it is
// with staff. A few names below are genuine best-guess matches to the closest existing item —
// see the accompanying notes before running this.
const BULK_STAFF_ASSIGNMENT = {
  staff: 'Lydia',
  items: [
    { name: 'Nail primer', quantity: 1 },
    { name: 'Cuticle oil bottle', quantity: 2 },
    { name: 'Cuticle oil pen', quantity: 1 },
    { name: 'Black gel', quantity: 1 },
    { name: 'White gel', quantity: 2 },
    { name: 'Metallic liner gel', quantity: 1 },
    { name: 'Red glitter gel', quantity: 1 },
    { name: 'White glitter gel 093', quantity: 1 },
    { name: 'Platinum gel 07', quantity: 1 },
    { name: 'Platinum gel 34', quantity: 1 },
    { name: 'Rose gold glitter gel', quantity: 1 },
    { name: 'Temp change gel 65', quantity: 1 },
    { name: 'Temp change gel 67', quantity: 1 },
    { name: 'Temp change gel 58', quantity: 1 },
    { name: 'Silver gel', quantity: 2 },
    { name: 'Nail gold gel', quantity: 1 },
    { name: 'Gel 055', quantity: 1 },
    { name: 'Gel 095', quantity: 1 },
    { name: 'Gel 072', quantity: 1 },
    { name: 'Gel 022', quantity: 1 },
    { name: 'Gel 088', quantity: 1 },
    { name: 'Gel 059', quantity: 1 },
    { name: 'Gel 100', quantity: 1 },
    { name: 'Gel 074', quantity: 1 },
    { name: 'Gel 062', quantity: 1 },
    { name: 'Cat eye 20', quantity: 1 },
    { name: 'Cat eye 17', quantity: 1 },
    { name: 'Cat eye 21', quantity: 1 },
    { name: 'Cat eye 24', quantity: 1 },
    { name: 'Cat eye 13', quantity: 1 },
    { name: 'Clear rubber base', quantity: 1 },
    { name: 'Rubber base 25', quantity: 1 },
    { name: 'Rubber base 28', quantity: 1 },
    { name: 'Rubber base 16', quantity: 1 },
    { name: 'Rubber base 22', quantity: 1 },
    { name: 'Rubber base 41', quantity: 1 },
    { name: 'Rubber base 30', quantity: 1 },
    { name: 'Dipper dish', quantity: 1 },
    { name: 'Nail stamp', quantity: 1 },
    { name: 'Acrylic colour powders', quantity: 12 },
    { name: 'Loose glitter', quantity: 7 },
    { name: 'Spider gel (mixed)', quantity: 3 },
    { name: 'Fiber builder gel', quantity: 1 },
    { name: 'Diamond adhesive', quantity: 1 },
    { name: 'Foil', quantity: 1 },
    { name: 'Nail wipes', quantity: 200 },
    { name: 'Pearl charms (container of 6)', quantity: 1 },
    { name: 'Chrome', quantity: 1 },
    { name: 'Square thick tips size 6 (360pc pack)', quantity: 1 },
    { name: 'Round thick tips M (450pc pack)', quantity: 1 },
    { name: 'Butterfly security charms (containers)', quantity: 1 },
    { name: 'Flower charms (containers)', quantity: 1 },
    { name: 'Rose charms (container of 6)', quantity: 1 },
    { name: 'Nail file drill', quantity: 1 },
    { name: 'UV nail lamp', quantity: 2 },
    { name: 'Hand cushion', quantity: 1 },
    { name: 'Soak off containers', quantity: 2 },
    { name: 'Nail file', quantity: 3 },
    { name: 'Nail buff', quantity: 1 },
    { name: 'Nail brush', quantity: 9 },
    { name: 'Nail clipper', quantity: 1 },
    { name: 'Magnet for cat eye', quantity: 1 },
    { name: 'Nail stamps', quantity: 6 },
    { name: 'Cuticle pusher', quantity: 1 },
    { name: 'Magnets', quantity: 12 },
    { name: 'Nail bits', quantity: 5 },
    { name: 'Nail monomer bottle', quantity: 1 },
    { name: 'Hand sanitizer bottle', quantity: 1 },
    { name: 'Acetone bottle', quantity: 1 },
    { name: 'Nail glue', quantity: 2 },
    { name: 'Monomer (1L)', quantity: 1 },
    { name: 'Hand sanitizer (1L)', quantity: 1 },
    { name: 'Acetone (1L)', quantity: 1 },
    { name: 'Brush cleaner (120ml)', quantity: 1 },
    { name: 'Hand sanitizer spray bottle', quantity: 1 },
    { name: 'Acrylic base colours', quantity: 4 },
    { name: 'Nail art dotting tool', quantity: 1 },
    { name: 'Cuticle clipper', quantity: 1 },
    { name: 'Rhinestone gripper', quantity: 1 },
    { name: 'Tip cutter', quantity: 1 },
    { name: 'Stickers', quantity: 3 },
    { name: 'Sponge paint gel', quantity: 1 },
    { name: 'Gold rhinestones', quantity: 1 },
    { name: 'Silver rhinestones', quantity: 1 },
    { name: 'Butterfly charms (container of 6)', quantity: 1 },
    { name: 'Base coat', quantity: 2 },
    { name: 'Top coat', quantity: 2 },
    { name: 'Blooming gel', quantity: 1 },
    { name: 'Foil sticky gel', quantity: 1 },
    { name: 'Nail dehydrator', quantity: 1 },
    { name: 'Nail hardener', quantity: 1 },
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
  const [bulkImportStatus, setBulkImportStatus] = useState('idle'); // 'idle' | 'running' | 'done'
  const [bulkImportCount, setBulkImportCount] = useState(0);
  const [expandedStockId, setExpandedStockId] = useState(null);
  const [assignDrafts, setAssignDrafts] = useState({}); // { [stockId]: { staff, qty } }
  const [bulkAssignStatus, setBulkAssignStatus] = useState('idle'); // 'idle' | 'running' | 'done'
  const [bulkAssignCount, setBulkAssignCount] = useState(0);
  const [bulkAssignWarnings, setBulkAssignWarnings] = useState([]);

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

  // Runs once: assigns every item in BULK_STAFF_ASSIGNMENT to that staff member. Matches by
  // name (case-insensitive) against current stock; creates a new item if no match exists.
  // Collects warnings for anything assigned beyond what was currently on hand, rather than
  // blocking — these are surfaced after the run so they can be double-checked.
  async function runBulkStaffAssignment() {
    const { staff, items } = BULK_STAFF_ASSIGNMENT;
    const confirmed = window.confirm(
      `This will assign ${items.length} items to ${staff}, matching against your existing stock by name. Continue?`
    );
    if (!confirmed) return;

    setBulkAssignStatus('running');
    setBulkAssignCount(0);
    const warnings = [];

    for (const bulkItem of items) {
      const existing = stock.find(
        (s) => s.name.trim().toLowerCase() === bulkItem.name.trim().toLowerCase()
      );

      if (existing) {
        const available = onHandQuantity(existing);
        if (bulkItem.quantity > available) {
          warnings.push(
            `${bulkItem.name}: assigned ${bulkItem.quantity} but only ${available} was on hand.`
          );
        }

        const assignments = [...(existing.assignments || [])];
        const existingAssignIndex = assignments.findIndex(
          (a) => a.staff.trim().toLowerCase() === staff.toLowerCase()
        );
        if (existingAssignIndex >= 0) {
          assignments[existingAssignIndex] = {
            ...assignments[existingAssignIndex],
            quantity: (Number(assignments[existingAssignIndex].quantity) || 0) + bulkItem.quantity,
          };
        } else {
          assignments.push({ staff, quantity: bulkItem.quantity });
        }

        await setDoc(doc(db, 'stock', existing.id), {
          name: existing.name,
          quantity: existing.quantity,
          assignments,
        });
      } else {
        // Not previously tracked — create it with total = what was given out, so on-hand starts at 0.
        warnings.push(`${bulkItem.name}: wasn't in your stock list, so it was added new (total = ${bulkItem.quantity}, all with ${staff}).`);
        await addDoc(collection(db, 'stock'), {
          name: bulkItem.name,
          quantity: bulkItem.quantity,
          assignments: [{ staff, quantity: bulkItem.quantity }],
        });
      }

      setBulkAssignCount((c) => c + 1);
    }

    setBulkAssignWarnings(warnings);
    setBulkAssignStatus('done');
  }

  // Runs once: adds every item in BULK_STOCK_IMPORT. If an item with the same name (case-insensitive)
  // already exists in stock, its quantity is topped up instead of creating a duplicate row.
  async function runBulkStockImport() {
    const confirmed = window.confirm(
      `This will add ${BULK_STOCK_IMPORT.length} items to your stock list (topping up quantity for any that already exist by name). Continue?`
    );
    if (!confirmed) return;

    setBulkImportStatus('running');
    setBulkImportCount(0);

    for (const item of BULK_STOCK_IMPORT) {
      const existing = stock.find(
        (s) => s.name.trim().toLowerCase() === item.name.trim().toLowerCase()
      );
      if (existing) {
        await setDoc(doc(db, 'stock', existing.id), {
          name: existing.name,
          quantity: (Number(existing.quantity) || 0) + item.quantity,
          assignments: existing.assignments || [],
        });
      } else {
        await addDoc(collection(db, 'stock'), {
          name: item.name,
          quantity: item.quantity,
        });
      }
      setBulkImportCount((c) => c + 1);
    }

    setBulkImportStatus('done');
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

            {bulkImportStatus !== 'done' && (
              <div className="bulk-import-box">
                <p className="bulk-import-text">
                  One-time import: {BULK_STOCK_IMPORT.length} items transcribed from your recent stock-take.
                  Existing items with a matching name will have their quantity topped up rather than duplicated.
                </p>
                <button
                  className="bulk-import-btn"
                  onClick={runBulkStockImport}
                  disabled={bulkImportStatus === 'running'}
                >
                  {bulkImportStatus === 'running'
                    ? `Importing... (${bulkImportCount}/${BULK_STOCK_IMPORT.length})`
                    : `Import bulk stock list (${BULK_STOCK_IMPORT.length} items)`}
                </button>
              </div>
            )}

            {bulkImportStatus === 'done' && (
              <p className="bulk-import-done">
                ✓ Bulk import complete — {BULK_STOCK_IMPORT.length} items added/updated. You can remove this box from the code now.
              </p>
            )}

            {bulkAssignStatus !== 'done' && (
              <div className="bulk-import-box">
                <p className="bulk-import-text">
                  One-time staff assignment: {BULK_STAFF_ASSIGNMENT.items.length} items to mark as issued to{' '}
                  <strong>{BULK_STAFF_ASSIGNMENT.staff}</strong>, transcribed from the full "Day 1" hand-out sheet.
                </p>
                <button
                  className="bulk-import-btn"
                  onClick={runBulkStaffAssignment}
                  disabled={bulkAssignStatus === 'running'}
                >
                  {bulkAssignStatus === 'running'
                    ? `Assigning... (${bulkAssignCount}/${BULK_STAFF_ASSIGNMENT.items.length})`
                    : `Assign ${BULK_STAFF_ASSIGNMENT.items.length} items to ${BULK_STAFF_ASSIGNMENT.staff}`}
                </button>
              </div>
            )}

            {bulkAssignStatus === 'done' && (
              <div className="bulk-import-done">
                <p>✓ Assignment complete — {BULK_STAFF_ASSIGNMENT.items.length} items processed for {BULK_STAFF_ASSIGNMENT.staff}.</p>
                {bulkAssignWarnings.length > 0 && (
                  <>
                    <p className="bulk-assign-warning-title">Worth double-checking:</p>
                    <ul className="bulk-assign-warning-list">
                      {bulkAssignWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
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