import { supabase } from '../supabase';

export const LANGUAGE_OPTIONS = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
];

const LANGUAGE_ALIAS_TO_CODE = {
  de: 'de',
  deutsch: 'de',
  german: 'de',
  en: 'en',
  english: 'en',
  englisch: 'en',
  fr: 'fr',
  francais: 'fr',
  français: 'fr',
  french: 'fr',
  franzoesisch: 'fr',
  französisch: 'fr',
  it: 'it',
  italian: 'it',
  italiano: 'it',
  italienisch: 'it',
  es: 'es',
  espanol: 'es',
  español: 'es',
  spanish: 'es',
  spanisch: 'es',
};

const UI_TEXTS = {
  de: {
    menu: {
      home: 'Zuhause',
      plants: 'Pflanzen',
      addPlant: 'Pflanze hinzufügen',
      tasks: 'Aufgaben',
      assistant: 'Mein Gärtner',
      shop: 'Shop',
      plantStackTitle: 'Meine Pflanzen',
      plantDetailsTitle: 'Details',
      taskTitle: 'Aufgabe',
      adminTitle: 'Admin Dashboard',
    },
    plantDetails: {
      tabOverview: 'Überblick',
      tabCare: 'Pflege & Standort',
      tabExtras: 'Extras',
      tabHealth: 'Healthcheck',
      healthLabel: 'Health',
      noHealthcheck: 'Kein Healthcheck vorhanden.',
      noDetails: 'Keine Details verfügbar.',
    },
  },
  en: {
    menu: {
      home: 'Home',
      plants: 'Plants',
      addPlant: 'Add Plant',
      tasks: 'Tasks',
      assistant: 'My Gardener',
      shop: 'Shop',
      plantStackTitle: 'My Plants',
      plantDetailsTitle: 'Details',
      taskTitle: 'Task',
      adminTitle: 'Admin Dashboard',
    },
    plantDetails: {
      tabOverview: 'Overview',
      tabCare: 'Care & Placement',
      tabExtras: 'Extras',
      tabHealth: 'Health Check',
      healthLabel: 'Health',
      noHealthcheck: 'No health check available.',
      noDetails: 'No details available.',
    },
  },
  fr: {
    menu: {
      home: 'Accueil',
      plants: 'Plantes',
      addPlant: 'Ajouter une plante',
      tasks: 'Tâches',
      assistant: 'Mon Jardinier',
      shop: 'Boutique',
      plantStackTitle: 'Mes Plantes',
      plantDetailsTitle: 'Détails',
      taskTitle: 'Tâche',
      adminTitle: 'Tableau Admin',
    },
    plantDetails: {
      tabOverview: 'Aperçu',
      tabCare: 'Entretien & emplacement',
      tabExtras: 'Extras',
      tabHealth: 'Bilan santé',
      healthLabel: 'Santé',
      noHealthcheck: 'Aucun bilan santé disponible.',
      noDetails: 'Aucun détail disponible.',
    },
  },
  it: {
    menu: {
      home: 'Casa',
      plants: 'Piante',
      addPlant: 'Aggiungi pianta',
      tasks: 'Attività',
      assistant: 'Il Mio Giardiniere',
      shop: 'Negozio',
      plantStackTitle: 'Le Mie Piante',
      plantDetailsTitle: 'Dettagli',
      taskTitle: 'Attività',
      adminTitle: 'Dashboard Admin',
    },
    plantDetails: {
      tabOverview: 'Panoramica',
      tabCare: 'Cura e posizione',
      tabExtras: 'Extra',
      tabHealth: 'Controllo salute',
      healthLabel: 'Salute',
      noHealthcheck: 'Nessun controllo salute disponibile.',
      noDetails: 'Nessun dettaglio disponibile.',
    },
  },
  es: {
    menu: {
      home: 'Inicio',
      plants: 'Plantas',
      addPlant: 'Añadir planta',
      tasks: 'Tareas',
      assistant: 'Mi Jardinero',
      shop: 'Tienda',
      plantStackTitle: 'Mis Plantas',
      plantDetailsTitle: 'Detalles',
      taskTitle: 'Tarea',
      adminTitle: 'Panel Admin',
    },
    plantDetails: {
      tabOverview: 'Resumen',
      tabCare: 'Cuidados y ubicación',
      tabExtras: 'Extras',
      tabHealth: 'Chequeo de salud',
      healthLabel: 'Salud',
      noHealthcheck: 'No hay chequeo de salud disponible.',
      noDetails: 'No hay detalles disponibles.',
    },
  },
};

export function normalizeLanguage(input) {
  if (!input) return 'de';
  const raw = String(input).trim().toLowerCase();
  return LANGUAGE_ALIAS_TO_CODE[raw] || 'de';
}

export function getLanguageLabel(input) {
  const code = normalizeLanguage(input);
  return LANGUAGE_OPTIONS.find((opt) => opt.code === code)?.label || 'Deutsch';
}

export function getUiText(input) {
  const code = normalizeLanguage(input);
  return UI_TEXTS[code] || UI_TEXTS.de;
}

export async function fetchCurrentUserLanguage() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return 'de';

  const { data } = await supabase
    .from('profiles')
    .select('language')
    .eq('id', user.id)
    .maybeSingle();

  return normalizeLanguage(data?.language);
}
