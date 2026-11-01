import type {CharacterId,GenerateVideoInput} from '@brainrot/contracts';

/** What an agent must know to write a good group chat. The renderer handles every visual decision. */
export const GROUP_CHAT_RULES=[
  'Members are the actual things involved in the change, not cartoon characters: the client app, the API, Redis, Postgres, the queue, the intern, the user’s own agent. 2–4 members with distinct names.',
  'Give every member an icon. Use the real brand when the session uses it (icon "postgresql", "redis", "stripe", "nextdotjs" from Simple Icons); otherwise a generic Lucide icon ("smartphone" for the app, "server" for an API, "zap" for a cache, "database", "inbox" for a queue, "user" for a person, "bot" for an agent).',
  'speaker is only the member’s voice: pick a different ready voice for each member whose delivery suits it (an impatient cache, a slow old database). Voices are never drawn on screen.',
  'Open with a concrete symptom message ("did my payment go through??"), let members question or blame each other, reveal the mechanism through what each component actually does, land the insight in one twist message, and end with the fix the group agrees on.',
  'text is spoken aloud: plain, speakable, no emoji, at most 240 characters. chat.display is the texting version of the same message (lowercase, slang, emoji fine, at most 200 characters). Keep them saying the same thing.',
  'Use chat.reaction on at most three messages, where another member would actually react. Use chat.code on at most two messages for a tiny real snippet (8 lines × 34 columns).',
  'Mark at most one member as you:true (usually the user’s side: Client, You, the dev). Their bubbles appear on the right in green.',
  '4–16 messages, every member speaks at least once, one idea per message. Never invent test results, metrics or repository behavior the session did not show.',
  'Optional Pause & Predict: only from the third message on, on a message that asks the question without giving away the answer; the next message reveals it. Brainrotten sets the thinking time.',
  'Never send coordinates, colors, fonts or timings. Brainrotten lays out the WhatsApp thread, icon avatars, typing indicator, timestamps and gameplay.',
];

const PREFERRED:CharacterId[]=['motu','jack','patlu','jhatka','oggy','john'];

/** A complete, valid groupchat request using ready voices when possible. */
export function groupChatExample(language:GenerateVideoInput['language'],ready:CharacterId[]):GenerateVideoInput{
  const pool=[...PREFERRED.filter(id=>ready.includes(id)),...ready.filter(id=>!PREFERRED.includes(id)),...PREFERRED];
  const [client,api,db]=[...new Set(pool)].slice(0,3) as [CharacterId,CharacterId,CharacterId];
  return{format:'groupchat',cast:'auto',language,quizCount:1,script:{
    title:'Why the retry charged twice',
    takeaway:'A retry must reuse the original operation key, so the server returns the first result instead of charging again.',
    chat:{title:'checkout-prod 💀',members:[{speaker:client,name:'Checkout App',icon:'smartphone',you:true},{speaker:api,name:'Payment API',icon:'server'},{speaker:db,name:'Postgres',icon:'postgresql'}]},
    dialogue:[
      {speaker:client,text:'Did my payment go through? I never got a response.',chat:{display:'bhai payment gaya kya?? koi response nahi aaya 😭'}},
      {speaker:api,text:'It went through. My reply got lost on the way back to you.',chat:{display:'gaya ✅ but reply raste mein kho gaya'}},
      {speaker:client,text:'Okay, I am retrying with a brand new key.',chat:{display:'ok retry kar raha hu NEW key ke saath',reaction:'💀'}},
      {speaker:db,text:'A new key looks like a new purchase to me, so I charged the card again.',chat:{display:'naya key = naya purchase. charge kar diya dobara 🫡',code:'INSERT INTO purchases\n  (key) VALUES (uuid())'}},
      {speaker:api,text:'Send the same purchase key on every retry. I will find it and return the first result.',chat:{display:'har retry pe SAME key bhejo, pehla result wapas de dunga 🙏'}},
      {speaker:db,text:'And put a unique constraint on that key, so even a race cannot charge twice.',chat:{display:'aur key pe UNIQUE laga do, race mein bhi double charge nahi',reaction:'🔥'}},
    ],
    questions:[{prompt:'Why did the retry charge the card again?',choices:['The retry used a new key, so it looked like a new purchase','The first charge failed','Postgres was down'],answer:0,explanation:'The first charge succeeded; only the reply was lost. A fresh key made the retry a separate operation.',turnIndices:[2,3]}],
  }} as GenerateVideoInput;
}

/** Shared by every format: when and how to pause. */
export const PAUSE_RULE='Optional Pause & Predict: add pause {prompt, choices, answer} only after the viewer has context (the third line or later), on the line that asks the question aloud without giving away the answer. The next line must reveal and explain it. Brainrotten sets the thinking time from the reading length. At most two pauses.';

/** What an agent must know to write a PR review video. */
export const PR_REVIEW_RULES=[
  'Use the real diff from the session: copy the changed lines (and a little context) into pr.files[].lines as add/del/ctx, at most 46 characters per line and 24 lines per file, at most 3 files. Never invent code that was not in the change.',
  'author is who opened the PR: usually the coding agent that made the change, named as it calls itself (for example "kiro" with icon "bot"), or the user (icon "user"). Reviewers are 1–2 reviewer accounts (e.g. "senior-dev" with icon "user", "dba" with icon "postgresql", "security-bot" with icon "shield"); speaker is only their voice and is never drawn.',
  'Each spoken line is one review comment. Point it at real lines with pr.file and pr.lines [start, end] (at most 8 lines). tone is praise, question, nit, roast or blocker. pr.display is the written comment (emoji fine); text is what the reviewer says aloud (no emoji).',
  'Structure: start on the riskiest line with a roast or blocker, explain the consequence, show the fix and why it works, raise one real follow-up (a race, an edge case, a missing test), and end with a summary comment without pr.file. pr.verdict is approve, request-changes or comment.',
  PAUSE_RULE,
  'Never claim tests ran, benchmarks improved or CI passed unless the session showed it. Never send coordinates, colors, fonts or timings.',
];

/** A complete, valid prreview request using ready voices when possible. */
export function prReviewExample(language:GenerateVideoInput['language'],ready:CharacterId[]):GenerateVideoInput{
  const pool=[...['jhatka','patlu','jack','john'].filter(id=>ready.includes(id as CharacterId)),...ready,'jhatka','patlu'] as CharacterId[];
  const [senior,dba]=[...new Set(pool)].slice(0,2) as [CharacterId,CharacterId];
  return{format:'prreview',cast:'auto',language,quizCount:1,script:{
    title:'Reuse purchase key on retry',
    takeaway:'A retry must reuse the purchase key, and a unique constraint makes the database reject duplicates even under a race.',
    pr:{title:'Reuse purchase key on retry',repo:'acme/checkout',author:{name:'kiro',icon:'bot'},
      reviewers:[{speaker:senior,name:'senior-dev',icon:'user'},{speaker:dba,name:'dba',icon:'postgresql'}],
      files:[
        {path:'src/checkout/retry.ts',language:'ts',lines:[{kind:'ctx',code:'export async function retry(order) {'},{kind:'del',code:'  const key = crypto.randomUUID();'},{kind:'add',code:'  const key = order.purchaseKey;'},{kind:'ctx',code:'  return charge(order, key);'},{kind:'ctx',code:'}'}]},
        {path:'db/migrations/042_purchase_key.sql',language:'sql',lines:[{kind:'add',code:'ALTER TABLE purchases'},{kind:'add',code:'  ADD CONSTRAINT purchase_key_unique'},{kind:'add',code:'  UNIQUE (purchase_key);'}]},
      ],verdict:'approve'},
    dialogue:[
      {speaker:senior,text:'Checkout ka retry fix review karte hain. Problem ye thi ki kuch users ko do baar charge ho raha tha.',pr:{file:0,lines:[0,4],tone:'question',display:'retry fix review 👀 users ko double charge ho raha tha'}},
      {speaker:senior,text:'Purane code mein har retry pe crypto dot random UUID se ek naya key banta tha.',pr:{file:0,lines:[1,1],tone:'roast',display:'purana code: har retry pe naya UUID 💀'}},
      {speaker:senior,text:'Ab socho. Pehla charge ho gaya, par response raste mein kho gaya, aur app ne retry kiya. Ab kya hoga?',pr:{file:0,lines:[1,1],tone:'question',display:'charge ho gaya, response kho gaya, app retry karta hai… ab kya hoga? 🤔'},pause:{prompt:'The charge went through, the reply was lost, and the app retries with a new key. What happens?',choices:['Card is charged twice','Retry returns the first result','Request fails'],answer:0}},
      {speaker:senior,text:'Card do baar charge hoga, kyunki naya key matlab naya purchase. Isliye order ka purchase key reuse karna sahi fix hai.',pr:{file:0,lines:[2,2],tone:'praise',display:'naya key = naya purchase. order ka purchaseKey reuse 👌'}},
      {speaker:dba,text:'Lekin agar do retries ek saath aa gaye toh? Database level pe bhi unique constraint chahiye.',pr:{file:1,lines:[0,2],tone:'question',display:'do retries ek saath aaye toh? 🤨 DB pe UNIQUE chahiye'}},
      {speaker:dba,text:'Accha, migration mein already hai. Toh race mein bhi duplicate purchase reject ho jaayega.',pr:{file:1,lines:[1,2],tone:'praise',display:'migration mein already hai ✅ race bhi safe'}},
      {speaker:senior,text:'Theek hai, approve kar raha hoon. Ship it.',pr:{tone:'praise',display:'LGTM 🚀 ship it'}},
    ],
    questions:[{prompt:'Why did a new UUID on every retry cause double charges?',choices:['Each retry looked like a brand-new purchase','The bank rejected the first charge','The UUID was too short'],answer:0,explanation:'The first charge succeeded; a fresh key made the retry a separate operation, so it was charged again.',turnIndices:[2,3]}],
  }} as GenerateVideoInput;
}

/** What an agent must know to write a sketch board. */
export const SKETCH_RULES=[
  'Model the real system involved in the session: 2–8 nodes (id, short label, kind actor|service|store|queue|external, optional icon such as "smartphone", "server", "redis", "postgresql") and up to 10 edges with short labels ("GET /price", "on miss").',
  'Build it up like a presenter at a whiteboard: each line can show new elements (node ids or "from>to"), focus up to 4 elements, mark the focus as problem (red) or fix (green), and add one short red note (≤40 chars) near an element. Elements you never mention appear at the start; edges you never mention appear when both ends are visible.',
  'Structure: draw the happy path first, then the change or failure, mark the problem, then the fix. One idea per line.',
  'narrator is only the presenter’s voice (one ready voice) and is never drawn. No emoji in spoken text.',
  PAUSE_RULE,
  'Never send coordinates, colors, fonts or sizes. Brainrotten lays out and hand-draws the board.',
];

/** A complete, valid sketch request using a ready voice when possible. */
export function sketchExample(language:GenerateVideoInput['language'],ready:CharacterId[]):GenerateVideoInput{
  const narrator=(['patlu','jack','jhatka'] as CharacterId[]).find(id=>ready.includes(id))??ready[0]??'patlu';
  return{format:'sketch',cast:'auto',language,quizCount:1,narrator,script:{
    title:'Purana price kyun dikh raha hai?',narrator,
    takeaway:'When the source of truth changes, delete the cached copy so the next read fetches the fresh value.',
    sketch:{nodes:[{id:'phone',label:'User app',kind:'actor',icon:'smartphone'},{id:'api',label:'Price API',kind:'service',icon:'server'},{id:'redis',label:'Redis cache',kind:'store',icon:'redis'},{id:'db',label:'Postgres',kind:'store',icon:'postgresql'}],
      edges:[{from:'phone',to:'api',label:'GET /price'},{from:'api',to:'redis',label:'read'},{from:'api',to:'db',label:'on miss'},{from:'db',to:'redis',label:'invalidate'}]},
    dialogue:[
      {speaker:narrator,text:'Shuru karte hain. User ka app Price API se price maangta hai.',sketch:{show:['phone','api','phone>api']}},
      {speaker:narrator,text:'API pehle Redis cache dekhta hai. Price wahan mila, toh wahi lauta deta hai.',sketch:{show:['redis','api>redis'],focus:['api>redis']}},
      {speaker:narrator,text:'Cache mein na mile, tabhi API Postgres tak jaata hai aur result cache mein save karta hai.',sketch:{show:['db','api>db'],focus:['api>db']}},
      {speaker:narrator,text:'Ab admin ne Postgres mein price badal diya. Purana teen sau ninyanve, naya chaar sau ninyanve.',sketch:{focus:['db'],note:{text:'399 -> 499',near:'db'}}},
      {speaker:narrator,text:'Socho. Postgres mein naya price hai. Agla user kaunsa price dekhega?',sketch:{focus:['redis']},pause:{prompt:'Postgres now says 499. Which price does the next user see?',choices:['499, the new price','399, the old cached price','An error'],answer:1}},
      {speaker:narrator,text:'Purana wala. Redis ka copy ek ghante tak valid hai, aur kisi ne use bataya hi nahi.',sketch:{focus:['redis'],mark:'problem',note:{text:'stale for 1h!',near:'redis'}}},
      {speaker:narrator,text:'Fix simple hai. Price update hote hi Redis se woh key delete karo, agla read fresh price laayega.',sketch:{show:['db>redis'],focus:['db>redis','redis'],mark:'fix',note:{text:'DEL on update',near:'redis'}}},
    ],
    questions:[{prompt:'Why did users keep seeing the old price?',choices:['The cached copy was never invalidated after the update','Postgres did not save the new price','The API skipped the cache'],answer:0,explanation:'Postgres had the new price, but Redis kept serving its saved copy until it expired.',turnIndices:[4,5]}],
  }} as GenerateVideoInput;
}

/** What an agent must know to write a tier list. */
export const TIER_RULES=[
  'Rank the real options from the session (fixes, approaches, libraries the agent considered) against ONE stated criterion, e.g. "survives a lost response" or "cost at 10k users". Never a vague "best overall".',
  '3–8 items, each {id, label ≤24 chars, optional icon} (a Lucide name like "key-round", "timer", "ban", or a brand like "postgresql", "redis").',
  'Each line places at most one item (tier.place {item, tier S|A|B|C|D|F}) with a one-sentence reason tied to the criterion; tier.focus holds an item up before you place it. Every item must be placed exactly once by the end.',
  'Structure: state the criterion, place the clear extremes first, build tension on the debatable one, end on the S tier and the takeaway.',
  'narrator is only the presenter’s voice (one ready voice) and is never drawn. No emoji in spoken text.',
  PAUSE_RULE+' A tier list pause works best on the debatable item: hold it up with tier.focus and ask where it goes.',
  'Never send colors, positions or sizes. Brainrotten draws the TierMaker-style board and the unranked tray.',
];

/** A complete, valid tierlist request using a ready voice when possible. */
export function tierListExample(language:GenerateVideoInput['language'],ready:CharacterId[]):GenerateVideoInput{
  const narrator=(['jack','patlu','jhatka'] as CharacterId[]).find(id=>ready.includes(id))??ready[0]??'jack';
  return{format:'tierlist',cast:'auto',language,quizCount:1,narrator,script:{
    title:'Double charge fixes, ranked',narrator,
    takeaway:'Only a stable purchase key per order stops double charges when the response is lost; a unique constraint backs it up.',
    tierlist:{criterion:'still one charge if the reply is lost',items:[
      {id:'same-key',label:'Same key per order',icon:'key-round'},{id:'unique',label:'DB UNIQUE constraint',icon:'postgresql'},
      {id:'backoff',label:'Retry with backoff',icon:'timer'},{id:'no-retry',label:'Just never retry',icon:'ban'},{id:'new-uuid',label:'New UUID per retry',icon:'shuffle'}]},
    dialogue:[
      {speaker:narrator,text:'Double charge ke saare fixes rank karte hain. Criterion ek hi hai: response kho jaaye, tab bhi sirf ek charge ho.'},
      {speaker:narrator,text:'Pehla, har retry pe naya UUID. Ye toh har retry ko naya purchase bana deta hai. Seedha F tier.',tier:{place:{item:'new-uuid',tier:'F'}}},
      {speaker:narrator,text:'Retry with backoff. Server pe load kam karta hai, par double charge nahi rokta. C tier.',tier:{place:{item:'backoff',tier:'C'}}},
      {speaker:narrator,text:'Ab retry hi mat karo. Double charge toh nahi hoga. Par isko kahan rakhoge?',tier:{focus:'no-retry'},pause:{prompt:'"Just never retry": no double charge. Which tier?',choices:['S, problem solved','D, the user never learns if they paid'],answer:1}},
      {speaker:narrator,text:'D tier. Charge ek hi hoga, par user ko kabhi pata nahi chalega ki payment hua ya nahi.',tier:{place:{item:'no-retry',tier:'D'}}},
      {speaker:narrator,text:'Database pe unique constraint. Race mein bhi duplicate purchase reject karega. A tier.',tier:{place:{item:'unique',tier:'A'}}},
      {speaker:narrator,text:'Aur S tier: har retry pe order ka same purchase key. Server pehla result hi wapas deta hai.',tier:{place:{item:'same-key',tier:'S'}}},
    ],
    questions:[{prompt:'Why is "just never retry" only D tier?',choices:['It avoids double charges but leaves the user not knowing if they paid','It causes double charges','It overloads the server'],answer:0,explanation:'No retry means one charge, but a lost reply leaves the user without an answer.',turnIndices:[3,4]}],
  }} as GenerateVideoInput;
}

/** Sent to every MCP client on connect: a short playbook any agent, including small models, can follow. */
export const SERVER_INSTRUCTIONS=`Brainrotten turns what you just did in this coding session into a short learning video for the user, who watches it in Brainrotten Studio or the Android app.

WHEN: only when the user asks for a video or explanation, or at a meaningful milestone if they turned that on. Never after every reply. Generating spends the user's speech credits.

PICK THE FORMAT from what actually happened:
- code changed -> prreview (review the real diff line by line)
- several parts interacting, or a bug between systems -> groupchat (the components text each other)
- architecture or data flow -> sketch (Excalidraw-style diagram that builds up)
- several options were weighed -> tierlist (rank them S-F by one criterion)
- a concept or misconception -> skit (two cartoon characters, question and answer)

STEPS:
1. get_video_formats with {format} -> read its rules and copy the structure of storyExample exactly.
2. Write the complete script yourself from your real context, in the user's language (en, hinglish or benglish, always Latin letters). Never invent code, test results, metrics or behavior you did not see.
3. validate_video_script with {request} -> fix every issue it lists; warnings show what Brainrotten auto-fixed.
4. generate_short_video (or record_learning_session then publish_session_lesson for the learning flow). It returns a jobId at once; keep working and check get_video_status later.

RULES: one idea per line. Optional Pause & Predict only from the third line on, on a line that asks the question aloud without giving the answer; the next line reveals it. Use ready voices from list_video_voices. Never send colors, coordinates, fonts, sizes or timings: Brainrotten draws everything.`;
