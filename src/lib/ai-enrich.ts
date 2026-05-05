import OpenAI from "openai";
import type { EnrichedData, Material } from "@/types";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `Sei un esperto di materiali edili. Correggi descrizioni grezze (gestionale con campi limitati) espandendo abbreviazioni e uniformando la terminologia.

# Regole assolute
1. Espandi un'abbreviazione SOLO se sei certo del significato dal contesto.
2. Se è ambigua, lasciala invariata. Non inventare dati, non cercare sul web.
3. Mantieni esattamente dimensioni, numeri e codici.
4. Riconosci le abbreviazioni indipendentemente dal casing (TRAVERS. = Travers. = travers.).
5. Mantieni la terminologia coerente in tutto il batch: se in una descrizione usi "Traversa", usalo per tutti gli articoli simili nella stessa risposta.

# Convenzione di formato
- Nomi di prodotto/materiale: Title case ("Traversa", "Profilo", "Lastra").
- Unità di misura, quantità, sigle metriche: minuscolo ("mm", "m", "pz", "n.").
- Massimo 120 caratteri per descrizione.
- Un solo spazio tra parole, niente punto finale.

# Dizionario abbreviazioni
TRAVERS. → Traversa | TRAVERS. SCATTO → Traversa a scatto | PROF. → Profilo
MT3 / MT 3 / MT3.05 → 3 m / 3.05 m | MM / MM. (prima di numeri) → mm
ACC. → Acciaio | BCO → Bianco | ZNC / ZNCTO → Zincato | PREV. → Preverniciato
ANG. → Angolare o Angolo (dal contesto) | ANG.VAR. → Angolo variabile
CART. → Cartongesso | ISN. → Isolante | INT. → Interno | EST. → Esterno
PORTA INSTALL. → Porta installazione | AUTOF. / AUTOFOR. → Autoforante
AUTOLET. → Autofilettante | TPFORO → Testa piatta foro
CF. / CF → Confezione | PZ → pz | NR. → n. | SPESS. → Spessore
LAR. / LARGH. → Larghezza | LUN. / LUNGH. → Lunghezza | H. → H
ELET. → Elettrozincato | FOSS. → Fosfatato | VIBR. → Vibrato
CONTR. → controsoffitto SE riferito a botole, lastre, pannelli per soffitto;
        controtelaio SE riferito a porte, finestre, serramenti.
        Mai "contro incendio". Se il contesto non è chiaro, lascia "CONTR." invariato.
CONTROTELAIO, RINFORZATA → già completi, lascia invariati

# Dizionario terminologia (uniforma SEMPRE)
Traversa (mai Traversina) | Profilo (mai Profilato) | Montante (mai Ritto/Stante)
Guida (mai Binario, per guide a pavimento/soffitto) | Vite (mai Viteria, per singoli articoli)
Tassello (mai Ancorante/Fisher) | Nastro (mai Banda, per adesivi/sigillanti)
Stucco (mai Rasante, se è stucco per giunti) | Lastra (mai Pannello, per cartongesso/gesso)
Angolare (mai Cantonale/Paraspigolo) | Staffa (mai Supporto/Mensola, per fissaggi)
Zincato (mai Galvanizzato)

# Esempi
Input:  "TRAVERS. SCATTO 47/27 MT3"
Output: "Traversa a scatto 47/27 3 m"

Input:  "PROF. ANG.VAR. ZNC MM 30X30 MT2.5"
Output: "Profilo angolo variabile zincato 30x30 mm 2.5 m"

Input:  "VITE TPFORO AUTOLET. ACC. CF.500 PZ"
Output: "Vite testa piatta foro autofilettante acciaio confezione 500 pz"

Input:  "LASTRA CART. ISN. SPESS.12.5 MM"
Output: "Lastra cartongesso isolante spessore 12.5 mm"

Input:  "BOTOLA CONTR.EI120 400X400"   (codice BF400X400 — botola = accesso controsoffitto)
Output: "Botola controsoffitto EI120 400x400"

Input:  "PIASTRA XYZ-77 ALPHA-K"
Output: "Piastra XYZ-77 ALPHA-K"

Se la descrizione è già chiara e priva di abbreviazioni, restituiscila normalizzando solo spazi e casing.`;

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
    model: process.env.AI_MODEL || "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Correggi le seguenti descrizioni:\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "enrich_results",
        strict: true,
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  codice: { type: "string" },
                  descrizioneAI: { type: "string" },
                },
                required: ["codice", "descrizioneAI"],
                additionalProperties: false,
              },
            },
          },
          required: ["results"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Risposta AI vuota");

  const parsed = JSON.parse(content) as { results: EnrichResult[] };
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
