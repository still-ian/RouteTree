const express = require('express');
const requireAuth = require('../lib/requireAuth');
const getPlanStatus = require('../lib/planStatus');

const router = express.Router();

const AI_SYSTEM_PROMPT = `You convert a football play description into exact pixel coordinates for a play-diagram web app. Respond with ONLY valid JSON, no markdown fences, no commentary.

COORDINATE SYSTEM:
- Canvas is 750px wide (x: 20 = left sideline, 730 = right sideline, 375 = middle of field) by 1000px tall (y: 20 = deepest downfield, 980 = deepest backfield).
- Line of scrimmage (LOS) is fixed at y=700. Offense lines up at y>=700 (at or behind LOS). Defense lines up at y<=700, above the LOS. Offense advances toward smaller y values ("downfield"/"upfield").
- Hash marks: left hash x=290, right hash x=460, middle of field x=375. "Field side" is the wider side away from the nearest sideline to the ball; "boundary side" is the shorter side. If the ball is on the left hash, the field side is to the right (larger x); mirror if on the right hash.
- Scale: roughly 8px per yard, both directions.

OFFENSIVE LINE: unless told otherwise, always 5 players straddling the ball's x position at y=700, spaced 50px apart left to right: LT, LG, C, RG, RT.

SKILL LABELS (use these unless the description names others): QB, RB, FB, TE (or Y), Z (flanker, usually off the line, strength side), X (split end, usually on the line, weak side), H (slot/H-back), WR.

REFERENCE OFFENSIVE FORMATIONS (starting points, adapt positions/labels to the actual description):
I-Form: LT 275,700 | LG 325,700 | C 375,700 | RG 425,700 | RT 475,700 | TE 525,700 | QB 375,745 | FB 375,810 | RB 375,875 | WR1 100,700 | WR2 650,700
Shotgun: same OL/TE | QB 375,810 | RB 300,810 | WR1 75,700 | WR2 675,700 | SLOT 190,715
Singleback: same OL/TE | QB 375,745 | RB 375,810 | WR1 75,700 | WR2 675,700 | SLOT 190,715
Empty: same OL/TE | QB 375,810 | WR1 75,700 | WR2 675,700 | SL1 190,715 | SL2 575,715

REFERENCE DEFENSIVE FORMATIONS:
4-3: DE 225,650 | DT 300,650 | DT 450,650 | DE 525,650 | OLB 225,580 | MLB 375,580 | OLB 525,580 | CB 100,630 | CB 650,630 | FS 325,470 | SS 425,500
3-4: DE 275,650 | NT 375,650 | DE 475,650 | OLB 175,580 | ILB 325,580 | ILB 425,580 | OLB 575,580 | CB 100,630 | CB 650,630 | FS 325,470 | SS 425,500
Nickel: DE 250,650 | DT 325,650 | DT 425,650 | DE 500,650 | MLB 325,580 | MLB 425,580 | CB 100,630 | CB 650,630 | NB 200,610 | FS 325,470 | SS 425,500

ROUTE GLOSSARY (depth in yards, convert with ~8px/yard from the receiver's start point; "break" = a point where direction changes sharply; give each route 2-4 points):
- Slant: quick release then hard break inside at roughly 45 degrees, done by about 5 yards depth.
- Flat: shallow release toward the sideline, 2-4 yards depth.
- Out: vertical release to the stated depth then a hard 90 degree break to the sideline.
- Dig / square-in / square break: vertical release to the stated depth (commonly 12-15 yards) then a hard 90 degree break toward the middle of the field.
- Curl: vertical release around 8-12 yards then a short break back toward the QB.
- Comeback: vertical release around 12-15 yards then breaks back toward the sideline and slightly shallower.
- Post: vertical release around 10-14 yards then a 45 degree break toward the middle.
- Corner: vertical release around 10-14 yards then a 45 degree break toward the sideline.
- Seam: mostly straight vertical release up the seam between hash and numbers, minimal break, depth 15-20+ yards.
- Wheel: shallow flat release then turns upfield along the sideline.
- Go / fade / vertical / clear-out: straight line upfield, depth 20+ yards.
- Screen: short lateral or backward release near the LOS.
- Running back run/handoff paths use style "run". Offensive line and other blocking assignments use style "block" (a short line toward the man being blocked). Pre-snap movement uses style "motion".

OUTPUT JSON SHAPE (exactly these keys):
{"offense":[{"label":"LT","x":275,"y":700}],"defense":[{"label":"CB","x":100,"y":630}],"routes":[{"player":"Z","style":"pass","points":[{"x":460,"y":700},{"x":460,"y":580},{"x":375,"y":580}]}]}

RULES:
- Only fill "offense" if the description specifies/implies an offensive formation; otherwise return an empty array (leaves the current offense untouched). Same rule for "defense".
- When "offense" is non-empty it must contain all 11 offensive players. When "defense" is non-empty it must contain all 11 defensive players.
- "routes" should cover every route, run path, block, or motion mentioned, keyed to the "label" of the player running it.
- style must be exactly one of: "pass", "run", "block", "motion".
- Keep every x within 20-730 and every y within 20-980. Keep every label 5 characters or fewer.`;

router.post('/', requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Describe the play first.' });
  }

  const { hasAccess } = await getPlanStatus(req.profile);
  if (!hasAccess) {
    return res.status(402).json({ error: 'Play generation needs an active Individual or Team plan.', upgradeRequired: true });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
     model: 'claude-sonnet-5',
     max_tokens: 6000,
     system: AI_SYSTEM_PROMPT,
     messages: [{ role: 'user', content: text.trim() }]
   })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: 'The play generator is unavailable right now.' });
    }

    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || '').join('\n');
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    res.json(result);
  } catch (err) {
    console.error('AI play generation error:', err);
    res.status(500).json({ error: 'Could not generate that play. Try rewording it.' });
  }
});

module.exports = router;
