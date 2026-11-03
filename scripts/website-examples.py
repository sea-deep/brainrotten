"""Website example videos: fourteen example coding sessions across stacks and levels, in English and Hinglish.

    python3 scripts/website-examples.py validate        # free: checks every script
    python3 scripts/website-examples.py generate [ids]  # spends ElevenLabs credits; needs local Studio running

Each finished video is copied to apps/web/public/examples/<id>/ (video.mp4 + job.json); scripts/publish-examples.mjs
then builds index.json and posters. Only approved public voices are used (see scripts/release.test.mjs).
"""
import json, shutil, sys, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sdk/python"))
from brainrotten import Brainrotten, BrainrottenError  # noqa: E402

def q(prompt, choices, answer, explanation, turns):
    return [{"prompt": prompt, "choices": choices, "answer": answer, "explanation": explanation, "turnIndices": turns}]

def skit(language, learner, expert, title, takeaway, dialogue, questions):
    return {"format": "skit", "cast": "auto", "language": language, "quizCount": 1, "participants": {"learner": learner, "expert": expert},
            "script": {"title": title, "participants": {"learner": learner, "expert": expert}, "takeaway": takeaway, "dialogue": dialogue, "questions": questions}}

def narrated(fmt, language, narrator, title, takeaway, body, dialogue, questions):
    return {"format": fmt, "cast": "auto", "language": language, "quizCount": 1, "narrator": narrator,
            "script": {"title": title, "narrator": narrator, "takeaway": takeaway, **body, "dialogue": dialogue, "questions": questions}}

def interface(fmt, language, title, takeaway, body, dialogue, questions):
    return {"format": fmt, "cast": "auto", "language": language, "quizCount": 1,
            "script": {"title": title, "takeaway": takeaway, **body, "dialogue": dialogue, "questions": questions}}

code = lambda language, text: {"kind": "code", "language": language, "code": text}

EXAMPLES = {
# ── Beginner ─────────────────────────────────────────────────────────────────
"python-list-copy": skit("en", "motu", "patlu", "I copied the list. Why did both change?",
    "Assigning a list gives it a second name; use .copy() for a new list, and copy.deepcopy when the items are nested.",
    [
        {"speaker": "motu", "text": "I copied my to-do list, removed a task from the copy, and the original lost it too! Why?"},
        {"speaker": "patlu", "text": "Because you never copied it. backup equals tasks just gives the same list a second name, so both names point to one list.",
         "broll": code("python", "tasks = ['buy milk', 'study']\nbackup = tasks\nbackup.remove('study')\nprint(tasks)  # ['buy milk']")},
        {"speaker": "motu", "text": "So how do I get a real copy? Do I have to loop and append every task myself?"},
        {"speaker": "patlu", "text": "No loop needed. tasks dot copy, or list of tasks, builds a brand new list with the same items.", "broll": code("python", "backup = tasks.copy()")},
        {"speaker": "motu", "text": "Wait. What if every task is a dictionary, and I change a title in the copy? What happens to the original?",
         "pause": {"prompt": "You copy a list of dictionaries with .copy() and change one task's title in the copy. What happens to the original?", "choices": ["Its title changes too", "It stays the same", "Python raises an error"], "answer": 0}},
        {"speaker": "patlu", "text": "The original changes too. copy is shallow: a new list, but the same dictionaries inside. For nested data, use copy dot deepcopy.",
         "broll": code("python", "import copy\nbackup = copy.deepcopy(tasks)")},
    ],
    q("Why did removing a task from backup also change tasks?", ["backup = tasks made a second name for the same list", "remove() edits every list", "Python copies lists lazily"], 0,
      "Assignment never copies a list; both names refer to the same object.", [0, 1])),

"node-await-foreach": skit("hinglish", "badri", "budhdev", "await lagaya, phir bhi wait nahi kiya?",
    "forEach does not wait for async callbacks; use for...of to go one by one, or Promise.all to run them together and wait for all.",
    [
        {"speaker": "badri", "text": "Dost, maine forEach ke andar await lagaya saare signup emails bhejne ke liye. Par script done pehle print kar deti hai! Kyun?"},
        {"speaker": "budhdev", "text": "Kyunki forEach await ka intezaar nahi karta. Har callback async hai, forEach unhe shuru karke seedha aage badh jaata hai.",
         "broll": code("js", "users.forEach(async (u) => {\n  await sendEmail(u);\n});\nconsole.log('done'); // runs first")},
        {"speaker": "badri", "text": "Toh phir kya likhun? Kya ek normal for loop se kaam chalega?"},
        {"speaker": "budhdev", "text": "Haan. for of ke andar await sach mein rukta hai, toh ek ke baad ek email jaayegi.", "broll": code("js", "for (const u of users) {\n  await sendEmail(u);\n}")},
        {"speaker": "badri", "text": "Par hazaar users hain, ek ek karke toh bahut der lagegi. Sab ek saath bhejne ka tareeka kya hai?",
         "pause": {"prompt": "Sending 1,000 emails one at a time is slow. Which sends them together and still waits for all of them?", "choices": ["await Promise.all(users.map(sendEmail))", "users.forEach(await sendEmail)", "Wrap the loop in setTimeout"], "answer": 0}},
        {"speaker": "budhdev", "text": "Promise dot all. Saare emails ek saath shuru karo aur sabke khatam hone ka wait karo. Bas provider ki rate limit ka dhyaan rakhna.",
         "broll": code("js", "await Promise.all(users.map(sendEmail));")},
    ],
    q("Why did 'done' print before the emails were sent?", ["forEach does not wait for async callbacks", "sendEmail is synchronous", "console.log runs in parallel"], 0,
      "forEach calls each async callback and moves on without awaiting the returned promises.", [0, 1])),

"css-center-card": narrated("tierlist", "en", "jack", "Ways to center a card, ranked",
    "Use flexbox or grid on the parent to center both ways; margin auto only centers horizontally.",
    {"tierlist": {"criterion": "centered both ways, any screen size", "items": [
        {"id": "flex", "label": "Flexbox center"}, {"id": "grid", "label": "Grid place-items"}, {"id": "absolute", "label": "Absolute + translate"},
        {"id": "margin", "label": "margin: auto"}, {"id": "text", "label": "text-align: center"}, {"id": "center-tag", "label": "<center> tag"}]}},
    [
        {"speaker": "jack", "text": "Let's rank the ways to center a card on a portfolio page. One rule: centered horizontally and vertically, on any screen size."},
        {"speaker": "jack", "text": "The old center tag. It's deprecated, and it only centers horizontally. F tier.", "tier": {"place": {"item": "center-tag", "tier": "F"}}},
        {"speaker": "jack", "text": "text-align center. It centers the text inside the card, not the card itself. D tier.", "tier": {"place": {"item": "text", "tier": "D"}}},
        {"speaker": "jack", "text": "margin auto with a fixed width. Great horizontally, but in normal flow it does nothing vertically. C tier.", "tier": {"place": {"item": "margin", "tier": "C"}}},
        {"speaker": "jack", "text": "Absolute position, top and left fifty percent, then translate minus fifty percent. It works everywhere. So is it S tier?", "tier": {"focus": "absolute"},
         "pause": {"prompt": "position: absolute + top/left 50% + translate(-50%, -50%). Where does it rank for centering a card?", "choices": ["S: perfect", "B: works, but pulls the card out of the layout", "F: broken"], "answer": 1}},
        {"speaker": "jack", "text": "B tier. It centers perfectly, but the card leaves the normal layout, so nothing else can flow around it.", "tier": {"place": {"item": "absolute", "tier": "B"}}},
        {"speaker": "jack", "text": "Grid with place-items center. Two lines on the parent, centered both ways. S tier.", "tier": {"place": {"item": "grid", "tier": "S"}}},
        {"speaker": "jack", "text": "Flexbox with justify-content and align-items center. Same result, works everywhere. Also S.", "tier": {"place": {"item": "flex", "tier": "S"}}},
    ],
    q("Why is text-align: center only D tier?", ["It centers the text inside the card, not the card", "It is deprecated", "It only works in grid"], 0,
      "text-align affects inline content inside an element, not the element's own position.", [2])),

"git-detached-head": interface("groupchat", "hinglish", "Detached HEAD: kaam gaya kya?",
    "A detached HEAD points at a commit, not a branch; create a branch before switching away so new commits are kept.",
    {"chat": {"title": "dbms-project 🎓", "members": [
        {"speaker": "taplu", "name": "You", "icon": "user", "you": True},
        {"speaker": "jack", "name": "Git", "icon": "git"},
        {"speaker": "john", "name": "main branch", "icon": "git-branch"}]}},
    [
        {"speaker": "taplu", "text": "Maine purana commit checkout kiya aur ab Git bol raha hai detached HEAD. Mera kaam gaya kya?", "chat": {"display": "git bol raha detached HEAD 😭 mera kaam gaya kya??"}},
        {"speaker": "jack", "text": "Kuch nahi gaya. HEAD abhi kisi branch par nahi, seedha ek commit par khada hai.", "chat": {"display": "kuch nahi gaya 😌 HEAD ek commit pe khada hai, kisi branch pe nahi"}},
        {"speaker": "john", "text": "Main toh wahin hoon jahan tha. Tumne mujhe chhua hi nahi.", "chat": {"display": "main toh wahin hoon bro, mujhe chhua hi nahi 🤷"}},
        {"speaker": "taplu", "text": "Par maine yahan do naye commits bhi kar diye. Agar ab main branch pe switch karun, toh unka kya hoga?", "chat": {"display": "par maine yahan 2 commits bhi kar diye… ab main pe gaya toh unka kya hoga? 🤔"},
         "pause": {"prompt": "You made 2 commits on a detached HEAD and switch back to main. What happens to those commits?", "choices": ["No branch points to them, so they are easy to lose", "They merge into main automatically", "Git deletes them right away"], "answer": 0}},
        {"speaker": "jack", "text": "Woh kisi branch par nahi hain, toh dheere dheere kho sakte hain. Abhi ek branch bana lo, unka ghar ban jaayega.",
         "chat": {"display": "unka koi ghar nahi 👻 abhi branch bana lo", "code": "git switch -c fix-login"}},
        {"speaker": "john", "text": "Phir mujhme merge kar dena, sab safe rahega.", "chat": {"display": "phir mujhme merge kar dena ✅", "reaction": "👍"}},
    ],
    q("Why create a branch before switching away from a detached HEAD?", ["So a branch points to your new commits and they are kept", "Git requires it to push", "It deletes the old commits"], 0,
      "Commits that no branch points to can be lost; a branch keeps them reachable.", [3, 4])),

"php-sql-injection": skit("en", "budhdev", "badri", "Logged in as admin without a password?",
    "Never build SQL by pasting input into the query text; use prepared statements so input stays data.",
    [
        {"speaker": "budhdev", "text": "My PHP login works, but my friend got in as admin without the password. He just typed a quote and some dashes in the username box. How?"},
        {"speaker": "badri", "text": "Your query glues the username straight into the SQL text. His quote closed your string, and everything after it became SQL.",
         "broll": code("php", "$sql = \"SELECT * FROM users\n  WHERE name = '$name'\n  AND pass = '$pass'\";")},
        {"speaker": "budhdev", "text": "So if he types admin, a quote, then two dashes, what does the database actually run?",
         "pause": {"prompt": "The username is admin'-- . What happens to the password check?", "choices": ["It turns into a comment and is skipped", "It still runs", "MySQL rejects the quote"], "answer": 0}},
        {"speaker": "badri", "text": "Two dashes start a comment, so the password check simply disappears. The query finds admin and logs him in."},
        {"speaker": "budhdev", "text": "Should I just strip quotes out of the input, then?"},
        {"speaker": "badri", "text": "No. Use a prepared statement. The query and the values travel separately, so input can never turn into code.",
         "broll": code("php", "$stmt = $pdo->prepare(\n  'SELECT * FROM users WHERE name = ?');\n$stmt->execute([$name]);")},
    ],
    q("Why could the friend log in without a password?", ["The username input became part of the SQL query", "The admin password was empty", "PHP sessions were broken"], 0,
      "The quote ended the string and the dashes commented out the password check.", [1, 3])),

# ── Intermediate ─────────────────────────────────────────────────────────────
"react-useeffect-loop": interface("prreview", "en", "Stop the useEffect request loop",
    "Effect dependencies should be values, not objects rebuilt on every render.",
    {"pr": {"title": "Fix order polling loop in useOrders", "repo": "riya/store-dashboard", "author": {"name": "riya", "icon": "user"},
            "reviewers": [{"speaker": "jhatka", "name": "senior-dev", "icon": "user"}, {"speaker": "john", "name": "perf-bot", "icon": "bot"}],
            "files": [{"path": "src/hooks/useOrders.ts", "language": "ts", "lines": [
                {"kind": "ctx", "code": "export function useOrders(filters) {"},
                {"kind": "ctx", "code": "  const [orders, setOrders] = useState([]);"},
                {"kind": "del", "code": "  const query = { ...filters, page: 1 };"},
                {"kind": "add", "code": "  const query = useMemo("},
                {"kind": "add", "code": "    () => ({ ...filters, page: 1 }),"},
                {"kind": "add", "code": "    [filters.status, filters.from]);"},
                {"kind": "ctx", "code": "  useEffect(() => {"},
                {"kind": "ctx", "code": "    fetchOrders(query).then(setOrders);"},
                {"kind": "ctx", "code": "  }, [query]);"},
                {"kind": "ctx", "code": "  return orders;"},
                {"kind": "ctx", "code": "}"}]}],
            "verdict": "approve"}},
    [
        {"speaker": "jhatka", "text": "This line was the bug. A new query object is built on every render, so the effect sees a changed dependency every single time.", "pr": {"file": 0, "lines": [2, 2], "tone": "roast", "display": "new object every render = effect every render 💀"}},
        {"speaker": "jhatka", "text": "And the effect calls setOrders, which renders again, which builds a new object again. That loop hammered the orders API.", "pr": {"file": 0, "lines": [6, 8], "tone": "question", "display": "setOrders → rerender → new object → effect again 🔁"}},
        {"speaker": "john", "text": "The fix wraps the object in useMemo. Quick check: when does it actually build a new object now?", "pr": {"file": 0, "lines": [3, 5], "tone": "question", "display": "useMemo now. when does it rebuild? 🤔"},
         "pause": {"prompt": "useMemo(() => ({ ...filters, page: 1 }), [filters.status, filters.from]). When does it build a new object?", "choices": ["Only when status or from change", "On every render", "Only on the first render"], "answer": 0}},
        {"speaker": "john", "text": "Only when status or from change. Those are plain strings, compared by value, so the effect runs once per real filter change.", "pr": {"file": 0, "lines": [3, 5], "tone": "praise", "display": "deps are strings → compared by value ✅ one fetch per real change"}},
        {"speaker": "jhatka", "text": "One follow-up: if someone adds a new filter field later, it must join this dependency list too, or the orders go stale.", "pr": {"file": 0, "lines": [5, 5], "tone": "nit", "display": "nit: new filter fields must join these deps or data goes stale 👀"}},
        {"speaker": "jhatka", "text": "Approving. Lesson: effect dependencies should be values, not objects you rebuild on every render.", "pr": {"tone": "praise", "display": "LGTM 🚀 deps = values, not fresh objects"}},
    ],
    q("Why did the old hook keep calling the API?", ["A new query object each render changed the effect's dependency every time", "fetchOrders retries forever", "useState resets on every render"], 0,
      "The object was recreated every render, so React saw a new dependency and re-ran the effect, which set state and rendered again.", [0, 1])),

"django-n-plus-one": narrated("sketch", "hinglish", "badri", "Blog itna slow kyun hai?",
    "Load related rows in the same query (select_related) instead of one query per row.",
    {"sketch": {"nodes": [
        {"id": "page", "label": "Blog page", "kind": "actor", "icon": "monitor"},
        {"id": "view", "label": "Django view", "kind": "service", "icon": "django"},
        {"id": "orm", "label": "ORM", "kind": "service", "icon": "layers"},
        {"id": "db", "label": "PostgreSQL", "kind": "store", "icon": "postgresql"}],
        "edges": [{"from": "page", "to": "view", "label": "GET /posts"}, {"from": "view", "to": "orm", "label": "posts + authors"}, {"from": "orm", "to": "db", "label": "SQL queries"}]}},
    [
        {"speaker": "badri", "text": "Blog ka home page bahut slow load ho raha tha. Chalo dekhte hain request kahan kahan jaati hai.", "sketch": {"show": ["page", "view", "page>view"]}},
        {"speaker": "badri", "text": "Django view saare posts laata hai, aur har post ke saath uske author ka naam dikhata hai.", "sketch": {"show": ["orm", "view>orm"], "focus": ["view>orm"]}},
        {"speaker": "badri", "text": "ORM yeh sab PostgreSQL se SQL queries chala ke laata hai.", "sketch": {"show": ["db", "orm>db"], "focus": ["orm>db"]}},
        {"speaker": "badri", "text": "Ab socho. Sau posts hain, aur template har post ke liye post dot author padhta hai. Kitni queries chalengi?", "sketch": {"focus": ["orm>db"]},
         "pause": {"prompt": "100 posts, and the template reads post.author for each one. How many SQL queries run?", "choices": ["101: one for posts, one per author", "Just 1", "2"], "answer": 0}},
        {"speaker": "badri", "text": "Ek sau ek. Ek query posts ke liye, phir har author ke liye alag. Isse N plus one problem kehte hain.", "sketch": {"focus": ["orm>db", "db"], "mark": "problem", "note": {"text": "1 + 100 queries!", "near": "db"}}},
        {"speaker": "badri", "text": "Fix hai select related author. ORM ek hi JOIN query mein posts aur authors dono le aata hai.", "sketch": {"focus": ["orm", "orm>db"], "mark": "fix", "note": {"text": "select_related: 1 query", "near": "orm"}}},
    ],
    q("Why did the blog page run 101 queries?", ["Each post's author was loaded with its own query", "PostgreSQL splits big queries", "Django caches nothing"], 0,
      "Reading post.author lazily runs one query per post; select_related joins them into one.", [3, 4])),

"flask-cors-preflight": interface("groupchat", "en", "Who blocked my request?",
    "CORS is enforced by the browser; the server fixes it by sending Access-Control-Allow-Origin for the origins it allows.",
    {"chat": {"title": "shop-frontend 🛒", "members": [
        {"speaker": "taplu", "name": "React app", "icon": "react", "you": True},
        {"speaker": "jack", "name": "Browser", "icon": "globe"},
        {"speaker": "john", "name": "Flask API", "icon": "flask"}]}},
    [
        {"speaker": "taplu", "text": "I called the API with a JSON body and got blocked by CORS. The server is literally running!", "chat": {"display": "called the API, CORS blocked me 😤 server is literally up"}},
        {"speaker": "jack", "text": "Different origin, so before your POST I sent a preflight OPTIONS request asking if that's allowed.", "chat": {"display": "different origin → I sent a preflight OPTIONS first ✈️"}},
        {"speaker": "john", "text": "I got an OPTIONS request I don't handle, so I answered without any Access-Control headers.", "chat": {"display": "got OPTIONS, replied with no CORS headers 🤷"}},
        {"speaker": "taplu", "text": "So who actually blocked it? The server or the browser?", "chat": {"display": "so who blocked it?? server or browser?"},
         "pause": {"prompt": "The preflight response had no Access-Control-Allow-Origin header. Who blocks the request?", "choices": ["The browser", "The Flask server", "React"], "answer": 0}},
        {"speaker": "jack", "text": "Me. The server never refused anything. I block the response because it didn't say your origin is allowed.", "chat": {"display": "me 🙋 the server never refused, I block when your origin isn't allowed", "reaction": "😳"}},
        {"speaker": "john", "text": "The fix is on my side: allow your origin. Two lines.", "chat": {"display": "fix is on my side, 2 lines ✅", "code": "from flask_cors import CORS\nCORS(app, origins=[FRONTEND])"}},
        {"speaker": "taplu", "text": "And no wildcard star in production. Got it.", "chat": {"display": "no * in prod. noted 📝"}},
    ],
    q("Who enforces CORS?", ["The browser", "The API server", "The React app"], 0,
      "The server only sends headers; the browser decides whether the page may read the response.", [3, 4])),

"flutter-setstate-dispose": skit("hinglish", "motu", "patlu", "setState called after dispose?",
    "After an await, check mounted before calling setState; FutureBuilder handles this for you.",
    [
        {"speaker": "motu", "text": "Patlu, weather screen se jaldi back dabaya toh app ne lal error phenka: setState called after dispose. Ye kya bawaal hai?"},
        {"speaker": "patlu", "text": "Motu, tumhara API call abhi chal raha tha. Jawab aaya tab tak screen band ho chuki thi, phir bhi setState chal gaya.",
         "broll": code("dart", "final data = await api.fetch(city);\nsetState(() => weather = data);")},
        {"speaker": "motu", "text": "Toh screen band hone ke baad setState rokne ka koi tareeka hai kya?"},
        {"speaker": "patlu", "text": "Haan, await ke baad mounted check karo. Screen chali gayi ho toh chupchaap ruk jao.",
         "broll": code("dart", "final data = await api.fetch(city);\nif (!mounted) return;\nsetState(() => weather = data);")},
        {"speaker": "motu", "text": "Aur agar main FutureBuilder use karun, toh kya yeh check phir bhi likhna padega?",
         "pause": {"prompt": "If the screen uses FutureBuilder instead of calling setState yourself, do you still need the mounted check?", "choices": ["No, FutureBuilder stops rebuilding after dispose", "Yes, always", "Only on iOS"], "answer": 0}},
        {"speaker": "patlu", "text": "Nahi. FutureBuilder khud dekh leta hai, widget hatne ke baad rebuild nahi karta. Bas future ko build ke andar mat banana."},
    ],
    q("Why did the app throw 'setState called after dispose'?", ["The fetch finished after the screen was closed", "The API returned an error", "setState was called twice"], 0,
      "The await resumed after the State was disposed, and setState ran on a widget that no longer existed.", [0, 1])),

"docker-localhost-db": skit("hinglish", "oggy", "jack", "Docker mein localhost kaam kyun nahi karta?",
    "Inside a container, localhost is the container itself; reach other Compose services by their service name.",
    [
        {"speaker": "oggy", "text": "Jack, mera Node app laptop pe chal raha tha, par Docker mein daala toh database se connect hi nahi hota. ECONNREFUSED aa raha hai!"},
        {"speaker": "jack", "text": "Kyunki tumne host localhost likha hai. Container ke andar localhost matlab woh container khud, na tumhara laptop, na database.",
         "broll": code("bash", "DB_HOST=localhost\n# inside the app container,\n# localhost = the app itself")},
        {"speaker": "oggy", "text": "Par app aur database dono ek hi compose file mein hain. Toh app database ko kis naam se dhoondhe?",
         "pause": {"prompt": "The app and Postgres are services in one docker-compose file. Which host should the app use?", "choices": ["The service name, db", "localhost", "127.0.0.1"], "answer": 0}},
        {"speaker": "jack", "text": "Service ke naam se. Compose ek network banata hai jahan har service ka naam hi uska address hota hai, toh host db likho.",
         "broll": code("yaml", "services:\n  app:\n    environment:\n      DB_HOST: db\n  db:\n    image: postgres:16")},
        {"speaker": "oggy", "text": "Aur pehli baar start karne pe phir bhi error aata hai, restart karun toh chal jaata hai. Woh kyun?"},
        {"speaker": "jack", "text": "App database ke ready hone se pehle hi start ho jaata hai. depends_on ke saath healthcheck lagao, ya connect pe retry karo."},
    ],
    q("Why did localhost fail inside the container?", ["localhost pointed to the app container itself", "Docker blocks port 5432", "Postgres needed a password"], 0,
      "Each container has its own localhost; the database is reachable by its service name on the Compose network.", [1, 3])),

# ── Advanced ────────────────────────────────────────────────────────────────
"go-goroutine-leak": narrated("sketch", "en", "john", "Why memory kept climbing",
    "A goroutine sending on an unbuffered channel nobody reads blocks forever; buffer the channel and pass a context.",
    {"sketch": {"nodes": [
        {"id": "handler", "label": "HTTP handler", "kind": "service", "icon": "server"},
        {"id": "fetch", "label": "fetch goroutine", "kind": "service", "icon": "cpu"},
        {"id": "ch", "label": "result channel", "kind": "queue", "icon": "inbox"},
        {"id": "timeout", "label": "2s timeout", "kind": "external", "icon": "timer"}],
        "edges": [{"from": "handler", "to": "fetch", "label": "go fetch()"}, {"from": "fetch", "to": "ch", "label": "send"}, {"from": "ch", "to": "handler", "label": "receive"}, {"from": "timeout", "to": "handler", "label": "wins race"}]}},
    [
        {"speaker": "john", "text": "Our Go price service used more memory every hour, until it got restarted. Here's the request path.", "sketch": {"show": ["handler"]}},
        {"speaker": "john", "text": "The handler starts a goroutine to fetch a price, then waits on a channel for the result.", "sketch": {"show": ["fetch", "ch", "handler>fetch", "fetch>ch", "ch>handler"], "focus": ["handler>fetch"]}},
        {"speaker": "john", "text": "It also has a two second timeout, so one slow API can't hang the whole request.", "sketch": {"show": ["timeout", "timeout>handler"], "focus": ["timeout"]}},
        {"speaker": "john", "text": "Now the API takes five seconds. The handler times out and returns. What happens to that goroutine?", "sketch": {"focus": ["fetch"]},
         "pause": {"prompt": "The handler has returned. The goroutine later sends on an unbuffered channel that nobody reads. What happens?", "choices": ["It blocks forever and leaks", "It exits automatically", "It panics"], "answer": 0}},
        {"speaker": "john", "text": "It blocks forever. Nobody receives on that unbuffered channel anymore, so every slow request leaves one stuck goroutine behind.", "sketch": {"focus": ["fetch", "fetch>ch"], "mark": "problem", "note": {"text": "stuck forever", "near": "fetch"}}},
        {"speaker": "john", "text": "The fix: give the channel a buffer of one, so the send never blocks, and pass a context so the fetch stops early.", "sketch": {"focus": ["ch"], "mark": "fix", "note": {"text": "make(chan T, 1) + ctx", "near": "ch"}}},
    ],
    q("Why did each slow request leak a goroutine?", ["Its send on an unbuffered channel blocked forever after the handler left", "Goroutines never exit in Go", "The timeout killed the handler"], 0,
      "An unbuffered send waits for a receiver; once the handler returned, no receiver remained.", [3, 4])),

"k8s-oomkilled": narrated("tierlist", "hinglish", "budhdev", "OOMKilled ke fixes, ranked",
    "Find the leak; until then, keep Node's heap limit below the container limit so it collects garbage before the kernel kills it.",
    {"tierlist": {"criterion": "stops OOMKills without wasting memory", "items": [
        {"id": "fix-leak", "label": "Fix the leak"}, {"id": "heap-limit", "label": "max-old-space-size"}, {"id": "raise-limit", "label": "Raise memory limit"},
        {"id": "nightly", "label": "Restart pods nightly"}, {"id": "no-limit", "label": "Remove the limit"}]}},
    [
        {"speaker": "budhdev", "text": "Hamari Node API Kubernetes par baar baar OOMKilled ho rahi thi. Criterion ek hi: crash band ho, aur memory bhi barbaad na ho."},
        {"speaker": "budhdev", "text": "Limit hi hata do? Pod node ki saari memory kha sakta hai aur baaki pods ko bhi gira dega. Seedha F.", "tier": {"place": {"item": "no-limit", "tier": "F"}}},
        {"speaker": "budhdev", "text": "Har raat pods restart karo. Crash thoda kam dikhega, par leak wahin ka wahin. D tier.", "tier": {"place": {"item": "nightly", "tier": "D"}}},
        {"speaker": "budhdev", "text": "Memory limit badha do. Abhi ke liye theek, par leak hai toh bas thodi der se crash hoga. C tier.", "tier": {"place": {"item": "raise-limit", "tier": "C"}}},
        {"speaker": "budhdev", "text": "Ab Node ka max old space size, container ki limit se thoda kam. Yeh kitna kaam ka hai?", "tier": {"focus": "heap-limit"},
         "pause": {"prompt": "Node's --max-old-space-size is set a bit below the container's memory limit. What does that change?", "choices": ["Node collects garbage harder before the kernel kills the pod", "Nothing at all", "It doubles the available memory"], "answer": 0}},
        {"speaker": "budhdev", "text": "Node limit ke paas pahunchne se pehle hi zor se garbage collection karta hai, kernel ke maarne se pehle. A tier.", "tier": {"place": {"item": "heap-limit", "tier": "A"}}},
        {"speaker": "budhdev", "text": "Aur leak dhoondh ke code theek karna, jaise kabhi na saaf hone wala cache. Asli ilaaj yahi hai. S tier.", "tier": {"place": {"item": "fix-leak", "tier": "S"}}},
    ],
    q("Why is removing the memory limit F tier?", ["One leaking pod can eat the node's memory and take other pods down", "Kubernetes forbids it", "It makes the pod slower"], 0,
      "Without a limit the leak grows until the whole node runs out of memory.", [1])),

"rust-borrow-checker": skit("en", "oggy", "jack", "Why won't Rust let me push here?",
    "Don't grow a vector while iterating over it; build a new one with an iterator chain instead.",
    [
        {"speaker": "oggy", "text": "Rust won't compile my log parser. I push to a vector while looping over it, and it says cannot borrow as mutable. Why so strict?"},
        {"speaker": "jack", "text": "Because pushing can move the vector to new memory, while your loop still holds a reference into the old memory. Rust stops it at compile time.",
         "broll": code("rust", "for line in &lines {\n    if line.contains(\"ERROR\") {\n        lines.push(line.clone());\n    }\n}")},
        {"speaker": "oggy", "text": "So in C, this would just crash at runtime instead?"},
        {"speaker": "jack", "text": "Or quietly read freed memory, which is worse. Rust turns that bug into a compiler error."},
        {"speaker": "oggy", "text": "Fine, but I still need the error lines. What's the clean way to collect them?",
         "pause": {"prompt": "You need the ERROR lines without changing the vector you're iterating over. What's the idiomatic fix?", "choices": ["Collect them into a new vector with filter", "Use unsafe", "Clone the vector on every iteration"], "answer": 0}},
        {"speaker": "jack", "text": "Build a new vector instead of growing the one you're reading. One iterator chain, and no fight with the borrow checker.",
         "broll": code("rust", "let errors: Vec<_> = lines\n    .iter()\n    .filter(|l| l.contains(\"ERROR\"))\n    .cloned()\n    .collect();")},
    ],
    q("Why does Rust reject pushing while iterating?", ["A push can reallocate the vector while the loop still references it", "Vectors are immutable", "Loops are always read-only"], 0,
      "Reallocation would leave the loop's reference pointing at freed memory.", [0, 1])),

"redis-rate-limiter": interface("prreview", "hinglish", "Rate limiter ka race fix",
    "For counters under concurrency, use an atomic operation like INCR instead of a separate read and write.",
    {"pr": {"title": "Make the rate limiter atomic", "repo": "arjun/payments-api", "author": {"name": "arjun", "icon": "user"},
            "reviewers": [{"speaker": "jhatka", "name": "senior-dev", "icon": "user"}, {"speaker": "paplu", "name": "sre", "icon": "shield"}],
            "files": [{"path": "src/middleware/rateLimit.ts", "language": "ts", "lines": [
                {"kind": "ctx", "code": "const key = `rl:${userId}`;"},
                {"kind": "del", "code": "const count = Number(await redis.get(key));"},
                {"kind": "del", "code": "await redis.set(key, count + 1, 'EX', 60);"},
                {"kind": "add", "code": "const count = await redis.incr(key);"},
                {"kind": "add", "code": "if (count === 1) await redis.expire(key, 60);"},
                {"kind": "ctx", "code": "if (count > 100) return res.status(429).end();"}]}],
            "verdict": "approve"}},
    [
        {"speaker": "jhatka", "text": "Purane code mein get aur set alag alag the. Do requests ek saath aayi, toh dono ne same count padha.", "pr": {"file": 0, "lines": [1, 2], "tone": "roast", "display": "get + set alag alag 💀 race condition"}},
        {"speaker": "jhatka", "text": "Matlab burst mein sau ki limit ke bawajood usse zyada requests nikal sakti thi.", "pr": {"file": 0, "lines": [5, 5], "tone": "question", "display": "100 ki limit, par burst mein zyada nikal gayi 😬"}},
        {"speaker": "paplu", "text": "Ab incr use ho raha hai. Socho, do requests ek saath incr karein, toh kya hoga?", "pr": {"file": 0, "lines": [3, 3], "tone": "question", "display": "ab INCR. do requests ek saath? 🤔"},
         "pause": {"prompt": "Two requests call INCR on the same key at the same moment. What do they get back?", "choices": ["1 and 2: Redis runs INCR atomically", "Both get 1", "An error"], "answer": 0}},
        {"speaker": "paplu", "text": "Ek ko ek milega, doosre ko do. Redis incr atomic hai, beech mein koi ghus nahi sakta.", "pr": {"file": 0, "lines": [3, 3], "tone": "praise", "display": "INCR atomic hai ✅ 1 aur 2, koi race nahi"}},
        {"speaker": "jhatka", "text": "Ek baat: agar incr ke baad aur expire se pehle server crash ho gaya, toh key kabhi expire nahi hogi. Isse ek Lua script mein daal do.", "pr": {"file": 0, "lines": [4, 4], "tone": "nit", "display": "nit: INCR ke baad crash → key bina TTL ke 👀 Lua script mein daalo"}},
        {"speaker": "jhatka", "text": "Approve, follow up ke saath. Counter ke kaam mein hamesha atomic operation use karo.", "pr": {"tone": "praise", "display": "LGTM 🚀 counters = atomic ops"}},
    ],
    q("Why could the old limiter let more than 100 requests through?", ["Two requests could read the same count before either wrote", "Redis drops writes", "The TTL was too long"], 0,
      "A separate GET and SET is not atomic, so concurrent requests overwrite each other's count.", [0, 1])),
}

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "validate"
    ids = sys.argv[2:] or list(EXAMPLES)
    br = Brainrotten(timeout=240)
    failed = 0
    for key in ids:
        req = dict(EXAMPLES[key], requestId=str(uuid.uuid4()))
        if mode == "validate":
            check = br.validate(req)
            ok = check.get("valid")
            failed += not ok
            print(f"{key:24} {'valid' if ok else 'INVALID'} ~{round(check.get('estimatedSeconds') or 0)}s {'' if ok else json.dumps(check.get('issues'))[:600]}")
            continue
        out = ROOT / "apps/web/public/examples" / key
        if (out / "video.mp4").exists():
            print(f"{key}: already generated, skipped"); continue
        try:
            summary = br.make_video(req, wait=True)
        except BrainrottenError as error:
            print(f"{key}: ERROR {error} {json.dumps(error.issues)[:400]}", flush=True); failed += 1; continue
        if summary.get("state") != "ready":
            print(f"{key}: {summary}", flush=True); failed += 1; continue
        out.mkdir(parents=True, exist_ok=True)
        job = br.status(summary["job_id"])
        br.download(job, str(out / "video.mp4"))
        (out / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=1))
        print(f"{key}: ready {summary.get('seconds', 0):.0f}s", flush=True)
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
