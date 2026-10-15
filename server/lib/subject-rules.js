/**
 * Subject-specific rules. The same glyph means different things per subject
 * (С = carbon in chemistry, point C in geometry, "с" = seconds in physics), so the
 * chosen subject steers OCR, translation and the final image render.
 */

const SUBJECTS = {
  auto: {
    name: 'Not specified — infer per image',
    ocr: `- Decide the subject from what is visible (mathematics, physics, chemistry, biology, geography, history, language…) and apply that subject's notation conventions
- Any formula, equation, chemical formula or reaction still follows the FORMULAS rules below`,
    translate: `- Infer the subject from the content and use that subject's standard terminology in the target language`,
    render: `- Formulas, equations, chemical formulas, units and symbols must keep their exact printed layout`,
  },

  math: {
    name: 'Mathematics (algebra, geometry, calculus)',
    ocr: String.raw`- Variables, point names, lines and figures are Latin (A, B, C, ABC, x, y, k, a, b) or Greek (α, β, γ, φ, π) — never Cyrillic lookalikes
- Stacked fractions → \frac{…}{…}; mixed numbers 2½ → 2\frac{1}{2}; roots → \sqrt{…} or \sqrt[3]{…}; powers → ^{…}; indices → _{…}
- Systems of equations → \begin{cases} … \\ … \end{cases}
- Russian function names: \sin, \cos, \operatorname{tg}, \operatorname{ctg}, \arcsin, \operatorname{arctg}, \lg, \ln, \log_{a}
- Geometry: \angle, \triangle, \parallel, \perp, ^\circ; sets/intervals: \in, \cup, \cap, \varnothing, \infty, [a; b)
- Keep the decimal comma and interval semicolons exactly as printed (3,5 and [0; 1])`,
    translate: `- Use standard {target} mathematics terminology (equation, inequality, root, domain, perpendicular, bisector, median…)
- Never rename variables, points, figures or functions`,
    render: `- Fractions stay stacked, exponents raised, indices lowered, roots and geometry labels unchanged`,
  },

  physics: {
    name: 'Physics',
    ocr: String.raw`- Quantities are Latin/Greek letters (v, a, F, m, g, t, s, p, E, P, I, U, R, ρ, λ, ν, ω, η, μ, Δ) — never Cyrillic lookalikes
- Vectors → \vec{F}; changes → \Delta t; scientific notation → 3\cdot10^{8}
- Cyrillic subscripts are real labels — keep them as printed in \text{}: F_{\text{тр}}, E_{\text{к}}, E_{\text{п}}, v_{\text{ср}}, t_{\text{кип}}
- Units stay as printed (usually Cyrillic) inside the same $...$ as their number: $v = 20\ \text{м/с}$, $g = 9{,}8\ \text{м/с}^2$
- Degrees → ^\circ; circuit diagram labels (R_1, V, A, \varepsilon) one block each`,
    translate: String.raw`- Convert Cyrillic unit abbreviations and quantity labels to the standard used in {target} physics textbooks — use only the line for {target}:
  English: м→m, см→cm, км→km, с→s, мин→min, ч→h, кг→kg, г→g, Н→N, Дж→J, Вт→W, Па→Pa, В→V, А→A, Ом→Ω, Гц→Hz, Кл→C, Тл→T, К→K; F_{\text{тр}}→F_{\text{fr}}, E_{\text{к}}→E_{\text{k}}, E_{\text{п}}→E_{\text{p}}, v_{\text{ср}}→v_{\text{avg}}
  Azerbaijani: м→m, см→sm, км→km, с→san, мин→dəq, ч→saat, кг→kq, г→q, Н→N, Дж→C, Вт→Vt, Па→Pa, В→V, А→A, Ом→Om, Гц→Hs, Кл→Kl, Тл→Tl, К→K; F_{\text{тр}}→F_{\text{sür}}, E_{\text{к}}→E_{\text{k}}, E_{\text{п}}→E_{\text{p}}, v_{\text{ср}}→v_{\text{orta}}
  Russian: keep as printed
- Keep every number, exponent, prefix power and quantity symbol unchanged`,
    render: `- Formulas, vectors, subscripts, exponents and units keep their exact printed layout`,
  },

  chemistry: {
    name: 'Chemistry',
    ocr: String.raw`- Element symbols are ALWAYS Latin: C, O, H, N, P, S, K, B, Na, Ca, Cu, Fe … A Cyrillic С, О, Н, Р, К, В inside a formula is a misreading — write the Latin letter
- Formulas with subscripts: $H_2SO_4$, $Ca(OH)_2$, $CuSO_4\cdot5H_2O$; ions and charges: $SO_4^{2-}$, $Fe^{3+}$; oxidation states: $\overset{+6}{S}$
- Reactions: keep coefficients; \rightarrow, reversible \rightleftarrows, gas \uparrow, precipitate \downarrow; conditions over the arrow: \xrightarrow{t^\circ,\ \text{кат.}} (Cyrillic conditions as printed)
- Organic: CH_3{-}CH_2{-}OH; skeletal/structural drawings are not text — only their atom labels
- Russian substance names (серная кислота, гидроксид натрия) are normal text, not formulas`,
    translate: String.raw`- Element symbols, chemical formulas, coefficients, charges and arrows never change
- Translate substance names with standard {target} (IUPAC) names; reaction conditions: кат.→cat., (конц.)→(conc.), (разб.)→(dil.), р-р→solution, t° stays (English examples — use {target} equivalents)`,
    render: `- Chemical formulas, subscripts, charges, coefficients, reaction arrows and conditions stay pixel-identical`,
  },

  biology: {
    name: 'Biology',
    ocr: String.raw`- Latin species/genus names: copy exactly as printed
- Genetics notation is math: $AaBb$, $P$, $F_1$, $F_2$, ♀, ♂, \times, ratios 3:1, 9:3:3:1
- Russian abbreviations (ДНК, РНК, иРНК, тРНК, АТФ) are text — copy exactly
- Diagram callouts: one block per label`,
    translate: `- Abbreviations to the {target} standard — English: ДНК→DNA, РНК→RNA, иРНК→mRNA, тРНК→tRNA, АТФ→ATP; Azerbaijani: ДНК→DNT, РНК→RNT, иРНК→iRNT, тРНК→nRNT, АТФ→ATF
- Never translate Latin species names or genetics symbols`,
    render: `- Latin names, genetics symbols and diagram leader lines stay unchanged`,
  },

  general: {
    name: 'Text subjects (history, geography, language, literature)',
    ocr: `- Mostly prose: keep dates, Roman numerals (XIX век), quotes, proper names and map labels exactly
- Use $...$ only for real formulas or numeric expressions`,
    translate: `- Translate naturally with the subject's standard {target} terminology
- Proper names and places: use the established {target} form, otherwise transliterate`,
    render: `- Map labels, dates and numbers keep their positions`,
  },
};

export const SUBJECT_IDS = Object.keys(SUBJECTS);

export const resolveSubject = (value) =>
  typeof value === 'string' && SUBJECTS[value] ? value : 'auto';

/** Subject rules for one pipeline stage, with {target} filled in */
export const getSubjectRules = (subject, stage, targetLanguageName = 'the target language') => {
  const entry = SUBJECTS[resolveSubject(subject)];
  return {
    name: entry.name,
    rules: entry[stage].replace(/\{target\}/g, targetLanguageName),
  };
};
