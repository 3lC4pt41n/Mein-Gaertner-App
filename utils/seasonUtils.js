// seasonUtils.js - hemisphaerenbewusste Saison-Logik

export function getCurrentSeason(latitude, date = new Date()) {
  const month = date.getMonth();
  const isSouthernHemisphere = typeof latitude === 'number' && latitude < 0;
  const shiftedMonth = isSouthernHemisphere ? (month + 6) % 12 : month;

  if (shiftedMonth >= 2 && shiftedMonth <= 4) return { name: 'Frühling', icon: '🌸' };
  if (shiftedMonth >= 5 && shiftedMonth <= 7) return { name: 'Sommer', icon: '☀️' };
  if (shiftedMonth >= 8 && shiftedMonth <= 10) return { name: 'Herbst', icon: '🍂' };
  return { name: 'Winter', icon: '❄️' };
}

export function getSeasonalTip(season) {
  const seasonName = typeof season === 'string' ? season : season?.name;

  switch (seasonName) {
    case 'Frühling':
      return 'Wachstumszeit: Jetzt sind Umtopfen, Düngen und neue Routinen besonders sinnvoll.';
    case 'Sommer':
      return 'Sommermodus: Prüfe Wasserbedarf und direkte Sonne etwas häufiger.';
    case 'Herbst':
      return 'Herbstpflege: Reduziere Dünger langsam und kontrolliere Lichtverhältnisse.';
    case 'Winter':
      return 'Winterruhe: Viele Pflanzen brauchen weniger Wasser und keinen Dünger.';
    default:
      return 'Prüfe Licht, Wasserbedarf und Standort passend zur aktuellen Jahreszeit.';
  }
}
