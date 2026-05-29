// timeUtils.js - Tageszeit-Logik

export function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const formattedTime = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const base = { hour, minute, formattedTime };

  if (hour >= 5 && hour < 10) return { name: 'Morgen', icon: '🌅', ...base };
  if (hour >= 10 && hour < 12) return { name: 'Vormittag', icon: '🌤️', ...base };
  if (hour >= 12 && hour < 14) return { name: 'Mittag', icon: '☀️', ...base };
  if (hour >= 14 && hour < 18) return { name: 'Nachmittag', icon: '🌇', ...base };
  if (hour >= 18 && hour < 22) return { name: 'Abend', icon: '🌆', ...base };
  return { name: 'Nacht', icon: '🌙', ...base };
}

export function getLocalDateTime(date = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  const dateText = date.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeText = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    iso: date.toISOString(),
    dateText,
    timeText,
    timeZone,
    timezoneOffsetMinutes: -date.getTimezoneOffset(),
  };
}
