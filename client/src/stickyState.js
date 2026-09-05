import { useState, useEffect } from 'react'

// State that survives a page reload.
//
// On the course people pull-to-refresh out of habit, and losing the group tab or
// the leaderboard view every time is a small, constant annoyance while entering
// scores one-handed. Keeping it in localStorage means a reload lands back where
// they were.
//
// Storage can throw outright — Safari private mode, a browser set to block site
// data — so every access is guarded and simply falls back to the initial value.
function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch (e) {
    return fallback
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    /* not worth telling anyone about — the page still works */
  }
}

export function useStickyState(key, initial) {
  const [value, setValue] = useState(() => read(key, initial))
  useEffect(() => { write(key, value) }, [key, value])
  return [value, setValue]
}
