import React from 'react';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatDateKey(year, month, day) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export default function Calendar({ currentMonth, onMonthChange, onSelectDate, bookedDateKeys }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(<div key={`empty-${i}`} className="calendar-day empty" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = formatDateKey(year, month, day);
    const isToday = dateKey === todayKey;
    const hasBookings = bookedDateKeys.has(dateKey);

    cells.push(
      <div
        key={dateKey}
        className={`calendar-day${isToday ? ' today' : ''}${hasBookings ? ' has-bookings' : ''}`}
        onClick={() => onSelectDate(dateKey, day)}
      >
        {day}
      </div>
    );
  }

  function goPrevMonth() {
    onMonthChange(new Date(year, month - 1, 1));
  }

  function goNextMonth() {
    onMonthChange(new Date(year, month + 1, 1));
  }

  return (
    <div className="calendar-wrap">
      <div className="calendar-nav">
        <button onClick={goPrevMonth} aria-label="Previous month">‹</button>
        <span>{MONTH_NAMES[month]} {year}</span>
        <button onClick={goNextMonth} aria-label="Next month">›</button>
      </div>
      <div className="calendar-grid">
        {DAY_LABELS.map((label, i) => (
          <div className="day-label" key={`label-${i}`}>{label}</div>
        ))}
        {cells}
      </div>
    </div>
  );
}