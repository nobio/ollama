//const { PDFParse } = require('pdf-parse');
import { PDFParse } from 'pdf-parse';
import axios from 'axios';
import fs from 'fs/promises';
// const prompt = `Extrahiere aus folgendem Text Rechnung/Beleg, Rechnungsbetrag, Erstattungsbetrag und liefere das Ergebnis als Tabelle:`
// let prompt = `Extrahiere aus folgendem Text "Rechnung/Beleg", "Rechnungsbetrag in €", "Erstattungsbetrag in €", "Erstattungsbetrag in %" und liefere das Ergebnis als JSON Array über JSON Objecte, die genau diese Felder als Keys haben. Beachte, dass die Beträge als Zahlen (ohne Währungssymbol) ausgegeben werden. Wenn ein Wert nicht gefunden wird, setze ihn auf 0. Beachte ausserdem, dass jede Zeile zweimal vorkommt, wobei in der zweiten der Erstatungsbetrag in % angezeigt wird. Es muss also ein JSON Objekt pro 2 Zeilen erstellt werden:`;
// prompt += `\nBeispiel Ausgabe:\n[\n  {"Rechnung/Beleg": "Ärztliche Leistung", "Rechnungsbetrag in €": 365.42,"Erstattungsbetrag in €": 364.42, "Erstattungsbetrag in %": 100}"`;    
export const /*medicalInvoiceToJsonPrompt*/ prompt = `
You are given a tabular listing from a German medical invoice.

TASK:
Transform the data into a JSON ARRAY.
Each billable line must become ONE JSON OBJECT.

OUTPUT RULES (VERY IMPORTANT):
- Output ONLY valid JSON.
- Do NOT include explanations, markdown, or comments.
- The root element MUST be a JSON array.
- The output MUST fully comply with the provided JSON Schema.
- Use "." as decimal separator for numbers.
- Use null for missing values.
- Ignore headers, empty lines, and explanatory text (e.g. "Hinweis:").

JSON OBJECT STRUCTURE:
Each object may contain ONLY the following fields:
- typ
- behandlungszeitraum
- rechnungsbetrag_eur
- erstattungssatz_prozent
- erstattungsbetrag_eur
- hinweis_nr

FIELD RULES:
- "typ" must be one of:
  ["Ärztliche Leistung", "Arzneimittel", "Selbstbehalt", "Zwischensumme", "Gesamtsumme"]

- "behandlungszeitraum":
  - Format: "DD.MM.YY" or "DD.MM.YY - DD.MM.YY"
  - Use null if not applicable

- "rechnungsbetrag_eur":
  - Number
  - May be negative (e.g. Selbstbehalt)

- "erstattungssatz_prozent":
  - Number between 0 and 100
  - Use null if not present or not applicable

- "erstattungsbetrag_eur":
  - Number
  - Use null if not present or not applicable

- "hinweis_nr":
  - Integer
  - Use null if not present

INPUT DATA (Beispiel!!):
<<<
Rechnung/Beleg Behandlungszeitraum Rechnungs-
betrag in €
Erstattungs-
satz in %
Erstattungs-
betrag in €
Hinweis
Nr.
Ärztliche Leistung 16.12.24 - 10.01.25 425,34 425,34
Ärztliche Leistung 16.12.24 - 10.01.25 425,34 100 425,34
Ärztliche Leistung 01.01.25 53,77 53,77
Ärztliche Leistung 01.01.25 53,77 100 53,77
Arzneimittel 03.03.25 13,21 13,21
Arzneimittel 03.03.25 13,21 100 13,21
Selbstbehalt -83,69
Selbstbehalt -83,69 1
Zwischensumme: 492,32 408,63
Gesamtsumme: 408,63
>>>

IMPORTANT: Please note that each invoice/receipt line appears twice, with the second line showing the refund amount as a percentage. This means that only one JSON object needs to be created for every two lines.
In other words, there are always pairs of lines that follow each other and belong together, and only ONE JSON object may be created per pair.
Only the reimbursement rate in % is added from the second line of the pair.
Two consecutive lines always have the same "Rechnungsbetrag in €" value.
`;

async function run() {
    try {
        const parser = new PDFParse({ url: './HUK-COBURG_Leistungsabrechnung_302-054960-Y_10-03-2025.pdf' });

        const result = await parser.getText();
        const completePrompt = `${prompt}\n${result.text}"`;

        console.log(result.text);

        const body = { model: 'mistral', prompt: completePrompt };
        // const body = { model: 'magistral', prompt: completePrompt };        
        const res = await axios.post('http://localhost:11434/api/generate', body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 600000
        });

        // res.data contains multiple lines, each a JSON object.
        const text = typeof res.data === 'string' ? res.data : (Array.isArray(res.data) ? res.data.join('\n') : JSON.stringify(res.data));

        // Split into lines and concatenate the `response` field from each JSON line
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let combinedResponse = '';
        for (const line of lines) {
            const obj = JSON.parse(line);
            combinedResponse += obj.response;
        }

        console.log('combinedResponse:', combinedResponse);
        await fs.writeFile('example-data', combinedResponse, 'utf8');
        console.log('Saved response to example-data');
    } catch (err) {
        console.error('request error:', err?.response?.data || err.message || err);
    }
}

run();
