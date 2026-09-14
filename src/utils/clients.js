// Shared helper for building a client directory (visit history, totals) from booking documents.
// Used by both the DiaryBook (returning-client badge + autocomplete) and the Admin "Clients" tab.

export function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

/**
 * Builds a directory of clients from all booking documents, keyed by normalized phone number
 * (falling back to a name-based key if no phone was captured).
 *
 * Returns a Map<key, {
 *   name, phone, visitCount, totalSpend, lastVisit,
 *   visits: [{ date, service, amount, status }]
 * }>
 *
 * @param {Array} bookingDocs - array of { id: 'YYYY-MM-DD', slots: [...] }
 * @param {string|null} excludeDateKey - optional date key to exclude from the count
 *   (used so "today's" in-progress edits aren't counted as a prior visit)
 */
export function buildClientDirectory(bookingDocs, excludeDateKey = null) {
  const directory = new Map();

  bookingDocs.forEach((bDoc) => {
    if (excludeDateKey && bDoc.id === excludeDateKey) return;

    const slots = bDoc.slots || [];
    slots.forEach((slot) => {
      if (!slot.client && !slot.phone) return;

      const normalizedPhone = normalizePhone(slot.phone);
      const key = normalizedPhone || `name:${(slot.client || '').trim().toLowerCase()}`;
      if (key === 'name:') return;

      const amt = parseFloat(slot.amount) || 0;
      const existing = directory.get(key) || {
        name: slot.client || '',
        phone: slot.phone || '',
        visitCount: 0,
        totalSpend: 0,
        lastVisit: bDoc.id,
        visits: [],
      };

      // Prefer the most recently seen non-empty name/phone in case of small typos over time.
      if (slot.client) existing.name = slot.client;
      if (slot.phone) existing.phone = slot.phone;

      existing.visitCount += 1;
      if (slot.payment && slot.payment !== 'Not paid yet') {
        existing.totalSpend += amt;
      }
      if (bDoc.id > existing.lastVisit) existing.lastVisit = bDoc.id;

      existing.visits.push({
        date: bDoc.id,
        service: slot.service || '',
        amount: amt,
        status: slot.status || 'Upcoming',
      });

      directory.set(key, existing);
    });
  });

  return directory;
}

/** Looks up a client entry by phone number from a pre-built directory. */
export function findClientByPhone(directory, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return directory.get(normalized) || null;
}