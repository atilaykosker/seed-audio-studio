#!/usr/bin/env python3
"""End-to-end test of the APP's pipeline (real guide.ts system prompt + same endpoints),
driven by an LLM plan instead of hand-written prompts. Mints voices, generates scenes,
stitches, ASR-checks. Output is compared against the hand-crafted Sherlock video audio.
"""
import json, subprocess, os, re, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = "/Users/egebese-fal/Projects/Work/seed-audio-studio"
OUT = f"{ROOT}/test-output"
os.makedirs(f"{OUT}/refs", exist_ok=True); os.makedirs(f"{OUT}/scenes", exist_ok=True)

def gm(args):
    r = subprocess.run(["genmedia", *args, "--json"], capture_output=True, text=True)
    try: return json.loads(r.stdout.strip())
    except:
        i = r.stdout.rfind("\n{")
        return json.loads(r.stdout[i:]) if i != -1 else {"error": (r.stderr or r.stdout)[:200]}
def up(p): return gm(["upload", p]).get("cdn_url")
def dur(p):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p],capture_output=True,text=True)
    try: return float(r.stdout.strip())
    except: return 0.0

# --- 1) pull the APP's real system prompt from guide.ts ---
guide_src = open(f"{ROOT}/src/services/studio/guide.ts").read()
def extract(const):
    m = re.search(const + r"\s*=\s*`(.*?)`", guide_src, re.S)
    if not m: sys.exit(f"could not extract {const}")
    return m.group(1)
GUIDE = extract("SEED_AUDIO_GUIDE")
DIRECTIVE = extract("OUTPUT_DIRECTIVE")
SYSTEM = GUIDE + DIRECTIVE

# --- 2) brief (Sherlock-equivalent), built like the app's buildPlanPrompt ---
BRIEF = {
 "idea": "A tense Victorian detective radio drama. At dawn, a terrified veiled young woman begs a brilliant, calm detective for help; his warm narrator friend frames the scene. Then her huge, menacing guardian bursts in, threatens the detective, and bends an iron poker in his bare hands before storming out.",
 "durationSec": 90, "language": "English", "speakers": "Choose a sensible number of distinct speakers.",
 "genre": "Victorian mystery radio drama, cinematic",
}
PLAN_PROMPT = (
 f"Brief: {BRIEF['idea']}\n"
 f"Target total length: about {BRIEF['durationSec']} seconds.\n"
 f"Language: {BRIEF['language']}.\n{BRIEF['speakers']}\n"
 f"Genre/style hint: {BRIEF['genre']}.\n"
 "Plan the characters and the scene(s) needed to realize this, following all the rules. "
 "Categorize it and weave in fitting SFX/atmosphere/music."
)

def extract_json(t):
    t = t.strip()
    f = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
    if f: t = f.group(1).strip()
    return t[t.index("{"): t.rindex("}")+1]

print(">> PLAN (openrouter/router, app system prompt)", flush=True)
d = gm(["run","openrouter/router","--model","anthropic/claude-sonnet-4.5",
        "--system_prompt",SYSTEM,"--prompt",PLAN_PROMPT,"--temperature","0.7","--max_tokens","3500"])
out = (d.get("result",{}) or {}).get("output","")
if not out: sys.exit("LLM no output: "+json.dumps(d)[:300])
plan = json.loads(extract_json(out))
json.dump(plan, open(f"{OUT}/plan.json","w"), indent=1, ensure_ascii=False)
print("   category:", plan.get("category"))
print("   characters:", [c["name"] for c in plan["characters"]])
print("   scenes:", [(s["kind"], s["title"], s.get("speakers")) for s in plan["scenes"]])

# --- 3) mint reference voices (T2A) -> ffmpeg trim 28s -> upload ---
print(">> MINT voices", flush=True)
def mint(c):
    name=c["name"]; raw=f"{OUT}/refs/{re.sub(r'[^a-zA-Z0-9]','_',name)}.mp3"
    if os.path.exists(raw): os.remove(raw)
    r=gm(["run","bytedance/seed-audio-1.0","--prompt",c["refPrompt"],"--sample_rate","44100","--download",raw])
    if r.get("status")!="completed" or not os.path.exists(raw): return name,None,r.get("error")
    t=raw.replace(".mp3","_t.mp3")
    subprocess.run(["ffmpeg","-y","-i",raw,"-t","28","-c:a","libmp3lame","-q:a","2",t],capture_output=True)
    return name, up(t), None
url={}
with ThreadPoolExecutor(max_workers=4) as ex:
    for name,u,err in ex.map(mint, plan["characters"]):
        print(f"   {name}: {'ok' if u else 'FAIL '+str(err)}", flush=True)
        if u: url[name]=u

# --- 4) generate scenes (T2A / TA2A) ---
print(">> GENERATE scenes", flush=True)
scene_files=[]
def gen(s):
    sid=re.sub(r'[^a-zA-Z0-9]','_',s["title"])[:30]
    p=f"{OUT}/scenes/{sid}.wav"
    if os.path.exists(p): os.remove(p)
    args=["run","bytedance/seed-audio-1.0","--prompt",s["prompt"],"--sample_rate","44100","--output_format","wav","--download",p]
    if s["kind"]=="TA2A":
        urls=[url[n] for n in s.get("speakers",[]) if n in url][:3]
        if urls: args+=["--audio_urls",json.dumps(urls)]
    r=gm(args)
    return p,(r.get("result",{}).get("audio",{}) or {}).get("duration"),r.get("error")
for s in plan["scenes"]:
    p,dr,err=gen(s)
    ok=os.path.exists(p)
    print(f"   {s['title']}: {('ok '+str(round(dr or 0))+'s') if ok else 'FAIL '+str(err)}", flush=True)
    if ok: scene_files.append(p)

# --- 5) stitch + ASR check ---
if scene_files:
    lst=f"{OUT}/list.txt"; open(lst,"w").write("".join(f"file '{p}'\n" for p in scene_files))
    final=f"{OUT}/app_output.mp3"
    subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i",lst,"-c:a","libmp3lame","-q:a","2",final],capture_output=True)
    print(">> FINAL:", final, round(dur(final),1),"s", flush=True)
    # ASR first scene for English/multi-voice sanity
    u=up(scene_files[0])
    a=gm(["run","fal-ai/elevenlabs/speech-to-text/scribe-v2","--audio_url",u])
    txt=(a.get("result",{}) or {}).get("text","")
    print(">> ASR scene1:", txt[:200], flush=True)
print("APPTESTDONE", flush=True)
