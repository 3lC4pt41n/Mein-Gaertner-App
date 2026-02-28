// Token-Schaetzung und Budget-basierte Message-Selektion

// Grobe Token-Schaetzung (~4 Zeichen pro Token fuer Deutsch/Englisch)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Waehlt die neuesten Messages die ins Token-Budget passen
// Messages muessen chronologisch sortiert sein (aelteste zuerst)
export function selectMessagesWithinBudget(
  messages: any[],
  budgetTokens: number
): any[] {
  const reversed = [...messages].reverse(); // neueste zuerst
  const selected: any[] = [];
  let usedTokens = 0;

  for (const msg of reversed) {
    const content =
      typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    // ~85 Tokens Overhead pro Bild (Vision Token)
    const msgTokens = estimateTokens(content) + (msg.image_path ? 85 : 0);
    if (usedTokens + msgTokens > budgetTokens) break;
    selected.unshift(msg); // chronologische Reihenfolge beibehalten
    usedTokens += msgTokens;
  }

  return selected;
}
