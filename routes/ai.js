const express = require('express');
const requireAuth = require('../lib/requireAuth');
const getPlanStatus = require('../lib/planStatus');

const router = express.Router();

const AI_SYSTEM_PROMPT = `You convert a football play description into exact pixel coordinates for a play-diagram web app. Respond with ONLY valid JSON, no markdown fences, no commentary before or after it.

COORDINATE SYSTEM:
- Canvas is 750px wide (x: 20 = left sideline, 730 = right sideline, 375 = middle of field) by 1000px tall (y: 20 = deepest downfield, 980 = deepest backfield).
- Line of scrimmage (LOS) is fixed at y=700. Offense lines up at y>=700 (at or behind LOS). Defense lines up at y<=700, above the LOS. Offense advances toward SMALLER y values ("downfield"/"upfield").
- Hash marks: left hash x=290, right hash x=460, middle of field x=375. "Field side" is the wider side away from the nearest sideline to the ball; "boundary side" is the shorter side. If the ball is on the left hash, the field side is to the right (larger x) and the boundary is to the left (smaller x). Mirror if the ball is on the right hash.

COORDINATE MATH (use this exactly, don't eyeball it):
- Scale is 8px per yard.
- A straight vertical release of N yards from a start point (x0,y0): new point is (x0, y0 - N*8). y always DECREASES as a receiver goes downfield; it never increases past their starting LOS-relative depth.
- A 90-degree break ("out", "in"/"dig"/"square-in", "square break") toward the sideline or middle by N yards: keep y the same as the point where the break happens, and move x by N*8 in the correct direction (subtract from x to move toward the left sideline, add to x to move toward the right sideline / middle from the boundary side).
- A 45-degree break ("post", "corner") over N more yards: move both x and y by roughly N*8*0.7 each (diagonal), continuing to decrease y.
- Lateral-only movement (flat, screen, motion) uses x change with little or no y change.

OFFENSIVE LINE: unless told otherwise, always exactly 5 players straddling the ball's x position at y=700, spaced 50px apart left to right: LT, LG, C, RG, RT.

SKILL LABELS (use these unless the description names others): QB, RB, FB, TE (or Y), Z (flanker, usually off the line, strength side), X (split end, usually on the line, weak/boundary side), H (slot/H-back), WR.

REFERENCE OFFENSIVE FORMATIONS (starting points measured from a center at x=375; shift every x by the same amount if the ball is on a hash instead of the middle, adapt labels to the actual description):
I-Form: LT 275,700 | LG 325,700 | C 375,700 | RG 425,700 | RT 475,700 | TE 525,700 | QB 375,745 | FB 375,810 | RB 375,875 | WR1 100,700 | WR2 650,700
Shotgun: same OL/TE | QB 375,810 | RB 300,810 | WR1 75,700 | WR2 675,700 | SLOT 190,715
Singleback: same OL/TE | QB 375,745 | RB 375,810 | WR1 75,700 | WR2 675,700 | SLOT 190,715
Empty: same OL/TE | QB 375,810 | WR1 75,700 | WR2 675,700 | SL1 190,715 | SL2 575,715
2x2 or "two receiver" sets (2 WRs, 1 TE, 1 H/slot, 1 RB): OL centered on the ball | TE on the line, strength side, next to the tackle | Z (flanker) outside TE, off the line, strength side | H (slot) between TE and Z, off the line, strength side | X (split end) on the line, boundary side, near the opposite sideline | QB and RB in shotgun behind the ball

REFERENCE DEFENSIVE FORMATIONS (shift x the same way if the ball is on a hash):
4-3: DE 225,650 | DT 300,650 | DT 450,650 | DE 525,650 | OLB 225,580 | MLB 375,580 | OLB 525,580 | CB 100,630 | CB 650,630 | FS 325,470 | SS 425,500
3-4: DE 275,650 | NT 375,650 | DE 475,650 | OLB 175,580 | ILB 325,580 | ILB 425,580 | OLB 575,580 | CB 100,630 | CB 650,630 | FS 325,470 | SS 425,500
Nickel: DE 250,650 | DT 325,650 | DT 425,650 | DE 500,650 | MLB 325,580 | MLB 425,580 | CB 100,630 | CB 650,630 | NB 200,610 | FS 325,470 | SS 425,500

ROUTE GLOSSARY (apply the COORDINATE MATH section above using the stated or typical depth; give each route 2-4 points):
- Slant: release ~2 yards upfield then a 45-degree break inside (toward the center of the field), total depth by about 5 yards.
- Flat: shallow release toward the nearest sideline, 2-4 yards depth, mostly lateral movement.
- Out: vertical release to the stated depth (or 5-6 yards if unstated) then a 90-degree break to the nearest sideline.
- Dig / square-in / square break: vertical release to the stated depth (commonly 12-15 yards) then a 90-degree break toward the middle of the field.
- Curl: vertical release 8-12 yards then a short break back toward the LOS (y increases slightly back toward the QB) while staying near the same x.
- Comeback: vertical release 12-15 yards then breaks back toward the sideline and a few yards shallower.
- Post: vertical release 10-14 yards then a 45-degree break toward the middle (x moves toward 375).
- Corner: vertical release 10-14 yards then a 45-degree break toward the nearest sideline.
- Seam: mostly straight vertical release up the seam between the hash and the numbers, minimal break, depth 15-20+ yards.
- Wheel: shallow flat release then turns upfield tight to the sideline.
- Go / fade / vertical / clear-out: straight line upfield, depth 20+ yards, x barely changes.
- Screen: short lateral or backward release near the LOS (y increases slightly), then the route can turn upfield behind blockers.
- Running back run/handoff paths use style "run". Offensive line and other blocking assignments use style "block" (a short 2-point line toward the man being blocked). Pre-snap movement uses style "motion".

OUTPUT JSON SHAPE (exactly these keys):
{"offense":[ ...players... ],"defense":[ ...players... ],"routes":[ {"side":"offense","index":0,"style":"pass","points":[{"x":0,"y":0}]} ]}

ROUTE TARGETING -- READ CAREFULLY, this is the part most often gotten wrong:
- Each route's "side" is "offense" or "defense", and "index" is the position (starting at 0) of that player within the "offense" or "defense" array in THIS SAME response -- NOT a name lookup.
- Example: if "offense" is [QB, RB, Z, X, ...] and Z runs a route, that route object is {"side":"offense","index":2,...} because Z is at index 2 (0-based: QB=0, RB=1, Z=2).
- If a route belongs to a player, that player's entire side (all 11) MUST be included in this response's "offense" or "defense" array, even if it's just a standard alignment you're repeating. Never reference a player who isn't present in this response's arrays.

RULES:
- Only fill "offense" if the description specifies/implies an offensive formation; leave it as an empty array only if there are truly no offensive routes/players to place in this response. Same logic for "defense".
- When "offense" is non-empty it must contain all 11 offensive players, in the order you reference them from "routes". When "defense" is non-empty it must contain all 11 defensive players.
- style must be exactly one of: "pass", "run", "block", "motion".
- Keep every x within 20-730 and every y within 20-980. Keep every label 5 characters or fewer.

WORKED EXAMPLE -- this shows the coordinate math and JSON format only. NEVER reuse these exact numbers, labels, or routes for an actual request, even if the wording looks similar to the input below. Always recompute every coordinate from scratch based on the real input you were given. If the real input is vague, incomplete, or cut off, do your best reasonable interpretation of what IS there rather than defaulting to this example.

Input: "Two receiver set on the left hash, strength to the field. Z runs a 15-yard dig with a square break, Y runs a seam route, then X and H both run slants."

Reasoning: ball on the left hash (x=290), so field/strength side is to the right (larger x), boundary side is to the left (smaller x). OL centered on x=290: LT=190, LG=240, C=290, RG=340, RT=390. TE (Y) attached on the strength side at x=440. Z (flanker) outside Y, off the line, strength side, at x=600. H (slot) between Y and Z, off the line, strength side, at x=520. X (split end) on the line, boundary side, at x=60. QB and RB in shotgun behind the ball. That's 5 OL + TE + Z + H + X + QB + RB = 11 offensive players, indexed 0-10 in the order listed. Z's dig: release straight up 15 yards (15*8=120px) from (600,700) to (600,580), then a 90-degree break toward the middle by about 6 yards (6*8=48px) to (552,580). Y's seam: straight release about 18 yards from (440,700) to (440,556). X's slant: release ~2 yards then break inward (toward larger x, since X is on the boundary/left) at 45 degrees, ending around (100,660). H's slant: release then break toward the middle (toward smaller x, since H is on the field/right side), ending around (480,672).

Output:
{"offense":[{"label":"LT","x":190,"y":700},{"label":"LG","x":240,"y":700},{"label":"C","x":290,"y":700},{"label":"RG","x":340,"y":700},{"label":"RT","x":390,"y":700},{"label":"TE","x":440,"y":700},{"label":"Z","x":600,"y":712},{"label":"H","x":520,"y":712},{"label":"X","x":60,"y":700},{"label":"QB","x":290,"y":790},{"label":"RB","x":240,"y":790}],"defense":[],"routes":[{"side":"offense","index":6,"style":"pass","points":[{"x":600,"y":700},{"x":600,"y":580},{"x":552,"y":580}]},{"side":"offense","index":5,"style":"pass","points":[{"x":440,"y":700},{"x":440,"y":556}]},{"side":"offense","index":8,"style":"pass","points":[{"x":60,"y":700},{"x":100,"y":660}]},{"side":"offense","index":7,"style":"pass","points":[{"x":520,"y":712},{"x":480,"y":672}]}]}

Note the indices: LT=0, LG=1, C=2, RG=3, RT=4, TE=5, Z=6, H=7, X=8, QB=9, RB=10 -- each route's "index" matches the player's position in the "offense" array above, counting from 0.`;

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
    console.log('AI play result for "' + text.trim().slice(0, 80) + '":', JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error('AI play generation error:', err);
    res.status(500).json({ error: 'Could not generate that play. Try rewording it.' });
  }
});

module.exports = router;
