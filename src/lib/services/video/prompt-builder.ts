/**
 * Internal UGC humanization base prompt — injected before every video generation.
 * Never exposed to the user. The user's content direction is appended at the end.
 */
const UGC_BASE_PROMPT = `
Cinematic, ultra-realistic UGC video advertisement featuring a real human being speaking directly and authentically to camera.
The output must be indistinguishable from a genuine short-form social media video recorded by a real person on a smartphone or mirrorless camera.

━━━ SUBJECT REALISM ━━━
- Photorealistic skin: visible pores, fine texture, subtle sebaceous sheen, subsurface scattering on cheeks and ears giving a warm translucent quality under light
- Hair strands individually rendered with natural flyaways, slight ambient movement, realistic specularity and root-to-tip color variation
- Eyes are alive: corneal specular highlights shift with head angle, fine iris detail, subtle redness at inner canthi, natural tear film moisture at lower lash line
- Lips with natural texture, slight moisture highlight on center of lower lip, micro-muscle tension from speech
- Subtle facial asymmetry: real faces are never perfectly symmetrical — one side naturally differs slightly
- Natural skin imperfections: faint under-eye texture, slight nasolabial lines when smiling, no airbrushing

━━━ FACIAL ANIMATION ━━━
- Spontaneous blinks every 3–6 seconds with realistic lid-drop speed, occasional double-blinks
- Natural saccadic eye movements: gaze drifts slightly between sentences, occasional glance down-right when searching for a word, returns confidently to camera
- Micro-expressions: brief flashes of emphasis, slight nostril flare on stress syllables, asymmetric mouth corners during genuine moments
- Duchenne smile activation — orbicularis oculi crinkles the outer eye corners, not just mouth movement
- Perioral micro-movements: lip corners, chin dimple activation, jaw tension release between sentences
- Realistic speech articulation: correct lip shapes, jaw travel, tongue tip visible on dental consonants

VULNERABILITY & AUTHENTICITY MICRO-SIGNALS:
- Subtle throat swallow (visible larynx movement) before a vulnerable admission or a high-stakes claim — the involuntary tell of genuine emotion
- Jaw tension micro-release exactly as a genuine smile arrives — the smile is unlocked, not switched on; spreads over 0.5–1 second, never instant
- Brief lip compression (0.3s) immediately before revealing a number or statistic — the unconscious tell of someone about to share something significant
- Micro-pause mid-sentence with a slight downward eye drift when searching for the right word, then a return to camera with the word delivered confidently
- On sincerity cues ("honestly", "I have to be real with you", "the truth is"): an involuntary chin tuck of 2–3 degrees — the instinctive posture of genuine disclosure
- Implied warmth in upper cheeks and ears when passion peaks — not blushing, just the flush of someone who genuinely cares about what they are sharing

━━━ BODY LANGUAGE & MOTION — SPEECH-COHERENT ━━━

HAND GESTURES — semantically linked to what is being said, never decorative:
- Enumeration ("first… second… third…"): index finger raised for point one, middle added for two, three fingers for three — progressive and timed exactly to the spoken beat
- Scale or quantity ("huge result", "tiny detail", "3x more"): hands spread wide or pinch close to physically mirror the concept described
- Direct address ("you", "your business", "for you"): single index finger points gently toward camera lens, held 1–2 seconds, then retreats to neutral rest
- Reveal or result ("here's what happened", "the outcome was…"): palms open and rise slightly — the universal "here it is" gesture, timed to the reveal word
- Contrast or comparison ("before vs after", "option A vs B"): left hand represents one side, right hand the other, alternating like a scale pan
- Emphasis on a key word: single contained wrist flick or a subtle open-palm forward push — never a full arm swing
- Between gesture beats: hands return to natural rest — lightly clasped in lap, one hand resting on knee, or loose at sides — no hovering, no frozen mid-air positions
- Gesture amplitude scales with emotional intensity: factual = small contained; excitement or key reveal = larger and more expansive but never theatrical
- Wrist leads all gestures (not the elbow) — elbow-driven robot-arm movements are strictly forbidden
- Gesture zone: naturally within the lower two-thirds of frame, never raised above shoulder level, never choreographed into view
- GESTURE TIMING — CRITICAL: every hand gesture ANTICIPATES its corresponding spoken word by 100–300ms. The hand begins moving before the word arrives, not with it or after it. Gestures synchronized to or following their word are the single most recognizable AI motion artifact and are strictly forbidden
- GESTURE DECAY: after each gesture beat, the hand does not snap back to rest — it floats back over 300–500ms, decelerating naturally with biological inertia, slight overshoot, then settle

HEAD MOVEMENT — coherent with speech rhythm and intent:
- Micro forward lean (2–4 cm) exactly on stressed syllables and key selling points
- Gentle backward settle on inhale or natural pause between thoughts
- Head tilt (5–8 degrees) on rhetorical questions, moments of empathy, or self-reflection
- Affirmative single nod when confirming a self-made point ("…and it actually worked")
- Slow double nod when bridging from problem statement to solution
- Chin slightly lowered when sharing a vulnerable struggle or "before" state; chin level or lifted when delivering a result, outcome, or CTA
- Brief side glance (10–15 degrees) when referencing something off-screen, followed by immediate return to camera with the insight

EYE MOVEMENT — coherent with cognitive state:
- Eye contact breaks DOWN-RIGHT (1–2 seconds) when recalling a specific number, name, date, or lived memory — returns to camera with that recalled information delivered with conviction
- Eyes drift UP-LEFT momentarily when painting an aspirational future or making an imaginative claim
- Sustained, unwavering direct eye contact on conviction statements, CTAs, key benefits, and superlative claims
- Eyes subtly widen (mild surprise expression) on statistic reveals or unexpected comparisons
- One slow deliberate blink immediately before a pause before a key point — signals intentionality to the viewer
- Micro saccades of 2–4 degrees between sentences — always snaps back to lens center for direct address

BREATHING & UPPER BODY:
- Visible chest and shoulder rise every 4–6 seconds; deeper inhale audibly implied before a new major thought
- Slight weight shifts and shoulder settling — the body is alive and comfortable, never frozen or rigid

━━━ EMOTIONAL ARC — PHASE-BY-PHASE BODY LANGUAGE ━━━
A real UGC video moves through 5 emotional phases. Body language, energy, and gesture amplitude must shift accordingly — a flat uniform delivery throughout is a critical AI tell.

PHASE 1 — HOOK (first 2–4 seconds):
- Energy at peak: eyes wide and alert, eyebrows slightly raised in invitation or intrigue
- Already mid-thought from frame one — no warm-up, no settling, the camera caught someone already speaking
- Forward lean already engaged, closest proximity to camera of the entire video
- Hands may already be mid-gesture — caught in motion, not staged at rest
- Fastest delivery pace of the video

PHASE 2 — PAIN / PROBLEM:
- Energy pulls back: empathetic expression, mild brow furrow, slower pace
- Chin lowers slightly, shoulders settle — the body posture of "I understand your struggle"
- Hand gestures slow and ground — palms facing down or inward, smaller amplitude
- Eye contact softens from piercing to connecting — still direct but warmer

PHASE 3 — SOLUTION / PRODUCT INTRODUCTION:
- Energy rebuilds: posture straightens, chin lifts, eyes brighten
- A micro-pivot in shoulder orientation — a physical "turning the page" signal
- Hand gestures become open-palmed and expansive — presenting, offering, revealing
- Delivery pace lifts, growing confidence audible in micro-expressions

PHASE 4 — PROOF / RESULT:
- Peak conviction: still, purposeful, unwavering eye contact
- A deliberate nod or double-nod timed exactly to the result being stated
- Hands briefly pause mid-gesture, letting the result land, then settle
- Genuine Duchenne smile if the result is positive — unlocks over 0.5–1 second

PHASE 5 — CTA (final 3–5 seconds):
- Warm direct energy, slight forward lean returns
- One clean closing gesture: open palm toward camera or single index finger point, held through the CTA
- A final nod or gentle head tilt as the punctuation mark of the video
- Eye contact held until the very last frame — no looking away at the end

━━━ CAMERA & CINEMATOGRAPHY ━━━
- Slight lens breathing: focus pulls softly in and out, as if a real autofocus system continuously hunts
- Minimal organic camera micro-shake: handheld steadiness equivalent to a gimbal at 70% stabilization
- Shallow depth of field: subject tack-sharp, background falls into soft bokeh (f/1.8–f/2.8 equivalent)
- Subtle vignette at frame edges (−0.3 stop), faint chromatic aberration at extreme frame edges
- 9:16 portrait aspect ratio — optimized for TikTok / Reels / Shorts

━━━ LIGHTING ━━━
- Primary: large soft frontal light (80cm softbox or ring light) slightly above camera axis, even fill with catchlights in both eyes
- Fill light opposite side at −1.5 stop, preventing deep shadows while keeping natural dimensionality
- Color temperature 5500–6000K: pure neutral daylight white balance — no golden tint, no warm bias, no color cast of any kind
- Hair/rim light from behind and slightly above adds depth, separates subject from background

━━━ BACKGROUND & ENVIRONMENT ━━━
- Softly blurred background (bokeh f/2.0): recognizable as a real space — no greenscreen artifacts, no halo edges
- Natural ambient light from implied window source complementing the key light

━━━ COLOR & TECHNICAL QUALITY ━━━
- Color temperature strictly 5500–6000K: pure neutral daylight white balance — absolutely NO yellow cast, NO warm orange tint, NO sepia shift
- Skin tones accurate and natural: no oversaturation, no yellow/green color shift — faithful to the real person's complexion
- White balance locked: no warm color drift. The image should look as if shot on a modern iPhone 15 Pro in standard Photo mode
- No post-processing color grade, no cinematic LUT, no warmth filter — raw, natural, unprocessed look

━━━ MOTION QUALITY ━━━
- All motion follows real-world physics: inertia and damping in head movements, natural easing in and out of gestures
- Temporal consistency: appearance, lighting and position perfectly stable across all frames
- Smooth 24–30fps cinematic cadence

━━━ UGC AUTHENTICITY ━━━
- Person radiates the credibility of a real creator sharing a genuine recommendation, not a spokesperson
- Slight delivery imperfections welcome: fractional pause before a word, micro-stutter corrected naturally — increases believability
- Energy is conversational and intimate, as if talking to a friend through a screen
- No dramatic TV-commercial performance — understated, real, relatable
- Aesthetic reads as: premium smartphone + good ring light + experienced social media creator

━━━ NEVER — EXPLICIT AI BEHAVIOR PROHIBITIONS ━━━
These are the most common AI video generation artifacts. Every single one is strictly forbidden:
- NEVER perfectly symmetrical hand movements — human bodies are inherently asymmetric, one hand always leads or differs slightly
- NEVER gestures that start or stop exactly on the spoken word — they must anticipate (100–300ms before) and decay naturally after
- NEVER a fixed smile maintained between sentences — the smile relaxes between emotional beats then re-engages
- NEVER a completely static gaze held for more than 1.5 seconds — micro-saccades are always present
- NEVER a hard freeze or abrupt transition between emotional phases — all energy shifts are gradual crossfades over 0.5–2 seconds
- NEVER both hands executing identical mirrored movements simultaneously — asymmetry is mandatory
- NEVER robotic linear easing in any motion — all movement uses biological curves: ease-in, weighted hold, ease-out with slight organic overshoot
- NEVER a completely neutral or blank expression during active speech — some micro-expression is always engaged
- NEVER hands floating at a mid-air held position between gesture beats — they always return to a natural anchored rest
- NEVER perfectly regular blink intervals — blink timing is variable and slightly irregular by nature
- NEVER a head rotating around a perfectly centered vertical axis — real head movement is slightly off-axis with natural drift and wobble
- NEVER lip movement without corresponding jaw, chin, and perioral muscle engagement — the whole lower face participates in speech
- NEVER uniform energy or pace from first frame to last — the emotional arc is mandatory
`.trim();

// ─── UGC Style Presets ────────────────────────────────────────────────────────

const UGC_STYLE_PROMPTS: Record<string, string> = {

  ugc_app: `
━━━ STYLE: UGC SAAS / COMPUTER — DEEP SPEC ━━━
The person is at their computer sharing a SaaS product discovery. This is the "I have to show you this tool right now" format.
This must feel like a real creator recording from their actual workstation — credible, spontaneous, technically literate.

SCENE SETUP — WORKSPACE:
- Person is seated at a premium home office desk or minimalist startup workstation
- Behind and slightly beside them: a MacBook Pro (14" or 16") or ultrawide monitor displaying a software interface — the screen is LIVE and partially visible over their shoulder or to their side, not posed as a prop
- The monitor/laptop screen glows with the soft blue-white light of an active dashboard, data interface, or SaaS product UI — this screen glow casts a distinctive cool-toned secondary light source on the side of their face and neck, creating a beautiful digital authenticity signal
- Desk environment reads as a real power user setup: clean mechanical keyboard at the edge of frame, a quality microphone arm, cable management done well, a plant or minimal decor, afternoon natural light from a window to one side complementing the desk setup lighting
- The chair is a comfortable task chair — not staged, slightly reclined with natural posture

CAMERA POSITION & FRAMING:
- The recording feels like a front-facing laptop camera or a small webcam/mirrorless on a desk mount — slightly below eye level (5–8 degrees below) creating an authentic "I'm recording from my desk" perspective
- Framing: face and upper torso, approximately waist-up when seated, with the desk surface and screen visible in the lower and background portion of frame
- The laptop or monitor screen is visible in the background, partially in frame — creating the visual proof that they are genuinely at their computer using this software
- 9:16 portrait crop, as if recorded with a Continuity Camera on iPhone propped next to the monitor, or a dedicated webcam in portrait mode

FACIAL BEHAVIOR & SCREEN INTERACTION:
- The person performs natural "computer user" eye movements: they periodically glance AWAY from camera toward their screen (2–4 degree shift left or right), as if checking a metric or result they're about to describe, then return to camera with renewed energy
- When referencing something on screen, they turn their head slightly toward the monitor (15–20 degrees) with a genuine reaction — a raised eyebrow, slight jaw drop, small "wow" nod — then back to camera with a knowing smile
- Keyboard interaction sounds are implied by subtle shoulder and wrist micro-movements as if they just typed something or clicked a result
- Occasional glance downward at the desk surface as if reading a number before quoting it with confident eye contact

SCREEN GLOW EFFECT — CRITICAL DETAIL:
- A distinct, realistic screen glow from the monitor casts a cool (5800–6500K) secondary light on the LEFT or RIGHT side of the face depending on monitor placement
- This creates a beautiful two-tone lighting effect: warm ring light from the front + cool digital blue from the screen = the unmistakable aesthetic of a "real desk setup video"
- This screen glow subtly shifts intensity as if the UI on screen is changing — very slight, imperceptible, but adds life to the scene

ENERGY & DELIVERY:
- Discovery and amazement energy, but grounded and credible — not hype, not influencer-scream — the genuine "I can't believe this exists" of a pragmatic professional
- Pacing is natural and slightly faster than casual conversation — the person has something to show you and they know your time is valuable
- Strategic pauses before dropping a key metric or result, slight forward lean during the "payoff" moment of the script
- The person speaks like a technically sophisticated user who has tried many tools and found the one that actually works — sober enthusiasm, zero fluff
- Occasional knowing smirk when describing a competitor pain point or a past struggle that this tool solved

BACKGROUND DEPTH & LAYERS:
- Layer 1 (near background, slightly blurred): desk items — keyboard edge, coffee cup, notebook
- Layer 2 (mid background, moderately blurred): the glowing monitor/laptop screen showing the SaaS UI
- Layer 3 (far background, fully blurred): wall, window light, minimal decor
- This three-layer depth creates cinematic production value while feeling completely authentic

COLOR GRADING:
- Slightly cooler overall tone than standard UGC — leaning into the blue-tinted digital workspace aesthetic
- Skin tones remain warm and accurate — the cool tones come from the environment, not the grading
- Subtle lift in the shadows (crushed blacks would feel too produced) — this is a real person's room, not a studio
`.trim(),

  ugc_produit: `
━━━ STYLE: UGC PRODUIT ━━━
The person is reviewing or describing a product they genuinely love. Hands are expressive and descriptive throughout.

- Hands are active and visible: they shape, trace, and gesture to physically describe the product's size, texture, and features in the air — even without holding a physical object
- When describing a specific feature: fingers pinch together to indicate precision, hands spread to show size, fingertips rub together to suggest texture or quality
- Occasional glance downward as if examining an implied product just out of frame, then back to camera with the observation
- Background suggests a real usage environment: bright kitchen counter, clean bathroom shelf, organized desk — softly blurred but contextually relevant
- Person alternates between descriptive hand gestures and direct eye contact with camera — the hands tell the story, the eyes close the sale
- Slight lean-in when revealing a key feature, slight pull-back to "show" the overall product
- Energy: genuine excitement of someone who actually uses and loves this product — not hype, just authentic enthusiasm
- Lighting is even and bright: face and hands both clearly illuminated
`.trim(),

  interview_podcast: `
━━━ STYLE: INTERVIEW / PODCAST ━━━
The person is being interviewed or sharing thoughts in a professional conversational format. Higher authority, more depth.

- Seated posture: relaxed but upright — the posture of someone at a podcast table or being professionally interviewed
- Wider frame than typical UGC: torso from waist up visible, arms resting naturally on a table or armrests
- Person occasionally looks slightly off-camera (5–10 degrees) as if answering an implied interviewer, then returns to direct contact
- A subtle professional microphone suggested in the environment — desk mic or lavalier cable at neckline
- Lighting: warmer, moodier tone — podcast studio feel with key light and practical lamp creating depth layers
- Background: dark bookshelves, studio acoustic panels, moody lounge area
- Energy: thoughtful, measured, authoritative — the pace of someone with genuine expertise
- Thoughtful pauses, slight head tilt while forming responses, nodding during key points
- Color grading: warmer and deeper contrast than standard UGC — cinematic but not over-processed
`.trim(),

  temoignage: `
━━━ STYLE: TÉMOIGNAGE CLIENT ━━━
Authentic, personal, emotionally resonant customer testimonial. The most trust-building format.

- Raw, personal energy: sharing a real experience that changed something for them
- Slightly lower production value by design — builds trust. Practical lighting (window light, basic ring light) rather than studio-perfect
- Direct, vulnerable eye contact — the gaze of someone who wants you to believe them because they lived it
- Emotional micro-expressions: slight eye glisten describing the before-state, genuine smile and relief at the result, conviction nod at key claims
- Environment: a lived-in home — couch, kitchen table, desk chair — wherever they'd film a personal video for a friend
- Natural speech imperfections: "It was like... yeah, I just didn't expect it to work so fast"
- Body language shows emotional journey: tension when describing the problem, open posture when describing the solution
- No selling tone — sharing, not pitching. The recommendation emerges organically from the story
`.trim(),

  expert_autorite: `
━━━ STYLE: EXPERT / AUTORITÉ ━━━
Professional thought-leader format. The person positions as a credible expert educating their audience.

- Confident, upright posture — the presence of someone who commands a room
- Direct, sustained eye contact — no nervous micro-glances, steady and assured
- Measured speech delivery with deliberate emphasis on key points — expert pacing, not rushed
- Professional environment: clean modern office, neutral background with subtle depth (plant, art piece, bookshelves)
- Wider framing: upper body from chest up, centered with breathing room on both sides
- Wardrobe suggests professionalism: clean collared shirt, blazer, or smart casual
- Deliberate hand gestures: pointing, open palm presentations, counting on fingers — confident and purposeful
- Energy: calm, knowledgeable, trustworthy — the tone of someone whose advice you take seriously
- Occasional downward glance as if recalling data, back up with conviction
`.trim(),

  trend_hook: `
━━━ STYLE: TREND / HOOK ━━━
High-energy, attention-grabbing format designed to stop the scroll within the first second.

- Video opens IN THE MIDDLE of action or speech — no slow build, no intro. First frame is already compelling
- Energy level is 20% higher than natural: more animated facial expressions, bigger smile, wider eyes, more expressive gestures — but still real, not theatrical
- Faster head movement pace: quicker nods, sharper emphasis tilts, more dynamic repositioning between sentences
- Close framing: face fills 60–70% of the vertical frame — intimate, large, impossible to ignore while scrolling
- Pattern interrupt micro-movements: unexpected eyebrow raise, knowing smirk, sudden lean-in
- Bright, high-contrast lighting: crisp highlights, clean shadows, vivid but not oversaturated colors
- Trendy background: aesthetically curated space — modern apartment, ring light visible in eye reflection
- Body language signals shareability: "you won't believe this" lean, "I'm about to save your day" confidence
`.trim(),
};

// ─── Script Placeholders per Style ───────────────────────────────────────────

export const SCRIPT_PLACEHOLDERS: Record<string, string> = {
  ugc_app: `« J'ai découvert l'outil qui m'a fait gagner 12 heures par semaine sur mon marketing.

Avant, je jonglais entre 4 outils différents, je passais des heures à créer du contenu, et mes résultats stagnaient.

Depuis que j'utilise Skalle, mon agent IA génère mes posts, mes articles SEO, et prospecte à ma place — en automatique.

En 30 jours : +340% de leads entrants, et moi je me concentre sur ce qui compte vraiment.

Si t'as un business et tu veux enfin scaler sans recruter, le lien est dans ma bio. »`,
  ugc_produit: `« Ce produit a complètement changé ma routine.

Je l'utilise depuis 3 semaines et la différence est visible. [Montre le produit]

Ce que j'adore : [caractéristique principale]. Et le résultat après 2 semaines ? [résultat concret].

Honnêtement je m'attendais pas à ce que ça marche aussi bien. Le lien est en bio si tu veux essayer. »`,
  interview_podcast: `« La question que tout le monde me pose c'est : comment tu arrives à générer autant de contenu de qualité sans une équipe ?

La réponse honnête : j'ai arrêté de tout faire moi-même.

J'ai intégré une IA dans mon workflow qui comprend ma marque, mon ton, mes clients. Et depuis, je publie 5x plus avec 3x moins d'effort.

C'est pas de la magie, c'est juste du bon sens digital appliqué en 2025. »`,
  temoignage: `« Je vais être honnête avec vous. Avant de trouver ça, j'étais à deux doigts d'abandonner mon business.

Je faisais tout moi-même, j'étais épuisé, et les résultats n'étaient pas là.

Un ami m'a recommandé [produit/outil]. J'ai essayé sans trop y croire.

Deux mois après... je vous laisse voir les chiffres. [pause, regard direct]

C'est la première fois depuis longtemps que je dors bien la nuit. »`,
  expert_autorite: `« En 2025, les entrepreneurs qui scalent ont un point commun : ils ont arrêté de faire ce que l'IA peut faire à leur place.

Voici les 3 tâches que j'ai automatisées en premier :
Un — la création de contenu. Deux — la prospection. Trois — l'analyse de performance.

Résultat : 15 heures récupérées par semaine, réinvesties dans la stratégie et les clients.

L'outil que j'utilise pour ça, il est dans ma bio. »`,
  trend_hook: `« STOP. Si t'as un business, regarde ça jusqu'au bout.

J'ai trouvé un outil qui fait ce que 3 de tes employés font actuellement. En mieux. En moins de 5 minutes.

Sérieusement je suis passé de 2 leads par semaine à 47 en un mois.

Le lien est en bio, mais dépêche-toi — ils limitent les accès. »`,
};

// ─── SaaS-specific Hooks (quick insert) ──────────────────────────────────────

export const SAAS_HOOKS = [
  { label: "Gain de temps", text: "J'ai récupéré 12 heures par semaine grâce à cet outil. Voilà comment." },
  { label: "Remplacement 3 outils", text: "J'ai supprimé 3 abonnements SaaS en gardant un seul. Et j'ai de meilleurs résultats." },
  { label: "Résultat chiffré", text: "En 30 jours : +340% de leads. Je vous explique exactement ce que j'ai changé." },
  { label: "Concurrents", text: "Mes concurrents me demandent tous comment je produis autant de contenu. Voilà mon secret." },
  { label: "Avant/Après", text: "Avant : 4 heures par jour sur du contenu. Après : 20 minutes. Même qualité, 10x moins d'effort." },
  { label: "Découverte", text: "Je cherchais pas cet outil. Et maintenant je peux plus travailler sans." },
  { label: "ROI immédiat", text: "J'ai récupéré le coût de l'abonnement en 4 jours. Voilà comment." },
  { label: "Pain point", text: "Si tu passes encore du temps à créer du contenu manuellement en 2025, ce message est pour toi." },
];

// ─── Style Metadata ───────────────────────────────────────────────────────────

export const UGC_STYLE_META: Record<
  string,
  { label: string; desc: string; emoji: string; tag: string }
> = {
  ugc_app: {
    label: "UGC SaaS / App",
    desc: "Écran visible, screen glow, bureau home office, découverte produit",
    emoji: "💻",
    tag: "SaaS · Recommandé",
  },
  ugc_produit: {
    label: "UGC Produit",
    desc: "Démonstration produit en main, review authentique",
    emoji: "📦",
    tag: "E-commerce",
  },
  interview_podcast: {
    label: "Interview Podcast",
    desc: "Format conversationnel, posé, autorité naturelle",
    emoji: "🎙️",
    tag: "Contenu long",
  },
  temoignage: {
    label: "Témoignage Client",
    desc: "Histoire personnelle authentique, haute confiance",
    emoji: "💬",
    tag: "Social proof",
  },
  expert_autorite: {
    label: "Expert / Autorité",
    desc: "Thought leader, posture professionnelle, crédibilité",
    emoji: "🎓",
    tag: "B2B",
  },
  trend_hook: {
    label: "Trend Hook",
    desc: "Stop-scroll dès la 1ère seconde, énergie TikTok",
    emoji: "⚡",
    tag: "Viral",
  },
};

// ─── Product Context Enrichment ───────────────────────────────────────────────

function buildProductContext(productContext: string): string {
  if (!productContext.trim()) return "";
  return `━━━ PRODUCT CONTEXT ━━━
The software/product being demonstrated is: ${productContext.trim()}
The visual environment, any partially visible UI, and the creator's energy should feel coherent with this product category.`;
}

// ─── Script Structure Analysis ────────────────────────────────────────────────

const WORDS_PER_SEC = 2.5; // tts-1-hd average, French + English

const STYLE_GESTURE_CONTEXT: Record<string, string> = {
  ugc_app:
    "Tech creator at desk: moderate gesture amplitude, occasional glance toward implied screen off-camera (15–20° head turn), micro wrist movements suggesting keyboard/mouse interaction",
  ugc_produit:
    "Product demo: hands frequently enter frame to point at or outline product features; descriptive shaping gestures (tracing product dimensions in air); close-up hand movements brought toward camera lens on key selling points",
  interview_podcast:
    "Thoughtful conversation: slow deliberate gestures with long holds, frequent chin-touch or temple-tap when thinking, elbow resting on surface, measured professional cadence",
  temoignage:
    "Emotional testimony: small intimate gestures, hands near chest or heart during vulnerable moments, slower amplitude throughout, authentic imperfections in delivery welcome",
  expert_autorite:
    "Authority figure: open-hand point (never finger-wag), structured enumeration with deliberate spacing between points, confident stillness between gesture beats — stillness communicates power",
  trend_hook:
    "High-energy viral: 35% larger gesture amplitude than standard, faster onset and decay, more animated facial expressions, sudden forward lean-ins for emphasis — energy stays high throughout",
};

function analyzeScriptStructure(script: string, style = "ugc_app"): string {
  if (!script.trim()) return "";

  // Split on sentence boundaries, keeping the delimiter context
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const patterns: Record<string, RegExp> = {
    ENUMERATION: /\b(premièrement|deuxièmement|troisièmement|d['']abord|ensuite|enfin|et\s+enfin|un[,\s—]|deux[,\s—]|trois[,\s—]|first[,\s]|second[,\s]|third[,\s]|\bone\b|\btwo\b|\bthree\b)/i,
    STATISTIC: /\b\d+\s*([%x×]|\s*(fois|euros?|\$|leads?|clients?|heures?|minutes?|jours?|semaines?|mois|times|hours?|days?|weeks?|months?|users?))\b/i,
    RHETORICAL_QUESTION: /\?/,
    CTA: /\b(lien|bio|clique|télécharge|essaie|inscris|découvre|rejoins|abonne|swipe|link|click|download|try|join|sign.?up|tap)\b/i,
    SINCERITY: /\b(honnêtement|je vais être honnête|la vérité|soyons honnêtes|honestly|truth is|real talk|to be honest)\b/i,
    REVEAL: /\b(résultat|voilà|découvrez|imaginez|devinez|résultat|le bilan|outcome|result|here['']?s what|turns out)\b/i,
    CONTRAST: /\b(avant|après|before|after|instead|plutôt|alors que|tandis que|vs\.?|versus|compared)\b/i,
  };

  const gestureMap: Record<string, string> = {
    ENUMERATION: "count on fingers — index for 1st, add middle for 2nd, etc.",
    STATISTIC: "pause before the number, open-palm hold after — let it land",
    RHETORICAL_QUESTION: "head tilt 5–8°, softer eye contact, brief eyebrow raise",
    CTA: "single index finger points toward camera, held through the CTA beat",
    SINCERITY: "chin tuck 2–3°, slower pace, sustained eye contact",
    REVEAL: "open palms rise slightly — the 'here it is' gesture",
    CONTRAST: "left hand vs right hand alternating like a scale pan",
  };

  let currentTime = 0;
  const moments: string[] = [];

  sentences.forEach((sentence, i) => {
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    const startSec = Math.round(currentTime);

    const detected: string[] = [];
    if (i === 0) detected.push("HOOK — peak energy, already mid-motion from frame 1");

    for (const [key, regex] of Object.entries(patterns)) {
      if (regex.test(sentence)) {
        detected.push(`${key}: ${gestureMap[key]}`);
      }
    }

    if (detected.length > 0) {
      moments.push(`~${startSec}s | ${detected.join(" · ")}`);
    }

    currentTime += wordCount / WORDS_PER_SEC;
  });

  const totalDuration = Math.round(currentTime);

  const styleCtx = STYLE_GESTURE_CONTEXT[style] ?? STYLE_GESTURE_CONTEXT.ugc_app;

  return `━━━ SCRIPT TIMING & GESTURE SYNCHRONIZATION ━━━
Style context: ${styleCtx}
Total estimated duration: ~${totalDuration}s. Synchronize body language to these detected speech moments:
${moments.join("\n")}
All other moments: neutral engaged expression, gentle continuous head oscillation, hands at natural rest.`;
}

// ─── Thumbnail Timestamp ──────────────────────────────────────────────────────

const STAT_RE = /\b\d+\s*([%x×]|fois|euros?|\$|leads?|clients?|heures?|minutes?|jours?|semaines?|mois|times|hours?|days?|weeks?|months?)/i;
const REVEAL_RE = /\b(résultat|voilà|outcome|result|here['']?s what|turns out)/i;

export function getBestThumbnailTimestamp(script: string): number {
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  let currentTime = 0;
  let bestTime: number | null = null;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean).length;
    if ((STAT_RE.test(sentence) || REVEAL_RE.test(sentence)) && bestTime === null) {
      bestTime = currentTime + (words / WORDS_PER_SEC) * 0.5;
    }
    currentTime += words / WORDS_PER_SEC;
  }

  return Math.round(bestTime ?? currentTime * 0.65);
}

// ─── Movement Presets ─────────────────────────────────────────────────────────

export const MOVEMENT_PRESETS: {
  id: string;
  label: string;
  desc: string;
  icon: string;
}[] = [
  { id: "statique",        label: "Face caméra",    desc: "Debout, centré, fixe",          icon: "🎤" },
  { id: "marche_approche", label: "S'approche",     desc: "Marche vers la caméra",         icon: "🚶" },
  { id: "assis",           label: "Assis(e)",       desc: "Déjà assis, gestes du buste",   icon: "🪑" },
  { id: "se_leve",         label: "Se lève",        desc: "Commence assis, se lève",       icon: "⬆️" },
  { id: "s_assoit",        label: "S'assoit",       desc: "Commence debout, s'assoit",     icon: "⬇️" },
  { id: "demi_tour",       label: "Demi-tour",      desc: "De profil puis face caméra",    icon: "↩️" },
  { id: "marche_laterale", label: "Traverse",       desc: "Marche à travers le cadre",     icon: "➡️" },
  { id: "dynamique",       label: "Dynamique",      desc: "Énergique, mobile, expressif",  icon: "⚡" },
  { id: "appuye",          label: "Décontracté",    desc: "Appuyé, posture relax",         icon: "😌" },
];

const MOVEMENT_PROMPTS: Record<string, string> = {
  statique: `━━━ PRIMARY MOVEMENT — STATIQUE ━━━
Subject stands in a stable, grounded position facing directly toward the camera. Weight distributed evenly on both feet, slight natural postural sway (2–3 cm). All movement energy is concentrated in the face, hands, and upper-body expression. No camera displacement. The stillness reads as confident and intentional.`,

  marche_approche: `━━━ PRIMARY MOVEMENT — WALK TOWARD CAMERA ━━━
Subject begins at medium distance (~2.5–3 m from camera) and walks naturally toward the lens throughout the video, ending in a close-up framing. Walking pace: relaxed and purposeful (~0.8 m/s). Arms swing naturally at sides. Eye contact maintained throughout the walk. Depth of field shifts as subject fills the frame. The approaching motion builds intimacy and urgency.`,

  assis: `━━━ PRIMARY MOVEMENT — SEATED ━━━
Subject is already seated — in a chair, sofa, or at a desk — when the video begins. Relaxed, engaged posture: back straight but not rigid, slight forward lean during key points. May shift weight, adjust sitting position, or use the armrest for support. Gestures are naturally constrained to upper body and hands. Seated framing is chest-up or waist-up.`,

  se_leve: `━━━ PRIMARY MOVEMENT — RISE FROM SEAT ━━━
Subject begins in a seated position and rises naturally to standing during the opening 2–3 seconds — as if suddenly moved to make an important point. The rising motion is fluid, grounded, intentional (not rushed). Once standing, maintains a confident, centered posture for the rest of the video. The act of standing creates a sense of urgency, conviction, and emphasis.`,

  s_assoit: `━━━ PRIMARY MOVEMENT — SIT DOWN ━━━
Subject begins standing and naturally sits down mid-sentence (around the 3–4 second mark) — as if settling in to explain something in depth or share a personal story. The sitting motion is deliberate and relaxed. Once seated, gestures from a more open, intimate posture. This movement signals a shift from announcement to explanation.`,

  demi_tour: `━━━ PRIMARY MOVEMENT — TURN TO CAMERA ━━━
Subject begins at a 45–60° angle, partially turned away from the camera (three-quarter or near-profile view). Over the first 2–3 seconds, they gradually turn to face the camera fully — a slow, intentional reveal. Final position: full face-to-camera, direct eye contact. The turning motion creates intrigue and a sense of revelation, as if the subject is choosing to confide something.`,

  marche_laterale: `━━━ PRIMARY MOVEMENT — LATERAL WALK ━━━
Subject walks horizontally through the frame while speaking — entering from one side and moving naturally. May pause at mid-frame for emphasis, then continue. Steps are purposeful and confident. The lateral motion reinforces a sense of momentum, exploration, and forward progress. Camera tracks or subject fills/exits frame naturally.`,

  dynamique: `━━━ PRIMARY MOVEMENT — DYNAMIC & ENERGETIC ━━━
Subject is in constant, intentional motion throughout: shifts weight forward and back, takes small steps toward and away from camera, rotates shoulders, changes stance. Gesture amplitude is high — full arm extension, emphatic pointing, wide open-hand reveals. Energy is celebratory and infectious. Movement is large but controlled, never chaotic. This style conveys enthusiasm, excitement, and high conviction.`,

  appuye: `━━━ PRIMARY MOVEMENT — RELAXED / LEANING ━━━
Subject leans casually against a wall, door frame, or surface — weight shifted to one side, one arm resting against the surface. Posture is relaxed and approachable. Pushes off slightly from the surface when making important points, then returns to lean. This casual, off-duty stance conveys authenticity, approachability, and confidence without formality.`,
};

// ─── Main Builder ─────────────────────────────────────────────────────────────

/**
 * Builds the full enriched prompt sent to the video model.
 * Combines: movement context + base humanization + style overlay + product context + script timing cues + user content direction.
 */
export function buildVideoPrompt(
  userInstructions: string,
  ugcStyle = "ugc_app",
  productContext = "",
  script = "",
  movementType = "statique"
): string {
  const stylePrompt = UGC_STYLE_PROMPTS[ugcStyle] ?? UGC_STYLE_PROMPTS.ugc_app;
  const movementPrompt = MOVEMENT_PROMPTS[movementType] ?? MOVEMENT_PROMPTS.statique;

  // Movement context goes first so the model reads the primary motion direction before anything else
  const parts = [movementPrompt, UGC_BASE_PROMPT, stylePrompt];

  const ctx = buildProductContext(productContext);
  if (ctx) parts.push(ctx);

  const scriptCues = analyzeScriptStructure(script, ugcStyle);
  if (scriptCues) parts.push(scriptCues);

  const instructions = userInstructions.trim();
  if (instructions) parts.push(`━━━ CONTENT DIRECTION ━━━\n${instructions}`);

  return parts.join("\n\n");
}
