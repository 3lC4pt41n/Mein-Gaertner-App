// seasonUtils.js - hemisphaerenbewusste Saison-Logik

export function getCurrentSeason(latitude, date = new Date()) {
  const month = date.getMonth();
  const isSouthernHemisphere = typeof latitude === 'number' && latitude < 0;
  const shiftedMonth = isSouthernHemisphere ? (month + 6) % 12 : month;

  if (shiftedMonth >= 2 && shiftedMonth <= 4)
    return { key: 'spring', name: 'Frühling', icon: '🌸' };
  if (shiftedMonth >= 5 && shiftedMonth <= 7) return { key: 'summer', name: 'Sommer', icon: '☀️' };
  if (shiftedMonth >= 8 && shiftedMonth <= 10) return { key: 'autumn', name: 'Herbst', icon: '🍂' };
  return { key: 'winter', name: 'Winter', icon: '❄️' };
}

export function getSeasonalTip(season) {
  const seasonName = typeof season === 'string' ? season : season?.name || season?.key;

  switch (seasonName) {
    case 'Frühling':
    case 'spring':
      return 'Wachstumszeit: Jetzt sind Umtopfen, Düngen und neue Routinen besonders sinnvoll.';
    case 'Sommer':
    case 'summer':
      return 'Sommermodus: Prüfe Wasserbedarf und direkte Sonne etwas häufiger.';
    case 'Herbst':
    case 'autumn':
      return 'Herbstpflege: Reduziere Dünger langsam und kontrolliere Lichtverhältnisse.';
    case 'Winter':
    case 'winter':
      return 'Winterruhe: Viele Pflanzen brauchen weniger Wasser und keinen Dünger.';
    default:
      return 'Prüfe Licht, Wasserbedarf und Standort passend zur aktuellen Jahreszeit.';
  }
}
