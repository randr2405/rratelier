import React, { useState } from 'react';

const ADMIN_EMAIL = 'info@rragencies.co.za';
const ADMIN_PASSWORD = 'Rhea2408!!';

export default function AdminLogin({ onSuccess, onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setError('');
      onSuccess();
    } else {
      setError('Incorrect email or password');
    }
  }

  return (
    <div className="admin-login-overlay" onClick={onClose}>
      <form className="admin-login-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="diary-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="admin-login-title">Admin Login</h2>
        <input
          className="admin-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <input
          className="admin-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="admin-error">{error}</div>}
        <button type="submit" className="admin-submit-btn">Log In</button>
      </form>
    </div>
  );
}