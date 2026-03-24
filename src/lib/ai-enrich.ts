import OpenAI from "openai";
import type { EnrichedData, Material } from "@/types";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `Sei un esperto di materiali edili. Il tuo unico compito è CORREGGERE E LEGGIBILIZZARE le descrizioni grezze di prodotti edili che arrivano da un gestionale con campo limitato di caratteri. Le descrizioni contengono abbreviazioni da espandere.

REGOLE FONDAMENTALI:
1. Espandi SOLO abbreviazioni che sei CERTO di riconoscere dal contesto della descrizione stessa.
2. NON inventare dati tecnici, specifiche, produttori o caratteristiche non presenti.
3. NON cercare informazioni su internet.
4. Se un'abbreviazione è ambigua o incerta, LASCIALA INVARIATA.
5. Mantieni tutte le dimensioni e i numeri esattamente come sono.
6. La descrizione corretta deve essere concisa e professionale (max 120 caratteri).
7. UNIFORMA LA TERMINOLOGIA: prodotti della stessa tipologia devono usare SEMPRE lo stesso termine. Non usare sinonimi diversi per lo stesso concetto. Esempi:
   - Usa sempre "Traversa" (mai "Traversina")
   - Usa sempre "Profilo" (mai "Profilato")
   - Usa sempre "Montante" (mai "Ritto" o "Stante")
   - Usa sempre "Guida" (mai "Binario" per guide a pavimento/soffitto)
   - Usa sempre "Vite" (mai "Viteria" per singoli articoli)
   - Usa sempre "Tassello" (mai "Ancorante" o "Fisher")
   - Usa sempre "Nastro" (mai "Banda" per nastri adesivi/sigillanti)
   - Usa sempre "Stucco" (mai "Rasante" se è stucco per giunti)
   - Usa sempre "Lastra" (mai "Pannello" per lastre in cartongesso/gesso)
   - Usa sempre "Angolare" (mai "Cantonale" o "Paraspigolo" per profili angolari)
   - Usa sempre "Staffa" (mai "Supporto" o "Mensola" per staffe di fissaggio)
   - Usa sempre "Zincato" (mai "Galvanizzato")

ABBREVIAZIONI TIPICHE DA ESPANDERE (solo se chiaramente riconoscibili nel contesto):
- "TRAVERS." → "Traversa"
- "TRAVERS. SCATTO" → "Traversa a scatto"
- "PROF." → "Profilo"
- "MT3", "MT 3", "MT3.05" → "3 m", "3.05 m" (lunghezza)
- "MM." o "MM" prima di numeri → "mm"
- "ACC." → "Acciaio"
- "BCO" → "Bianco"
- "ZNC" → "Zincato"
- "ZNCTO" → "Zincato"
- "PREV." → "Preverniciato"
- "ANG." → "Angolare" o "Angolo" (secondo contesto)
- "ANG.VAR." → "Angolo variabile"
- "CART." → "Cartongesso"
- "ISN." → "Isolante"
- "INT." → "Interno/a"
- "EST." → "Esterno/a"
- "PORTA INSTALL." → "Porta installazione"
- "CONTROTELAIO" → già completo
- "AUTOF." o "AUTOFOR." → "Autoforante"
- "AUTOLET." → "Autofilettante"
- "TPFORO" → "Testa piatta foro"
- "CF." o "CF" → "Confezione"
- "PZ" → "pz"
- "NR." → "n."
- "SPESS." → "Spessore"
- "LAR." o "LARGH." → "Larghezza"
- "LUN." o "LUNGH." → "Lunghezza"
- "H." → "H" (altezza, lascia così)
- "ELET." → "Elettrozincato"
- "FOSS." → "Fosfatato"
- "VIBR." → "Vibrato"
- "RINFORZATA" → già completo

Per ogni prodotto restituisci un oggetto JSON con:
- "codice": il codice articolo invariato
- "descrizioneAI": la descrizione corretta con abbreviazioni espanse e terminologia unificata. Se la descrizione originale è già chiara e non ha abbreviazioni evidenti, restituiscila migliorata nella leggibilità senza aggiungere nulla.

Rispondi SOLO con un JSON: { "results": [ { "codice": "...", "descrizioneAI": "..." }, ... ] }
Non aggiungere spiegazioni fuori dal JSON.`;

interface EnrichResult {
  codice: string;
  descrizioneAI: string;
}

export async function enrichMaterials(
  materials: Pick<Material, "codice" | "descrizione">[]
): Promise<EnrichedData[]> {
  const input = materials.map((m) => ({
    codice: m.codice,
    descrizione: m.descrizione,
  }));

  const response = await getOpenAI().chat.completions.create({
    model: process.env.AI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Correggi le abbreviazioni nelle seguenti descrizioni:\n\n${JSON.stringify(input, null, 2)}\n\nRispondi SOLO con il JSON richiesto.`,
      },
    ],
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Risposta AI vuota");

  // Extract JSON from response (may be wrapped in ```json ... ```)
  let jsonStr = content;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  } else {
    // Try to find raw JSON object
    const braceStart = content.indexOf("{");
    const braceEnd = content.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
      jsonStr = content.slice(braceStart, braceEnd + 1);
    }
  }

  const parsed = JSON.parse(jsonStr) as { results: EnrichResult[] };
  if (!Array.isArray(parsed.results)) {
    throw new Error("Formato risposta AI non valido");
  }

  const now = new Date().toISOString();
  return parsed.results.map((r) => ({
    codice: r.codice,
    descrizioneAI: r.descrizioneAI || "",
    updatedAt: now,
  }));
}

/** Process materials in batches */
export async function enrichMaterialsBatch(
  materials: Pick<Material, "codice" | "descrizione">[],
  batchSize = 50,
  onProgress?: (done: number, total: number) => void
): Promise<EnrichedData[]> {
  const results: EnrichedData[] = [];

  for (let i = 0; i < materials.length; i += batchSize) {
    const batch = materials.slice(i, i + batchSize);
    const enriched = await enrichMaterials(batch);
    results.push(...enriched);
    onProgress?.(Math.min(i + batchSize, materials.length), materials.length);
  }

  return results;
}
