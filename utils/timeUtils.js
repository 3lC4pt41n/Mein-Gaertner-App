// timeUtils.js - Tageszeit-Logik

export function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 10) return { name: 'Morgen', icon: '🌅', hour };
  if (hour >= 10 && hour < 12) return { name: 'Vormittag', icon: '🌤️', hour };
  if (hour >= 12 && hour < 14) return { name: 'Mittag', icon: '☀️', hour };
  if (hour >= 14 && hour < 18) return { name: 'Nachmittag', icon: '🌇', hour };
  if (hour >= 18 && hour < 22) return { name: 'Abend', icon: '🌆', hour };
  return { name: 'Nacht', icon: '🌙', hour };
}
